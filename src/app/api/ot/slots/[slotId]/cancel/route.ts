import { type NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import { formatOTDate } from '@backend/modules/ot/domain/time';
import { formatTime } from '@shared/utils/format';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ slotId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isModeratorRole(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const { slotId } = await context.params;

  const { data: slot, error: fetchError } = await service
    .from('ot_slots')
    .select('id, date, start_time, end_time, status, claimed_by, claimed_at')
    .eq('id', slotId)
    .single();

  if (fetchError || !slot) {
    return NextResponse.json({ error: 'OT slot not found.' }, { status: 404 });
  }

  if (slot.status === 'cancelled') {
    return NextResponse.json({ error: 'This slot is already cancelled.' }, { status: 409 });
  }

  // Cancel: only update status — preserve claimed_by and claimed_at for audit trail
  const { data: updated, error: updateError } = await service
    .from('ot_slots')
    .update({ status: 'cancelled' })
    .eq('id', slotId)
    .select('id, spot_id, date, start_time, end_time, duration_hrs, shift_label, status, claimed_by, claimed_at, published_by, batch_id, created_at')
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Unable to cancel OT slot.' }, { status: 500 });
  }

  if (slot.claimed_by) {
    const slotLabel = `${formatOTDate(slot.date)} from ${formatTime(String(slot.start_time))} to ${formatTime(String(slot.end_time))}`;
    await service.from('notifications').insert({
      user_id: slot.claimed_by,
      title: 'Your OT slot was cancelled',
      message: `A moderator cancelled your OT slot scheduled for ${slotLabel}.`,
      type: 'ot',
    });
  }

  return NextResponse.json({ data: updated, message: 'OT slot cancelled.' });
}
