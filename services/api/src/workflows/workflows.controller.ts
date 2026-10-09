import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { roleName, tasks, users, workflowActions, workflowDefinitions, workflowRequests } from '../db/schema.js';
import { checkVersion, found } from '../placements/placements.access.js';
import { TASK_ROLES } from '../tasks/tasks.controller.js';
import { CONDITION_OPS, FIELD_TYPES, stepApprovers } from './workflow-rules.js';
import { WorkflowsService } from './workflows.service.js';

/** Every staff role can start a request and decide the steps it is given. */
export const WORKFLOW_ROLES: RoleName[] = TASK_ROLES;
/** Who edits the definitions and reads every request. */
export const WORKFLOW_ADMIN: RoleName[] = ['tenant_admin', 'principal'];

const Field = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/, 'Use letters, digits and underscores, starting with a lowercase letter'),
    label: z.string().trim().min(1).max(80),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) > 0, { message: 'A select field needs its options' });
const ApproverShape = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), role: z.enum(roleName.enumValues) }),
  z.object({ kind: z.literal('department_head') }),
  z.object({ kind: z.literal('user'), userId: z.uuid() }),
]);
const EscalateShape = z.discriminatedUnion('kind', [z.object({ kind: z.literal('role'), role: z.enum(roleName.enumValues) }), z.object({ kind: z.literal('user'), userId: z.uuid() })]);
const ConditionShape = z.object({
  field: z.string().trim().min(1).max(40),
  op: z.enum(CONDITION_OPS),
  value: z.union([z.number(), z.string().max(120), z.array(z.union([z.number(), z.string().max(120)])).min(1).max(30)]),
});
const Step = z
  .object({
    name: z.string().trim().min(1).max(80),
    approver: ApproverShape.optional(),
    /** Two or more approvers asked at once; `mode` says whether all or any one must approve. */
    approvers: z.array(ApproverShape).min(2).max(8).optional(),
    mode: z.enum(['all', 'any']).optional(),
    minAmount: z.number().min(0).nullable().optional(),
    maxAmount: z.number().min(0).nullable().optional(),
    conditions: z.array(ConditionShape).max(6).optional(),
    slaHours: z.number().int().min(1).max(24 * 90).nullable().optional(),
    escalateTo: EscalateShape.nullable().optional(),
    reminderHours: z.number().int().min(1).max(24 * 90).nullable().optional(),
  })
  .refine((s) => (s.approver ? 1 : 0) + (s.approvers ? 1 : 0) === 1, { message: 'A step needs either one approver or a list of approvers' })
  .refine((s) => !s.approvers || s.mode !== undefined, { message: 'A parallel step needs a mode (all or any)' })
  .refine((s) => !s.escalateTo || !!s.slaHours, { message: 'Escalation needs an SLA in hours' })
  .refine((s) => !s.reminderHours || !s.slaHours || s.reminderHours < s.slaHours, { message: 'The reminder must come before the SLA runs out' });
const DefinitionShape = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(''),
  fields: z.array(Field).max(30).default([]),
  steps: z.array(Step).min(1).max(10),
  active: z.boolean().default(true),
});
const checkDefinition = (d: { fields: { key: string }[]; steps: { minAmount?: number | null; maxAmount?: number | null }[] }) =>
  new Set(d.fields.map((f) => f.key)).size === d.fields.length && d.steps.every((s) => s.minAmount == null || s.maxAmount == null || s.minAmount <= s.maxAmount);
const DEFINITION_ERROR = { message: 'Field keys must be unique and a step minimum cannot exceed its maximum' };
const DefinitionBody = DefinitionShape.extend({ requestType: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use lowercase letters, digits and underscores') }).refine(checkDefinition, DEFINITION_ERROR);
const DefinitionPatch = DefinitionShape.partial().extend({ expectedVersion: z.number().int().optional() }).refine((d) => checkDefinition({ fields: d.fields ?? [], steps: d.steps ?? [] }), DEFINITION_ERROR);
const RequestBody = z.object({
  requestType: z.string().min(2).max(40),
  title: z.string().trim().min(3).max(200),
  payload: z.record(z.string(), z.unknown()).default({}),
  amount: z.number().min(0).max(1_000_000_000).nullable().optional(),
});
const ResubmitBody = z.object({ title: z.string().trim().min(3).max(200).optional(), payload: z.record(z.string(), z.unknown()).optional(), amount: z.number().min(0).max(1_000_000_000).nullable().optional() });
const DecideBody = z.object({ decision: z.enum(['approve', 'reject', 'return']), comment: z.string().trim().max(1000).default(''), expectedVersion: z.number().int().optional() });
const CancelBody = z.object({ comment: z.string().trim().max(1000).default('') });

const isAdmin = (p: UserPrincipal) => p.roles.some((r) => WORKFLOW_ADMIN.includes(r));

/** Workflow definitions, requests, the approver inbox and the request timeline. */
@Controller('v1/workflows')
export class WorkflowsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: WorkflowsService,
  ) {}

  // ---- definitions --------------------------------------------------------------------------

  /** Everyone sees the active routes (to start a request); administrators see all of them. */
  @Get('definitions')
  @Auth('user', WORKFLOW_ROLES)
  definitions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => {
      const rows = tx.select().from(workflowDefinitions).orderBy(asc(workflowDefinitions.name));
      return isAdmin(p) ? rows : tx.select().from(workflowDefinitions).where(eq(workflowDefinitions.active, true)).orderBy(asc(workflowDefinitions.name));
    });
  }

  @Post('definitions')
  @Auth('user', WORKFLOW_ADMIN)
  createDefinition(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DefinitionBody)) b: z.infer<typeof DefinitionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: workflowDefinitions.id }).from(workflowDefinitions).where(eq(workflowDefinitions.requestType, b.requestType));
      if (dup) throw new ConflictException('A workflow for this request type already exists');
      await this.checkNamedUsers(tx, b.steps);
      const [row] = await tx.insert(workflowDefinitions).values({ tenantId: p.tenantId, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'workflow.definition_created', 'workflow_definition', row.id, { requestType: b.requestType });
      return row;
    });
  }

  @Patch('definitions/:id')
  @Auth('user', WORKFLOW_ADMIN)
  updateDefinition(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DefinitionPatch)) b: z.infer<typeof DefinitionPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, id)).for('update');
      found(cur, 'Workflow');
      checkVersion(cur.version, b.expectedVersion);
      const { expectedVersion: _v, ...patch } = b;
      void _v;
      if (patch.steps) await this.checkNamedUsers(tx, patch.steps);
      const [row] = await tx.update(workflowDefinitions).set({ ...patch, version: cur.version + 1, updatedAt: new Date() }).where(eq(workflowDefinitions.id, id)).returning();
      await auditUser(tx, p, 'workflow.definition_updated', 'workflow_definition', id);
      return row;
    });
  }

  private async checkNamedUsers(tx: Tx, steps: z.infer<typeof Step>[]) {
    const named = steps.flatMap((s) => [...stepApprovers(s), ...(s.escalateTo ? [s.escalateTo] : [])]);
    const ids = [...new Set(named.flatMap((a) => (a.kind === 'user' ? [a.userId] : [])))];
    if (!ids.length) return;
    const rows = await tx.select({ id: users.id }).from(users).where(inArray(users.id, ids));
    if (rows.length !== ids.length) throw new NotFoundException('A named approver was not found');
  }

  // ---- requests -----------------------------------------------------------------------------

  @Post('requests')
  @Auth('user', WORKFLOW_ROLES)
  submit(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.start(tx, { tenantId: p.tenantId, requesterId: p.userId, ...b }));
  }

  @Get('requests/mine')
  @Auth('user', WORKFLOW_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.rows(tx, eq(workflowRequests.requesterId, p.userId)));
  }

  /** Requests whose current step is waiting for me (by name, or because I hold the step's role). */
  @Get('requests/inbox')
  @Auth('user', WORKFLOW_ROLES)
  inbox(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      this.rows(
        tx,
        and(
          eq(workflowRequests.status, 'pending'),
          ne(workflowRequests.requesterId, p.userId),
          or(
            eq(workflowRequests.approverUserId, p.userId),
            inArray(workflowRequests.approverRole, p.roles),
            sql`exists (select 1 from workflow_step_approvals a where a.request_id = ${workflowRequests.id} and a.step_index = ${workflowRequests.currentStep} and a.decided_at is null and (a.user_id = ${p.userId} or a.role in (${sql.join(p.roles.map((r) => sql`${r}`), sql`, `)})))`,
          ),
        ),
      ),
    );
  }

  @Get('requests')
  @Auth('user', WORKFLOW_ADMIN)
  all(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    const ok = ['pending', 'approved', 'rejected', 'returned', 'cancelled'].includes(status ?? '');
    return this.db.withTenant(p.tenantId, (tx) => this.rows(tx, ok ? eq(workflowRequests.status, status as 'pending') : undefined));
  }

  @Get('requests/:id')
  @Auth('user', WORKFLOW_ROLES)
  detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [req] = await tx.select().from(workflowRequests).where(eq(workflowRequests.id, id));
      found(req, 'Request');
      const timeline = await tx
        .select({ id: workflowActions.id, action: workflowActions.action, stepName: workflowActions.stepName, stepIndex: workflowActions.stepIndex, comment: workflowActions.comment, actorId: workflowActions.actorId, actorName: users.fullName, createdAt: workflowActions.createdAt })
        .from(workflowActions)
        .leftJoin(users, eq(users.id, workflowActions.actorId))
        .where(eq(workflowActions.requestId, id))
        .orderBy(asc(workflowActions.seq));
      const steps = req.steps;
      const involved = req.requesterId === p.userId || isAdmin(p) || timeline.some((a) => a.actorId === p.userId) || steps.some((s) => s.userId === p.userId || (s.role !== null && p.roles.includes(s.role as RoleName)));
      if (!involved) throw new ForbiddenException('You are not part of this request');
      const [def] = await tx.select({ name: workflowDefinitions.name, fields: workflowDefinitions.fields }).from(workflowDefinitions).where(eq(workflowDefinitions.id, req.definitionId));
      const [requester] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.requesterId));
      const [task] = req.taskId ? await tx.select({ id: tasks.id, status: tasks.status, dueAt: tasks.dueAt, assigneeId: tasks.assigneeId }).from(tasks).where(eq(tasks.id, req.taskId)) : [];
      return {
        ...req,
        definition: def,
        requesterName: requester?.fullName ?? '',
        timeline,
        task: task ?? null,
        canDecide: await this.svc.canDecide(tx, p, req),
        canResubmit: req.status === 'returned' && req.requesterId === p.userId,
        canCancel: (req.status === 'pending' || req.status === 'returned') && (req.requesterId === p.userId || isAdmin(p)),
      };
    });
  }

  @Post('requests/:id/decide')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.decide(tx, p, id, b.decision, b.comment, b.expectedVersion));
  }

  @Post('requests/:id/resubmit')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ROLES)
  resubmit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ResubmitBody)) b: z.infer<typeof ResubmitBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.resubmit(tx, p, id, b));
  }

  /** Runs the SLA check now (the hourly job does it anyway): reminds waiting approvers and escalates overdue steps. */
  @Post('sla/run')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ADMIN)
  runSla(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.sweepSla(p.tenantId);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CancelBody)) b: z.infer<typeof CancelBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.cancel(tx, p, id, b.comment));
  }

  /** List rows: the request, who asked, and which step it is on. */
  private async rows(tx: Tx, where: SQL | undefined) {
    const rows = await tx
      .select({ r: workflowRequests, requesterName: users.fullName, dueAt: tasks.dueAt })
      .from(workflowRequests)
      .innerJoin(users, eq(users.id, workflowRequests.requesterId))
      .leftJoin(tasks, eq(tasks.id, workflowRequests.taskId))
      .where(where)
      .orderBy(desc(workflowRequests.createdAt))
      .limit(500);
    return rows.map(({ r, requesterName, dueAt }) => ({
      id: r.id,
      requestType: r.requestType,
      title: r.title,
      amount: r.amount,
      status: r.status,
      requesterId: r.requesterId,
      requesterName,
      stepName: r.status === 'pending' ? (r.steps[r.currentStep]?.name ?? null) : null,
      stepNumber: r.currentStep + 1,
      stepCount: r.steps.length,
      dueAt: r.status === 'pending' ? dueAt : null,
      version: r.version,
      createdAt: r.createdAt,
    }));
  }
}
