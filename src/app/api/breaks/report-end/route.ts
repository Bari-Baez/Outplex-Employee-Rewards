import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';

/** POST /api/breaks/report-end — employee ends an active break */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { log_id } = await req.json() as { log_id: string };
  if (!log_id) return NextResponse.json({ error: 'log_id is required' }, { status: 400 });

  const service = await createServiceClient();

  // Verify ownership and that it's open
  const { data: log } = await service
    .from('time_logs_audit')
    .select('id, employee_id, is_open')
    .eq('id', log_id)
    .maybeSingle();

  if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  if (log.employee_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!log.is_open) return NextResponse.json({ error: 'Break is already ended' }, { status: 409 });

  const actualEndUtc = new Date().toISOString();

  const { error } = await service
    .from('time_logs_audit')
    .update({ actual_end: actualEndUtc, is_open: false })
    .eq('id', log_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, actual_end: actualEndUtc });
}
