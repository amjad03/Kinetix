/** Days accrued by a leave type for a year, as of a date (nothing is stored per month). */
export function accruedDays(t: { annualDays: number; accrual: 'yearly' | 'monthly' }, year: number, asOf: string, dateOfJoining: string | null): number {
  if (asOf < `${year}-01-01`) return 0;
  if (t.accrual === 'yearly') return t.annualDays;
  const asOfYear = Number(asOf.slice(0, 4));
  const lastMonth = asOfYear > year ? 12 : Number(asOf.slice(5, 7));
  const firstMonth = dateOfJoining && Number(dateOfJoining.slice(0, 4)) === year ? Number(dateOfJoining.slice(5, 7)) : 1;
  const months = Math.max(0, lastMonth - firstMonth + 1);
  // Half-day precision.
  return Math.round(((t.annualDays / 12) * months) * 2) / 2;
}

/** Days left to apply for (unpaid types are not limited by a balance). */
export const availableDays = (b: { opening: number; accrued: number; used: number; pending: number }) => b.opening + b.accrued - b.used - b.pending;

/**
 * Compensatory-off days a person can count on: credits still valid, plus expired credits only as far as they
 * were already used (the oldest credits are taken first, so leave taken before a credit lapsed used it up).
 */
export const compOffAccrued = (validDays: number, expiredDays: number, usedOrPendingDays: number) => validDays + Math.min(expiredDays, usedOrPendingDays);

export interface LeaveRule {
  kind: string;
  maxPerRequest: number | null;
  minNoticeDays: number;
  gender: string;
  halfDayAllowed: boolean;
}

/** Leave kinds that never draw on a balance (duty and special leave are granted case by case; unpaid has none). */
export const UNLIMITED_KINDS = ['duty', 'special', 'unpaid'];

/**
 * Why a request breaks its type's rules, or null. `days` is what it takes; `noticeDays` is how far ahead of
 * the first day it is made (HR applying on someone's behalf skips the notice rule).
 */
export function leaveRuleProblem(t: LeaveRule, r: { days: number; halfDay: boolean; noticeDays: number; gender: string | null; onBehalf: boolean }): string | null {
  if (t.gender !== 'any' && r.gender !== t.gender) return `This leave is for ${t.gender} staff only`;
  if (r.halfDay && !t.halfDayAllowed) return 'This leave cannot be taken as a half day';
  if (t.maxPerRequest !== null && r.days > t.maxPerRequest) return `At most ${t.maxPerRequest} days can be taken at a time`;
  if (!r.onBehalf && t.minNoticeDays > 0 && r.noticeDays < t.minNoticeDays) return `Apply at least ${t.minNoticeDays} days ahead`;
  return null;
}
