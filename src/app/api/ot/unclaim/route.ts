import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getOTClaimMetaKey } from '@/lib/ot-claim-meta';

const UNCLAIM_WINDOW_MS = 20 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slotId } = (await request.json()) as {
    slotId?: string;
  };

  if (!slotId) {
    return NextResponse.json({ error: 'slotId is required' }, { status: 400 });
  }

  const { data: slot, error } = await serviceClient
    .from('ot_slots')
    .select('id, claimed_by, claimed_at, status')
    .eq('id', slotId)
    .single();

  if (error || !slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  }

  if (slot.claimed_by !== user.id) {
    return NextResponse.json({ error: 'You can only unclaim your own OT slot.' }, { status: 403 });
  }

  if (!slot.claimed_at) {
    return NextResponse.json({ error: 'This OT slot does not have a claim timestamp.' }, { status: 400 });
  }

  const msSinceClaim = Date.now() - new Date(slot.claimed_at).getTime();
  if (msSinceClaim > UNCLAIM_WINDOW_MS) {
    return NextResponse.json(
      { error: 'The 20-minute unclaim window has already expired.' },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await serviceClient
    .from('ot_slots')
    .update({
      status: 'available',
      claimed_by: null,
      claimed_at: null,
    })
    .eq('id', slotId)
    .eq('claimed_by', user.id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Unable to release the OT slot.' }, { status: 409 });
  }

  await serviceClient.from('app_settings').delete().eq('key', getOTClaimMetaKey(slotId));

  return NextResponse.json({ data: updated, message: 'OT slot released successfully.' });
}
