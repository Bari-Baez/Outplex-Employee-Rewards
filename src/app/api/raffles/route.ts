import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import {
  assertModeratorAccess,
  loadRaffleFeed,
  matchParticipantsToUsers,
  persistRaffleRuntime,
  prepareRuntimeForCreate,
  pruneExpiredRaffles,
  sendGlobalRaffleNotifications,
} from '@backend/modules/raffles/application/raffle-service';
import {
  combineScheduledDateTime,
  getPrizePlanCapacity,
  type RafflePrizePlan,
  type RaffleCountdownOption,
  type RaffleFormState,
  type RaffleMode,
} from '@backend/modules/raffles/domain/runtime';

function isRaffleMode(value: string): value is RaffleMode {
  return value === 'immediate' || value === 'scheduled';
}

function isCountdownOption(value: string): value is RaffleCountdownOption {
  return [
    'disabled',
    'until_draw',
    '3600',
    '2700',
    '1800',
    '1200',
    '900',
    '300',
    '120',
    '60',
    '30',
  ].includes(value);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: isModeratorRole(profile.role) ? 'raffle_engine' : 'raffles',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const data = await loadRaffleFeed(serviceClient);
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while loading raffles.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: isModeratorRole(profile.role) ? 'raffle_engine' : 'raffles',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    await assertModeratorAccess(serviceClient, user.id);
    const deletedCount = await pruneExpiredRaffles(serviceClient);

    return NextResponse.json({
      data: {
        deletedCount,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while deleting old raffles.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: isModeratorRole(profile.role) ? 'raffle_engine' : 'raffles',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    await assertModeratorAccess(serviceClient, user.id);

    const body = (await request.json()) as Partial<RaffleFormState>;
    const mode = body.mode ?? 'immediate';
    const title = body.title?.trim() ?? '';
    const description = body.description?.trim() ?? '';
    const participants = body.participants ?? [];
    const prizePlan =
      body.prizePlan && typeof body.prizePlan === 'object' && !Array.isArray(body.prizePlan)
        ? (body.prizePlan as RafflePrizePlan)
        : null;
    const prizePlans = Array.isArray(body.prizePlans)
      ? (body.prizePlans as RafflePrizePlan[])
      : [];
    const countdownOption = body.countdownOption ?? 'disabled';
    const removeWinnerAfterSpin = body.removeWinnerAfterSpin !== false;
    const spinCount = typeof body.spinCount === 'number' ? body.spinCount : 1;
    const scheduledDate = body.scheduledDate ?? '';
    const scheduledTime = body.scheduledTime ?? '';

    if (!isRaffleMode(mode)) {
      return NextResponse.json({ error: 'Choose a valid raffle mode.' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'A raffle title is required before launch.' }, { status: 400 });
    }

    const minParticipants = removeWinnerAfterSpin ? spinCount : 2;
    if (!Array.isArray(participants) || participants.length < minParticipants) {
      return NextResponse.json(
        {
          error: removeWinnerAfterSpin
            ? `You have ${spinCount} winners scheduled. With "Winners removed" enabled, you need at least ${spinCount} participants to launch.`
            : 'Add at least 2 participants before launching the raffle.',
        },
        { status: 400 },
      );
    }

    if (!isCountdownOption(countdownOption)) {
      return NextResponse.json({ error: 'Choose a valid countdown option.' }, { status: 400 });
    }

    if (mode === 'immediate' && countdownOption === 'until_draw') {
      return NextResponse.json(
        { error: 'Immediate raffles must use a fixed countdown duration or disable the timer.' },
        { status: 400 },
      );
    }

    if (mode === 'scheduled') {
      const scheduledFor = combineScheduledDateTime(scheduledDate, scheduledTime);
      if (!scheduledFor) {
        return NextResponse.json(
          { error: 'Choose a valid day and time for the scheduled raffle.' },
          { status: 400 },
        );
      }

      if (new Date(scheduledFor).getTime() <= Date.now()) {
        return NextResponse.json(
          { error: 'Scheduled raffles must be set to a future date and time.' },
          { status: 400 },
        );
      }
    }

    const matchedParticipants = await matchParticipantsToUsers(serviceClient, participants);

    const formState: RaffleFormState = {
      mode,
      title,
      description,
      scheduledDate,
      scheduledTime,
      countdownOption,
      removeWinnerAfterSpin,
      spinCount,
      prizePlan,
      prizePlans,
      participants: matchedParticipants,
    };

    const drawDate =
      mode === 'scheduled'
        ? combineScheduledDateTime(scheduledDate, scheduledTime)
        : new Date().toISOString();

    // 0. Concurrency limit check (Max 2 active/overlapping)
    const { data: existingActive, error: activeError } = await serviceClient
      .from('raffles')
      .select('id, title, status, draw_date')
      .in('status', ['live', 'upcoming']);

    if (activeError) throw new Error(`Status check failed: ${activeError.message}`);

    const targetDateObj = new Date(drawDate!);
    const ONE_HOUR = 60 * 60 * 1000;

    const overlapping = (existingActive ?? []).filter(r => {
      // For this check, any raffle started or starting within 1 hour of the target counts as overlapping
      const d = r.draw_date ? new Date(r.draw_date).getTime() : Date.now();
      const diff = Math.abs(d - targetDateObj.getTime());
      return diff < ONE_HOUR;
    });

    if (overlapping.length >= 2) {
      return NextResponse.json(
        { error: `Concurrency limit: A maximum of 2 raffles can be active within the same hour window. There are already ${overlapping.length} raffles active or scheduled near this time (${overlapping.map(o => o.title || 'Untitled').join(', ')}).` },
        { status: 400 }
      );
    }

    // 1. Pre-calculate total stock reservations required
    const reservations = new Map<string, number>();
    let assignedWinners = 0;
    for (const slot of prizePlans) {
      if (assignedWinners >= spinCount) break;

      const capacity = getPrizePlanCapacity(slot);
      const timesUsed = Math.min(capacity, spinCount - assignedWinners);
      assignedWinners += timesUsed;

      if (timesUsed <= 0) continue;

      if (slot.type === 'bundle' && slot.bundleItems) {
        for (const bi of slot.bundleItems) {
          if (!bi.storeItemId) continue;
          // TimesUsed is always 1 for bundle since capacity is 1, but we use timesUsed for consistency
          const totalReserve = Math.max(0, (bi.quantity ?? 1) * timesUsed);
          if (totalReserve <= 0) continue;
          reservations.set(bi.storeItemId, (reservations.get(bi.storeItemId) ?? 0) + totalReserve);
        }
      } else if (slot.storeItemId && slot.source === 'store_item') {
        const perWinnerQty = slot.splitAcrossWinners ? 1 : (slot.quantity ?? 1);
        const totalReserve = Math.max(0, perWinnerQty * timesUsed);
        if (totalReserve <= 0) continue;
        reservations.set(slot.storeItemId, (reservations.get(slot.storeItemId) ?? 0) + totalReserve);
      }
    }

    // 2. Verify stock availability before committing
    const reservationIds = [...reservations.keys()];
    if (reservationIds.length > 0) {
      const { data: dbItems, error: fetchError } = await serviceClient
        .from('store_items')
        .select('id, name, stock')
        .in('id', reservationIds);

      if (fetchError) {
        throw new Error(`Unable to verify prize stock: ${fetchError.message}`);
      }

      const insufficient: string[] = [];
      for (const item of dbItems ?? []) {
        const required = reservations.get(item.id) ?? 0;
        if (item.stock !== -1 && item.stock < required) {
          insufficient.push(`${item.name} (has ${item.stock}, needs ${required})`);
        }
      }

      if (insufficient.length > 0) {
        return NextResponse.json(
          { error: `Insufficient stock for rewards: ${insufficient.join(', ')}. It is possible that some items were purchased in the store while you were drafting this raffle. Please refresh and adjust the prize slots.` },
          { status: 400 },
        );
      }
    }

    // 3. Create the raffle record
    const { data: raffle, error: raffleError } = await serviceClient
      .from('raffles')
      .insert({
        title,
        description: description || null,
        draw_date: drawDate,
        status: 'upcoming',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (raffleError || !raffle) {
      return NextResponse.json(
        { error: raffleError?.message ?? 'Unable to create the raffle.' },
        { status: 500 },
      );
    }

    let runtime = prepareRuntimeForCreate(formState, raffle.id);
    const raffleStatus = runtime.phase === 'scheduled' ? 'upcoming' : 'live';

    const { error: statusError } = await serviceClient
      .from('raffles')
      .update({ status: raffleStatus, draw_date: runtime.scheduledFor })
      .eq('id', raffle.id);

    if (statusError) {
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    if (raffleStatus === 'upcoming') {
      await sendGlobalRaffleNotifications(serviceClient, {
        title: 'A raffle was scheduled',
        message: `"${title}" was scheduled for ${new Date(runtime.scheduledFor ?? nowIso).toLocaleString()}.`,
      });
      runtime = {
        ...runtime,
        scheduleNotifiedAt: nowIso,
        lastUpdatedAt: nowIso,
      };
    } else {
      await sendGlobalRaffleNotifications(serviceClient, {
        title: 'A raffle is now live',
        message:
          runtime.phase === 'countdown'
            ? `"${title}" is live with a countdown before the first spin.`
            : `"${title}" is live now. Open the raffle page to watch the wheel spin.`,
      });
      runtime = {
        ...runtime,
        launchNotifiedAt: nowIso,
        lastUpdatedAt: nowIso,
      };
    }

    await persistRaffleRuntime(serviceClient, runtime);

    // 4. Update stock (now safe since we verified)
    if (reservationIds.length > 0) {
      const { data: latestItems } = await serviceClient
        .from('store_items')
        .select('id, stock')
        .in('id', reservationIds);

      for (const item of latestItems ?? []) {
        const reserve = reservations.get(item.id) ?? 0;
        const stock = item.stock as number;
        if (reserve <= 0 || stock === -1) continue;
        await serviceClient
          .from('store_items')
          .update({ stock: Math.max(0, stock - reserve) })
          .eq('id', item.id);
      }
    }

    return NextResponse.json({
      data: {
        raffle: {
          ...raffle,
          status: raffleStatus,
          draw_date: runtime.scheduledFor,
        },
        runtime,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while creating the raffle.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
