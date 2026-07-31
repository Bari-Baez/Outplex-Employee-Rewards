import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { runCommunicationsMaintenance } from '@backend/modules/communications/application/communications-service';
import { NotificationsCenterClient } from '@frontend/modules/communications/ui/NotificationsCenterClient';
import type { BroadcastNotification } from '@shared/contracts/database';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  await runCommunicationsMaintenance();

  const serviceClient = await createServiceClient();
  const { data: broadcasts } = await serviceClient
    .from('broadcast_notifications')
    .select('*, author:users!broadcast_notifications_created_by_fkey(id, name, avatar_url, role)')
    .eq('status', 'published')
    .order('publish_at', { ascending: false })
    .limit(36);

  return <NotificationsCenterClient initialBroadcasts={(broadcasts ?? []) as BroadcastNotification[]} />;
}
