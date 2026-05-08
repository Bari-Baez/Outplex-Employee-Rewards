import ExcelJS from 'exceljs';
import type { FormField } from '@/lib/forms/types';

// ─── colour palette ───────────────────────────────────────────────────────────
const C = {
  indigo:      'FF4F46E5',
  indigoDark:  'FF3730A3',
  indigoLight: 'FFEDE9FE',
  emerald:     'FF10B981',
  emeraldDark: 'FF047857',
  emeraldLight:'FFD1FAE5',
  violet:      'FF7C3AED',
  violetDark:  'FF5B21B6',
  violetLight: 'FFEDE9FE',
  slate900:    'FF0F172A',
  slate700:    'FF334155',
  slate500:    'FF64748B',
  slate200:    'FFE2E8F0',
  slate50:     'FFF8FAFC',
  white:       'FFFFFFFF',
  amber:       'FFF59E0B',
  rose:        'FFEF4444',
  sky:         'FF0EA5E9',
} as const;

type ARGB = string;

function fill(argb: ARGB): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function border(argb: ARGB = C.slate200): ExcelJS.Borders {
  const s: ExcelJS.Border = { style: 'thin', color: { argb } };
  return { top: s, bottom: s, left: s, right: s, diagonal: {} };
}

const TYPE_LABEL: Record<string, string> = {
  short_text: 'Texto corto',
  long_text:  'Párrafo',
  radio:      'Selección única',
  checkbox:   'Selección múltiple',
  select:     'Lista desplegable',
  rating:     'Calificación',
  date:       'Fecha',
  number:     'Número',
  email:      'Correo electrónico',
  image:      'Imagen',
  section:    'Sección',
};

// ─── public types ─────────────────────────────────────────────────────────────

export interface FormExcelMeta {
  exportedBy: string;
  exportedAt: Date;
}

export interface FormResponse {
  submitted_at: string;
  user?: { name?: string; email?: string; employee_id?: string | null } | null;
  answers?: Record<string, unknown>;
}

// ─── main entry ───────────────────────────────────────────────────────────────

export async function generateFormExcel(
  form: { title: string; description?: string | null; fields: FormField[] },
  responses: FormResponse[],
  meta: FormExcelMeta,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Outplex Forms';
  wb.created = meta.exportedAt;

  const fields = form.fields.filter((f) => f.type !== 'section');

  buildCover(wb, form, fields, responses, meta);
  buildResponses(wb, form, fields, responses);
  buildAnalysis(wb, fields, responses);

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

// ─── Sheet 1 : Portada ────────────────────────────────────────────────────────

function buildCover(
  wb: ExcelJS.Workbook,
  form: { title: string; description?: string | null },
  fields: FormField[],
  responses: FormResponse[],
  meta: FormExcelMeta,
) {
  const ws = wb.addWorksheet('Portada', { properties: { tabColor: { argb: C.indigo } } });
  ws.views = [{ state: 'normal', showGridLines: false }];

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 30;

  // ── banner rows 1-3 ──
  ws.mergeCells('A1:F3');
  const banner = ws.getCell('A1');
  banner.value = form.title;
  banner.font = { bold: true, size: 22, color: { argb: C.white }, name: 'Calibri' };
  banner.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  banner.fill = fill(C.indigo);
  ws.getRow(1).height = 60;

  if (form.description) {
    ws.mergeCells('A4:F5');
    const desc = ws.getCell('A4');
    desc.value = form.description;
    desc.font = { size: 11, color: { argb: C.slate700 }, italic: true, name: 'Calibri' };
    desc.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    desc.fill = fill(C.indigoLight);
    ws.getRow(4).height = 30;
  }

  // ── KPI cards row 7 (value) + 8 (label) ──
  const avgFields = fields.filter((f) => f.type === 'rating');
  let avgRating: string | null = null;
  if (avgFields.length && responses.length) {
    const total = responses.reduce((sum, r) => {
      const a = r.answers ?? {};
      return sum + avgFields.reduce((s2, f) => s2 + (Number(a[f.id]) || 0), 0) / avgFields.length;
    }, 0);
    avgRating = (total / responses.length).toFixed(1);
  }

  const kpis: Array<{ label: string; value: string | number; color: ARGB; textColor: ARGB }> = [
    { label: 'Total respuestas', value: responses.length,  color: C.indigo,  textColor: C.white },
    { label: 'Preguntas',        value: fields.length,      color: C.emerald, textColor: C.white },
    { label: 'Exportado el',     value: meta.exportedAt.toLocaleDateString('es-MX'), color: C.sky, textColor: C.white },
    { label: 'Exportado por',    value: meta.exportedBy,    color: C.violet,  textColor: C.white },
    ...(avgRating ? [{ label: 'Calif. promedio', value: `${avgRating} ★`, color: C.amber, textColor: C.slate900 }] : []),
  ];

  kpis.forEach((kpi, i) => {
    const col = i + 1;
    const vCell = ws.getCell(7, col);
    vCell.value = kpi.value;
    vCell.font = { bold: true, size: 18, color: { argb: kpi.textColor }, name: 'Calibri' };
    vCell.alignment = { vertical: 'middle', horizontal: 'center' };
    vCell.fill = fill(kpi.color);
    ws.getRow(7).height = 40;

    const lCell = ws.getCell(8, col);
    lCell.value = kpi.label;
    lCell.font = { size: 9, color: { argb: C.slate700 }, name: 'Calibri' };
    lCell.alignment = { vertical: 'middle', horizontal: 'center' };
    lCell.fill = fill(C.white);
    lCell.border = border(kpi.color);
    ws.getRow(8).height = 20;
  });

  // ── questions table header row 10 ──
  ws.mergeCells('A10:F10');
  const th = ws.getCell('A10');
  th.value = 'Preguntas del formulario';
  th.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' };
  th.alignment = { vertical: 'middle', horizontal: 'left' };
  th.fill = fill(C.indigoDark);
  ws.getRow(10).height = 22;

  // column sub-header row 11
  ['#', 'Pregunta', 'Tipo', 'Requerida', '', 'Opciones'].forEach((h, i) => {
    const cell = ws.getCell(11, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: C.slate700 }, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = fill(C.slate50);
    cell.border = border();
  });
  ws.getRow(11).height = 20;

  fields.forEach((f, idx) => {
    const r = 12 + idx;
    const rowFill = fill(idx % 2 === 0 ? C.white : C.slate50);
    const opts = Array.isArray(f.options) ? f.options.join(', ') : '';

    [idx + 1, f.label, TYPE_LABEL[f.type] ?? f.type, f.required ? 'Sí' : 'No', '', opts].forEach((v, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = v;
      cell.font = { size: 10, name: 'Calibri', color: { argb: C.slate900 } };
      cell.alignment = { vertical: 'middle', horizontal: ci === 0 ? 'center' : 'left', wrapText: true };
      cell.fill = rowFill;
      cell.border = border();
    });
    ws.getRow(r).height = 22;
  });
}

// ─── Sheet 2 : Respuestas ─────────────────────────────────────────────────────

function buildResponses(
  wb: ExcelJS.Workbook,
  form: { title: string },
  fields: FormField[],
  responses: FormResponse[],
) {
  const ws = wb.addWorksheet('Respuestas', { properties: { tabColor: { argb: C.emerald } } });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, showGridLines: false }];

  const totalCols = 4 + fields.length;

  // ── banner row 1 ──
  ws.mergeCells(1, 1, 1, Math.max(totalCols, 1));
  const banner = ws.getCell('A1');
  banner.value = `${form.title} — Respuestas`;
  banner.font = { bold: true, size: 14, color: { argb: C.white }, name: 'Calibri' };
  banner.alignment = { vertical: 'middle', horizontal: 'center' };
  banner.fill = fill(C.emerald);
  ws.getRow(1).height = 32;

  // ── header row 2 ──
  const allHeaders = ['Empleado', 'Correo', 'ID Empleado', 'Fecha de envío', ...fields.map((f) => f.label)];
  allHeaders.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = fill(C.emeraldDark);
    cell.border = border(C.emerald);
  });
  ws.getRow(2).height = 30;

  // ── data rows ──
  responses.forEach((r, idx) => {
    const u = r.user ?? null;
    const answers = (r.answers ?? {}) as Record<string, unknown>;
    const rowNum = 3 + idx;
    const rowFill = fill(idx % 2 === 0 ? C.white : C.emeraldLight);

    const vals: (string | number)[] = [
      u?.name ?? '',
      u?.email ?? '',
      u?.employee_id ?? '',
      new Date(r.submitted_at).toLocaleString('es-MX'),
      ...fields.map((f) => {
        const v = answers[f.id];
        return Array.isArray(v) ? (v as string[]).join(', ') : String(v ?? '');
      }),
    ];

    vals.forEach((v, ci) => {
      const cell = ws.getCell(rowNum, ci + 1);
      cell.value = v;
      cell.font = { size: 10, name: 'Calibri', color: { argb: C.slate900 } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      cell.fill = rowFill;
      cell.border = border();
    });
    ws.getRow(rowNum).height = 20;
  });

  if (responses.length > 0) {
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: totalCols } };
  }

  // ── column widths ──
  [22, 28, 14, 20, ...fields.map(() => 24)].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ─── Sheet 3 : Análisis ───────────────────────────────────────────────────────

function buildAnalysis(
  wb: ExcelJS.Workbook,
  fields: FormField[],
  responses: FormResponse[],
) {
  const ws = wb.addWorksheet('Análisis', { properties: { tabColor: { argb: C.violet } } });
  ws.views = [{ state: 'normal', showGridLines: false }];
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 50;

  let row = 1;

  // banner
  ws.mergeCells(row, 1, row, 4);
  const banner = ws.getCell(row, 1);
  banner.value = 'Análisis por pregunta';
  banner.font = { bold: true, size: 14, color: { argb: C.white }, name: 'Calibri' };
  banner.alignment = { vertical: 'middle', horizontal: 'center' };
  banner.fill = fill(C.violet);
  ws.getRow(row).height = 32;
  row += 2;

  fields.forEach((f, fi) => {
    const answers = responses
      .map((r) => (r.answers ?? {})[f.id])
      .filter((v) => v !== undefined && v !== null && v !== '');

    // question header
    ws.mergeCells(row, 1, row, 4);
    const qh = ws.getCell(row, 1);
    qh.value = `${fi + 1}. ${f.label}`;
    qh.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' };
    qh.alignment = { vertical: 'middle', horizontal: 'left' };
    qh.fill = fill(C.violetDark);
    ws.getRow(row).height = 24;
    row++;

    ws.getCell(row, 1).value = TYPE_LABEL[f.type] ?? f.type;
    ws.getCell(row, 1).font = { size: 9, italic: true, color: { argb: C.slate500 }, name: 'Calibri' };
    ws.getCell(row, 2).value = `${answers.length} respuesta(s)`;
    ws.getCell(row, 2).font = { size: 9, italic: true, color: { argb: C.slate500 }, name: 'Calibri' };
    ws.getRow(row).height = 16;
    row++;

    if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'select') {
      const freq: Record<string, number> = {};
      answers.forEach((v) => {
        const vals = Array.isArray(v) ? (v as string[]) : [String(v)];
        vals.forEach((s) => { freq[s] = (freq[s] ?? 0) + 1; });
      });
      const total = Object.values(freq).reduce((a, b) => a + b, 0) || 1;
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

      ['Opción', 'Respuestas', '%', 'Barra'].forEach((h, ci) => {
        const cell = ws.getCell(row, ci + 1);
        cell.value = h;
        cell.font = { bold: true, size: 9, color: { argb: C.violetDark }, name: 'Calibri' };
        cell.fill = fill(C.violetLight);
        cell.border = border(C.violet);
        cell.alignment = { horizontal: 'center' };
      });
      ws.getRow(row).height = 18;
      row++;

      sorted.forEach(([opt, cnt], i) => {
        const pct = cnt / total;
        const barLen = Math.round(pct * 30);
        const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
        [opt, cnt, `${(pct * 100).toFixed(1)}%`, bar].forEach((v, ci) => {
          const cell = ws.getCell(row, ci + 1);
          cell.value = v;
          cell.font = { size: 10, name: ci === 3 ? 'Courier New' : 'Calibri', color: { argb: ci === 3 ? C.violet : C.slate900 } };
          cell.alignment = { horizontal: ci === 0 ? 'left' : 'center', vertical: 'middle' };
          cell.fill = fill(i % 2 === 0 ? C.white : C.violetLight);
          cell.border = border();
        });
        ws.getRow(row).height = 18;
        row++;
      });

    } else if (f.type === 'rating') {
      const nums = answers.map((v) => Number(v)).filter((n) => !isNaN(n));
      const avg  = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      const max  = f.validation?.max ?? 5;

      ws.getCell(row, 1).value = 'Promedio';
      ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: C.slate700 }, name: 'Calibri' };
      ws.getCell(row, 2).value = avg.toFixed(2);
      ws.getCell(row, 2).font = { bold: true, size: 14, color: { argb: C.amber }, name: 'Calibri' };
      ws.getCell(row, 3).value = `/ ${max}`;
      ws.getCell(row, 3).font = { size: 10, color: { argb: C.slate500 }, name: 'Calibri' };
      ws.getRow(row).height = 22;
      row++;

      ['Calificación', 'Respuestas', '%', 'Barra'].forEach((h, ci) => {
        const cell = ws.getCell(row, ci + 1);
        cell.value = h;
        cell.font = { bold: true, size: 9, color: { argb: C.amber }, name: 'Calibri' };
        cell.fill = fill('FFFFF8E7');
        cell.border = border(C.amber);
        cell.alignment = { horizontal: 'center' };
      });
      ws.getRow(row).height = 18;
      row++;

      for (let star = max; star >= 1; star--) {
        const cnt = nums.filter((n) => n === star).length;
        const pct = nums.length ? cnt / nums.length : 0;
        const barLen = Math.round(pct * 20);
        const bar = '★'.repeat(barLen) + '☆'.repeat(20 - barLen);
        ['★'.repeat(star), cnt, `${(pct * 100).toFixed(1)}%`, bar].forEach((v, ci) => {
          const cell = ws.getCell(row, ci + 1);
          cell.value = v;
          cell.font = { size: 10, name: ci === 3 ? 'Courier New' : 'Calibri', color: { argb: ci === 0 ? C.amber : C.slate900 } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = fill(row % 2 === 0 ? C.white : 'FFFFF8E7');
          cell.border = border();
        });
        ws.getRow(row).height = 18;
        row++;
      }

    } else {
      const shown = answers.slice(0, 50);
      shown.forEach((v, i) => {
        ws.getCell(row, 1).value = String(v);
        ws.getCell(row, 1).font = { size: 10, name: 'Calibri', color: { argb: C.slate700 } };
        ws.getCell(row, 1).fill = fill(i % 2 === 0 ? C.white : C.slate50);
        ws.getCell(row, 1).border = border();
        ws.getRow(row).height = 18;
        row++;
      });
      if (answers.length > 50) {
        ws.getCell(row, 1).value = `… y ${answers.length - 50} más`;
        ws.getCell(row, 1).font = { size: 9, italic: true, color: { argb: C.slate500 }, name: 'Calibri' };
        row++;
      }
    }

    row += 2;
  });
}
