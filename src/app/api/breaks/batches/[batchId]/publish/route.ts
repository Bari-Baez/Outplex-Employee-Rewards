import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

// ─── POST /api/breaks/batches/[batchId]/publish ───────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['moderator_a1', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'breaks_manager',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  const body = await req.json().catch(() => ({})) as { action?: string; schedule_at?: string };
  const action = body.action ?? 'publish'; // 'publish' | 'schedule' | 'delete'

  if (action === 'delete') {
    const { error } = await service
      .from('schedule_upload_batches')
      .delete()
      .eq('id', batchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'schedule') {
    if (!body.schedule_at) {
      return NextResponse.json({ error: 'schedule_at is required' }, { status: 400 });
    }
    const { error } = await service
      .from('schedule_upload_batches')
      .update({ status: 'scheduled', scheduled_publish_at: body.schedule_at })
      .eq('id', batchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Default: publish immediately
  const { error } = await service
    .from('schedule_upload_batches')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', batchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // TODO: send push notifications to affected employees
  return NextResponse.json({ success: true });
}
