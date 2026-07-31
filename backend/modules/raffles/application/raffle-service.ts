import { createServiceClient } from '@backend/platform/supabase/server';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import {
  RAFFLE_RUNTIME_KEY_PREFIX,
  buildWinnerQueue,
  canStartCountdown,
  clampSpinCount,
  getImmediateLaunchAt,
  getCountdownStartsAt,
  getRaffleHistoryCutoffIso,
  getRaffleRuntimeKey,
  isReadyForSpin,
  normalizePrizePlan,
  normalizePrizePlans,
  normalizeParticipants,
  parseRaffleRuntimeSetting,
  type RaffleFormState,
  type RaffleParticipant,
  type RafflePrizeAssignment,
  type RaffleRuntimeState,
} from '@backend/modules/raffles/domain/runtime';

type ServiceSupabaseClient = Awaited<ReturnType<typeof createServiceClient>>;

interface UserMatchCandidate {
  id: string;
  name: string | null;
  email: string | null;
  employee_id: string | null;
  slack_id: string | null;
}

function normalizeLookupValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function escapePostgrestValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toPostgrestInList(values: string[]) {
  return `(${values.map(escapePostgrestValue).join(',')})`;
}

function buildSpinToken(raffleId: string, spinIndex: number, participantId: string | null) {
  return `${raffleId}:${spinIndex + 1}:${participantId ?? 'unknown'}`;
}

export async function assertModeratorAccess(supabase: ServiceSupabaseClient, userId: string) {
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!profile || !isModeratorRole(profile.role)) {
    throw new Error('You do not have permission to manage raffles.');
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function matchParticipantsToUsers(
  supabase: ServiceSupabaseClient,
  participants: RaffleParticipant[],
) {
  const normalized = normalizeParticipants(participants);
  const sourceIds = Array.from(
    new Set(
      normalized
        .map((p) => normalizeLookupValue(p.sourceId))
        .filter(Boolean),
    ),
  );
  const names = Array.from(
    new Set(
      normalized
        .map((p) => normalizeLookupValue(p.name))
        .filter(Boolean),
    ),
  );
  const userIds = Array.from(
    new Set(
      normalized
        .map((p) => normalizeLookupValue(p.userId))
        .filter(Boolean),
    ),
  );

  // Avoid selecting the entire users table; query only likely matches.
  // If the participant list is huge, fall back to the old behavior to avoid overly long PostgREST filters.
  const maxLookupValues = 500;

  let users: UserMatchCandidate[] | null = null;
  if (sourceIds.length + names.length + userIds.length <= maxLookupValues) {
    const orParts: string[] = [];

    const validUserIds = userIds.filter(isUuid);
    if (validUserIds.length > 0) {
      orParts.push(`id.in.${toPostgrestInList(validUserIds)}`);
    }

    if (sourceIds.length > 0) {
      const list = toPostgrestInList(sourceIds);
      orParts.push(`employee_id.in.${list}`);
      orParts.push(`slack_id.in.${list}`);
      orParts.push(`email.in.${list}`);

      const validSourceIds = sourceIds.filter(isUuid);
      if (validSourceIds.length > 0) {
        orParts.push(`id.in.${toPostgrestInList(validSourceIds)}`);
      }
    }
    if (names.length > 0) orParts.push(`name.in.${toPostgrestInList(names)}`);

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, employee_id, slack_id')
      .or(orParts.join(','));

    if (error) {
      throw new Error(error.message);
    }

    users = (data ?? []) as UserMatchCandidate[];
  } else {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, employee_id, slack_id');

    if (error) {
      throw new Error(error.message);
    }

    users = (data ?? []) as UserMatchCandidate[];
  }

  const candidates = users ?? [];
  const byId = new Map<string, UserMatchCandidate>();
  const bySlackId = new Map<string, UserMatchCandidate>();
  const byEmployeeId = new Map<string, UserMatchCandidate>();
  const byName = new Map<string, UserMatchCandidate>();
  const byEmail = new Map<string, UserMatchCandidate>();

  for (const user of candidates) {
    byId.set(user.id, user);

    const slackId = normalizeLookupValue(user.slack_id);
    if (slackId) {
      bySlackId.set(slackId, user);
    }

    const employeeId = normalizeLookupValue(user.employee_id);
    if (employeeId) {
      byEmployeeId.set(employeeId, user);
    }

    const fullName = normalizeLookupValue(user.name);
    if (fullName) {
      byName.set(fullName, user);
    }

    const email = normalizeLookupValue(user.email);
    if (email) {
      byEmail.set(email, user);
    }
  }

  return normalized.map((participant) => {
    if (participant.userId) {
      return participant;
    }

    const sourceId = normalizeLookupValue(participant.sourceId);
    const participantName = normalizeLookupValue(participant.name);

    const matchedUser =
      (sourceId ? byId.get(sourceId) : undefined) ??
      (sourceId ? byEmployeeId.get(sourceId) : undefined) ??
      (sourceId ? bySlackId.get(sourceId) : undefined) ??
      (sourceId ? byEmail.get(sourceId) : undefined) ??
      (participantName ? byName.get(participantName) : undefined);

    return {
      ...participant,
      userId: matchedUser?.id ?? null,
    };
  });
}

export async function sendGlobalRaffleNotifications(
  supabase: ServiceSupabaseClient,
  {
    title,
    message,
  }: {
    title: string;
    message: string;
  },
) {
  // Prefer server-side broadcast RPC if available (much faster/safer for large user counts).
  try {
    const { error } = await supabase.rpc('notify_users_by_role', {
      n_title: title,
      n_message: message,
      n_type: 'system',
      roles: ['employee', 'staff', 'moderator', 'moderator_a1', 'moderator_b1', 'admin'],
    });
    if (!error) return;
  } catch {
    // ignore and fall back
  }

  const { data: users, error } = await supabase.from('users').select('id').limit(50_000);
  if (error) throw new Error(error.message);
  if (!users || users.length === 0) return;

  const rows = users.map((user) => ({ user_id: user.id, title, message, type: 'system' }));
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error: insertError } = await supabase.from('notifications').insert(chunk);
    if (insertError) throw new Error(insertError.message);
  }
}

export async function sendWinnerNotifications(
  supabase: ServiceSupabaseClient,
  runtime: RaffleRuntimeState,
  winnerIds: string[],
) {
  const uniqueWinnerIds = [...new Set(winnerIds.filter(Boolean))];
  if (uniqueWinnerIds.length === 0) {
    return;
  }

  const rows = runtime.winners
    .filter((winner) => winner.userId && uniqueWinnerIds.includes(winner.userId))
    .map((winner) => ({
      user_id: winner.userId!,
      title: 'You won a raffle!',
      message: `${winner.name} won "${runtime.title}".`,
      type: 'system',
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadRaffleRuntime(
  supabase: ServiceSupabaseClient,
  raffleId: string,
) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('key', getRaffleRuntimeKey(raffleId))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return parseRaffleRuntimeSetting(data);
}

export async function loadRaffleRuntimes(
  supabase: ServiceSupabaseClient,
  raffleIds: string[],
) {
  if (raffleIds.length === 0) {
    return new Map<string, RaffleRuntimeState>();
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in(
      'key',
      raffleIds.map((raffleId) => getRaffleRuntimeKey(raffleId)),
    );

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    (data ?? [])
      .map((setting) => parseRaffleRuntimeSetting(setting))
      .filter((runtime): runtime is NonNullable<typeof runtime> => runtime !== null)
      .map((runtime) => [runtime.raffleId, runtime]),
  );
}

export async function persistRaffleRuntime(
  supabase: ServiceSupabaseClient,
  runtime: RaffleRuntimeState,
) {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: getRaffleRuntimeKey(runtime.raffleId),
      value: runtime,
    },
    { onConflict: 'key' },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export function buildRaffleDescription(runtime: RaffleRuntimeState) {
  if (runtime.winners.length === 0) {
    return runtime.description || null;
  }

  if (runtime.winners.length === 1) {
    return `Winner: ${runtime.winners[0]?.name ?? 'Unknown'}`;
  }

  const names = runtime.winners.map((winner) => winner.name).join(', ');
  return `Winners: ${names}`;
}

function getRaffleStatusFromRuntime(
  runtime: RaffleRuntimeState | null,
  fallbackStatus: 'upcoming' | 'live' | 'completed',
) {
  if (!runtime) {
    return fallbackStatus;
  }

  if (runtime.phase === 'completed') {
    return 'completed' as const;
  }

  return runtime.phase === 'scheduled' ? ('upcoming' as const) : ('live' as const);
}

export function finalizeCompletedRuntime(runtime: RaffleRuntimeState) {
  return {
    ...runtime,
    phase: 'completed' as const,
    activeWinnerId: null,
    currentSpinToken: null,
    revealEndsAt: null,
    intermissionEndsAt: null,
    completedAt: runtime.completedAt ?? new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function prepareRuntimeForCreate(
  formState: RaffleFormState,
  raffleId: string,
): RaffleRuntimeState {
  const publishedAt = new Date().toISOString();
  const participants = normalizeParticipants(formState.participants);
  const prizePlan = normalizePrizePlan(formState.prizePlan);
  const prizePlans = normalizePrizePlans(formState.prizePlans?.length ? formState.prizePlans : (prizePlan ? [prizePlan] : []));
  const scheduledFor =
    formState.mode === 'scheduled'
      ? (() => {
          if (!formState.scheduledDate || !formState.scheduledTime) {
            return null;
          }

          const combined = new Date(`${formState.scheduledDate}T${formState.scheduledTime}:00`);
          return Number.isNaN(combined.getTime()) ? null : combined.toISOString();
        })()
      : getImmediateLaunchAt(formState.countdownOption, publishedAt);
  const countdownStartsAt = getCountdownStartsAt({
    scheduledFor,
    publishedAt,
    countdownOption: formState.countdownOption,
  });
  const removeWinnerAfterSpin = formState.removeWinnerAfterSpin;
  const spinCount = clampSpinCount(
    participants.length,
    formState.spinCount,
    removeWinnerAfterSpin,
  );
  const winnerQueue = buildWinnerQueue(participants, spinCount, removeWinnerAfterSpin);

  const shouldStartCountdown = Boolean(
    countdownStartsAt && canStartCountdown(
      {
        raffleId,
        title: formState.title.trim(),
        description: formState.description.trim(),
        mode: formState.mode,
        phase: 'scheduled',
        scheduledFor,
        countdownOption: formState.countdownOption,
        countdownEnabled: formState.countdownOption !== 'disabled',
        countdownStartsAt,
        removeWinnerAfterSpin,
        spinCount,
        prizePlan,
        prizePlans,
        participants,
        visibleParticipantIds: participants.map((participant) => participant.id),
        winnerQueue,
        winners: [],
        prizeAssignments: [],
        activeWinnerId: null,
        currentSpinIndex: 0,
        currentSpinToken: null,
        publishedAt,
        launchNotifiedAt: null,
        scheduleNotifiedAt: null,
        oneMinuteNotifiedAt: null,
        revealEndsAt: null,
        intermissionEndsAt: null,
        completedAt: null,
        videoProofUrl: null,
        videoProofPath: null,
        lastUpdatedAt: publishedAt,
      },
      Date.now(),
    ),
  );

  const phase =
    formState.mode === 'scheduled'
      ? shouldStartCountdown
        ? 'countdown'
        : 'scheduled'
      : formState.countdownOption === 'disabled'
        ? 'ready'
        : 'countdown';

  return {
    raffleId,
    title: formState.title.trim(),
    description: formState.description.trim(),
    mode: formState.mode,
    phase,
    scheduledFor,
    countdownOption: formState.countdownOption,
    countdownEnabled: formState.countdownOption !== 'disabled',
    countdownStartsAt,
    removeWinnerAfterSpin,
    spinCount,
    prizePlan,
    prizePlans,
    participants,
    visibleParticipantIds: participants.map((participant) => participant.id),
    winnerQueue,
    winners: [],
    prizeAssignments: [],
    activeWinnerId: null,
    currentSpinIndex: 0,
    currentSpinToken: null,
    publishedAt,
    launchNotifiedAt: null,
    scheduleNotifiedAt: null,
    oneMinuteNotifiedAt: null,
    revealEndsAt: null,
    intermissionEndsAt: null,
    completedAt: null,
    videoProofUrl: null,
    videoProofPath: null,
    lastUpdatedAt: publishedAt,
  } satisfies RaffleRuntimeState;
}

export async function syncRaffleLifecycle(
  supabase: ServiceSupabaseClient,
  raffle: {
    id: string;
    title: string;
    status: 'upcoming' | 'live' | 'completed';
    draw_date: string | null;
  },
  runtime: RaffleRuntimeState | null,
) {
  if (!runtime || raffle.status === 'completed') {
    return runtime;
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  let nextRuntime = { ...runtime, lastUpdatedAt: nowIso };
  let nextStatus: 'upcoming' | 'live' | 'completed' = raffle.status;
  let shouldPersistRuntime = false;

  const launchAtMs = nextRuntime.scheduledFor ? new Date(nextRuntime.scheduledFor).getTime() : now;
  const oneMinuteThresholdMs = launchAtMs - 60_000;

  if (
    nextRuntime.mode === 'scheduled' &&
    nextStatus === 'upcoming' &&
    nextRuntime.countdownEnabled &&
    canStartCountdown(nextRuntime, now)
  ) {
    nextRuntime = {
      ...nextRuntime,
      phase: 'countdown',
      lastUpdatedAt: nowIso,
    };
    nextStatus = 'live';
    shouldPersistRuntime = true;
  }

  if (
    nextRuntime.oneMinuteNotifiedAt === null &&
    nextRuntime.scheduledFor &&
    now >= oneMinuteThresholdMs &&
    now < launchAtMs
  ) {
    await sendGlobalRaffleNotifications(supabase, {
      title: 'Raffle starts in less than a minute',
      message: `"${raffle.title}" is almost ready. Keep the page open for the live spin.`,
    });
    nextRuntime = {
      ...nextRuntime,
      oneMinuteNotifiedAt: nowIso,
      lastUpdatedAt: nowIso,
    };
    shouldPersistRuntime = true;
  }

  if (
    nextStatus === 'upcoming' &&
    (isReadyForSpin(nextRuntime, now) || (!nextRuntime.countdownEnabled && nextRuntime.mode === 'immediate'))
  ) {
    nextStatus = 'live';
    nextRuntime = {
      ...nextRuntime,
      phase: nextRuntime.phase === 'scheduled' ? 'ready' : nextRuntime.phase,
      lastUpdatedAt: nowIso,
    };
    shouldPersistRuntime = true;
  }

  if (nextStatus === 'live' && nextRuntime.launchNotifiedAt === null) {
    await sendGlobalRaffleNotifications(supabase, {
      title: 'A raffle is now live',
      message: `"${raffle.title}" is live now. Open the raffle page to watch the wheel spin.`,
    });
    nextRuntime = {
      ...nextRuntime,
      launchNotifiedAt: nowIso,
      lastUpdatedAt: nowIso,
    };
    shouldPersistRuntime = true;
  }

  if (nextStatus === 'live' && nextRuntime.phase === 'countdown' && isReadyForSpin(nextRuntime, now)) {
    nextRuntime = {
      ...nextRuntime,
      phase: 'ready',
      lastUpdatedAt: nowIso,
    };
    shouldPersistRuntime = true;
  }

  if (
    nextStatus === 'live' &&
    nextRuntime.phase === 'ready' &&
    nextRuntime.currentSpinIndex < nextRuntime.winnerQueue.length
  ) {
    const activeWinnerId = nextRuntime.winnerQueue[nextRuntime.currentSpinIndex] ?? null;
    nextRuntime = {
      ...nextRuntime,
      phase: 'spinning',
      activeWinnerId,
      currentSpinToken: buildSpinToken(
        raffle.id,
        nextRuntime.currentSpinIndex,
        activeWinnerId,
      ),
      lastUpdatedAt: nowIso,
    };
    shouldPersistRuntime = true;
  }

  if (
    nextStatus === 'live' &&
    nextRuntime.phase === 'winner_reveal' &&
    nextRuntime.revealEndsAt &&
    new Date(nextRuntime.revealEndsAt).getTime() <= now
  ) {
    if (nextRuntime.currentSpinIndex >= nextRuntime.winnerQueue.length) {
      nextRuntime = finalizeCompletedRuntime(nextRuntime);
      nextStatus = 'completed';
    } else {
      const participantCount = nextRuntime.participants.length;
      const intermissionMs = participantCount > 80 ? 800 : participantCount > 40 ? 1200 : participantCount > 20 ? 1800 : 3000;
      nextRuntime = {
        ...nextRuntime,
        phase: 'intermission',
        revealEndsAt: null,
        intermissionEndsAt: new Date(now + intermissionMs).toISOString(),
        lastUpdatedAt: nowIso,
      };
    }
    shouldPersistRuntime = true;
  }

  if (
    nextStatus === 'live' &&
    nextRuntime.phase === 'intermission' &&
    nextRuntime.intermissionEndsAt &&
    new Date(nextRuntime.intermissionEndsAt).getTime() <= now
  ) {
    const activeWinnerId = nextRuntime.winnerQueue[nextRuntime.currentSpinIndex] ?? null;
    nextRuntime = {
      ...nextRuntime,
      phase: 'spinning',
      activeWinnerId,
      currentSpinToken: buildSpinToken(
        raffle.id,
        nextRuntime.currentSpinIndex,
        activeWinnerId,
      ),
      intermissionEndsAt: null,
      lastUpdatedAt: nowIso,
    };
    shouldPersistRuntime = true;
  }

  if (nextStatus !== raffle.status) {
    const updatePayload =
      nextStatus === 'completed'
        ? {
            status: nextStatus,
            winner_id: nextRuntime.winners[0]?.userId ?? null,
            description: buildRaffleDescription(nextRuntime),
          }
        : {
            status: nextStatus,
          };

    const { error } = await supabase.from('raffles').update(updatePayload).eq('id', raffle.id);
    if (error) {
      throw new Error(error.message);
    }
  }

  if (shouldPersistRuntime) {
    await persistRaffleRuntime(supabase, nextRuntime);
  }

  return nextRuntime;
}

export async function loadActiveRafflesWithRuntime(supabase: ServiceSupabaseClient) {
  const { data: raffles, error } = await supabase
    .from('raffles')
    .select('id, title, status, draw_date')
    .in('status', ['upcoming', 'live'])
    .order('draw_date', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const runtimeMap = await loadRaffleRuntimes(
    supabase,
    (raffles ?? []).map((raffle) => raffle.id),
  );

  return (raffles ?? []).map((raffle) => ({
    raffle,
    runtime: runtimeMap.get(raffle.id) ?? null,
  }));
}

export async function loadAllRaffleRuntimeSettings(supabase: ServiceSupabaseClient) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .like('key', `${RAFFLE_RUNTIME_KEY_PREFIX}%`);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((setting) => parseRaffleRuntimeSetting(setting))
    .filter((runtime): runtime is NonNullable<typeof runtime> => runtime !== null);
}

export function upsertPrizeAssignment(
  runtime: RaffleRuntimeState,
  assignment: RafflePrizeAssignment,
) {
  const nextAssignments = runtime.prizeAssignments.filter(
    (currentAssignment) => currentAssignment.winnerParticipantId !== assignment.winnerParticipantId,
  );

  nextAssignments.push(assignment);

  return {
    ...runtime,
    prizeAssignments: nextAssignments.sort((left, right) =>
      left.winnerName.localeCompare(right.winnerName),
    ),
    lastUpdatedAt: new Date().toISOString(),
  };
}

export async function pruneExpiredRaffles(supabase: ServiceSupabaseClient) {
  const cutoffIso = getRaffleHistoryCutoffIso();

  const { data: oldRaffles, error: loadError } = await supabase
    .from('raffles')
    .select('id')
    .eq('status', 'completed')
    .lt('created_at', cutoffIso);

  if (loadError) {
    throw new Error(loadError.message);
  }

  const expiredIds = (oldRaffles ?? []).map((raffle) => raffle.id);
  if (expiredIds.length === 0) {
    return 0;
  }

  const { error: deleteEntriesError } = await supabase
    .from('raffle_entries')
    .delete()
    .in('raffle_id', expiredIds);

  if (deleteEntriesError) {
    throw new Error(deleteEntriesError.message);
  }

  const { error: deleteRafflesError } = await supabase
    .from('raffles')
    .delete()
    .in('id', expiredIds);

  if (deleteRafflesError) {
    throw new Error(deleteRafflesError.message);
  }

  const runtimeKeys = expiredIds.map((raffleId) => getRaffleRuntimeKey(raffleId));
  const { error: deleteRuntimeError } = await supabase
    .from('app_settings')
    .delete()
    .in('key', runtimeKeys);

  if (deleteRuntimeError) {
    throw new Error(deleteRuntimeError.message);
  }

  return expiredIds.length;
}

export async function loadRaffleFeed(supabase: ServiceSupabaseClient) {
  const cutoffIso = getRaffleHistoryCutoffIso();

  const selectCols = 'id, title, description, prize_image, draw_date, status, winner_id, created_by, created_at';
  const [
    { data: activeRaffles, error: activeError },
    { data: recentCompleted, error: completedError },
  ] = await Promise.all([
    supabase
      .from('raffles')
      .select(selectCols)
      .in('status', ['upcoming', 'live'])
      .order('draw_date', { ascending: true })
      .limit(25),
    supabase
      .from('raffles')
      .select(selectCols)
      .eq('status', 'completed')
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(35),
  ]);

  if (activeError) throw new Error(activeError.message);
  if (completedError) throw new Error(completedError.message);

  const raffles = [...(activeRaffles ?? []), ...(recentCompleted ?? [])];

  const runtimeMap = await loadRaffleRuntimes(
    supabase,
    (raffles ?? []).map((raffle) => raffle.id),
  );

  const mergedFeed = [];

  for (const raffle of raffles ?? []) {
    const currentRuntime = runtimeMap.get(raffle.id) ?? null;
    const runtime = currentRuntime;
    const raffleStatus = getRaffleStatusFromRuntime(runtime, raffle.status);
    const participantCount = runtime?.participants.length ?? 0;

    if (raffleStatus !== 'completed' && participantCount === 0) {
      continue;
    }

    mergedFeed.push({
      raffle: {
        ...raffle,
        status: raffleStatus,
        draw_date: runtime?.scheduledFor ?? raffle.draw_date,
      },
      runtime,
    });
  }

  return mergedFeed;
}
