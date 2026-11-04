import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { toCsv } from '../common/pdf.js';
import { writeXlsx } from '../common/xlsx.js';
import { DbService } from '../db/db.service.js';
import { ctcSummary, FEEDBACK_CRITERIA } from './eligibility.js';
import { aicteCredits, creditStanding, naac52 } from './placement-pass.logic.js';
import { PLACEMENT_VIEW_ROLES } from './placements.access.js';
import { type PlacementRules, PlacementsService } from './placements.service.js';

/** The year a student graduates, from their class (semesters two to a year, school grades one). */
const BATCH = sql`(extract(year from ay.ends_on)::int + case when p.level = 'k12' then p.term_count - s.term else floor((p.term_count - s.term) / 2.0)::int end)`;
const Query_ = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), format: z.enum(['json', 'csv', 'xlsx']).default('json') });

type Col = [key: string, header: string];
interface Report {
  columns: Col[];
  rows: (year: number) => SQL;
  /** Rows computed in code (medians) from the query's rows, with the placement rules. */
  shape?: (rows: Record<string, unknown>[], ctx: { rules: PlacementRules; year: number }) => Record<string, unknown>[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Students who left the rolls without finishing: not counted as outgoing. */
const LEFT = sql.raw(`('dropped', 'transferred', 'expelled', 'deceased')`);
/** The batch: every student with the year they graduate, programme, gender and how they were admitted. */
const BATCHES = (from: number, to: number) => sql`
  select st.id, st.status, p.name as program, ${BATCH} as batch, coalesce(sp.gender, '') as gender, coalesce(sp.admission_type, 'regular') as adm
  from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id join academic_years ay on ay.id = s.academic_year_id
  left join student_profiles sp on sp.student_id = st.id
  where ${BATCH} between ${from} and ${to}`;
const PLACED = sql.raw(`exists (select 1 from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement')`);
const PROGRESSED = (kind: string) => sql.raw(`exists (select 1 from student_progressions g where g.student_id = b.id and g.kind = '${kind}')`);
const BEST_CTC = sql.raw(`(select max(o.ctc_lpa) from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement')`);
/** No subject whose latest published result is a fail: on course to graduate in the minimum time. */
const CLEAR = sql.raw(`not exists (select 1 from (select distinct on (l.subject_id) l.passed from exam_result_lines l join exam_results r on r.id = l.result_id join exam_sessions es on es.id = r.session_id where r.student_id = b.id and es.status in ('published', 'locked') order by l.subject_id, es.starts_on desc, r.computed_at desc) x where not x.passed)`);
const academicYear = (y: number) => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
const salary = (lpa: number | null) => (lpa === null ? null : Math.round(lpa * 100_000));

/**
 * Placement reports for NIRF, NAAC (criterion 5.2) and NBA, for a year (a graduating batch, or offers made in the
 * calendar year): placement percentage by programme, the NIRF graduation outcome table with median salary,
 * company-wise results, the offer list, the internship register, progression to higher studies and ventures,
 * training, and employer and alumni feedback. Each as JSON, CSV or Excel.
 */
const REPORTS: Record<string, Report> = {
  branch: {
    columns: [['program', 'Programme'], ['students', 'Graduating students'], ['optedOut', 'Opted out'], ['registered', 'Registered for drives'], ['placed', 'Placed'], ['placementPct', 'Placement %'], ['higherStudies', 'Higher studies'], ['medianCtc', 'Median CTC (LPA)'], ['averageCtc', 'Average CTC (LPA)'], ['highestCtc', 'Highest CTC (LPA)']],
    rows: (year) => sql`
      with batch as (select st.id, p.name as program from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id join academic_years ay on ay.id = s.academic_year_id where st.status <> 'dropped' and ${BATCH} = ${year})
      select b.program,
        count(*)::int as students,
        count(*) filter (where exists (select 1 from placement_optins o where o.student_id = b.id and o.opted_in = false))::int as "optedOut",
        count(*) filter (where exists (select 1 from drive_registrations r join placement_drives d on d.id = r.drive_id where r.student_id = b.id and r.status <> 'withdrawn' and d.kind = 'placement'))::int as registered,
        count(*) filter (where exists (select 1 from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement'))::int as placed,
        count(*) filter (where exists (select 1 from student_progressions g where g.student_id = b.id and g.kind = 'higher_studies'))::int as "higherStudies",
        array_remove(array_agg((select max(o.ctc_lpa) from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement')), null)::float8[] as ctcs
      from batch b group by b.program order by b.program`,
    shape: (rows) =>
      rows.map((r) => {
        const ctcs = ((r.ctcs as unknown[]) ?? []).map(Number);
        const s = ctcSummary(ctcs);
        const base = Number(r.students) - Number(r.optedOut);
        const { ctcs: _c, ...rest } = r;
        return { ...rest, placementPct: base > 0 ? Math.round((Number(r.placed) / base) * 1000) / 10 : 0, medianCtc: s.median, averageCtc: s.average, highestCtc: s.highest };
      }),
  },
  // NIRF graduation outcome (GPH, GMS): per programme, the three batches graduating up to the year, each with the
  // first-year intake, lateral entries, those graduating in the minimum time, placed, median salary and higher studies.
  nirf: {
    columns: [['program', 'Programme'], ['academicYear', 'Graduating academic year'], ['intake', 'Admitted in first year'], ['lateral', 'Lateral entry'], ['graduating', 'Graduating in minimum time'], ['placed', 'Placed'], ['medianSalary', 'Median salary of placed graduates (₹)'], ['higherStudies', 'Selected for higher studies'], ['entrepreneurs', 'Entrepreneurs']],
    rows: (year) => sql`
      with b as (${BATCHES(year - 2, year)})
      select b.program, b.batch,
        count(*) filter (where b.adm <> 'lateral')::int as intake,
        count(*) filter (where b.adm = 'lateral')::int as lateral,
        count(*) filter (where b.status not in ${LEFT} and b.status <> 'detained' and ${CLEAR})::int as graduating,
        count(*) filter (where b.status not in ${LEFT} and ${PLACED})::int as placed,
        count(*) filter (where b.status not in ${LEFT} and ${PROGRESSED('higher_studies')})::int as "higherStudies",
        count(*) filter (where b.status not in ${LEFT} and ${PROGRESSED('entrepreneurship')})::int as entrepreneurs,
        array_remove(array_agg(${BEST_CTC}) filter (where b.status not in ${LEFT}), null)::float8[] as ctcs
      from b group by b.program, b.batch order by b.program, b.batch`,
    shape: (rows) =>
      rows.map((r) => {
        const s = ctcSummary(((r.ctcs as unknown[]) ?? []).map(Number));
        const { ctcs: _c, batch, ...rest } = r;
        return { ...rest, academicYear: academicYear(Number(batch)), medianSalary: salary(s.median) };
      }),
  },
  // NAAC 5.2.1, 5.2.2 and 5.2.3 for the five outgoing batches up to the year, with the five-year averages last.
  naac52: {
    columns: [['year', 'Outgoing batch'], ['outgoing', 'Outgoing students'], ['placed', 'Placed (5.2.1)'], ['placedPct', 'Placed %'], ['higherStudies', 'Progressed to higher education (5.2.2)'], ['higherStudiesPct', 'Higher education %'], ['qualified', 'Qualified NET, GATE, CAT and the like (5.2.3)'], ['qualifiedPct', 'Qualified %']],
    rows: (year) => sql`
      with b as (${BATCHES(year - 4, year)})
      select y.batch as year,
        count(b.id) filter (where b.status not in ${LEFT})::int as outgoing,
        count(b.id) filter (where b.status not in ${LEFT} and (${PLACED} or ${PROGRESSED('off_campus_job')}))::int as placed,
        count(b.id) filter (where b.status not in ${LEFT} and ${PROGRESSED('higher_studies')})::int as "higherStudies",
        count(b.id) filter (where b.status not in ${LEFT} and ${PROGRESSED('competitive_exam')})::int as qualified
      from generate_series(${year - 4}::int, ${year}::int) y(batch) left join b on b.batch = y.batch group by y.batch order by y.batch`,
    shape: (rows) => {
      const r = naac52(rows.map((x) => ({ year: Number(x.year), outgoing: Number(x.outgoing), placed: Number(x.placed), higherStudies: Number(x.higherStudies), qualified: Number(x.qualified) })));
      return [...r.rows.map((x) => ({ ...x, year: academicYear(x.year) })), { year: 'Average of the years', outgoing: null, placed: null, placedPct: r.averages.m521, higherStudies: null, higherStudiesPct: r.averages.m522, qualified: null, qualifiedPct: r.averages.m523 }];
    },
  },
  // AISHE: the outgoing batch by programme, all and women, placed and gone on to higher studies, with the median salary.
  aishe: {
    columns: [['program', 'Programme'], ['passedOut', 'Final-year students'], ['passedOutFemale', 'of whom women'], ['placed', 'Placed'], ['placedFemale', 'Women placed'], ['higherStudies', 'Higher studies'], ['higherStudiesFemale', 'Women to higher studies'], ['medianSalary', 'Median salary (₹ a year)']],
    rows: (year) => sql`
      with b as (${BATCHES(year, year)})
      select b.program,
        count(*) filter (where b.status not in ${LEFT})::int as "passedOut",
        count(*) filter (where b.status not in ${LEFT} and b.gender = 'female')::int as "passedOutFemale",
        count(*) filter (where b.status not in ${LEFT} and ${PLACED})::int as placed,
        count(*) filter (where b.status not in ${LEFT} and b.gender = 'female' and ${PLACED})::int as "placedFemale",
        count(*) filter (where b.status not in ${LEFT} and ${PROGRESSED('higher_studies')})::int as "higherStudies",
        count(*) filter (where b.status not in ${LEFT} and b.gender = 'female' and ${PROGRESSED('higher_studies')})::int as "higherStudiesFemale",
        array_remove(array_agg(${BEST_CTC}) filter (where b.status not in ${LEFT}), null)::float8[] as ctcs
      from b group by b.program order by b.program`,
    shape: (rows) =>
      rows.map((r) => {
        const { ctcs, ...rest } = r;
        return { ...rest, medianSalary: salary(ctcSummary(((ctcs as unknown[]) ?? []).map(Number)).median) };
      }),
  },
  // AICTE internship credits of the batch: hours and credits of completed internships against what the programme asks.
  credits: {
    columns: [['rollNo', 'Roll no'], ['student', 'Student'], ['program', 'Programme'], ['internships', 'Internships completed'], ['hours', 'Hours'], ['credits', 'Credits earned'], ['required', 'Credits required'], ['short', 'Credits short']],
    rows: (year) => sql`
      with b as (${BATCHES(year, year)})
      select st.roll_no as "rollNo", st.full_name as student, b.program,
        count(i.id) filter (where i.status = 'completed')::int as internships,
        coalesce(sum(i.hours) filter (where i.status = 'completed'), 0)::float8 as hours,
        coalesce(json_agg(json_build_object('credits', i.credits, 'hours', i.hours)) filter (where i.status = 'completed'), '[]'::json) as items
      from b join students st on st.id = b.id left join internships i on i.student_id = b.id
      where b.status not in ${LEFT} group by st.id, st.roll_no, st.full_name, b.program order by b.program, st.roll_no`,
    shape: (rows, { rules }) =>
      rows.map((r) => {
        const { items, ...rest } = r;
        const earned = ((items as { credits: number | null; hours: number | null }[]) ?? []).reduce((s, x) => s + (x.credits != null ? Number(x.credits) : aicteCredits(x.hours, rules.hoursPerCredit)), 0);
        const c = creditStanding(earned, rules.creditsRequired);
        return { ...rest, credits: c.earned, required: c.required, short: c.short };
      }),
  },
  // The apprenticeship register (NATS): enrolment, contract, stipend, Government share, paid and credited.
  apprenticeships: {
    columns: [['rollNo', 'Roll no'], ['student', 'Student'], ['program', 'Programme'], ['establishment', 'Establishment'], ['enrolment', 'NATS enrolment'], ['contract', 'Contract no'], ['category', 'Category'], ['from', 'From'], ['to', 'To'], ['stipend', 'Stipend (₹ a month)'], ['govtShare', 'Government share (₹ a month)'], ['paid', 'Stipend paid (₹)'], ['dbt', 'DBT credited (₹)'], ['status', 'Status'], ['certificate', 'Certificate']],
    rows: (year) => sql`
      select st.roll_no as "rollNo", st.full_name as student, p.name as program, a.establishment, a.nats_enrolment_no as enrolment, a.contract_no as contract, a.category, a.starts_on::text as "from", a.ends_on::text as "to",
        (a.stipend_paise / 100.0)::float8 as stipend, (a.govt_share_paise / 100.0)::float8 as "govtShare",
        (select coalesce(sum(x.employer_paid_paise), 0) / 100.0 from apprenticeship_stipends x where x.apprenticeship_id = a.id)::float8 as paid,
        (select coalesce(sum(x.dbt_paise), 0) / 100.0 from apprenticeship_stipends x where x.apprenticeship_id = a.id)::float8 as dbt,
        a.status, coalesce(a.certificate_no, '') as certificate
      from apprenticeships a join students st on st.id = a.student_id join sections s on s.id = st.section_id join programs p on p.id = s.program_id
      where extract(year from a.starts_on) = ${year} or extract(year from a.ends_on) = ${year} order by p.name, st.roll_no`,
  },
  companies: {
    columns: [['company', 'Company'], ['sector', 'Sector'], ['drives', 'Drives'], ['registered', 'Registered'], ['offers', 'Offers'], ['accepted', 'Accepted'], ['joined', 'Joined'], ['highestCtc', 'Highest CTC (LPA)'], ['medianCtc', 'Median CTC (LPA)']],
    rows: (year) => sql`
      select c.name as company, c.sector, count(distinct d.id)::int as drives,
        (select count(*)::int from drive_registrations r join placement_drives dd on dd.id = r.drive_id where dd.company_id = c.id and r.status <> 'withdrawn' and extract(year from r.created_at at time zone 'Asia/Kolkata') = ${year}) as registered,
        count(o.id)::int as offers, count(o.id) filter (where o.status = 'accepted')::int as accepted, count(o.id) filter (where o.joining_status = 'joined')::int as joined,
        array_remove(array_agg(o.ctc_lpa) filter (where o.status = 'accepted'), null)::float8[] as ctcs
      from placement_companies c join placement_drives d on d.company_id = c.id left join placement_offers o on o.drive_id = d.id and extract(year from o.offered_on) = ${year}
      where extract(year from coalesce(d.drive_date, (d.created_at at time zone 'Asia/Kolkata')::date)) = ${year} or o.id is not null
      group by c.id order by accepted desc, c.name`,
    shape: (rows) =>
      rows.map((r) => {
        const s = ctcSummary(((r.ctcs as unknown[]) ?? []).map(Number));
        const { ctcs: _c, ...rest } = r;
        return { ...rest, highestCtc: s.highest, medianCtc: s.median };
      }),
  },
  offers: {
    columns: [['rollNo', 'Roll no'], ['student', 'Student'], ['program', 'Programme'], ['company', 'Company'], ['role', 'Role'], ['ctc', 'CTC (LPA)'], ['category', 'Category'], ['offeredOn', 'Offered on'], ['status', 'Status'], ['joining', 'Joining'], ['joinedOn', 'Joined on']],
    rows: (year) => sql`
      select st.roll_no as "rollNo", st.full_name as student, p.name as program, c.name as company, o.role_title as role, o.ctc_lpa as ctc, d.category, o.offered_on::text as "offeredOn", o.status, o.joining_status as joining, coalesce(o.joined_on::text, '') as "joinedOn"
      from placement_offers o join students st on st.id = o.student_id join sections s on s.id = st.section_id join programs p on p.id = s.program_id join placement_drives d on d.id = o.drive_id join placement_companies c on c.id = d.company_id
      where extract(year from o.offered_on) = ${year} order by p.name, st.roll_no`,
  },
  internships: {
    columns: [['rollNo', 'Roll no'], ['student', 'Student'], ['program', 'Programme'], ['organisation', 'Organisation'], ['role', 'Role'], ['from', 'From'], ['to', 'To'], ['stipend', 'Stipend (₹ a month)'], ['mentor', 'Faculty mentor'], ['credits', 'Credits'], ['score', 'Score'], ['status', 'Status']],
    rows: (year) => sql`
      select st.roll_no as "rollNo", st.full_name as student, p.name as program, i.org_name as organisation, i.title as role, i.starts_on::text as "from", i.ends_on::text as "to", i.stipend_monthly as stipend, coalesce(u.full_name, '') as mentor, i.credits, i.evaluation_score as score, i.status
      from internships i join students st on st.id = i.student_id join sections s on s.id = st.section_id join programs p on p.id = s.program_id left join users u on u.id = i.mentor_user_id
      where extract(year from i.starts_on) = ${year} order by p.name, st.roll_no, i.starts_on`,
  },
  progression: {
    columns: [['rollNo', 'Roll no'], ['student', 'Student'], ['program', 'Graduated in'], ['kind', 'Progressed to'], ['institution', 'Institution or employer'], ['joined', 'Programme joined'], ['exam', 'Exam'], ['examRef', 'Roll no or certificate'], ['venture', 'Venture'], ['verified', 'Verified']],
    rows: (year) => sql`
      select st.roll_no as "rollNo", st.full_name as student, p.name as program, g.kind, g.institution, g.program as joined, g.exam, g.exam_ref as "examRef", g.venture_name as venture, case when g.verified then 'Yes' else 'No' end as verified
      from student_progressions g join students st on st.id = g.student_id join sections s on s.id = st.section_id join programs p on p.id = s.program_id where g.year = ${year} order by g.kind, p.name, st.roll_no`,
  },
  training: {
    columns: [['title', 'Programme'], ['kind', 'Kind'], ['trainer', 'Trainer'], ['sessions', 'Sessions'], ['hours', 'Hours held'], ['attendancePct', 'Attendance %'], ['scorePct', 'Average test score %']],
    rows: (year) => sql`
      select t.title, t.kind, t.trainer,
        (select count(*)::int from placement_training_sessions x where x.training_id = t.id) as sessions,
        (select coalesce(sum(x.hours), 0)::float8 from placement_training_sessions x where x.training_id = t.id) as hours,
        (select round(100.0 * count(*) filter (where a.present) / nullif(count(*), 0), 1)::float8 from placement_training_attendance a join placement_training_sessions x on x.id = a.session_id where x.training_id = t.id) as "attendancePct",
        (select round(avg(100.0 * sc.score / nullif(sc.max_score, 0)), 1)::float8 from placement_training_scores sc where sc.training_id = t.id) as "scorePct"
      from placement_trainings t where extract(year from t.starts_on) = ${year} order by t.starts_on`,
  },
  feedback: {
    columns: [['kind', 'From'], ['responses', 'Responses'], ['c1', 'Criterion 1'], ['c2', 'Criterion 2'], ['c3', 'Criterion 3'], ['c4', 'Criterion 4'], ['c5', 'Criterion 5'], ['overall', 'Overall']],
    rows: (year) => sql`
      select kind, count(*)::int as responses, round(avg(r1), 2)::float8 as c1, round(avg(r2), 2)::float8 as c2, round(avg(r3), 2)::float8 as c3, round(avg(r4), 2)::float8 as c4, round(avg(r5), 2)::float8 as c5, round(avg(overall), 2)::float8 as overall
      from placement_feedback where year = ${year} group by kind order by kind`,
  },
};

@Controller('v1/placements/reports')
export class PlacementReportsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: PlacementsService,
  ) {}

  /** The reports, with their columns (and what each feedback criterion means). */
  @Get()
  @Auth('user', [...PLACEMENT_VIEW_ROLES, 'quality_officer'])
  list() {
    return { reports: Object.entries(REPORTS).map(([id, r]) => ({ id, columns: r.columns.map(([key, header]) => ({ key, header })) })), criteria: FEEDBACK_CRITERIA };
  }

  @Get(':id')
  @Auth('user', [...PLACEMENT_VIEW_ROLES, 'quality_officer'])
  async report(@CurrentPrincipal() p: UserPrincipal, @Param('id') id: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const def = REPORTS[id];
    if (!def) throw new NotFoundException('Unknown report');
    const parsed = Query_.safeParse(q);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Bad filters');
    const { rows, year } = await this.db.withTenant(p.tenantId, async (tx) => {
      // The year defaults to the institution's (IST) calendar year, not the server's.
      const year = parsed.data.year ?? Number((await this.svc.today(tx)).slice(0, 4));
      const raw = (await tx.execute<Record<string, unknown>>(def.rows(year))).rows;
      if (parsed.data.format !== 'json') await auditUser(tx, p, 'placement.report_exported', 'placement_report', undefined, { report: id, year, format: parsed.data.format });
      return { year, rows: def.shape ? def.shape(raw, { rules: await this.svc.rules(tx, p.tenantId), year }) : raw };
    });
    if (parsed.data.format === 'json') return { id, year, columns: def.columns.map(([key, header]) => ({ key, header })), rows };
    const grid = [def.columns.map(([, h]) => h), ...rows.map((r) => def.columns.map(([k]) => (r[k] === null || r[k] === undefined ? '' : typeof r[k] === 'number' ? (r[k] as number) : num(r[k]) !== null && /^-?\d+(\.\d+)?$/.test(String(r[k])) ? Number(r[k]) : String(r[k]))))];
    res.setHeader('content-disposition', `attachment; filename="placements-${id}-${year}.${parsed.data.format}"`);
    if (parsed.data.format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      return toCsv(grid);
    }
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return new StreamableFile(writeXlsx(`Placements ${year}`, grid.map((r) => r.map((c) => (c === '' ? null : c)))));
  }
}
