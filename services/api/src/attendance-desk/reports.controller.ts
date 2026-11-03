import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { attendancePolicy, attendanceWindow, classStudents, eligibilityFor } from '../attendance-governance/policy.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Day } from '../common/ops.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, sections, timetableSlots, users } from '../db/schema.js';
import { addDays, isSchoolAdmin } from '../teacher/teacher.service.js';
import { AttendanceDeskService } from './desk.service.js';

/** Reports are for the office: the principal, heads of department (their department), the exam cell and the IQAC. */
const REPORT_ROLES: RoleName[] = ['principal', 'tenant_admin', 'hod', 'exam_controller', 'quality_officer'];
const Range = z.object({ from: Day.optional(), to: Day.optional(), departmentId: z.uuid().optional() });
const ClassQuery = z.object({ sectionId: z.uuid() });
const TrendQuery = z.object({ sectionId: z.uuid().optional(), programId: z.uuid().optional(), weeks: z.coerce.number().int().min(2).max(16).default(8) });
const YearQuery = z.object({ year: z.string().regex(/^\d{4}-\d{2}$/).optional() });

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * Attendance reports: faculty-wise marking compliance, a class's subject-wise summary, the defaulter trend week by
 * week, and the figures NAAC, AISHE and UDISE+ ask for (instructional days, programme-wise attendance, shortage and
 * detention, staff attendance), which the accreditation workspace also reads as live sources.
 */
@Controller('v1/attendance-desk/reports')
export class AttendanceReportsController {
  constructor(
    private readonly db: DbService,
    private readonly desk: AttendanceDeskService,
  ) {}

  /**
   * Per teacher over the dates (default the last 30 days): periods that met, marked the same day, marked later,
   * left unmarked, and the share marked. A head of department sees their department.
   */
  @Get('compliance')
  @Auth('user', REPORT_ROLES)
  compliance(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = Range.parse(raw);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const now = await this.desk.now(tx);
      const to = q.to ?? now.date;
      const from = q.from ?? addDays(to, -29);
      if (from > to) throw new BadRequestException('from must be on or before to');
      const periods = await this.desk.unmarked(tx, { ...p, roles: p.roles.includes('exam_controller') || p.roles.includes('quality_officer') ? [...p.roles, 'tenant_admin'] : p.roles }, { from, to, departmentId: q.departmentId, includeMarked: true });
      // When each period was first marked, in local time: the same day is on time.
      const firsts = periods.length
        ? (await tx.execute<{ slot_id: string; date: string; first_day: string }>(sql`
            select timetable_slot_id as slot_id, date::text as date, to_char(min(occurred_at) at time zone ${now.tz}, 'YYYY-MM-DD') as first_day
            from attendance_records where timetable_slot_id is not null and date between ${from}::date and ${to}::date group by timetable_slot_id, date`)).rows
        : [];
      const first = new Map(firsts.map((f) => [`${f.slot_id}|${f.date}`, f.first_day]));
      const by = new Map<string, { teacherId: string; teacher: string; departmentId: string | null; scheduled: number; sameDay: number; later: number; unmarked: number }>();
      for (const x of periods) {
        const r = by.get(x.teacherId) ?? { teacherId: x.teacherId, teacher: x.teacher, departmentId: x.departmentId ?? null, scheduled: 0, sameDay: 0, later: 0, unmarked: 0 };
        r.scheduled++;
        if (!x.marked) r.unmarked++;
        else if ((first.get(`${x.slotId}|${x.date}`) ?? x.date) <= x.date) r.sameDay++;
        else r.later++;
        by.set(x.teacherId, r);
      }
      const deptIds = [...new Set([...by.values()].map((r) => r.departmentId).filter((d): d is string => !!d))];
      const names = new Map(deptIds.length ? (await tx.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds))).map((d) => [d.id, d.name]) : []);
      const rows = [...by.values()]
        .map((r) => ({ ...r, department: r.departmentId ? (names.get(r.departmentId) ?? '') : '', markedPct: pct(r.sameDay + r.later, r.scheduled), onTimePct: pct(r.sameDay, r.scheduled) }))
        .sort((a, b) => (a.markedPct ?? 0) - (b.markedPct ?? 0) || a.teacher.localeCompare(b.teacher));
      const total = rows.reduce((t, r) => ({ scheduled: t.scheduled + r.scheduled, sameDay: t.sameDay + r.sameDay, later: t.later + r.later, unmarked: t.unmarked + r.unmarked }), { scheduled: 0, sameDay: 0, later: 0, unmarked: 0 });
      return { from, to, total: { ...total, markedPct: pct(total.sameDay + total.later, total.scheduled), onTimePct: pct(total.sameDay, total.scheduled) }, rows };
    });
  }

  /** A class's subjects over the current term: periods held, the class average, students short and under the warning level. */
  @Get('subjects')
  @Auth('user', REPORT_ROLES)
  subjects(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = ClassQuery.parse(raw);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.desk.assertDayMarker(tx, p.roles.includes('exam_controller') || p.roles.includes('quality_officer') ? { ...p, roles: [...p.roles, 'tenant_admin'] } : p, q.sectionId);
      const today = (await this.desk.now(tx)).date;
      const policy = await attendancePolicy(tx, q.sectionId);
      const window = await attendanceWindow(tx, q.sectionId, today);
      const roster = await classStudents(tx, q.sectionId);
      const list = await eligibilityFor(tx, roster.map((r) => r.id), policy, window);
      const teachers = await tx
        .selectDistinct({ subjectId: timetableSlots.subjectId, teacher: users.fullName })
        .from(timetableSlots)
        .innerJoin(users, eq(users.id, timetableSlots.teacherId))
        .where(and(eq(timetableSlots.sectionId, q.sectionId), sql`${timetableSlots.archivedAt} is null`));
      const subs = new Map<string, { subjectId: string; code: string; subject: string; held: number; sumPct: number; counted: number; short: number; warning: number }>();
      for (const e of list) {
        for (const s of e.subjects) {
          const r = subs.get(s.subjectId) ?? { subjectId: s.subjectId, code: s.code, subject: s.subject, held: 0, sumPct: 0, counted: 0, short: 0, warning: 0 };
          r.held = Math.max(r.held, s.held);
          if (s.effective !== null) {
            r.sumPct += s.effective;
            r.counted++;
            if (s.effective < policy.thresholdPct) r.short++;
            else if (s.effective < policy.warnPct) r.warning++;
          }
          subs.set(s.subjectId, r);
        }
      }
      const [sec] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, q.sectionId));
      return {
        section: sec?.name ?? '',
        window,
        thresholdPct: policy.thresholdPct,
        warnPct: policy.warnPct,
        students: roster.length,
        rows: [...subs.values()]
          .map((r) => ({ subjectId: r.subjectId, code: r.code, subject: r.subject, teachers: teachers.filter((t) => t.subjectId === r.subjectId).map((t) => t.teacher), held: r.held, averagePct: r.counted ? Math.round((r.sumPct / r.counted) * 10) / 10 : null, short: r.short, warning: r.warning }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    });
  }

  /** Students under the threshold (and condonable / detained) at the end of each of the last weeks of the term, cumulative from its start. */
  @Get('trend')
  @Auth('user', REPORT_ROLES)
  trend(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = TrendQuery.parse(raw);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = (await this.desk.now(tx)).date;
      const headed = !isSchoolAdmin(p) && p.roles.includes('hod') && !p.roles.includes('exam_controller') && !p.roles.includes('quality_officer');
      const secs = await tx.execute<{ id: string }>(sql`
        select s.id from sections s join academic_years y on y.id = s.academic_year_id
        where y.is_current and (${q.sectionId ?? null}::uuid is null or s.id = ${q.sectionId ?? null}::uuid) and (${q.programId ?? null}::uuid is null or s.program_id = ${q.programId ?? null}::uuid)
          and (not ${headed} or exists (select 1 from subjects sb join departments d on d.id = sb.department_id where sb.program_id = s.program_id and sb.term = s.term and d.head_user_id = ${p.userId}::uuid))`);
      const ends = Array.from({ length: q.weeks }, (_, i) => addDays(today, -7 * (q.weeks - 1 - i)));
      const weeks = ends.map((end) => ({ weekEnding: end, students: 0, short: 0, condonable: 0, detained: 0, warning: 0 }));
      for (const s of secs.rows) {
        const policy = await attendancePolicy(tx, s.id);
        const window = await attendanceWindow(tx, s.id, today);
        const ids = (await classStudents(tx, s.id)).map((r) => r.id);
        for (const w of weeks) {
          if (window.from && w.weekEnding < window.from) continue;
          for (const e of await eligibilityFor(tx, ids, policy, { from: window.from, to: w.weekEnding })) {
            if (e.overall.held === 0) continue;
            w.students++;
            if (e.status === 'condonable') w.condonable++;
            if (e.status === 'detained') w.detained++;
            if (e.status !== 'eligible') w.short++;
            else if (e.warning) w.warning++;
          }
        }
      }
      return { classes: secs.rows.length, weeks: weeks.map((w) => ({ ...w, shortPct: pct(w.short, w.students) })) };
    });
  }

  /**
   * NAAC / AISHE / UDISE+ attendance figures for an academic year (June to May, default the current one): instructional
   * days, programme-wise attendance with shortage and detention, condonations, and staff attendance.
   */
  @Get('accreditation')
  @Auth('user', REPORT_ROLES)
  accreditation(@CurrentPrincipal() p: UserPrincipal, @Query() raw: Record<string, string>) {
    const q = YearQuery.parse(raw);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = (await this.desk.now(tx)).date;
      const start = q.year ? Number(q.year.slice(0, 4)) : Number(today.slice(0, 4)) - (today.slice(5) < '06-01' ? 1 : 0);
      const from = `${start}-06-01`;
      const to = `${start + 1}-05-31`;
      const label = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
      const f = await attendanceFigures(tx, from, to);
      return { year: label, from, to, ...f, feeds: ACCREDITATION_FEEDS };
    });
  }
}

/** Which accreditation items these figures fill (the accreditation workspace reads the same sources). */
export const ACCREDITATION_FEEDS = [
  { framework: 'UDISE+', item: 'UDISE-1.2', what: 'Instructional days in the academic year', source: 'instructional_days' },
  { framework: 'NAAC', item: '2.2.1', what: 'Slow learners identified from attendance (students under the threshold), with the programme-wise list as evidence', source: 'attendance_shortage' },
  { framework: 'AISHE', item: 'Teaching days and staff attendance (institution profile)', what: 'Working days and staff attendance for the survey year', source: 'instructional_days' },
  { framework: 'NAAC', item: '6.2.2 / 6.2.3', what: 'E-governance in student support: hour-wise attendance, alerts and the detention list are live', source: 'erp_areas' },
] as const;

/** The attendance figures of a year, shared by the report and the accreditation sources. */
export async function attendanceFigures(tx: Tx, from: string, to: string) {
  const [days] = (await tx.execute<{ days: number; periods: number }>(sql`
    select count(distinct date)::int as days, count(distinct (timetable_slot_id, date)) filter (where timetable_slot_id is not null)::int as periods
    from attendance_records where date between ${from}::date and ${to}::date`)).rows;
  const programmes = (await tx.execute<{ program: string; students: number; held: number; attended: number }>(sql`
    select pr.name as program, count(distinct ar.student_id)::int as students, count(*) filter (where ar.status in ('present','late','absent'))::int as held,
           count(*) filter (where ar.status in ('present','late'))::int as attended
    from attendance_records ar join sections s on s.id = ar.section_id join programs pr on pr.id = s.program_id
    where ar.date between ${from}::date and ${to}::date group by pr.name order by pr.name`)).rows.map((r) => ({ ...r, averagePct: pct(r.attended, r.held) }));
  const [lists] = (await tx.execute<{ detained: number; condonable: number }>(sql`
    select count(*) filter (where e.status = 'detained')::int as detained, count(*) filter (where e.status = 'condonable')::int as condonable
    from attendance_detention_entries e join attendance_detention_lists l on l.id = e.list_id
    where l.status = 'published' and l.as_on between ${from}::date and ${to}::date`)).rows;
  const [cond] = (await tx.execute<{ approved: number; points: number }>(sql`
    select count(*)::int as approved, coalesce(sum(approved_points), 0)::int as points from attendance_condonations
    where status = 'approved' and decided_at::date between ${from}::date and ${to}::date`)).rows;
  const [staff] = (await tx.execute<{ days: number; present: number; marked: number }>(sql`
    select count(distinct date)::int as days, count(*) filter (where status in ('present','half_day'))::int as present, count(*) filter (where status <> 'on_leave')::int as marked
    from staff_attendance where date between ${from}::date and ${to}::date`)).rows;
  const [alerts] = (await tx.execute<{ shortage: number; texted: number }>(sql`
    select count(distinct student_id) filter (where kind = 'shortage')::int as shortage, count(*) filter (where channels && array['sms','whatsapp'])::int as texted
    from attendance_alerts where sent_at::date between ${from}::date and ${to}::date`)).rows;
  return {
    instructionalDays: days.days,
    periodsHeld: days.periods,
    programmes,
    shortageStudents: alerts.shortage,
    alertsTexted: alerts.texted,
    detained: lists.detained,
    condonable: lists.condonable,
    condonationsApproved: cond.approved,
    condonedPoints: cond.points,
    staff: { days: staff.days, marked: staff.marked, presentPct: pct(staff.present, staff.marked) },
  };
}

