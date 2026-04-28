import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/** GET /api/breaks/my-schedule — returns employee's schedule for today */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Today in Santo Domingo (UTC-4)
  const todaySD = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }),
  ).toISOString().slice(0, 10);

  const service = await createServiceClient();

  // Get published daily schedule for today
  const { data: schedule, error: schedError } = await service
    .from('daily_schedules')
    .select(`
      *,
      batch:schedule_upload_batches!batch_id ( status )
    `)
    .eq('employee_id', user.id)
    .eq('schedule_date', todaySD)
    .maybeSingle();

  if (schedError) {
    return NextResponse.json({ error: schedError.message }, { status: 500 });
  }

  // Only return if the batch is published (employees don't see drafts)
  if (!schedule || (schedule.batch as { status: string } | null)?.status !== 'published') {
    return NextResponse.json({ schedule: null, logs: [] });
  }

  // Get today's time logs
  const { data: logs } = await service
    .from('time_logs_audit')
    .select('*')
    .eq('employee_id', user.id)
    .eq('daily_schedule_id', schedule.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ schedule, logs: logs ?? [] });
}
