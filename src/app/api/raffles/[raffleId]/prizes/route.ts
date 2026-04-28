import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import { isModeratorRole } from '@/lib/auth/roles';
import {
  assertModeratorAccess,
  loadRaffleRuntime,
  persistRaffleRuntime,
  upsertPrizeAssignment,
} from '@/lib/raffles/server';

export async function PATCH(
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

    const { raffleId } = await context.params;
    const body = (await request.json()) as {
      winnerParticipantId?: string;
      prizeTitle?: string;
      prizeSlotId?: string | null;
      storeItemId?: string | null;
      quantity?: number;
      imageUrl?: string | null;
      unitPoints?: number | null;
      notes?: string;
    };

    const winnerParticipantId = body.winnerParticipantId?.trim();
    const prizeTitle = body.prizeTitle?.trim();
    const prizeSlotId = body.prizeSlotId?.trim() ?? null;
    const storeItemId = body.storeItemId?.trim() ?? null;
    const quantity =
      typeof body.quantity === 'number' && Number.isFinite(body.quantity)
        ? Math.max(1, Math.trunc(body.quantity))
        : 1;
    const imageUrl = body.imageUrl?.trim() ?? null;
    const unitPoints =
      typeof body.unitPoints === 'number' && Number.isFinite(body.unitPoints)
        ? Math.max(0, Math.trunc(body.unitPoints))
        : null;
    const notes = body.notes?.trim() ?? null;

    if (!winnerParticipantId) {
      return NextResponse.json({ error: 'winnerParticipantId is required.' }, { status: 400 });
    }

    if (!prizeTitle) {
      return NextResponse.json({ error: 'Prize title is required.' }, { status: 400 });
    }

    const runtime = await loadRaffleRuntime(serviceClient, raffleId);
    if (!runtime) {
      return NextResponse.json({ error: 'Raffle runtime not found.' }, { status: 404 });
    }

    const winner = runtime.winners.find(
      (currentWinner) => currentWinner.participantId === winnerParticipantId,
    );

    if (!winner) {
      return NextResponse.json(
        { error: 'This participant is not registered as a winner for the selected raffle.' },
        { status: 400 },
      );
    }

    const previousAssignment =
      runtime.prizeAssignments.find(
        (currentAssignment) => currentAssignment.winnerParticipantId === winnerParticipantId,
      ) ?? null;

    if (previousAssignment?.storeItemId && previousAssignment.storeItemId !== storeItemId) {
      const { data: previousItem } = await serviceClient
        .from('store_items')
        .select('id, stock')
        .eq('id', previousAssignment.storeItemId)
        .maybeSingle();

      if (previousItem && previousItem.stock !== -1) {
        await serviceClient
          .from('store_items')
          .update({ stock: previousItem.stock + (previousAssignment.quantity ?? 1) })
          .eq('id', previousItem.id);
      }
    }

    if (storeItemId) {
      const { data: storeItem, error: itemError } = await serviceClient
        .from('store_items')
        .select('id, name, stock, image_url, points_cost')
        .eq('id', storeItemId)
        .maybeSingle();

      if (itemError) {
        throw new Error(itemError.message);
      }

      if (!storeItem) {
        return NextResponse.json({ error: 'The selected store item no longer exists.' }, { status: 404 });
      }

      const previouslyAllocated =
        previousAssignment?.storeItemId === storeItemId ? previousAssignment.quantity ?? 1 : 0;
      const availableStock =
        storeItem.stock === -1 ? -1 : storeItem.stock + previouslyAllocated;

      if (availableStock !== -1 && availableStock < quantity) {
        return NextResponse.json(
          { error: `Only ${availableStock} unit(s) remain for ${storeItem.name}.` },
          { status: 400 },
        );
      }

      if (storeItem.stock !== -1) {
        const nextStock = availableStock - quantity;
        await serviceClient
          .from('store_items')
          .update({ stock: nextStock })
          .eq('id', storeItem.id);
      }
    }

    const nextRuntime = upsertPrizeAssignment(runtime, {
      winnerParticipantId,
      winnerName: winner.name,
      prizeTitle,
      prizeSlotId,
      storeItemId,
      quantity,
      imageUrl,
      unitPoints,
      notes,
      assignedAt: new Date().toISOString(),
    });

    await persistRaffleRuntime(serviceClient, nextRuntime);
    return NextResponse.json({ data: nextRuntime });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while assigning raffle prizes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
