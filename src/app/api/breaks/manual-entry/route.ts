import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { addMinutesToTime } from '@/lib/breaks';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

/** POST /api/breaks/manual-entry — moderator creates a daily schedule manually */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['moderator_a1', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as {
    scheduleDate: string;
    employeeId: string;
    shiftIn?: string;
    shiftOut?: string;
    firstBreak?: string;
    lunch?: string;
    secondBreak?: string;
    thirdBreak?: string | null;
  };

  const { scheduleDate, employeeId, shiftIn, shiftOut, firstBreak, lunch, secondBreak, thirdBreak } = body;
  if (!scheduleDate || !employeeId) {
    return NextResponse.json({ error: 'scheduleDate and employeeId are required' }, { status: 400 });
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

  // Get employee info
  const { data: emp } = await service
    .from('users')
    .select('id, department, supervisor, supervisor_id')
    .eq('id', employeeId)
    .single();

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // Check for OT day
  const { data: otSlot } = await service
    .from('ot_slots')
    .select('id')
    .eq('date', scheduleDate)
    .eq('claimed_by', employeeId)
    .eq('status', 'claimed')
    .maybeSingle();

  const isOtDay = !!otSlot;

  // Create a manual batch if none exists for this date/manual source
  const batchName = `Manual — ${new Date(`${scheduleDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
  let batchId: string;

  const { data: existingBatch } = await service
    .from('schedule_upload_batches')
    .select('id')
    .eq('schedule_date', scheduleDate)
    .eq('source_type', 'manual')
    .eq('status', 'published')
    .maybeSingle();

  if (existingBatch) {
    batchId = existingBatch.id;
  } else {
    const { data: newBatch, error: batchErr } = await service
      .from('schedule_upload_batches')
      .insert({
        name: batchName,
        schedule_date: scheduleDate,
        source_type: 'manual',
        status: 'published',
        published_at: new Date().toISOString(),
        uploaded_by: user.id,
        employee_count: 0,
      })
      .select('id')
      .single();

    if (batchErr || !newBatch) return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 });
    batchId = newBatch.id;
  }

  const { error: insertErr } = await service.from('daily_schedules').upsert(
    {
      batch_id: batchId,
      employee_id: employeeId,
      schedule_date: scheduleDate,
      shift_start: shiftIn || null,
      shift_end: shiftOut || null,
      first_break_start: firstBreak || null,
      first_break_end: firstBreak ? addMinutesToTime(firstBreak, 15) : null,
      lunch_start: lunch || null,
      lunch_end: lunch ? addMinutesToTime(lunch, 30) : null,
      second_break_start: secondBreak || null,
      second_break_end: secondBreak ? addMinutesToTime(secondBreak, 15) : null,
      third_break_start: thirdBreak || null,
      third_break_end: thirdBreak ? addMinutesToTime(thirdBreak, 15) : null,
      is_ot_day: isOtDay,
      hour_type: isOtDay ? 'ot' : 'regular',
      lob: emp.department ?? null,
      supervisor_name: emp.supervisor ?? null,
      supervisor_id: emp.supervisor_id ?? null,
    },
    { onConflict: 'employee_id,schedule_date' },
  );

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Update batch employee count
  try {
    await service.rpc('increment_batch_employee_count' as never, { batch_id: batchId } as never);
  } catch (e) {
    console.error("Failed to increment batch count:", e);
  }

  return NextResponse.json({ success: true });
}
