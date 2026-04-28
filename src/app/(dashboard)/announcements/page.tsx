import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { runCommunicationsMaintenance } from '@/lib/communications-server';
import type { CompanyAnnouncement, EmployeeAnnouncement, Notification, User } from '@/types/database';
import { AnnouncementsHubClient } from './AnnouncementsHubClient';

export const metadata: Metadata = { title: 'Announcements' };

type AnnouncementAuthor = Pick<User, 'id' | 'name' | 'avatar_url' | 'role'>;
type NotificationWithSender = Notification & { sender?: AnnouncementAuthor | null };
type MutedSenderRow = { sender?: AnnouncementAuthor[] | null };

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  await runCommunicationsMaintenance();

  const serviceClient = await createServiceClient();
  const { data: companyAnnouncements } = await serviceClient
    .from('company_announcements')
    .select('*, author:users!company_announcements_created_by_fkey(id, name, avatar_url, role)')
    .eq('status', 'published')
    .order('publish_at', { ascending: false })
    .limit(24);

  const employeeAnnouncementsResult = await serviceClient
    .from('employee_announcements')
    .select('*, author:users!employee_announcements_created_by_fkey(id, name, avatar_url, role)')
    .eq('status', 'published')
    .order('publish_at', { ascending: false })
    .limit(24);

  const notificationsResult = await serviceClient
    .from('notifications')
    .select('*, sender:users!notifications_sender_id_fkey(id, name, avatar_url, role)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(80);

  const mutedSendersResult = await serviceClient
    .from('notification_mutes')
    .select('sender:users!notification_mutes_sender_id_fkey(id, name, avatar_url, role)')
    .eq('user_id', user.id);

  const { count: storeCount } = await supabase
    .from('employee_stores')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id);

  const employeeAnnouncements = employeeAnnouncementsResult.error ? [] : (employeeAnnouncementsResult.data ?? []);
  const notifications = notificationsResult.error ? [] : (notificationsResult.data ?? []);
  const mutedSenders = mutedSendersResult.error ? [] : ((mutedSendersResult.data ?? []) as MutedSenderRow[]);

  return (
    <AnnouncementsHubClient
      initialCompanyAnnouncements={(companyAnnouncements ?? []) as CompanyAnnouncement[]}
      initialEmployeeAnnouncements={employeeAnnouncements as EmployeeAnnouncement[]}
      initialNotifications={notifications as NotificationWithSender[]}
      initialMutedSenders={mutedSenders
        .flatMap((row) => row.sender ?? [])}
      isStoreOwner={!!storeCount && storeCount > 0}
    />
  );
}
