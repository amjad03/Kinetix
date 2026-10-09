import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, staffProfiles, tasks, userRoles, users } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { dueFor, needsReminder } from './task-rules.js';

export const TASK_ESCALATION = 'tasks.escalate';

export interface NewTask {
  tenantId: string;
  ownerId: string;
  assigneeId: string;
  title: string;
  description?: string;
  dueAt?: Date | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** The module that raised the task and the record it is about, so the task links back. */
  sourceModule?: string;
  sourceId?: string;
  slaHours?: number | null;
  /** Who an overdue task goes to: a named user, else anyone holding the role, else the assignee's department head. */
  escalateUserId?: string | null;
  escalateRole?: string | null;
  /** Remind the assignee once, this many hours after creation. */
  reminderHours?: number | null;
}

/**
 * Tasks between people. Other modules raise them with `create(tx, ...)` inside their own
 * transaction, so a task exists only if the work that raised it committed.
 */
@Injectable()
export class TasksService implements OnModuleInit {
  private readonly log = new Logger(TasksService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHourly(TASK_ESCALATION, (job: Job) => this.sweep(job.tenantId).then(() => undefined));
  }

  /** Creates a task, tells the assignee (unless they gave it to themselves) and records the audit entry. */
  async create(tx: Tx, t: NewTask) {
    const now = this.clock.now();
    const [row] = await tx
      .insert(tasks)
      .values({
        tenantId: t.tenantId,
        title: t.title,
        description: t.description ?? '',
        ownerId: t.ownerId,
        assigneeId: t.assigneeId,
        dueAt: dueFor(t.dueAt, t.slaHours, now),
        priority: t.priority ?? 'normal',
        sourceModule: t.sourceModule ?? null,
        sourceId: t.sourceId ?? null,
        slaHours: t.slaHours ?? null,
        escalateUserId: t.escalateUserId ?? null,
        escalateRole: t.escalateRole ?? null,
        reminderHours: t.reminderHours ?? null,
      })
      .returning();
    await audit(tx, { tenantId: t.tenantId, actorType: 'user', actorId: t.ownerId, action: 'task.created', subjectType: 'task', subjectId: row.id, data: { assigneeId: t.assigneeId, sourceModule: row.sourceModule, sourceId: row.sourceId } });
    if (t.assigneeId !== t.ownerId) {
      await this.notifications.notifyUsers(tx, [t.assigneeId], { kind: 'task', text: { title: 'New task for you', body: row.title }, data: { taskId: row.id }, dedupeKey: `task:new:${row.id}` });
    }
    return row;
  }

  /**
   * Raises a task for the first active holder of one of [roles] (or the owner when nobody holds them). Modules use this
   * for approvals, interventions and evidence requests so the work lands on a person's list with an SLA.
   */
  async createForRole(tx: Tx, tenantId: string, roles: RoleName[], t: Omit<NewTask, 'tenantId' | 'assigneeId'>) {
    const [holder] = await tx
      .select({ id: userRoles.userId })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(inArray(userRoles.role, roles), eq(users.status, 'active')))
      .orderBy(asc(users.createdAt))
      .limit(1);
    return this.create(tx, { ...t, tenantId, assigneeId: holder?.id ?? t.ownerId });
  }

  /** The hourly job: reminders first, then escalation of what is overdue. */
  async sweep(tenantId: string): Promise<{ reminded: string[]; escalated: string[] }> {
    const reminded = await this.remindDue(tenantId);
    const escalated = await this.escalateOverdue(tenantId);
    return { reminded, escalated };
  }

  /** Tells the assignee once that a task with a reminder is still open. Returns the ids reminded. */
  async remindDue(tenantId: string): Promise<string[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const now = this.clock.now();
      const open = await tx.select().from(tasks).where(and(inArray(tasks.status, ['open', 'in_progress']), isNull(tasks.remindedAt), or(isNull(tasks.sourceModule), ne(tasks.sourceModule, 'workflows'))));
      const done: string[] = [];
      for (const t of open.filter((x) => needsReminder(x, now))) {
        await this.notifications.notifyUsers(tx, [t.assigneeId], { kind: 'task', text: { title: 'Task reminder', body: t.title }, data: { taskId: t.id }, dedupeKey: `task:remind:${t.id}` });
        await tx.update(tasks).set({ remindedAt: now, updatedAt: now }).where(eq(tasks.id, t.id));
        await audit(tx, { tenantId, actorType: 'system', action: 'task.reminded', subjectType: 'task', subjectId: t.id, data: { assigneeId: t.assigneeId } });
        done.push(t.id);
      }
      return done;
    });
  }

  /**
   * Overdue tasks that are still open are escalated once: to the named user, or everyone holding the named
   * role, or else the head of the assignee's department, or the task's owner when there is no head (or the
   * assignee is the head). Tasks raised by the workflow engine are escalated by it instead.
   * Returns the ids escalated.
   */
  async escalateOverdue(tenantId: string): Promise<string[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const now = this.clock.now();
      const due = await tx
        .select({ t: tasks, headId: departments.headUserId })
        .from(tasks)
        .leftJoin(staffProfiles, eq(staffProfiles.userId, tasks.assigneeId))
        .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
        .where(and(inArray(tasks.status, ['open', 'in_progress']), lt(tasks.dueAt, now), isNull(tasks.escalatedAt), or(isNull(tasks.sourceModule), ne(tasks.sourceModule, 'workflows'))));
      const done: string[] = [];
      for (const { t, headId } of due) {
        let to: string[] = [];
        if (t.escalateUserId) to = [t.escalateUserId];
        else if (t.escalateRole) {
          const holders = await tx.select({ id: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(userRoles.role, t.escalateRole as RoleName), eq(users.status, 'active')));
          to = holders.map((h) => h.id);
        }
        if (to.length === 0) to = [headId && headId !== t.assigneeId ? headId : t.ownerId];
        await this.notifications.notifyUsers(tx, to, { kind: 'task', text: { title: 'Task overdue', body: t.title }, data: { taskId: t.id, assigneeId: t.assigneeId }, dedupeKey: `task:overdue:${t.id}` });
        await tx.update(tasks).set({ escalatedAt: now, updatedAt: now }).where(eq(tasks.id, t.id));
        await audit(tx, { tenantId, actorType: 'system', action: 'task.escalated', subjectType: 'task', subjectId: t.id, data: { notified: to.length === 1 ? to[0] : to } });
        done.push(t.id);
      }
      if (done.length) this.log.log(`Escalated ${done.length} overdue task(s) for ${tenantId}`);
      return done;
    });
  }
}
