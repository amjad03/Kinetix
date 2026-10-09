import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, lte, gte, or } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { approvalDelegations, userRoles } from '../db/schema.js';

export type DelegationScope = 'workflows' | 'leave';

/** Who has handed their approval rights to whom. A delegation counts between its two dates unless it was revoked. */
@Injectable()
export class DelegationService {
  constructor(private readonly clock: Clock) {}

  /** The people whose approvals this user may decide today (with the roles those people hold). */
  async activeDelegators(tx: Tx, delegateId: string, scope: DelegationScope): Promise<{ id: string; roles: RoleName[] }[]> {
    const today = await tenantToday(tx, this.clock);
    const rows = await tx
      .select({ delegatorId: approvalDelegations.delegatorId })
      .from(approvalDelegations)
      .where(and(eq(approvalDelegations.delegateId, delegateId), isNull(approvalDelegations.revokedAt), lte(approvalDelegations.startsOn, today), gte(approvalDelegations.endsOn, today), or(eq(approvalDelegations.scope, 'all'), eq(approvalDelegations.scope, scope))));
    const ids = [...new Set(rows.map((r) => r.delegatorId))];
    if (ids.length === 0) return [];
    const roles = await tx.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles).where(inArray(userRoles.userId, ids));
    return ids.map((id) => ({ id, roles: roles.filter((r) => r.userId === id).map((r) => r.role as RoleName) }));
  }
}
