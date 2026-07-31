import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

async function getAuthorizedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user };
}

export async function POST(req: Request) {
  const auth = await getAuthorizedUser();
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const body = (await req.json()) as { senderId?: string };
    const senderId = typeof body.senderId === 'string' ? body.senderId.trim() : '';
    if (!senderId) {
      return NextResponse.json({ error: 'senderId is required.' }, { status: 400 });
    }

    const service = await createServiceClient();
    const { data: sender, error: senderError } = await service
      .from('users')
      .select('id, role')
      .eq('id', senderId)
      .maybeSingle();

    if (senderError || !sender) {
      return NextResponse.json({ error: 'Sender not found.' }, { status: 404 });
    }

    // Users can only mute employee senders (not company staff/moderators).
    if (sender.role !== 'employee') {
      return NextResponse.json({ error: 'You cannot mute company notifications.' }, { status: 400 });
    }

    const insertResult = await service.from('notification_mutes').upsert({
      user_id: auth.user.id,
      sender_id: senderId,
    });

    if (insertResult.error) {
      return NextResponse.json({ error: 'Unable to mute this sender.' }, { status: 500 });
    }

    // Remove existing notifications from this sender for a clean experience.
    await service.from('notifications').delete().eq('user_id', auth.user.id).eq('sender_id', senderId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to mute this sender.' },
      { status: 500 },
    );
  }
}

