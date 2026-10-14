/** Pure procurement, stores and facility rules (unit-tested in procurement.logic.spec.ts). */

export type PurchaseMode = 'direct' | 'quotation' | 'rate_contract' | 'gem' | 'tender';
export const PURCHASE_MODES: PurchaseMode[] = ['direct', 'quotation', 'rate_contract', 'gem', 'tender'];

export interface PurchaseRules {
  /** Up to this an order may be placed directly with one vendor. */
  directPurchaseUptoPaise: number;
  /** Above `directPurchaseUptoPaise` and up to this, three quotations (or a rate contract, or GeM). */
  tenderAbovePaise: number;
}

/**
 * Whether an order of this value may use this purchase mode, following the General Financial Rules pattern colleges
 * use: small purchases direct, then quotations (or a rate contract, or GeM), and above the tender limit a tender
 * (or GeM). Returns the reason it may not, or null.
 */
export function purchaseModeProblem(mode: PurchaseMode, totalPaise: number, r: PurchaseRules, refs: { gemRef?: string | null; tenderRef?: string | null }): string | null {
  const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  if (mode === 'gem' && !refs.gemRef?.trim()) return 'Give the GeM order or bid reference';
  if (mode === 'tender' && !refs.tenderRef?.trim()) return 'Give the tender reference';
  if (r.tenderAbovePaise > 0 && totalPaise > r.tenderAbovePaise && mode !== 'tender' && mode !== 'gem') return `Orders above ${rupees(r.tenderAbovePaise)} go through a tender or GeM`;
  if (mode === 'direct' && totalPaise > r.directPurchaseUptoPaise) return `Direct purchase is allowed up to ${rupees(r.directPurchaseUptoPaise)}; collect quotations, use a rate contract or GeM`;
  return null;
}

export type BudgetStatus = 'within' | 'exceeded' | 'no_budget';

/** An indent's estimate against what is left of its department's budget for the year (budget less spent and committed). */
export function budgetCheck(budgetPaise: number, spentPaise: number, committedPaise: number, estimatePaise: number): { status: BudgetStatus; availablePaise: number } {
  if (budgetPaise <= 0) return { status: 'no_budget', availablePaise: 0 };
  const availablePaise = budgetPaise - spentPaise - committedPaise;
  return { status: estimatePaise <= availablePaise ? 'within' : 'exceeded', availablePaise };
}

/** The approval steps of an indent: the department head first when there is one (and it is not the requester), then the principal. */
export function indentSteps(head: string | null | undefined, requester: string): ('hod' | 'principal')[] {
  return head && head !== requester ? ['hod', 'principal'] : ['principal'];
}

/** The Indian financial year (April to March) of a day, "2026-27". */
export function fiscalYearOf(day: string): string {
  const y = Number(day.slice(0, 4)) - (Number(day.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** The first and last day of a financial year. */
export function fiscalRange(fy: string): { from: string; to: string } {
  const y = Number(fy.slice(0, 4));
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

/** When a ticket raised at `from` with this many hours of response time falls due. */
export const dueAfter = (from: Date, hours: number) => new Date(from.getTime() + hours * 3_600_000);

/** Where a ticket stands against its deadline: met (resolved in time), breached (late, open or resolved), at_risk (under a quarter of the time left) or on_track. */
export function slaState(t: { createdAt: Date; dueAt: Date; resolvedAt: Date | null }, now: Date): 'met' | 'breached' | 'at_risk' | 'on_track' {
  if (t.resolvedAt) return t.resolvedAt <= t.dueAt ? 'met' : 'breached';
  if (now > t.dueAt) return 'breached';
  const total = t.dueAt.getTime() - t.createdAt.getTime();
  return t.dueAt.getTime() - now.getTime() < total / 4 ? 'at_risk' : 'on_track';
}

/** Where a ticket may go next. */
const TICKET_MOVES: Record<string, string[]> = {
  open: ['assigned', 'in_progress', 'on_hold', 'resolved'],
  assigned: ['assigned', 'in_progress', 'on_hold', 'resolved'],
  in_progress: ['on_hold', 'resolved'],
  on_hold: ['in_progress', 'assigned', 'resolved'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};
export const canMoveTicket = (from: string, to: string) => (TICKET_MOVES[from] ?? []).includes(to);

/** "HH:MM" or "HH:MM:SS" as minutes from midnight. */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Two time ranges on the same day overlap (touching ends do not). */
export const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => minutesOf(a.startsAt) < minutesOf(b.endsAt) && minutesOf(b.startsAt) < minutesOf(a.endsAt);

/** ISO weekday of a day: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** A vendor's rating: the average of its ratings' three scores, to one decimal; null with none. */
export function vendorScore(rows: { quality: number; delivery: number; price: number }[]): number | null {
  if (!rows.length) return null;
  const sum = rows.reduce((s, r) => s + r.quality + r.delivery + r.price, 0);
  return Math.round((sum / (rows.length * 3)) * 10) / 10;
}
