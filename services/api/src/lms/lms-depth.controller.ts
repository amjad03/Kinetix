import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, lmsItems, lmsModules, marks, students } from '../db/schema.js';
import { learnerRules, lmsItemProgress } from '../db/schema-life.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const AccessBody = z.object({ releaseAt: z.coerce.date().nullable().optional(), prerequisiteItemId: z.uuid().nullable().optional(), audienceStudentIds: z.array(z.uuid()).max(500).nullable().optional() });

/**
 * Course depth: access rules on items (release date, prerequisite, remedial audience, including "the class's slow
 * learners"), and the learning analytics of a course: engagement per student and usage per item.
 */
@Controller('v1/lms')
export class LmsDepthController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
  ) {}

  private async itemCourse(tx: Tx, p: UserPrincipal, itemId: string) {
    const [row] = await tx.select({ item: lmsItems, courseId: lmsModules.courseId }).from(lmsItems).innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId)).where(eq(lmsItems.id, itemId));
    if (!row) throw new NotFoundException('Item not found');
    const c = await this.lms.course(tx, row.courseId);
    await this.lms.assertManage(tx, p, c);
    return { ...row, course: c };
  }

  @Patch('items/:id/access')
  @Auth('user', [...LMS_STAFF])
  access(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AccessBody)) b: z.infer<typeof AccessBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { item, course } = await this.itemCourse(tx, p, id);
      if (b.prerequisiteItemId) {
        if (b.prerequisiteItemId === id) throw new BadRequestException('An item cannot depend on itself');
        const [pre] = await tx.select({ courseId: lmsModules.courseId, pre: lmsItems.prerequisiteItemId }).from(lmsItems).innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId)).where(eq(lmsItems.id, b.prerequisiteItemId));
        if (!pre || pre.courseId !== course.id) throw new BadRequestException('The prerequisite must be an item of this course');
        if (pre.pre === id) throw new BadRequestException('These two items would wait for each other');
      }
      if (b.audienceStudentIds?.length) {
        const ok = await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, b.audienceStudentIds), eq(students.sectionId, course.sectionId)));
        if (ok.length !== new Set(b.audienceStudentIds).size) throw new BadRequestException('Every student must be in this class');
      }
      const set = { ...b, ...(b.audienceStudentIds !== undefined ? { audienceStudentIds: b.audienceStudentIds?.length ? [...new Set(b.audienceStudentIds)] : null } : {}) };
      const [row] = await tx.update(lmsItems).set(set).where(eq(lmsItems.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.item_access_changed', subjectType: 'lms_course', subjectId: course.id, before: { releaseAt: item.releaseAt, prerequisiteItemId: item.prerequisiteItemId, audience: item.audienceStudentIds?.length ?? 0 }, after: { releaseAt: row.releaseAt, prerequisiteItemId: row.prerequisiteItemId, audience: row.audienceStudentIds?.length ?? 0 }, data: { itemId: id } });
      return row;
    });
  }

  /** Remedial content: the item is shown only to the class's slow learners under the institution's rules. */
  @Post('items/:id/assign-slow-learners')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  slow(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { course } = await this.itemCourse(tx, p, id);
      const [r] = await tx.select().from(learnerRules);
      const below = r?.slowBelowPct ?? 40;
      const min = r?.minAssessments ?? 2;
      const rows = await tx
        .select({ studentId: marks.studentId, pct: sql<number>`avg(coalesce(${marks.moderatedMarks}, ${marks.marks}) * 100.0 / nullif(${assessments.maxMarks}, 0))::float8`, n: sql<number>`count(*)::int` })
        .from(marks)
        .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
        .innerJoin(students, eq(students.id, marks.studentId))
        .where(and(eq(students.sectionId, course.sectionId), eq(assessments.subjectId, course.subjectId), eq(marks.absent, false), sql`${assessments.publishedAt} is not null`))
        .groupBy(marks.studentId);
      const slowIds = rows.filter((x) => x.n >= min && x.pct !== null && x.pct < below).map((x) => x.studentId);
      if (!slowIds.length) throw new BadRequestException('No student of this class is below the slow-learner mark in this subject');
      await tx.update(lmsItems).set({ audienceStudentIds: slowIds }).where(eq(lmsItems.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms.item_remedial', subjectType: 'lms_course', subjectId: course.id, data: { itemId: id, students: slowIds.length, belowPct: below } });
      return { students: slowIds.length };
    });
  }

  /** Engagement per student (items opened and finished, last activity) and usage per item (views, students, finished). */
  @Get('courses/:id/analytics')
  @Auth('user', [...LMS_STAFF])
  analytics(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      const items = await tx.select({ id: lmsItems.id, title: lmsItems.title, kind: lmsItems.kind, module: lmsModules.title }).from(lmsItems).innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId)).where(eq(lmsModules.courseId, id)).orderBy(asc(lmsModules.position), asc(lmsItems.position));
      const ids = items.map((i) => i.id);
      const prog = ids.length ? await tx.select().from(lmsItemProgress).where(inArray(lmsItemProgress.itemId, ids)) : [];
      const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, c.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      return {
        courseId: id,
        items: items.map((i) => {
          const rows = prog.filter((x) => x.itemId === i.id);
          return { ...i, views: rows.reduce((s, x) => s + x.views, 0), students: rows.length, completed: rows.filter((x) => x.completedAt).length, reachPct: roster.length ? Math.round((rows.length / roster.length) * 100) : 0 };
        }),
        students: roster.map((s) => {
          const rows = prog.filter((x) => x.studentId === s.id);
          const last = rows.reduce<Date | null>((m, x) => (!m || x.lastViewedAt > m ? x.lastViewedAt : m), null);
          return { ...s, opened: rows.length, completed: rows.filter((x) => x.completedAt).length, engagementPct: ids.length ? Math.round((rows.length / ids.length) * 100) : 0, lastActiveAt: last };
        }),
      };
    });
  }
}
