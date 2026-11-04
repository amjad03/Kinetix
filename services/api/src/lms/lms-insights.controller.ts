import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/today.js';
import { DbService, type Tx } from '../db/db.service.js';
import { homework, homeworkSubmissions, lmsCourses, lmsItems, lmsModules, students, subjects } from '../db/schema.js';
import { homeworkExtensions, lmsItemProgress } from '../db/schema-life.js';
import { lmsCertificates, lmsLiveJoins, lmsLiveSessions } from '../db/schema-lms.js';
import { csv } from '../hr/exports.js';
import { courseCompletions } from './lms-completion.js';
import { type LmsSettings, lmsSettingsOf } from './lms-settings.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const LEADERS = ['principal', 'tenant_admin', 'hod', 'quality_officer'] as const;
const DAY = 86_400_000;

export interface RiskInput {
  items: number;
  opened: number;
  lastActiveAt: Date | null;
  overdue: number;
  quizPct: number | null;
  liveHeld: number;
  liveJoined: number;
}
export type RiskReason = 'inactive' | 'low_engagement' | 'low_quiz' | 'overdue' | 'missed_live';

/** Why a student is at risk in a course, by the institution's thresholds, and how much (none, low, medium, high). */
export function riskOf(r: RiskInput, s: Pick<LmsSettings, 'atRiskInactiveDays' | 'atRiskEngagementBelowPct' | 'atRiskQuizBelowPct' | 'atRiskOverdueCount'>, now: Date): { reasons: RiskReason[]; level: 'none' | 'low' | 'medium' | 'high'; engagementPct: number } {
  const engagementPct = r.items ? Math.round((r.opened * 100) / r.items) : 0;
  const reasons: RiskReason[] = [];
  if (r.items && (!r.lastActiveAt || now.getTime() - r.lastActiveAt.getTime() > s.atRiskInactiveDays * DAY)) reasons.push('inactive');
  if (r.items && engagementPct < s.atRiskEngagementBelowPct) reasons.push('low_engagement');
  if (r.quizPct !== null && r.quizPct < s.atRiskQuizBelowPct) reasons.push('low_quiz');
  if (r.overdue >= s.atRiskOverdueCount) reasons.push('overdue');
  if (r.liveHeld >= 2 && r.liveJoined * 2 < r.liveHeld) reasons.push('missed_live');
  const level = reasons.length >= 3 ? 'high' : reasons.length === 2 ? 'medium' : reasons.length === 1 ? 'low' : 'none';
  return { reasons, level, engagementPct };
}

/**
 * LMS analytics: students at risk in a course (activity, engagement, quiz scores, overdue work, missed live classes),
 * the institution's LMS at a glance, the NAAC 2.3.2 / NBA evidence of teachers using the LMS, and one student's LMS
 * summary for their family and mentors.
 */
@Controller('v1/lms')
export class LmsInsightsController {
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly clock: Clock,
  ) {}

  /** Per student of the course: the figures behind the risk and the reasons, highest risk first. */
  @Get('courses/:id/at-risk')
  @Auth('user', [...LMS_STAFF])
  atRisk(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.lms.course(tx, id);
      await this.lms.assertManage(tx, p, c);
      const rows = await this.figures(tx, c, null);
      const settings = await lmsSettingsOf(tx, p.tenantId);
      const now = this.clock.now();
      const order = { high: 0, medium: 1, low: 2, none: 3 };
      const out = rows.map((r) => ({ ...r, ...riskOf(r, settings, now) })).sort((a, b) => order[a.level] - order[b.level] || a.engagementPct - b.engagementPct);
      return { courseId: id, thresholds: { inactiveDays: settings.atRiskInactiveDays, engagementBelowPct: settings.atRiskEngagementBelowPct, quizBelowPct: settings.atRiskQuizBelowPct, overdueCount: settings.atRiskOverdueCount }, atRisk: out.filter((r) => r.level !== 'none').length, students: out };
    });
  }

  /** The figures for a course's students (or one), in a fixed number of queries. */
  private async figures(tx: Tx, c: typeof lmsCourses.$inferSelect, onlyStudent: string | null) {
    const roster = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, c.sectionId), eq(students.status, 'active'), onlyStudent ? eq(students.id, onlyStudent) : undefined)).orderBy(asc(students.rollNo));
    const ids = roster.map((r) => r.id);
    if (!ids.length) return [];
    const items = await tx.select({ id: lmsItems.id }).from(lmsItems).innerJoin(lmsModules, eq(lmsModules.id, lmsItems.moduleId)).where(eq(lmsModules.courseId, c.id));
    const prog = items.length ? await tx.select({ studentId: lmsItemProgress.studentId, last: lmsItemProgress.lastViewedAt, done: lmsItemProgress.completedAt }).from(lmsItemProgress).where(and(inArray(lmsItemProgress.itemId, items.map((i) => i.id)), inArray(lmsItemProgress.studentId, ids))) : [];
    const today = await tenantToday(tx, this.clock);
    const overdue = await tx
      .select({ studentId: students.id, n: sql<number>`count(*)::int` })
      .from(homework)
      .innerJoin(students, eq(students.sectionId, homework.sectionId))
      .leftJoin(homeworkExtensions, and(eq(homeworkExtensions.homeworkId, homework.id), eq(homeworkExtensions.studentId, students.id)))
      .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, homework.id), eq(homeworkSubmissions.studentId, students.id)))
      .where(and(eq(homework.sectionId, c.sectionId), eq(homework.subjectId, c.subjectId), inArray(students.id, ids), sql`${homeworkSubmissions.studentId} is null`, lt(sql`coalesce(${homeworkExtensions.dueOn}, ${homework.dueOn})`, today)))
      .groupBy(students.id);
    // Each student's best attempt per quiz of this class and subject, then their share of the marks over those quizzes.
    const quiz = (
      await tx.execute<{ student_id: string; pct: number | null }>(sql`
        select student_id, (sum(best) * 100.0 / nullif(sum(mx), 0))::float8 as pct from (
          select a.student_id, a.quiz_id, max(a.score) as best, max(a.max_score) as mx from lms_quiz_attempts a join lms_quizzes q on q.id = a.quiz_id
          where q.section_id = ${c.sectionId}::uuid and q.subject_id = ${c.subjectId}::uuid and a.submitted_at is not null and a.student_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
          group by a.student_id, a.quiz_id) b group by student_id`)
    ).rows.map((r) => ({ studentId: r.student_id, pct: r.pct }));
    const now = this.clock.now();
    const held = await tx.select({ id: lmsLiveSessions.id }).from(lmsLiveSessions).where(and(eq(lmsLiveSessions.courseId, c.id), eq(lmsLiveSessions.status, 'scheduled'), lt(lmsLiveSessions.startsAt, now)));
    const joins = held.length ? await tx.select({ studentId: lmsLiveJoins.studentId, n: sql<number>`count(*)::int` }).from(lmsLiveJoins).where(inArray(lmsLiveJoins.sessionId, held.map((h) => h.id))).groupBy(lmsLiveJoins.studentId) : [];
    return roster.map((s) => {
      const mine = prog.filter((x) => x.studentId === s.id);
      const last = mine.reduce<Date | null>((m, x) => (!m || x.last > m ? x.last : m), null);
      const q = quiz.find((x) => x.studentId === s.id)?.pct;
      return { ...s, items: items.length, opened: mine.length, completed: mine.filter((x) => x.done).length, lastActiveAt: last, overdue: overdue.find((x) => x.studentId === s.id)?.n ?? 0, quizPct: q === undefined || q === null ? null : Math.round(q * 100) / 100, liveHeld: held.length, liveJoined: joins.find((x) => x.studentId === s.id)?.n ?? 0 };
    });
  }

  /** The institution's LMS at a glance (leaders, heads of department and IQAC). */
  @Get('overview')
  @Auth('user', [...LEADERS])
  overview(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await tx.execute<Record<string, number>>(sql`select
        (select count(*)::int from lms_courses) as courses,
        (select count(*)::int from lms_courses where status = 'published') as published,
        (select count(*)::int from lms_items) as items,
        (select count(distinct student_id)::int from lms_item_progress where last_viewed_at > now() - interval '7 days') as active7,
        (select count(distinct student_id)::int from lms_item_progress where last_viewed_at > now() - interval '30 days') as active30,
        (select count(*)::int from lms_item_progress where completed_at is not null) as completions,
        (select count(*)::int from lms_quizzes where status <> 'draft') as quizzes,
        (select count(*)::int from lms_quiz_attempts where submitted_at is not null) as attempts,
        (select count(*)::int from lms_quiz_attempts where flagged) as flagged,
        (select count(*)::int from forum_threads where created_at > now() - interval '30 days') as threads30,
        (select count(*)::int from forum_posts where created_at > now() - interval '30 days') as posts30,
        (select count(*)::int from forum_reports where status = 'open') as "openReports",
        (select count(*)::int from lms_live_sessions where status = 'scheduled') as live,
        (select count(*)::int from lms_live_joins) as "liveJoins",
        (select count(*)::int from lms_certificates where revoked_at is null) as certificates,
        (select count(*)::int from scorm_packages) as packages,
        (select count(*)::int from lms_learning_paths where status = 'published') as paths`);
      const kinds = await tx.select({ kind: lmsItems.kind, n: sql<number>`count(*)::int` }).from(lmsItems).groupBy(lmsItems.kind);
      const row = r.rows[0] ?? {};
      return { ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])), itemsByKind: Object.fromEntries(kinds.map((k) => [k.kind, k.n])) };
    });
  }

  /**
   * NAAC 2.3.2 (teachers using ICT, LMS and e-learning resources) and NBA teaching-learning evidence: per teacher, the
   * courses they teach on the LMS, e-content by kind, quizzes, live classes and forum posts in the period, and the
   * share of teachers who use the LMS. `?format=csv` for the upload.
   */
  @Get('reports/evidence')
  @Auth('user', [...LEADERS])
  async evidence(@CurrentPrincipal() p: UserPrincipal, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !day.test(from)) || (to && !day.test(to))) throw new BadRequestException('Dates are YYYY-MM-DD');
    const data = await this.db.withTenant(p.tenantId, async (tx) => {
      const f = from ?? '1900-01-01';
      const t = to ?? '2999-12-31';
      const rows = await tx.execute<{ user_id: string; name: string; courses: number; published: number; items: number; pages: number; videos: number; files: number; packages: number; quizzes: number; live: number; posts: number; learners: number }>(sql`
        with teachers as (
          select u.id as user_id, u.full_name as name from users u
          where exists (select 1 from user_roles r where r.user_id = u.id and r.role in ('teacher', 'hod'))
        ),
        taught as (
          select distinct ts.teacher_id as user_id, c.id as course_id, c.status from lms_courses c
          join timetable_slots ts on ts.section_id = c.section_id and ts.subject_id = c.subject_id
          union select c.created_by, c.id, c.status from lms_courses c
        ),
        items as (
          select tg.user_id, i.kind, i.id from taught tg join lms_modules m on m.course_id = tg.course_id join lms_items i on i.module_id = m.id
          where i.updated_at::date between ${f}::date and ${t}::date
        )
        select tc.user_id, tc.name,
          (select count(distinct course_id)::int from taught x where x.user_id = tc.user_id) as courses,
          (select count(distinct course_id)::int from taught x where x.user_id = tc.user_id and x.status = 'published') as published,
          (select count(distinct id)::int from items x where x.user_id = tc.user_id) as items,
          (select count(distinct id)::int from items x where x.user_id = tc.user_id and x.kind = 'page') as pages,
          (select count(distinct id)::int from items x where x.user_id = tc.user_id and x.kind = 'video') as videos,
          (select count(distinct id)::int from items x where x.user_id = tc.user_id and x.kind in ('file', 'pdf', 'ppt', 'link', 'case_study')) as files,
          (select count(distinct id)::int from items x where x.user_id = tc.user_id and x.kind in ('scorm', 'simulation', 'virtual_lab')) as packages,
          (select count(*)::int from lms_quizzes q where q.created_by = tc.user_id and q.status <> 'draft' and q.opens_at::date between ${f}::date and ${t}::date) as quizzes,
          (select count(*)::int from lms_live_sessions l where l.created_by = tc.user_id and l.status = 'scheduled' and l.starts_at::date between ${f}::date and ${t}::date) as live,
          (select count(*)::int from forum_posts fp where fp.author_id = tc.user_id and fp.created_at::date between ${f}::date and ${t}::date) as posts,
          (select count(distinct p.student_id)::int from taught x join lms_modules m on m.course_id = x.course_id join lms_items i on i.module_id = m.id join lms_item_progress p on p.item_id = i.id where x.user_id = tc.user_id and p.last_viewed_at::date between ${f}::date and ${t}::date) as learners
        from teachers tc order by tc.name`);
      const list = rows.rows.map((r) => ({ userId: r.user_id, name: r.name, courses: r.courses, published: r.published, items: r.items, pages: r.pages, videos: r.videos, files: r.files, packages: r.packages, quizzes: r.quizzes, live: r.live, posts: r.posts, learners: r.learners, usesLms: r.published > 0 && (r.items > 0 || r.quizzes > 0 || r.live > 0) }));
      const using = list.filter((r) => r.usesLms).length;
      return { from: from ?? null, to: to ?? null, teachers: list.length, teachersUsingLms: using, pctTeachersUsingLms: list.length ? Math.round((using * 10000) / list.length) / 100 : 0, rows: list };
    });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="naac-2.3.2-lms-evidence.csv"');
      return csv([['Teacher', 'Courses on the LMS', 'Published', 'E-content items', 'Lesson pages', 'Videos', 'Files and links', 'SCORM, simulations, labs', 'Quizzes', 'Live classes', 'Forum posts', 'Learners reached', 'Uses the LMS'], ...data.rows.map((r) => [r.name, r.courses, r.published, r.items, r.pages, r.videos, r.files, r.packages, r.quizzes, r.live, r.posts, r.learners, r.usesLms ? 'Yes' : 'No']), [], ['Teachers', data.teachers], ['Teachers using the LMS', data.teachersUsingLms], ['Percentage (NAAC 2.3.2)', data.pctTeachersUsingLms]]);
    }
    return data;
  }

  /** One student's LMS picture: each course's completion, grade, last activity, overdue work and risk, and certificates. */
  @Get('students/:studentId/summary')
  @Auth('user')
  summary(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, [...LMS_STAFF, 'counsellor', 'quality_officer']);
      const [stu] = await tx.select({ id: students.id, sectionId: students.sectionId, fullName: students.fullName }).from(students).where(eq(students.id, studentId));
      if (!stu) throw new NotFoundException('Student not found');
      const courses = await tx.select({ c: lmsCourses, subject: subjects.name }).from(lmsCourses).innerJoin(subjects, eq(subjects.id, lmsCourses.subjectId)).where(and(eq(lmsCourses.sectionId, stu.sectionId), eq(lmsCourses.status, 'published'))).orderBy(asc(subjects.name));
      const settings = await lmsSettingsOf(tx, p.tenantId);
      const now = this.clock.now();
      const out = [];
      for (const { c, subject } of courses) {
        const [f] = await this.figures(tx, c, studentId);
        const done = (await courseCompletions(tx, this.lms, c, [studentId], now)).get(studentId)!;
        const g = (await this.lms.gradebook(tx, c, { publishedOnly: true, studentIds: [studentId] })).rows[0];
        out.push({ courseId: c.id, title: c.title, subject, completionPct: done.pct, itemsDone: done.done, itemsTotal: done.total, grade: g?.overall ?? null, letter: g?.letter ?? null, lastActiveAt: f?.lastActiveAt ?? null, overdue: f?.overdue ?? 0, quizPct: f?.quizPct ?? null, liveHeld: f?.liveHeld ?? 0, liveJoined: f?.liveJoined ?? 0, risk: f ? riskOf(f, settings, now) : null });
      }
      const certs = await tx.select({ id: lmsCertificates.id, serial: lmsCertificates.serial, issuedAt: lmsCertificates.issuedAt, courseId: lmsCertificates.courseId, revokedAt: lmsCertificates.revokedAt }).from(lmsCertificates).where(eq(lmsCertificates.studentId, studentId));
      return { studentId, name: stu.fullName, courses: out, certificates: certs };
    });
  }
}
