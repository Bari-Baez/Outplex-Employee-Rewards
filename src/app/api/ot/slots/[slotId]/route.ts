import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { doOTTimeRangesOverlap } from '@/lib/ot';
import { getOTClaimMetaKey, type OTClaimKind } from '@/lib/ot-claim-meta';
import { calcDuration, formatOTDate, formatTime, getShiftLabel, parseSpanishTime } from '@/lib/utils';
import { canEditTool } from '@/lib/permissions';

async function requireOTManagerEditor() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !canEditTool(profile.role, 'ot-manager')) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { user, serviceClient };
}

function formatSlotMessage(date: string, startTime: string, endTime: string) {
  return `${formatOTDate(date)} from ${formatTime(startTime)} to ${formatTime(endTime)}`;
}

async function createNotification(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
  title: string,
  message: string,
) {
  await serviceClient.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type: 'ot',
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slotId: string }> },
) {
  const auth = await requireOTManagerEditor();
  if ('error' in auth) {
    return auth.error;
  }

  const { serviceClient } = auth;
  const { slotId } = await context.params;

  const {
    date,
    start_time,
    end_time,
    shift_label,
    assignedUserId,
    claimKind,
    status,
  } = (await request.json()) as {
    date?: string;
    start_time?: string;
    end_time?: string;
    shift_label?: string;
    assignedUserId?: string | null;
    claimKind?: OTClaimKind;
    status?: 'available' | 'claimed' | 'cancelled';
  };

  const { data: currentSlot, error: currentError } = await serviceClient
    .from('ot_slots')
    .select('id, spot_id, date, start_time, end_time, duration_hrs, shift_label, status, claimed_by, claimed_at')
    .eq('id', slotId)
    .single();

  if (currentError || !currentSlot) {
    return NextResponse.json({ error: 'OT slot not found.' }, { status: 404 });
  }

  const nextDate = date ?? currentSlot.date;
  const nextStart = parseSpanishTime(start_time ?? currentSlot.start_time);
  const nextEnd = parseSpanishTime(end_time ?? currentSlot.end_time);
  const requestedAssignedUserId =
    assignedUserId === '' ? null : assignedUserId === undefined ? currentSlot.claimed_by : assignedUserId;
  const nextStatus =
    status ??
    (requestedAssignedUserId ? 'claimed' : currentSlot.status === 'cancelled' ? 'available' : currentSlot.status);

  if (nextStatus === 'claimed' && !requestedAssignedUserId) {
    return NextResponse.json(
      { error: 'A claimed OT slot must be assigned to an employee.' },
      { status: 400 },
    );
  }
  if (nextStatus === 'claimed' && claimKind !== 'day_off' && claimKind !== 'scheduled_extension') {
    return NextResponse.json(
      { error: 'Choose whether the OT is a day off OT or a schedule extension OT.' },
      { status: 400 },
    );
  }

  if (requestedAssignedUserId) {
    const { data: sameDayClaims, error: sameDayClaimsError } = await serviceClient
      .from('ot_slots')
      .select('id, start_time, end_time, date')
      .eq('claimed_by', requestedAssignedUserId)
      .eq('status', 'claimed')
      .eq('date', nextDate)
      .neq('id', slotId);

    if (sameDayClaimsError) {
      return NextResponse.json(
        { error: 'Unable to validate conflicting OT assignments for this employee.' },
        { status: 500 },
      );
    }

    const overlappingClaim = (sameDayClaims ?? []).find((claimedSlot) =>
      doOTTimeRangesOverlap(
        String(claimedSlot.start_time),
        String(claimedSlot.end_time),
        nextStart,
        nextEnd,
      ),
    );

    if (overlappingClaim) {
      return NextResponse.json(
        {
          error: `This employee already has an overlapping OT on ${formatOTDate(nextDate)} from ${formatTime(String(overlappingClaim.start_time))} to ${formatTime(String(overlappingClaim.end_time))}.`,
        },
        { status: 409 },
      );
    }

    if ((sameDayClaims ?? []).length > 0) {
      const existingSlot = sameDayClaims?.[0];
      return NextResponse.json(
        {
          error: `This employee already has OT assigned on ${formatOTDate(nextDate)}. Only one OT slot per day is allowed. Existing OT: ${formatTime(String(existingSlot?.start_time ?? '00:00'))} - ${formatTime(String(existingSlot?.end_time ?? '00:00'))}.`,
        },
        { status: 409 },
      );
    }
  }

  const shouldReleaseClaim = nextStatus !== 'claimed' || !requestedAssignedUserId;
  const nextClaimedBy = shouldReleaseClaim ? null : requestedAssignedUserId;
  const nextClaimedAt =
    nextClaimedBy && nextClaimedBy !== currentSlot.claimed_by
      ? new Date().toISOString()
      : shouldReleaseClaim
        ? null
        : currentSlot.claimed_at;

  const { data: updatedSlot, error: updateError } = await serviceClient
    .from('ot_slots')
    .update({
      date: nextDate,
      start_time: nextStart,
      end_time: nextEnd,
      duration_hrs: calcDuration(nextStart, nextEnd),
      shift_label: shift_label?.trim() || getShiftLabel(nextStart),
      status: nextStatus,
      claimed_by: nextClaimedBy,
      claimed_at: nextClaimedAt,
    })
    .eq('id', slotId)
    .select('id, spot_id, date, start_time, end_time, duration_hrs, shift_label, status, claimed_by, claimed_at, published_by, batch_id, created_at')
    .single();

  if (updateError || !updatedSlot) {
    return NextResponse.json({ error: updateError?.message ?? 'Unable to update OT slot.' }, { status: 500 });
  }

  if (nextClaimedBy && claimKind) {
    await serviceClient.from('app_settings').upsert(
      {
        key: getOTClaimMetaKey(slotId),
        value: {
          slotId,
          userId: nextClaimedBy,
          claimKind,
          claimedAt: updatedSlot.claimed_at ?? new Date().toISOString(),
          date: updatedSlot.date,
          startTime: updatedSlot.start_time,
          endTime: updatedSlot.end_time,
        },
      },
      { onConflict: 'key' },
    );
  } else {
    await serviceClient.from('app_settings').delete().eq('key', getOTClaimMetaKey(slotId));
  }

  const previousSummary = formatSlotMessage(
    currentSlot.date,
    currentSlot.start_time,
    currentSlot.end_time,
  );
  const nextSummary = formatSlotMessage(updatedSlot.date, updatedSlot.start_time, updatedSlot.end_time);

  if (currentSlot.claimed_by && currentSlot.claimed_by !== nextClaimedBy) {
    await createNotification(
      serviceClient,
      currentSlot.claimed_by,
      'Your OT reservation was changed',
      `A moderator updated your OT slot. Previous slot: ${previousSummary}.`,
    );
  }

  if (nextClaimedBy) {
    const title =
      currentSlot.claimed_by === nextClaimedBy ? 'Your OT reservation was updated' : 'A new OT slot was assigned to you';
    const message =
      currentSlot.claimed_by === nextClaimedBy
        ? `Your OT slot is now scheduled for ${nextSummary}.`
        : `A moderator assigned you this OT slot: ${nextSummary}.`;

    await createNotification(serviceClient, nextClaimedBy, title, message);
  }

  return NextResponse.json({
    data: updatedSlot,
    message: 'OT slot updated successfully.',
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ slotId: string }> },
) {
  const auth = await requireOTManagerEditor();
  if ('error' in auth) {
    return auth.error;
  }

  const { serviceClient } = auth;
  const { slotId } = await context.params;

  const { data: currentSlot, error: currentError } = await serviceClient
    .from('ot_slots')
    .select('id, date, start_time, end_time, claimed_by')
    .eq('id', slotId)
    .single();

  if (currentError || !currentSlot) {
    return NextResponse.json({ error: 'OT slot not found.' }, { status: 404 });
  }

  const { data: updatedSlot, error: updateError } = await serviceClient
    .from('ot_slots')
    .update({
      status: 'cancelled',
      claimed_by: null,
      claimed_at: null,
    })
    .eq('id', slotId)
    .select('id, spot_id, date, start_time, end_time, duration_hrs, shift_label, status, claimed_by, claimed_at, published_by, batch_id, created_at')
    .single();

  if (updateError || !updatedSlot) {
    return NextResponse.json({ error: updateError?.message ?? 'Unable to remove OT slot.' }, { status: 500 });
  }

  await serviceClient.from('app_settings').delete().eq('key', getOTClaimMetaKey(slotId));

  if (currentSlot.claimed_by) {
    await createNotification(
      serviceClient,
      currentSlot.claimed_by,
      'Your OT reservation was removed',
      `A moderator removed your OT slot scheduled for ${formatSlotMessage(
        currentSlot.date,
        currentSlot.start_time,
        currentSlot.end_time,
      )}.`,
    );
  }

  return NextResponse.json({
    data: updatedSlot,
    message: 'OT slot removed successfully.',
  });
}
