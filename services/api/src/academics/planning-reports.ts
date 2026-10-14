import { sql } from 'drizzle-orm';
import { attendancePolicy, attendanceWindow, classStudents, eligibilityFor } from '../attendance-governance/policy.js';
import { coverageCounts } from '../coverage/coverage.controller.js';
import type { Tx } from '../db/db.service.js';
import { addDays } from '../teacher/teacher.service.js';
import type { CalendarService } from '../timetable/calendar.service.js';
import { pct } from './academics-rules.js';

/**
 * The planning and attendance reports of Academics → Reports (workload is in reports.controller.ts): room use,
 * syllabus completion by department, hours taken against hours due, plan deviation, substitute load, marking
 * compliance, defaulter trend, condonations, leave and on duty, and the detention list.
 */

type Row = Record<string, string | number | null>;
export interface Report {
  columns: { key: string; label?: string }[];
  rows: Row[];
}
const cols = (...keys: string[]) => keys.map((key) => ({ key }));
const rows = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute<Row>(q)).rows as Row[];
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const PLANNING_REPORTS = ['room-utilisation', 'syllabus-department', 'hours-register', 'plan-deviation', 'substitute-load', 'marking-compliance', 'defaulter-trend', 'condonation-list', 'leave-register', 'detention-list'] as const;
export type PlanningReport = (typeof PLANNING_REPORTS)[number];

/** English headings of their columns (PDF and Excel). */
export const PLANNING_HEAD: Record<string, string> = {
  room: 'Room', code: 'Code', students: 'Students', kind: 'Kind', capacity: 'Seats', hours: 'Hours / week', available: 'Hours open', department: 'Department', courses: 'Courses',
  perWeek: 'Periods / week', due: 'Periods due', taken: 'Periods taken', special: 'Special classes', shortfall: 'Shortfall', plannedToDate: 'Planned to date', behind: 'Behind',
  covering: 'Covered for others', coveredBy: 'Covered by others', marked: 'Marked', onTime: 'Marked same day', month: 'Month', defaulters: 'Below threshold',
  from: 'From', to: 'To', activity: 'Activity', marks: 'Marks written', points: 'Points', fee: 'Fee (₹)', feeStatus: 'Fee', shortIn: 'Short in', threshold: 'Threshold %', basis: 'Counted',
};

export interface ReportDeps {
  calendar: CalendarService;
  today: string;
}

/** Each meeting of the active weekly periods between two dates (following holidays and compensatory working days). */
export async function periodsMet(tx: Tx, deps: ReportDeps, from: string, to: string, where = sql`true`) {
  const slots = await rows(
    tx,
    sql`select ts.id, ts.day_of_week as day, to_char(ts.starts_at,'HH24:MI') as starts, to_char(ts.ends_at,'HH24:MI') as ends, ts.section_id as "sectionId", s.display_name as section, s.program_id as "programId",
          ts.subject_id as "subjectId", sb.code, sb.name as subject, ts.teacher_id as "teacherId", u.full_name as teacher, sb.department_id as "departmentId"
        from timetable_slots ts join sections s on s.id = ts.section_id join subjects sb on sb.id = ts.subject_id join users u on u.id = ts.teacher_id
        where ts.archived_at is null and ${where}`,
  );
  const end = to > deps.today ? deps.today : to;
  const orders = await deps.calendar.dayOrders(tx, from, end);
  const holidays = await deps.calendar.holidays(tx, from, end);
  const out: { slot: Row; date: string }[] = [];
  for (let d = from; d <= end; d = addDays(d, 1)) for (const s of slots) if (orders.weekday(d, String(s.programId)) === Number(s.day) && !holidays.on(d, String(s.programId))) out.push({ slot: s, date: d });
  return { slots, met: out };
}

export async function planningReport(tx: Tx, kind: PlanningReport, q: Record<string, string>, deps: ReportDeps): Promise<Report> {
  const sec = q.sectionId ?? null;
  const from = q.from ?? `${deps.today.slice(0, 7)}-01`;
  const to = q.to ?? deps.today;
  switch (kind) {
    case 'room-utilisation': {
      // Hours open a week: the default bell schedule's class periods on its days (8 × 45 min, six days without one).
      const [ps] = await rows(tx, sql`select days, periods from period_structures order by is_default desc, sort_order limit 1`);
      const periods = (ps?.periods as unknown as { startsAt: string; endsAt: string; kind: string }[] | undefined) ?? null;
      const days = (ps?.days as unknown as number[] | undefined)?.length ?? 6;
      const open = periods ? (periods.filter((p) => p.kind === 'class').reduce((n, p) => n + minutes(p.endsAt) - minutes(p.startsAt), 0) * days) / 60 : (8 * 45 * 6) / 60;
      const r = await rows(
        tx,
        sql`select r.name as room, r.kind, r.capacity, count(ts.id)::int as periods, coalesce(sum(extract(epoch from (ts.ends_at - ts.starts_at)) / 3600), 0)::float as hours
            from rooms r left join timetable_slots ts on ts.room_id = r.id and ts.archived_at is null group by r.id, r.name, r.kind, r.capacity order by hours desc, r.name`,
      );
      return { columns: cols('room', 'kind', 'capacity', 'periods', 'hours', 'available', 'percent'), rows: r.map((x) => ({ ...x, hours: Math.round(Number(x.hours) * 10) / 10, available: Math.round(open * 10) / 10, percent: pct(Number(x.hours), open) })) };
    }
    case 'syllabus-department': {
      const pairs = await rows(
        tx,
        sql`select distinct ts.section_id as "sectionId", ts.subject_id as "subjectId", coalesce(d.name, '') as department,
              (select count(*)::int from lesson_plans lp where lp.section_id = ts.section_id and lp.subject_id = ts.subject_id) as plans,
              (select count(*)::int from lesson_plans lp where lp.section_id = ts.section_id and lp.subject_id = ts.subject_id and lp.status = 'approved') as approved
            from timetable_slots ts join subjects sb on sb.id = ts.subject_id left join departments d on d.id = sb.department_id where ts.archived_at is null`,
      );
      const cov = await coverageCounts(tx, pairs.map((x) => ({ sectionId: String(x.sectionId), subjectId: String(x.subjectId) })));
      const by = new Map<string, { department: string; courses: number; covered: number; topics: number; plans: number; approved: number }>();
      for (const x of pairs) {
        const e = by.get(String(x.department)) ?? { department: String(x.department), courses: 0, covered: 0, topics: 0, plans: 0, approved: 0 };
        const c = cov.get(`${x.sectionId}|${x.subjectId}`) ?? { covered: 0, total: 0 };
        e.courses++;
        e.covered += c.covered;
        e.topics += c.total;
        e.plans += Number(x.plans);
        e.approved += Number(x.approved);
        by.set(e.department, e);
      }
      return { columns: cols('department', 'courses', 'covered', 'topics', 'percent', 'plans', 'approved'), rows: [...by.values()].sort((a, b) => a.department.localeCompare(b.department)).map((e) => ({ ...e, percent: pct(e.covered, e.topics) })) };
    }
    case 'hours-register': {
      const { slots, met } = await periodsMet(tx, deps, from, to, sec ? sql`ts.section_id = ${sec}::uuid` : sql`true`);
      const taken = new Set((await rows(tx, sql`select distinct timetable_slot_id as id, date::text as date from attendance_records where timetable_slot_id is not null and date between ${from}::date and ${to}::date`)).map((x) => `${x.id}|${x.date}`));
      const special = await rows(tx, sql`select section_id as "sectionId", subject_id as "subjectId", count(*)::int as n from special_classes where status = 'held' and date between ${from}::date and ${to}::date group by section_id, subject_id`);
      const by = new Map<string, Row & { due: number; taken: number; perWeek: number }>();
      for (const s of slots) {
        const k = `${s.sectionId}|${s.subjectId}`;
        const e = by.get(k) ?? { section: s.section, code: s.code, subject: s.subject, teacher: s.teacher, perWeek: 0, due: 0, taken: 0 };
        e.perWeek++;
        by.set(k, e);
      }
      for (const m of met) {
        const e = by.get(`${m.slot.sectionId}|${m.slot.subjectId}`)!;
        e.due++;
        if (taken.has(`${m.slot.id}|${m.date}`)) e.taken++;
      }
      return {
        columns: cols('section', 'code', 'subject', 'teacher', 'perWeek', 'due', 'taken', 'special', 'shortfall', 'percent'),
        rows: [...by.entries()]
          .map(([k, e]) => {
            const sp = Number(special.find((x) => `${x.sectionId}|${x.subjectId}` === k)?.n ?? 0);
            return { ...e, special: sp, shortfall: Math.max(0, e.due - e.taken - sp), percent: pct(e.taken + sp, e.due) };
          })
          .sort((a, b) => String((a as Row).section).localeCompare(String((b as Row).section)) || String((a as Row).code).localeCompare(String((b as Row).code))),
      };
    }
    case 'plan-deviation': {
      const r = await rows(
        tx,
        sql`select s.display_name as section, sb.code, sb.name as subject, coalesce((select string_agg(distinct u.full_name, ', ') from timetable_slots ts join users u on u.id = ts.teacher_id where ts.section_id = yp.section_id and ts.subject_id = yp.subject_id and ts.archived_at is null), '') as teacher,
              count(i.topic_id) filter (where i.week_of <= ${deps.today}::date)::int as "plannedToDate", count(i.topic_id)::int as topics,
              (select count(*)::int from topic_coverage tc where tc.section_id = yp.section_id and tc.topic_id in (select x.topic_id from year_plan_items x where x.plan_id = yp.id)) as covered
            from year_plans yp join sections s on s.id = yp.section_id join subjects sb on sb.id = yp.subject_id left join year_plan_items i on i.plan_id = yp.id
            where (${sec}::uuid is null or yp.section_id = ${sec}::uuid) group by yp.id, s.display_name, sb.code, sb.name order by s.display_name, sb.code`,
      );
      return {
        columns: cols('section', 'code', 'subject', 'teacher', 'topics', 'plannedToDate', 'covered', 'behind', 'status'),
        rows: r.map((x) => {
          const behind = Math.max(0, Number(x.plannedToDate) - Number(x.covered));
          return { ...x, behind, status: behind === 0 ? 'ok' : behind <= 2 ? 'warning' : 'short' };
        }),
      };
    }
    case 'substitute-load': {
      const r = await rows(
        tx,
        sql`select u.full_name as teacher,
              (select count(*)::int from teacher_substitutions x where x.substitute_teacher_id = u.id and x.status = 'assigned' and x.date between ${from}::date and ${to}::date) as covering,
              (select count(*)::int from teacher_substitutions x where x.original_teacher_id = u.id and x.status = 'assigned' and x.date between ${from}::date and ${to}::date) as "coveredBy"
            from users u join user_roles ur on ur.user_id = u.id and ur.role in ('teacher','hod') where u.status = 'active' group by u.id, u.full_name order by covering desc, u.full_name`,
      );
      return { columns: cols('teacher', 'covering', 'coveredBy'), rows: r.filter((x) => Number(x.covering) + Number(x.coveredBy) > 0) };
    }
    case 'marking-compliance': {
      const { met } = await periodsMet(tx, deps, from, to, sec ? sql`ts.section_id = ${sec}::uuid` : sql`true`);
      const firsts = new Map((await rows(tx, sql`select timetable_slot_id as id, date::text as date, min(occurred_at)::date::text as first from attendance_records where timetable_slot_id is not null and date between ${from}::date and ${to}::date group by timetable_slot_id, date`)).map((x) => [`${x.id}|${x.date}`, String(x.first)]));
      const subs = new Map((await rows(tx, sql`select x.slot_id as id, x.date::text as date, u.full_name as name from teacher_substitutions x join users u on u.id = x.substitute_teacher_id where x.status = 'assigned' and x.date between ${from}::date and ${to}::date`)).map((x) => [`${x.id}|${x.date}`, String(x.name)]));
      const by = new Map<string, { teacher: string; periods: number; marked: number; onTime: number }>();
      for (const m of met) {
        const key = `${m.slot.id}|${m.date}`;
        const who = subs.get(key) ?? String(m.slot.teacher);
        const e = by.get(who) ?? { teacher: who, periods: 0, marked: 0, onTime: 0 };
        e.periods++;
        const first = firsts.get(key);
        if (first) {
          e.marked++;
          if (first <= m.date) e.onTime++;
        }
        by.set(who, e);
      }
      return { columns: cols('teacher', 'periods', 'marked', 'onTime', 'percent'), rows: [...by.values()].map((e) => ({ ...e, percent: pct(e.marked, e.periods) })).sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0) || a.teacher.localeCompare(b.teacher)) };
    }
    case 'defaulter-trend': {
      const policy = await attendancePolicy(tx, sec);
      const r = await rows(
        tx,
        sql`with m as (select ar.student_id, st.section_id, to_char(ar.date, 'YYYY-MM') as month, count(*) filter (where ar.status in ('present','late','absent'))::int as held,
                count(*) filter (where ar.status in ('present','late'))::int as got from attendance_records ar join students st on st.id = ar.student_id
                where ar.date >= ${addDays(deps.today, -365)}::date and st.status in ('active','on_leave','detained') and (${sec}::uuid is null or st.section_id = ${sec}::uuid) group by ar.student_id, st.section_id, to_char(ar.date, 'YYYY-MM'))
            select s.display_name as section, m.month, count(*)::int as students, count(*) filter (where m.held > 0 and m.got * 100.0 / m.held < ${policy.thresholdPct})::int as defaulters
            from m join sections s on s.id = m.section_id group by s.display_name, m.month order by s.display_name, m.month`,
      );
      return { columns: cols('section', 'month', 'students', 'defaulters', 'percent'), rows: r.map((x) => ({ ...x, percent: pct(Number(x.defaulters), Number(x.students)) })) };
    }
    case 'condonation-list': {
      const r = await rows(
        tx,
        sql`select s.display_name as section, st.roll_no as "rollNo", st.full_name as student, coalesce(sb.name, '') as subject, c.kind, c.status, c.approved_points as points, round(c.fee_paise / 100.0, 2)::float as fee, c.fee_status as "feeStatus"
            from attendance_condonations c join students st on st.id = c.student_id join sections s on s.id = st.section_id left join subjects sb on sb.id = c.subject_id
            where (${sec}::uuid is null or st.section_id = ${sec}::uuid) order by s.display_name, st.roll_no, c.created_at`,
      );
      return { columns: cols('section', 'rollNo', 'student', 'subject', 'kind', 'status', 'points', 'fee', 'feeStatus'), rows: r };
    }
    case 'leave-register': {
      const r = await rows(
        tx,
        sql`select s.display_name as section, st.roll_no as "rollNo", st.full_name as student, l.kind, l.from_date::text as "from", l.to_date::text as "to", l.activity, l.status, l.applied_marks as marks
            from attendance_leaves l join students st on st.id = l.student_id join sections s on s.id = st.section_id
            where l.from_date <= ${to}::date and l.to_date >= ${from}::date and (${sec}::uuid is null or st.section_id = ${sec}::uuid) order by l.from_date, s.display_name, st.roll_no`,
      );
      return { columns: cols('section', 'rollNo', 'student', 'kind', 'from', 'to', 'activity', 'status', 'marks'), rows: r };
    }
    case 'detention-list': {
      const secs = await rows(tx, sql`select s.id, s.display_name as name from sections s join academic_years y on y.id = s.academic_year_id where y.is_current and (${sec}::uuid is null or s.id = ${sec}::uuid) order by s.display_name`);
      const out: Row[] = [];
      for (const s of secs) {
        const policy = await attendancePolicy(tx, String(s.id));
        const window = await attendanceWindow(tx, String(s.id), deps.today);
        const roster = await classStudents(tx, String(s.id));
        const who = new Map(roster.map((r) => [r.id, r]));
        for (const e of await eligibilityFor(tx, roster.map((r) => r.id), policy, window)) {
          if (e.status === 'eligible') continue;
          out.push({
            section: String(s.name),
            rollNo: who.get(e.studentId)!.rollNo,
            student: who.get(e.studentId)!.fullName,
            percent: e.overall.pct,
            effective: e.overall.effective,
            threshold: policy.thresholdPct,
            basis: policy.basis,
            shortIn: e.subjects.filter((x) => e.shortIn.includes(x.subjectId)).map((x) => `${x.code} ${x.effective ?? '-'}%`).join(', '),
            status: e.status === 'detained' ? 'short' : 'warning',
          });
        }
      }
      return { columns: cols('section', 'rollNo', 'student', 'percent', 'effective', 'threshold', 'basis', 'shortIn', 'status'), rows: out };
    }
  }
}
