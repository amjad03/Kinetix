// Automatic figures for accreditation metrics, read from the ERP modules that already hold the data.
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';

export interface AutoValue {
  value: number | null;
  /** A short sentence for narrative metrics, or the basis of the figure. */
  text?: string;
  /** Rows for the metric's data template. */
  rows?: string[][];
}

const r1 = (v: unknown): number | null => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

async function one(tx: Tx, q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
  return ((await tx.execute(q)).rows[0] ?? {}) as Record<string, unknown>;
}
async function all(tx: Tx, q: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  return (await tx.execute(q)).rows as Record<string, unknown>[];
}

const TEACHERS = sql`(select count(distinct ur.user_id) from user_roles ur join staff_profiles sp on sp.user_id = ur.user_id and sp.status = 'active' where ur.role in ('teacher', 'hod'))`;
const PHD = sql`(sq.kind = 'degree' and (sq.level ilike '%doctor%' or sq.title ilike '%ph%d%' or sq.title ilike '%doctorate%'))`;

/** The ERP-computed value for each automatic key. Unknown keys and keys without data return a null value. */
export async function computeAuto(tx: Tx, keys: string[]): Promise<Map<string, AutoValue>> {
  const out = new Map<string, AutoValue>();
  const done = new Set<string>();
  for (const key of keys) {
    if (done.has(key)) continue;
    done.add(key);
    out.set(key, await one1(tx, key));
  }
  return out;
}

async function one1(tx: Tx, key: string): Promise<AutoValue> {
  switch (key) {
    case 'students':
      return { value: r1((await one(tx, sql`select count(*)::int as v from students where status in ('enrolled', 'active')`)).v), text: 'Students on roll' };
    case 'student_teacher_ratio': {
      const x = await one(tx, sql`select (select count(*) from students where status in ('enrolled', 'active'))::numeric / nullif(${TEACHERS}, 0) as v`);
      return { value: r1(x.v), text: 'Students on roll per full-time teacher (teacher and head of department roles)' };
    }
    case 'fulltime_teachers':
      return { value: r1((await one(tx, sql`select ${TEACHERS}::int as v`)).v), text: 'Active staff holding a teacher or head of department role' };
    case 'phd_teachers': {
      const x = await one(tx, sql`select 100.0 * (select count(distinct sq.user_id) from staff_qualifications sq join user_roles ur on ur.user_id = sq.user_id and ur.role in ('teacher', 'hod') where ${PHD}) / nullif(${TEACHERS}, 0) as v`);
      return { value: r1(x.v), text: 'Teachers with a doctoral degree recorded in staff qualifications' };
    }
    case 'avg_experience': {
      const x = await one(tx, sql`select avg(extract(year from age(current_date, date_of_joining)) + extract(month from age(current_date, date_of_joining)) / 12.0) as v from staff_profiles where status = 'active' and date_of_joining is not null`);
      return { value: r1(x.v), text: 'Average years since joining, active staff' };
    }
    case 'mentor_ratio': {
      const x = await one(tx, sql`select count(*)::numeric / nullif(count(distinct mentor_user_id), 0) as v from mentor_assignments where ended_on is null`);
      return { value: r1(x.v), text: 'Mentored students per mentor' };
    }
    case 'pass_rate': {
      const rows = await all(tx, sql`select pr.name as program, es.name as session, count(r.id)::int as appeared, count(r.id) filter (where r.outcome = 'pass')::int as passed
        from exam_sessions es join programs pr on pr.id = es.program_id left join exam_results r on r.session_id = es.id
        where es.status in ('published', 'locked') group by pr.name, es.name, es.published_at order by pr.name, es.published_at`);
      const appeared = rows.reduce((a, x) => a + Number(x.appeared), 0);
      const passed = rows.reduce((a, x) => a + Number(x.passed), 0);
      return { value: appeared ? r1((100 * passed) / appeared) : null, text: 'Pass percentage over published sessions', rows: rows.map((x) => [String(x.program), String(x.session), String(x.appeared), String(x.passed)]) };
    }
    case 'feedback_rating':
      return { value: r1((await one(tx, sql`select avg(rating) as v from survey_answers where rating is not null`)).v), text: 'Average rating over all survey answers' };
    case 'feedback_surveys': {
      const x = await one(tx, sql`select count(*)::int as n, count(*) filter (where status <> 'draft')::int as live from surveys`);
      return { value: r1(x.n), text: `${x.n} feedback surveys set up, ${x.live} opened to respondents.` };
    }
    case 'feedback_atr': {
      const x = await one(tx, sql`select count(*)::int as n, count(*) filter (where status = 'action_taken')::int as done from iqac_feedback_reports`);
      return { value: r1(x.done), text: `${x.n} feedback analyses recorded, ${x.done} with action taken.` };
    }
    case 'cos_defined': {
      const x = await one(tx, sql`select count(*)::int as n, (select count(*)::int from program_outcomes) as po from course_outcomes`);
      return { value: r1(x.n), text: `${x.po} programme outcomes and ${x.n} course outcomes are defined in the ERP.` };
    }
    case 'outcomes_met':
    case 'nba_po_attain': {
      const rows = await all(tx, sql`select * from (select distinct on (program_id, target_id) code, scope, combined, target, met from attainment_snapshots where scope = 'po' order by program_id, target_id, computed_at desc) x order by code`);
      const met = rows.filter((x) => x.met === true).length;
      return { value: rows.length ? r1((100 * met) / rows.length) : null, text: `${met} of ${rows.length} programme outcomes met their target in the latest run.`, rows: rows.map((x) => [String(x.code), String(x.combined ?? ''), String(x.target), x.met ? 'Yes' : 'No']) };
    }
    case 'nba_co_attain': {
      const x = await one(tx, sql`select count(*)::int as n, count(*) filter (where met)::int as met from (select distinct on (program_id, target_id) met from attainment_snapshots where scope = 'co' order by program_id, target_id, computed_at desc) y`);
      return { value: Number(x.n) ? r1((100 * Number(x.met)) / Number(x.n)) : null, text: `${x.met} of ${x.n} course outcomes met their target in the latest run.` };
    }
    case 'nba_cos':
      return { value: r1((await one(tx, sql`select count(*)::int as v from course_outcomes`)).v), text: 'Course outcomes defined' };
    case 'nba_courses_mapped': {
      const x = await one(tx, sql`select 100.0 * count(*) filter (where exists (select 1 from co_outcome_map m where m.co_id = c.id)) / nullif(count(*), 0) as v from course_outcomes c`);
      return { value: r1(x.v), text: 'Course outcomes mapped to at least one programme outcome' };
    }
    case 'nba_course_files': {
      const x = await one(tx, sql`select count(*)::int as n, count(*) filter (where reviewed_at is not null)::int as rev from course_files`);
      return { value: r1(x.rev), text: `${x.n} course files, ${x.rev} reviewed.` };
    }
    case 'cqi_actions': {
      const x = await one(tx, sql`select count(*)::int as n, count(*) filter (where remeasured_value is not null)::int as m from improvement_actions`);
      return { value: r1(x.m), text: `${x.n} improvement actions, ${x.m} re-measured after the action.` };
    }
    case 'grants_lakhs':
      return { value: r1((await one(tx, sql`select coalesce(sum(sanctioned_paise), 0) / 1e7 as v from research_grants`)).v), text: 'Sanctioned research grants' };
    case 'research_teachers':
      return { value: r1((await one(tx, sql`select count(distinct pi_user_id)::int as v from research_projects`)).v), text: 'Distinct principal investigators' };
    case 'patents':
      return { value: r1((await one(tx, sql`select count(*)::int as v from patents`)).v), text: 'Patents recorded (filed or granted)' };
    case 'publications': {
      const x = await one(tx, sql`select (select count(*) from publications) + (select count(*) from faculty_evidence where kind = 'publication') as v`);
      return { value: r1(x.v), text: 'Publications recorded in research plus teacher-uploaded evidence' };
    }
    case 'indexed_publications':
      return { value: r1((await one(tx, sql`select count(*)::int as v from publications where coalesce(array_length(indexed_in, 1), 0) > 0`)).v), text: 'Publications with an indexing service recorded' };
    case 'papers_per_teacher': {
      const x = await one(tx, sql`select ((select count(*) from publications where kind not ilike '%book%' and kind not ilike '%conf%') + (select count(*) from faculty_evidence where kind = 'publication'))::numeric / nullif(${TEACHERS}, 0) as v`);
      return { value: r1(x.v), text: 'Journal papers per full-time teacher' };
    }
    case 'books_per_teacher': {
      const x = await one(tx, sql`select ((select count(*) from publications where kind ilike '%book%' or kind ilike '%conf%') + (select count(*) from faculty_evidence where kind = 'book'))::numeric / nullif(${TEACHERS}, 0) as v`);
      return { value: r1(x.v), text: 'Books, chapters and conference papers per full-time teacher' };
    }
    case 'rooms_summary': {
      const rows = await all(tx, sql`select kind, count(*)::int as n, coalesce(sum(capacity), 0)::int as seats from rooms group by kind order by kind`);
      const n = rows.reduce((a, x) => a + Number(x.n), 0);
      return { value: n, text: rows.length ? `${n} rooms: ${rows.map((x) => `${x.n} ${x.kind}`).join(', ')}.` : 'No rooms recorded.', rows: rows.map((x) => [String(x.kind), String(x.n), String(x.seats)]) };
    }
    case 'library_summary': {
      const x = await one(tx, sql`select (select count(*) from library_books)::int as titles, coalesce((select sum(copies) from library_books), 0)::int as copies, (select count(*) from library_loans)::int as loans`);
      return { value: r1(x.titles), text: `${x.titles} titles, ${x.copies} copies, ${x.loans} loans recorded in the library module.` };
    }
    case 'eresources':
      return { value: r1((await one(tx, sql`select count(*)::int as v from library_eresources`)).v), text: 'E-resources registered' };
    case 'library_use':
      return { value: r1((await one(tx, sql`select count(*) / 365.0 as v from library_loans`)).v), text: 'Loans recorded divided by 365 days' };
    case 'it_summary': {
      const x = await one(tx, sql`select (select count(*) from devices)::int as boards, (select count(*) from lms_items)::int as items`);
      return { value: r1(x.boards), text: `${x.boards} smartboards enrolled and ${x.items} items on the learning platform.` };
    }
    case 'scholarship_schemes':
      return { value: r1((await one(tx, sql`select count(*)::int as v from scholarship_schemes where active`)).v), text: 'Active scholarship schemes (enter students benefited by hand)' };
    case 'counselled':
      return { value: r1((await one(tx, sql`select count(distinct student_id)::int as v from counselling_sessions`)).v), text: 'Students with at least one counselling session' };
    case 'grievance_resolution': {
      const x = await one(tx, sql`select count(*)::int as n, 100.0 * count(*) filter (where resolved_at is not null) / nullif(count(*), 0) as v from grievance_tickets`);
      return { value: r1(x.v), text: `${x.n} grievances recorded; the share resolved is shown.` };
    }
    case 'placement_rate': {
      const x = await one(tx, sql`select 100.0 * (select count(distinct student_id) from drive_registrations where status = 'selected') / nullif((select count(*) from students where status in ('enrolled', 'active')), 0) as v`);
      return { value: r1(x.v), text: 'Students selected in a placement drive, as a share of students on roll' };
    }
    case 'median_salary': {
      const x = await one(tx, sql`select percentile_cont(0.5) within group (order by ctc_lpa::numeric) as v from placement_offers where ctc_lpa is not null`);
      return { value: r1(x.v), text: 'Median CTC across placement offers' };
    }
    case 'alumni':
      return { value: r1((await one(tx, sql`select count(*)::int as v from alumni_profiles`)).v), text: 'Alumni profiles in the directory' };
    case 'women_students': {
      const x = await one(tx, sql`select 100.0 * count(*) filter (where lower(a.gender) in ('f', 'female')) / nullif(count(*) filter (where coalesce(a.gender, '') <> ''), 0) as v from students s left join applications a on a.id = s.application_id where s.status in ('enrolled', 'active')`);
      return { value: r1(x.v), text: 'Women among students whose gender is recorded' };
    }
    case 'erp_areas': {
      const x = await one(tx, sql`select (exists (select 1 from students)::int + exists (select 1 from fee_invoices)::int + exists (select 1 from exam_sessions)::int + exists (select 1 from staff_profiles)::int + exists (select 1 from library_books)::int + exists (select 1 from payroll_runs)::int + exists (select 1 from lms_items)::int) as v`);
      return { value: r1(x.v), text: 'Areas with live records: students, fees, exams, HR, library, payroll, learning platform' };
    }
    case 'fdp_count': {
      const x = await one(tx, sql`select ((select count(*) from training_records) + (select count(*) from faculty_evidence where kind = 'fdp'))::int as v`);
      return { value: r1(x.v), text: 'Training records plus teacher-uploaded FDP evidence' };
    }
    case 'fees_collected':
    case 'fees_lakhs': {
      const x = await one(tx, sql`select coalesce(sum(paid_paise), 0) / 1e7 as v, coalesce(sum(amount_paise), 0) / 1e7 as billed from fee_invoices where status <> 'cancelled'`);
      return { value: r1(x.v), text: `Fees collected ${r1(x.v)} lakhs against ${r1(x.billed)} lakhs billed.` };
    }
    case 'iqac_meetings':
      return { value: r1((await one(tx, sql`select count(*)::int as v from iqac_meetings`)).v), text: 'IQAC meetings minuted in the workspace' };
    case 'best_practices':
      return { value: r1((await one(tx, sql`select count(*)::int as v from iqac_practices where kind = 'best_practice'`)).v), text: 'Best practices written in the NAAC format' };
    case 'distinctiveness':
      return { value: r1((await one(tx, sql`select count(*)::int as v from iqac_practices where kind = 'distinctiveness'`)).v), text: 'Distinctiveness statements written' };
    default:
      return { value: null };
  }
}
