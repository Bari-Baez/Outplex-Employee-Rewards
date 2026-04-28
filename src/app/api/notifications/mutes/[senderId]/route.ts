import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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

export async function DELETE(_req: Request, context: { params: Promise<{ senderId: string }> }) {
  const auth = await getAuthorizedUser();
  if ('error' in auth) {
    return auth.error;
  }

  const { senderId } = await context.params;
  const service = await createServiceClient();
  const { error } = await service
    .from('notification_mutes')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('sender_id', senderId);

  if (error) {
    return NextResponse.json({ error: 'Unable to unmute this sender.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

