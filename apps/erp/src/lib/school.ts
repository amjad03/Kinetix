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
