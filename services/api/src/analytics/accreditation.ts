import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import type { Column, ReportData } from './catalogue.js';
import { rows, type Range } from './queries.js';

/**
 * Data packs for accreditation and statutory returns (NAAC, NIRF, AISHE). Each pack aggregates the
 * numbers the institution already records across admissions, exams, fees, HR, library, hostel,
 * transport, assets, placement and research into the tables those frameworks ask for. They are the
 * data to copy into the portal, not the filing itself: items we do not hold (for example faculty
 * qualifications) are listed in `gaps` so nobody assumes the pack is complete.
 */

export interface PackTable extends ReportData {
  name: string;
  title: string;
}
export interface Pack {
  framework: 'naac' | 'nirf' | 'aishe';
  title: string;
  period: Range;
  generatedAt: string;
  tables: PackTable[];
  gaps: string[];
}

export const FRAMEWORKS = ['naac', 'nirf', 'aishe'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

const int = (key: string, label: string): Column => ({ key, label, kind: 'int' });
const text = (key: string, label: string): Column => ({ key, label });
const money = (key: string, label: string): Column => ({ key, label, kind: 'money' });
const percent = (key: string, label: string): Column => ({ key, label, kind: 'percent' });

type Ctx = { tx: Tx; period: Range };
type Builder = (c: Ctx) => Promise<PackTable>;

const table = (name: string, title: string, columns: Column[], make: (c: Ctx) => Promise<Record<string, string | number | null>[]>): Builder => async (c) => ({ name, title, columns, rows: await make(c) });

const programs = table('programs', 'Programs offered', [text('campus', 'Campus'), text('program', 'Program'), text('level', 'Level'), int('terms', 'Semesters or grades'), int('sections', 'Classes'), int('subjects', 'Subjects')], ({ tx }) =>
  rows(tx, sql`select c.name as campus, pr.name as program, pr.level::text as level, pr.term_count::int as terms,
      (select count(*)::int from sections s where s.program_id = pr.id) as sections, (select count(*)::int from subjects sj where sj.program_id = pr.id) as subjects
    from programs pr join campuses c on c.id = pr.campus_id order by c.name, pr.name`),
);

const enrolmentByProgram = table('enrolment_by_program', 'Students on roll by program and gender', [text('program', 'Program'), text('gender', 'Gender'), int('students', 'Students')], ({ tx }) =>
  rows(tx, sql`select pr.name as program, coalesce(nullif(a.gender, ''), 'Not recorded') as gender, count(*)::int as students
    from students s join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id left join applications a on a.id = s.application_id
    where s.status in ('enrolled', 'active') group by 1, 2 order by 1, 2`),
);

const admissions = table('admissions', 'Admission cycles', [text('cycle', 'Cycle'), int('applications', 'Applications'), int('offers', 'Offers'), int('enrolled', 'Enrolled')], ({ tx }) =>
  rows(tx, sql`select cy.name as cycle, count(a.id)::int as applications, count(a.id) filter (where a.status in ('offered', 'accepted', 'enrolled'))::int as offers, count(a.id) filter (where a.status = 'enrolled')::int as enrolled
    from admission_cycles cy left join applications a on a.cycle_id = cy.id group by cy.id, cy.name order by cy.name`),
);

const staffByType = table('teaching_staff', 'Staff by employment type and gender', [text('employment_type', 'Employment type'), text('gender', 'Gender'), int('staff', 'Staff')], ({ tx }) =>
  rows(tx, sql`select employment_type, coalesce(nullif(gender, ''), 'Not recorded') as gender, count(*)::int as staff from staff_profiles where status = 'active' group by 1, 2 order by 1, 2`),
);

const ratio = table('student_teacher_ratio', 'Student-teacher ratio', [int('students', 'Active students'), int('teaching_staff', 'Teachers'), text('ratio', 'Students per teacher')], async ({ tx }) =>
  rows(tx, sql`select (select count(*)::int from students where status in ('enrolled', 'active')) as students, (select count(distinct user_id)::int from user_roles where role in ('teacher', 'hod')) as teaching_staff,
      coalesce(round((select count(*) from students where status in ('enrolled', 'active'))::numeric / nullif((select count(distinct user_id) from user_roles where role in ('teacher', 'hod')), 0), 1)::text, 'n/a') as ratio`),
);

const resultsByProgram = table('results', 'Examination results (published sessions)', [text('program', 'Program'), text('session', 'Exam session'), int('students', 'Students'), int('passed', 'Passed'), percent('pass_percent', 'Pass %')], ({ tx }) =>
  rows(tx, sql`select pr.name as program, es.name as session, count(r.id)::int as students, count(r.id) filter (where r.outcome = 'pass')::int as passed,
      case when count(r.id) = 0 then null else round(100.0 * count(r.id) filter (where r.outcome = 'pass') / count(r.id), 1)::float8 end as pass_percent
    from exam_sessions es join programs pr on pr.id = es.program_id left join exam_results r on r.session_id = es.id
    where es.status in ('published', 'locked') group by pr.name, es.name, es.published_at order by pr.name, es.published_at`),
);

const placementTable = table('placement', 'Placement offers by program', [text('program', 'Program'), int('offers', 'Offers'), int('students', 'Students placed'), money('average_paise', 'Average package'), money('highest_paise', 'Highest package')], ({ tx, period }) =>
  rows(tx, sql`select pr.name as program, count(*)::int as offers, count(distinct p.student_id)::int as students, coalesce(avg(p.package_paise), 0)::float8 as average_paise, coalesce(max(p.package_paise), 0)::float8 as highest_paise
    from placement_records p join students s on s.id = p.student_id join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id
    where p.status <> 'declined' and p.offered_on between ${period.from}::date and ${period.to}::date group by pr.name order by pr.name`),
);

const researchTable = table('research', 'Research outputs and grants', [text('kind', 'Kind'), int('outputs', 'Outputs'), money('grants_paise', 'Grants')], ({ tx, period }) =>
  rows(tx, sql`select kind, count(*)::int as outputs, coalesce(sum(grant_paise), 0)::float8 as grants_paise from research_outputs where published_on between ${period.from}::date and ${period.to}::date group by kind order by kind`),
);

const feesTable = table('fees', 'Fee income', [text('program', 'Program'), money('billed_paise', 'Billed'), money('collected_paise', 'Collected'), money('outstanding_paise', 'Outstanding')], ({ tx }) =>
  rows(tx, sql`select pr.name as program, coalesce(sum(i.amount_paise), 0)::float8 as billed_paise, coalesce(sum(i.paid_paise), 0)::float8 as collected_paise, coalesce(sum(greatest(i.amount_paise - i.paid_paise, 0)), 0)::float8 as outstanding_paise
    from programs pr left join sections sec on sec.program_id = pr.id left join fee_invoices i on i.section_id = sec.id and i.status <> 'cancelled' group by pr.name order by pr.name`),
);

const payrollTable = table('salary_expenditure', 'Salary expenditure (locked payroll runs)', [text('month', 'Month'), int('payslips', 'Payslips'), money('net_paise', 'Net pay')], ({ tx }) =>
  rows(tx, sql`select r.month, count(p.id)::int as payslips, coalesce(sum(p.net_paise), 0)::float8 as net_paise from payroll_runs r left join payslips p on p.run_id = r.id where r.status = 'locked' group by r.month order by r.month`),
);

const infrastructure = table('infrastructure', 'Infrastructure and learning resources', [text('resource', 'Resource'), int('count', 'Count')], ({ tx }) =>
  rows(tx, sql`select * from (
      select 'Rooms' as resource, count(*)::int as count from rooms union all
      select 'Library books', count(*)::int from library_books union all
      select 'Hostel beds', count(*)::int from hostel_beds union all
      select 'Transport vehicles', count(*)::int from transport_vehicles union all
      select 'Assets (active)', count(*)::int from assets where status = 'active' union all
      select 'Boards enrolled', count(*)::int from devices) x order by resource`),
);

const outcomes = table('outcomes', 'Outcome-based education set-up', [text('program', 'Program'), int('program_outcomes', 'Program outcomes'), int('course_outcomes', 'Course outcomes')], ({ tx }) =>
  rows(tx, sql`select pr.name as program, (select count(*)::int from program_outcomes po where po.program_id = pr.id) as program_outcomes,
      (select count(*)::int from course_outcomes co join co_sets cs on cs.id = co.co_set_id join subjects sj on sj.id = cs.subject_id where sj.program_id = pr.id) as course_outcomes from programs pr order by pr.name`),
);

const coverage = table('syllabus_coverage', 'Syllabus coverage taught on the board', [text('class', 'Class'), int('topics', 'Topics'), int('covered', 'Covered'), percent('percent', 'Coverage %')], ({ tx }) =>
  rows(tx, sql`select sec.display_name as class, count(distinct t.id)::int as topics, count(distinct tc.topic_id)::int as covered,
      case when count(distinct t.id) = 0 then null else round(100.0 * count(distinct tc.topic_id) / count(distinct t.id), 1)::float8 end as percent
    from sections sec left join subjects sj on sj.program_id = sec.program_id and sj.term = sec.term and sj.course_id is not null
      left join chapters ch on ch.course_id = sj.course_id left join topics t on t.chapter_id = ch.id and (t.tenant_id is null or t.tenant_id = sec.tenant_id)
      left join topic_coverage tc on tc.section_id = sec.id and tc.topic_id = t.id group by sec.id, sec.display_name order by sec.display_name`),
);

const PACKS: Record<Framework, { title: string; tables: Builder[]; gaps: string[] }> = {
  naac: {
    title: 'NAAC self-study data (criteria I to VII, quantitative metrics)',
    tables: [programs, outcomes, enrolmentByProgram, admissions, ratio, staffByType, resultsByProgram, coverage, researchTable, infrastructure, placementTable, payrollTable],
    gaps: ['Faculty qualifications, awards and publications by author are not recorded.', 'Student progression to higher education, extension activities and MoUs are not recorded.', 'Qualitative metrics (criteria narratives) are written by the institution.'],
  },
  nirf: {
    title: 'NIRF data capturing (TLR, RPP, GO, OI parameters)',
    tables: [programs, enrolmentByProgram, ratio, staffByType, resultsByProgram, placementTable, researchTable, feesTable, payrollTable, infrastructure],
    gaps: ['Faculty experience and PhD qualification, sponsored-research rupees per faculty and perception scores are not recorded.', 'Median salary needs the placement records to be complete for the graduating batch.'],
  },
  aishe: {
    title: 'AISHE data (enrolment, teaching staff, examination results, finance)',
    tables: [programs, enrolmentByProgram, staffByType, resultsByProgram, feesTable, infrastructure],
    gaps: ['Social category (SC/ST/OBC), minority and disability counts are not recorded, so AISHE enrolment tables by category must be completed by hand.', 'Teaching staff by designation and category needs the HR designation and category fields.'],
  },
};

export async function buildPack(tx: Tx, framework: Framework, period: Range, generatedAt: Date): Promise<Pack> {
  const def = PACKS[framework];
  const tables: PackTable[] = [];
  for (const b of def.tables) tables.push(await b({ tx, period }));
  return { framework, title: def.title, period, generatedAt: generatedAt.toISOString(), tables, gaps: def.gaps };
}
