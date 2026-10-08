import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { guardians, students, studentLeaveRequests } from '../db/schema.js';

const DECIDERS: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const ApplyBody = z.object({ studentId: z.uuid(), fromDate: Day, toDate: Day, reason: z.string().trim().min(3).max(500) });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });

/**
 * Student leave: a student (or their guardian) applies for days off; teachers and the principal
 * decide. The family sees their own applications; staff see every one, pending first by default.
 */
@Controller('v1/student-leave')
export class StudentLeaveController {
  constructor(private readonly db: DbService) {}

  @Post()
  @Auth('user', ['student', 'guardian'])
  apply(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, []);
      if (b.toDate < b.fromDate) throw new BadRequestException('The leave cannot end before it starts');
      const [row] = await tx.insert(studentLeaveRequests).values({ tenantId: p.tenantId, ...b, requestedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student_leave.requested', subjectType: 'student_leave', subjectId: row.id, data: { studentId: b.studentId } });
      return row;
    });
  }

  /** A student's or their family's own applications (`studentId` for a child); staff see all, filtered by `status`. */
  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = p.roles.some((r) => DECIDERS.includes(r));
      let ids: string[] | undefined;
      if (studentId) {
        await assertCanSeeStudent(tx, p, z.uuid().parse(studentId), DECIDERS);
        ids = [studentId];
      } else if (!staff) {
        const own = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
        const kids = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
        ids = [...own, ...kids].map((x) => x.id);
        if (ids.length === 0) return [];
      }
      const rows = await tx
        .select({ r: studentLeaveRequests, fullName: students.fullName, rollNo: students.rollNo })
        .from(studentLeaveRequests)
        .innerJoin(students, eq(students.id, studentLeaveRequests.studentId))
        .where(and(ids ? inArray(studentLeaveRequests.studentId, ids) : undefined, status ? eq(studentLeaveRequests.status, status) : undefined))
        .orderBy(desc(studentLeaveRequests.createdAt))
        .limit(200);
      return rows.map((x) => ({ ...x.r, fullName: x.fullName, rollNo: x.rollNo }));
    });
  }

  @Post(':id/decide')
  @HttpCode(200)
  @Auth('user', DECIDERS)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const status = b.approve ? 'approved' : 'rejected';
      const [row] = await tx.update(studentLeaveRequests).set({ status, decidedBy: p.userId, decisionNote: b.note ?? null, decidedAt: new Date() }).where(and(eq(studentLeaveRequests.id, id), eq(studentLeaveRequests.status, 'pending'))).returning();
      if (!row) {
        const [cur] = await tx.select({ status: studentLeaveRequests.status }).from(studentLeaveRequests).where(eq(studentLeaveRequests.id, id));
        if (!cur) throw new NotFoundException('Leave request not found');
        throw new ConflictException(`This request is already ${cur.status}`);
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `student_leave.${status}`, subjectType: 'student_leave', subjectId: id });
      return row;
    });
  }

  /** Withdraws a pending application (by whoever made it). */
  @Post(':id/cancel')
  @HttpCode(200)
  @Auth('user', ['student', 'guardian'])
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(studentLeaveRequests).where(eq(studentLeaveRequests.id, id));
      if (!cur) throw new NotFoundException('Leave request not found');
      await assertCanSeeStudent(tx, p, cur.studentId, []);
      if (cur.requestedBy !== p.userId) throw new ForbiddenException('Only the person who applied can withdraw it');
      const [row] = await tx.update(studentLeaveRequests).set({ status: 'cancelled' }).where(and(eq(studentLeaveRequests.id, id), eq(studentLeaveRequests.status, 'pending'))).returning();
      if (!row) throw new ConflictException(`This request is already ${cur.status}`);
      return row;
    });
  }
}
