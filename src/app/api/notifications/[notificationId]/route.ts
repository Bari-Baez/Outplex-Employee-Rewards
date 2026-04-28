import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function getAuthorizedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { user };
}

export async function DELETE(_: Request, context: { params: Promise<{ notificationId: string }> }) {
  const auth = await getAuthorizedUser();
  if ('error' in auth) {
    return auth.error;
  }

  const { notificationId } = await context.params;
  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: 'Unable to delete notification.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
