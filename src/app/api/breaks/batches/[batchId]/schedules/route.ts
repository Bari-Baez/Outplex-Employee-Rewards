import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

/**
 * GET /api/breaks/batches/[batchId]/schedules
 * Fetch all schedules for a specific batch, joined with employee info.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'moderator_a1', 'moderator_b1'].includes(profile.role)) {
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

  const { data, error } = await service
    .from('daily_schedules')
    .select(`
      *,
      employee:users!daily_schedules_employee_id_fkey(id, name, employee_id, avatar_url)
    `)
    .eq('batch_id', batchId)
    .order('shift_start', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * PATCH /api/breaks/batches/[batchId]/schedules
 * Bulk update multiple schedule rows.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params;
  const { updates } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'moderator_a1'].includes(profile.role)) {
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

  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: 'Updates must be an array' }, { status: 400 });
  }

  // Ensure all updates belong to this batch
  const cleanedUpdates = updates.map(u => ({ ...u, batch_id: batchId }));

  const { data, error } = await service
    .from('daily_schedules')
    .upsert(cleanedUpdates, { onConflict: 'employee_id,schedule_date' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, success: true });
}
