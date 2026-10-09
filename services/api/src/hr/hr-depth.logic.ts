// Pure rules for teaching evaluation, workload, overtime and arrears.

export const RATER_KINDS = ['student', 'hod', 'peer', 'self'] as const;
export type RaterKind = (typeof RATER_KINDS)[number];

/** The questions every rater answers, 1 (poor) to 5 (excellent). */
export const EVAL_CRITERIA = ['clarity', 'preparation', 'punctuality', 'engagement', 'fairness', 'support'] as const;

/** How much each kind of rater counts in the composite score; a kind with no ratings is left out and the rest are re-weighted. */
export const EVAL_WEIGHTS: Record<RaterKind, number> = { student: 40, hod: 30, peer: 15, self: 15 };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function ratingAverage(scores: Record<string, number>): number {
  const v = Object.values(scores);
  return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

export interface KindSummary {
  kind: RaterKind;
  count: number;
  average: number;
}

export function compositeScore(kinds: KindSummary[]): number | null {
  const used = kinds.filter((k) => k.count > 0);
  const total = used.reduce((a, k) => a + EVAL_WEIGHTS[k.kind], 0);
  return total === 0 ? null : r2(used.reduce((a, k) => a + k.average * EVAL_WEIGHTS[k.kind], 0) / total);
}

/** Weekly teaching hours from timetable slots ("09:00:00" to "09:55:00"). */
export function slotHours(startsAt: string, endsAt: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.max(0, (m(endsAt) - m(startsAt)) / 60);
}

export type LoadBand = 'under' | 'within' | 'over';

/** Within 10% of the norm counts as within it. */
export function loadBand(hours: number, norm: number): LoadBand {
  if (norm <= 0) return 'within';
  return hours < norm * 0.9 ? 'under' : hours > norm * 1.1 ? 'over' : 'within';
}

/** Overtime pay: the hourly rate comes from monthly gross over 26 days of 8 hours; overtime is paid at double (Factories Act) unless the rule says otherwise. */
export function overtimeAmount(monthlyGrossPaise: number, hours: number, multiplier = 2): number {
  return Math.round(((monthlyGrossPaise / 26 / 8) * hours * multiplier) / 100) * 100;
}

/** Months from `from` (YYYY-MM) up to but not including `to`. */
export function monthsBetween(from: string, to: string): number {
  const f = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const t = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return Math.max(0, t - f);
}

/** The financial year (April to March) a YYYY-MM month falls in, as "2026-27". */
export function financialYearOf(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const start = Number(ym.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The twelve months (YYYY-MM) of a financial year "2026-27", April first. */
export function fyMonths(fy: string): string[] {
  const start = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((i + 3) % 12) + 1;
    return `${m >= 4 ? start : start + 1}-${String(m).padStart(2, '0')}`;
  });
}

export const quarterOf = (ym: string) => {
  const m = Number(ym.slice(5, 7));
  return m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4';
};
