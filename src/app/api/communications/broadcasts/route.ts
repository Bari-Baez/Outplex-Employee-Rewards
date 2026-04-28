import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import {
  enforceDailyBroadcastLimit,
  normalizeBroadcastCategory,
  normalizeScheduledAt,
  requireModerator,
  resolveBroadcastStatus,
  runCommunicationsMaintenance,
} from '@/lib/communications-server';

interface BroadcastPayload {
  title?: string;
  message?: string;
  category?: string;
  action?: 'draft' | 'scheduled' | 'published';
  publishAt?: string | null;
}

export async function POST(req: Request) {
  try {
    const auth = await requireModerator();
    if (auth.error) {
      return auth.error;
    }

    const payload = (await req.json()) as BroadcastPayload;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    const status = resolveBroadcastStatus(payload.action);
    const publishAt =
      status === 'draft' ? null : status === 'scheduled' ? normalizeScheduledAt(payload.publishAt) : new Date().toISOString();

    if (!title) {
      return NextResponse.json({ error: 'Notification title is required.' }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: 'Notification message is required.' }, { status: 400 });
    }

    if (status === 'scheduled' && !publishAt) {
      return NextResponse.json({ error: 'Please choose a valid publish date and time.' }, { status: 400 });
    }

    const isStoreLimited = auth.hasStore && !['moderator', 'moderator_a1', 'admin'].includes(auth.profile.role);

    // Only store owners are limited. IT/moderators can publish as many broadcasts as they need.
    if (isStoreLimited && publishAt) {
      await enforceDailyBroadcastLimit(publishAt, undefined, auth.profile.id, true);
    }

    const serviceClient = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'communications',
      sectionKey: 'notifications',
      userRole: auth.profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }
    const nowIso = new Date().toISOString();
    const { data, error } = await serviceClient
      .from('broadcast_notifications')
      .insert({
        title,
        message,
        category: normalizeBroadcastCategory(payload.category),
        status,
        publish_at: publishAt,
        created_by: auth.profile.id,
        updated_by: auth.profile.id,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to save the notification.' }, { status: 500 });
    }

    await runCommunicationsMaintenance();

    return NextResponse.json({ broadcast: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save the notification.' },
      { status: 500 },
    );
  }
}
