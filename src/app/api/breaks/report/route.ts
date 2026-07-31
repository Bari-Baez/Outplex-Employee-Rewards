import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@backend/platform/supabase/server';
import { addMinutesToTime, computeVarianceMinutes, BREAK_DURATION_MINUTES } from '@backend/modules/breaks/domain/schedule';
import type { BreakEventType, DelayReason } from '@shared/contracts/database';

/** POST /api/breaks/report — employee logs the start of a break */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    daily_schedule_id: string;
    event_type: BreakEventType;
    delay_reason?: DelayReason | null;
  };

  const { daily_schedule_id, event_type, delay_reason } = body;
  if (!daily_schedule_id || !event_type) {
    return NextResponse.json({ error: 'daily_schedule_id and event_type are required' }, { status: 400 });
  }

  const service = await createServiceClient();

  // 1. Verify the schedule belongs to this employee and is published
  const { data: schedule } = await service
    .from('daily_schedules')
    .select(`*, batch:schedule_upload_batches!batch_id ( status )`)
    .eq('id', daily_schedule_id)
    .eq('employee_id', user.id)
    .maybeSingle();

  if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  if ((schedule.batch as { status: string } | null)?.status !== 'published') {
    return NextResponse.json({ error: 'Schedule is not yet published' }, { status: 403 });
  }

  // 2. Check for already open break of same type (prevent double-logging)
  const { data: openLog } = await service
    .from('time_logs_audit')
    .select('id')
    .eq('employee_id', user.id)
    .eq('daily_schedule_id', daily_schedule_id)
    .eq('event_type', event_type)
    .eq('is_open', true)
    .maybeSingle();

  if (openLog) {
    return NextResponse.json({ error: 'You already have an open break of this type' }, { status: 409 });
  }

  // 3. Get scheduled time for this event
  const scheduleFieldMap: Record<BreakEventType, string> = {
    first_break:  'first_break_start',
    lunch:        'lunch_start',
    second_break: 'second_break_start',
    third_break:  'third_break_start',
    bath_time:    '', // no scheduled time
  };
  const scheduledTimeField = scheduleFieldMap[event_type];
  const scheduledStart = scheduledTimeField ? (schedule[scheduledTimeField] as string | null) : null;

  // 4. Server-side timestamp (DO NOT trust client clock)
  const actualStartUtc = new Date().toISOString();

  // 5. Compute variance if there's a scheduled time
  let varianceMinutes: number | null = null;
  if (scheduledStart && event_type !== 'bath_time') {
    varianceMinutes = computeVarianceMinutes(
      scheduledStart,
      actualStartUtc,
      schedule.schedule_date as string,
    );
  }

  // 6. Enforce mandatory delay reason if late (> 5 mins)
  if (varianceMinutes !== null && varianceMinutes > 5 && !delay_reason) {
    return NextResponse.json(
      {
        requiresReason: true,
        varianceMinutes,
        message: `You are ${Math.round(varianceMinutes)} minute(s) late. Please select a reason before confirming.`,
      },
      { status: 422 },
    );
  }

  // 7. Insert the log
  const { data: log, error: insertError } = await service
    .from('time_logs_audit')
    .insert({
      daily_schedule_id,
      employee_id: user.id,
      event_type,
      scheduled_start: scheduledStart ?? null,
      actual_start: actualStartUtc,
      variance_minutes: varianceMinutes,
      delay_reason: delay_reason ?? null,
      is_open: true,
      is_unpaid: event_type === 'bath_time',
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    log,
    varianceMinutes,
    scheduledEnd: scheduledStart ? addMinutesToTime(scheduledStart, BREAK_DURATION_MINUTES[event_type] ?? 0) : null,
  });
}
