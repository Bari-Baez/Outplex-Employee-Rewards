import 'server-only';

import type {
  BroadcastNotification,
  CompanyAnnouncement,
  EmployeeAnnouncement,
} from '@shared/contracts/database';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import {
  normalizeAnnouncementRecord,
  runCommunicationsMaintenance,
} from '@backend/modules/communications/application/communications-service';

type CommunicationsProfile = {
  id: string;
  role: string;
  name: string | null;
};

export type CommunicationsPageData = {
  currentModeratorName: string;
  initialBroadcasts: BroadcastNotification[];
  initialAnnouncements: CompanyAnnouncement[];
  isStoreLimited: boolean;
};

export type CommunicationsPageLoadResult =
  | { ok: false; redirectTo: '/login' | '/dashboard' }
  | { ok: true; data: CommunicationsPageData };

export async function loadCommunicationsPage(): Promise<CommunicationsPageLoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, redirectTo: '/login' };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, name')
    .eq('id', user.id)
    .single<CommunicationsProfile>();

  if (!profile) {
    return { ok: false, redirectTo: '/dashboard' };
  }

  let isStoreLimited = false;
  if (!['moderator_a1', 'admin'].includes(profile.role)) {
    if (profile.role !== 'employee') {
      return { ok: false, redirectTo: '/dashboard' };
    }

    const { count } = await supabase
      .from('employee_stores')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    if (!count) {
      return { ok: false, redirectTo: '/dashboard' };
    }

    isStoreLimited = true;
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

  const initialAnnouncements = (announcementsResult.data ?? []).map((item) =>
    normalizeAnnouncementRecord(
      item as (CompanyAnnouncement | EmployeeAnnouncement) & { content: unknown },
    ),
  );

  return {
    ok: true,
    data: {
      currentModeratorName: profile.name ?? 'Moderator',
      initialBroadcasts: (broadcastsResult.data ?? []) as BroadcastNotification[],
      initialAnnouncements,
      isStoreLimited,
    },
  };
}
