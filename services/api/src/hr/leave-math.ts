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
