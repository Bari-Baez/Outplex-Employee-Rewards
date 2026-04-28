import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  ANNOUNCEMENT_DURATION_OPTIONS,
  BROADCAST_NOTIFICATION_LIMIT_PER_DAY,
  COMMUNICATIONS_TIME_ZONE,
  getCommunicationDateKey,
  normalizeAnnouncementBlocks,
} from '@/lib/communications';
import type {
  AnnouncementDurationDays,
  AnnouncementStatus,
  BroadcastNotificationCategory,
  BroadcastNotificationStatus,
  CompanyAnnouncement,
  BroadcastNotification,
  EmployeeAnnouncement,
} from '@/types/database';
import { NextResponse } from 'next/server';

type ModeratorProfile = {
  id: string;
  role: string;
  name?: string | null;
};

export async function requireModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, name')
    .eq('id', user.id)
    .single<ModeratorProfile>();

  let hasStore = false;
  if (profile && profile.role === 'employee') {
    const { count } = await supabase.from('employee_stores').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
    if (count && count > 0) hasStore = true;
  }

  if (!profile || (!['moderator', 'moderator_a1', 'admin'].includes(profile.role) && !hasStore)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, profile, hasStore };
}

export function normalizeScheduledAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeAnnouncementDuration(value: unknown): AnnouncementDurationDays {
  const numeric = typeof value === 'number' ? value : Number(value);
  return (ANNOUNCEMENT_DURATION_OPTIONS.includes(numeric as AnnouncementDurationDays)
    ? numeric
    : 7) as AnnouncementDurationDays;
}

export function resolveBroadcastStatus(mode: unknown): BroadcastNotificationStatus {
  return mode === 'draft' || mode === 'scheduled' ? mode : 'published';
}

export function resolveAnnouncementStatus(mode: unknown): AnnouncementStatus {
  return mode === 'draft' || mode === 'scheduled' ? mode : 'published';
}

export function normalizeBroadcastCategory(value: unknown): BroadcastNotificationCategory {
  switch (value) {
    case 'availability':
    case 'stock':
    case 'site_visit':
      return value;
    default:
      return 'general';
  }
}

export function buildAnnouncementExpiry(publishAtIso: string, durationDays: AnnouncementDurationDays) {
  const publishDate = new Date(publishAtIso);
  publishDate.setDate(publishDate.getDate() + durationDays);
  return publishDate.toISOString();
}

export async function enforceDailyBroadcastLimit(
  publishAtIso: string,
  currentId?: string,
  userId?: string,
  isStoreLimited?: boolean,
) {
  const serviceClient = await createServiceClient();
  const targetDateKey = getCommunicationDateKey(publishAtIso);
  const startBoundary = `${targetDateKey}T00:00:00.000-04:00`;
  const endDate = new Date(`${targetDateKey}T00:00:00.000-04:00`);
  endDate.setDate(endDate.getDate() + 1);

  let query = serviceClient
    .from('broadcast_notifications')
    .select('id, publish_at')
    .in('status', ['scheduled', 'published'])
    .gte('publish_at', new Date(startBoundary).toISOString())
    .lt('publish_at', endDate.toISOString());

  if (isStoreLimited && userId) {
    query = query.eq('created_by', userId);
  } else {
    // Optionally exclude store-owner broadcasts from the main company limit, 
    // or just let them overlap. We will let them be separate.
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const sameDayCount = (data ?? []).filter((entry) => entry.id !== currentId).length;
  if (sameDayCount >= BROADCAST_NOTIFICATION_LIMIT_PER_DAY) {
    throw new Error(
      isStoreLimited
        ? `You have reached your limit of ${BROADCAST_NOTIFICATION_LIMIT_PER_DAY} store notifications for today.`
        : `Only ${BROADCAST_NOTIFICATION_LIMIT_PER_DAY} company notifications can be scheduled or published on the same day (${targetDateKey}, ${COMMUNICATIONS_TIME_ZONE}).`
    );
  }
}

export async function enforceDailyEmployeeAnnouncementLimit(
  publishAtIso: string,
  currentId: string | undefined,
  userId: string,
) {
  const serviceClient = await createServiceClient();
  const targetDateKey = getCommunicationDateKey(publishAtIso);
  const startBoundary = `${targetDateKey}T00:00:00.000-04:00`;
  const endDate = new Date(`${targetDateKey}T00:00:00.000-04:00`);
  endDate.setDate(endDate.getDate() + 1);

  const { data, error } = await serviceClient
    .from('employee_announcements')
    .select('id, publish_at')
    .eq('created_by', userId)
    .in('status', ['scheduled', 'published'])
    .gte('publish_at', new Date(startBoundary).toISOString())
    .lt('publish_at', endDate.toISOString());

  if (error) {
    // In dev environments without the migration yet, allow the request to continue.
    if (error.message?.toLowerCase().includes('employee_announcements')) {
      return;
    }
    throw new Error(error.message);
  }

  const sameDayCount = (data ?? []).filter((entry) => entry.id !== currentId).length;
  if (sameDayCount >= 1) {
    throw new Error(
      `You have reached your limit of 1 employee announcement for today (${targetDateKey}, ${COMMUNICATIONS_TIME_ZONE}).`,
    );
  }
}

export async function runCommunicationsMaintenance() {
  const serviceClient = await createServiceClient();
  const nowIso = new Date().toISOString();
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const tenDaysAgoIso = tenDaysAgo.toISOString();

  // Auto-cleanup: delete notifications older than 10 days.
  const cleanupResult = await serviceClient.from('notifications').delete().lt('created_at', tenDaysAgoIso);
  // Ignore cleanup errors (e.g. migrations not applied yet in dev).
  void cleanupResult;

  const { data: expiredAnnouncements } = await serviceClient
    .from('company_announcements')
    .select('id')
    .lte('expires_at', nowIso);

  if (expiredAnnouncements && expiredAnnouncements.length > 0) {
    await serviceClient
      .from('company_announcements')
      .delete()
      .in(
        'id',
        expiredAnnouncements.map((item) => item.id),
      );
  }

  const { data: scheduledAnnouncements } = await serviceClient
    .from('company_announcements')
    .select('id')
    .eq('status', 'scheduled')
    .lte('publish_at', nowIso);

  if (scheduledAnnouncements && scheduledAnnouncements.length > 0) {
    await serviceClient
      .from('company_announcements')
      .update({ status: 'published', updated_at: nowIso })
      .in(
        'id',
        scheduledAnnouncements.map((item) => item.id),
      );
  }

  // Employee announcements: expire + publish scheduled (ignore if table not present yet).
  const { data: expiredEmployeeAnnouncements, error: expiredEmployeeError } = await serviceClient
    .from('employee_announcements')
    .select('id')
    .lte('expires_at', nowIso);

  if (!expiredEmployeeError && expiredEmployeeAnnouncements && expiredEmployeeAnnouncements.length > 0) {
    await serviceClient
      .from('employee_announcements')
      .delete()
      .in(
        'id',
        expiredEmployeeAnnouncements.map((item) => item.id),
      );
  }

  const { data: scheduledEmployeeAnnouncements, error: scheduledEmployeeError } = await serviceClient
    .from('employee_announcements')
    .select('id')
    .eq('status', 'scheduled')
    .lte('publish_at', nowIso);

  if (!scheduledEmployeeError && scheduledEmployeeAnnouncements && scheduledEmployeeAnnouncements.length > 0) {
    await serviceClient
      .from('employee_announcements')
      .update({ status: 'published', updated_at: nowIso })
      .in(
        'id',
        scheduledEmployeeAnnouncements.map((item) => item.id),
      );
  }

  const { data: pendingBroadcasts } = await serviceClient
    .from('broadcast_notifications')
    .select('id, title, message, created_by')
    .in('status', ['scheduled', 'published'])
    .lte('publish_at', nowIso)
    .is('sent_at', null);

  if (pendingBroadcasts && pendingBroadcasts.length > 0) {
    const { data: users } = await serviceClient.from('users').select('id, role');
    const allRecipients = (users ?? []).map((entry) => ({ id: entry.id, role: entry.role }));

    if (allRecipients.length > 0) {
      const notificationRows: Array<{
        user_id: string;
        title: string;
        message: string;
        type: 'system';
        sender_id?: string | null;
      }> = [];

      // Attach sender_id where possible, and skip recipients who muted that sender (employees only).
      for (const broadcast of pendingBroadcasts) {
        const senderId = broadcast.created_by ?? null;

        let mutedUserIds = new Set<string>();
        if (senderId) {
          const senderRole = allRecipients.find((entry) => entry.id === senderId)?.role ?? null;
          if (senderRole === 'employee') {
            const { data: mutes, error: mutesError } = await serviceClient
              .from('notification_mutes')
              .select('user_id')
              .eq('sender_id', senderId);
            if (!mutesError) {
              mutedUserIds = new Set((mutes ?? []).map((entry) => entry.user_id));
            }
          }
        }

        for (const recipient of allRecipients) {
          if (senderId && mutedUserIds.has(recipient.id)) {
            continue;
          }

          notificationRows.push({
            user_id: recipient.id,
            title: broadcast.title,
            message: broadcast.message,
            type: 'system' as const,
            sender_id: senderId,
          });
        }
      }

      const insertResult = await serviceClient.from('notifications').insert(notificationRows);
      // If the schema hasn't been migrated yet (missing sender_id), retry without it so the app still works.
      if (insertResult.error && insertResult.error.message?.toLowerCase().includes('sender_id')) {
        await serviceClient
          .from('notifications')
          .insert(notificationRows.map(({ sender_id: _senderId, ...rest }) => rest));
      }
    }

    await serviceClient
      .from('broadcast_notifications')
      .update({ status: 'published', sent_at: nowIso, updated_at: nowIso })
      .in(
        'id',
        pendingBroadcasts.map((item) => item.id),
      );
  }
}

export function normalizeAnnouncementRecord(
  record:
    | (Omit<CompanyAnnouncement, 'content'> & { content: unknown })
    | (Omit<EmployeeAnnouncement, 'content'> & { content: unknown }),
) {
  return {
    ...record,
    content: normalizeAnnouncementBlocks(record.content),
  } as CompanyAnnouncement;
}

export function normalizeBroadcastRecord(record: BroadcastNotification) {
  return record;
}
