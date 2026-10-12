import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { coverageCounts } from '../coverage/coverage.controller.js';
import { DbService, type Tx } from '../db/db.service.js';
import { headsSubject } from '../departments/departments.controller.js';
import { assessments, lessonPlans } from '../db/schema.js';
import { AcademicsService } from './academics.service.js';
import { ACAD_STAFF } from './requests.controller.js';

const HEADS: RoleName[] = ['tenant_admin', 'principal'];
const LessonDecision = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).optional() });

type Row = Record<string, unknown>;
const rows = async <T extends Row = Row>(tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute<T>(q)).rows as T[];

/**
 * Record pages of the academics core (class, guardian, teacher load, subject), plus the marks lock
 * and lesson plan approval steps. Each record carries its related lists and audit activity.
 */
@Controller('v1/academics')
export class AcademicRecordsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AcademicsService,
  ) {}

  /** Classes, teachers and subjects with headline numbers: the lists behind the record pages. */
  @Get('directory')
  @Auth('user', ACAD_STAFF)
  directory(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      sections: await rows(
        tx,
        sql`select s.id, s.display_name as name, s.term, pr.name as program, ay.label as year,
              (select count(*)::int from students st where st.section_id = s.id and st.status in ('active','enrolled','on_leave')) as strength,
              (select count(*)::int from timetable_slots ts where ts.section_id = s.id and ts.archived_at is null) as periods
            from sections s join programs pr on pr.id = s.program_id join academic_years ay on ay.id = s.academic_year_id
            order by pr.name, s.term, s.name`,
      ),
      teachers: await rows(
        tx,
        sql`select u.id, u.full_name as name, u.email,
              (select count(*)::int from timetable_slots ts where ts.teacher_id = u.id and ts.archived_at is null) as periods,
              (select count(distinct ts.section_id)::int from timetable_slots ts where ts.teacher_id = u.id and ts.archived_at is null) as sections,
              (select string_agg(distinct d.name, ', ') from department_staff ds join departments d on d.id = ds.department_id where ds.user_id = u.id) as departments
            from users u where u.status = 'active' and exists (select 1 from user_roles r where r.user_id = u.id and r.role in ('teacher','hod'))
            order by u.full_name`,
      ),
      subjects: await rows(
        tx,
        sql`select sb.id, sb.code, sb.name, sb.term, pr.name as program, d.name as department,
              (select count(distinct ts.section_id)::int from timetable_slots ts where ts.subject_id = sb.id and ts.archived_at is null) as sections,
              (select count(*)::int from assessments a where a.subject_id = sb.id) as assessments
            from subjects sb join programs pr on pr.id = sb.program_id left join departments d on d.id = sb.department_id
            order by pr.name, sb.term, sb.code`,
      ),
      rooms: await rows(tx, sql`select r.id, r.name, r.kind, r.capacity from rooms r order by r.name`),
    }));
  }

  @Get('sections/:id')
  @Auth('user', ACAD_STAFF)
  section(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await rows(tx, sql`select s.id, s.display_name as name, s.term, s.name as division, pr.name as program, pr.id as "programId", ay.label as year from sections s join programs pr on pr.id = s.program_id join academic_years ay on ay.id = s.academic_year_id where s.id = ${id}::uuid`);
      if (!s) throw new NotFoundException('Class not found');
      const att = await this.svc.settings(tx, 'attendance');
      const studentsList = await rows(
        tx,
        sql`select st.id, st.roll_no as "rollNo", st.full_name as "fullName", st.status,
              (select count(*)::int from attendance_records ar where ar.student_id = st.id and ar.date >= current_date - 30) as held,
              (select count(*)::int from attendance_records ar where ar.student_id = st.id and ar.date >= current_date - 30 and (ar.status = 'present' or (ar.status = 'late' and ${att.lateCountsAsPresent}))) as attended
            from students st where st.section_id = ${id}::uuid order by st.roll_no`,
      );
      const timetable = await rows(
        tx,
        sql`select ts.id, ts.day_of_week as day, to_char(ts.starts_at,'HH24:MI') as "startsAt", to_char(ts.ends_at,'HH24:MI') as "endsAt", sb.name as subject, sb.id as "subjectId", u.full_name as teacher, u.id as "teacherId", r.name as room
            from timetable_slots ts join subjects sb on sb.id = ts.subject_id join users u on u.id = ts.teacher_id left join rooms r on r.id = ts.room_id
            where ts.section_id = ${id}::uuid and ts.archived_at is null order by ts.day_of_week, ts.starts_at`,
      );
      const assessmentsList = await rows(
        tx,
        sql`select a.id, a.title, a.kind, a.max_marks as "maxMarks", a.held_on as "heldOn", a.mark_status as "markStatus", a.locked_at as "lockedAt", a.published_at as "publishedAt", sb.name as subject
            from assessments a join subjects sb on sb.id = a.subject_id where a.section_id = ${id}::uuid order by a.held_on desc limit 100`,
      );
      const pairs = [...new Map(timetable.map((t) => [t.subjectId as string, { sectionId: id, subjectId: t.subjectId as string, subject: t.subject as string }])).values()];
      const cov = await coverageCounts(tx, pairs);
      const coverage = pairs.map((x) => ({ subjectId: x.subjectId, subject: x.subject, ...(cov.get(`${id}|${x.subjectId}`) ?? { covered: 0, total: 0 }) }));
      const requests = await rows(tx, sql`select ar.id, ar.number, ar.kind, ar.title, ar.status, ar.created_at as "createdAt" from academic_requests ar join students st on st.id = ar.student_id where st.section_id = ${id}::uuid or ar.payload->>'sectionId' = ${id} order by ar.created_at desc limit 50`);
      return { ...s, minPercent: att.minPercent, students: studentsList, timetable, assessments: assessmentsList, coverage, requests, activity: await this.svc.activity(tx, [id]) };
    });
  }

  @Get('guardians/:userId')
  @Auth('user', ACAD_STAFF)
  guardian(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await rows(tx, sql`select u.id, u.full_name as "fullName", u.phone, u.email, u.status, u.preferred_language as language, u.created_at as "createdAt" from users u where u.id = ${userId}::uuid`);
      const children = await rows(
        tx,
        sql`select st.id, st.full_name as "fullName", st.roll_no as "rollNo", st.status, s.display_name as section, g.relation, g.is_primary as "isPrimary", g.is_emergency_contact as "isEmergencyContact"
            from guardians g join students st on st.id = g.student_id join sections s on s.id = st.section_id where g.user_id = ${userId}::uuid order by st.full_name`,
      );
      if (!u || children.length === 0) throw new NotFoundException('Guardian not found');
      const ids = children.map((c) => c.id as string);
      const fees = await rows(tx, sql`select coalesce(sum(fi.amount_paise - fi.paid_paise),0)::bigint as "duePaise", count(*) filter (where fi.amount_paise > fi.paid_paise)::int as "openInvoices" from fee_invoices fi where fi.student_id = any(${`{${ids.join(',')}}`}::uuid[])`);
      const notices = await rows(tx, sql`select n.id, n.kind, n.title, n.created_at as "createdAt", n.read_at as "readAt" from notifications n where n.user_id = ${userId}::uuid order by n.created_at desc limit 30`);
      const requests = await rows(tx, sql`select ar.id, ar.number, ar.kind, ar.title, ar.status, ar.created_at as "createdAt" from academic_requests ar where ar.requested_by = ${userId}::uuid or ar.student_id = any(${`{${ids.join(',')}}`}::uuid[]) order by ar.created_at desc limit 50`);
      return { ...u, children, fees: fees[0] ?? { duePaise: 0, openInvoices: 0 }, notices, requests, activity: await this.svc.activity(tx, [userId, ...ids]) };
    });
  }

  /** A teacher's load: weekly periods by day, classes and subjects, substitutions, marks and lesson plans waiting. */
  @Get('teachers/:id')
  @Auth('user', ACAD_STAFF)
  teacher(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await rows(tx, sql`select u.id, u.full_name as "fullName", u.email, u.phone, u.status, (select string_agg(distinct d.name, ', ') from department_staff ds join departments d on d.id = ds.department_id where ds.user_id = u.id) as departments from users u where u.id = ${id}::uuid`);
      if (!u) throw new NotFoundException('Teacher not found');
      const tt = await this.svc.settings(tx, 'timetable');
      const slots = await rows(
        tx,
        sql`select ts.id, ts.day_of_week as day, to_char(ts.starts_at,'HH24:MI') as "startsAt", to_char(ts.ends_at,'HH24:MI') as "endsAt", sb.name as subject, s.display_name as section, s.id as "sectionId", r.name as room
            from timetable_slots ts join subjects sb on sb.id = ts.subject_id join sections s on s.id = ts.section_id left join rooms r on r.id = ts.room_id
            where ts.teacher_id = ${id}::uuid and ts.archived_at is null order by ts.day_of_week, ts.starts_at`,
      );
      const byDay = [1, 2, 3, 4, 5, 6].map((d) => ({ day: d, periods: slots.filter((s) => s.day === d).length }));
      const substitutions = await rows(
        tx,
        sql`select ts2.id, ts2.date, ts2.status, ts2.reason, case when ts2.substitute_teacher_id = ${id}::uuid then 'covering' else 'covered' end as role, s.display_name as section, sb.name as subject
            from teacher_substitutions ts2 join timetable_slots ts on ts.id = ts2.slot_id join sections s on s.id = ts.section_id join subjects sb on sb.id = ts.subject_id
            where (ts2.substitute_teacher_id = ${id}::uuid or ts2.original_teacher_id = ${id}::uuid) and ts2.date >= current_date - 60 order by ts2.date desc limit 50`,
      );
      const marksPending = await rows(tx, sql`select a.id, a.title, a.mark_status as "markStatus", s.display_name as section, sb.name as subject, a.held_on as "heldOn" from assessments a join sections s on s.id = a.section_id join subjects sb on sb.id = a.subject_id where a.created_by = ${id}::uuid and a.published_at is null order by a.held_on desc limit 50`);
      const plans = await rows(tx, sql`select lp.status, count(*)::int as n from lesson_plans lp where lp.teacher_id = ${id}::uuid group by lp.status`);
      return { ...u, limits: { perDay: tt.maxPeriodsPerTeacherPerDay, perWeek: tt.maxPeriodsPerTeacherPerWeek }, weekly: slots.length, byDay, slots, substitutions, marksPending, lessonPlans: Object.fromEntries(plans.map((x) => [x.status, x.n])), activity: await this.svc.activity(tx, [id], 30) };
    });
  }

  @Get('subjects/:id')
  @Auth('user', ACAD_STAFF)
  subject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await rows(tx, sql`select sb.id, sb.code, sb.name, sb.term, pr.name as program, d.name as department, c.title as course from subjects sb join programs pr on pr.id = sb.program_id left join departments d on d.id = sb.department_id left join courses c on c.id = sb.course_id where sb.id = ${id}::uuid`);
      if (!s) throw new NotFoundException('Subject not found');
      const classes = await rows(
        tx,
        sql`select s.id, s.display_name as section, string_agg(distinct u.full_name, ', ') as teachers, count(*)::int as periods
            from timetable_slots ts join sections s on s.id = ts.section_id join users u on u.id = ts.teacher_id where ts.subject_id = ${id}::uuid and ts.archived_at is null group by s.id, s.display_name order by s.display_name`,
      );
      const cov = await coverageCounts(tx, classes.map((c) => ({ sectionId: c.id as string, subjectId: id })));
      const assessmentsList = await rows(tx, sql`select a.id, a.title, a.kind, a.held_on as "heldOn", a.mark_status as "markStatus", a.locked_at as "lockedAt", a.published_at as "publishedAt", s.display_name as section from assessments a join sections s on s.id = a.section_id where a.subject_id = ${id}::uuid order by a.held_on desc limit 100`);
      const plans = await rows(tx, sql`select lp.id, lp.date, lp.status, s.display_name as section, u.full_name as teacher from lesson_plans lp join sections s on s.id = lp.section_id join users u on u.id = lp.teacher_id where lp.subject_id = ${id}::uuid order by lp.date desc limit 60`);
      const offerings = await rows(tx, sql`select o.id, t.name as term, o.category, o.credits, o.seat_cap as "seatCap", (select count(*)::int from course_registrations cr where cr.offering_id = o.id and cr.status = 'registered') as registered from course_offerings o join academic_terms t on t.id = o.term_id where o.subject_id = ${id}::uuid`);
      return { ...s, classes: classes.map((c) => ({ ...c, ...(cov.get(`${c.id}|${id}`) ?? { covered: 0, total: 0 }) })), assessments: assessmentsList, lessonPlans: plans, offerings, activity: await this.svc.activity(tx, [id]) };
    });
  }

  /** Audit history of any academic record (assessment, student, request). */
  @Get('activity/:id')
  @Auth('user', ACAD_STAFF)
  activity(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.activity(tx, [id]));
  }

  // -------------------------------------------------------------------------------------------
  // Marks: verify → lock → publish
  // -------------------------------------------------------------------------------------------

  @Post('assessments/:id/lock')
  @HttpCode(200)
  @Auth('user', ['hod', ...HEADS])
  lock(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('unlock') unlock?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(assessments).where(eq(assessments.id, id)).for('update');
      if (!a) throw new NotFoundException('Assessment not found');
      if (!p.roles.some((r) => HEADS.includes(r)) && !(await headsSubject(tx, p, a.subjectId))) throw new ForbiddenException('Only the head of this subject can lock its marks');
      const opening = unlock === 'true';
      if (opening) {
        if (!a.lockedAt) throw new ConflictException('The marks are not locked');
        if (a.publishedAt) throw new ConflictException('Published marks stay locked');
      } else {
        if (a.lockedAt) throw new ConflictException('The marks are already locked');
        if (a.markStatus !== 'verified' && a.markStatus !== 'moderated') throw new ConflictException('Verify the marks before locking them');
      }
      const [row] = await tx.update(assessments).set(opening ? { lockedAt: null, lockedBy: null } : { lockedAt: this.svc.now(), lockedBy: p.userId }).where(eq(assessments.id, id)).returning();
      await auditUser(tx, p, opening ? 'marks.unlocked' : 'marks.locked', 'assessment', id);
      return { id: row.id, lockedAt: row.lockedAt, markStatus: row.markStatus };
    });
  }

  // -------------------------------------------------------------------------------------------
  // Lesson plans: submit → head approves or returns
  // -------------------------------------------------------------------------------------------

  @Get('lesson-plans')
  @Auth('user', ACAD_STAFF)
  lessonPlans(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      rows(
        tx,
        sql`select lp.id, lp.date, lp.status, lp.submitted_at as "submittedAt", lp.review_remark as remark, lp.content->>'objective' as objective, s.display_name as section, sb.name as subject, sb.id as "subjectId", u.full_name as teacher, u.id as "teacherId"
            from lesson_plans lp join sections s on s.id = lp.section_id join subjects sb on sb.id = lp.subject_id join users u on u.id = lp.teacher_id
            where (${status ?? null}::text is null or lp.status = ${status ?? null}) and (${p.roles.some((r) => r !== 'teacher')} or lp.teacher_id = ${p.userId}::uuid)
            order by lp.date desc limit 300`,
      ),
    );
  }

  @Post('lesson-plans/:id/submit')
  @HttpCode(200)
  @Auth('user', ['teacher', 'hod', ...HEADS])
  submitPlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [lp] = await tx.select().from(lessonPlans).where(eq(lessonPlans.id, id)).for('update');
      if (!lp) throw new NotFoundException('Lesson plan not found');
      if (lp.teacherId !== p.userId) throw new ForbiddenException('Only the teacher who wrote it can submit it');
      if (lp.status === 'submitted' || lp.status === 'approved') throw new ConflictException(`The plan is already ${lp.status}`);
      await tx.update(lessonPlans).set({ status: 'submitted', submittedAt: this.svc.now() }).where(eq(lessonPlans.id, id));
      await auditUser(tx, p, 'lesson_plan.submitted', 'lesson_plan', id);
      const heads = await rows<{ id: string }>(tx, sql`select d.head_user_id as id from subjects sb join departments d on d.id = sb.department_id where sb.id = ${lp.subjectId}::uuid and d.head_user_id is not null`);
      const to = heads.length ? heads.map((h) => h.id) : await this.svc.usersWithRole(tx, ['principal']);
      await this.svc.notify(tx, to, 'Lesson plan to review', `Plan for ${lp.date}`, `lp:${id}:submitted`, { lessonPlanId: id });
      return { id, status: 'submitted' };
    });
  }

  @Post('lesson-plans/:id/decide')
  @HttpCode(200)
  @Auth('user', ['hod', ...HEADS])
  decidePlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(LessonDecision)) b: z.infer<typeof LessonDecision>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [lp] = await tx.select().from(lessonPlans).where(eq(lessonPlans.id, id)).for('update');
      if (!lp) throw new NotFoundException('Lesson plan not found');
      if (lp.status !== 'submitted') throw new ConflictException('Only a submitted plan can be decided');
      if (!p.roles.some((r) => HEADS.includes(r)) && !(await headsSubject(tx, p, lp.subjectId))) throw new ForbiddenException('Only the head of this subject can decide');
      if (b.decision === 'reject' && !b.note) throw new BadRequestException('Say what to change');
      const status = b.decision === 'approve' ? 'approved' : 'returned';
      await tx.update(lessonPlans).set({ status, reviewedBy: p.userId, reviewedAt: this.svc.now(), reviewRemark: b.note ?? null }).where(eq(lessonPlans.id, id));
      await auditUser(tx, p, `lesson_plan.${status}`, 'lesson_plan', id, { note: b.note ?? null });
      await this.svc.notify(tx, [lp.teacherId], status === 'approved' ? 'Lesson plan approved' : 'Lesson plan returned', b.note ?? `Plan for ${lp.date}`, `lp:${id}:${status}`, { lessonPlanId: id });
      return { id, status };
    });
  }
}
