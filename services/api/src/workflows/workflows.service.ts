import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, staffProfiles, tasks, userRoles, users, workflowActions, workflowDefinitions, workflowRequests, workflowStepApprovals, type WorkflowStepSnapshot } from '../db/schema.js';
import { DelegationService } from '../delegation/delegation.service.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { applicableSteps, parallelOutcome, slaAction, stepApprovers, validatePayload, type Approver, type FormField, type StepDef } from './workflow-rules.js';

export const WORKFLOW_SLA = 'workflows.sla';

export type Definition = typeof workflowDefinitions.$inferSelect;
export type WorkflowRequest = typeof workflowRequests.$inferSelect;
type ActionKind = (typeof workflowActions.$inferInsert)['action'];
type ApprovalRow = typeof workflowStepApprovals.$inferSelect;

/** What a domain passes to `start`: who asks, which request type, and the data of the request. */
export interface StartInput {
  tenantId: string;
  requesterId: string;
  requestType: string;
  title: string;
  payload?: Record<string, unknown>;
  amount?: number | null;
  /** The domain record this request is about, echoed back in the `workflows.decided` event. */
  sourceModule?: string;
  sourceId?: string;
}

/**
 * The approval engine. A request carries the steps that apply to it (fixed when it is submitted: by amount
 * range and field conditions); each step raises a task for each of its approvers, one (single), every one
 * (parallel, all) or any one (parallel, any), and closes them on the decision. A step with an SLA is reminded
 * and escalated to a named role or user by the hourly job. Domains adopt the engine with `start(tx, ...)` and
 * listen for the `workflows.decided` event.
 */
@Injectable()
export class WorkflowsService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly tasksSvc: TasksService,
    private readonly delegation: DelegationService,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHourly(WORKFLOW_SLA, (job: Job) => this.sweepSla(job.tenantId).then(() => undefined));
  }

  /** Submits a request for the definition of `requestType`. Runs in the caller's transaction. */
  async start(tx: Tx, input: StartInput): Promise<WorkflowRequest> {
    const [def] = await tx.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.tenantId, input.tenantId), eq(workflowDefinitions.requestType, input.requestType)));
    if (!def || !def.active) throw new NotFoundException(`No workflow is set up for "${input.requestType}"`);
    const payload = this.checkPayload(def, input.payload ?? {});
    const steps = await this.resolveSteps(tx, def, input.requesterId, input.amount ?? null, payload);
    const [req] = await tx
      .insert(workflowRequests)
      .values({
        tenantId: input.tenantId,
        definitionId: def.id,
        requestType: def.requestType,
        title: input.title,
        payload,
        amount: input.amount ?? null,
        requesterId: input.requesterId,
        steps: steps.steps,
        sourceModule: input.sourceModule ?? null,
        sourceId: input.sourceId ?? null,
      })
      .returning();
    await this.log(tx, req, 'submitted', input.requesterId, null, '');
    await this.logSkipped(tx, req, steps.skipped);
    await audit(tx, { tenantId: input.tenantId, actorType: 'user', actorId: input.requesterId, action: 'workflow.submitted', subjectType: 'workflow_request', subjectId: req.id, data: { requestType: def.requestType, amount: input.amount ?? null } });
    return this.enter(tx, req, 0, input.requesterId);
  }

  /** The requester changes a returned request and sends it through the route again. */
  async resubmit(tx: Tx, p: UserPrincipal, id: string, patch: { title?: string; payload?: Record<string, unknown>; amount?: number | null }): Promise<WorkflowRequest> {
    const req = await this.lock(tx, id);
    if (req.requesterId !== p.userId) throw new ForbiddenException('Only the person who made the request can resubmit it');
    if (req.status !== 'returned') throw new ConflictException('Only a returned request can be resubmitted');
    const [def] = await tx.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, req.definitionId));
    const payload = this.checkPayload(def, patch.payload ?? req.payload);
    const amount = patch.amount === undefined ? req.amount : patch.amount;
    const steps = await this.resolveSteps(tx, def, req.requesterId, amount, payload);
    const [next] = await tx
      .update(workflowRequests)
      .set({ title: patch.title ?? req.title, payload, amount, steps: steps.steps, status: 'pending', currentStep: 0, approverUserId: null, approverRole: null, version: req.version + 1, updatedAt: this.clock.now() })
      .where(eq(workflowRequests.id, req.id))
      .returning();
    await this.log(tx, next, 'resubmitted', p.userId, null, '');
    await this.logSkipped(tx, next, steps.skipped);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'workflow.resubmitted', subjectType: 'workflow_request', subjectId: req.id });
    return this.enter(tx, next, 0, p.userId);
  }

  /**
   * An approver's decision on the current step. A rejection or return needs a comment. On a parallel step an
   * approval only completes the step when its rule is met (every approver, or any one); a rejection or return
   * from any approver ends it; an escalation target's approval completes it alone.
   */
  async decide(tx: Tx, p: UserPrincipal, id: string, decision: 'approve' | 'reject' | 'return', comment: string, expectedVersion?: number): Promise<WorkflowRequest> {
    const req = await this.lock(tx, id);
    if (expectedVersion !== undefined && expectedVersion !== req.version) throw new ConflictException('This request changed since you opened it. Reload and try again.');
    if (req.status !== 'pending') throw new ConflictException('This request is not waiting for a decision');
    const rows = await this.stepRows(tx, req);
    const decider = await this.decider(tx, p, req, rows);
    if (!decider) throw new ForbiddenException('This request is not waiting for you');
    const { mine, onBehalfOf } = decider;
    if (decision !== 'approve' && !comment.trim()) throw new UnprocessableEntityException('Say why in a comment');
    const step = req.steps[req.currentStep];
    const now = this.clock.now();
    const action: ActionKind = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned';
    await this.log(tx, req, action, p.userId, req.currentStep, comment.trim(), step?.name);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `workflow.${action}`, subjectType: 'workflow_request', subjectId: req.id, data: { step: step?.name ?? null, ...(onBehalfOf !== p.userId ? { onBehalfOf } : {}) } });
    if (mine.row) await tx.update(workflowStepApprovals).set({ decidedBy: p.userId, decidedAt: now }).where(eq(workflowStepApprovals.id, mine.row.id));
    if (decision === 'approve') {
      const after = rows.map((r) => (r.id === mine.row?.id ? { ...r, decidedAt: now } : r));
      const done = after.length === 0 || parallelOutcome(step?.mode === 'all' ? 'all' : 'any', after.map((r) => ({ decided: r.decidedAt !== null, escalation: r.escalation }))) === 'done';
      if (done) {
        await this.closeStepTasks(tx, req, 'cancelled', 'done');
        return this.enter(tx, req, req.currentStep + 1, p.userId);
      }
      if (mine.row?.taskId) await this.closeTaskById(tx, mine.row.taskId, 'done');
      const [waiting] = await tx.update(workflowRequests).set({ version: req.version + 1, updatedAt: now }).where(eq(workflowRequests.id, req.id)).returning();
      return waiting;
    }
    await this.closeStepTasks(tx, req, 'cancelled', 'done');
    if (decision === 'reject') return this.finish(tx, req, 'rejected', p.userId, comment.trim());
    const [back] = await tx
      .update(workflowRequests)
      .set({ status: 'returned', approverUserId: null, approverRole: null, version: req.version + 1, updatedAt: now })
      .where(eq(workflowRequests.id, req.id))
      .returning();
    await this.notify(tx, back, 'Request returned to you', `${back.title}: ${comment.trim()}`);
    return back;
  }

  /** The requester (or an administrator) withdraws a request that is still open. */
  async cancel(tx: Tx, p: UserPrincipal, id: string, comment: string): Promise<WorkflowRequest> {
    const req = await this.lock(tx, id);
    const admin = p.roles.includes('tenant_admin') || p.roles.includes('principal');
    if (req.requesterId !== p.userId && !admin) throw new ForbiddenException('Only the person who made the request can withdraw it');
    if (req.status !== 'pending' && req.status !== 'returned') throw new ConflictException('This request is already closed');
    await this.closeStepTasks(tx, req, 'cancelled', 'cancelled');
    await this.log(tx, req, 'cancelled', p.userId, req.currentStep, comment.trim());
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'workflow.cancelled', subjectType: 'workflow_request', subjectId: req.id });
    return this.finish(tx, req, 'cancelled', p.userId, comment.trim());
  }

  /**
   * Whose approval right the caller uses on this request: their own (their id), a delegator's (that person's id),
   * or null when the request is not waiting for them. Nobody decides their own request or, as a delegate, the delegator's.
   */
  async decidingFor(tx: Tx, p: UserPrincipal, req: WorkflowRequest): Promise<string | null> {
    return (await this.decider(tx, p, req, await this.stepRows(tx, req)))?.onBehalfOf ?? null;
  }

  /**
   * The caller's place on the current step: their own approver row, else one of an active delegator's
   * (deciding on that person's behalf). Nobody decides their own request or, as a delegate, the delegator's.
   */
  private async decider(tx: Tx, p: UserPrincipal, req: WorkflowRequest, rows: Awaited<ReturnType<WorkflowsService['stepRows']>>) {
    if (req.status !== 'pending' || req.requesterId === p.userId) return null;
    const own = this.myRow(p, req, rows);
    if (own) return { mine: own, onBehalfOf: p.userId };
    for (const d of await this.delegation.activeDelegators(tx, p.userId, 'workflows')) {
      if (d.id === req.requesterId) continue;
      const theirs = this.myRow({ ...p, userId: d.id, roles: d.roles as RoleName[] }, req, rows);
      if (theirs) return { mine: theirs, onBehalfOf: d.id };
    }
    return null;
  }

  /** Whether this person may decide the request's current step (themselves or as a delegate). */
  async canDecide(tx: Tx, p: UserPrincipal, req: WorkflowRequest): Promise<boolean> {
    return (await this.decidingFor(tx, p, req)) !== null;
  }

  // ---- SLA: reminders and escalation ---------------------------------------------------------

  /**
   * Looks at every pending request: reminds the approvers once the step has waited `reminderHours`, and when the
   * step's `slaHours` run out hands it to the step's escalation target (who can then decide it alone). Run hourly
   * by the job runner; also callable on demand. Returns the ids reminded and escalated.
   */
  async sweepSla(tenantId: string): Promise<{ reminded: string[]; escalated: string[] }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const now = this.clock.now();
      const pending = await tx.select().from(workflowRequests).where(and(eq(workflowRequests.status, 'pending'), isNotNull(workflowRequests.stepEnteredAt)));
      const out = { reminded: [] as string[], escalated: [] as string[] };
      for (const req of pending) {
        const step = req.steps[req.currentStep];
        if (!step) continue;
        const what = slaAction(step, req.stepEnteredAt!, now, { reminded: req.remindedAt !== null, escalated: req.escalatedAt !== null });
        if (what === 'remind') {
          const rows = (await this.stepRows(tx, req)).filter((r) => r.decidedAt === null && !r.escalation);
          const people = await this.peopleOf(tx, rows, req.requesterId);
          await this.notifications.notifyUsers(tx, people, { kind: 'task', text: { title: 'Approval reminder', body: `${req.title} is waiting for you at "${step.name}"` }, data: { requestId: req.id }, dedupeKey: `workflow:remind:${req.id}:${req.currentStep}:${req.version}` });
          await tx.update(workflowRequests).set({ remindedAt: now }).where(eq(workflowRequests.id, req.id));
          await this.log(tx, req, 'reminded', null, req.currentStep, `Waiting ${step.reminderHours} hours`, step.name);
          out.reminded.push(req.id);
        } else if (what === 'escalate') {
          await this.escalate(tx, req, step, now);
          out.escalated.push(req.id);
        }
      }
      if (out.reminded.length || out.escalated.length) this.logger.log(`Workflow SLA for ${tenantId}: ${out.reminded.length} reminded, ${out.escalated.length} escalated`);
      return out;
    });
  }

  private async escalate(tx: Tx, req: WorkflowRequest, step: WorkflowStepSnapshot, now: Date) {
    let target: { kind: 'user' | 'role'; userId: string | null; role: string | null; assignee: string } | null = null;
    if (step.escalateTo?.kind === 'user' && step.escalateTo.userId !== req.requesterId) target = { kind: 'user', userId: step.escalateTo.userId, role: null, assignee: step.escalateTo.userId };
    else if (step.escalateTo?.kind === 'role') {
      const holder = await this.firstWithRole(tx, step.escalateTo.role, req.requesterId);
      if (holder) target = { kind: 'role', userId: null, role: step.escalateTo.role, assignee: holder };
    }
    await tx.update(workflowRequests).set({ escalatedAt: now }).where(eq(workflowRequests.id, req.id));
    await tx.update(tasks).set({ escalatedAt: now }).where(and(eq(tasks.sourceModule, 'workflows'), eq(tasks.sourceId, req.id), inArray(tasks.status, ['open', 'in_progress'])));
    if (!target) {
      await this.notify(tx, req, 'Your request is overdue', `${req.title} has waited too long at "${step.name}"`);
      await this.log(tx, req, 'escalated', null, req.currentStep, 'SLA ran out; no escalation target', step.name);
      await audit(tx, { tenantId: req.tenantId, actorType: 'system', action: 'workflow.escalated', subjectType: 'workflow_request', subjectId: req.id, data: { step: step.name, to: null } });
      return;
    }
    const task = await this.tasksSvc.create(tx, { tenantId: req.tenantId, ownerId: req.requesterId, assigneeId: target.assignee, title: `Escalated: ${req.title}`, description: `The SLA of ${step.slaHours} hours for "${step.name}" ran out`, priority: 'urgent', sourceModule: 'workflows', sourceId: req.id });
    await tx.insert(workflowStepApprovals).values({ tenantId: req.tenantId, requestId: req.id, stepIndex: req.currentStep, kind: target.kind, role: target.role, userId: target.userId, taskId: task.id, escalation: true });
    await this.log(tx, req, 'escalated', null, req.currentStep, `SLA of ${step.slaHours} hours ran out; escalated to ${target.kind === 'role' ? `role ${target.role}` : 'a named approver'}`, step.name);
    await audit(tx, { tenantId: req.tenantId, actorType: 'system', action: 'workflow.escalated', subjectType: 'workflow_request', subjectId: req.id, data: { step: step.name, to: target.userId ?? target.role } });
  }

  /** The people behind approval rows: the named user, or the holders of the role (other than the requester). */
  private async peopleOf(tx: Tx, rows: ApprovalRow[], requesterId: string): Promise<string[]> {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.userId) ids.add(r.userId);
      else if (r.role) {
        const holders = await tx.select({ id: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(userRoles.role, r.role as RoleName), eq(users.status, 'active')));
        holders.forEach((h) => ids.add(h.id));
      }
    }
    ids.delete(requesterId);
    return [...ids];
  }

  // ------------------------------------------------------------------------------------------

  /** Every approval row of the request's current step. */
  private stepRows(tx: Tx, req: WorkflowRequest): Promise<ApprovalRow[]> {
    return tx
      .select()
      .from(workflowStepApprovals)
      .where(and(eq(workflowStepApprovals.requestId, req.id), eq(workflowStepApprovals.stepIndex, req.currentStep)))
      .orderBy(asc(workflowStepApprovals.createdAt), asc(workflowStepApprovals.id));
  }

  /** The undecided row this person may act on; for a request that predates approval rows, the request's own approver (row null). */
  private myRow(p: UserPrincipal, req: WorkflowRequest, rows: ApprovalRow[]): { row: ApprovalRow | null } | null {
    if (req.requesterId === p.userId) return null;
    const open = rows.filter((r) => r.decidedAt === null);
    const hit = open.find((r) => r.userId === p.userId) ?? open.find((r) => r.kind === 'role' && r.role !== null && p.roles.includes(r.role as RoleName));
    if (hit) return { row: hit };
    if (rows.length === 0 && (req.approverUserId === p.userId || (req.approverRole !== null && p.roles.includes(req.approverRole as RoleName)))) return { row: null };
    return null;
  }

  private checkPayload(def: Definition, payload: Record<string, unknown>): Record<string, unknown> {
    const { clean, errors } = validatePayload(def.fields as FormField[], payload);
    if (errors.length) throw new UnprocessableEntityException(errors.join('; '));
    return clean;
  }

  private async lock(tx: Tx, id: string): Promise<WorkflowRequest> {
    const [req] = await tx.select().from(workflowRequests).where(eq(workflowRequests.id, id)).for('update');
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  private async log(tx: Tx, req: WorkflowRequest, action: ActionKind, actorId: string | null, stepIndex: number | null, comment: string, stepName?: string) {
    await tx.insert(workflowActions).values({ tenantId: req.tenantId, requestId: req.id, stepIndex, stepName: stepName ?? (stepIndex !== null ? (req.steps[stepIndex]?.name ?? null) : null), actorId, action, comment });
  }

  private async logSkipped(tx: Tx, req: WorkflowRequest, skipped: string[]) {
    for (const name of skipped) await this.log(tx, req, 'skipped', null, null, 'The approver is the requester', name);
  }

  /**
   * Fixes who decides each step that applies to this amount and form data. The requester never approves their own
   * request: a single step whose approver is the requester is skipped, and a parallel step drops the requester from
   * its list (and is skipped when nobody is left). A step nobody can decide is refused up front.
   */
  private async resolveSteps(tx: Tx, def: Definition, requesterId: string, amount: number | null, payload: Record<string, unknown>): Promise<{ steps: WorkflowStepSnapshot[]; skipped: string[] }> {
    const steps: WorkflowStepSnapshot[] = [];
    const skipped: string[] = [];
    for (const s of applicableSteps(def.steps as StepDef[], amount, payload)) {
      const base = { name: s.name, slaHours: s.slaHours ?? null, escalateTo: s.escalateTo ?? null, reminderHours: s.reminderHours ?? null };
      const resolved: { kind: 'role' | 'user'; role: string | null; userId: string | null; head: boolean }[] = [];
      for (const a of stepApprovers(s)) {
        const r = await this.resolveApprover(tx, a, s.name, requesterId);
        if (r) resolved.push(r);
      }
      if (resolved.length === 0) {
        skipped.push(s.name);
        continue;
      }
      const first = resolved[0];
      const kind: WorkflowStepSnapshot['kind'] = first.head ? 'department_head' : first.kind;
      if (resolved.length === 1) steps.push({ ...base, kind, role: first.role, userId: first.userId, mode: 'single' });
      else steps.push({ ...base, kind, role: first.role, userId: first.userId, mode: s.mode ?? 'all', approvers: resolved.map(({ kind: k, role, userId }) => ({ kind: k, role, userId })) });
    }
    return { steps, skipped };
  }

  /** One approver of a step, or null when it is the requester. */
  private async resolveApprover(tx: Tx, a: Approver, stepName: string, requesterId: string) {
    if (a.kind === 'role') {
      const holder = await this.firstWithRole(tx, a.role, requesterId);
      if (!holder) throw new UnprocessableEntityException(`Nobody with the role ${a.role} can approve the step "${stepName}"`);
      return { kind: 'role' as const, role: a.role, userId: null, head: false };
    }
    let approver: string | null;
    if (a.kind === 'user') approver = a.userId;
    else {
      const [row] = await tx
        .select({ head: departments.headUserId })
        .from(staffProfiles)
        .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
        .where(eq(staffProfiles.userId, requesterId));
      approver = row?.head ?? null;
      if (!approver) throw new UnprocessableEntityException(`The step "${stepName}" needs a head of department, but none is set for the requester`);
    }
    return approver === requesterId ? null : { kind: 'user' as const, role: null, userId: approver, head: a.kind === 'department_head' };
  }

  private async firstWithRole(tx: Tx, role: string, exceptUserId: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: users.id })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.role, role as RoleName), eq(users.status, 'active'), ne(users.id, exceptUserId)))
      .orderBy(asc(users.fullName), asc(users.id))
      .limit(1);
    return row?.id ?? null;
  }

  /** Moves the request to step `index` and raises a task for each of its approvers, or approves it when there is no step left. */
  private async enter(tx: Tx, req: WorkflowRequest, index: number, actorId: string): Promise<WorkflowRequest> {
    const step = req.steps[index];
    if (!step) return this.finish(tx, req, 'approved', actorId, '');
    const parallel = !!step.approvers && step.approvers.length > 1;
    const slots = parallel ? step.approvers! : [{ kind: step.kind === 'role' ? ('role' as const) : ('user' as const), role: step.role, userId: step.userId }];
    let firstTask: string | null = null;
    for (const slot of slots) {
      const assignee = slot.userId ?? (await this.firstWithRole(tx, slot.role ?? '', req.requesterId));
      if (!assignee) throw new UnprocessableEntityException(`Nobody can approve the step "${step.name}"`);
      const task = await this.tasksSvc.create(tx, {
        tenantId: req.tenantId,
        ownerId: req.requesterId,
        assigneeId: assignee,
        title: `Approve: ${req.title}`,
        description: `${step.name} for the ${req.requestType} request "${req.title}"${parallel ? (step.mode === 'any' ? ' (any one approver is enough)' : ' (every approver must approve)') : ''}`,
        slaHours: step.slaHours,
        sourceModule: 'workflows',
        sourceId: req.id,
      });
      firstTask ??= task.id;
      await tx.insert(workflowStepApprovals).values({ tenantId: req.tenantId, requestId: req.id, stepIndex: index, kind: slot.kind, role: slot.role, userId: slot.userId, taskId: task.id });
    }
    const now = this.clock.now();
    const [row] = await tx
      .update(workflowRequests)
      .set({ status: 'pending', currentStep: index, approverUserId: parallel ? null : step.userId, approverRole: parallel ? null : step.role, taskId: firstTask, stepEnteredAt: now, remindedAt: null, escalatedAt: null, version: req.version + 1, updatedAt: now })
      .where(eq(workflowRequests.id, req.id))
      .returning();
    return row;
  }

  private async finish(tx: Tx, req: WorkflowRequest, status: 'approved' | 'rejected' | 'cancelled', actorId: string, comment: string): Promise<WorkflowRequest> {
    const now = this.clock.now();
    const [row] = await tx
      .update(workflowRequests)
      .set({ status, approverUserId: null, approverRole: null, decidedAt: now, version: req.version + 1, updatedAt: now })
      .where(eq(workflowRequests.id, req.id))
      .returning();
    await this.events.emit(tx, req.tenantId, {
      type: DomainEvents.WorkflowsDecided,
      aggregateType: 'workflow_request',
      aggregateId: req.id,
      actorId,
      payload: { requestId: req.id, requestType: req.requestType, status, requesterId: req.requesterId, amount: req.amount, payload: req.payload, sourceModule: req.sourceModule, sourceId: req.sourceId, comment },
    });
    if (actorId !== req.requesterId) await this.notify(tx, row, `Your request was ${status}`, comment ? `${row.title}: ${comment}` : row.title);
    return row;
  }

  private async notify(tx: Tx, req: WorkflowRequest, title: string, body: string) {
    await this.notifications.notifyUsers(tx, [req.requesterId], { kind: 'task', text: { title, body }, data: { requestId: req.id }, dedupeKey: `workflow:${req.id}:${req.version}` });
  }

  /**
   * Closes the open tasks of the current step: a task whose approver decided becomes `decidedStatus`, the
   * others `undecidedStatus` (for a request that predates approval rows, its single task takes `decidedStatus`).
   */
  private async closeStepTasks(tx: Tx, req: WorkflowRequest, undecidedStatus: 'done' | 'cancelled', decidedStatus: 'done' | 'cancelled') {
    const rows = await this.stepRows(tx, req);
    if (rows.length === 0 && req.taskId) await this.closeTaskById(tx, req.taskId, decidedStatus);
    for (const r of rows) if (r.taskId) await this.closeTaskById(tx, r.taskId, r.decidedAt ? decidedStatus : undecidedStatus);
  }

  private async closeTaskById(tx: Tx, taskId: string, status: 'done' | 'cancelled') {
    const now = this.clock.now();
    await tx
      .update(tasks)
      .set({ status, completedAt: status === 'done' ? now : null, version: sql`${tasks.version} + 1`, updatedAt: now })
      .where(and(eq(tasks.id, taskId), inArray(tasks.status, ['open', 'in_progress'])));
  }
}
