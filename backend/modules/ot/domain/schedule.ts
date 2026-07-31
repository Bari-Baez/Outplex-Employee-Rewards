import type { CSVRow, OTSlot } from '@shared/contracts/database';
import { calcDuration, getShiftLabel, parseFlexibleTime, parseOTDate, parseSpanishTime } from '@backend/modules/ot/domain/time';
import type { OTDateFormat, OTMeridiem } from '@backend/modules/ot/domain/time';

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
export type OcrParseLayout = 'header' | 'five-column' | 'four-column' | 'wide-export' | 'partial' | 'none' | 'mixed';
export type OcrParseIssue =
  | {
      type: 'missing-field';
      rowIndex: number;
      field: 'spot_id' | 'date' | 'start_time' | 'end_time';
      line: string;
    }
  | {
      type: 'ambiguous-time';
      rowIndex: number;
      field: 'start_time' | 'end_time';
      rawValue: string;
      line: string;
    };
export type OcrParseResult = {
  rows: CSVRow[];
  issues: OcrParseIssue[];
  detectedHeaders: boolean;
  inferredLayout: OcrParseLayout;
  sourceLineCount: number;
  unparsedLineCount: number;
};

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

// Column names that represent total hours — mapped to duration_hrs during normalization
const DURATION_ALIASES = ['total', 'duration', 'hours', 'hrs', 'total_hrs'] as const;

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

export function getOTSlotPublishedAt(
  slot: Pick<OTSlot, 'created_at'> & { batch?: Pick<NonNullable<OTSlot['batch']>, 'published_at'> | null },
) {
  return slot.batch?.published_at ?? slot.created_at;
}

export function isOTSlotRecentlyAdded(
  slot: Pick<OTSlot, 'created_at'> & { batch?: Pick<NonNullable<OTSlot['batch']>, 'published_at'> | null },
  currentDate = new Date(),
  windowDays = 5,
) {
  const publishedAt = getOTSlotPublishedAt(slot);
  const publishedTime = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedTime)) {
    return false;
  }

  return currentDate.getTime() - publishedTime <= windowDays * 24 * 60 * 60 * 1000;
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

  // Promote duration column aliases (e.g. Gemini's "total") to duration_hrs when duration_hrs is absent
  if (!String(normalizedRow.duration_hrs ?? '').trim()) {
    for (const alias of DURATION_ALIASES) {
      const v = String(normalizedRow[alias] ?? '').trim();
      if (v && Number(v) > 0) {
        normalizedRow.duration_hrs = Number(v);
        break;
      }
    }
  }

  normalizedRow.date = parseOTDate(String(normalizedRow.date ?? ''), dateFormat);
  normalizedRow.start_time = parseSpanishTime(String(normalizedRow.start_time ?? ''));
  normalizedRow.end_time = parseSpanishTime(String(normalizedRow.end_time ?? ''));

  // Auto-calculate duration only when it is not already set (preserves manually entered values)
  if (!String(normalizedRow.duration_hrs ?? '').trim() && normalizedRow.start_time && normalizedRow.end_time) {
    normalizedRow.duration_hrs = calcDuration(
      String(normalizedRow.start_time),
      String(normalizedRow.end_time),
    );
  }

  if (normalizedRow.start_time && normalizedRow.end_time) {
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
  return parseOcrContent({ text, dateFormat }).rows;
}

const OCR_DATE_PATTERN = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})$/;
const OCR_TIME_PATTERN = /^\d{1,2}(?::\d{2})?(?::\d{2})?(?:[ap]m)?$/i;
const OCR_MERIDIEM_PATTERN = /^(?:a|p)?m$/i;
const OCR_DURATION_PATTERN = /^\d+(?:\.\d+)?$/;
const OCR_STATUS_PATTERN = /^(available|claimed|pending|cancelled)$/i;
const OCR_SPOT_ID_PATTERN = /^\d{4,8}$/;

type ParsedOcrDraft = {
  row: CSVRow;
  layout: Exclude<OcrParseLayout, 'none' | 'mixed' | 'header'>;
  ambiguousTimes: Array<{ field: 'start_time' | 'end_time'; rawValue: string }>;
};

type OcrTimeChunk = {
  rawValue: string;
  startIndex: number;
  endIndex: number;
};

export function parseOcrContent({
  text,
  tsv,
  dateFormat = 'auto',
  defaultMeridiem = null,
}: {
  text: string;
  tsv?: string | null;
  dateFormat?: OTDateFormat;
  defaultMeridiem?: OTMeridiem | null;
}): OcrParseResult {
  const lines = collectParsedOcrLines(text, tsv);
  const rows: CSVRow[] = [];
  const issues: OcrParseIssue[] = [];
  const layouts = new Set<Exclude<OcrParseLayout, 'none' | 'mixed' | 'header'>>();
  let detectedHeaders = false;
  let unparsedLineCount = 0;

  lines.forEach((line) => {
    if (isParsedOcrHeaderLine(line)) {
      detectedHeaders = true;
      return;
    }

    const parsed = parseStructuredOcrDraft(line, dateFormat, defaultMeridiem);
    if (!parsed) {
      unparsedLineCount += 1;
      return;
    }

    const rowIndex = rows.length;
    rows.push(parsed.row);
    layouts.add(parsed.layout);

    if (!String(parsed.row.spot_id ?? '').trim()) {
      issues.push({ type: 'missing-field', rowIndex, field: 'spot_id', line });
    }
    if (!String(parsed.row.date ?? '').trim()) {
      issues.push({ type: 'missing-field', rowIndex, field: 'date', line });
    }
    if (!String(parsed.row.start_time ?? '').trim()) {
      const ambiguous = parsed.ambiguousTimes.find((issue) => issue.field === 'start_time');
      issues.push(
        ambiguous
          ? { type: 'ambiguous-time', rowIndex, field: 'start_time', rawValue: ambiguous.rawValue, line }
          : { type: 'missing-field', rowIndex, field: 'start_time', line },
      );
    }
    if (!String(parsed.row.end_time ?? '').trim()) {
      const ambiguous = parsed.ambiguousTimes.find((issue) => issue.field === 'end_time');
      issues.push(
        ambiguous
          ? { type: 'ambiguous-time', rowIndex, field: 'end_time', rawValue: ambiguous.rawValue, line }
          : { type: 'missing-field', rowIndex, field: 'end_time', line },
      );
    }
  });

  const inferredLayout =
    layouts.size === 0
      ? 'none'
      : layouts.size === 1
        ? Array.from(layouts)[0]
        : 'mixed';

  return {
    rows,
    issues,
    detectedHeaders,
    inferredLayout,
    sourceLineCount: lines.length,
    unparsedLineCount,
  };
}

function collectParsedOcrLines(text: string, tsv?: string | null) {
  return Array.from(
    new Set(
      [
        ...extractParsedOcrLinesFromTsv(tsv),
        ...text
          .split(/\r?\n/)
          .map((line) => normalizeOcrLine(line))
          .filter(Boolean),
      ].filter(Boolean),
    ),
  );
}

function extractParsedOcrLinesFromTsv(tsv?: string | null) {
  if (!tsv?.trim()) {
    return [];
  }

  const [headerLine, ...rawLines] = tsv.trim().split(/\r?\n/);
  const headers = headerLine.split('\t');
  const indexMap = Object.fromEntries(headers.map((header, index) => [header, index])) as Record<string, number>;
  const grouped = new Map<string, Array<{ left: number; text: string }>>();

  rawLines.forEach((rawLine) => {
    const cells = rawLine.split('\t');
    const level = Number(cells[indexMap.level]);
    const textValue = cells[indexMap.text]?.trim();
    if (level !== 5 || !textValue) {
      return;
    }

    const key = [
      cells[indexMap.page_num],
      cells[indexMap.block_num],
      cells[indexMap.par_num],
      cells[indexMap.line_num],
    ].join(':');
    const left = Number(cells[indexMap.left] ?? '0');
    const words = grouped.get(key) ?? [];
    words.push({ left, text: textValue });
    grouped.set(key, words);
  });

  return Array.from(grouped.values())
    .map((words) =>
      normalizeOcrLine(
        words
          .sort((left, right) => left.left - right.left)
          .map((word) => word.text)
          .join(' '),
      ),
    )
    .filter(Boolean);
}

function isParsedOcrHeaderLine(line: string) {
  const lower = line.toLowerCase();
  // Must contain both start + end time headers
  if (!lower.includes('start') || !lower.includes('end')) return false;
  // Must also contain at least one additional structural keyword
  return (
    lower.includes('date') ||
    lower.includes('total') ||
    lower.includes('duration') ||
    lower.includes('id') ||
    lower.includes('spot') ||
    lower.includes('status') ||
    lower.includes('shift') ||
    lower.includes('lob')
  );
}

function tokenizeParsedOcrLine(line: string) {
  return normalizeOcrLine(line)
    .split(' ')
    .map((token) => token.trim().replace(/^[,;]+|[,;]+$/g, ''))
    .filter(Boolean);
}

function getParsedOcrTimeChunks(tokens: string[]) {
  const chunks: OcrTimeChunk[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].replace(/\s+/g, '');
    if (!OCR_TIME_PATTERN.test(token)) {
      continue;
    }

    const nextToken = tokens[index + 1]?.replace(/\s+/g, '') ?? '';
    if (!token.match(/[ap]m$/i) && OCR_MERIDIEM_PATTERN.test(nextToken)) {
      chunks.push({
        rawValue: `${tokens[index]} ${tokens[index + 1]}`,
        startIndex: index,
        endIndex: index + 1,
      });
      index += 1;
      continue;
    }

    chunks.push({
      rawValue: tokens[index],
      startIndex: index,
      endIndex: index,
    });
  }

  return chunks;
}

function parseStructuredOcrDraft(
  line: string,
  dateFormat: OTDateFormat,
  defaultMeridiem: OTMeridiem | null,
): ParsedOcrDraft | null {
  const tokens = tokenizeParsedOcrLine(line);
  if (tokens.length < 2) {
    return null;
  }

  const dateIndex = tokens.findIndex((token) => OCR_DATE_PATTERN.test(token));
  const timeChunks = getParsedOcrTimeChunks(tokens);
  const firstSpotIdIndex = tokens.findIndex((token) => OCR_SPOT_ID_PATTERN.test(token));

  // Must have at least a date OR at least one time chunk OR a spot ID to be worth parsing
  if (dateIndex === -1 && timeChunks.length === 0) {
    return null;
  }

  const startChunk =
    timeChunks.find((chunk) => chunk.startIndex > dateIndex) ??
    timeChunks.find((chunk) => chunk.startIndex > firstSpotIdIndex) ??
    timeChunks[0];
  const endChunk =
    timeChunks.find((chunk) => startChunk && chunk.startIndex > startChunk.endIndex) ?? null;

  // spotId must appear before the date (it's the row identifier)
  const spotIdIndex =
    firstSpotIdIndex !== -1 && (dateIndex === -1 || firstSpotIdIndex < dateIndex)
      ? firstSpotIdIndex
      : -1;
  const spotId = spotIdIndex !== -1 ? tokens[spotIdIndex] : '';

  // Everything between spotId and date (or first time chunk) is the LOB
  const lobStart = spotIdIndex !== -1 ? spotIdIndex + 1 : 0;
  const lobEnd = dateIndex !== -1
    ? dateIndex
    : startChunk
      ? startChunk.startIndex
      : tokens.length;
  const lobTokens = tokens.slice(lobStart, lobEnd).filter(
    (t) => !OCR_SPOT_ID_PATTERN.test(t) && !OCR_DATE_PATTERN.test(t),
  );

  const trailingTokens = endChunk ? tokens.slice(endChunk.endIndex + 1) : [];
  const durationToken = trailingTokens.find((token) => OCR_DURATION_PATTERN.test(token)) ?? '';
  const statusToken = trailingTokens.find((token) => OCR_STATUS_PATTERN.test(token)) ?? '';

  const ambiguousTimes: ParsedOcrDraft['ambiguousTimes'] = [];
  const resolveTime = (field: 'start_time' | 'end_time', rawValue: string) => {
    if (!rawValue) {
      return '';
    }
    const parsed = parseFlexibleTime(rawValue, { defaultMeridiem });
    if (parsed.isAmbiguous) {
      ambiguousTimes.push({ field, rawValue });
      return '';
    }
    return parsed.value || parseSpanishTime(rawValue);
  };

  const draftRow: CSVRow = {
    spot_id: spotId,
    lob: lobTokens.join(' '),
    date: dateIndex !== -1 ? tokens[dateIndex] : '',
    start_time: resolveTime('start_time', startChunk?.rawValue ?? ''),
    end_time: resolveTime('end_time', endChunk?.rawValue ?? ''),
    duration_hrs: durationToken ? Number(durationToken) : undefined,
    csv_status: statusToken,
  };

  if (
    !String(draftRow.spot_id ?? '').trim() &&
    !String(draftRow.date ?? '').trim() &&
    !String(draftRow.start_time ?? '').trim() &&
    !String(draftRow.end_time ?? '').trim()
  ) {
    return null;
  }

  const layout: ParsedOcrDraft['layout'] =
    lobTokens.length > 0
      ? 'wide-export'
      : durationToken
        ? 'five-column'
        : dateIndex !== -1 && startChunk && endChunk
          ? 'four-column'
          : 'partial';

  return {
    row: normalizeOTRow(draftRow, dateFormat),
    layout,
    ambiguousTimes,
  };
}

function normalizeOcrLine(line: string) {
  return line
    // Excel/Sheets UI artifacts: filter arrows, sort icons
    .replace(/[\u25bc\u25bd\u25be\u25bf\u25b2\u25b3\u25b4\u25b8\u25c0\u25c2]/g, '')
    // Standalone asterisks (e.g. flagged rows in Excel) \u2014 not between digits
    .replace(/(?<!\d)\*(?!\d)/g, '')
    // Structural characters that fragment tokens
    .replace(/[|[\]{}]/g, ' ')
    // Smart quotes and typographic dashes
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    // Bullets, middle dots
    .replace(/[\u2022\u00b7]/g, ' ')
    // Common Tesseract OCR misreads in number sequences
    .replace(/\bI(?=\d)/g, '1')
    .replace(/\bl(?=\d)/g, '1')
    .replace(/\bO(?=\d)/g, '0')
    .replace(/(?<=\d)O\b/g, '0')
    .replace(/(?<=\d)l\b/g, '1')
    // Period-separated time (8.30 \u2192 8:30)
    .replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2')
    // Ensure space between time and meridiem (8:30AM \u2192 8:30 AM)
    .replace(/(\d{1,2}(?::\d{2})?)([AaPp][Mm])\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
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
