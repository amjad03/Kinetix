import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';

/** Read-only aggregations over the other domains. Every query runs in the caller's tenant transaction, so row-level security keeps it to the institution. */

export interface Scope {
  campusId?: string;
  programId?: string;
  sectionId?: string;
  academicYearId?: string;
}

export interface Range {
  /** Inclusive local dates (YYYY-MM-DD). */
  from: string;
  to: string;
}

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

/** Runs queries one after another: a transaction has a single connection. */
const sequence = async <T>(fns: (() => Promise<T>)[]): Promise<T[]> => {
  const out: T[] = [];
  for (const f of fns) out.push(await f());
  return out;
};

export const rows = async <T = Row>(tx: Tx, q: SQL): Promise<T[]> => (await tx.execute(q)).rows as T[];

/** `and ...` conditions over the aliases `sec` (sections) and `pr` (programs). */
export function scopeSql(s: Scope): SQL {
  return sql`${s.campusId ? sql` and pr.campus_id = ${s.campusId}::uuid` : sql``}${s.programId ? sql` and pr.id = ${s.programId}::uuid` : sql``}${s.sectionId ? sql` and sec.id = ${s.sectionId}::uuid` : sql``}${s.academicYearId ? sql` and sec.academic_year_id = ${s.academicYearId}::uuid` : sql``}`;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => day(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000));

/** The requested range, or the trailing `defaultDays` days ending today. */
export function resolveRange(today: string, from?: string, to?: string, defaultDays = 30): Range {
  const end = to ?? today;
  return { from: from ?? addDays(end, -(defaultDays - 1)), to: end };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// ----- institution KPIs ---------------------------------------------------------------------------

export interface Kpis {
  scope: Scope;
  range: Range;
  enrolment: { active: number; total: number; joinedInRange: number };
  attendance: { percent: number | null; marks: number };
  results: { session: string | null; students: number; passPercent: number | null; averageSgpa: number | null };
  fees: { billedPaise: number; collectedPaise: number; outstandingPaise: number; overduePaise: number; collectedInRangePaise: number };
  staff: { active: number; total: number; teachers: number; byType: Record<string, number> };
  placement: { offers: number; students: number; joined: number; averagePackagePaise: number; highestPackagePaise: number };
  research: { outputs: number; grantsPaise: number; byKind: Record<string, number> };
}

export async function institutionKpis(tx: Tx, scope: Scope, range: Range, annual: Range, timezone: string, today: string): Promise<Kpis> {
  const sc = scopeSql(scope);
  const [enr] = await rows<{ active: number; total: number; joined: number }>(
    tx,
    sql`select count(*) filter (where s.status in ('enrolled', 'active'))::int active, count(*)::int total,
          count(*) filter (where s.enrolled_on between ${range.from}::date and ${range.to}::date)::int joined
        from students s join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id where true ${sc}`,
  );
  const [att] = await rows<{ present: number; n: number }>(
    tx,
    sql`select count(*) filter (where a.status in ('present', 'late'))::int present, count(*)::int n
        from attendance_records a join sections sec on sec.id = a.section_id join programs pr on pr.id = sec.program_id
        where a.date between ${range.from}::date and ${range.to}::date ${sc}`,
  );
  const [latest] = await rows<{ id: string; name: string }>(
    tx,
    sql`select es.id, es.name from exam_sessions es join programs pr on pr.id = es.program_id
        where es.status in ('published', 'locked') ${scope.programId ? sql` and pr.id = ${scope.programId}::uuid` : sql``}${scope.campusId ? sql` and pr.campus_id = ${scope.campusId}::uuid` : sql``}
        order by es.published_at desc nulls last limit 1`,
  );
  const [res] = latest
    ? await rows<{ n: number; passed: number; avg: number }>(
        tx,
        sql`select count(*)::int n, count(*) filter (where r.outcome = 'pass')::int passed, coalesce(avg(r.sgpa), 0)::float8 avg
            from exam_results r join students s on s.id = r.student_id join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id
            where r.session_id = ${latest.id}::uuid ${sc}`,
      )
    : [{ n: 0, passed: 0, avg: 0 }];
  const [fee] = await rows<{ billed: number; paid: number; outstanding: number; overdue: number }>(
    tx,
    sql`select coalesce(sum(i.amount_paise), 0)::float8 billed, coalesce(sum(i.paid_paise), 0)::float8 paid,
          coalesce(sum(greatest(i.amount_paise - i.paid_paise, 0)), 0)::float8 outstanding,
          coalesce(sum(greatest(i.amount_paise - i.paid_paise, 0)) filter (where i.due_on < ${today}::date), 0)::float8 overdue
        from fee_invoices i join sections sec on sec.id = i.section_id join programs pr on pr.id = sec.program_id
        where i.status <> 'cancelled' ${sc}`,
  );
  const [coll] = await rows<{ amount: number }>(
    tx,
    sql`select coalesce(sum(p.amount_paise), 0)::float8 amount
        from fee_payments p join fee_invoices i on i.id = p.invoice_id join sections sec on sec.id = i.section_id join programs pr on pr.id = sec.program_id
        where p.status = 'paid' and (p.paid_at at time zone ${timezone})::date between ${range.from}::date and ${range.to}::date ${sc}`,
  );
  const staffRows = await rows<{ type: string; status: string; n: number }>(tx, sql`select employment_type type, status, count(*)::int n from staff_profiles group by 1, 2`);
  const [teachers] = await rows<{ n: number }>(tx, sql`select count(distinct user_id)::int n from user_roles where role = 'teacher'`);
  const [pl] = await rows<{ offers: number; students: number; joined: number; avg: number; highest: number }>(
    tx,
    sql`select count(*)::int offers, count(distinct p.student_id)::int students, count(*) filter (where p.status = 'joined')::int joined,
          coalesce(avg(p.package_paise), 0)::float8 avg, coalesce(max(p.package_paise), 0)::float8 highest
        from placement_records p join students s on s.id = p.student_id join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id
        where p.status <> 'declined' and p.offered_on between ${annual.from}::date and ${annual.to}::date ${sc}`,
  );
  const rk = await rows<{ kind: string; n: number; grants: number }>(
    tx,
    sql`select kind, count(*)::int n, coalesce(sum(grant_paise), 0)::float8 grants from research_outputs where published_on between ${annual.from}::date and ${annual.to}::date group by kind`,
  );
  const byType: Record<string, number> = {};
  for (const r of staffRows.filter((x) => x.status === 'active')) byType[r.type] = (byType[r.type] ?? 0) + r.n;
  return {
    scope,
    range,
    enrolment: { active: enr.active, total: enr.total, joinedInRange: enr.joined },
    attendance: { percent: pct(att.present, att.n), marks: att.n },
    results: { session: latest?.name ?? null, students: res.n, passPercent: pct(res.passed, res.n), averageSgpa: res.n ? Math.round(res.avg * 100) / 100 : null },
    fees: { billedPaise: fee.billed, collectedPaise: fee.paid, outstandingPaise: fee.outstanding, overduePaise: fee.overdue, collectedInRangePaise: coll.amount },
    staff: { active: staffRows.filter((r) => r.status === 'active').reduce((a, r) => a + r.n, 0), total: staffRows.reduce((a, r) => a + r.n, 0), teachers: teachers.n, byType },
    placement: { offers: pl.offers, students: pl.students, joined: pl.joined, averagePackagePaise: Math.round(pl.avg), highestPackagePaise: pl.highest },
    research: { outputs: rk.reduce((a, r) => a + r.n, 0), grantsPaise: rk.reduce((a, r) => a + r.grants, 0), byKind: Object.fromEntries(rk.map((r) => [r.kind, r.n])) },
  };
}

// ----- drill-downs by campus / program / section ----------------------------------------------------

export const METRICS = ['enrolment', 'attendance', 'fees', 'results', 'coverage'] as const;
export type Metric = (typeof METRICS)[number];
export const LEVELS = ['campus', 'program', 'section'] as const;
export type Level = (typeof LEVELS)[number];

const LEVEL_COLS: Record<Level, { id: SQL; label: SQL; parent: SQL }> = {
  campus: { id: sql`c.id`, label: sql`c.name`, parent: sql`c.name` },
  program: { id: sql`pr.id`, label: sql`pr.name`, parent: sql`c.name` },
  section: { id: sql`sec.id`, label: sql`sec.display_name`, parent: sql`pr.name`},
};

/** One row per campus, program or section for a metric, filtered by the scope above it. */
export async function drilldown(tx: Tx, metric: Metric, by: Level, scope: Scope, range: Range, timezone: string, today: string): Promise<Row[]> {
  const sc = scopeSql(scope);
  const l = LEVEL_COLS[by];
  const base = sql`from sections sec join programs pr on pr.id = sec.program_id join campuses c on c.id = pr.campus_id`;
  const group = sql`group by ${l.id}, ${l.label}, ${l.parent} order by ${l.parent}, ${l.label}`;
  const head = sql`${l.id} as id, ${l.label} as label, ${l.parent} as parent`;
  switch (metric) {
    case 'enrolment':
      return rows(tx, sql`select ${head}, count(s.id) filter (where s.status in ('enrolled', 'active'))::int active, count(s.id)::int total,
          count(s.id) filter (where s.enrolled_on between ${range.from}::date and ${range.to}::date)::int joined
        ${base} left join students s on s.section_id = sec.id where true ${sc} ${group}`);
    case 'attendance':
      return rows(tx, sql`select ${head}, count(a.id)::int marks, count(a.id) filter (where a.status in ('present', 'late'))::int present,
          case when count(a.id) = 0 then null else round(100.0 * count(a.id) filter (where a.status in ('present', 'late')) / count(a.id), 1)::float8 end percent
        ${base} left join attendance_records a on a.section_id = sec.id and a.date between ${range.from}::date and ${range.to}::date where true ${sc} ${group}`);
    case 'fees':
      return rows(tx, sql`select ${head}, coalesce(sum(i.amount_paise), 0)::float8 billed_paise, coalesce(sum(i.paid_paise), 0)::float8 collected_paise,
          coalesce(sum(greatest(i.amount_paise - i.paid_paise, 0)), 0)::float8 outstanding_paise,
          coalesce(sum(greatest(i.amount_paise - i.paid_paise, 0)) filter (where i.due_on < ${today}::date), 0)::float8 overdue_paise
        ${base} left join fee_invoices i on i.section_id = sec.id and i.status <> 'cancelled' where true ${sc} ${group}`);
    case 'results':
      return rows(tx, sql`select ${head}, count(r.id)::int students, count(r.id) filter (where r.outcome = 'pass')::int passed,
          case when count(r.id) = 0 then null else round(100.0 * count(r.id) filter (where r.outcome = 'pass') / count(r.id), 1)::float8 end pass_percent,
          case when count(r.id) = 0 then null else round(avg(r.sgpa), 2)::float8 end average_sgpa
        ${base} left join students s on s.section_id = sec.id
          left join exam_results r on r.student_id = s.id and r.session_id in (select id from exam_sessions where status in ('published', 'locked'))
        where true ${sc} ${group}`);
    case 'coverage':
      return rows(tx, sql`select ${head}, count(distinct t.id)::int topics, count(distinct tc.topic_id)::int covered,
          case when count(distinct t.id) = 0 then null else round(100.0 * count(distinct tc.topic_id) / count(distinct t.id), 1)::float8 end percent
        ${base} left join subjects sj on sj.program_id = sec.program_id and sj.term = sec.term and sj.course_id is not null
          left join chapters ch on ch.course_id = sj.course_id
          left join topics t on t.chapter_id = ch.id and (t.tenant_id is null or t.tenant_id = sec.tenant_id)
          left join topic_coverage tc on tc.section_id = sec.id and tc.topic_id = t.id
        where true ${sc} ${group}`);
  }
}

// ----- classroom analytics from the board -----------------------------------------------------------

export interface ClassroomAnalytics {
  range: Range;
  sessions: { total: number; hours: number; teachers: number; boards: number; liveForClass: number };
  byDay: { day: string; sessions: number }[];
  tools: { tool: string; label: string; uses: number }[];
  aiTasks: { task: string; uses: number }[];
  bySection: Row[];
  coverage: Row[];
}

/** Session usage, tool usage and syllabus coverage, from what the board already records. */
export async function classroomAnalytics(tx: Tx, scope: Scope, range: Range, timezone: string, today: string): Promise<ClassroomAnalytics> {
  const sc = scopeSql(scope);
  const inRange = (col: string) => sql.raw(`(${col} at time zone '${timezone.replace(/[^A-Za-z0-9_/+-]/g, '')}')::date between '${range.from}'::date and '${range.to}'::date`);
  const [s] = await rows<{ total: number; hours: number; teachers: number; boards: number; live: number }>(
    tx,
    sql`select count(*)::int total, coalesce(sum(extract(epoch from (coalesce(bs.ended_at, least(bs.expires_at, bs.started_at + interval '2 hours')) - bs.started_at))) / 3600, 0)::float8 hours,
          count(distinct bs.teacher_id)::int teachers, count(distinct bs.device_id)::int boards, count(*) filter (where bs.live_for_class)::int live
        from board_sessions bs left join sections sec on sec.id = bs.section_id left join programs pr on pr.id = sec.program_id
        where ${inRange('bs.started_at')} ${sc}`,
  );
  const byDay = await rows<{ day: string; sessions: number }>(
    tx,
    sql`select to_char((bs.started_at at time zone ${timezone})::date, 'YYYY-MM-DD') as day, count(*)::int sessions
        from board_sessions bs left join sections sec on sec.id = bs.section_id left join programs pr on pr.id = sec.program_id
        where ${inRange('bs.started_at')} ${sc} group by 1 order by 1`,
  );
  const count = async (q: SQL) => (await rows<{ n: number }>(tx, q))[0].n;
  const [polls, mcq, participation, boards, shared, recs, transcribed, summarised, casts] = await sequence([
    () => count(sql`select count(*)::int n from polls p join sections sec on sec.id = p.section_id join programs pr on pr.id = sec.program_id where ${inRange('p.opened_at')} ${sc}`),
    () => count(sql`select count(*)::int n from polls p join sections sec on sec.id = p.section_id join programs pr on pr.id = sec.program_id where p.kind = 'mcq' and ${inRange('p.opened_at')} ${sc}`),
    () => count(sql`select count(*)::int n from participation_events e join board_sessions bs on bs.id = e.board_session_id join sections sec on sec.id = bs.section_id join programs pr on pr.id = sec.program_id where ${inRange('e.occurred_at')} ${sc}`),
    () => count(sql`select count(*)::int n from whiteboards w left join sections sec on sec.id = w.section_id left join programs pr on pr.id = sec.program_id where ${inRange('w.created_at')} ${sc}`),
    () => count(sql`select count(*)::int n from whiteboards w left join sections sec on sec.id = w.section_id left join programs pr on pr.id = sec.program_id where w.shared_at is not null and ${inRange('w.shared_at')} ${sc}`),
    () => count(sql`select count(*)::int n from recordings r left join sections sec on sec.id = r.section_id left join programs pr on pr.id = sec.program_id where r.finished_at is not null and ${inRange('r.started_at')} ${sc}`),
    () => count(sql`select count(*)::int n from recordings r left join sections sec on sec.id = r.section_id left join programs pr on pr.id = sec.program_id where r.transcript_state = 'done' and ${inRange('r.started_at')} ${sc}`),
    () => count(sql`select count(*)::int n from recordings r left join sections sec on sec.id = r.section_id left join programs pr on pr.id = sec.program_id where r.summary_state = 'done' and ${inRange('r.started_at')} ${sc}`),
    () => count(sql`select count(*)::int n from cast_sessions c join board_sessions bs on bs.id = c.board_session_id join sections sec on sec.id = bs.section_id join programs pr on pr.id = sec.program_id where c.started_at is not null and ${inRange('c.started_at')} ${sc}`),
  ]);
  const aiTasks = await rows<{ task: string; uses: number }>(tx, sql`select task::text task, count(*)::int uses from ai_usage u where ${inRange('u.created_at')} group by 1 order by 2 desc`);
  const bySection = await rows(
    tx,
    sql`select sec.id as id, sec.display_name as label, pr.name as parent, count(bs.id)::int sessions,
          coalesce(round(sum(extract(epoch from (coalesce(bs.ended_at, least(bs.expires_at, bs.started_at + interval '2 hours')) - bs.started_at))) / 3600, 1), 0)::float8 hours,
          count(distinct bs.teacher_id)::int teachers,
          (select count(*)::int from polls p where p.section_id = sec.id and ${inRange('p.opened_at')}) polls,
          (select count(*)::int from participation_events e join board_sessions b2 on b2.id = e.board_session_id where b2.section_id = sec.id and ${inRange('e.occurred_at')}) answers,
          (select count(*)::int from whiteboards w where w.section_id = sec.id and ${inRange('w.created_at')}) whiteboards,
          (select count(*)::int from recordings r where r.section_id = sec.id and r.finished_at is not null and ${inRange('r.started_at')}) recordings
        from sections sec join programs pr on pr.id = sec.program_id
        left join board_sessions bs on bs.section_id = sec.id and ${inRange('bs.started_at')}
        where true ${sc} group by sec.id, sec.display_name, pr.name order by pr.name, sec.display_name`,
  );
  // Engagement: what the class did with the board per session (polls asked + answers + boards saved + lessons recorded).
  for (const r of bySection) {
    const sessions = Number(r.sessions) || 0;
    const activity = ['polls', 'answers', 'whiteboards', 'recordings'].reduce((n, k) => n + (Number(r[k]) || 0), 0);
    r.activity = activity;
    r.perSession = sessions ? Math.round((activity / sessions) * 10) / 10 : null;
  }
  const coverage = await drilldown(tx, 'coverage', 'section', scope, range, timezone, today);
  const tools = [
    { tool: 'polls', label: 'Class questions (polls)', uses: polls },
    { tool: 'mcq', label: 'Multiple-choice questions', uses: mcq },
    { tool: 'participation', label: 'Answers recorded', uses: participation },
    { tool: 'whiteboards', label: 'Whiteboards saved', uses: boards },
    { tool: 'whiteboards_shared', label: 'Whiteboards shared with the class', uses: shared },
    { tool: 'recordings', label: 'Lessons recorded', uses: recs },
    { tool: 'transcripts', label: 'Lessons transcribed', uses: transcribed },
    { tool: 'summaries', label: 'Lesson summaries', uses: summarised },
    { tool: 'screen_shares', label: 'Screens cast to the board', uses: casts },
  ];
  return { range, sessions: { total: s.total, hours: Math.round(s.hours * 10) / 10, teachers: s.teachers, boards: s.boards, liveForClass: s.live }, byDay, tools, aiTasks, bySection, coverage };
}
