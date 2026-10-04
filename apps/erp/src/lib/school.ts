import 'server-only';
import { isIsoDate, todayIn } from './dates';

/** The school's time zone. The API works out "today" in the tenant's zone; keep this in step. */
export const TIMEZONE = process.env.KINETIX_TIMEZONE ?? 'Asia/Kolkata';

export function schoolToday(): string {
  return todayIn(TIMEZONE);
}

/** `?date=` from the URL if valid, else today. */
export function dateParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return isIsoDate(v) ? v : schoolToday();
}

/** Current wall-clock time at the school, "HH:MM:SS". */
export function schoolNowTime(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
}

/** "Yesterday", "Tomorrow", "3 days ago", "In 2 days". */
export function relativeDay(date: string, today: string): string {
  const n = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  return n < 0 ? `${-n} days ago` : `In ${n} days`;
}
