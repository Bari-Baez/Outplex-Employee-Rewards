import ExcelJS from 'exceljs';
import type { OTSlot } from '@/types/database';

// ── ARGB color palette ─────────────────────────────────────────────────────
const B: Record<string, string> = {
  hDark:  'FF1E1B4B',  // deep indigo — title rows
  hMid:   'FF312E81',  // medium indigo — section headers
  hCol:   'FF4338CA',  // bright indigo — column headers
  rowAlt: 'FFF5F3FF',  // very light lavender — alternating data rows
  totals: 'FFEDE9FE',  // light purple — totals / KPI cells
  white:  'FFFFFFFF',
  textDk: 'FF111827',
  textLt: 'FF6B7280',
  border: 'FFE0E7FF',

  // Claim/Time status chip colors
  upcomingBg: 'FFFFFBEB', upcomingTx: 'FF92400E',   // yellow
  presentBg:  'FFF0FDF4', presentTx:  'FF14532D',   // green
  unclaimedBg:'FFFFF7ED', unclaimedTx:'FF9A3412',   // orange
  claimedBg:  'FFE0F2FE', claimedTx:  'FF0369A1',   // cyan/blue
  cancelledBg:'FFFEF2F2', cancelledTx:'FFB91C1C',   // red

  // Row tints for display status
  rowUpcoming:  'FFFFFDE8',
  rowPresent:   'FFF0FDF4',
  rowUnclaimed: 'FFFEF9EC',
  rowClaimed:   'FFF0F9FF',
  rowCancelled: 'FFFEF2F2',
};

// ── Public types ────────────────────────────────────────────────────────────
export interface OTExcelUser {
  id: string;
  name: string;
  email: string | null;
  employee_id: string | null;
  supervisor: string | null;
  supervisor_id?: string | null;
}

export interface OTExcelMeta {
  dateFrom: string;
  dateTo: string;
  filterLabel: string;
  generatedBy: string;
  generatedAt: string;
}

// ── Internal rich slot (with joined fields) ────────────────────────────────
type RichSlot = OTSlot & {
  claimedByUser?: { name?: string; employee_id?: string; id?: string };
  batch?: { name?: string; id?: string };
};

type DisplayStatus = 'Upcoming' | 'Present' | 'Unclaimed' | 'Claimed' | 'Cancelled';
type ClaimStatus   = 'Claimed' | 'Unclaimed' | 'Cancelled';
type TimeStatus    = 'Upcoming' | 'Present' | 'Passed';

// ── Aggregation interfaces ─────────────────────────────────────────────────
interface SlotAgg {
  claimed: number; unclaimed: number; upcoming: number; present: number; cancelled: number;
  totalSlots: number; totalHours: number;
}
interface EmpAgg extends SlotAgg {
  name: string; empId: string; email: string; supervisor: string; lob: string;
}
interface LobAgg   extends SlotAgg { lob: string; }
interface DateAgg  extends SlotAgg { date: string; day: string; }
interface ShiftAgg extends SlotAgg { shift: string; }
interface Totals {
  slots: number; hours: number; employees: number;
  claimed: number; unclaimed: number; upcoming: number; present: number; cancelled: number;
}
interface AggResult {
  byEmp: EmpAgg[]; byLob: LobAgg[]; byDate: DateAgg[]; byShift: ShiftAgg[];
  totals: Totals;
  topEmp: string; topLob: string; peakDate: string;
}

// ── Status computations ────────────────────────────────────────────────────
function computeClaimStatus(status: string): ClaimStatus {
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'claimed')   return 'Claimed';
  return 'Unclaimed';
}

function computeTimeStatus(slot: OTSlot, now: Date): TimeStatus {
  const today = now.toISOString().slice(0, 10);
  if (slot.date > today) return 'Upcoming';
  if (slot.date < today) return 'Passed';
  // Same day — compare HH:mm strings directly
  const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const start   = String(slot.start_time).slice(0, 5);
  const end     = String(slot.end_time).slice(0, 5);
  if (nowHHmm < start) return 'Upcoming';
  if (nowHHmm <= end)  return 'Present';
  return 'Passed';
}

function computeDisplayStatus(slot: OTSlot, now: Date): DisplayStatus {
  if (slot.status === 'cancelled') return 'Cancelled';
  if (slot.status === 'claimed')   return 'Claimed';
  const ts = computeTimeStatus(slot, now);
  if (ts === 'Upcoming') return 'Upcoming';
  if (ts === 'Present')  return 'Present';
  return 'Unclaimed';
}

function displayChip(ds: DisplayStatus): { bg: string; tx: string } {
  switch (ds) {
    case 'Upcoming':  return { bg: B.upcomingBg,  tx: B.upcomingTx  };
    case 'Present':   return { bg: B.presentBg,   tx: B.presentTx   };
    case 'Unclaimed': return { bg: B.unclaimedBg, tx: B.unclaimedTx };
    case 'Claimed':   return { bg: B.claimedBg,   tx: B.claimedTx   };
    case 'Cancelled': return { bg: B.cancelledBg, tx: B.cancelledTx };
  }
}

function displayRowTint(ds: DisplayStatus): string {
  switch (ds) {
    case 'Upcoming':  return B.rowUpcoming;
    case 'Present':   return B.rowPresent;
    case 'Unclaimed': return B.rowUnclaimed;
    case 'Claimed':   return B.rowClaimed;
    case 'Cancelled': return B.rowCancelled;
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────
function dow(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}
function fmtTime(t: string): string {
  const [h, m] = String(t).split(':').map(Number);
  return `${(h || 0) % 12 || 12}:${String(m || 0).padStart(2, '0')} ${(h || 0) >= 12 ? 'PM' : 'AM'}`;
}
function r1(n: number): number { return Math.round(n * 10) / 10; }
function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 1000) / 10}%` : '0%';
}
function zeroAgg(): SlotAgg {
  return { claimed: 0, unclaimed: 0, upcoming: 0, present: 0, cancelled: 0, totalSlots: 0, totalHours: 0 };
}
function bumpSlot(agg: SlotAgg, ds: DisplayStatus, hrs: number) {
  if (ds === 'Claimed')   agg.claimed++;
  else if (ds === 'Upcoming')  agg.upcoming++;
  else if (ds === 'Present')   agg.present++;
  else if (ds === 'Cancelled') agg.cancelled++;
  else agg.unclaimed++;
  agg.totalSlots++;
  agg.totalHours = r1(agg.totalHours + hrs);
}
function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

// ── Style helpers ──────────────────────────────────────────────────────────
function styleTitle(cell: ExcelJS.Cell, bgArgb: string, size = 13) {
  cell.font = { bold: true, size, color: { argb: B.white }, name: 'Calibri' };
  cell.fill = solidFill(bgArgb);
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}
function styleColHdr(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 9, color: { argb: B.white }, name: 'Calibri' };
  cell.fill = solidFill(B.hCol);
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = { bottom: { style: 'medium', color: { argb: B.hMid } }, right: { style: 'hair', color: { argb: B.border } } };
}
function styleData(cell: ExcelJS.Cell, align: ExcelJS.Alignment['horizontal'] = 'left', tint?: string) {
  cell.font = { size: 9, color: { argb: B.textDk }, name: 'Calibri' };
  if (tint) cell.fill = solidFill(tint);
  cell.alignment = { vertical: 'middle', horizontal: align };
  cell.border = { bottom: { style: 'hair', color: { argb: B.border } }, right: { style: 'hair', color: { argb: B.border } } };
}
function styleSecHdr(cell: ExcelJS.Cell, bgArgb = B.hMid) {
  cell.font = { bold: true, size: 9, color: { argb: B.white }, name: 'Calibri' };
  cell.fill = solidFill(bgArgb);
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}
function styleTotals(cell: ExcelJS.Cell, align: ExcelJS.Alignment['horizontal'] = 'center') {
  cell.font = { bold: true, size: 9, color: { argb: B.textDk }, name: 'Calibri' };
  cell.fill = solidFill(B.totals);
  cell.alignment = { vertical: 'middle', horizontal: align };
  cell.border = { top: { style: 'medium', color: { argb: B.hMid } } };
}

// ── Chip cell ─────────────────────────────────────────────────────────────
function applyChip(cell: ExcelJS.Cell, bg: string, tx: string) {
  cell.fill = solidFill(bg);
  cell.font = { bold: true, size: 9, color: { argb: tx }, name: 'Calibri' };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

// ── Aggregation builder ────────────────────────────────────────────────────
function buildAggs(slots: RichSlot[], usersById: Map<string, OTExcelUser>, now: Date): AggResult {
  const empMap   = new Map<string, EmpAgg>();
  const lobMap   = new Map<string, LobAgg>();
  const dateMap  = new Map<string, DateAgg>();
  const shiftMap = new Map<string, ShiftAgg>();

  for (const slot of slots) {
    const u     = usersById.get(slot.claimed_by ?? '');
    const hrs   = r1(slot.duration_hrs ?? 0);
    const ds    = computeDisplayStatus(slot, now);
    const lob   = slot.lob ?? 'Unknown';
    const shift = slot.shift_label ?? 'Unknown';
    const eKey  = slot.claimed_by ?? `_${slot.id}`;
    const eName = slot.claimedByUser?.name ?? u?.name ?? 'Unassigned';
    const eId   = slot.claimedByUser?.employee_id ?? u?.employee_id ?? '';

    if (!empMap.has(eKey)) empMap.set(eKey, { ...zeroAgg(), name: eName, empId: eId, email: u?.email ?? '', supervisor: u?.supervisor ?? '', lob });
    bumpSlot(empMap.get(eKey)!, ds, hrs);

    if (!lobMap.has(lob)) lobMap.set(lob, { ...zeroAgg(), lob });
    bumpSlot(lobMap.get(lob)!, ds, hrs);

    if (!dateMap.has(slot.date)) dateMap.set(slot.date, { ...zeroAgg(), date: slot.date, day: dow(slot.date) });
    bumpSlot(dateMap.get(slot.date)!, ds, hrs);

    if (!shiftMap.has(shift)) shiftMap.set(shift, { ...zeroAgg(), shift });
    bumpSlot(shiftMap.get(shift)!, ds, hrs);
  }

  const byEmp   = [...empMap.values()].sort((a, b) => b.totalHours - a.totalHours);
  const byLob   = [...lobMap.values()].sort((a, b) => b.totalHours - a.totalHours);
  const byDate  = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const byShift = [...shiftMap.values()].sort((a, b) => b.totalSlots - a.totalSlots);
  const peakDate = [...dateMap.values()].sort((a, b) => b.totalSlots - a.totalSlots)[0]?.date ?? '—';

  const totals: Totals = {
    slots:     slots.length,
    hours:     r1(slots.reduce((s, x) => s + (x.duration_hrs ?? 0), 0)),
    employees: byEmp.filter(e => e.name !== 'Unassigned').length,
    claimed:   byEmp.reduce((s, e) => s + e.claimed, 0),
    unclaimed: byEmp.reduce((s, e) => s + e.unclaimed, 0),
    upcoming:  byEmp.reduce((s, e) => s + e.upcoming, 0),
    present:   byEmp.reduce((s, e) => s + e.present, 0),
    cancelled: byEmp.reduce((s, e) => s + e.cancelled, 0),
  };

  return { byEmp, byLob, byDate, byShift, totals, topEmp: byEmp[0]?.name ?? '—', topLob: byLob[0]?.lob ?? '—', peakDate };
}

// ── Sheet 1: Dashboard ─────────────────────────────────────────────────────
function buildDashboardSheet(wb: ExcelJS.Workbook, aggs: AggResult, meta: OTExcelMeta) {
  const ws = wb.addWorksheet('Dashboard', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 } });
  const COL_WIDTHS = [20, 14, 14, 20, 14, 14, 20, 14, 14];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const titleRow = ws.addRow(['OutPLEX — OT Dashboard']);
  ws.mergeCells('A1:I1');
  styleTitle(ws.getCell('A1'), B.hDark, 14);
  titleRow.height = 36;

  const dateRange = meta.dateFrom && meta.dateTo ? `${meta.dateFrom} → ${meta.dateTo}` : 'All dates';
  const subRow = ws.addRow([`${meta.filterLabel}   |   ${dateRange}   |   Generated: ${meta.generatedAt}   by   ${meta.generatedBy}`]);
  ws.mergeCells('A2:I2');
  styleTitle(ws.getCell('A2'), B.hMid, 9);
  subRow.height = 18;

  ws.addRow([]); // spacer row 3

  function kpiCard(cell: ExcelJS.Cell, value: string | number, bg: string) {
    cell.value = value;
    cell.font = { bold: true, size: 18, color: { argb: B.white }, name: 'Calibri' };
    cell.fill = solidFill(bg);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  function kpiLabel(cell: ExcelJS.Cell, label: string, bg: string) {
    cell.value = label;
    cell.font = { bold: false, size: 8, color: { argb: 'FFCBD5E1' }, name: 'Calibri' };
    cell.fill = solidFill(bg);
    cell.alignment = { vertical: 'bottom', horizontal: 'center' };
  }

  // KPI group 1: Total Hours, Slots, Employees
  const lbl1 = ws.addRow([]); lbl1.height = 16;
  ws.mergeCells(`A${lbl1.number}:C${lbl1.number}`);
  ws.mergeCells(`D${lbl1.number}:F${lbl1.number}`);
  ws.mergeCells(`G${lbl1.number}:I${lbl1.number}`);
  kpiLabel(ws.getCell(`A${lbl1.number}`), 'TOTAL OT HOURS',    B.hDark);
  kpiLabel(ws.getCell(`D${lbl1.number}`), 'TOTAL SLOTS',       B.hDark);
  kpiLabel(ws.getCell(`G${lbl1.number}`), 'UNIQUE EMPLOYEES',  B.hDark);

  const val1 = ws.addRow([]); val1.height = 46;
  ws.mergeCells(`A${val1.number}:C${val1.number}`);
  ws.mergeCells(`D${val1.number}:F${val1.number}`);
  ws.mergeCells(`G${val1.number}:I${val1.number}`);
  kpiCard(ws.getCell(`A${val1.number}`), aggs.totals.hours,     B.hDark);
  kpiCard(ws.getCell(`D${val1.number}`), aggs.totals.slots,     B.hMid);
  kpiCard(ws.getCell(`G${val1.number}`), aggs.totals.employees, B.hCol);
  ws.getCell(`A${val1.number}`).numFmt = '0.0';

  ws.addRow([]); // spacer

  // KPI group 2: Claimed, Upcoming, Present
  const lbl2 = ws.addRow([]); lbl2.height = 16;
  ws.mergeCells(`A${lbl2.number}:C${lbl2.number}`);
  ws.mergeCells(`D${lbl2.number}:F${lbl2.number}`);
  ws.mergeCells(`G${lbl2.number}:I${lbl2.number}`);
  kpiLabel(ws.getCell(`A${lbl2.number}`), 'CLAIMED SLOTS',   B.hMid);
  kpiLabel(ws.getCell(`D${lbl2.number}`), 'UPCOMING SLOTS',  B.hMid);
  kpiLabel(ws.getCell(`G${lbl2.number}`), 'PRESENT NOW',     B.hMid);

  const val2 = ws.addRow([]); val2.height = 40;
  ws.mergeCells(`A${val2.number}:C${val2.number}`);
  ws.mergeCells(`D${val2.number}:F${val2.number}`);
  ws.mergeCells(`G${val2.number}:I${val2.number}`);
  kpiCard(ws.getCell(`A${val2.number}`), aggs.totals.claimed,   B.hMid);
  kpiCard(ws.getCell(`D${val2.number}`), aggs.totals.upcoming,  B.hMid);
  kpiCard(ws.getCell(`G${val2.number}`), aggs.totals.present,   B.hMid);

  ws.addRow([]); // spacer

  // KPI group 3: Unclaimed, Cancelled, Top Employee/LOB/Peak
  const lbl3 = ws.addRow([]); lbl3.height = 16;
  ws.mergeCells(`A${lbl3.number}:C${lbl3.number}`);
  ws.mergeCells(`D${lbl3.number}:F${lbl3.number}`);
  ws.mergeCells(`G${lbl3.number}:I${lbl3.number}`);
  kpiLabel(ws.getCell(`A${lbl3.number}`), 'UNCLAIMED SLOTS',    B.hCol);
  kpiLabel(ws.getCell(`D${lbl3.number}`), 'CANCELLED SLOTS',    B.hCol);
  kpiLabel(ws.getCell(`G${lbl3.number}`), 'PEAK DATE',          B.hCol);

  const val3 = ws.addRow([]); val3.height = 40;
  ws.mergeCells(`A${val3.number}:C${val3.number}`);
  ws.mergeCells(`D${val3.number}:F${val3.number}`);
  ws.mergeCells(`G${val3.number}:I${val3.number}`);
  kpiCard(ws.getCell(`A${val3.number}`), aggs.totals.unclaimed, B.hCol);
  kpiCard(ws.getCell(`D${val3.number}`), aggs.totals.cancelled, B.hCol);
  const peakCell = ws.getCell(`G${val3.number}`);
  peakCell.value = aggs.peakDate;
  peakCell.font = { bold: true, size: 11, color: { argb: B.white }, name: 'Calibri' };
  peakCell.fill = solidFill(B.hCol);
  peakCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  ws.addRow([]); ws.addRow([]);

  // Top Employees section
  function secHdr(text: string) {
    const row = ws.addRow([text]);
    ws.mergeCells(`A${row.number}:I${row.number}`);
    styleSecHdr(ws.getCell(`A${row.number}`));
    row.height = 20;
  }
  function colHdrs(labels: string[]) {
    const row = ws.addRow(labels);
    row.eachCell(cell => styleColHdr(cell));
    row.height = 20;
  }

  secHdr('TOP EMPLOYEES BY OT HOURS');
  colHdrs(['Rank', 'Employee Name', 'Emp. ID', 'Supervisor', 'LOB', 'Claimed', 'Unclaimed', 'Upcoming', 'Total Hours']);
  aggs.byEmp.slice(0, 10).forEach((e, i) => {
    const row = ws.addRow([i + 1, e.name, e.empId, e.supervisor, e.lob, e.claimed, e.unclaimed, e.upcoming, e.totalHours]);
    row.height = 18;
    row.eachCell((cell, col) => styleData(cell, col === 1 ? 'center' : col >= 6 ? 'center' : 'left', i % 2 === 1 ? B.rowAlt : undefined));
    row.getCell(9).numFmt = '0.0';
    row.getCell(9).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
  });

  ws.addRow([]); ws.addRow([]);

  secHdr('OT HOURS BY LINE OF BUSINESS');
  colHdrs(['LOB', 'Claimed', 'Unclaimed', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Total Hrs', '']);
  const th = aggs.totals.hours || 1;
  aggs.byLob.forEach((l, i) => {
    const row = ws.addRow([l.lob, l.claimed, l.unclaimed, l.upcoming, l.cancelled, l.totalSlots, l.totalHours, pct(l.totalHours, th), '']);
    row.height = 18;
    row.eachCell((cell, col) => styleData(cell, col === 1 ? 'left' : 'center', i % 2 === 1 ? B.rowAlt : undefined));
    row.getCell(7).numFmt = '0.0';
    row.getCell(7).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
  });

  ws.addRow([]); ws.addRow([]);

  secHdr('DISTRIBUTION BY SHIFT LABEL');
  colHdrs(['Shift', 'Claimed', 'Unclaimed', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Slots', '% of Hours']);
  const ts = aggs.totals.slots || 1;
  aggs.byShift.forEach((s, i) => {
    const row = ws.addRow([s.shift, s.claimed, s.unclaimed, s.upcoming, s.cancelled, s.totalSlots, s.totalHours, pct(s.totalSlots, ts), pct(s.totalHours, th)]);
    row.height = 18;
    row.eachCell((cell, col) => styleData(cell, col === 1 ? 'left' : 'center', i % 2 === 1 ? B.rowAlt : undefined));
    row.getCell(7).numFmt = '0.0';
  });
}

// ── Sheet 2: OT Slots ─────────────────────────────────────────────────────
function buildOTSlotsSheet(wb: ExcelJS.Workbook, slots: RichSlot[], usersById: Map<string, OTExcelUser>, meta: OTExcelMeta, now: Date) {
  const ws = wb.addWorksheet('OT Slots', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
  const N = slots.length;
  const LAST_COL = 19;

  const widths = [5, 13, 10, 11, 11, 9, 16, 26, 10, 14, 13, 26, 11, 20, 26, 13, 13, 13, 13];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const titleRow = ws.addRow(['OutPLEX — OT Slots Report  |  ' + meta.filterLabel]);
  ws.mergeCells('A1:S1');
  styleTitle(ws.getCell('A1'), B.hDark, 13);
  titleRow.height = 32;

  const dateRange = meta.dateFrom && meta.dateTo ? `${meta.dateFrom}  →  ${meta.dateTo}` : 'All dates';
  const metaRow = ws.addRow([`Date range: ${dateRange}   |   Generated: ${meta.generatedAt}   by   ${meta.generatedBy}`]);
  ws.mergeCells('A2:S2');
  styleTitle(ws.getCell('A2'), B.hMid, 9);
  metaRow.height = 20;

  const COLS = ['#', 'Date', 'Day', 'Start', 'End', 'Hrs', 'Shift', 'LOB', 'Spot ID', 'Batch', 'Display Status', 'Employee Name', 'Emp. ID', 'Email', 'Supervisor', 'Claim Status', 'Time Status', 'DB Status', 'CSV Status'];
  const hdrRow = ws.addRow(COLS);
  hdrRow.eachCell(cell => styleColHdr(cell));
  hdrRow.height = 22;

  slots.forEach((slot, i) => {
    const u    = usersById.get(slot.claimed_by ?? '');
    const ds   = computeDisplayStatus(slot, now);
    const cs   = computeClaimStatus(slot.status);
    const ts   = computeTimeStatus(slot, now);
    const tint = displayRowTint(ds);
    const chip = displayChip(ds);

    const row = ws.addRow([
      i + 1,
      slot.date,
      dow(slot.date),
      fmtTime(String(slot.start_time)),
      fmtTime(String(slot.end_time)),
      slot.duration_hrs ?? 0,
      slot.shift_label ?? '',
      slot.lob ?? '',
      slot.spot_id ?? '',
      slot.batch?.name ?? '',
      ds,
      slot.claimedByUser?.name ?? u?.name ?? 'Unassigned',
      slot.claimedByUser?.employee_id ?? u?.employee_id ?? '',
      u?.email ?? '',
      u?.supervisor ?? '',
      cs,
      ts,
      slot.status,
      slot.csv_status ?? '',
    ]);
    row.height = 18;
    row.eachCell((cell, col) => {
      const align: ExcelJS.Alignment['horizontal'] = (col === 1 || col === 6) ? 'center' : col === 3 ? 'center' : 'left';
      styleData(cell, align, tint);
    });

    // Display Status chip (col 11)
    const dsCell = row.getCell(11);
    applyChip(dsCell, chip.bg, chip.tx);

    // Claim Status chip (col 16)
    const csChip = displayChip(cs === 'Claimed' ? 'Claimed' : cs === 'Cancelled' ? 'Cancelled' : 'Unclaimed');
    applyChip(row.getCell(16), csChip.bg, csChip.tx);

    row.getCell(6).numFmt = '0.0';
  });

  // Totals row
  if (N > 0) {
    const totRow = ws.addRow([
      { formula: `SUBTOTAL(2,A4:A${3 + N})` },
      'VISIBLE', '', '', '', { formula: `SUBTOTAL(9,F4:F${3 + N})` },
      ...Array(LAST_COL - 6).fill(''),
    ]);
    totRow.height = 22;
    totRow.eachCell(cell => styleTotals(cell, 'center'));
    totRow.getCell(6).numFmt = '0.0';
    totRow.getCell(1).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
    totRow.getCell(2).font = { bold: true, size: 8, name: 'Calibri', color: { argb: B.textLt } };
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST_COL } };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
}

// ── Sheet 3: Employee ─────────────────────────────────────────────────────
function buildEmployeeSheet(wb: ExcelJS.Workbook, aggs: AggResult, meta: OTExcelMeta) {
  const ws = wb.addWorksheet('Employee', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
  const COL_WIDTHS = [4, 28, 12, 26, 28, 12, 10, 10, 10, 10, 12, 12, 12];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const LAST = COL_WIDTHS.length;

  const titleRow = ws.addRow(['OutPLEX — OT by Employee']);
  ws.mergeCells(`A1:M1`);
  styleTitle(ws.getCell('A1'), B.hDark, 13);
  titleRow.height = 30;

  const dateRange = meta.dateFrom && meta.dateTo ? `${meta.dateFrom} → ${meta.dateTo}` : 'All dates';
  const subRow = ws.addRow([`Date range: ${dateRange}   |   Generated: ${meta.generatedAt}   by   ${meta.generatedBy}`]);
  ws.mergeCells(`A2:M2`);
  styleTitle(ws.getCell('A2'), B.hMid, 9);
  subRow.height = 18;

  const hdrRow = ws.addRow(['#', 'Employee Name', 'Emp. ID', 'Supervisor', 'Email', 'LOB', 'Claimed', 'Unclaimed', 'Upcoming', 'Cancelled', 'Total Slots', 'Hours', '% of Hrs']);
  hdrRow.eachCell(cell => styleColHdr(cell));
  hdrRow.height = 22;

  const totalHours = aggs.totals.hours || 1;
  const N = aggs.byEmp.length;

  aggs.byEmp.forEach((e, i) => {
    const avg = e.totalSlots ? r1(e.totalHours / e.totalSlots) : 0;
    const tint = i % 2 === 1 ? B.rowAlt : undefined;
    const row = ws.addRow([
      i + 1,
      e.name,
      e.empId,
      e.supervisor,
      e.email,
      e.lob,
      e.claimed,
      e.unclaimed,
      e.upcoming,
      e.cancelled,
      e.totalSlots,
      e.totalHours,
      pct(e.totalHours, totalHours),
    ]);
    row.height = 18;
    row.eachCell((cell, col) => {
      const align: ExcelJS.Alignment['horizontal'] = col === 1 || col >= 7 ? 'center' : 'left';
      styleData(cell, align, tint);
    });
    row.getCell(12).numFmt = '0.0';
    row.getCell(12).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
    void avg; // computed but not shown in this layout
  });

  // Totals row
  if (N > 0) {
    const totRow = ws.addRow([
      '', 'TOTAL',
      ...Array(LAST - 2).fill(''),
    ]);
    const firstData = 4;
    totRow.height = 22;
    totRow.eachCell(cell => styleTotals(cell, 'center'));
    totRow.getCell(7).value  = { formula: `SUM(G${firstData}:G${3 + N})` };
    totRow.getCell(8).value  = { formula: `SUM(H${firstData}:H${3 + N})` };
    totRow.getCell(9).value  = { formula: `SUM(I${firstData}:I${3 + N})` };
    totRow.getCell(10).value = { formula: `SUM(J${firstData}:J${3 + N})` };
    totRow.getCell(11).value = { formula: `SUM(K${firstData}:K${3 + N})` };
    totRow.getCell(12).value = { formula: `SUM(L${firstData}:L${3 + N})` };
    totRow.getCell(12).numFmt = '0.0';
    totRow.getCell(13).value = '100%';
  }

  // Data bars on Hours column (col 12 = L)
  if (N > 0) {
    ws.addConditionalFormatting({
      ref: `L4:L${3 + N}`,
      rules: [
        {
          type: 'dataBar',
          priority: 1,
          minLength: 0,
          maxLength: 100,
          cfvo: [
            { type: 'min' },
            { type: 'max' },
          ],
          color: { argb: 'FF4338CA' },
        } as unknown as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST } };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
}

// ── Sheet 4: Summary ───────────────────────────────────────────────────────
function buildSummarySheet(wb: ExcelJS.Workbook, aggs: AggResult, meta: OTExcelMeta) {
  const ws = wb.addWorksheet('Summary', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 } });
  const COL_WIDTHS = [24, 14, 22, 26, 22, 10, 10, 10, 10, 12, 14, 12, 12];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const LAST = COL_WIDTHS.length;

  function mergeTitle(rowNum: number, text: string, bg: string, size = 11) {
    ws.mergeCells(`A${rowNum}:M${rowNum}`);
    styleTitle(ws.getCell(`A${rowNum}`), bg, size);
    ws.getCell(`A${rowNum}`).value = text;
    ws.getRow(rowNum).height = size === 11 ? 26 : 20;
  }

  function addSecHdr(text: string) {
    const row = ws.addRow([text]);
    const n = row.number;
    ws.mergeCells(`A${n}:M${n}`);
    styleSecHdr(ws.getCell(`A${n}`));
    row.height = 20;
  }

  function addColHdrs(labels: string[]) {
    const row = ws.addRow(labels);
    row.eachCell(cell => styleColHdr(cell));
    row.height = 20;
    return row;
  }

  function addDataRow(values: (string | number)[], tint: string | undefined, alignments?: Array<ExcelJS.Alignment['horizontal']>) {
    const row = ws.addRow(values);
    row.height = 18;
    row.eachCell((cell, i) => styleData(cell, alignments?.[i - 1] ?? 'left', tint));
    return row;
  }

  const r1row = ws.addRow(['']);
  mergeTitle(r1row.number, 'OutPLEX — OT Summary Report', B.hDark, 13);

  const r2row = ws.addRow(['']);
  const dateRange = meta.dateFrom && meta.dateTo ? `${meta.dateFrom} → ${meta.dateTo}` : 'All dates';
  mergeTitle(r2row.number, `Date range: ${dateRange}   |   Generated: ${meta.generatedAt}   by   ${meta.generatedBy}`, B.hMid, 9);

  ws.addRow([]);

  // KPI block
  const KPI_ROWS: Array<[string, string | number]> = [
    ['Total OT Hours',    aggs.totals.hours],
    ['Total Slots',       aggs.totals.slots],
    ['Unique Employees',  aggs.totals.employees],
    ['Claimed Slots',     aggs.totals.claimed],
    ['Unclaimed Slots',   aggs.totals.unclaimed],
    ['Upcoming Slots',    aggs.totals.upcoming],
    ['Present Slots',     aggs.totals.present],
    ['Cancelled Slots',   aggs.totals.cancelled],
    ['Top Employee',      aggs.topEmp],
    ['Top LOB',           aggs.topLob],
    ['Peak Date',         aggs.peakDate],
  ];

  const kpiHdr = ws.addRow(['Metric', 'Value']);
  kpiHdr.eachCell(cell => styleColHdr(cell));
  kpiHdr.height = 20;

  KPI_ROWS.forEach(([label, value], i) => {
    const row = ws.addRow([label, value]);
    row.height = 20;
    const tint = i % 2 === 1 ? B.rowAlt : undefined;
    styleData(row.getCell(1), 'left', tint);
    styleData(row.getCell(2), 'center', tint);
    row.getCell(2).font = { bold: true, size: 10, name: 'Calibri', color: { argb: B.hDark } };
    if (typeof value === 'number') row.getCell(2).numFmt = '0.0#';
  });

  ws.addRow([]);

  // By LOB
  addSecHdr('BY LINE OF BUSINESS');
  addColHdrs(['LOB', 'Claimed', 'Unclaimed', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Hours']);
  const totalHours = aggs.totals.hours || 1;
  aggs.byLob.forEach((l, i) => {
    const row = addDataRow([l.lob, l.claimed, l.unclaimed, l.upcoming, l.cancelled, l.totalSlots, l.totalHours, pct(l.totalHours, totalHours)],
      i % 2 === 1 ? B.rowAlt : undefined,
      ['left','center','center','center','center','center','center','center']);
    row.getCell(7).numFmt = '0.0';
  });

  ws.addRow([]); ws.addRow([]);

  // By Date
  addSecHdr('BY DATE');
  addColHdrs(['Date', 'Day', 'Claimed', 'Unclaimed', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours']);
  aggs.byDate.forEach((d, i) => {
    const row = addDataRow([d.date, d.day, d.claimed, d.unclaimed, d.upcoming, d.cancelled, d.totalSlots, d.totalHours],
      i % 2 === 1 ? B.rowAlt : undefined,
      ['left','center','center','center','center','center','center','center']);
    row.getCell(8).numFmt = '0.0';
  });

  ws.addRow([]); ws.addRow([]);

  // By Shift
  addSecHdr('BY SHIFT LABEL');
  addColHdrs(['Shift', 'Claimed', 'Unclaimed', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Slots']);
  const totalSlots = aggs.totals.slots || 1;
  aggs.byShift.forEach((s, i) => {
    const row = addDataRow([s.shift, s.claimed, s.unclaimed, s.upcoming, s.cancelled, s.totalSlots, s.totalHours, pct(s.totalSlots, totalSlots)],
      i % 2 === 1 ? B.rowAlt : undefined,
      ['left','center','center','center','center','center','center','center']);
    row.getCell(7).numFmt = '0.0';
  });

  void LAST; // used for column widths
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ── Sheet 5: Data (raw) ────────────────────────────────────────────────────
function buildDataSheet(wb: ExcelJS.Workbook, slots: RichSlot[], usersById: Map<string, OTExcelUser>, now: Date) {
  const ws = wb.addWorksheet('Data', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
  const N = slots.length;

  const widths = [13, 10, 11, 11, 9, 26, 11, 20, 26, 13, 13, 13, 14];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const hdrRow = ws.addRow(['Date','Day','Start','End','Hrs','Employee Name','Emp. ID','Email','Supervisor','LOB','DB Status','Claim Status','Display Status']);
  hdrRow.eachCell(cell => styleColHdr(cell));
  hdrRow.height = 20;

  slots.forEach((slot, i) => {
    const u  = usersById.get(slot.claimed_by ?? '');
    const ds = computeDisplayStatus(slot, now);
    const cs = computeClaimStatus(slot.status);
    const tint = i % 2 === 1 ? B.rowAlt : undefined;
    const row = ws.addRow([
      slot.date,
      dow(slot.date),
      fmtTime(String(slot.start_time)),
      fmtTime(String(slot.end_time)),
      slot.duration_hrs ?? 0,
      slot.claimedByUser?.name ?? u?.name ?? 'Unassigned',
      slot.claimedByUser?.employee_id ?? u?.employee_id ?? '',
      u?.email ?? '',
      u?.supervisor ?? '',
      slot.lob ?? '',
      slot.status,
      cs,
      ds,
    ]);
    row.height = 18;
    row.eachCell((cell, col) => styleData(cell, col === 5 ? 'center' : 'left', tint));
    row.getCell(5).numFmt = '0.0';
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  void N;
}

// ── Entry point ────────────────────────────────────────────────────────────
export async function generateOTExcel(
  slots: OTSlot[],
  usersById: Map<string, OTExcelUser>,
  meta: OTExcelMeta,
  now: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OutPLEX Workforce';
  wb.created = now;
  wb.modified = now;
  wb.properties.date1904 = false;

  const richSlots = slots as RichSlot[];
  const aggs = buildAggs(richSlots, usersById, now);

  buildDashboardSheet(wb, aggs, meta);
  buildOTSlotsSheet(wb, richSlots, usersById, meta, now);
  buildEmployeeSheet(wb, aggs, meta);
  buildSummarySheet(wb, aggs, meta);
  buildDataSheet(wb, richSlots, usersById, now);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
