import { BadRequestException, ConflictException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { approvalDelegations, userRoles, users } from '../db/schema.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { OptionalText } from '../records/helpers.js';
import { TASK_ROLES } from '../tasks/tasks.controller.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-06-01');
const isAdmin = (ctx: KitCtx) => ctx.p.roles.some((r) => ADMIN.includes(r));
const SCOPES: FieldOption[] = [
  { value: 'all', label: 'All approvals' },
  { value: 'workflows', label: 'Approval requests' },
  { value: 'leave', label: 'Leave' },
];

const delegator = sql`delegator`;
const delegate = sql`delegate`;
const today = sql`(now() at time zone 'Asia/Kolkata')::date`;
const state = sql<string>`case when ${approvalDelegations.revokedAt} is not null then 'revoked' when ${approvalDelegations.endsOn} < ${today} then 'ended' when ${approvalDelegations.startsOn} > ${today} then 'upcoming' else 'active' end`;

/** Active staff, for the delegate (and, for leaders, the delegator) pickers. */
async function staffOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, TASK_ROLES), eq(users.status, 'active')))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** Only the person who gave a delegation, or a leader, may change or remove it. */
async function assertOwner(ctx: KitCtx, id: string) {
  const [row] = await ctx.tx.select().from(approvalDelegations).where(eq(approvalDelegations.id, id));
  if (!row) throw new BadRequestException('Delegation not found');
  if (row.delegatorId !== ctx.p.userId && !isAdmin(ctx)) throw new ForbiddenException('Only the person who gave this delegation, or the principal, can change it');
  return row;
}

async function check(tx: Tx, ctx: KitCtx, id: string): Promise<void> {
  const row = await assertOwner({ ...ctx, tx }, id);
  if (row.endsOn < row.startsOn) throw new BadRequestException('The end date is before the start date');
  if (row.delegateId === row.delegatorId) throw new BadRequestException('You cannot delegate to yourself');
  const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, row.delegateId));
  if (!roles.some((r) => TASK_ROLES.includes(r.role as RoleName))) throw new ConflictException('Approvals can only be delegated to a staff member');
  const [overlap] = await tx
    .select({ id: approvalDelegations.id })
    .from(approvalDelegations)
    .where(and(ne(approvalDelegations.id, id), eq(approvalDelegations.delegatorId, row.delegatorId), sql`${approvalDelegations.revokedAt} is null`, sql`${approvalDelegations.startsOn} <= ${row.endsOn}`, sql`${approvalDelegations.endsOn} >= ${row.startsOn}`, or(eq(approvalDelegations.scope, 'all'), eq(approvalDelegations.scope, row.scope), sql`${row.scope} = 'all'`)));
  if (overlap) throw new ConflictException('These approvals are already delegated for some of these dates');
}

/**
 * Delegated approvals as a record kit entity: everyone sees the delegations they gave or received, leaders see all.
 * Add (to a colleague, for dates and a scope), edit, revoke, delete to the bin, export and history.
 */
export function delegationsEntity(): RecordEntity {
  return {
    key: 'delegations',
    module: 'workflows',
    table: approvalDelegations,
    subjectType: 'approval_delegation',
    roles: { read: TASK_ROLES, write: TASK_ROLES },
    label: (r) => `${r.delegatorName} → ${r.delegateName}`,
    list: {
      select: {
        id: approvalDelegations.id,
        delegatorId: approvalDelegations.delegatorId,
        delegatorName: sql<string>`${delegator}.full_name`,
        delegateId: approvalDelegations.delegateId,
        delegateName: sql<string>`${delegate}.full_name`,
        scope: approvalDelegations.scope,
        startsOn: approvalDelegations.startsOn,
        endsOn: approvalDelegations.endsOn,
        reason: approvalDelegations.reason,
        revokedAt: approvalDelegations.revokedAt,
        state,
        createdAt: approvalDelegations.createdAt,
      },
      joins: (q) => q.innerJoin(sql`users delegator`, sql`delegator.id = ${approvalDelegations.delegatorId}`).innerJoin(sql`users delegate`, sql`delegate.id = ${approvalDelegations.delegateId}`),
      search: [sql`delegator.full_name`, sql`delegate.full_name`, approvalDelegations.reason],
      scope: (ctx) => (isAdmin(ctx) ? undefined : or(eq(approvalDelegations.delegatorId, ctx.p.userId), eq(approvalDelegations.delegateId, ctx.p.userId))),
      filters: {
        state: {
          label: 'Status',
          options: [
            { value: 'active', label: 'In force' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'ended', label: 'Ended' },
            { value: 'revoked', label: 'Revoked' },
          ],
          where: (v) => (['active', 'upcoming', 'ended', 'revoked'].includes(v) ? sql`${state} = ${v}` : undefined),
        },
        scope: { label: 'Approvals', options: SCOPES, where: (v) => (SCOPES.some((o) => o.value === v) ? eq(approvalDelegations.scope, v as 'all') : undefined) },
        mine: {
          label: 'Whose',
          options: [
            { value: 'given', label: 'Given by me' },
            { value: 'received', label: 'Given to me' },
          ],
          where: (v, ctx) => (v === 'given' ? eq(approvalDelegations.delegatorId, ctx.p.userId) : v === 'received' ? eq(approvalDelegations.delegateId, ctx.p.userId) : undefined),
        },
      },
      sorts: { starts: approvalDelegations.startsOn, ends: approvalDelegations.endsOn, delegator: sql`delegator.full_name`, delegate: sql`delegate.full_name`, created: approvalDelegations.createdAt },
      defaultSort: { id: 'starts', dir: 'desc' },
    },
    fields: {
      delegateId: { label: 'Delegate to', type: 'select', schema: z.uuid(), column: approvalDelegations.delegateId, options: staffOptions, required: true },
      scope: { label: 'Approvals', type: 'select', schema: z.enum(['all', 'workflows', 'leave']), column: approvalDelegations.scope, options: SCOPES, required: true, bulk: true },
      startsOn: { label: 'From', type: 'date', schema: DAY, column: approvalDelegations.startsOn, required: true },
      endsOn: { label: 'To', type: 'date', schema: DAY, column: approvalDelegations.endsOn, required: true, bulk: true },
      reason: { label: 'Reason', type: 'textarea', schema: OptionalText(300).transform((v) => v ?? ''), column: approvalDelegations.reason },
      delegatorId: { label: 'On behalf of', type: 'select', schema: z.uuid(), column: approvalDelegations.delegatorId, options: staffOptions, edit: false, help: 'Leave empty to delegate your own approvals. Only the principal can delegate for someone else.' },
    },
    create: async (ctx, v) => {
      const from = (v.delegatorId as string | undefined) ?? ctx.p.userId;
      if (from !== ctx.p.userId && !isAdmin(ctx)) throw new ForbiddenException('Only the principal can delegate for someone else');
      const [row] = await ctx.tx
        .insert(approvalDelegations)
        .values({ tenantId: ctx.p.tenantId, delegatorId: from, delegateId: String(v.delegateId), scope: v.scope as 'all', startsOn: String(v.startsOn), endsOn: String(v.endsOn), reason: (v.reason as string | undefined) ?? '' })
        .returning({ id: approvalDelegations.id });
      return row.id;
    },
    check: (ctx, id) => check(ctx.tx, ctx, id),
    remove: {
      guard: async (ctx, id) => {
        const [row] = await ctx.tx.select().from(approvalDelegations).where(eq(approvalDelegations.id, id));
        return row && row.delegatorId !== ctx.p.userId && !isAdmin(ctx) ? 'Only the person who gave this delegation, or the principal, can remove it' : null;
      },
    },
    actions: {
      revoke: {
        label: 'Revoke now',
        tone: 'danger',
        apply: async (ctx, id) => {
          const row = await assertOwner(ctx, id);
          if (row.revokedAt) return 'Already revoked';
          await ctx.tx.update(approvalDelegations).set({ revokedAt: new Date(), revokedBy: ctx.p.userId }).where(eq(approvalDelegations.id, id));
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'delegation.revoked', subjectType: 'approval_delegation', subjectId: id, changes: { revokedAt: { before: null, after: new Date().toISOString() } }, data: { delegateId: row.delegateId } });
          return 'Revoked';
        },
      },
    },
    columns: [
      { key: 'delegatorName', header: 'Given by' },
      { key: 'delegateName', header: 'Delegate' },
      { key: 'scope', header: 'Approvals', value: (r) => SCOPES.find((o) => o.value === r.scope)?.label ?? String(r.scope) },
      { key: 'startsOn', header: 'From' },
      { key: 'endsOn', header: 'To' },
      { key: 'state', header: 'Status' },
      { key: 'reason', header: 'Reason' },
    ],
  };
}

@Injectable()
export class DelegationRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(delegationsEntity());
  }
}
