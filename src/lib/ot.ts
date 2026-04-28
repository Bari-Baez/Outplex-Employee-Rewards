import type { CSVRow } from '@/types/database';
import {
  calcDuration,
  getShiftLabel,
  parseOTDate,
  parseSpanishTime,
  type OTDateFormat,
} from '@/lib/utils';

export const OT_APP_TIMEZONE = 'America/Santo_Domingo';

export const CORE_OT_COLUMNS = [
  'spot_id',
  'lob',
  'date',
  'start_time',
  'end_time',
  'duration_hrs',
  'shift_label',
  'csv_status',
] as const;

export const OT_LOB_OPTIONS = ['NYT VOICE', 'NYT CHAT', 'NYT EMAIL'] as const;
export type OTLob = (typeof OT_LOB_OPTIONS)[number];

export function canonicalizeOTLob(input: unknown): OTLob {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return 'NYT VOICE';

  const lower = raw.toLowerCase();

  // Known legacy values / aliases
  if (lower.includes('universal') && lower.includes('voice')) return 'NYT VOICE';
  if (lower.includes('audio') && lower.includes('desk')) return 'NYT CHAT';
  if (lower.includes('chat')) return 'NYT CHAT';
  if (lower.includes('email')) return 'NYT EMAIL';
  if (lower.includes('voice')) return 'NYT VOICE';

  // Fallback: default to VOICE (keeps charts/filters stable)
  return 'NYT VOICE';
}

const OT_COLUMN_LABELS: Record<string, string> = {
  spot_id: 'Spot ID',
  lob: 'LOB',
  date: 'Date',
  start_time: 'Start Time',
  end_time: 'End Time',
  duration_hrs: 'Duration (Hours)',
  shift_label: 'Shift Label',
  csv_status: 'Original Status',
  employee_name: 'Employee Name',
  employee_id: 'Employee ID',
  employee_email: 'Employee Email',
  employee_superior: 'Superior',
  ot_status: 'OT Status',
};

type FormulaScope = 'all' | 'selected' | 'blank-only';

const RESERVED_ROW_KEYS = new Set(['id', '_rowIndex']);

function sanitizeCellValue(value: string | number | undefined, shouldTrim = true) {
  if (typeof value === 'number') {
    return value;
  }

  const raw = typeof value === 'string' ? value : '';
  return shouldTrim ? raw.trim() : raw;
}

export function getOTColumnLabel(column: string) {
  if (OT_COLUMN_LABELS[column]) {
    return OT_COLUMN_LABELS[column];
  }

  return column
    .split('_')
    .filter(Boolean)
    .map((segment) => {
      if (segment.toLowerCase() === 'id') {
        return 'ID';
      }

      if (segment.toLowerCase() === 'lob') {
        return 'LOB';
      }

      return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
    })
    .join(' ');
}

export function getCurrentOTDateTime(now = new Date(), timeZone = OT_APP_TIMEZONE) {
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const time = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return { date, time };
}

export function shiftOTDate(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getOTMonthStart(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

export function getOTFortnightRange(dateIso: string) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startDay = day <= 15 ? 1 : 16;
  const endDay = day <= 15 ? 15 : lastDay;

  return {
    start: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
  };
}

export function isOTSlotUpcoming(
  slot: Pick<CSVRow, 'date' | 'end_time'>,
  current = getCurrentOTDateTime(),
) {
  const slotEnd = String(slot.end_time ?? '').slice(0, 5);
  return slot.date > current.date || (slot.date === current.date && slotEnd >= current.time);
}

export function isOTSlotCompleted(
  slot: Pick<CSVRow, 'date' | 'end_time'>,
  current = getCurrentOTDateTime(),
) {
  return !isOTSlotUpcoming(slot, current);
}

export function normalizeOTRow(
  row: CSVRow,
  dateFormat: OTDateFormat = 'auto',
  shouldTrim = true,
): CSVRow {
  const normalizedRow: CSVRow = {
    date: '',
    start_time: '',
    end_time: '',
  };

  Object.entries(row).forEach(([key, value]) => {
    if (RESERVED_ROW_KEYS.has(key)) {
      return;
    }

    normalizedRow[key] = sanitizeCellValue(value, shouldTrim);
  });

  normalizedRow.date = parseOTDate(String(normalizedRow.date ?? ''), dateFormat);
  normalizedRow.start_time = parseSpanishTime(String(normalizedRow.start_time ?? ''));
  normalizedRow.end_time = parseSpanishTime(String(normalizedRow.end_time ?? ''));

  if (normalizedRow.start_time && normalizedRow.end_time) {
    normalizedRow.duration_hrs = calcDuration(
      String(normalizedRow.start_time),
      String(normalizedRow.end_time),
    );
    normalizedRow.shift_label =
      String(normalizedRow.shift_label ?? '').trim() || getShiftLabel(String(normalizedRow.start_time));
  } else if (!String(normalizedRow.shift_label ?? '').trim() && normalizedRow.start_time) {
    normalizedRow.shift_label = getShiftLabel(String(normalizedRow.start_time));
  }

  const lobValue = String(normalizedRow.lob ?? '').trim();
  normalizedRow.lob = canonicalizeOTLob(lobValue);

  if (!String(normalizedRow.csv_status ?? '').trim()) {
    normalizedRow.csv_status = 'Pending';
  }

  return normalizedRow;
}

export function sanitizeOTRows(rows: CSVRow[], dateFormat: OTDateFormat = 'auto') {
  return rows.map((row) => normalizeOTRow(row, dateFormat));
}

export function getOTColumns(rows: CSVRow[]) {
  const extras = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!RESERVED_ROW_KEYS.has(key) && !CORE_OT_COLUMNS.includes(key as (typeof CORE_OT_COLUMNS)[number])) {
        extras.add(key);
      }
    });
  });

  return [...CORE_OT_COLUMNS, ...Array.from(extras).sort()];
}

export function createEmptyOTRow(columns: string[] = [...CORE_OT_COLUMNS]) {
  const row: CSVRow = {
    date: '',
    start_time: '',
    end_time: '',
  };

  columns.forEach((column) => {
    row[column] = column === 'lob' ? 'NYT VOICE' : '';
  });

  row.csv_status = String(row.csv_status ?? 'Pending');

  return normalizeOTRow(row);
}

function splitFormulaArgs(rawArgs: string) {
  const args: string[] = [];
  let current = '';
  let quoteChar = '';

  for (const char of rawArgs) {
    if ((char === '"' || char === "'") && !quoteChar) {
      quoteChar = char;
      current += char;
      continue;
    }

    if (char === quoteChar) {
      quoteChar = '';
      current += char;
      continue;
    }

    if (char === ',' && !quoteChar) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function resolveFormulaArg(token: string, row: CSVRow, dateFormat: OTDateFormat) {
  const trimmed = token.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseOTDate(trimmed, dateFormat);
  }

  return String(row[trimmed] ?? '');
}

export function evaluateOTFormula(
  expression: string,
  row: CSVRow,
  targetColumn: string,
  dateFormat: OTDateFormat = 'auto',
) {
  const formula = expression.trim();
  if (!formula) {
    return '';
  }

  if (!formula.startsWith('=')) {
    return formula;
  }

  const body = formula.slice(1).trim();

  if (/^TODAY\(\)$/i.test(body)) {
    return new Date().toISOString().slice(0, 10);
  }

  let match = body.match(/^SHIFT\(([\w_]+)\)$/i);
  if (match) {
    return getShiftLabel(String(row[match[1]] ?? ''));
  }

  match = body.match(/^DURATION\(([\w_]+)\s*,\s*([\w_]+)\)$/i);
  if (match) {
    const startValue = String(row[match[1]] ?? '');
    const endValue = String(row[match[2]] ?? '');
    if (!startValue || !endValue) {
      return '';
    }

    return calcDuration(startValue, endValue);
  }

  match = body.match(/^COPY\(([\w_]+)\)$/i);
  if (match) {
    return String(row[match[1]] ?? '');
  }

  match = body.match(/^UPPER\(([\w_]+)\)$/i);
  if (match) {
    return String(row[match[1]] ?? '').toUpperCase();
  }

  match = body.match(/^LOWER\(([\w_]+)\)$/i);
  if (match) {
    return String(row[match[1]] ?? '').toLowerCase();
  }

  match = body.match(/^TRIM\(([\w_]+)\)$/i);
  if (match) {
    return String(row[match[1]] ?? '').trim();
  }

  match = body.match(/^DATE\((.+)\)$/i);
  if (match) {
    return parseOTDate(String(resolveFormulaArg(match[1], row, dateFormat)), dateFormat);
  }

  match = body.match(/^TEXT\((.+)\)$/i);
  if (match) {
    return String(resolveFormulaArg(match[1], row, dateFormat));
  }

  match = body.match(/^CONCAT\((.+)\)$/i);
  if (match) {
    return splitFormulaArgs(match[1])
      .map((arg) => resolveFormulaArg(arg, row, dateFormat))
      .join('');
  }

  if (/^\{[\w_]+\}$/.test(body)) {
    return String(row[body.slice(1, -1)] ?? '');
  }

  if (targetColumn === 'shift_label' && body.toUpperCase() === 'AUTO') {
    return getShiftLabel(String(row.start_time ?? ''));
  }

  return String(row[targetColumn] ?? '');
}

export function applyFormulaToRows({
  rows,
  expression,
  targetColumn,
  scope,
  selectedIndexes,
  dateFormat = 'auto',
}: {
  rows: CSVRow[];
  expression: string;
  targetColumn: string;
  scope: FormulaScope;
  selectedIndexes: Set<number>;
  dateFormat?: OTDateFormat;
}) {
  return rows.map((row, index) => {
    const isSelected = selectedIndexes.has(index);
    const shouldApply =
      scope === 'all' ||
      (scope === 'selected' && isSelected) ||
      (scope === 'blank-only' &&
        (String(row[targetColumn] ?? '').trim() === '') &&
        (selectedIndexes.size === 0 || isSelected));

    if (!shouldApply) {
      return row;
    }

    return normalizeOTRow(
      {
        ...row,
        [targetColumn]: evaluateOTFormula(expression, row, targetColumn, dateFormat),
      },
      dateFormat,
    );
  });
}

export function parseOcrTextToRows(text: string, dateFormat: OTDateFormat = 'auto') {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeOcrLine(line))
    .filter(Boolean);

  const rows: CSVRow[] = [];
  const rowPattern =
    /^(?:\d+\s+)?(?:(\d{4,8})\s+)?(.+?)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)?)\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)?)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(Morning Shift|Afternoon Shift|Evening Shift|Night Shift))?(?:\s+(available|claimed|pending|cancelled))?/i;

  lines.forEach((line) => {
    if (!/\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(line)) {
      return;
    }

    if ((line.match(/\d{1,2}[:.]\d{2}(?::\d{2})?/g) ?? []).length < 2) {
      return;
    }

    const match = line.match(rowPattern);

    if (match) {
      rows.push(
        normalizeOTRow(
          {
            spot_id: match[1] ?? '',
            lob: match[2] ?? '',
            date: match[3] ?? '',
            start_time: match[4] ?? '',
            end_time: match[5] ?? '',
            duration_hrs: match[6] ? Number(match[6]) : undefined,
            shift_label: match[7] ?? '',
            csv_status: match[8] ?? '',
          },
          dateFormat,
        ),
      );
      return;
    }

    const structuredRow = parseStructuredOcrLine(line, dateFormat);
    if (structuredRow) {
      rows.push(structuredRow);
    }
  });

  return rows;
}

function normalizeOcrLine(line: string) {
  return line
    .replace(/[|[\]]/g, ' ')
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€“â€”]/g, '-')
    .replace(/[•·]/g, ' ')
    .replace(/[Il](?=\d)/g, '1')
    .replace(/[Oo](?=\d)/g, '0')
    .replace(/(\d)\.(\d{2})(?!\d)/g, '$1:$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStructuredOcrLine(line: string, dateFormat: OTDateFormat) {
  const dateMatch = line.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
  if (!dateMatch || typeof dateMatch.index !== 'number') {
    return null;
  }

  const timeMatches = Array.from(
    line.matchAll(/\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)?/gi),
  );
  if (timeMatches.length < 2) {
    return null;
  }

  const dateToken = dateMatch[0];
  const startToken = timeMatches[0]?.[0] ?? '';
  const endToken = timeMatches[1]?.[0] ?? '';
  const secondTimeIndex = timeMatches[1]?.index;

  if (typeof secondTimeIndex !== 'number') {
    return null;
  }

  const leadingSegment = line.slice(0, dateMatch.index).trim();
  const withoutLineNumber = leadingSegment.replace(/^\d+\s+(?=\d{4,8}\b)/, '');
  const spotMatch =
    withoutLineNumber.match(/^(\d{4,8})\b/) ??
    withoutLineNumber.match(/\b(\d{4,8})\b/);
  const spotId = spotMatch?.[1] ?? '';
  const lob = spotId
    ? withoutLineNumber.replace(spotId, '').trim()
    : withoutLineNumber.trim();

  const trailingSegment = line.slice(secondTimeIndex + endToken.length).trim();
  const durationMatch = trailingSegment.match(/\b(\d+(?:\.\d+)?)\b/);
  const shiftMatch = trailingSegment.match(
    /\b(Morning Shift|Afternoon Shift|Evening Shift|Night Shift)\b/i,
  );
  const statusMatch = trailingSegment.match(/\b(available|claimed|pending|cancelled)\b/i);

  return normalizeOTRow(
    {
      spot_id: spotId,
      lob,
      date: dateToken,
      start_time: startToken.replace('.', ':'),
      end_time: endToken.replace('.', ':'),
      duration_hrs: durationMatch ? Number(durationMatch[1]) : undefined,
      shift_label: shiftMatch?.[1] ?? '',
      csv_status: statusMatch?.[1] ?? '',
    },
    dateFormat,
  );
}

export function rowsToCsv(rows: CSVRow[], columns = getOTColumns(rows)) {
  const escape = (value: string | number | undefined) => {
    const stringValue = String(value ?? '');
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
  ];

  return lines.join('\n');
}

export function getUnclaimWindowRemainingMs(claimedAt: string | null, windowMs = 20 * 60 * 1000) {
  if (!claimedAt) {
    return 0;
  }

  return Math.max(0, windowMs - (Date.now() - new Date(claimedAt).getTime()));
}

export function isUnclaimWindowOpen(claimedAt: string | null, windowMs = 20 * 60 * 1000) {
  return getUnclaimWindowRemainingMs(claimedAt, windowMs) > 0;
}

export function timeStringToMinutes(time: string) {
  const [hours, minutes] = String(time ?? '')
    .slice(0, 5)
    .split(':')
    .map((value) => Number(value));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

export function doOTTimeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) {
  const startMinutesA = timeStringToMinutes(startA);
  let endMinutesA = timeStringToMinutes(endA);
  const startMinutesB = timeStringToMinutes(startB);
  let endMinutesB = timeStringToMinutes(endB);

  if (endMinutesA <= startMinutesA) {
    endMinutesA += 24 * 60;
  }

  if (endMinutesB <= startMinutesB) {
    endMinutesB += 24 * 60;
  }

  return startMinutesA < endMinutesB && startMinutesB < endMinutesA;
}
