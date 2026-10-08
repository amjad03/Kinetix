import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, staffProfiles, tasks } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { dueFor } from './task-rules.js';

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
    this.jobs.registerDaily(TASK_ESCALATION, (job: Job) => this.escalateOverdue(job.tenantId).then(() => undefined));
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
      })
      .returning();
    await audit(tx, { tenantId: t.tenantId, actorType: 'user', actorId: t.ownerId, action: 'task.created', subjectType: 'task', subjectId: row.id, data: { assigneeId: t.assigneeId, sourceModule: row.sourceModule, sourceId: row.sourceId } });
    if (t.assigneeId !== t.ownerId) {
      await this.notifications.notifyUsers(tx, [t.assigneeId], { kind: 'task', text: { title: 'New task for you', body: row.title }, data: { taskId: row.id }, dedupeKey: `task:new:${row.id}` });
    }
    return row;
  }

  /**
   * Overdue tasks that are still open are escalated once: the head of the assignee's department is
   * told, or the task's owner when the assignee has no department head (or is the head).
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
        .where(and(inArray(tasks.status, ['open', 'in_progress']), lt(tasks.dueAt, now), isNull(tasks.escalatedAt)));
      const done: string[] = [];
      for (const { t, headId } of due) {
        const to = headId && headId !== t.assigneeId ? headId : t.ownerId;
        await this.notifications.notifyUsers(tx, [to], { kind: 'task', text: { title: 'Task overdue', body: t.title }, data: { taskId: t.id, assigneeId: t.assigneeId }, dedupeKey: `task:overdue:${t.id}` });
        await tx.update(tasks).set({ escalatedAt: now, updatedAt: now }).where(eq(tasks.id, t.id));
        await audit(tx, { tenantId, actorType: 'system', action: 'task.escalated', subjectType: 'task', subjectId: t.id, data: { notified: to } });
        done.push(t.id);
      }
      if (done.length) this.log.log(`Escalated ${done.length} overdue task(s) for ${tenantId}`);
      return done;
    });
  }
}
