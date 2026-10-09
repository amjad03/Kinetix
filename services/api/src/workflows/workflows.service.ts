import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DelegationService } from '../delegation/delegation.service.js';
import type { Tx } from '../db/db.service.js';
import { departments, staffProfiles, tasks, userRoles, users, workflowActions, workflowDefinitions, workflowRequests, type WorkflowStepSnapshot } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { applicableSteps, validatePayload, type FormField, type StepDef } from './workflow-rules.js';

export type Definition = typeof workflowDefinitions.$inferSelect;
export type WorkflowRequest = typeof workflowRequests.$inferSelect;
type ActionKind = (typeof workflowActions.$inferInsert)['action'];

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
 * The approval engine. A request carries the steps that apply to it (fixed when it is submitted);
 * each step raises a task for its approver and closes it on the decision. Domains adopt the engine
 * with `start(tx, ...)` and listen for the `workflows.decided` event.
 */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly tasksSvc: TasksService,
    private readonly delegation: DelegationService,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /** Submits a request for the definition of `requestType`. Runs in the caller's transaction. */
  async start(tx: Tx, input: StartInput): Promise<WorkflowRequest> {
    const [def] = await tx.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.tenantId, input.tenantId), eq(workflowDefinitions.requestType, input.requestType)));
    if (!def || !def.active) throw new NotFoundException(`No workflow is set up for "${input.requestType}"`);
    const payload = this.checkPayload(def, input.payload ?? {});
    const steps = await this.resolveSteps(tx, def, input.requesterId, input.amount ?? null);
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
    const steps = await this.resolveSteps(tx, def, req.requesterId, amount);
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

  /** An approver's decision on the current step. A rejection or return needs a comment. */
  async decide(tx: Tx, p: UserPrincipal, id: string, decision: 'approve' | 'reject' | 'return', comment: string, expectedVersion?: number): Promise<WorkflowRequest> {
    const req = await this.lock(tx, id);
    if (expectedVersion !== undefined && expectedVersion !== req.version) throw new ConflictException('This request changed since you opened it. Reload and try again.');
    if (req.status !== 'pending') throw new ConflictException('This request is not waiting for a decision');
    const onBehalfOf = await this.decidingFor(tx, p, req);
    if (!onBehalfOf) throw new ForbiddenException('This request is not waiting for you');
    if (decision !== 'approve' && !comment.trim()) throw new UnprocessableEntityException('Say why in a comment');
    const step = req.steps[req.currentStep];
    await this.closeTask(tx, req, 'done');
    const action: ActionKind = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned';
    await this.log(tx, req, action, p.userId, req.currentStep, comment.trim(), step?.name);
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `workflow.${action}`, subjectType: 'workflow_request', subjectId: req.id, data: { step: step?.name ?? null, ...(onBehalfOf !== p.userId ? { onBehalfOf } : {}) } });
    if (decision === 'approve') return this.enter(tx, req, req.currentStep + 1, p.userId);
    if (decision === 'reject') return this.finish(tx, req, 'rejected', p.userId, comment.trim());
    const [back] = await tx
      .update(workflowRequests)
      .set({ status: 'returned', approverUserId: null, approverRole: null, version: req.version + 1, updatedAt: this.clock.now() })
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
    await this.closeTask(tx, req, 'cancelled');
    await this.log(tx, req, 'cancelled', p.userId, req.currentStep, comment.trim());
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'workflow.cancelled', subjectType: 'workflow_request', subjectId: req.id });
    return this.finish(tx, req, 'cancelled', p.userId, comment.trim());
  }

  /**
   * Whose approval right the caller uses on this request: their own (their id), a delegator's (that person's id),
   * or null when the request is not waiting for them. Nobody decides their own request or, as a delegate, the delegator's.
   */
  async decidingFor(tx: Tx, p: UserPrincipal, req: WorkflowRequest): Promise<string | null> {
    if (this.canDecide(p, req)) return p.userId;
    if (req.status !== 'pending' || req.requesterId === p.userId) return null;
    for (const d of await this.delegation.activeDelegators(tx, p.userId, 'workflows')) {
      if (d.id === req.requesterId) continue;
      if (req.approverUserId === d.id || (req.approverRole !== null && d.roles.includes(req.approverRole as RoleName))) return d.id;
    }
    return null;
  }

  /** Whether this person may decide the request's current step. Nobody decides their own request. */
  canDecide(p: UserPrincipal, req: WorkflowRequest): boolean {
    if (req.status !== 'pending' || req.requesterId === p.userId) return false;
    return req.approverUserId === p.userId || (req.approverRole !== null && p.roles.includes(req.approverRole as RoleName));
  }

  // ------------------------------------------------------------------------------------------

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
   * Fixes who decides each step that applies to this amount. A step whose approver is the requester
   * is skipped (nobody approves their own request); a step nobody can decide is refused up front.
   */
  private async resolveSteps(tx: Tx, def: Definition, requesterId: string, amount: number | null): Promise<{ steps: WorkflowStepSnapshot[]; skipped: string[] }> {
    const steps: WorkflowStepSnapshot[] = [];
    const skipped: string[] = [];
    for (const s of applicableSteps(def.steps as StepDef[], amount)) {
      const base = { name: s.name, slaHours: s.slaHours ?? null };
      if (s.approver.kind === 'role') {
        const holder = await this.firstWithRole(tx, s.approver.role, requesterId);
        if (!holder) throw new UnprocessableEntityException(`Nobody with the role ${s.approver.role} can approve the step "${s.name}"`);
        steps.push({ ...base, kind: 'role', role: s.approver.role, userId: null });
        continue;
      }
      let approver: string | null;
      if (s.approver.kind === 'user') approver = s.approver.userId;
      else {
        const [row] = await tx
          .select({ head: departments.headUserId })
          .from(staffProfiles)
          .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
          .where(eq(staffProfiles.userId, requesterId));
        approver = row?.head ?? null;
        if (!approver) throw new UnprocessableEntityException(`The step "${s.name}" needs a head of department, but none is set for the requester`);
      }
      if (approver === requesterId) skipped.push(s.name);
      else steps.push({ ...base, kind: s.approver.kind, role: null, userId: approver });
    }
    return { steps, skipped };
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

  /** Moves the request to step `index` and raises its task, or approves it when there is no step left. */
  private async enter(tx: Tx, req: WorkflowRequest, index: number, actorId: string): Promise<WorkflowRequest> {
    const step = req.steps[index];
    if (!step) return this.finish(tx, req, 'approved', actorId, '');
    const assignee = step.userId ?? (await this.firstWithRole(tx, step.role ?? '', req.requesterId));
    if (!assignee) throw new UnprocessableEntityException(`Nobody can approve the step "${step.name}"`);
    const task = await this.tasksSvc.create(tx, {
      tenantId: req.tenantId,
      ownerId: req.requesterId,
      assigneeId: assignee,
      title: `Approve: ${req.title}`,
      description: `${step.name} for the ${req.requestType} request "${req.title}"`,
      slaHours: step.slaHours,
      sourceModule: 'workflows',
      sourceId: req.id,
    });
    const [row] = await tx
      .update(workflowRequests)
      .set({ status: 'pending', currentStep: index, approverUserId: step.userId, approverRole: step.role, taskId: task.id, version: req.version + 1, updatedAt: this.clock.now() })
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

  /** Marks the open task of the current step finished (or cancelled). */
  private async closeTask(tx: Tx, req: WorkflowRequest, status: 'done' | 'cancelled') {
    if (!req.taskId) return;
    const now = this.clock.now();
    await tx
      .update(tasks)
      .set({ status, completedAt: status === 'done' ? now : null, version: sql`${tasks.version} + 1`, updatedAt: now })
      .where(and(eq(tasks.id, req.taskId), inArray(tasks.status, ['open', 'in_progress'])));
  }
}
