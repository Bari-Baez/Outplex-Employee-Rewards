/**
 * NYT Breaks & Lunches — Core Utilities
 * Handles CSV parsing, name matching, and timezone logic for Santo Domingo (UTC-4, no DST).
 */

import type { DailySchedule, HourType } from '@shared/contracts/database';
import type { User } from '@shared/contracts/database';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SANTO_DOMINGO_TZ = 'America/Santo_Domingo';

/** Fixed break durations per business rules */
export const BREAK_DURATION_MINUTES: Record<string, number> = {
  first_break:   15,
  lunch:         30,
  second_break:  15,
  third_break:   15,
  bath_time:      0, // no fixed duration
};

/**
 * Column aliases to support variations in the NYT Excel header names.
 * Maps normalized header → canonical field name.
 */
export const CSV_COLUMN_MAP: Record<string, string> = {
  // Date
  'sch in date':      'schedule_date',
  'sch date':         'schedule_date',
  'date':             'schedule_date',
  'schedule date':    'schedule_date',
  'fecha':            'schedule_date',
  'fec hor in':       'schedule_date',
  // Day name
  'sch in day name':  'day_name',
  'day name':         'day_name',
  'dia':              'day_name',
  // Employee identifiers
  'aws id':           'aws_id',
  'email':            'aws_id',
  'opx id':           'opx_id',
  'agent id':         'opx_id',
  'id':               'opx_id',
  // LOB
  'lob':              'lob',
  'nyt lob':          'lob',
  'line of business': 'lob',
  'departamento':     'lob',
  'campaña':          'lob',
  // Name
  'agent name':       'agent_name',
  'employee name':    'agent_name',
  'name':             'agent_name',
  'empleado':         'agent_name',
  'nombre':           'agent_name',
  // Shift times
  'sch in':           'shift_start',
  'shift in':         'shift_start',
  'start time':       'shift_start',
  'entrada':          'shift_start',
  'sch out':          'shift_end',
  'shift out':        'shift_end',
  'end time':         'shift_end',
  'salida':           'shift_end',
  // Shift length
  'total':            'shift_length',
  'shift length':     'shift_length',
  'hours':            'shift_length',
  'horas':            'shift_length',
  // Breaks
  'first break':      'first_break',
  '1st break':        'first_break',
  'break 1':          'first_break',
  'primer break':     'first_break',
  'lunch':            'lunch',
  'lunch break':      'lunch',
  'almuerzo':         'lunch',
  'second break':     'second_break',
  '2nd break':        'second_break',
  'break 2':          'second_break',
  'segundo break':    'second_break',
  'third break':      'third_break',
  '3rd break':        'third_break',
  'break 3':          'third_break',
  'tercer break':     'third_break',
  // Supervisor
  'supervisor':       'supervisor',
  'sup':              'supervisor',
  'supervisor name':  'supervisor',
};

// ─── Name Normalization & Fuzzy Matching ─────────────────────────────────────

/**
 * Normalizes a name for comparison:
 * - Removes accents (NFD decomposition)
 * - Lowercases
 * - Strips non-alphanumeric except spaces
 * - Collapses whitespace
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a weighted similarity score between two names.
 * Uses 'Elimination Logic': if a token is unique in the workforce list, it gets a massive boost.
 */
function getNameSimilarity(
  a: string, 
  b: string, 
  tokenStats?: Record<string, number>
): number {
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  const tokensA = normA.split(' ').filter((t) => t.length > 1);
  const tokensB = normB.split(' ').filter((t) => t.length > 1);
  if (!tokensA.length || !tokensB.length) return 0;

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const tA of tokensA) {
    // Determine weight: Unique/Rare tokens = high weight, Common (like 'Luis') = low weight
    const freq = tokenStats?.[tA] ?? 10; // default to 'common' if unknown
    const weight = freq === 1 ? 10 : freq <= 3 ? 5 : 2;
    
    totalWeight += weight;
    if (tokensB.some((tB) => tB === tA || tB.startsWith(tA) || tA.startsWith(tB))) {
      matchedWeight += weight;
    }
  }

  return matchedWeight / totalWeight;
}

export interface NameMatchResult {
  user: Pick<User, 'id' | 'name' | 'employee_id' | 'department' | 'supervisor' | 'supervisor_id'>;
  score: number;
  isExact: boolean;
}

/**
 * Finds the best matching user from a list given a raw name from the CSV.
 * Uses elimination logic (Gap Analysis & Token Uniqueness).
 */
export function findBestUserMatch(
  rawName: string,
  users: Pick<User, 'id' | 'name' | 'employee_id' | 'department' | 'supervisor' | 'supervisor_id'>[],
  threshold = 0.85, // Lowered from 0.95 due to smart weighting
): NameMatchResult | null {
  const normalizedRaw = normalizeName(rawName);

  // 1. Exact match (fastest path)
  const exact = users.find((u) => normalizeName(u.name) === normalizedRaw);
  if (exact) return { user: exact, score: 1.0, isExact: true };

  // 2. Build token stats for the current workforce context
  const tokenStats: Record<string, number> = {};
  for (const u of users) {
    const tokens = normalizeName(u.name).split(' ').filter(t => t.length > 1);
    for (const t of tokens) {
      tokenStats[t] = (tokenStats[t] || 0) + 1;
    }
  }

  // 3. Score all users
  const scored = users
    .map((u) => ({ 
      user: u, 
      score: getNameSimilarity(rawName, u.name, tokenStats), 
      isExact: false 
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  const secondBest = scored[1];

  // GAP ANALYSIS: If the best match is significantly better than the rest,
  // we can be more confident even if the absolute score isn't perfect.
  const gap = secondBest ? (best.score - secondBest.score) : best.score;
  
  // Confident match if:
  // - Score is above threshold
  // - OR Score is reasonably high (>0.6) and there is a huge gap (>0.4) to the next candidate
  if (best.score >= threshold || (best.score > 0.6 && gap > 0.4)) {
    return best;
  }

  return null;
}

/**
 * Scans a 2D array of rows to find the most likely header row index.
 * Uses a weighted scoring system for critical columns.
 */
export function detectHeaderRow(rows: unknown[][]): number {
  if (rows.length === 0) return 0;
  
  const highWeight = ['agent', 'name', 'nombre', 'shift', 'entrada', 'salida'];
  const lowWeight = ['supervisor', 'lob', 'lunch', 'break', 'total', 'id'];
  
  let bestRow = 0;
  let maxScore = 0;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    
    let score = 0;
    for (const cell of row) {
      const val = String(cell ?? '').toLowerCase().trim();
      if (highWeight.some(k => val.includes(k))) score += 5;
      if (lowWeight.some(k => val.includes(k))) score += 2;
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestRow = i;
    }
  }
  
  // Threshold to avoid false positives on random text rows
  return maxScore >= 10 ? bestRow : 0;
}

/**
 * Attempts to extract a date from a variety of header string formats.
 * e.g., "Tuesday - Apr 21", "Report for 04/21/2026", etc.
 */
export function extractReportDate(rows: unknown[][], fileName: string, sheetName?: string): string | null {
  const dateRegex = /(?:[A-Z][a-z]+ - )?([A-Z][a-z]{2} \d{1,2})/; // e.g. "Apr 21"
  const isoRegex = /(\d{4}-\d{2}-\d{2})/;
  const slashRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;

  // Check sheet name first (often high priority if users label tabs by date)
  if (sheetName) {
    const m = sheetName.match(isoRegex) || sheetName.match(slashRegex) || sheetName.match(dateRegex);
    if (m) {
      const d = parseExcelDate(m[0]);
      if (d) return d;
    }
  }

  // 1. Check early rows (title areas)
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    for (const cell of rows[i]) {
      const val = String(cell ?? '').trim();
      if (!val) continue;
      
      const match = val.match(dateRegex);
      if (match) {
        const d = new Date(`${match[1]} ${new Date().getFullYear()}`);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
      
      const slash = val.match(slashRegex) || val.match(isoRegex);
      if (slash) {
        const d = parseExcelDate(slash[0]);
        if (d) return d;
      }
    }
  }

  // 2. Check filename as last resort
  const fileDateMatch = fileName.match(isoRegex) || fileName.match(slashRegex);
  if (fileDateMatch) return parseExcelDate(fileDateMatch[0]);

  return null;
}

/**
 * Looks for a global Line of Business (LOB) in the top rows of a report.
 * e.g. "LOB: NYT Service" or "Campaign: Outplex"
 */
export function extractGlobalLob(rows: unknown[][]): string | null {
  const lobKeywords = ['lob:', 'campaign:', 'queue:', 'departamento:', 'campaña:'];
  
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    for (const cell of rows[i]) {
      const val = String(cell ?? '').toLowerCase().trim();
      for (const kw of lobKeywords) {
        if (val.includes(kw)) {
          // Extract everything after the keyword
          return val.split(kw)[1].trim().toUpperCase();
        }
      }
    }
  }
  return null;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

/**
 * Normalizes a CSV header cell to a canonical field name using CSV_COLUMN_MAP.
 * Returns the canonical key, or the original normalized string if no mapping found.
 */
export function mapCsvHeader(rawHeader: string): string {
  if (!rawHeader) return '';
  const normalized = normalizeName(String(rawHeader));
  return CSV_COLUMN_MAP[normalized] ?? normalized;
}

export interface ParsedCsvRow {
  schedule_date: string;    // YYYY-MM-DD
  day_name: string;
  aws_id: string;           // email from CSV
  opx_id: string;
  lob: string;
  agent_name: string;
  shift_start: string;      // HH:MM
  shift_end: string;        // HH:MM
  shift_length: number;     // hours
  first_break: string | null;   // HH:MM or null
  lunch: string | null;
  second_break: string | null;
  third_break: string | null;   // null = "Not Eligible"
  supervisor: string;
}

export async function processFileBuffer(
  buffer: ArrayBuffer, 
  fileName: string
): Promise<{ rows: ParsedCsvRow[]; errors: string[] }> {
  let rawRows: unknown[][] = [];
  const errors: string[] = [];
  let globalDate: string | null = null;

  try {
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    const isCsv = ext === 'csv';
    let sheetName = fileName;

    if (isCsv) {
      // Parse CSV manually — handle quoted fields
      const text = new TextDecoder().decode(buffer);
      rawRows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
        const fields: string[] = [];
        let field = '';
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; continue; }
          if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; continue; }
          field += ch;
        }
        fields.push(field.trim());
        return fields;
      });
    } else {
      const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
      const wb = new ExcelJS.Workbook();
      // exceljs types predate Node 22 Buffer<ArrayBufferLike> — safe at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(new Uint8Array(buffer) as any);

      const targetSheet =
        wb.worksheets.find((ws) => /raw/i.test(ws.name)) ??
        wb.worksheets.find((ws) => /regular/i.test(ws.name)) ??
        wb.worksheets[0];

      if (!targetSheet) throw new Error('No valid sheet found');
      sheetName = targetSheet.name;

      targetSheet.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as unknown[]).slice(1); // exceljs rows are 1-indexed
        rawRows.push(values.map((v) => {
          if (v === null || v === undefined) return '';
          if (v instanceof Date) return v.toLocaleDateString('en-US');
          if (typeof v === 'object') {
            if ('result' in (v as object)) return String((v as { result: unknown }).result ?? '');
            if ('text' in (v as object)) return String((v as { text: unknown }).text ?? '');
            return '';
          }
          return String(v);
        }));
      });
    }

    // 1. Detect global metadata from title area if possible
    globalDate = extractReportDate(rawRows, fileName, sheetName);
    const globalLob = extractGlobalLob(rawRows);

    // 2. Detect the real header row
    const headerIdx = detectHeaderRow(rawRows);

    // 3. Convert to objects starting from detected header (headerIdx = header row)
    const headerRow = (rawRows[headerIdx] ?? []) as string[];
    const dataRows: Record<string, unknown>[] = rawRows.slice(headerIdx + 1).map((row) => {
      const obj: Record<string, unknown> = {};
      headerRow.forEach((key, i) => { obj[key] = (row as string[])[i] ?? ''; });
      return obj;
    });

    const normalizedRows: ParsedCsvRow[] = [];
    for (const [idx, raw] of dataRows.entries()) {
      const parsed = parseCsvRow(raw);
      if (!parsed) continue;
      
      // Apply global date if row doesn't have one
      if (!parsed.schedule_date && globalDate) {
        parsed.schedule_date = globalDate;
      }
      
      // Apply global LOB if row doesn't have one
      if (!parsed.lob && globalLob) {
        parsed.lob = globalLob;
      }

      // Minimum validation
      if (!parsed.agent_name || !parsed.schedule_date) {
        // Only error if it looks like real data (not a sub-header or blank)
        if (parsed.agent_name || parsed.supervisor) {
          errors.push(`Row ${idx + headerIdx + 2}: Missing mandatory data (Name or Date)`);
        }
        continue;
      }
      normalizedRows.push(parsed);
    }

    return { rows: normalizedRows, errors };

  } catch (err) {
    errors.push(`Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return { rows: [], errors };
  }
}

/**
 * Parses a single data row from XLSX/CSV into a normalized ParsedCsvRow.
 * Handles the NYT Excel raw format (both 12h AM/PM and 24h times).
 */
export function parseCsvRow(rawRow: Record<string, unknown>): ParsedCsvRow | null {
  // Map all headers to canonical names
  const row: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawRow)) {
    row[mapCsvHeader(key)] = String(value ?? '').trim();
  }

  // JUNK FILTERING: Skip rows that are clearly totals, empty, or headers
  const agentName = row['agent_name'];
  if (!agentName && !row['aws_id'] && !row['opx_id']) return null;
  
  const nameValue = String(agentName ?? '').toLowerCase();
  const junkKeywords = ['total', 'exported', 'grand', 'subtotal', 'page', 'date'];
  if (junkKeywords.some(k => nameValue.includes(k))) return null;
  
  // Skip if it looks like a divider or a very short non-name string
  if (nameValue.length < 3 || nameValue.startsWith('-') || nameValue.startsWith('_')) return null;

  if (nameValue === 'agent name') return null;

  return {
    schedule_date: parseExcelDate(row['schedule_date']),
    day_name: row['day_name'] ?? '',
    aws_id: (row['aws_id'] ?? '').toLowerCase(),
    opx_id: row['opx_id'] ?? '',
    lob: row['lob'] ?? '',
    agent_name: agentName,
    shift_start:   parseTimeToHHMM(row['shift_start']),
    shift_end:     parseTimeToHHMM(row['shift_end']),
    shift_length:  parseFloat(row['shift_length']) || 0,
    first_break:   parseBreakTime(row['first_break']),
    lunch:         parseBreakTime(row['lunch']),
    second_break:  parseBreakTime(row['second_break']),
    third_break:   parseBreakTime(row['third_break']),
    supervisor:    row['supervisor'] ?? '',
  };
}

/**
 * Converts an Excel date string to YYYY-MM-DD.
 * Handles formats: "21/04/26", "4/21/2026", "21-04-2026", Excel serial numbers.
 */
export function parseExcelDate(raw: string): string {
  if (!raw) return '';

  // Excel serial number
  const serial = parseInt(raw, 10);
  if (!isNaN(serial) && raw.length < 6) {
    // Excel epoch: Jan 1 1900 = 1, but Excel has a leap year bug, so offset by 25569 from Unix
    const d = new Date((serial - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }

  // Try DD/MM/YY or DD/MM/YYYY
  const slashFmt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashFmt) {
    const [, a, b, y] = slashFmt;
    const year = y.length === 2 ? `20${y}` : y;
    // Determine if DD/MM or MM/DD: if a > 12, must be DD/MM
    if (parseInt(a, 10) > 12) {
      return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  // Try ISO (already YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // Fallback: return as-is
  return raw;
}

/**
 * Converts a time string (12h AM/PM or 24h) to HH:MM.
 * Returns '' if invalid.
 */
export function parseTimeToHHMM(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.trim().toUpperCase();

  // 12h format: "10:45 AM", "1:00PM", "10:45AM"
  const match12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const period = match12[3];
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // 24h format: "10:45", "13:00"
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return `${match24[1].padStart(2, '0')}:${match24[2]}`;
  }

  return '';
}

/**
 * Parses a break time cell. Returns null if the value is "Not Eligible" or empty.
 */
function parseBreakTime(raw: string): string | null {
  if (!raw || /not eligible|n\/a|none|-/i.test(raw.trim())) return null;
  return parseTimeToHHMM(raw) || null;
}

/**
 * Adds N minutes to a HH:MM time string, wrapping at midnight.
 */
export function addMinutesToTime(time: string, minutes: number): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Formats HH:MM to 12h display string: "10:45 AM"
 */
export function formatTimeDisplay(time: string | null): string {
  if (!time) return 'N/A';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ─── Variance Computation ────────────────────────────────────────────────────

/**
 * Computes variance in minutes between scheduled start (HH:MM local) and
 * actual start (UTC ISO timestamp). All logic runs server-side.
 * positive = employee was late, negative = early
 */
export function computeVarianceMinutes(
  scheduledTimeLocal: string,       // "HH:MM" in Santo Domingo time
  actualStartUtc: string,           // ISO timestamp (UTC)
  scheduleDateLocal: string,        // "YYYY-MM-DD" in Santo Domingo
): number {
  // Build a Date object for the scheduled time in Santo Domingo (UTC-4)
  const scheduledIso = `${scheduleDateLocal}T${scheduledTimeLocal}:00-04:00`;
  const scheduledMs = new Date(scheduledIso).getTime();
  const actualMs = new Date(actualStartUtc).getTime();
  return Math.round((actualMs - scheduledMs) / 60_000 * 100) / 100;
}

// ─── Hash ────────────────────────────────────────────────────────────────────

/**
 * Generates a SHA-256 hex string from a string. Used for CSV deduplication.
 * Works in both Node.js (crypto) and Edge runtime (SubtleCrypto).
 */
export async function sha256(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Browser / Edge
    const encoded = new TextEncoder().encode(content);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Node.js
  const { createHash } = await import('crypto');
  return createHash('sha256').update(content).digest('hex');
}

// ─── Daily Schedule Builder ───────────────────────────────────────────────────

/**
 * Builds the daily_schedules insert payload from a parsed CSV row + matched user.
 * LOB and supervisor always come from our DB (never from CSV if different).
 */
export function buildDailySchedulePayload(
  parsed: ParsedCsvRow,
  user: Pick<User, 'id' | 'name' | 'employee_id' | 'department' | 'supervisor' | 'supervisor_id'>,
  batchId: string,
  isOtDay: boolean,
): Omit<DailySchedule, 'id' | 'created_at' | 'updated_at' | 'employee' | 'logs'> {
  const hourType: HourType = isOtDay ? 'ot' : 'regular';

  return {
    batch_id:              batchId,
    employee_id:           user.id,
    schedule_date:         parsed.schedule_date,
    shift_start:           parsed.shift_start || null,
    shift_end:             parsed.shift_end || null,
    shift_length_hrs:      parsed.shift_length || null,
    first_break_start:     parsed.first_break,
    first_break_end:       parsed.first_break ? addMinutesToTime(parsed.first_break, 15) : null,
    lunch_start:           parsed.lunch,
    lunch_end:             parsed.lunch        ? addMinutesToTime(parsed.lunch, 30) : null,
    second_break_start:    parsed.second_break,
    second_break_end:      parsed.second_break ? addMinutesToTime(parsed.second_break, 15) : null,
    third_break_start:     parsed.third_break,
    third_break_end:       parsed.third_break  ? addMinutesToTime(parsed.third_break, 15) : null,
    is_ot_day:             isOtDay,
    hour_type:             hourType,
    lob:                   user.department ?? parsed.lob ?? null,
    supervisor_name:       user.supervisor  ?? parsed.supervisor ?? null,
    supervisor_id:         user.supervisor_id ?? null,
  };
}
