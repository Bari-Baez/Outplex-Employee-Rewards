/**
 * Calendar primitives shared by every module. No business rules live here.
 */

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
