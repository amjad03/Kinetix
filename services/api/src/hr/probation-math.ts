import { addDays } from './dates.js';

export const DEFAULT_PROBATION_MONTHS = 6;

/** Adds calendar months to a day (YYYY-MM-DD), keeping the day of month or the last day of a shorter month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** When probation ends: the joining date plus the probation length. */
export const probationEnd = (joinedOn: string, months = DEFAULT_PROBATION_MONTHS) => addMonths(joinedOn, months);

/** Days until (positive) or since (negative) a due date. */
export const daysUntil = (today: string, due: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);

/** A review shows in the due list this many days before probation ends, so the HoD has time to recommend. */
export const REVIEW_LEAD_DAYS = 30;
export const reviewOpensOn = (due: string) => addDays(due, -REVIEW_LEAD_DAYS);
