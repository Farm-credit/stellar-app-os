/** Field team reply window shown to sponsors (#1686). */
export const FIELD_TEAM_SLA_BUSINESS_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Adds business days (Monday–Friday, UTC) to a date and keeps the time of day.
 * Weekends are skipped; public holidays are not.
 */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start.getTime());
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    result.setTime(result.getTime() + DAY_MS);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}
