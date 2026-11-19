/** Deterministic calendar-day helpers for receivables aging. */
export const BUSINESS_TIME_ZONE = 'Asia/Tehran';

/** Return a stable YYYY-MM-DD calendar key in the requested time zone. */
export function calendarDayKey(input: string | number | Date, timeZone = 'UTC'): string | null {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  const timestamp = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(timestamp)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(timestamp));
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    const year = part('year'), month = part('month'), day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

/**
 * Days overdue by calendar day, not elapsed 24-hour periods.
 * Default UTC intentionally preserves the existing collection-engine contract.
 * Pass BUSINESS_TIME_ZONE when business-day aging must follow Tehran local dates.
 */
export function calculateDaysOverdue(
  dueDateStr?: string,
  referenceDate: Date = new Date(),
  timeZone = 'UTC'
): number {
  if (!dueDateStr) return 0;
  const dueDay = calendarDayKey(dueDateStr, timeZone);
  const nowDay = calendarDayKey(referenceDate, timeZone);
  if (!dueDay || !nowDay) return 0;
  const dueMidnight = Date.parse(`${dueDay}T00:00:00.000Z`);
  const nowMidnight = Date.parse(`${nowDay}T00:00:00.000Z`);
  if (!Number.isFinite(dueMidnight) || !Number.isFinite(nowMidnight)) return 0;
  return Math.max(0, Math.floor((nowMidnight - dueMidnight) / 86400000));
}
