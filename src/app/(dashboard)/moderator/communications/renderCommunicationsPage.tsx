import type { BroadcastNotification, CompanyAnnouncement, EmployeeAnnouncement } from '@/types/database';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { runCommunicationsMaintenance, normalizeAnnouncementRecord } from '@/lib/communications-server';
import { ModeratorCommunicationsClient } from './ModeratorCommunicationsClient';

export type CommunicationsTab = 'notifications' | 'announcements';

export async function renderCommunicationsPage({
  initialTab,
}: {
  initialTab: CommunicationsTab;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('id, role, name').eq('id', user.id).single();
  let isStoreLimited = false;

  if (!profile) redirect('/dashboard');
  if (!['moderator_a1', 'admin'].includes(profile.role)) {
    if (profile.role === 'employee') {
      const { count } = await supabase.from('employee_stores').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
      if (!count || count === 0) {
        redirect('/dashboard');
      }
      isStoreLimited = true;
    } else {
      redirect('/dashboard');
    }
  }

  await runCommunicationsMaintenance();

  const serviceClient = await createServiceClient();
  let broadcastsQuery = serviceClient
    .from('broadcast_notifications')
    .select('*, author:users!broadcast_notifications_created_by_fkey(id, name, avatar_url, role)')
    .order('updated_at', { ascending: false });

  if (isStoreLimited) {
    broadcastsQuery = broadcastsQuery.eq('created_by', user.id);
  }

  const [broadcastsResult, announcementsResult] = await Promise.all([
    broadcastsQuery,
    isStoreLimited
      ? serviceClient
          .from('employee_announcements')
          .select('*, author:users!employee_announcements_created_by_fkey(id, name, avatar_url, role)')
          .eq('created_by', user.id)
          .order('updated_at', { ascending: false })
      : serviceClient
          .from('company_announcements')
          .select('*, author:users!company_announcements_created_by_fkey(id, name, avatar_url, role)')
          .order('updated_at', { ascending: false }),
  ]);

  return (
    <ModeratorCommunicationsClient
      currentModeratorName={profile.name ?? 'Moderator'}
      initialBroadcasts={(broadcastsResult.data ?? []) as BroadcastNotification[]}
      initialAnnouncements={(announcementsResult.data ?? []).map((item) =>
        normalizeAnnouncementRecord(item as (CompanyAnnouncement | EmployeeAnnouncement) & { content: unknown }),
      ) as CompanyAnnouncement[]}
      isStoreLimited={isStoreLimited}
      initialTab={initialTab}
    />
  );
}

