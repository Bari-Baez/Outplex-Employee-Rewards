import type { AppSetting, Raffle } from '@shared/contracts/database';

export const RAFFLE_RUNTIME_KEY_PREFIX = 'raffle_runtime:';
export const RAFFLE_VIDEO_BUCKET = 'raffle-videos';
export const RAFFLE_DRAFTS_STORAGE_KEY = 'outplex:raffle-drafts:v1';
export const MAX_SAVED_RAFFLE_DRAFTS = 5;
export const WINNER_REVEAL_MS = 5_000;
export const INTERMISSION_MS = 3_000;
export const WHEEL_SPIN_MS = 6_000;
export const MAX_RAFFLE_SPINS = 20;
export const RAFFLE_HISTORY_RETENTION_DAYS = 60;

export type RaffleMode = 'immediate' | 'scheduled';
export type RafflePhase =
  | 'scheduled'
  | 'countdown'
  | 'ready'
  | 'spinning'
  | 'winner_reveal'
  | 'intermission'
  | 'completed';
export type RaffleCountdownOption =
  | 'disabled'
  | 'until_draw'
  | '3600'
  | '2700'
  | '1800'
  | '1200'
  | '900'
  | '300'
  | '120'
  | '60'
  | '30';

export interface RaffleParticipant {
  id: string;
  name: string;
  sourceId?: string | null;
  userId?: string | null;
}

export interface RaffleWinnerRecord {
  participantId: string;
  name: string;
  userId?: string | null;
  selectedAt: string;
  spinIndex: number;
}

export interface BundleItem {
  id: string;
  name: string;
  quantity: number;
  imageUrl?: string | null;
  storeItemId?: string | null;
  unitPoints?: number | null;
}

export interface RafflePrizeAssignment {
  winnerParticipantId: string;
  winnerName: string;
  prizeTitle: string;
  prizeSlotId?: string | null;
  storeItemId?: string | null;
  quantity?: number | null;
  imageUrl?: string | null;
  unitPoints?: number | null;
  notes?: string | null;
  assignedAt: string | null;
}

export interface RafflePrizePlan {
  id?: string;
  type?: 'individual' | 'bundle';
  source: 'manual' | 'store_item';
  title: string;
  quantity: number;
  imageUrl?: string | null;
  storeItemId?: string | null;
  stockSnapshot?: number | null;
  unitPoints?: number | null;
  category?: string | null;
  bundleItems?: BundleItem[] | null;
  splitAcrossWinners?: boolean | null;
}

export interface RaffleFormState {
  mode: RaffleMode;
  title: string;
  description: string;
  scheduledDate: string;
  scheduledTime: string;
  countdownOption: RaffleCountdownOption;
  removeWinnerAfterSpin: boolean;
  spinCount: number;
  prizePlan: RafflePrizePlan | null;
  prizePlans: RafflePrizePlan[];
  participants: RaffleParticipant[];
}

export interface SavedRaffleDraft {
  id: string;
  title: string;
  updatedAt: string;
  data: RaffleFormState;
}

export interface RaffleRuntimeState {
  raffleId: string;
  title: string;
  description: string;
  mode: RaffleMode;
  phase: RafflePhase;
  scheduledFor: string | null;
  countdownOption: RaffleCountdownOption;
  countdownEnabled: boolean;
  countdownStartsAt: string | null;
  removeWinnerAfterSpin: boolean;
  spinCount: number;
  prizePlan: RafflePrizePlan | null;
  prizePlans: RafflePrizePlan[];
  participants: RaffleParticipant[];
  visibleParticipantIds: string[];
  winnerQueue: string[];
  winners: RaffleWinnerRecord[];
  prizeAssignments: RafflePrizeAssignment[];
  activeWinnerId: string | null;
  currentSpinIndex: number;
  currentSpinToken: string | null;
  publishedAt: string;
  launchNotifiedAt: string | null;
  scheduleNotifiedAt: string | null;
  oneMinuteNotifiedAt: string | null;
  revealEndsAt: string | null;
  intermissionEndsAt: string | null;
  completedAt: string | null;
  videoProofUrl: string | null;
  videoProofPath: string | null;
  lastUpdatedAt: string;
}

export interface RaffleViewModel {
  raffle: Raffle;
  runtime: RaffleRuntimeState | null;
  participants: RaffleParticipant[];
  visibleParticipants: RaffleParticipant[];
  activeWinner: RaffleParticipant | null;
  latestWinner: RaffleWinnerRecord | null;
}

export const RAFFLE_COUNTDOWN_OPTIONS: Array<{
  value: RaffleCountdownOption;
  label: string;
  description: string;
}> = [
  {
    value: 'disabled',
    label: 'Disabled',
    description: 'The wheel starts spinning as soon as the raffle goes live.',
  },
  {
    value: 'until_draw',
    label: 'Until launch time',
    description: 'The countdown starts as soon as the raffle is published.',
  },
  {
    value: '3600',
    label: '1 hour',
    description: 'Countdown begins 1 hour before the scheduled launch.',
  },
  {
    value: '2700',
    label: '45 minutes',
    description: 'Countdown begins 45 minutes before launch.',
  },
  {
    value: '1800',
    label: '30 minutes',
    description: 'Countdown begins 30 minutes before launch.',
  },
  {
    value: '1200',
    label: '20 minutes',
    description: 'Countdown begins 20 minutes before launch.',
  },
  {
    value: '900',
    label: '15 minutes',
    description: 'Countdown begins 15 minutes before launch.',
  },
  {
    value: '300',
    label: '5 minutes',
    description: 'Countdown begins 5 minutes before launch.',
  },
  {
    value: '120',
    label: '2 minutes',
    description: 'Countdown begins 2 minutes before launch.',
  },
  {
    value: '60',
    label: '1 minute',
    description: 'Countdown begins 1 minute before launch.',
  },
  {
    value: '30',
    label: '30 seconds',
    description: 'Countdown begins 30 seconds before launch.',
  },
];

export function createEmptyRaffleFormState(): RaffleFormState {
  return {
    mode: 'immediate',
    title: '',
    description: '',
    scheduledDate: '',
    scheduledTime: '',
    countdownOption: 'disabled',
    removeWinnerAfterSpin: true,
    spinCount: 1,
    prizePlan: null,
    prizePlans: [],
    participants: [],
  };
}

export function getRaffleRuntimeKey(raffleId: string) {
  return `${RAFFLE_RUNTIME_KEY_PREFIX}${raffleId}`;
}

export function getRaffleVideoStoragePath(raffleId: string, spinToken: string) {
  return `${raffleId}/${spinToken}.webm`;
}

export function getRaffleVideoDownloadUrl(raffleId: string) {
  return `/api/raffles/${raffleId}/video`;
}

export function clampSpinCount(participantCount: number, spinCount: number, removeWinnerAfterSpin: boolean) {
  const requested = Number.isFinite(spinCount) ? Math.trunc(spinCount) : 1;
  const maxAllowed = removeWinnerAfterSpin
    ? Math.max(1, Math.min(participantCount, MAX_RAFFLE_SPINS))
    : MAX_RAFFLE_SPINS;

  return Math.max(1, Math.min(requested, maxAllowed));
}

export function normalizeParticipants(participants: RaffleParticipant[]) {
  return participants
    .map((participant) => ({
      ...participant,
      id: participant.id || crypto.randomUUID(),
      name: participant.name.trim(),
      sourceId: participant.sourceId?.trim() || null,
      userId: participant.userId?.trim() || null,
    }))
    .filter((participant) => participant.name.length > 0);
}

export function normalizePrizePlan(plan: RafflePrizePlan | null | undefined): RafflePrizePlan | null {
  if (!plan || !plan.title?.trim()) {
    return null;
  }

  return {
    id: plan.id?.trim() || undefined,
    type: plan.type === 'bundle' ? 'bundle' : 'individual',
    source: plan.source === 'store_item' ? 'store_item' : 'manual',
    title: plan.title.trim(),
    quantity: Math.max(1, Number.isFinite(plan.quantity) ? Math.trunc(plan.quantity) : 1),
    imageUrl: plan.imageUrl?.trim() || null,
    storeItemId: plan.storeItemId?.trim() || null,
    stockSnapshot:
      typeof plan.stockSnapshot === 'number' && Number.isFinite(plan.stockSnapshot)
        ? Math.max(0, Math.trunc(plan.stockSnapshot))
        : null,
    unitPoints:
      typeof plan.unitPoints === 'number' && Number.isFinite(plan.unitPoints)
        ? Math.max(0, Math.trunc(plan.unitPoints))
        : null,
    category: plan.category?.trim() || null,
    bundleItems: Array.isArray(plan.bundleItems) ? plan.bundleItems : null,
    splitAcrossWinners: plan.splitAcrossWinners === true,
  } satisfies RafflePrizePlan;
}

export function normalizePrizePlans(plans: RafflePrizePlan[] | null | undefined): RafflePrizePlan[] {
  if (!Array.isArray(plans)) return [];
  return plans.map(normalizePrizePlan).filter((p): p is RafflePrizePlan => p !== null);
}

export function buildWinnerQueue(
  participants: RaffleParticipant[],
  spinCount: number,
  removeWinnerAfterSpin: boolean,
) {
  const normalizedParticipants = normalizeParticipants(participants);
  const safeSpinCount = clampSpinCount(
    normalizedParticipants.length,
    spinCount,
    removeWinnerAfterSpin,
  );

  if (normalizedParticipants.length === 0) {
    return [];
  }

  const queue: string[] = [];
  const remaining = [...normalizedParticipants];

  for (let index = 0; index < safeSpinCount; index += 1) {
    const sourcePool = removeWinnerAfterSpin ? remaining : normalizedParticipants;
    if (sourcePool.length === 0) {
      break;
    }

    const winnerIndex = Math.floor(Math.random() * sourcePool.length);
    const winner = sourcePool[winnerIndex];
    queue.push(winner.id);

    if (removeWinnerAfterSpin) {
      remaining.splice(winnerIndex, 1);
    }
  }

  return queue;
}

export function getCountdownLeadMs(option: RaffleCountdownOption) {
  if (option === 'disabled' || option === 'until_draw') {
    return 0;
  }

  const asSeconds = Number.parseInt(option, 10);
  return Number.isFinite(asSeconds) ? asSeconds * 1_000 : 0;
}

export function getImmediateLaunchAt(countdownOption: RaffleCountdownOption, publishedAt: string) {
  if (countdownOption === 'disabled' || countdownOption === 'until_draw') {
    return publishedAt;
  }

  const publishedAtMs = new Date(publishedAt).getTime();
  return new Date(publishedAtMs + getCountdownLeadMs(countdownOption)).toISOString();
}

export function getCountdownStartsAt({
  scheduledFor,
  publishedAt,
  countdownOption,
}: {
  scheduledFor: string | null;
  publishedAt: string;
  countdownOption: RaffleCountdownOption;
}) {
  if (!scheduledFor || countdownOption === 'disabled') {
    return null;
  }

  if (countdownOption === 'until_draw') {
    return publishedAt;
  }

  const launchMs = new Date(scheduledFor).getTime();
  const startsAtMs = launchMs - getCountdownLeadMs(countdownOption);
  return new Date(startsAtMs).toISOString();
}

export function combineScheduledDateTime(date: string, time: string) {
  if (!date || !time) {
    return null;
  }

  const combined = new Date(`${date}T${time}:00`);
  if (Number.isNaN(combined.getTime())) {
    return null;
  }

  return combined.toISOString();
}

export function createRaffleRuntimeState(formState: RaffleFormState, raffleId: string): RaffleRuntimeState {
  const publishedAt = new Date().toISOString();
  const participants = normalizeParticipants(formState.participants);
  const prizePlan = normalizePrizePlan(formState.prizePlan);
  const scheduledFor =
    formState.mode === 'scheduled'
      ? combineScheduledDateTime(formState.scheduledDate, formState.scheduledTime)
      : getImmediateLaunchAt(formState.countdownOption, publishedAt);
  const countdownStartsAt = getCountdownStartsAt({
    scheduledFor,
    publishedAt,
    countdownOption: formState.countdownOption,
  });
  const winnerQueue = buildWinnerQueue(
    participants,
    formState.spinCount,
    formState.removeWinnerAfterSpin,
  );

  return {
    raffleId,
    title: formState.title.trim(),
    description: formState.description.trim(),
    mode: formState.mode,
    phase:
    formState.mode === 'scheduled'
      ? countdownStartsAt && new Date(countdownStartsAt).getTime() <= Date.now()
          ? 'countdown'
          : 'scheduled'
        : formState.countdownOption === 'disabled'
          ? 'ready'
          : 'countdown',
    scheduledFor,
    countdownOption: formState.countdownOption,
    countdownEnabled: formState.countdownOption !== 'disabled',
    countdownStartsAt,
    removeWinnerAfterSpin: formState.removeWinnerAfterSpin,
    spinCount: clampSpinCount(participants.length, formState.spinCount, formState.removeWinnerAfterSpin),
    prizePlan,
    prizePlans: normalizePrizePlans(formState.prizePlans),
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
  };
}

export function parseRaffleRuntimeSetting(setting: Pick<AppSetting, 'key' | 'value'> | null) {
  if (!setting || !setting.key.startsWith(RAFFLE_RUNTIME_KEY_PREFIX) || !setting.value) {
    return null;
  }

  const runtime = (() => {
    if (typeof setting.value === 'string') {
      try {
        const parsed = JSON.parse(setting.value) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Partial<RaffleRuntimeState>;
        }
      } catch {
        return null;
      }

      return null;
    }

    if (typeof setting.value === 'object' && !Array.isArray(setting.value)) {
      return setting.value as Partial<RaffleRuntimeState>;
    }

    return null;
  })();
  const raffleId = setting.key.replace(RAFFLE_RUNTIME_KEY_PREFIX, '');

  if (!raffleId || !runtime) {
    return null;
  }

  return {
    raffleId,
    title: typeof runtime.title === 'string' ? runtime.title : '',
    description: typeof runtime.description === 'string' ? runtime.description : '',
    mode: runtime.mode === 'scheduled' ? 'scheduled' : 'immediate',
    phase: runtime.phase ?? 'scheduled',
    scheduledFor: typeof runtime.scheduledFor === 'string' ? runtime.scheduledFor : null,
    countdownOption: runtime.countdownOption ?? 'disabled',
    countdownEnabled: Boolean(runtime.countdownEnabled),
    countdownStartsAt:
      typeof runtime.countdownStartsAt === 'string' ? runtime.countdownStartsAt : null,
    removeWinnerAfterSpin: runtime.removeWinnerAfterSpin !== false,
    spinCount: clampSpinCount(
      Array.isArray(runtime.participants) ? runtime.participants.length : 0,
      typeof runtime.spinCount === 'number' ? runtime.spinCount : 1,
      runtime.removeWinnerAfterSpin !== false,
    ),
    prizePlan:
      runtime.prizePlan && typeof runtime.prizePlan === 'object' && !Array.isArray(runtime.prizePlan)
        ? normalizePrizePlan(runtime.prizePlan as RafflePrizePlan)
        : null,
    prizePlans: Array.isArray(runtime.prizePlans)
      ? normalizePrizePlans(runtime.prizePlans as RafflePrizePlan[])
      : runtime.prizePlan && typeof runtime.prizePlan === 'object' && !Array.isArray(runtime.prizePlan)
        ? normalizePrizePlans([runtime.prizePlan as RafflePrizePlan])
        : [],
    participants: Array.isArray(runtime.participants)
      ? normalizeParticipants(runtime.participants as RaffleParticipant[])
      : [],
    visibleParticipantIds: Array.isArray(runtime.visibleParticipantIds)
      ? runtime.visibleParticipantIds.filter((value): value is string => typeof value === 'string')
      : (Array.isArray(runtime.participants)
          ? normalizeParticipants(runtime.participants as RaffleParticipant[]).map(
              (participant) => participant.id,
            )
          : []),
    winnerQueue: Array.isArray(runtime.winnerQueue)
      ? runtime.winnerQueue.filter((value): value is string => typeof value === 'string')
      : [],
    winners: Array.isArray(runtime.winners)
      ? (runtime.winners as RaffleWinnerRecord[])
      : [],
    prizeAssignments: Array.isArray(runtime.prizeAssignments)
      ? (runtime.prizeAssignments as RafflePrizeAssignment[])
      : [],
    activeWinnerId: typeof runtime.activeWinnerId === 'string' ? runtime.activeWinnerId : null,
    currentSpinIndex: typeof runtime.currentSpinIndex === 'number' ? runtime.currentSpinIndex : 0,
    currentSpinToken:
      typeof runtime.currentSpinToken === 'string' ? runtime.currentSpinToken : null,
    publishedAt: typeof runtime.publishedAt === 'string' ? runtime.publishedAt : new Date().toISOString(),
    launchNotifiedAt:
      typeof runtime.launchNotifiedAt === 'string' ? runtime.launchNotifiedAt : null,
    scheduleNotifiedAt:
      typeof runtime.scheduleNotifiedAt === 'string' ? runtime.scheduleNotifiedAt : null,
    oneMinuteNotifiedAt:
      typeof runtime.oneMinuteNotifiedAt === 'string' ? runtime.oneMinuteNotifiedAt : null,
    revealEndsAt: typeof runtime.revealEndsAt === 'string' ? runtime.revealEndsAt : null,
    intermissionEndsAt:
      typeof runtime.intermissionEndsAt === 'string' ? runtime.intermissionEndsAt : null,
    completedAt: typeof runtime.completedAt === 'string' ? runtime.completedAt : null,
    videoProofUrl: typeof runtime.videoProofUrl === 'string' ? runtime.videoProofUrl : null,
    videoProofPath: typeof runtime.videoProofPath === 'string' ? runtime.videoProofPath : null,
    lastUpdatedAt:
      typeof runtime.lastUpdatedAt === 'string' ? runtime.lastUpdatedAt : new Date().toISOString(),
  } satisfies RaffleRuntimeState;
}

export function getVisibleParticipants(runtime: RaffleRuntimeState | null) {
  if (!runtime) {
    return [];
  }

  const allowedIds = new Set(runtime.visibleParticipantIds);
  return runtime.participants.filter((participant) => allowedIds.has(participant.id));
}

export function getActiveWinner(runtime: RaffleRuntimeState | null) {
  if (!runtime?.activeWinnerId) {
    return null;
  }

  return runtime.participants.find((participant) => participant.id === runtime.activeWinnerId) ?? null;
}

export function getLatestWinner(runtime: RaffleRuntimeState | null) {
  if (!runtime || runtime.winners.length === 0) {
    return null;
  }

  return runtime.winners[runtime.winners.length - 1] ?? null;
}

export function buildRaffleViewModel(raffle: Raffle, runtime: RaffleRuntimeState | null): RaffleViewModel {
  return {
    raffle,
    runtime,
    participants: runtime?.participants ?? [],
    visibleParticipants: getVisibleParticipants(runtime),
    activeWinner: getActiveWinner(runtime),
    latestWinner: getLatestWinner(runtime),
  };
}

export function canStartCountdown(runtime: RaffleRuntimeState, now = Date.now()) {
  if (!runtime.countdownEnabled || !runtime.countdownStartsAt) {
    return false;
  }

  return new Date(runtime.countdownStartsAt).getTime() <= now;
}

export function isReadyForSpin(runtime: RaffleRuntimeState, now = Date.now()) {
  if (!runtime.scheduledFor) {
    return runtime.phase === 'ready';
  }

  return new Date(runtime.scheduledFor).getTime() <= now;
}

export function getCountdownMsRemaining(runtime: RaffleRuntimeState | null, now = Date.now()) {
  if (!runtime?.scheduledFor || runtime.phase === 'completed') {
    return null;
  }

  const targetMs = new Date(runtime.scheduledFor).getTime();
  return Math.max(targetMs - now, 0);
}

export function getRaffleHistoryCutoffIso(now = Date.now()) {
  return new Date(now - RAFFLE_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function getPrizeAssignment(
  runtime: RaffleRuntimeState | null,
  winnerParticipantId: string | null | undefined,
) {
  if (!runtime || !winnerParticipantId) {
    return null;
  }

  return (
    runtime.prizeAssignments.find(
      (assignment) => assignment.winnerParticipantId === winnerParticipantId,
    ) ?? null
  );
}

export function getPrizeSlot(
  runtime: RaffleRuntimeState | null,
  slotId: string | null | undefined,
) {
  if (!runtime || !slotId) return null;
  return runtime.prizePlans.find((p) => p.id === slotId) ?? null;
}

export function getCountdownPreviewMessage(formState: RaffleFormState) {
  if (formState.countdownOption === 'disabled') {
    return '';
  }

  if (formState.mode === 'immediate') {
    if (formState.countdownOption === 'until_draw') {
      return 'Choose a fixed countdown option for immediate raffles.';
    }

    const selectedOption = RAFFLE_COUNTDOWN_OPTIONS.find(
      (option) => option.value === formState.countdownOption,
    );

    return `After launch, the countdown will run for ${selectedOption?.label.toLowerCase() ?? 'a short time'} before the first spin.`;
  }

  if (!formState.scheduledTime) {
    return 'Choose a date and time to preview when the countdown will begin.';
  }

  if (formState.countdownOption === 'until_draw') {
    return `The countdown will stay visible until ${formState.scheduledTime}.`;
  }

  const selectedOption = RAFFLE_COUNTDOWN_OPTIONS.find(
    (option) => option.value === formState.countdownOption,
  );

  return `If the raffle launches at ${formState.scheduledTime}, the countdown will start ${selectedOption?.label.toLowerCase() ?? 'early'}.`;
}

export function getPrizePlanCapacity(plan: RafflePrizePlan): number {
  if (plan.type === 'bundle') return 1;
  return plan.splitAcrossWinners ? (plan.quantity ?? 1) : 1;
}

export function calculatePrizeCapacity(plans: RafflePrizePlan[]): number {
  return plans.reduce((sum, p) => sum + getPrizePlanCapacity(p), 0);
}

export function isMeaningfulRaffleForm(formState: RaffleFormState) {
  return (
    formState.title.trim().length > 0 ||
    formState.description.trim().length > 0 ||
    formState.prizePlans.length > 0 ||
    (formState.prizePlan?.title?.trim().length ?? 0) > 0 ||
    formState.participants.length > 0
  );
}
