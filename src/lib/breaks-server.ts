import { createServiceClient } from '@/lib/supabase/server';
import { 
  ParsedCsvRow, 
  normalizeName, 
  findBestUserMatch, 
  buildDailySchedulePayload 
} from '@/lib/breaks';
import { PendingReviewAgent } from '@/types/database';

type DailyScheduleInsert = ReturnType<typeof buildDailySchedulePayload>;

function toPendingReviewRow(row: ParsedCsvRow): Record<string, unknown> {
  return { ...row };
}

function toParsedCsvRow(rowData: Record<string, unknown>): ParsedCsvRow {
  return {
    schedule_date: String(rowData.schedule_date ?? ''),
    day_name: String(rowData.day_name ?? ''),
    aws_id: String(rowData.aws_id ?? ''),
    opx_id: String(rowData.opx_id ?? ''),
    lob: String(rowData.lob ?? ''),
    agent_name: String(rowData.agent_name ?? ''),
    shift_start: String(rowData.shift_start ?? ''),
    shift_end: String(rowData.shift_end ?? ''),
    shift_length: Number(rowData.shift_length ?? 0),
    first_break: typeof rowData.first_break === 'string' ? rowData.first_break : null,
    lunch: typeof rowData.lunch === 'string' ? rowData.lunch : null,
    second_break: typeof rowData.second_break === 'string' ? rowData.second_break : null,
    third_break: typeof rowData.third_break === 'string' ? rowData.third_break : null,
    supervisor: String(rowData.supervisor ?? ''),
  };
}

/**
 * High-level helper to create a batch and all its schedule rows in Supabase.
 * Handles employee matching, OT detection, and chunked inserts.
 * 
 * IMPORTANT: This function MUST be called in Server Components or API Routes.
 */
export async function createScheduleBatchAndSchedules(params: {
  parsedRows: ParsedCsvRow[];
  uploadedBy: string;
  sourceType: 'csv' | 'manual' | 'live';
  fileHash: string;
  forceReplace?: boolean;
}) {
  const { parsedRows, uploadedBy, sourceType, fileHash, forceReplace } = params;
  const service = await createServiceClient();

  const scheduleDate = parsedRows[0]?.schedule_date;
  if (!scheduleDate) throw new Error('No schedule date found in data');

  // 1. Initial duplicates check (only if not forcing)
  if (!forceReplace) {
    const { data: existing } = await service
      .from('schedule_upload_batches')
      .select('id')
      .eq('file_hash', fileHash)
      .maybeSingle();
    if (existing) throw new Error('DUPLICATE_FILE');
  }

  // 2. Load dependencies for matching
  const [employeesRes, otSlotsRes] = await Promise.all([
    service
      .from('users')
      .select('id, name, employee_id, department, supervisor, supervisor_id')
      .eq('role', 'employee')
      .eq('is_approved', true),
    service
      .from('ot_slots')
      .select('claimed_by')
      .eq('date', scheduleDate)
      .eq('status', 'claimed')
  ]);

  if (employeesRes.error || !employeesRes.data) throw new Error('Failed to load employees');
  const employees = employeesRes.data;
  const otEmployeeIds = new Set((otSlotsRes.data ?? []).map((s) => s.claimed_by).filter(Boolean));

  // 3. Match Rows
  const matched: Array<{ parsedRow: ParsedCsvRow; userId: string; isOt: boolean }> = [];
  const pendingReview: PendingReviewAgent[] = [];

  for (const row of parsedRows) {
    // Exact or email-prefix match
    let matchedEmployee = employees.find(
      (e) => e.name && row.aws_id && normalizeName(e.name).includes(normalizeName(row.aws_id.split('@')[0]))
    ) ?? null;

    if (!matchedEmployee) {
      const result = findBestUserMatch(row.agent_name, employees);
      matchedEmployee = result?.user ?? null;
    }

    if (!matchedEmployee) {
      pendingReview.push({ rawName: row.agent_name, rowData: toPendingReviewRow(row) });
      continue;
    }

    matched.push({ 
      parsedRow: row, 
      userId: matchedEmployee.id, 
      isOt: otEmployeeIds.has(matchedEmployee.id) 
    });
  }

  // 4. Cleanup if replace
  if (forceReplace) {
    await service.from('schedule_upload_batches').delete().eq('file_hash', fileHash);
  }

  // 5. Create Batch
  const dateObj = new Date(`${scheduleDate}T12:00:00`);
  const formattedDate = dateObj.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  const batchName = `${sourceType === 'live' ? 'AutoSync' : 'NYT Breaks'} — ${formattedDate}`;
  const { data: batch, error: batchError } = await service
    .from('schedule_upload_batches')
    .insert({
      name: batchName,
      schedule_date: scheduleDate,
      source_type: sourceType,
      status: 'draft',
      uploaded_by: uploadedBy,
      file_hash: fileHash,
      employee_count: matched.length,
      pending_review: pendingReview,
    })
    .select()
    .single();

  if (batchError || !batch) throw new Error(`Batch creation failed: ${batchError?.message}`);

  // 6. Deduplicate and Insert Schedules
  // ON CONFLICT DO UPDATE fails if multiple rows in the same command point to the same key.
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const scheduleRowsRaw = matched.map(({ parsedRow, userId, isOt }) => {
    const emp = employeeMap.get(userId)!;
    return buildDailySchedulePayload(parsedRow, emp, batch.id, isOt);
  });

  // Keep only one row per employee (the last one encountered)
  const deduplicatedRows = Array.from(
    scheduleRowsRaw.reduce((map, row) => {
      map.set(row.employee_id, row);
      return map;
    }, new Map<string, DailyScheduleInsert>()).values()
  );

  for (let i = 0; i < deduplicatedRows.length; i += 100) {
    const chunk = deduplicatedRows.slice(i, i + 100);
    const { error: insertError } = await service
      .from('daily_schedules')
      .upsert(chunk, { onConflict: 'employee_id,schedule_date' });
    
    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
  }

  return {
    batchId: batch.id,
    batchName,
    scheduleDate,
    matchedCount: matched.length,
    pendingReview,
  };
}

/**
 * Manually links a pending agent from a batch to a registered employee.
 */
export async function manuallyMatchAgent(params: {
  batchId: string;
  rawName: string;
  userId: string;
}) {
  const { batchId, rawName, userId } = params;
  const service = await createServiceClient();

  // 1. Fetch batch and target user
  const [{ data: batch }, { data: user }, { data: otSlot }] = await Promise.all([
    service.from('schedule_upload_batches').select('id, name, schedule_date, status, uploaded_by, file_hash, employee_count, pending_review').eq('id', batchId).single(),
    service.from('users').select('id, name, employee_id, department, supervisor, supervisor_id').eq('id', userId).single(),
    service.from('ot_slots').select('id').eq('claimed_by', userId).eq('status', 'claimed').maybeSingle()
  ]);

  if (!batch || !user) throw new Error('Batch or User not found');

  // 2. Find agent data in pending_review
  const pending = (batch.pending_review || []) as PendingReviewAgent[];
  const agentIndex = pending.findIndex((p) => p.rawName === rawName);
  if (agentIndex === -1) throw new Error(`Agent "${rawName}" not found in pending review list`);

  const agentData = pending[agentIndex];
  const isOt = !!otSlot;

  // 3. Create schedule record
  const payload = buildDailySchedulePayload(
    toParsedCsvRow(agentData.rowData),
    user,
    batchId,
    isOt
  );

  const { error: insertErr } = await service
    .from('daily_schedules')
    .upsert(payload, { onConflict: 'employee_id,schedule_date' });

  if (insertErr) throw new Error(`Failed to insert schedule: ${insertErr.message}`);

  // 4. Update batch
  const updatedPending = [...pending];
  updatedPending.splice(agentIndex, 1);

  const { error: batchErr } = await service
    .from('schedule_upload_batches')
    .update({
      pending_review: updatedPending,
      employee_count: (batch.employee_count || 0) + 1
    })
    .eq('id', batchId);

  if (batchErr) throw new Error(`Failed to update batch: ${batchErr.message}`);

  return { success: true };
}
