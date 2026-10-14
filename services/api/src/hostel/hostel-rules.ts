/**
 * Hostel arithmetic, kept pure so it can be tested on its own: an application's priority under the allotment rules,
 * the refund on a mid-month vacate, and a month's mess bill with leave rebates.
 */

export interface PriorityWeights {
  distance: number;
  merit: number;
  seniority: number;
}

/**
 * Priority for allotment: farther homes, better merit and senior years come first. Distance counts a point per 10 km
 * (up to 1,000 km), merit its score (0-100), seniority 10 points a year; each part has its weight from the settings.
 */
export function priority(a: { distanceKm: number | null; meritScore: number | null; term: number }, w: PriorityWeights): number {
  const dist = Math.min(Math.max(a.distanceKm ?? 0, 0), 1000) / 10;
  const merit = Math.min(Math.max(a.meritScore ?? 0, 0), 100);
  const senior = Math.max(a.term, 1) * 10;
  return Math.round((w.distance * dist + w.merit * merit + w.seniority * senior) * 100) / 100;
}

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const dayNo = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Days of [from, to] (inclusive, `to` null = open) that fall in [a, b]. */
export function overlapDays(from: string, to: string | null, a: string, b: string): number {
  const s = Math.max(dayNo(from), dayNo(a));
  const e = Math.min(to ? dayNo(to) : Infinity, dayNo(b));
  return e >= s ? e - s + 1 : 0;
}

export interface Settlement {
  daysUsed: number;
  daysInMonth: number;
  prorataRefundPaise: number;
  netRefundPaise: number;
}

/**
 * Leaving mid-month: the room fee for the days after the vacate day comes back (the month's fee having been charged),
 * with the caution deposit, less damages and any dues. A negative net is what the student still owes.
 */
export function settle(o: { vacatedOn: string; monthlyFeePaise: number; refundUnusedFee: boolean; depositPaise: number; damagesPaise: number; duesPaise: number }): Settlement {
  const month = o.vacatedOn.slice(0, 7);
  const dim = daysInMonth(month);
  const used = Number(o.vacatedOn.slice(8, 10));
  const prorata = o.refundUnusedFee ? Math.round((o.monthlyFeePaise * (dim - used)) / dim) : 0;
  return { daysUsed: used, daysInMonth: dim, prorataRefundPaise: prorata, netRefundPaise: prorata + o.depositPaise - o.damagesPaise - o.duesPaise };
}

export interface MessPlanBilling {
  billing: string;
  monthlyFeePaise: number;
  perDayPaise: number;
  rebateMinDays: number;
  rebatePerDayPaise: number;
}

export interface MessBill {
  days: number;
  leaveDays: number;
  rebateDays: number;
  grossPaise: number;
  rebatePaise: number;
  netPaise: number;
}

/**
 * A month's mess bill: the days on the plan (a fixed plan is charged pro rata for a part month), less a rebate for
 * approved leave. Only a leave of at least `rebateMinDays` days in a row earns the rebate, at the plan's rebate rate
 * (or the day's share of the fee when none is set).
 */
export function messBill(month: string, sub: { startsOn: string; endedOn: string | null }, plan: MessPlanBilling, leaves: { fromOn: string; toOn: string }[]): MessBill {
  const dim = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(dim).padStart(2, '0')}`;
  const days = overlapDays(sub.startsOn, sub.endedOn, first, last);
  const perDay = plan.billing === 'per_day' ? plan.perDayPaise : plan.monthlyFeePaise / dim;
  const gross = Math.round(plan.billing === 'per_day' ? plan.perDayPaise * days : days === dim ? plan.monthlyFeePaise : (plan.monthlyFeePaise * days) / dim);
  let leaveDays = 0;
  let rebateDays = 0;
  for (const l of leaves) {
    // Leave inside the month and inside the subscription.
    const s = [l.fromOn, sub.startsOn, first].sort()[2];
    const e = [l.toOn, sub.endedOn ?? last, last].sort()[0];
    const inMonth = s <= e ? overlapDays(s, e, s, e) : 0;
    leaveDays += inMonth;
    if (overlapDays(l.fromOn, l.toOn, l.fromOn, l.toOn) >= plan.rebateMinDays) rebateDays += inMonth;
  }
  rebateDays = Math.min(rebateDays, days);
  const rate = plan.rebatePerDayPaise > 0 ? plan.rebatePerDayPaise : perDay;
  const rebate = Math.min(gross, Math.round(rate * rebateDays));
  return { days, leaveDays: Math.min(leaveDays, days), rebateDays, grossPaise: gross, rebatePaise: rebate, netPaise: gross - rebate };
}

/** A student's gender against a hostel's: boys ↔ male, girls ↔ female; a mixed hostel or an unknown gender passes. */
export function genderFits(hostelGender: string, studentGender: string | null): boolean {
  if (!studentGender || hostelGender === 'mixed') return true;
  const g = studentGender.toLowerCase();
  if (hostelGender === 'boys') return ['male', 'm', 'boy'].includes(g);
  if (hostelGender === 'girls') return ['female', 'f', 'girl'].includes(g);
  return true;
}
