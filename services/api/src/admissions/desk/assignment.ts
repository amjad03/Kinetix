import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Tx } from '../../db/db.service.js';
import { admissionAssignmentRules } from '../../db/schema-sis.js';
import { enquiries, userRoles, users } from '../../db/schema.js';

export interface LeadFacts {
  programId: string | null;
  source: string;
  city: string | null;
  region: string | null;
}

type Rule = Pick<typeof admissionAssignmentRules.$inferSelect, 'programId' | 'source' | 'region' | 'active'>;

/** Whether a rule applies to a lead: every condition the rule sets must match (region against the city or the region). */
export function ruleMatches(rule: Rule, lead: LeadFacts): boolean {
  if (!rule.active) return false;
  if (rule.programId && rule.programId !== lead.programId) return false;
  if (rule.source && rule.source !== lead.source) return false;
  if (rule.region) {
    const want = rule.region.trim().toLowerCase();
    const have = [lead.city, lead.region].map((x) => (x ?? '').trim().toLowerCase());
    if (!have.includes(want)) return false;
  }
  return true;
}

/** The next counsellor of a round-robin list, starting from `next`, skipping anyone no longer active. */
export function nextInTurn(ids: string[], next: number, active: Set<string>): { id: string; next: number } | null {
  for (let k = 0; k < ids.length; k++) {
    const i = (next + k) % ids.length;
    if (active.has(ids[i])) return { id: ids[i], next: (i + 1) % ids.length };
  }
  return null;
}

/**
 * The counsellor a new enquiry goes to under the institution's assignment rules: the first active rule (in its
 * order) that matches the programme, source and place decides, by turns (round robin) or to whoever of its
 * counsellors has the fewest open enquiries. Null when no rule matches or none of its counsellors is active.
 */
export async function assignByRules(tx: Tx, lead: LeadFacts): Promise<string | null> {
  const rules = await tx.select().from(admissionAssignmentRules).where(eq(admissionAssignmentRules.active, true)).orderBy(asc(admissionAssignmentRules.sortOrder), asc(admissionAssignmentRules.name));
  for (const rule of rules) {
    if (!ruleMatches(rule, lead) || rule.counsellorIds.length === 0) continue;
    const live = await tx
      .selectDistinct({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(inArray(users.id, rule.counsellorIds), eq(users.status, 'active')));
    const active = new Set(live.map((u) => u.id));
    if (!active.size) continue;
    if (rule.mode === 'least_loaded') {
      const open = await tx
        .select({ id: enquiries.counsellorId, n: sql<number>`count(*)::int` })
        .from(enquiries)
        .where(and(inArray(enquiries.counsellorId, [...active]), notInArray(enquiries.stage, ['converted', 'lost'])))
        .groupBy(enquiries.counsellorId);
      const load = new Map(open.map((r) => [r.id, r.n]));
      return rule.counsellorIds.filter((id) => active.has(id)).sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
    }
    // Round robin: lock the rule so two enquiries arriving together do not get the same turn.
    const [locked] = await tx.select({ nextIndex: admissionAssignmentRules.nextIndex }).from(admissionAssignmentRules).where(eq(admissionAssignmentRules.id, rule.id)).for('update');
    const pick = nextInTurn(rule.counsellorIds, locked?.nextIndex ?? 0, active);
    if (!pick) continue;
    await tx.update(admissionAssignmentRules).set({ nextIndex: pick.next }).where(eq(admissionAssignmentRules.id, rule.id));
    return pick.id;
  }
  return null;
}
