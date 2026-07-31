import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@backend/platform/supabase/server';
import ExcelJS from 'exceljs';
import type { ScheduleVarianceRow } from '@shared/contracts/database';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

/** GET /api/breaks/report/export — generates Excel file with formula cells */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role, supervisor_id')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'moderator_a1', 'moderator_b1'];
  if (!profile || !allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const lob = searchParams.get('lob');

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

  // Build query
  let query = service.from('v_schedule_variance').select('*');
  if (dateFrom) query = query.gte('schedule_date', dateFrom);
  if (dateTo)   query = query.lte('schedule_date', dateTo);
  if (lob)      query = query.eq('lob', lob);
  // moderator_b1 only sees their own team
  if (profile.role === 'moderator_b1') {
    query = query.eq('supervisor_id', user.id);
  }
  query = query.order('schedule_date', { ascending: false }).order('employee_name', { ascending: true });

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const varianceRows = (rows ?? []) as ScheduleVarianceRow[];

  // ── Build Excel workbook ──────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Outplex NYT Workforce';
  workbook.created = new Date();

  // Sheet 1: Full Variance Data
  const sheet1 = workbook.addWorksheet('Variance Report', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });

  sheet1.columns = [
    { header: 'Employee',     key: 'employee_name', width: 22 },
    { header: 'OPX ID',       key: 'opx_id',        width: 10 },
    { header: 'LOB',          key: 'lob',            width: 20 },
    { header: 'Supervisor',   key: 'supervisor_name', width: 20 },
    { header: 'Date',         key: 'schedule_date',  width: 12 },
    { header: 'Hour Type',    key: 'hour_type',      width: 12 },
    { header: 'Event',        key: 'event_type',     width: 14 },
    { header: 'Scheduled',    key: 'scheduled_start', width: 12 },
    { header: 'Actual',       key: 'actual_start_local', width: 14 },
    { header: 'Variance (min)', key: 'variance_col', width: 16 }, // formula column
    { header: 'Reason',       key: 'delay_reason',   width: 18 },
    { header: 'Unpaid?',      key: 'is_unpaid',      width: 10 },
  ];

  // Header row styling
  const headerRow = sheet1.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
  headerRow.height = 20;

  // Event type display labels
  const eventLabels: Record<string, string> = {
    first_break: '1st Break',
    lunch: 'Lunch',
    second_break: '2nd Break',
    third_break: '3rd Break',
    bath_time: 'Bath Time',
  };

  const reasonLabels: Record<string, string> = {
    due_a_call: 'Due a Call',
    due_a_meeting: 'Due a Meeting',
    other: 'Other',
  };

  varianceRows.forEach((row, i) => {
    const rowIndex = i + 2; // 1-indexed, row 1 = headers

    const excelRow = sheet1.addRow({
      employee_name: row.employee_name,
      opx_id:        row.opx_id ?? '',
      lob:           row.lob ?? '',
      supervisor_name: row.supervisor_name ?? '',
      schedule_date: row.schedule_date,
      hour_type:     row.hour_type === 'ot' ? 'OT Hours' : 'Regular Hours',
      event_type:    eventLabels[row.event_type] ?? row.event_type,
      scheduled_start: row.scheduled_start ?? '',
      actual_start_local: row.actual_start_local
        ? new Date(row.actual_start_local).toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true,
          })
        : 'Not Reported',
      delay_reason:  row.delay_reason ? (reasonLabels[row.delay_reason] ?? row.delay_reason) : '—',
      is_unpaid:     row.is_unpaid ? 'Yes' : 'No',
    });

    // Column J: variance formula (J = Actual - Scheduled, displayed as number)
    // We store variance_minutes directly from DB (computed server-side)
    excelRow.getCell('J').value = row.variance_minutes ?? 0;
    excelRow.getCell('J').numFmt = '+0.00;-0.00;0.00';

    // Color code variance: red if > 5min late, green if on time or early
    if (row.variance_minutes !== null) {
      excelRow.getCell('J').font = {
        color: { argb: row.variance_minutes > 5 ? 'FFDC2626' : row.variance_minutes <= 0 ? 'FF16A34A' : 'FFCA8A04' },
        bold: true,
      };
    }

    // Color rows alternately
    if (i % 2 === 0) {
      excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8FF' } };
    }

    // OT rows get a light highlight
    if (row.hour_type === 'ot') {
      excelRow.getCell('F').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    }
  });

  // Auto-filter
  sheet1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };

  // Sheet 2: Summary by Employee
  const sheet2 = workbook.addWorksheet('Employee Summary');
  sheet2.columns = [
    { header: 'Employee',        key: 'name',          width: 22 },
    { header: 'LOB',             key: 'lob',           width: 20 },
    { header: 'Supervisor',      key: 'supervisor',    width: 20 },
    { header: 'Events Reported', key: 'count',         width: 16 },
    { header: 'Avg Variance (min)', key: 'avg_var',    width: 18 },
    { header: 'Max Late (min)',  key: 'max_var',        width: 16 },
    { header: 'Regular Hours',  key: 'regular_hrs',    width: 14 },
    { header: 'OT Hours',       key: 'ot_hrs',         width: 10 },
  ];

  const headerRow2 = sheet2.getRow(1);
  headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };

  // Group by employee
  const byEmployee = new Map<string, {
    name: string; lob: string; supervisor: string;
    count: number; totalVar: number; maxVar: number;
    regularHrs: number; otHrs: number;
  }>();

  for (const row of varianceRows) {
    const existing = byEmployee.get(row.employee_id) ?? {
      name: row.employee_name, lob: row.lob ?? '', supervisor: row.supervisor_name ?? '',
      count: 0, totalVar: 0, maxVar: 0, regularHrs: 0, otHrs: 0,
    };
    existing.count++;
    existing.totalVar += row.variance_minutes ?? 0;
    existing.maxVar = Math.max(existing.maxVar, row.variance_minutes ?? 0);
    byEmployee.set(row.employee_id, existing);
  }

  [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((emp, i) => {
    const rowIndex = i + 2;
    sheet2.addRow({
      name: emp.name,
      lob: emp.lob,
      supervisor: emp.supervisor,
      count: emp.count,
      avg_var: emp.count ? Math.round((emp.totalVar / emp.count) * 100) / 100 : 0,
      max_var: emp.maxVar,
      regular_hrs: emp.regularHrs,
      ot_hrs: emp.otHrs,
    });
    // Average variance formula for auditability
    sheet2.getCell(`E${rowIndex}`).numFmt = '+0.00;-0.00;0.00';
    sheet2.getCell(`F${rowIndex}`).numFmt = '+0.00;-0.00;0.00';
    if (i % 2 === 0) {
      sheet2.getRow(rowIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8FF' } };
    }
  });

  sheet2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  // ── Output ────────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `NYT_Breaks_Report_${dateFrom ?? 'all'}_to_${dateTo ?? 'all'}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
