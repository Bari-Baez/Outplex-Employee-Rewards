import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import {
  loadRaffleRuntime,
  persistRaffleRuntime,
  sendWinnerNotifications,
  upsertPrizeAssignment,
} from '@backend/modules/raffles/application/raffle-service';
import { WINNER_REVEAL_MS, type RaffleRuntimeState } from '@backend/modules/raffles/domain/runtime';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ raffleId: string }> },
) {
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
    if (!profile?.role || !isModeratorRole(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'raffle_engine',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const { raffleId } = await context.params;
    const body = (await request.json()) as {
      spinToken?: string;
    };

    if (!body.spinToken) {
      return NextResponse.json({ error: 'spinToken is required.' }, { status: 400 });
    }

    const runtime = await loadRaffleRuntime(serviceClient, raffleId);
    if (!runtime) {
      return NextResponse.json({ error: 'Raffle runtime not found.' }, { status: 404 });
    }

    if (runtime.phase !== 'spinning' || runtime.currentSpinToken !== body.spinToken) {
      return NextResponse.json({ data: runtime });
    }

    const winner = runtime.participants.find(
      (participant) => participant.id === runtime.activeWinnerId,
    );

    if (!winner) {
      return NextResponse.json(
        { error: 'The active winner could not be resolved for this spin.' },
        { status: 409 },
      );
    }

    const selectedAt = new Date().toISOString();
    const spinIndex = runtime.currentSpinIndex; // 0-based index of this spin
    let nextRuntime: RaffleRuntimeState = {
      ...runtime,
      phase: 'winner_reveal' as const,
      winners: [
        ...runtime.winners,
        {
          participantId: winner.id,
          name: winner.name,
          userId: winner.userId ?? null,
          selectedAt,
          spinIndex: spinIndex + 1,
        },
      ],
      visibleParticipantIds: runtime.removeWinnerAfterSpin
        ? runtime.visibleParticipantIds.filter((participantId) => participantId !== winner.id)
        : runtime.visibleParticipantIds,
      currentSpinIndex: spinIndex + 1,
      activeWinnerId: null,
      currentSpinToken: null,
      revealEndsAt: new Date(Date.now() + WINNER_REVEAL_MS).toISOString(),
      intermissionEndsAt: null,
      lastUpdatedAt: selectedAt,
    };

    // Auto-assign prize slot to this winner if prize plans are configured
    const prizePlans = runtime.prizePlans ?? [];
    const alreadyAssigned = runtime.prizeAssignments.some(
      (a) => a.winnerParticipantId === winner.id,
    );
    if (prizePlans.length > 0 && !alreadyAssigned) {
      const slotIndex = spinIndex % prizePlans.length;
      const slot = prizePlans[slotIndex];
      if (slot) {
        const assignedQty =
          slot.splitAcrossWinners && (slot.quantity ?? 1) > 1 ? 1 : (slot.quantity ?? 1);
        const imageUrl =
          slot.imageUrl ??
          (slot.bundleItems && slot.bundleItems.length > 0
            ? (slot.bundleItems[0]?.imageUrl ?? null)
            : null);
        nextRuntime = upsertPrizeAssignment(nextRuntime, {
          winnerParticipantId: winner.id,
          winnerName: winner.name,
          prizeTitle: slot.title,
          prizeSlotId: slot.id ?? null,
          storeItemId: slot.type !== 'bundle' ? (slot.storeItemId ?? null) : null,
          quantity: assignedQty,
          imageUrl,
          unitPoints: slot.type !== 'bundle' ? (slot.unitPoints ?? null) : null,
          notes: null,
          assignedAt: selectedAt,
        });
      }
    }

    await persistRaffleRuntime(serviceClient, nextRuntime);

    // Create a store order for the raffle prize (only when the winner is a registered user
    // and the prize slot links to a store item — this makes the prize visible in Store Operations)
    const prizePlans2 = runtime.prizePlans ?? [];
    if (winner.userId && prizePlans2.length > 0) {
      const slotIndex2 = spinIndex % prizePlans2.length;
      const slot2 = prizePlans2[slotIndex2];
      if (slot2 && slot2.type !== 'bundle' && slot2.storeItemId) {
        const assignedQty2 =
          slot2.splitAcrossWinners && (slot2.quantity ?? 1) > 1 ? 1 : (slot2.quantity ?? 1);
        await serviceClient.from('store_orders').insert({
          item_id: slot2.storeItemId,
          user_id: winner.userId,
          points_spent: 0,
          status: 'completed',
          meta: {
            quantity: assignedQty2,
            unitPoints: 0,
            itemName: slot2.title,
            itemImageUrl: slot2.imageUrl ?? null,
            orderLabel: 'raffle',
            buyerName: winner.name,
          },
        });
      } else if (slot2 && slot2.type === 'bundle' && slot2.bundleItems && slot2.bundleItems.length > 0) {
        // For bundles: create one order per bundle item that has a storeItemId
        for (const bi of slot2.bundleItems) {
          if (bi.storeItemId) {
            await serviceClient.from('store_orders').insert({
              item_id: bi.storeItemId,
              user_id: winner.userId,
              points_spent: 0,
              status: 'completed',
              meta: {
                quantity: bi.quantity,
                unitPoints: 0,
                itemName: bi.name,
                itemImageUrl: bi.imageUrl ?? null,
                orderLabel: 'raffle',
                buyerName: winner.name,
              },
            });
          }
        }
      }
    }

    if (winner.userId) {
      await sendWinnerNotifications(serviceClient, nextRuntime, [winner.userId]);
    }

    return NextResponse.json({ data: nextRuntime });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while finalizing the spin.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
