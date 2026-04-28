import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { doOTTimeRangesOverlap } from '@/lib/ot';
import { getOTClaimMetaKey, type OTClaimKind } from '@/lib/ot-claim-meta';
import { formatOTDate, formatTime } from '@/lib/utils';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slotId, claimKind } = (await request.json()) as {
    slotId?: string;
    claimKind?: OTClaimKind;
  };
  if (!slotId) {
    return NextResponse.json({ error: 'slotId is required' }, { status: 400 });
  }
  if (claimKind !== 'day_off' && claimKind !== 'scheduled_extension' && claimKind !== 'recovery') {
    return NextResponse.json(
      { error: 'Select the OT type: schedule extension, day off, or recovery hours.' },
      { status: 400 },
    );
  }

  // Use service client to bypass RLS for the atomic claim
  // First: check slot is still available
  const { data: slot, error: fetchError } = await serviceClient
    .from('ot_slots')
    .select('id, status, claimed_by, date, start_time, end_time, shift_label')
    .eq('id', slotId)
    .single();

  if (fetchError || !slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  }

  if (slot.status !== 'available') {
    return NextResponse.json(
      { error: 'This slot has already been claimed. Please select another one.' },
      { status: 409 }
    );
  }

  const { data: sameDayClaims, error: sameDayClaimsError } = await serviceClient
    .from('ot_slots')
    .select('id, date, start_time, end_time, shift_label')
    .eq('claimed_by', user.id)
    .eq('status', 'claimed')
    .eq('date', slot.date)
    .neq('id', slotId);

  if (sameDayClaimsError) {
    return NextResponse.json(
      { error: 'Unable to validate your OT schedule. Please try again.' },
      { status: 500 },
    );
  }

  const overlappingClaim = (sameDayClaims ?? []).find((claimedSlot) =>
    doOTTimeRangesOverlap(
      String(claimedSlot.start_time),
      String(claimedSlot.end_time),
      String(slot.start_time),
      String(slot.end_time),
    ),
  );

  if (overlappingClaim) {
    return NextResponse.json(
      {
        error: `This OT overlaps with another OT you already reserved on ${formatOTDate(String(slot.date))}: ${formatTime(String(overlappingClaim.start_time))} - ${formatTime(String(overlappingClaim.end_time))}.`,
      },
      { status: 409 },
    );
  }

  if ((sameDayClaims ?? []).length > 0) {
    const existingSlot = sameDayClaims?.[0];
    return NextResponse.json(
      {
        error: `You already reserved one OT slot for ${formatOTDate(String(slot.date))}. Only one OT slot per day is allowed. Existing OT: ${formatTime(String(existingSlot?.start_time ?? '00:00'))} - ${formatTime(String(existingSlot?.end_time ?? '00:00'))}.`,
      },
      { status: 409 },
    );
  }

  // Atomic update: only succeeds if status is still 'available'
  const { data: updated, error: claimError } = await serviceClient
    .from('ot_slots')
    .update({
      status: 'claimed',
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', slotId)
    .eq('status', 'available') // race-condition guard
    .select()
    .single();

  if (claimError || !updated) {
    return NextResponse.json(
      { error: 'This slot was just claimed by someone else. Please try another.' },
      { status: 409 }
    );
  }

  const metaKey = getOTClaimMetaKey(slotId);
  await serviceClient.from('app_settings').upsert(
    {
      key: metaKey,
      value: {
        slotId,
        userId: user.id,
        claimKind,
        claimedAt: updated.claimed_at ?? new Date().toISOString(),
        date: String(updated.date ?? slot.date),
        startTime: String(updated.start_time ?? slot.start_time),
        endTime: String(updated.end_time ?? slot.end_time),
      },
    },
    { onConflict: 'key' },
  );

  return NextResponse.json({ data: updated, message: 'Slot claimed successfully!' });
}
