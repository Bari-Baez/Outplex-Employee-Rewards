import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeAnnouncementBlocks } from '@/lib/communications';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import {
  buildAnnouncementExpiry,
  enforceDailyEmployeeAnnouncementLimit,
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ announcementId: string }> },
) {
  try {
    const auth = await requireModerator();
    if (auth.error) {
      return auth.error;
    }

    const isStoreLimited = auth.hasStore && !['moderator', 'moderator_a1', 'admin'].includes(auth.profile.role);
    if (!isStoreLimited) {
      return NextResponse.json({ error: 'Only store owners can update employee announcements.' }, { status: 403 });
    }

    const { announcementId } = await params;
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

    if (publishAt && status !== 'draft') {
      await enforceDailyEmployeeAnnouncementLimit(publishAt, announcementId, auth.profile.id);
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
    const { data, error } = await serviceClient
      .from('employee_announcements')
      .update({
        title,
        excerpt: excerpt || null,
        cover_image_url: coverImageUrl || null,
        content,
        duration_days: durationDays,
        status,
        publish_at: publishAt,
        expires_at: expiresAt,
        updated_by: auth.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', announcementId)
      .eq('created_by', auth.profile.id)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to update the announcement.' }, { status: 500 });
    }

    await runCommunicationsMaintenance();

    return NextResponse.json({ announcement: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update the announcement.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ announcementId: string }> },
) {
  try {
    const auth = await requireModerator();
    if (auth.error) {
      return auth.error;
    }

    const isStoreLimited = auth.hasStore && !['moderator', 'moderator_a1', 'admin'].includes(auth.profile.role);
    if (!isStoreLimited) {
      return NextResponse.json({ error: 'Only store owners can delete employee announcements.' }, { status: 403 });
    }

    const { announcementId } = await params;
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
    const { error } = await serviceClient
      .from('employee_announcements')
      .delete()
      .eq('id', announcementId)
      .eq('created_by', auth.profile.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete the announcement.' },
      { status: 500 },
    );
  }
}
