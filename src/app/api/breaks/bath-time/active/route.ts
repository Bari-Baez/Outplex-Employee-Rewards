import { NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

/** GET /api/breaks/bath-time/active — supervisors see who is currently offline */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role, id')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'moderator_a1', 'moderator_b1'];
  if (!profile || !allowedRoles.includes(profile.role)) {
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
  const nowUtc = new Date().toISOString();

  // Get all open bath_time logs from today
  const todaySD = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }),
  ).toISOString().slice(0, 10);

  const query = service
    .from('time_logs_audit')
    .select(`
      id,
      employee_id,
      actual_start,
      employee:users!employee_id ( id, name, avatar_url, employee_id, supervisor, supervisor_id )
    `)
    .eq('event_type', 'bath_time')
    .eq('is_open', true)
    .gte('actual_start', `${todaySD}T00:00:00Z`);

  const { data: logs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    activeCount: (logs ?? []).length,
    logs: (logs ?? []).map((l) => ({
      log_id: l.id,
      employee: l.employee,
      actual_start: l.actual_start,
      duration_minutes: l.actual_start
        ? Math.floor((Date.now() - new Date(l.actual_start).getTime()) / 60_000)
        : 0,
    })),
  });
}
