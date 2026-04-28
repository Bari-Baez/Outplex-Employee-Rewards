import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeAnnouncementBlocks } from '@/lib/communications';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import {
  buildAnnouncementExpiry,
  normalizeAnnouncementDuration,
  normalizeScheduledAt,
  requireModerator,
  resolveAnnouncementStatus,
  runCommunicationsMaintenance,
} from '@/lib/communications-server';

interface AnnouncementPayload {
  title?: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  content?: unknown;
  durationDays?: number;
  action?: 'draft' | 'scheduled' | 'published';
  publishAt?: string | null;
}

export async function POST(req: Request) {
  try {
    const auth = await requireModerator();
    if (auth.error) {
      return auth.error;
    }

    if (auth.hasStore && !['moderator', 'moderator_a1', 'admin'].includes(auth.profile.role)) {
      return NextResponse.json({ error: 'Store owners cannot create company announcements.' }, { status: 403 });
    }

    const payload = (await req.json()) as AnnouncementPayload;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const excerpt = typeof payload.excerpt === 'string' ? payload.excerpt.trim() : '';
    const coverImageUrl = typeof payload.coverImageUrl === 'string' ? payload.coverImageUrl.trim() : '';
    const content = normalizeAnnouncementBlocks(payload.content);
    const durationDays = normalizeAnnouncementDuration(payload.durationDays);
    const status = resolveAnnouncementStatus(payload.action);
    const publishAt =
      status === 'draft' ? null : status === 'scheduled' ? normalizeScheduledAt(payload.publishAt) : new Date().toISOString();

    if (!title) {
      return NextResponse.json({ error: 'Announcement title is required.' }, { status: 400 });
    }

    if (status !== 'draft' && !coverImageUrl) {
      return NextResponse.json({ error: 'A cover image is required before publishing.' }, { status: 400 });
    }

    if (status !== 'draft' && content.length === 0) {
      return NextResponse.json({ error: 'Add at least one content block before publishing.' }, { status: 400 });
    }

    if (status === 'scheduled' && !publishAt) {
      return NextResponse.json({ error: 'Please choose a valid publish date and time.' }, { status: 400 });
    }

    const expiresAt = publishAt ? buildAnnouncementExpiry(publishAt, durationDays) : null;
    const serviceClient = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'communications',
      sectionKey: 'announcements',
      userRole: auth.profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }
    const nowIso = new Date().toISOString();
    const { data, error } = await serviceClient
      .from('company_announcements')
      .insert({
        title,
        excerpt: excerpt || null,
        cover_image_url: coverImageUrl || null,
        content,
        duration_days: durationDays,
        status,
        publish_at: publishAt,
        expires_at: expiresAt,
        created_by: auth.profile.id,
        updated_by: auth.profile.id,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to save the announcement.' }, { status: 500 });
    }

    await runCommunicationsMaintenance();

    return NextResponse.json({ announcement: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save the announcement.' },
      { status: 500 },
    );
  }
}
