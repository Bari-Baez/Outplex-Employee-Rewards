import ExcelJS from 'exceljs';
import type { OTSlot } from '@/types/database';

// ── ARGB color palette ─────────────────────────────────────────────────────
const B = {
  hDark:  'FF1E1B4B',  // deep indigo — title rows
  hMid:   'FF312E81',  // medium indigo — section headers
  hCol:   'FF4338CA',  // bright indigo — column headers
  rowAlt: 'FFF5F3FF',  // very light lavender — alternating data rows
  totals: 'FFEDE9FE',  // light purple — totals / KPI cells
  white:  'FFFFFFFF',
  textDk: 'FF111827',
  textLt: 'FF6B7280',
  border: 'FFE0E7FF',
  // Section chip colors
  cBg: 'FFFFF7ED', cTx: 'FFB45309',  // Claimed  → amber
  uBg: 'FFDBEAFE', uTx: 'FF1D4ED8',  // Upcoming → blue
  pBg: 'FFF0FDF4', pTx: 'FF15803D',  // Pending  → green
  xBg: 'FFFEF2F2', xTx: 'FFB91C1C',  // Cancelled → red
} as const;

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

// ── Aggregation interfaces ─────────────────────────────────────────────────
interface SlotAgg {
  claimed: number; pending: number; upcoming: number; cancelled: number;
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
  claimed: number; pending: number; upcoming: number; cancelled: number;
}
interface AggResult {
  byEmp: EmpAgg[]; byLob: LobAgg[]; byDate: DateAgg[]; byShift: ShiftAgg[];
  totals: Totals;
  topEmp: string; topLob: string; peakDate: string;
}

// ── Pure helpers ───────────────────────────────────────────────────────────
function slotSection(slot: OTSlot, today: string): string {
  if (slot.status === 'cancelled') return 'Cancelled';
  if (slot.date > today) return 'Upcoming';
  if (slot.status === 'claimed') return 'Claimed';
  return 'Pending';
}
function dow(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function r1(n: number): number { return Math.round(n * 10) / 10; }
function pct(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 1000) / 10}%` : '0%';
}
function zeroAgg(): SlotAgg {
  return { claimed: 0, pending: 0, upcoming: 0, cancelled: 0, totalSlots: 0, totalHours: 0 };
}
function bumpSlot(agg: SlotAgg, section: string, hrs: number) {
  if (section === 'Claimed') agg.claimed++;
  else if (section === 'Upcoming') agg.upcoming++;
  else if (section === 'Cancelled') agg.cancelled++;
  else agg.pending++;
  agg.totalSlots++;
  agg.totalHours = r1(agg.totalHours + hrs);
}
function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function sectionChip(section: string): { bg: string; tx: string } {
  if (section === 'Claimed')   return { bg: B.cBg, tx: B.cTx };
  if (section === 'Upcoming')  return { bg: B.uBg, tx: B.uTx };
  if (section === 'Cancelled') return { bg: B.xBg, tx: B.xTx };
  return { bg: B.pBg, tx: B.pTx };
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
function styleData(cell: ExcelJS.Cell, align: ExcelJS.Alignment['horizontal'] = 'left', isAlt = false) {
  cell.font = { size: 9, color: { argb: B.textDk }, name: 'Calibri' };
  if (isAlt) cell.fill = solidFill(B.rowAlt);
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

// ── Aggregation builder ────────────────────────────────────────────────────
function buildAggs(slots: RichSlot[], usersById: Map<string, OTExcelUser>, today: string): AggResult {
  const empMap   = new Map<string, EmpAgg>();
  const lobMap   = new Map<string, LobAgg>();
  const dateMap  = new Map<string, DateAgg>();
  const shiftMap = new Map<string, ShiftAgg>();

  for (const slot of slots) {
    const u     = usersById.get(slot.claimed_by ?? '');
    const hrs   = r1(slot.duration_hrs ?? 0);
    const sec   = slotSection(slot, today);
    const lob   = slot.lob ?? 'Unknown';
    const shift = slot.shift_label ?? 'Unknown';
    const eKey  = slot.claimed_by ?? `_${slot.id}`;
    const eName = slot.claimedByUser?.name ?? u?.name ?? 'Unassigned';
    const eId   = slot.claimedByUser?.employee_id ?? u?.employee_id ?? '';

    if (!empMap.has(eKey)) empMap.set(eKey, { ...zeroAgg(), name: eName, empId: eId, email: u?.email ?? '', supervisor: u?.supervisor ?? '', lob });
    bumpSlot(empMap.get(eKey)!, sec, hrs);

    if (!lobMap.has(lob)) lobMap.set(lob, { ...zeroAgg(), lob });
    bumpSlot(lobMap.get(lob)!, sec, hrs);

    if (!dateMap.has(slot.date)) dateMap.set(slot.date, { ...zeroAgg(), date: slot.date, day: dow(slot.date) });
    bumpSlot(dateMap.get(slot.date)!, sec, hrs);

    if (!shiftMap.has(shift)) shiftMap.set(shift, { ...zeroAgg(), shift });
    bumpSlot(shiftMap.get(shift)!, sec, hrs);
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
    pending:   byEmp.reduce((s, e) => s + e.pending, 0),
    upcoming:  byEmp.reduce((s, e) => s + e.upcoming, 0),
    cancelled: byEmp.reduce((s, e) => s + e.cancelled, 0),
  };

  return { byEmp, byLob, byDate, byShift, totals, topEmp: byEmp[0]?.name ?? '—', topLob: byLob[0]?.lob ?? '—', peakDate };
}

// ── Sheet 1: OT Data ───────────────────────────────────────────────────────
function buildRawDataSheet(wb: ExcelJS.Workbook, slots: RichSlot[], usersById: Map<string, OTExcelUser>, meta: OTExcelMeta, today: string) {
  const ws = wb.addWorksheet('OT Data', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
  const N = slots.length;
  const LAST_COL = 17;

  // Column widths
  const widths = [5, 13, 14, 10, 11, 11, 9, 16, 26, 11, 20, 26, 12, 28, 22, 13, 14];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Row 1: Title
  const titleRow = ws.addRow(['OutPLEX — OT Report  |  ' + meta.filterLabel]);
  ws.mergeCells(`A1:Q1`);
  styleTitle(ws.getCell('A1'), B.hDark, 13);
  titleRow.height = 32;

  // Row 2: Meta info
  const dateRange = meta.dateFrom && meta.dateTo ? `${meta.dateFrom}  →  ${meta.dateTo}` : 'All dates';
  const metaRow = ws.addRow([`Date range: ${dateRange}   |   Generated: ${meta.generatedAt}   by   ${meta.generatedBy}`]);
  ws.mergeCells('A2:Q2');
  styleTitle(ws.getCell('A2'), B.hMid, 9);
  metaRow.height = 20;

  // Row 3: Column headers
  const COLS = ['#', 'Section', 'Date', 'Day', 'Start', 'End', 'Hrs', 'Shift Label', 'LOB', 'Spot ID', 'Batch', 'Employee Name', 'Emp. ID', 'Email', 'Supervisor', 'OT Status', 'Orig. Status'];
  const hdrRow = ws.addRow(COLS);
  hdrRow.eachCell(cell => styleColHdr(cell));
  hdrRow.height = 22;

  // Data rows (rows 4 … 3+N)
  slots.forEach((slot, i) => {
    const u   = usersById.get(slot.claimed_by ?? '');
    const sec = slotSection(slot, today);
    const alt = i % 2 === 1;
    const row = ws.addRow([
      i + 1,
      sec,
      slot.date,
      dow(slot.date),
      fmtTime(slot.start_time),
      fmtTime(slot.end_time),
      slot.duration_hrs ?? 0,
      slot.shift_label ?? '',
      slot.lob ?? '',
      slot.spot_id ?? '',
      slot.batch?.name ?? '',
      slot.claimedByUser?.name ?? u?.name ?? 'Unassigned',
      slot.claimedByUser?.employee_id ?? u?.employee_id ?? '',
      u?.email ?? '',
      u?.supervisor ?? '',
      slot.status,
      slot.csv_status ?? '',
    ]);
    row.height = 18;
    row.eachCell((cell, colNum) => {
      const align: ExcelJS.Alignment['horizontal'] = (colNum === 1 || colNum === 7) ? 'center' : colNum === 4 ? 'center' : 'left';
      styleData(cell, align, alt);
    });
    // Section chip color
    const secCell = row.getCell(2);
    const chip = sectionChip(sec);
    secCell.fill = solidFill(chip.bg);
    secCell.font = { bold: true, size: 9, color: { argb: chip.tx }, name: 'Calibri' };
    secCell.alignment = { vertical: 'middle', horizontal: 'center' };
    // Duration format
    row.getCell(7).numFmt = '0.0';
  });

  // Totals row (row 4+N) — SUBTOTAL responds to auto-filter
  if (N > 0) {
    const totRow = ws.addRow([
      { formula: `SUBTOTAL(2,A4:A${3 + N})` },
      'VISIBLE',
      '',
      '',
      '',
      'TOTAL →',
      { formula: `SUBTOTAL(9,G4:G${3 + N})` },
      ...Array(LAST_COL - 7).fill(''),
    ]);
    totRow.height = 22;
    totRow.eachCell(cell => styleTotals(cell, 'center'));
    totRow.getCell(7).numFmt = '0.0';
    totRow.getCell(1).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
    totRow.getCell(2).font = { bold: true, size: 8, name: 'Calibri', color: { argb: B.textLt } };
    totRow.getCell(6).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.textLt } };
  }

  // Auto-filter on header row, freeze top 3 rows
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: LAST_COL } };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
}

// ── Sheet 2: Summary ───────────────────────────────────────────────────────
function buildSummarySheet(wb: ExcelJS.Workbook, aggs: AggResult, meta: OTExcelMeta) {
  const ws = wb.addWorksheet('Summary', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 } });
  const COL_WIDTHS = [24, 14, 22, 26, 22, 10, 10, 10, 10, 12, 14, 12, 12];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const LAST = COL_WIDTHS.length; // 13

  function mergeTitle(rowNum: number, text: string, bg: string, size = 11) {
    ws.mergeCells(`A${rowNum}:M${rowNum}`);
    styleTitle(ws.getCell(`A${rowNum}`), bg, size);
    ws.getCell(`A${rowNum}`).value = text;
    ws.getRow(rowNum).height = size === 11 ? 26 : 20;
  }

  function addSecHdr(text: string) {
    const row = ws.addRow([text]);
    const rowNum = row.number;
    ws.mergeCells(`A${rowNum}:M${rowNum}`);
    styleSecHdr(ws.getCell(`A${rowNum}`));
    row.height = 20;
  }

  function addColHdrs(labels: string[]) {
    const row = ws.addRow(labels);
    row.eachCell(cell => styleColHdr(cell));
    row.height = 20;
    return row;
  }

  function addDataRow(values: (string | number)[], isAlt: boolean, alignments?: Array<ExcelJS.Alignment['horizontal']>) {
    const row = ws.addRow(values);
    row.height = 18;
    row.eachCell((cell, i) => styleData(cell, alignments?.[i - 1] ?? 'left', isAlt));
    return row;
  }

  // ── Title rows ──
  const r1row = ws.addRow(['']); ws.mergeCells(`A${r1row.number}:M${r1row.number}`);
  styleTitle(ws.getCell(`A${r1row.number}`), B.hDark, 13);
  ws.getCell(`A${r1row.number}`).value = 'OutPLEX — OT Summary Report';
  r1row.height = 30;

  const r2row = ws.addRow(['']);
  const dateRange = meta.dateFrom && meta.dateTo ? `${meta.dateFrom} → ${meta.dateTo}` : 'All dates';
  ws.mergeCells(`A${r2row.number}:M${r2row.number}`);
  styleTitle(ws.getCell(`A${r2row.number}`), B.hMid, 9);
  ws.getCell(`A${r2row.number}`).value = `Date range: ${dateRange}   |   Generated: ${meta.generatedAt}   by   ${meta.generatedBy}`;
  r2row.height = 18;

  // ── KPI block ──
  ws.addRow([]); // blank spacer

  const KPI_ROWS: Array<[string, string | number]> = [
    ['Total OT Hours',    aggs.totals.hours],
    ['Total Slots',       aggs.totals.slots],
    ['Unique Employees',  aggs.totals.employees],
    ['Claimed Slots',     aggs.totals.claimed],
    ['Pending Slots',     aggs.totals.pending],
    ['Upcoming Slots',    aggs.totals.upcoming],
    ['Cancelled Slots',   aggs.totals.cancelled],
    ['Top Employee',      aggs.topEmp],
    ['Top LOB',           aggs.topLob],
    ['Peak Date',         aggs.peakDate],
  ];

  const kpiHdrRow = ws.addRow(['Metric', 'Value']);
  kpiHdrRow.eachCell(cell => styleColHdr(cell));
  kpiHdrRow.height = 20;

  KPI_ROWS.forEach(([label, value], i) => {
    const row = ws.addRow([label, value]);
    row.height = 20;
    styleData(row.getCell(1), 'left', i % 2 === 1);
    styleData(row.getCell(2), 'center', i % 2 === 1);
    row.getCell(2).font = { bold: true, size: 10, name: 'Calibri', color: { argb: B.hDark } };
    if (typeof value === 'number') row.getCell(2).numFmt = '0.0#';
  });

  ws.addRow([]); // spacer

  // ── By Employee ──
  addSecHdr('BY EMPLOYEE');
  addColHdrs(['Employee Name', 'Emp. ID', 'Supervisor', 'Email', 'LOB', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total', 'Hours', 'Avg Hrs', '% of Hrs']);
  const totalHours = aggs.totals.hours || 1;
  aggs.byEmp.forEach((e, i) => {
    const avg = e.totalSlots ? r1(e.totalHours / e.totalSlots) : 0;
    const row = addDataRow([e.name, e.empId, e.supervisor, e.email, e.lob, e.claimed, e.pending, e.upcoming, e.cancelled, e.totalSlots, e.totalHours, avg, pct(e.totalHours, totalHours)], i % 2 === 1,
      ['left','center','left','left','left','center','center','center','center','center','center','center','center']);
    row.getCell(11).numFmt = '0.0';
    row.getCell(12).numFmt = '0.0';
  });

  ws.addRow([]); ws.addRow([]); // spacer

  // ── By LOB ──
  addSecHdr('BY LINE OF BUSINESS');
  addColHdrs(['LOB', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Hours']);
  aggs.byLob.forEach((l, i) => {
    const row = addDataRow([l.lob, l.claimed, l.pending, l.upcoming, l.cancelled, l.totalSlots, l.totalHours, pct(l.totalHours, totalHours)], i % 2 === 1,
      ['left','center','center','center','center','center','center','center']);
    row.getCell(7).numFmt = '0.0';
  });

  ws.addRow([]); ws.addRow([]);

  // ── By Date ──
  addSecHdr('BY DATE');
  addColHdrs(['Date', 'Day', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours']);
  aggs.byDate.forEach((d, i) => {
    const row = addDataRow([d.date, d.day, d.claimed, d.pending, d.upcoming, d.cancelled, d.totalSlots, d.totalHours], i % 2 === 1,
      ['left','center','center','center','center','center','center','center']);
    row.getCell(8).numFmt = '0.0';
  });

  ws.addRow([]); ws.addRow([]);

  // ── By Shift ──
  addSecHdr('BY SHIFT LABEL');
  addColHdrs(['Shift', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Slots']);
  const totalSlots = aggs.totals.slots || 1;
  aggs.byShift.forEach((s, i) => {
    const row = addDataRow([s.shift, s.claimed, s.pending, s.upcoming, s.cancelled, s.totalSlots, s.totalHours, pct(s.totalSlots, totalSlots)], i % 2 === 1,
      ['left','center','center','center','center','center','center','center']);
    row.getCell(7).numFmt = '0.0';
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ── Sheet 3: Dashboard ─────────────────────────────────────────────────────
function buildDashboardSheet(wb: ExcelJS.Workbook, aggs: AggResult, meta: OTExcelMeta) {
  const ws = wb.addWorksheet('Dashboard', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 } });
  const COL_WIDTHS = [20, 14, 14, 20, 14, 14, 20, 14, 14];
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Row 1: Title
  const titleRow = ws.addRow(['OutPLEX — OT Dashboard']);
  ws.mergeCells('A1:I1');
  styleTitle(ws.getCell('A1'), B.hDark, 14);
  titleRow.height = 36;

  // Row 2: subtitle
  const subRow = ws.addRow([`${meta.filterLabel}   |   ${meta.dateFrom || 'All'} → ${meta.dateTo || 'dates'}   |   ${meta.generatedAt}`]);
  ws.mergeCells('A2:I2');
  styleTitle(ws.getCell('A2'), B.hMid, 9);
  subRow.height = 18;

  ws.addRow([]); // spacer row 3

  // KPI Card builder
  function kpiCard(cell: ExcelJS.Cell, label: string, value: string | number, bg: string = B.hDark) {
    cell.value = value;
    cell.font = { bold: true, size: 18, color: { argb: B.white }, name: 'Calibri' };
    cell.fill = solidFill(bg);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  function kpiLabel(cell: ExcelJS.Cell, label: string, bg: string = B.hDark) {
    cell.value = label;
    cell.font = { bold: false, size: 8, color: { argb: 'FFCBD5E1' }, name: 'Calibri' };
    cell.fill = solidFill(bg);
    cell.alignment = { vertical: 'bottom', horizontal: 'center' };
  }

  // Rows 4-5: KPI labels row then values row (group 1)
  const lbl1Row = ws.addRow([]); lbl1Row.height = 16;
  ws.mergeCells(`A${lbl1Row.number}:C${lbl1Row.number}`);
  ws.mergeCells(`D${lbl1Row.number}:F${lbl1Row.number}`);
  ws.mergeCells(`G${lbl1Row.number}:I${lbl1Row.number}`);
  kpiLabel(ws.getCell(`A${lbl1Row.number}`), 'TOTAL OT HOURS');
  kpiLabel(ws.getCell(`D${lbl1Row.number}`), 'TOTAL SLOTS');
  kpiLabel(ws.getCell(`G${lbl1Row.number}`), 'UNIQUE EMPLOYEES');

  const val1Row = ws.addRow([]); val1Row.height = 46;
  ws.mergeCells(`A${val1Row.number}:C${val1Row.number}`);
  ws.mergeCells(`D${val1Row.number}:F${val1Row.number}`);
  ws.mergeCells(`G${val1Row.number}:I${val1Row.number}`);
  kpiCard(ws.getCell(`A${val1Row.number}`), '', aggs.totals.hours);
  kpiCard(ws.getCell(`D${val1Row.number}`), '', aggs.totals.slots, B.hMid);
  kpiCard(ws.getCell(`G${val1Row.number}`), '', aggs.totals.employees, B.hCol);
  ws.getCell(`A${val1Row.number}`).numFmt = '0.0';

  ws.addRow([]); // spacer

  // Rows: KPI group 2 (Claimed / Pending / Upcoming)
  const lbl2Row = ws.addRow([]); lbl2Row.height = 16;
  ws.mergeCells(`A${lbl2Row.number}:C${lbl2Row.number}`);
  ws.mergeCells(`D${lbl2Row.number}:F${lbl2Row.number}`);
  ws.mergeCells(`G${lbl2Row.number}:I${lbl2Row.number}`);
  kpiLabel(ws.getCell(`A${lbl2Row.number}`), 'CLAIMED SLOTS', B.hMid);
  kpiLabel(ws.getCell(`D${lbl2Row.number}`), 'PENDING SLOTS', B.hMid);
  kpiLabel(ws.getCell(`G${lbl2Row.number}`), 'UPCOMING SLOTS', B.hMid);

  const val2Row = ws.addRow([]); val2Row.height = 40;
  ws.mergeCells(`A${val2Row.number}:C${val2Row.number}`);
  ws.mergeCells(`D${val2Row.number}:F${val2Row.number}`);
  ws.mergeCells(`G${val2Row.number}:I${val2Row.number}`);
  kpiCard(ws.getCell(`A${val2Row.number}`), '', aggs.totals.claimed, B.hMid);
  kpiCard(ws.getCell(`D${val2Row.number}`), '', aggs.totals.pending, B.hMid);
  kpiCard(ws.getCell(`G${val2Row.number}`), '', aggs.totals.upcoming, B.hMid);

  ws.addRow([]); // spacer

  // Rows: KPI group 3 (Top Employee / Top LOB / Peak Date)
  const lbl3Row = ws.addRow([]); lbl3Row.height = 16;
  ws.mergeCells(`A${lbl3Row.number}:C${lbl3Row.number}`);
  ws.mergeCells(`D${lbl3Row.number}:F${lbl3Row.number}`);
  ws.mergeCells(`G${lbl3Row.number}:I${lbl3Row.number}`);
  kpiLabel(ws.getCell(`A${lbl3Row.number}`), 'MOST ACTIVE EMPLOYEE', B.hCol);
  kpiLabel(ws.getCell(`D${lbl3Row.number}`), 'TOP LINE OF BUSINESS', B.hCol);
  kpiLabel(ws.getCell(`G${lbl3Row.number}`), 'PEAK DATE (MOST SLOTS)', B.hCol);

  const val3Row = ws.addRow([]); val3Row.height = 36;
  ws.mergeCells(`A${val3Row.number}:C${val3Row.number}`);
  ws.mergeCells(`D${val3Row.number}:F${val3Row.number}`);
  ws.mergeCells(`G${val3Row.number}:I${val3Row.number}`);
  const e3a = ws.getCell(`A${val3Row.number}`);
  const e3d = ws.getCell(`D${val3Row.number}`);
  const e3g = ws.getCell(`G${val3Row.number}`);
  [e3a, e3d, e3g].forEach(c => {
    c.font = { bold: true, size: 11, color: { argb: B.white }, name: 'Calibri' };
    c.fill = solidFill(B.hCol);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  e3a.value = aggs.topEmp;
  e3d.value = aggs.topLob;
  e3g.value = aggs.peakDate;

  ws.addRow([]); ws.addRow([]); // spacers

  // ── Top Employees table ──
  function secHdrRow(text: string) {
    const row = ws.addRow([text]);
    ws.mergeCells(`A${row.number}:I${row.number}`);
    styleSecHdr(ws.getCell(`A${row.number}`));
    row.height = 20;
  }
  function colHdrRow(labels: string[]) {
    const row = ws.addRow(labels);
    row.eachCell(cell => styleColHdr(cell));
    row.height = 20;
  }

  secHdrRow('TOP EMPLOYEES BY OT HOURS');
  colHdrRow(['Rank', 'Employee Name', 'Emp. ID', 'Supervisor', 'LOB', 'Claimed', 'Pending', 'Upcoming', 'Total Hours']);
  aggs.byEmp.slice(0, 10).forEach((e, i) => {
    const row = ws.addRow([i + 1, e.name, e.empId, e.supervisor, e.lob, e.claimed, e.pending, e.upcoming, e.totalHours]);
    row.height = 18;
    row.eachCell((cell, colNum) => styleData(cell, colNum === 1 ? 'center' : colNum >= 6 ? 'center' : 'left', i % 2 === 1));
    row.getCell(9).numFmt = '0.0';
    row.getCell(9).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
  });

  ws.addRow([]); ws.addRow([]);

  // ── LOB breakdown ──
  secHdrRow('OT HOURS BY LINE OF BUSINESS');
  colHdrRow(['LOB', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Total Hrs', '']);
  const th = aggs.totals.hours || 1;
  aggs.byLob.forEach((l, i) => {
    const row = ws.addRow([l.lob, l.claimed, l.pending, l.upcoming, l.cancelled, l.totalSlots, l.totalHours, pct(l.totalHours, th), '']);
    row.height = 18;
    row.eachCell((cell, colNum) => styleData(cell, colNum === 1 ? 'left' : 'center', i % 2 === 1));
    row.getCell(7).numFmt = '0.0';
    row.getCell(7).font = { bold: true, size: 9, name: 'Calibri', color: { argb: B.hDark } };
  });

  ws.addRow([]); ws.addRow([]);

  // ── Shift breakdown ──
  secHdrRow('DISTRIBUTION BY SHIFT LABEL');
  colHdrRow(['Shift', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours', '% of Slots', '% of Hours']);
  const ts = aggs.totals.slots || 1;
  aggs.byShift.forEach((s, i) => {
    const row = ws.addRow([s.shift, s.claimed, s.pending, s.upcoming, s.cancelled, s.totalSlots, s.totalHours, pct(s.totalSlots, ts), pct(s.totalHours, th)]);
    row.height = 18;
    row.eachCell((cell, colNum) => styleData(cell, colNum === 1 ? 'left' : 'center', i % 2 === 1));
    row.getCell(7).numFmt = '0.0';
  });
}

// ── Entry point ────────────────────────────────────────────────────────────
export async function generateOTExcel(
  slots: OTSlot[],
  usersById: Map<string, OTExcelUser>,
  meta: OTExcelMeta,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OutPLEX Workforce';
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  const today = new Date().toISOString().slice(0, 10);
  const richSlots = slots as RichSlot[];
  const aggs = buildAggs(richSlots, usersById, today);

  buildRawDataSheet(wb, richSlots, usersById, meta, today);
  buildSummarySheet(wb, aggs, meta);
  buildDashboardSheet(wb, aggs, meta);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
