import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, homework, homeworkSubmissions, marks, students, subjects } from '../db/schema.js';
import { rubrics } from '../db/schema-g1.js';
import { homeworkExtensions, homeworkGroups } from '../db/schema-life.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';
import { markAfterPenalty } from './assignment-rules.js';

const Day = z.iso.date();
const SettingsBody = z.object({
  maxMarks: z.number().positive().max(1000).nullable().optional(),
  latePolicy: z.enum(['accept', 'penalty', 'reject']).optional(),
  latePenaltyPct: z.number().int().min(0).max(100).optional(),
  cutoffOn: Day.nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  rubricId: z.uuid().nullable().optional(),
  groupMode: z.boolean().optional(),
});
const ExtensionBody = z.object({ dueOn: Day, reason: z.string().trim().max(300).default('') });
const GroupsBody = z.object({ groups: z.array(z.object({ name: z.string().trim().min(1).max(80), studentIds: z.array(z.uuid()).min(1).max(20) })).max(100) });
const MarksBody = z.object({ entries: z.array(z.object({ studentId: z.uuid(), marks: z.number().min(0).max(1000).nullable() })).min(1).max(500) });

/**
 * Assignment depth on top of homework: marks out of a maximum, the late policy (accept, a penalty, or refuse) with
 * a hard cut-off, resubmission attempts, a rubric, per-student extensions, groups that hand in once and are marked
 * one by one, the push of marks to the internal-marks register, and the submission compliance report.
 */
@Controller('v1')
export class AssignmentDepthController {
  constructor(
    private readonly db: DbService,
    private readonly teacher: TeacherService,
  ) {}

  private async staff(tx: Tx, p: UserPrincipal, id: string) {
    const [hw] = await tx.select().from(homework).where(eq(homework.id, id));
    if (!hw) throw new NotFoundException('Homework not found');
    if (!isSchoolAdmin(p) && !(await this.teacher.teachesSection(tx, p.userId, hw.sectionId))) throw new ForbiddenException('You do not teach this class');
    return hw;
  }

  /** The rules, extensions and groups of an assignment. */
  @Get('homework/:id/settings')
  @Auth('user')
  settings(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staff(tx, p, id);
      const extensions = await tx.select({ studentId: homeworkExtensions.studentId, fullName: students.fullName, rollNo: students.rollNo, dueOn: homeworkExtensions.dueOn, reason: homeworkExtensions.reason }).from(homeworkExtensions).innerJoin(students, eq(students.id, homeworkExtensions.studentId)).where(eq(homeworkExtensions.homeworkId, id)).orderBy(asc(students.rollNo));
      const groups = await tx.select({ id: homeworkGroups.id, name: homeworkGroups.name, studentIds: homeworkGroups.studentIds }).from(homeworkGroups).where(eq(homeworkGroups.homeworkId, id)).orderBy(asc(homeworkGroups.name));
      return { homeworkId: id, title: hw.title, dueOn: hw.dueOn, maxMarks: hw.maxMarks, latePolicy: hw.latePolicy, latePenaltyPct: hw.latePenaltyPct, cutoffOn: hw.cutoffOn, maxAttempts: hw.maxAttempts, rubricId: hw.rubricId, groupMode: hw.groupMode, pushedAssessmentId: hw.pushedAssessmentId, extensions, groups };
    });
  }

  @Put('homework/:id/settings')
  @Auth('user')
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staff(tx, p, id);
      const cutoff = b.cutoffOn === undefined ? hw.cutoffOn : b.cutoffOn;
      if (cutoff && cutoff < hw.dueOn) throw new BadRequestException('The cut-off cannot be before the due date');
      if (b.rubricId) {
        const [r] = await tx.select({ id: rubrics.id }).from(rubrics).where(eq(rubrics.id, b.rubricId));
        if (!r) throw new NotFoundException('Rubric not found');
      }
      const [row] = await tx.update(homework).set(b).where(eq(homework.id, id)).returning();
      const keys = Object.keys(b) as (keyof typeof b)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.settings_changed', subjectType: 'homework', subjectId: id, before: Object.fromEntries(keys.map((k) => [k, hw[k]])), after: Object.fromEntries(keys.map((k) => [k, row[k]])) });
      return row;
    });
  }

  /** A later due date for one student (illness, a university exam); also lets them hand in after the cut-off. */
  @Put('homework/:id/extensions/:studentId')
  @Auth('user')
  extend(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(ExtensionBody)) b: z.infer<typeof ExtensionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staff(tx, p, id);
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
      if (!st || st.sectionId !== hw.sectionId) throw new NotFoundException('Student not found');
      if (b.dueOn <= hw.dueOn) throw new BadRequestException('An extension must be after the due date');
      const [row] = await tx.insert(homeworkExtensions).values({ tenantId: p.tenantId, homeworkId: id, studentId, dueOn: b.dueOn, reason: b.reason, grantedBy: p.userId }).onConflictDoUpdate({ target: [homeworkExtensions.homeworkId, homeworkExtensions.studentId], set: { dueOn: b.dueOn, reason: b.reason, grantedBy: p.userId } }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.extension_granted', subjectType: 'homework', subjectId: id, data: { studentId, dueOn: b.dueOn, reason: b.reason } });
      return row;
    });
  }

  @Delete('homework/:id/extensions/:studentId')
  @Auth('user')
  unextend(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.staff(tx, p, id);
      const gone = await tx.delete(homeworkExtensions).where(and(eq(homeworkExtensions.homeworkId, id), eq(homeworkExtensions.studentId, studentId))).returning();
      if (!gone.length) throw new NotFoundException('No extension for this student');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.extension_withdrawn', subjectType: 'homework', subjectId: id, data: { studentId } });
      return { ok: true };
    });
  }

  /** Replaces the groups. Each student is in at most one group, from this class. */
  @Put('homework/:id/groups')
  @Auth('user')
  groups(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(GroupsBody)) b: z.infer<typeof GroupsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staff(tx, p, id);
      const all = b.groups.flatMap((g) => g.studentIds);
      if (new Set(all).size !== all.length) throw new BadRequestException('A student can be in one group only');
      if (all.length) {
        const ok = await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, all), eq(students.sectionId, hw.sectionId)));
        if (ok.length !== all.length) throw new BadRequestException('Every member must be a student of this class');
      }
      await tx.delete(homeworkGroups).where(eq(homeworkGroups.homeworkId, id));
      if (b.groups.length) await tx.insert(homeworkGroups).values(b.groups.map((g) => ({ tenantId: p.tenantId, homeworkId: id, name: g.name, studentIds: g.studentIds })));
      if (!hw.groupMode && b.groups.length) await tx.update(homework).set({ groupMode: true }).where(eq(homework.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.groups_set', subjectType: 'homework', subjectId: id, data: { groups: b.groups.length, students: all.length } });
      return { groups: b.groups.length };
    });
  }

  /** Marks per student (group members one by one); the late penalty is taken off what is entered. */
  @Put('homework/:id/marks')
  @Auth('user')
  setMarks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MarksBody)) b: z.infer<typeof MarksBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staff(tx, p, id);
      if (!hw.maxMarks) throw new ConflictException('Set the maximum marks first');
      const subs = await tx.select().from(homeworkSubmissions).where(and(eq(homeworkSubmissions.homeworkId, id), inArray(homeworkSubmissions.studentId, b.entries.map((e) => e.studentId))));
      const out: { studentId: string; marks: number | null }[] = [];
      for (const e of b.entries) {
        const s = subs.find((x) => x.studentId === e.studentId);
        if (!s) throw new ConflictException('Marks go only to students who handed in');
        if (e.marks !== null && e.marks > hw.maxMarks) throw new BadRequestException(`Marks cannot be above ${hw.maxMarks}`);
        const value = e.marks === null ? null : markAfterPenalty(e.marks, hw.maxMarks, s.penaltyPct);
        await tx.update(homeworkSubmissions).set({ marks: value }).where(and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, e.studentId)));
        out.push({ studentId: e.studentId, marks: value });
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.marked', subjectType: 'homework', subjectId: id, data: { students: out.length } });
      return out;
    });
  }

  /**
   * Sends the marks to the internal-marks register as an assignment assessment (a draft the teacher submits there).
   * Students who did not hand in are marked absent. Pushing again updates the draft.
   */
  @Post('homework/:id/push-marks')
  @Auth('user')
  @HttpCode(200)
  push(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hw = await this.staff(tx, p, id);
      if (!hw.maxMarks) throw new ConflictException('Set the maximum marks first');
      let assessmentId = hw.pushedAssessmentId;
      if (assessmentId) {
        const [a] = await tx.select({ status: assessments.markStatus, lockedAt: assessments.lockedAt }).from(assessments).where(eq(assessments.id, assessmentId));
        if (!a) assessmentId = null;
        else if (a.status !== 'draft' || a.lockedAt) throw new ConflictException('These marks have been submitted in the register and can no longer be replaced from here');
      }
      if (!assessmentId) {
        [{ id: assessmentId }] = await tx.insert(assessments).values({ tenantId: p.tenantId, sectionId: hw.sectionId, subjectId: hw.subjectId, title: hw.title.slice(0, 200), kind: 'assignment', maxMarks: hw.maxMarks, heldOn: hw.dueOn, createdBy: p.userId }).returning({ id: assessments.id });
        await tx.update(homework).set({ pushedAssessmentId: assessmentId }).where(eq(homework.id, id));
      } else await tx.update(assessments).set({ maxMarks: hw.maxMarks, title: hw.title.slice(0, 200) }).where(eq(assessments.id, assessmentId));
      const roster = await tx.select({ id: students.id, marks: homeworkSubmissions.marks }).from(students).leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.studentId, students.id), eq(homeworkSubmissions.homeworkId, id))).where(and(eq(students.sectionId, hw.sectionId), eq(students.status, 'active')));
      const unmarked = roster.filter((r) => r.marks === null).length;
      for (const r of roster) {
        const v = { marks: r.marks, absent: r.marks === null };
        await tx.insert(marks).values({ tenantId: p.tenantId, assessmentId: assessmentId!, studentId: r.id, ...v }).onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: v });
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'homework.marks_pushed', subjectType: 'homework', subjectId: id, data: { assessmentId, students: roster.length, unmarked } });
      return { assessmentId, students: roster.length, unmarked };
    });
  }

  /** Submission compliance for a class: per assignment, on time, late, missing and the average mark. */
  @Get('lms/reports/assignments')
  @Auth('user', ['teacher', 'hod', 'principal', 'tenant_admin'])
  report(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!isSchoolAdmin(p) && !(await this.teacher.teachesSection(tx, p.userId, sectionId)) && !p.roles.includes('hod')) throw new ForbiddenException('You do not teach this class');
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(and(eq(students.sectionId, sectionId), eq(students.status, 'active')));
      const rows = await tx
        .select({
          id: homework.id,
          title: homework.title,
          subject: subjects.name,
          dueOn: homework.dueOn,
          maxMarks: homework.maxMarks,
          submitted: sql<number>`count(${homeworkSubmissions.studentId})::int`,
          late: sql<number>`count(*) filter (where ${homeworkSubmissions.late})::int`,
          checked: sql<number>`count(*) filter (where ${homeworkSubmissions.status} = 'checked')::int`,
          avgMarks: sql<number | null>`round(avg(${homeworkSubmissions.marks}), 2)::float8`,
        })
        .from(homework)
        .innerJoin(subjects, eq(subjects.id, homework.subjectId))
        .leftJoin(homeworkSubmissions, eq(homeworkSubmissions.homeworkId, homework.id))
        .where(eq(homework.sectionId, sectionId))
        .groupBy(homework.id, subjects.name)
        .orderBy(desc(homework.dueOn))
        .limit(200);
      return {
        students: n.n,
        assignments: rows.map((r) => ({ ...r, onTime: r.submitted - r.late, missing: Math.max(0, n.n - r.submitted), compliancePct: n.n ? Math.round((r.submitted / n.n) * 100) : 0 })),
      };
    });
  }
}
