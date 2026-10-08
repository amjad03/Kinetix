import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { assessments, departments, guardians, homework, homeworkSubmissions, lmsCourses, lmsGradeCategories, lmsGradeOverrides, marks, students, subjects, timetableSlots } from '../db/schema.js';
import { letterGrade, percentOf, round2, weightedGrade } from './gradebook-math.js';

type Course = typeof lmsCourses.$inferSelect;
export const LMS_STAFF = ['teacher', 'hod', 'principal', 'tenant_admin'] as const;

export interface GradeCell { categoryId: string; percent: number | null; overridden: boolean }
export interface GradeRow { studentId: string; fullName: string; rollNo: string; cells: GradeCell[]; overall: number | null; letter: string | null }

@Injectable()
export class LmsService {
  async course(tx: Tx, id: string): Promise<Course> {
    const [c] = await tx.select().from(lmsCourses).where(eq(lmsCourses.id, id));
    if (!c) throw new NotFoundException('Course not found');
    return c;
  }

  /** Principal and administrator, the head of the subject's department, or a teacher who has the class in the timetable. */
  async canManage(tx: Tx, p: UserPrincipal, c: { sectionId: string; subjectId: string }): Promise<boolean> {
    if (p.roles.some((r) => r === 'principal' || r === 'tenant_admin')) return true;
    if (p.roles.includes('hod')) {
      const [d] = await tx.select({ head: departments.headUserId }).from(subjects).innerJoin(departments, eq(departments.id, subjects.departmentId)).where(eq(subjects.id, c.subjectId));
      if (d?.head === p.userId) return true;
    }
    if (!p.roles.some((r) => r === 'teacher' || r === 'hod')) return false;
    const [slot] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.teacherId, p.userId), eq(timetableSlots.sectionId, c.sectionId), eq(timetableSlots.subjectId, c.subjectId))).limit(1);
    return !!slot;
  }

  async assertManage(tx: Tx, p: UserPrincipal, c: { sectionId: string; subjectId: string }): Promise<void> {
    if (!(await this.canManage(tx, p, c))) throw new ForbiddenException('You do not teach this course');
  }

  /** The students a student or guardian user may look at (own record, or their children). */
  async familyStudents(tx: Tx, p: UserPrincipal) {
    const own = await tx.select().from(students).where(eq(students.userId, p.userId));
    const kids = await tx.select({ s: students }).from(guardians).innerJoin(students, eq(students.id, guardians.studentId)).where(eq(guardians.userId, p.userId));
    return [...own, ...kids.map((k) => k.s)];
  }

  /**
   * Category percentages and the running grade for the students of a course. `publishedOnly` (the
   * student and family view) counts only assessments the school has published.
   */
  async gradebook(tx: Tx, c: Course, opts: { publishedOnly: boolean; studentIds?: string[] }) {
    const cats = await tx.select().from(lmsGradeCategories).where(eq(lmsGradeCategories.courseId, c.id)).orderBy(asc(lmsGradeCategories.position));
    const roster = await tx.select().from(students).where(and(eq(students.sectionId, c.sectionId), eq(students.status, 'active'), opts.studentIds ? inArray(students.id, opts.studentIds) : undefined)).orderBy(asc(students.rollNo));
    const ids = roster.map((s) => s.id);
    const ass = await tx.select().from(assessments).where(and(eq(assessments.sectionId, c.sectionId), eq(assessments.subjectId, c.subjectId), opts.publishedOnly ? isNotNull(assessments.publishedAt) : undefined));
    const markRows = ass.length && ids.length ? await tx.select().from(marks).where(and(inArray(marks.assessmentId, ass.map((a) => a.id)), inArray(marks.studentId, ids))) : [];
    const hw = await tx.select({ id: homework.id }).from(homework).where(and(eq(homework.sectionId, c.sectionId), eq(homework.subjectId, c.subjectId)));
    const subs = hw.length && ids.length ? await tx.select({ studentId: homeworkSubmissions.studentId }).from(homeworkSubmissions).where(and(inArray(homeworkSubmissions.homeworkId, hw.map((h) => h.id)), inArray(homeworkSubmissions.studentId, ids))) : [];
    const ovr = cats.length && ids.length ? await tx.select().from(lmsGradeOverrides).where(and(inArray(lmsGradeOverrides.categoryId, cats.map((x) => x.id)), inArray(lmsGradeOverrides.studentId, ids))) : [];
    const rows: GradeRow[] = roster.map((s) => {
      const cells: GradeCell[] = cats.map((cat) => {
        const o = ovr.find((x) => x.categoryId === cat.id && x.studentId === s.id);
        if (o) return { categoryId: cat.id, percent: o.percent, overridden: true };
        if (cat.source === 'homework') return { categoryId: cat.id, percent: hw.length ? percentOf(subs.filter((x) => x.studentId === s.id).length, hw.length) : null, overridden: false };
        let earned = 0;
        let max = 0;
        for (const a of ass.filter((x) => x.kind === cat.source)) {
          const m = markRows.find((x) => x.assessmentId === a.id && x.studentId === s.id);
          if (!m || m.absent) continue;
          const v = m.moderatedMarks ?? m.marks;
          if (v === null) continue;
          earned += v;
          max += a.maxMarks;
        }
        return { categoryId: cat.id, percent: percentOf(earned, max), overridden: false };
      });
      const overall = weightedGrade(cats.map((cat, i) => ({ weight: cat.weight, percent: cells[i].percent })));
      return { studentId: s.id, fullName: s.fullName, rollNo: s.rollNo, cells, overall, letter: letterGrade(overall) };
    });
    return { categories: cats.map((x) => ({ id: x.id, name: x.name, source: x.source, weight: round2(x.weight) })), rows };
  }
}
