import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, UnprocessableEntityException, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { aliasedTable, and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { roleName, tasks, userRoles, users } from '../db/schema.js';
import { checkVersion } from '../placements/placements.access.js';
import { canMoveTask } from './task-rules.js';
import { TasksService } from './tasks.service.js';

/** Everyone who works at the institution: tasks are between staff, not students or parents. */
export const TASK_ROLES: RoleName[] = [
  'tenant_admin', 'principal', 'hod', 'teacher', 'librarian', 'accountant', 'transport_manager', 'driver', 'hostel_warden', 'canteen_manager', 'store_keeper',
  'admissions_officer', 'hr_manager', 'placement_officer', 'research_coordinator', 'grievance_officer', 'counsellor', 'icc_member',
];

const CreateBody = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000).default(''),
  assigneeId: z.uuid(),
  dueAt: z.coerce.date().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  slaHours: z.number().int().min(1).max(24 * 90).optional(),
  /** Where an overdue task goes: a named person, or anyone holding a role. */
  escalateUserId: z.uuid().optional(),
  escalateRole: z.enum(roleName.enumValues).optional(),
  reminderHours: z.number().int().min(1).max(24 * 90).optional(),
  sourceModule: z.string().trim().max(60).optional(),
  sourceId: z.string().trim().max(120).optional(),
});
const StatusBody = z.object({ status: z.enum(['open', 'in_progress', 'done', 'cancelled']), expectedVersion: z.number().int().optional() });

/** The task engine: what is on my plate, what I asked of others, and moving a task along. */
@Controller('v1/tasks')
export class TasksController {
  constructor(
    private readonly db: DbService,
    private readonly svc: TasksService,
    private readonly clock: Clock,
  ) {}

  /** Staff a task can be given to. */
  @Get('people')
  @Auth('user', TASK_ROLES)
  people(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staffIds = tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, TASK_ROLES));
      return tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, staffIds)).orderBy(asc(users.fullName));
    });
  }

  @Post()
  @Auth('user', TASK_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [assignee] = await tx.select({ id: users.id }).from(users).where(eq(users.id, b.assigneeId));
      if (!assignee) throw new NotFoundException('Assignee not found');
      if (b.escalateUserId) {
        const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, b.escalateUserId));
        if (!target) throw new NotFoundException('Escalation person not found');
      }
      if ((b.escalateUserId || b.escalateRole) && !b.dueAt && !b.slaHours) throw new UnprocessableEntityException('Escalation needs a due date or an SLA in hours');
      return this.svc.create(tx, { tenantId: p.tenantId, ownerId: p.userId, ...b });
    });
  }

  /** Tasks given to me. `status=active` (the default) hides finished and cancelled ones; `status=all` shows everything. */
  @Get('mine')
  @Auth('user', TASK_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.list(p, 'assignee', status);
  }

  /** Tasks I asked others to do. */
  @Get('assigned-by-me')
  @Auth('user', TASK_ROLES)
  assignedByMe(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.list(p, 'owner', status);
  }

  private list(p: UserPrincipal, side: 'assignee' | 'owner', status = 'active') {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const assignee = aliasedTable(users, 'assignee');
      const owner = aliasedTable(users, 'owner');
      const rows = await tx
        .select({ t: tasks, assigneeName: assignee.fullName, ownerName: owner.fullName })
        .from(tasks)
        .innerJoin(assignee, eq(assignee.id, tasks.assigneeId))
        .innerJoin(owner, eq(owner.id, tasks.ownerId))
        .where(
          and(
            eq(side === 'assignee' ? tasks.assigneeId : tasks.ownerId, p.userId),
            status === 'all' ? undefined : status === 'active' ? notInArray(tasks.status, ['done', 'cancelled']) : eq(tasks.status, status as 'open'),
          ),
        )
        .orderBy(sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt));
      const now = this.clock.now();
      return rows.map((r) => ({ ...r.t, assigneeName: r.assigneeName, ownerName: r.ownerName, overdue: !!r.t.dueAt && r.t.dueAt < now && (r.t.status === 'open' || r.t.status === 'in_progress') }));
    });
  }

  /** The assignee or the owner moves a task along; every move is audited. */
  @Post(':id/status')
  @Auth('user', TASK_ROLES)
  @HttpCode(200)
  setStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StatusBody)) b: z.infer<typeof StatusBody>) {
    return this.db.withTenant(p.tenantId, async (tx: Tx) => {
      const [cur] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update');
      if (!cur) throw new NotFoundException('Task not found');
      if (cur.assigneeId !== p.userId && cur.ownerId !== p.userId) throw new ForbiddenException('Only the owner or the assignee can change a task');
      checkVersion(cur.version, b.expectedVersion);
      if (!canMoveTask(cur.status, b.status)) throw new ConflictException(`A ${cur.status.replace('_', ' ')} task cannot become ${b.status.replace('_', ' ')}`);
      const now = this.clock.now();
      const [row] = await tx
        .update(tasks)
        .set({ status: b.status, version: cur.version + 1, updatedAt: now, completedAt: b.status === 'done' ? now : null })
        .where(eq(tasks.id, id))
        .returning();
      await auditUser(tx, p, 'task.status_changed', 'task', id, { from: cur.status, to: b.status });
      return row;
    });
  }
}
