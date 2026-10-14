import { ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import type { ChainStep } from '../db/schema-fee-accounts.js';
import type { TrailEntry } from '../db/schema-fee-depth.js';
import { users } from '../db/schema.js';
import { DEFAULT_CHAINS, chainRole, chainStep, type ChainKind } from '../fees/fee-depth.logic.js';
import { settingsOf } from './fee-accounts.service.js';

/**
 * Approval chains of the fees desk (concessions, refunds, fine waivers, one-student instalment plans, receipt
 * cancellations): each level is a role with a limit; an approval within the limit is final, above it the request
 * goes up a level. Nobody decides their own request; an institution admin may decide at any level.
 */

/** The chain for a kind of request, from the settings (or the defaults). */
export async function chainOf(tx: Tx, tenantId: string, kind: ChainKind): Promise<ChainStep[]> {
  const s = await settingsOf(tx, tenantId);
  const set = s.chains?.[kind];
  if (set?.length) return set;
  // Older settings: concessions up to a rupee limit could be approved by the accounts office.
  const limit = Number(s.approvals.concessionLimitRupees ?? 0);
  if (kind === 'concession' && limit > 0) return [{ role: 'accountant', limitRupees: limit }, { role: 'principal', limitRupees: null }];
  return DEFAULT_CHAINS[kind];
}

/** Whether this person may decide at this level. */
export function mayDecide(p: UserPrincipal, chain: ChainStep[], level: number): boolean {
  return p.roles.includes(chainRole(chain, level) as RoleName) || p.roles.includes('tenant_admin');
}

export interface ChainOutcome {
  status: 'approved' | 'rejected' | 'pending';
  level: number;
  trail: TrailEntry[];
  /** The role asked next, when the request went up a level. */
  nextRole: string | null;
}

/** Applies one decision to a request waiting at `level`. */
export async function decideOnChain(
  tx: Tx,
  p: UserPrincipal,
  r: { level: number; trail: TrailEntry[]; requestedBy: string | null; amountPaise: number },
  chain: ChainStep[],
  decision: 'approve' | 'reject',
  comment: string,
): Promise<ChainOutcome> {
  if (r.requestedBy && r.requestedBy === p.userId) throw new ForbiddenException('You cannot approve your own request');
  if (!mayDecide(p, chain, r.level)) throw new ForbiddenException('You cannot approve this');
  if (r.trail.some((t) => t.by === p.userId && t.decision === 'forward')) throw new ForbiddenException('You have already approved this at an earlier level');
  const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, p.userId));
  const entry = (d: TrailEntry['decision']): TrailEntry => ({ level: r.level, role: chainRole(chain, r.level), by: p.userId, byName: me?.name ?? '', at: new Date().toISOString(), decision: d, comment });
  if (decision === 'reject') return { status: 'rejected', level: r.level, trail: [...r.trail, entry('reject')], nextRole: null };
  const step = chainStep(chain, r.level, r.amountPaise);
  if (step.final) return { status: 'approved', level: r.level, trail: [...r.trail, entry('approve')], nextRole: null };
  return { status: 'pending', level: step.next, trail: [...r.trail, entry('forward')], nextRole: chainRole(chain, step.next) };
}
