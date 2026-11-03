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
export function priority(a: { distanceKm: number | null; meritScore: number | null; term: number; category?: string | null }, w: PriorityWeights, categoryPoints: Record<string, number> = {}): number {
  const dist = Math.min(Math.max(a.distanceKm ?? 0, 0), 1000) / 10;
  const merit = Math.min(Math.max(a.meritScore ?? 0, 0), 100);
  const senior = Math.max(a.term, 1) * 10;
  const cat = categoryPoints[(a.category ?? '').toLowerCase()] ?? 0;
  return Math.round((w.distance * dist + w.merit * merit + w.seniority * senior + cat) * 100) / 100;
}

/** The reserved categories an application can carry (state and central reservation, persons with disabilities). */
export const ALLOT_CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews', 'pwd', 'defence', 'sports', 'ncc', 'foreign'] as const;

/**
 * The extra priority points a category earns, from the setting "sc:20, st:20, pwd:25" (category: points, comma
 * separated). Unknown categories and bad numbers are ignored; points are capped at 1,000.
 */
export function parseCategoryPoints(spec: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of String(spec ?? '').split(',')) {
    const [k, v] = part.split(':').map((x) => x.trim().toLowerCase());
    const n = Number(v);
    if (k && (ALLOT_CATEGORIES as readonly string[]).includes(k) && Number.isFinite(n) && n >= 0) out[k] = Math.min(n, 1000);
  }
  return out;
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

export interface DietBill extends MessBill {
  diets: number;
  dietRatePaise: number;
  establishmentPaise: number;
}

/**
 * The diet system: a resident eats one diet a day on the plan, less the days on approved mess leave (any length).
 * The bill is the diets at the month's rate a diet, plus the plan's fixed establishment charge (pro rata for a part
 * month). Nothing is rebated separately: leave days are simply not eaten.
 */
export function dietBill(month: string, sub: { startsOn: string; endedOn: string | null }, plan: { monthlyFeePaise: number }, leaves: { fromOn: string; toOn: string }[], dietRatePaise: number): DietBill {
  const dim = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(dim).padStart(2, '0')}`;
  const days = overlapDays(sub.startsOn, sub.endedOn, first, last);
  const subEnd = sub.endedOn && sub.endedOn < last ? sub.endedOn : last;
  const subStart = sub.startsOn > first ? sub.startsOn : first;
  // Leave days inside the month and the subscription, counted once even when leaves overlap.
  const away = new Set<string>();
  for (const l of leaves) {
    const s = l.fromOn > subStart ? l.fromOn : subStart;
    const e = l.toOn < subEnd ? l.toOn : subEnd;
    for (let d = s; d <= e; d = nextDay(d)) away.add(d);
  }
  const leaveDays = Math.min(away.size, days);
  const diets = days - leaveDays;
  const establishment = days === dim ? plan.monthlyFeePaise : Math.round((plan.monthlyFeePaise * days) / dim);
  const gross = diets * dietRatePaise + establishment;
  return { days, leaveDays, rebateDays: 0, grossPaise: gross, rebatePaise: 0, netPaise: gross, diets, dietRatePaise, establishmentPaise: establishment };
}

/** The month's rate a diet: what the mess spent over the diets eaten, to the nearest paisa (0 when nobody ate). */
export function dietRate(spentPaise: number, diets: number): number {
  return diets > 0 ? Math.round(spentPaise / diets) : 0;
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * How late a resident coming in is, in whole minutes: after the curfew (local "HH:MM"; the small hours before 5 am
 * count from the evening before), or after the time their pass said they would be back, whichever is later.
 */
export function minutesLate(local: { time: string }, curfew: string, expectedBackAt?: Date | null, at?: Date): number {
  const [ch, cm] = curfew.split(':').map(Number);
  const [h, m] = local.time.split(':').map(Number);
  const curfewMin = (Number.isFinite(ch) ? ch : 21) * 60 + (Number.isFinite(cm) ? cm : 0);
  const nowMin = h * 60 + m;
  let late = 0;
  if (nowMin >= curfewMin) late = nowMin - curfewMin;
  else if (h < 5) late = 24 * 60 - curfewMin + nowMin;
  if (expectedBackAt && at && at > expectedBackAt) late = Math.max(late, Math.floor((at.getTime() - expectedBackAt.getTime()) / 60_000));
  return late;
}
