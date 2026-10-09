import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { approvalDelegations, userRoles, users } from '../db/schema.js';
import { TASK_ROLES } from '../tasks/tasks.controller.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const Body_ = z.object({
  delegateId: z.uuid(),
  scope: z.enum(['all', 'workflows', 'leave']).default('all'),
  startsOn: Day,
  endsOn: Day,
  reason: z.string().trim().max(300).default(''),
});

/** Delegated approval rights: create, list and revoke. Every change is audited. */
@Controller('v1/delegations')
export class DelegationController {
  constructor(private readonly db: DbService) {}

  /** Delegations I gave and delegations given to me. Administrators see all of them with `all`. */
  @Get()
  @Auth('user', TASK_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const admin = p.roles.some((r) => ADMIN.includes(r));
      const rows = await tx
        .select()
        .from(approvalDelegations)
        .where(admin ? undefined : or(eq(approvalDelegations.delegatorId, p.userId), eq(approvalDelegations.delegateId, p.userId)))
        .orderBy(desc(approvalDelegations.createdAt))
        .limit(300);
      const names = new Map((await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [...new Set(rows.flatMap((r) => [r.delegatorId, r.delegateId]))].concat('00000000-0000-0000-0000-000000000000')))).map((u) => [u.id, u.fullName]));
      return rows.map((r) => ({ ...r, delegatorName: names.get(r.delegatorId) ?? '', delegateName: names.get(r.delegateId) ?? '', mine: r.delegatorId === p.userId }));
    });
  }

  /** Colleagues I can delegate to: staff other than me. */
  @Get('colleagues')
  @Auth('user', TASK_ROLES)
  colleagues(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ id: users.id, fullName: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(and(inArray(userRoles.role, TASK_ROLES), eq(users.status, 'active'), ne(users.id, p.userId))).orderBy(users.fullName);
      return [...new Map(rows.map((r) => [r.id, r])).values()];
    });
  }

  /** Hands my approval rights to another staff member for a date range. */
  @Post()
  @Auth('user', TASK_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Body_)) b: z.infer<typeof Body_>) {
    if (b.endsOn < b.startsOn) throw new BadRequestException('The end date is before the start date');
    if (b.delegateId === p.userId) throw new BadRequestException('You cannot delegate to yourself');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [to] = await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.id, b.delegateId));
      if (!to) throw new NotFoundException('Colleague not found');
      const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, b.delegateId));
      if (!roles.some((r) => TASK_ROLES.includes(r.role as RoleName))) throw new ConflictException('Approvals can only be delegated to a staff member');
      const [row] = await tx.insert(approvalDelegations).values({ tenantId: p.tenantId, delegatorId: p.userId, delegateId: b.delegateId, scope: b.scope, startsOn: b.startsOn, endsOn: b.endsOn, reason: b.reason }).returning();
      await auditUser(tx, p, 'delegation.created', 'approval_delegation', row.id, { delegateId: b.delegateId, scope: b.scope, from: b.startsOn, to: b.endsOn });
      return row;
    });
  }

  /** Ends a delegation now. The person who gave it, or an administrator, can revoke it. */
  @Post(':id/revoke')
  @HttpCode(200)
  @Auth('user', TASK_ROLES)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const admin = p.roles.some((r) => ADMIN.includes(r));
      const [row] = await tx.select().from(approvalDelegations).where(and(eq(approvalDelegations.id, id)));
      if (!row || (row.delegatorId !== p.userId && !admin)) throw new NotFoundException('Delegation not found');
      if (row.revokedAt) throw new ConflictException('Already revoked');
      const [out] = await tx.update(approvalDelegations).set({ revokedAt: new Date(), revokedBy: p.userId }).where(eq(approvalDelegations.id, id)).returning();
      await auditUser(tx, p, 'delegation.revoked', 'approval_delegation', id, { delegateId: row.delegateId });
      return out;
    });
  }
}
