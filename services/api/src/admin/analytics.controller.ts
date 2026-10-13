import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Clock, localParts } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { addDays } from '../teacher/teacher.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { DASHBOARD_ROLES } from './admin.controller.js';

const ACADEMIC: RoleName[] = [...DASHBOARD_ROLES];
const ADMISSIONS: RoleName[] = ['principal', 'tenant_admin', 'admissions_officer'];
const CONFIRMED = ['accepted', 'enrolled'];
const pct = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

function monthStart(date: string, back = 0) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
}
/** Monday of the week that holds `date`. */
function mondayOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

/** Principal analytics cards: admissions by month, department (or class) health and this week's attendance. */
@Controller('v1/admin/analytics')
export class AnalyticsCardsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
  ) {}

  private today(tx: Parameters<TimetableService['tenantTimezone']>[0]) {
    return this.timetable.tenantTimezone(tx).then((tz) => localParts(this.clock.now(), tz).date);
  }

  /** Applications received and confirmed (accepted or enrolled) in each of the last eight months. */
  @Get('admissions')
  @Auth('user', ADMISSIONS)
  admissions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const first = monthStart(today, 7);
      const rows = (await tx.execute(sql`
        select to_char(submitted_at, 'YYYY-MM') as m, count(*)::int as received,
               count(*) filter (where status::text in (${sql.join(CONFIRMED.map((s) => sql`${s}`), sql`, `)}))::int as confirmed
        from applications where submitted_at >= ${first}::date group by 1`)).rows as unknown as { m: string; received: number; confirmed: number }[];
      const months = Array.from({ length: 8 }, (_, i) => monthStart(today, 7 - i).slice(0, 7));
      const series = months.map((month) => ({ month, received: rows.find((r) => r.m === month)?.received ?? 0, confirmed: rows.find((r) => r.m === month)?.confirmed ?? 0 }));
      return { months: series, received: series.reduce((s, r) => s + r.received, 0), confirmed: series.reduce((s, r) => s + r.confirmed, 0) };
    });
  }

  /**
   * Health of each department (a college) or class (a school) over the last 30 days: attendance, internal results
   * (marks as a percentage of the maximum) and a score that averages the two.
   */
  @Get('health')
  @Auth('user', ACADEMIC)
  health(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const since = addDays(today, -30);
      const [t] = (await tx.execute(sql`select kind::text as kind from tenants where id = ${p.tenantId}::uuid`)).rows as unknown as { kind: string }[];
      const school = t?.kind === 'school';
      type Row = { key: string; name: string; att: number | null; res: number | null };
      const rows = school
        ? ((await tx.execute(sql`
            with att as (
              select s.term::text as key, round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0), 1)::float8 as att
              from attendance_records a join sections s on s.id = a.section_id where a.date >= ${since}::date group by 1),
            res as (
              select s.term::text as key, round(avg(100.0 * coalesce(m.moderated_marks, m.marks) / nullif(x.max_marks, 0)), 1)::float8 as res
              from marks m join assessments x on x.id = m.assessment_id join sections s on s.id = x.section_id
              where not m.absent and coalesce(m.moderated_marks, m.marks) is not null group by 1)
            select coalesce(att.key, res.key) as key, coalesce(att.key, res.key) as name, att.att, res.res
            from att full join res on res.key = att.key`)).rows as unknown as Row[])
        : ((await tx.execute(sql`
            with att as (
              select sub.department_id::text as key, round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0), 1)::float8 as att
              from attendance_records a join timetable_slots ts on ts.id = a.timetable_slot_id join subjects sub on sub.id = ts.subject_id
              where a.date >= ${since}::date and sub.department_id is not null group by 1),
            res as (
              select sub.department_id::text as key, round(avg(100.0 * coalesce(m.moderated_marks, m.marks) / nullif(x.max_marks, 0)), 1)::float8 as res
              from marks m join assessments x on x.id = m.assessment_id join subjects sub on sub.id = x.subject_id
              where not m.absent and coalesce(m.moderated_marks, m.marks) is not null and sub.department_id is not null group by 1)
            select d.id::text as key, d.name, att.att, res.res
            from departments d left join att on att.key = d.id::text left join res on res.key = d.id::text
            where att.att is not null or res.res is not null`)).rows as unknown as Row[]);
      const out = rows.map((r) => {
        const parts = [r.att, r.res].filter((v): v is number => v !== null);
        return { id: r.key, name: r.name, attendance: pct(r.att), results: pct(r.res), score: parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null };
      });
      out.sort((a, b) => (school ? Number(a.id) - Number(b.id) : (b.score ?? 0) - (a.score ?? 0)));
      return { kind: school ? ('class' as const) : ('department' as const), rows: out };
    });
  }

  /** This week's attendance day by day, who was present today, and students below 75% over the last 30 days. */
  @Get('attendance-week')
  @Auth('user', ACADEMIC)
  attendanceWeek(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const monday = mondayOf(today);
      const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
      const byDay = (await tx.execute(sql`
        select date::text as d, count(*)::int as marked, count(*) filter (where status <> 'absent')::int as attended
        from attendance_records where date >= ${monday}::date and date <= ${days[5]}::date group by 1`)).rows as unknown as { d: string; marked: number; attended: number }[];
      const [now] = (await tx.execute(sql`
        select count(distinct student_id)::int as total, count(distinct student_id) filter (where status <> 'absent')::int as present
        from attendance_records where date = ${today}::date`)).rows as unknown as { total: number; present: number }[];
      const [low] = (await tx.execute(sql`
        select count(*)::int as n from (
          select student_id from attendance_records where date >= ${addDays(today, -30)}::date
          group by student_id having count(*) filter (where status <> 'absent') * 100.0 / count(*) < 75) x`)).rows as unknown as { n: number }[];
      const series = days.map((date) => {
        const r = byDay.find((x) => x.d === date);
        return { date, rate: r && r.marked ? pct((r.attended / r.marked) * 100) : null };
      });
      const marked = byDay.reduce((s, r) => s + r.marked, 0);
      const attended = byDay.reduce((s, r) => s + r.attended, 0);
      return {
        days: series,
        average: marked ? pct((attended / marked) * 100) : null,
        today: { date: today, present: now?.present ?? 0, total: now?.total ?? 0, rate: now?.total ? pct((now.present / now.total) * 100) : null },
        below75: low?.n ?? 0,
      };
    });
  }
}
