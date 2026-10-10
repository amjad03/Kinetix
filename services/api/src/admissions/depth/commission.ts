/** Agent commission rules: which rule applies to an enrolment, and what it pays. */

export interface CommissionRule {
  id: string;
  agentId: string | null;
  programId: string | null;
  kind: string;
  flatPaise: number;
  percentBps: number;
  basePaise: number;
  slabs: { upTo: number | null; paise: number }[];
  tdsBps: number;
  active: boolean;
}

/** The most specific active rule: agent and programme, then agent, then programme, then the institution-wide rule. */
export function pickRule<T extends CommissionRule>(rules: T[], agentId: string, programId: string | null): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (!r.active) continue;
    if (r.agentId && r.agentId !== agentId) continue;
    if (r.programId && r.programId !== programId) continue;
    const score = (r.agentId ? 2 : 0) + (r.programId ? 1 : 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** What the rule pays for this agent's `nth` enrolment (1 = the first). Slabs pay by the slab the Nth enrolment falls in. */
export function commissionAmount(rule: CommissionRule, nth: number): number {
  if (rule.kind === 'flat') return rule.flatPaise;
  if (rule.kind === 'percent') return Math.floor((rule.basePaise * rule.percentBps) / 10_000);
  for (const s of [...rule.slabs].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity))) {
    if (s.upTo === null || nth <= s.upTo) return s.paise;
  }
  return 0;
}

/** Tax deducted at source on a payout, rounded to the nearest paisa. */
export function tdsOn(grossPaise: number, tdsBps: number): number {
  return Math.round((grossPaise * tdsBps) / 10_000);
}
