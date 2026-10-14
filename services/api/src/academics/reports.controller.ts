import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { PdfWriter } from '../common/pdf.js';
import { writeXlsx } from '../common/xlsx.js';
import { coverageCounts } from '../coverage/coverage.controller.js';
import { DbService, type Tx } from '../db/db.service.js';
import { isShort, pct } from './academics-rules.js';
import { AcademicsService } from './academics.service.js';
import { PLANNING_HEAD, PLANNING_REPORTS, planningReport, type PlanningReport } from './planning-reports.js';
import { attendancePolicy } from '../attendance-governance/policy.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { ACAD_STAFF } from './requests.controller.js';

type Row = Record<string, string | number | null>;
interface Report {
  /** `label` is set for columns named by data (an assessment's title); others are translated from `key`. */
  columns: { key: string; label?: string }[];
  rows: Row[];
}

export const ACAD_REPORTS = ['strength', 'attendance-daily', 'attendance-monthly', 'attendance-subject', 'shortage', 'timetable', 'workload', 'marks-register', 'syllabus-coverage', 'registration-summary', ...PLANNING_REPORTS] as const;
type ReportKind = (typeof ACAD_REPORTS)[number];

/** English column headings for the PDF and Excel files (the ERP translates the keys itself). */
const HEAD: Record<string, string> = {
  section: 'Class', program: 'Program', active: 'Active', onLeave: 'On leave', enrolled: 'Enrolled', other: 'Other', total: 'Total', date: 'Date', present: 'Present', absent: 'Absent', late: 'Late',
  excused: 'Excused', marked: 'Marked', percent: '%', rollNo: 'Roll', student: 'Student', held: 'Held', attended: 'Attended', subject: 'Subject', condoned: 'Condoned', effective: 'Effective %', status: 'Status',
  day: 'Day', time: 'Time', teacher: 'Teacher', room: 'Room', periods: 'Periods / week', maxDay: 'Busiest day', sections: 'Classes', subjects: 'Subjects', substitutions: 'Substitutions (30 days)', limit: 'Weekly limit',
  covered: 'Topics covered', topics: 'Topics', plans: 'Lesson plans', approved: 'Approved', term: 'Term', category: 'Category', credits: 'Credits', seats: 'Seats', registered: 'Registered', waitlisted: 'Waitlisted', pending: 'Awaiting approval', fill: 'Fill %',
};
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rows = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute<Row>(q)).rows as Row[];
const cols = (...keys: string[]) => keys.map((key) => ({ key }));

/** Academics reports: class strength, attendance registers, timetables, workload, marks register, syllabus coverage and registrations. */
@Controller('v1/academics/reports')
export class AcademicReportsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AcademicsService,
    private readonly calendar: CalendarService,
  ) {}

  @Get(':kind')
  @Auth('user', ACAD_STAFF)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query() q: Record<string, string>) {
    return this.db.withTenant(p.tenantId, (tx) => this.build(tx, kind, q));
  }

  @Get(':kind/export')
  @Auth('user', ACAD_STAFF)
  async export(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      const out = await this.build(tx, kind, q);
      await auditUser(tx, p, 'academics.report_exported', 'academic_report', undefined, { kind, format: q.format });
      return out;
    });
    const head = r.columns.map((c) => c.label ?? HEAD[c.key] ?? PLANNING_HEAD[c.key] ?? c.key);
    const grid = [head, ...r.rows.map((row) => r.columns.map((c) => row[c.key] ?? ''))];
    if (q.format === 'pdf') {
      const pdf = new PdfWriter();
      pdf.text(kind.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), { size: 14, bold: true });
      pdf.gap(6);
      const width = 515 / Math.max(1, head.length);
      const xs = head.map((_, i) => Math.round(i * width));
      grid.forEach((line, i) => pdf.row(line.map(String), xs, { bold: i === 0, size: head.length > 8 ? 7 : 9 }));
      res.setHeader('content-type', 'application/pdf');
      res.setHeader('content-disposition', `attachment; filename="${kind}.pdf"`);
      res.end(pdf.build());
      return;
    }
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="${kind}.xlsx"`);
    res.end(writeXlsx(kind.slice(0, 30), grid.map((line) => line.map((c) => (c === '' ? null : c)))));
  }

  private async build(tx: Tx, kind: string, q: Record<string, string>): Promise<Report> {
    if (!ACAD_REPORTS.includes(kind as ReportKind)) throw new NotFoundException('Unknown report');
    for (const k of ['date', 'from', 'to'] as const) if (q[k] && !DAY.test(q[k])) throw new BadRequestException('Give dates as YYYY-MM-DD');
    for (const k of ['sectionId', 'subjectId', 'termId', 'id'] as const) if (q[k] && !UUID.test(q[k])) throw new BadRequestException('Unknown filter');
    const today = await this.svc.today(tx);
    if ((PLANNING_REPORTS as readonly string[]).includes(kind)) return planningReport(tx, kind as PlanningReport, q, { calendar: this.calendar, today });
    const att = await this.svc.settings(tx, 'attendance');
    const sec = q.sectionId ?? null;
    const presentSql = att.lateCountsAsPresent ? sql`ar.status in ('present','late','excused')` : sql`ar.status in ('present','excused')`;
    switch (kind as ReportKind) {
      case 'strength':
        return {
          columns: cols('program', 'section', 'enrolled', 'active', 'onLeave', 'other', 'total'),
          rows: await rows(
            tx,
            sql`select pr.name as program, s.display_name as section, count(st.id) filter (where st.status = 'enrolled')::int as enrolled, count(st.id) filter (where st.status = 'active')::int as active,
                  count(st.id) filter (where st.status = 'on_leave')::int as "onLeave", count(st.id) filter (where st.status in ('detained','suspended','promoted'))::int as other,
                  count(st.id) filter (where st.status in ('enrolled','active','on_leave','detained','suspended','promoted'))::int as total
                from sections s join programs pr on pr.id = s.program_id left join students st on st.section_id = s.id group by pr.name, s.display_name, s.term order by pr.name, s.term, s.display_name`,
          ),
        };
      case 'attendance-daily': {
        const date = q.date ?? today;
        const r = await rows(
          tx,
          sql`select s.display_name as section, count(distinct ar.student_id)::int as marked,
                count(distinct ar.student_id) filter (where ar.status = 'present')::int as present, count(distinct ar.student_id) filter (where ar.status = 'absent')::int as absent,
                count(distinct ar.student_id) filter (where ar.status = 'late')::int as late, count(distinct ar.student_id) filter (where ar.status = 'excused')::int as excused
              from sections s left join attendance_records ar on ar.section_id = s.id and ar.date = ${date}::date
              where (${sec}::uuid is null or s.id = ${sec}::uuid) group by s.display_name order by s.display_name`,
        );
        return { columns: cols('section', 'marked', 'present', 'absent', 'late', 'excused', 'percent'), rows: r.map((x) => ({ ...x, percent: pct(Number(x.present) + (att.lateCountsAsPresent ? Number(x.late) : 0) + Number(x.excused), Number(x.marked)) })) };
      }
      case 'attendance-monthly': {
        const month = /^\d{4}-\d{2}$/.test(q.month ?? '') ? q.month : today.slice(0, 7);
        const r = await rows(
          tx,
          sql`with d as (select ar.student_id, ar.date, bool_or(${presentSql}) as here from attendance_records ar where to_char(ar.date, 'YYYY-MM') = ${month} group by ar.student_id, ar.date)
              select st.roll_no as "rollNo", st.full_name as student, s.display_name as section, count(d.date)::int as held, count(d.date) filter (where d.here)::int as attended
              from students st join sections s on s.id = st.section_id left join d on d.student_id = st.id
              where st.status in ('active','on_leave','detained') and (${sec}::uuid is null or s.id = ${sec}::uuid) group by st.id, s.display_name order by s.display_name, st.roll_no limit 3000`,
        );
        return { columns: cols('section', 'rollNo', 'student', 'held', 'attended', 'percent'), rows: r.map((x) => ({ ...x, percent: pct(Number(x.attended), Number(x.held)) })) };
      }
      case 'attendance-subject':
      case 'shortage': {
        const from = q.from ?? `${today.slice(0, 4)}-01-01`;
        const to = q.to ?? today;
        const bySubject = kind === 'attendance-subject';
        const r = await rows(
          tx,
          sql`select st.id, st.roll_no as "rollNo", st.full_name as student, s.display_name as section, ${bySubject ? sql`sb.name` : sql`''`} as subject, ${bySubject ? sql`sb.id::text` : sql`''`} as "subjectId",
                count(ar.id)::int as held, count(ar.id) filter (where ${presentSql})::int as attended
              from attendance_records ar join students st on st.id = ar.student_id join sections s on s.id = st.section_id
              ${bySubject ? sql`join timetable_slots ts on ts.id = ar.timetable_slot_id join subjects sb on sb.id = ts.subject_id` : sql``}
              where ar.date between ${from}::date and ${to}::date and st.status in ('active','on_leave','detained') and (${sec}::uuid is null or s.id = ${sec}::uuid) and (${q.subjectId ?? null}::uuid is null or ${bySubject ? sql`sb.id` : sql`null`} = ${q.subjectId ?? null}::uuid)
              group by st.id, s.display_name ${bySubject ? sql`, sb.id, sb.name` : sql``} order by s.display_name, st.roll_no limit 5000`,
        );
        // The threshold in force (programme override, rule, the affiliating university's profile, the institution's setting).
        const policy = await attendancePolicy(tx, sec);
        const condoned = await rows(tx, sql`select student_id as id, coalesce(subject_id::text, '') as "subjectId", sum(approved_points)::int as pts from attendance_condonations where status = 'approved' and fee_status in ('none','paid','waived') group by student_id, subject_id`);
        const pts = new Map(condoned.map((c) => [`${c.id}|${c.subjectId}`, Number(c.pts)]));
        const out = r.map((x) => {
          const percent = pct(Number(x.attended), Number(x.held));
          const c = Math.min(att.maxCondonationPoints, pts.get(`${x.id}|${x.subjectId}`) ?? 0);
          const effective = percent === null ? null : Math.min(100, Math.round((percent + c) * 10) / 10);
          const status = percent === null ? '' : isShort(percent, c, policy.thresholdPct) ? 'short' : effective! < policy.warnPct ? 'warning' : 'ok';
          return { section: x.section, rollNo: x.rollNo, student: x.student, subject: x.subject, held: x.held, attended: x.attended, percent, condoned: c, effective, status };
        });
        if (bySubject) return { columns: cols('section', 'rollNo', 'student', 'subject', 'held', 'attended', 'percent', 'status'), rows: out };
        return { columns: cols('section', 'rollNo', 'student', 'held', 'attended', 'percent', 'condoned', 'effective', 'status'), rows: out.filter((x) => x.status === 'short' || x.status === 'warning') };
      }
      case 'timetable': {
        const by = q.by === 'teacher' || q.by === 'room' ? q.by : 'class';
        if (!q.id) return { columns: cols('day', 'time', 'section', 'subject', 'teacher', 'room'), rows: [] };
        const col = by === 'teacher' ? sql`ts.teacher_id` : by === 'room' ? sql`ts.room_id` : sql`ts.section_id`;
        const r = await rows(
          tx,
          sql`select ts.day_of_week as d, to_char(ts.starts_at,'HH24:MI') || '–' || to_char(ts.ends_at,'HH24:MI') as time, s.display_name as section, sb.name as subject, u.full_name as teacher, coalesce(r.name, '') as room
              from timetable_slots ts join sections s on s.id = ts.section_id join subjects sb on sb.id = ts.subject_id join users u on u.id = ts.teacher_id left join rooms r on r.id = ts.room_id
              where ${col} = ${q.id}::uuid and ts.archived_at is null order by ts.day_of_week, ts.starts_at`,
        );
        return { columns: cols('day', 'time', 'section', 'subject', 'teacher', 'room'), rows: r.map(({ d, ...x }) => ({ day: DAYS[Number(d)] ?? '', ...x })) };
      }
      case 'workload': {
        const tt = await this.svc.settings(tx, 'timetable');
        const r = await rows(
          tx,
          sql`select u.full_name as teacher, count(ts.id)::int as periods, count(distinct ts.section_id)::int as sections, count(distinct ts.subject_id)::int as subjects,
                coalesce(max(per_day.n), 0)::int as "maxDay",
                (select count(*)::int from teacher_substitutions x where x.substitute_teacher_id = u.id and x.status = 'assigned' and x.date >= ${today}::date - 30) as substitutions
              from users u join user_roles ur on ur.user_id = u.id and ur.role in ('teacher','hod')
              left join timetable_slots ts on ts.teacher_id = u.id and ts.archived_at is null
              left join lateral (select count(*) as n from timetable_slots y where y.teacher_id = u.id and y.archived_at is null group by y.day_of_week order by 1 desc limit 1) per_day on true
              where u.status = 'active' group by u.id, u.full_name order by periods desc, u.full_name`,
        );
        return {
          columns: cols('teacher', 'periods', 'maxDay', 'sections', 'subjects', 'substitutions', 'limit', 'status'),
          rows: r.map((x) => ({ ...x, limit: tt.maxPeriodsPerTeacherPerWeek, status: Number(x.periods) > tt.maxPeriodsPerTeacherPerWeek || Number(x.maxDay) > tt.maxPeriodsPerTeacherPerDay ? 'over' : Number(x.periods) < tt.maxPeriodsPerTeacherPerWeek / 2 ? 'light' : 'ok' })),
        };
      }
      case 'marks-register': {
        if (!sec) return { columns: cols('rollNo', 'student'), rows: [] };
        const list = await rows(tx, sql`select a.id, a.title, a.max_marks as max, sb.code from assessments a join subjects sb on sb.id = a.subject_id where a.section_id = ${sec}::uuid and (${q.subjectId ?? null}::uuid is null or a.subject_id = ${q.subjectId ?? null}::uuid) order by sb.code, a.held_on`);
        const students = await rows(tx, sql`select st.id, st.roll_no as "rollNo", st.full_name as student from students st where st.section_id = ${sec}::uuid and st.status in ('active','on_leave','detained') order by st.roll_no`);
        const m = await rows(tx, sql`select m.assessment_id as a, m.student_id as s, coalesce(m.moderated_marks, m.marks) as v, m.absent from marks m join assessments a on a.id = m.assessment_id where a.section_id = ${sec}::uuid`);
        const got = new Map(m.map((x) => [`${x.a}|${x.s}`, x.absent ? 'AB' : x.v === null ? '' : Number(x.v)]));
        const maxTotal = list.reduce((s, a) => s + Number(a.max), 0);
        return {
          columns: [...cols('rollNo', 'student'), ...list.map((a) => ({ key: `a_${a.id}`, label: `${a.code} ${a.title} (${Number(a.max)})` })), ...cols('total', 'percent')],
          rows: students.map((st) => {
            const cells = Object.fromEntries(list.map((a) => [`a_${a.id}`, got.get(`${a.id}|${st.id}`) ?? '']));
            const total = Object.values(cells).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);
            return { rollNo: st.rollNo, student: st.student, ...cells, total, percent: pct(total, maxTotal) };
          }),
        };
      }
      case 'syllabus-coverage': {
        const pairs = await rows(
            tx,
            sql`select s.id as "sectionId", s.display_name as section, sb.id as "subjectId", sb.name as subject, string_agg(distinct u.full_name, ', ') as teacher,
                (select count(*)::int from lesson_plans lp where lp.section_id = s.id and lp.subject_id = sb.id) as plans,
                (select count(*)::int from lesson_plans lp where lp.section_id = s.id and lp.subject_id = sb.id and lp.status = 'approved') as approved
              from timetable_slots ts join sections s on s.id = ts.section_id join subjects sb on sb.id = ts.subject_id join users u on u.id = ts.teacher_id
              where ts.archived_at is null and (${sec}::uuid is null or s.id = ${sec}::uuid) group by s.id, s.display_name, sb.id, sb.name order by s.display_name, sb.name`,
        );
        const cov = await coverageCounts(tx, pairs.map((x) => ({ sectionId: String(x.sectionId), subjectId: String(x.subjectId) })));
        return {
          columns: cols('section', 'subject', 'teacher', 'covered', 'topics', 'percent', 'plans', 'approved'),
          rows: pairs.map((x) => {
            const c = cov.get(`${x.sectionId}|${x.subjectId}`) ?? { covered: 0, total: 0 };
            return { section: x.section, subject: x.subject, teacher: x.teacher, covered: c.covered, topics: c.total, percent: pct(c.covered, c.total), plans: x.plans, approved: x.approved };
          }),
        };
      }
      case 'registration-summary': {
        const r = await rows(
          tx,
          sql`select t.name as term, sb.code || ' ' || sb.name as subject, o.category, o.credits, o.seat_cap as seats,
                count(cr.id) filter (where cr.status = 'registered')::int as registered, count(cr.id) filter (where cr.status = 'waitlisted')::int as waitlisted,
                count(cr.id) filter (where cr.status = 'registered' and cr.approval = 'pending')::int as pending, count(cr.id) filter (where cr.approval = 'approved')::int as approved
              from course_offerings o join academic_terms t on t.id = o.term_id join subjects sb on sb.id = o.subject_id left join course_registrations cr on cr.offering_id = o.id
              where (${q.termId ?? null}::uuid is null or o.term_id = ${q.termId ?? null}::uuid) group by t.name, t.starts_on, sb.code, sb.name, o.id order by t.starts_on desc, sb.code`,
        );
        return { columns: cols('term', 'subject', 'category', 'credits', 'seats', 'registered', 'waitlisted', 'pending', 'approved', 'fill'), rows: r.map((x) => ({ ...x, credits: Number(x.credits), fill: pct(Number(x.registered), Number(x.seats)) })) };
      }
      default:
        throw new NotFoundException('Unknown report');
    }
  }
}
