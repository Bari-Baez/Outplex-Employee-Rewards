import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculate duration in hours between two time strings (HH:MM)
 */
export function calcDuration(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;
  // Handle overnight shifts
  if (endTotal <= startTotal) endTotal += 24 * 60;
  return Math.round(((endTotal - startTotal) / 60) * 10) / 10;
}

export type OTDateFormat = 'auto' | 'mdy' | 'dmy';
export type OTMeridiem = 'am' | 'pm';
export type ParsedFlexibleTime = {
  value: string;
  isAmbiguous: boolean;
  normalizedInput: string;
};

/**
 * Format a date string to display label
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time "14:00" → "2:00 PM"
 */
export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format "14:00"-"16:00" → "2:00 PM – 4:00 PM"
 */
export function formatSlotTime(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/**
 * Format relative time "2 mins ago"
 */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

/**
 * Get shift label from time range
 */
export function getShiftLabel(startTime: string): string {
  const [h] = startTime.split(':').map(Number);
  if (h >= 5 && h < 12) return 'Morning Shift';
  if (h >= 12 && h < 17) return 'Afternoon Shift';
  if (h >= 17 && h < 21) return 'Evening Shift';
  return 'Night Shift';
}

/**
 * Get initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Parse Spanish-format time strings used in OutPLEX OT CSVs:
 * "4:00 p.m." → "16:00"
 * "8:30 a.m." → "08:30"
 * "4:00 PM"   → "16:00"
 * "16:00"     → "16:00" (passthrough)
 */
function normalizeTimeInput(rawTime: string) {
  return rawTime
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\.(?=[ap]m\b)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(\d{1,2})([ap])$/, '$1 $2m')
    .replace(/^(\d{1,2})([ap]m)$/, '$1 $2')
    .replace(/^(\d{1,2}:\d{2})([ap])$/, '$1 $2m')
    .replace(/^(\d{1,2}:\d{2})([ap]m)$/, '$1 $2')
    .replace(/^(\d{1,2}:\d{2}:\d{2})([ap]m)$/, '$1 $2')
    .trim();
}

export function parseFlexibleTime(
  rawTime: string,
  options?: { defaultMeridiem?: OTMeridiem | null },
): ParsedFlexibleTime {
  if (!rawTime) {
    return { value: '', isAmbiguous: false, normalizedInput: '' };
  }

  const normalizedInput = normalizeTimeInput(rawTime);
  const match = normalizedInput.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?(?:\s*([ap]m))?$/i);
  if (!match) {
    return { value: '', isAmbiguous: false, normalizedInput };
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = (match[3]?.toLowerCase() as OTMeridiem | undefined) ?? null;

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return { value: '', isAmbiguous: false, normalizedInput };
  }

  if (meridiem) {
    if (hours > 12 || hours === 0) {
      return { value: '', isAmbiguous: false, normalizedInput };
    }
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return {
      value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      isAmbiguous: false,
      normalizedInput,
    };
  }

  if (hours > 12) {
    return {
      value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      isAmbiguous: false,
      normalizedInput,
    };
  }

  const defaultMeridiem = options?.defaultMeridiem ?? null;
  if (!defaultMeridiem) {
    return { value: '', isAmbiguous: true, normalizedInput };
  }

  if (defaultMeridiem === 'pm' && hours !== 12) hours += 12;
  if (defaultMeridiem === 'am' && hours === 12) hours = 0;

  return {
    value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    isAmbiguous: false,
    normalizedInput,
  };
}

export function parseSpanishTime(rawTime: string): string {
  if (!rawTime) return '';
  const parsed = parseFlexibleTime(rawTime);
  return parsed.value || rawTime;
}

/**
 * Parse date strings from OutPLEX OT CSV:
 * "4/13/26" → "2026-04-13"
 * "2/12/2026" → "2026-02-12"
 * "2026-04-13" → passthrough
 */
/**
 * Given a list of raw date strings ("M/D/YYYY"), score both MM/DD and DD/MM interpretations
 * by counting how many dates land on today or in the future (OT slots must be present/future).
 * Returns the format with more valid dates, or 'mdy' as a tiebreaker.
 */
export function detectOTDateFormat(rawDates: string[]): OTDateFormat {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  let mdyFuture = 0, dmyFuture = 0;
  let mdyDist = 0, dmyDist = 0;
  let ambiguousCount = 0;

  for (const raw of rawDates) {
    const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;

    // Unambiguous: skip (same result either way)
    if (a > 12 || b > 12) continue;
    ambiguousCount++;

    const asMDY = new Date(year, a - 1, b).getTime(); // a=month, b=day
    const asDMY = new Date(year, b - 1, a).getTime(); // a=day, b=month

    if (asMDY >= todayMs) mdyFuture++; else mdyDist += todayMs - asMDY;
    if (asDMY >= todayMs) dmyFuture++; else dmyDist += todayMs - asDMY;
  }

  if (ambiguousCount === 0) return 'mdy'; // nothing to decide

  // Group: prefer format with more future dates
  if (mdyFuture !== dmyFuture) return mdyFuture > dmyFuture ? 'mdy' : 'dmy';
  // Tiebreak: prefer format whose past dates are less far in the past
  return mdyDist <= dmyDist ? 'mdy' : 'dmy';
}

export function parseOTDate(rawDate: string, format: OTDateFormat = 'auto'): string {
  if (!rawDate) return '';
  const cleaned = rawDate.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // M/D/YY or M/D/YYYY (also accepts dash separators)
  const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const first = match[1].padStart(2, '0');
    const second = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) year = `20${year}`;

    const firstNum = Number(first);
    const secondNum = Number(second);

    let resolvedFormat: 'mdy' | 'dmy';
    if (format === 'auto') {
      if (firstNum > 12) {
        resolvedFormat = 'dmy'; // first part must be day
      } else if (secondNum > 12) {
        resolvedFormat = 'mdy'; // second part must be day
      } else {
        // Both ≤ 12: individual heuristic — pick interpretation closer to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const yr = Number(year);
        const asMDY = new Date(yr, firstNum - 1, secondNum).getTime();
        const asDMY = new Date(yr, secondNum - 1, firstNum).getTime();
        const mdyFuture = asMDY >= todayMs;
        const dmyFuture = asDMY >= todayMs;
        if (mdyFuture && !dmyFuture) resolvedFormat = 'mdy';
        else if (dmyFuture && !mdyFuture) resolvedFormat = 'dmy';
        else resolvedFormat = Math.abs(asMDY - todayMs) <= Math.abs(asDMY - todayMs) ? 'mdy' : 'dmy';
      }
    } else {
      resolvedFormat = format;
    }

    const month = resolvedFormat === 'dmy' ? second : first;
    const day = resolvedFormat === 'dmy' ? first : second;

    return `${year}-${month}-${day}`;
  }

  return cleaned;
}

/**
 * Normalize OutPLEX OT CSV headers to internal field names.
 * Real format: Spot ID | LOB | Date | Start | End | Total | Status
 */
export function normalizeCSVHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  headers.forEach((h) => {
    const lower = h.toLowerCase().trim();
    // Exact OutPLEX column names first
    if (lower === 'spot id' || lower === 'spot_id' || lower === 'id') map[h] = 'spot_id';
    else if (lower === 'lob') map[h] = 'lob';
    else if (lower === 'date') map[h] = 'date';
    else if (lower === 'start') map[h] = 'start_time';
    else if (lower === 'end') map[h] = 'end_time';
    else if (lower === 'total' || lower === 'duration') map[h] = 'duration_hrs';
    else if (lower === 'status') map[h] = 'csv_status';
    // Fallbacks
    else if (lower.includes('start')) map[h] = 'start_time';
    else if (lower.includes('end')) map[h] = 'end_time';
    else if (lower.includes('date')) map[h] = 'date';
    else if (lower.includes('shift') || lower.includes('label')) map[h] = 'shift_label';
    else map[h] = lower.replace(/\s+/g, '_');
  });
  return map;
}

/**
 * Get days in a month for calendar rendering
 */
export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Pad start (Mon-based)
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1; // Convert Sun=0 to Mon-based
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad end to complete grid (42 cells = 6 rows)
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }

  return days;
}

/**
 * Format a Date to YYYY-MM-DD
 */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getLastDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(
    new Date(year, month + 1, 0).getDate(),
  ).padStart(2, '0')}`;
}

export function formatOTDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * Format a number to Dominican Pesos (DOP)
 */
export function formatDop(value: number) {
  return `RD$ ${value.toLocaleString('es-DO')}`;
}
