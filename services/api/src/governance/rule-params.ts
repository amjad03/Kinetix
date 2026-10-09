import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { businessRules } from '../db/schema.js';
import { ruleInForce } from './governance.logic.js';

/**
 * Values from the approved, dated rule `domain/key` in the rule registry, or null when none is in force today.
 * Callers fall back to their own per-domain configuration when this is null.
 */
export async function governedParams(tx: Tx, domain: string, key: string, today: string = new Date().toISOString().slice(0, 10)): Promise<Record<string, unknown> | null> {
  const rows = await tx.select().from(businessRules).where(and(eq(businessRules.domain, domain), eq(businessRules.key, key), eq(businessRules.status, 'approved')));
  return ruleInForce(rows, today)?.params ?? null;
}

const pct = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
const credits = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);

export interface PassRulesLike {
  minInternalPercent: number | null;
  minExternalPercent: number | null;
  minTotalPercent: number;
}

/** Rule `grading/pass-mark` {passPercent or minTotalPercent, minInternalPercent, minExternalPercent}: each valid value replaces the scheme's own. */
export function overlayPassRules(base: PassRulesLike, params: Record<string, unknown> | null): PassRulesLike {
  if (!params) return base;
  return {
    minInternalPercent: 'minInternalPercent' in params ? pct(params.minInternalPercent) : base.minInternalPercent,
    minExternalPercent: 'minExternalPercent' in params ? pct(params.minExternalPercent) : base.minExternalPercent,
    minTotalPercent: pct(params.minTotalPercent) ?? pct(params.passPercent) ?? base.minTotalPercent,
  };
}

/** Rule `credits/minimum-per-semester` {minCredits, maxCredits}: replaces the registration window's own credit limits. */
export function overlayCreditLimits<T extends { minCredits: number; maxCredits: number }>(window: T, params: Record<string, unknown> | null): T {
  if (!params) return window;
  const max = credits(params.maxCredits) ?? window.maxCredits;
  const min = Math.min(credits(params.minCredits) ?? window.minCredits, max);
  return { ...window, minCredits: min, maxCredits: max };
}

/** Rule `quota/admission-seats` {reservedPercent: {SC: 15, ...}}: seats reserved per category as a share of the cycle's seats (rounded down). Null when the rule names none. */
export function quotaSeatsFromRule(params: Record<string, unknown> | null, cycleSeats: number): { category: string; reservedSeats: number }[] | null {
  const map = params?.reservedPercent;
  if (!map || typeof map !== 'object') return null;
  const out = Object.entries(map as Record<string, unknown>)
    .map(([category, v]) => ({ category, share: pct(v) }))
    .filter((x): x is { category: string; share: number } => x.share !== null && x.category.trim() !== '')
    .map((x) => ({ category: x.category, reservedSeats: Math.floor((x.share * cycleSeats) / 100) }));
  if (out.reduce((n, q) => n + q.reservedSeats, 0) > cycleSeats) return null;
  return out.length ? out : null;
}
