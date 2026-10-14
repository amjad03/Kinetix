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
import { PLACEMENT_VIEW_ROLES } from './placements.access.js';

/** The year a student graduates, from their class (semesters two to a year, school grades one). */
const BATCH = sql`(extract(year from ay.ends_on)::int + case when p.level = 'k12' then p.term_count - s.term else floor((p.term_count - s.term) / 2.0)::int end)`;
const Query_ = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), format: z.enum(['json', 'csv', 'xlsx']).default('json') });

type Col = [key: string, header: string];
interface Report {
  columns: Col[];
  rows: (year: number) => SQL;
  /** Rows computed in code (medians) from the query's rows. */
  shape?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Placement reports for NIRF, NAAC (criterion 5.2) and NBA, for a year (a graduating batch, or offers made in the
 * calendar year): placement percentage by programme, the NIRF graduation outcome table with median salary,
 * company-wise results, the offer list, the internship register, progression to higher studies and ventures,
 * training, and employer and alumni feedback. Each as JSON, CSV or Excel.
 */
const REPORTS: Record<string, Report> = {
  branch: {
    columns: [['program', 'Programme'], ['students', 'Graduating students'], ['optedOut', 'Opted out'], ['registered', 'Registered for drives'], ['placed', 'Placed'], ['placementPct', 'Placement %'], ['higherStudies', 'Higher studies'], ['medianCtc', 'Median CTC (LPA)'], ['highestCtc', 'Highest CTC (LPA)']],
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
        return { ...rest, placementPct: base > 0 ? Math.round((Number(r.placed) / base) * 1000) / 10 : 0, medianCtc: s.median, highestCtc: s.highest };
      }),
  },
  nirf: {
    columns: [['program', 'Programme'], ['graduating', 'Graduating in minimum time'], ['placed', 'Placed'], ['medianSalary', 'Median salary (₹ a year)'], ['higherStudies', 'Selected for higher studies'], ['entrepreneurs', 'Entrepreneurs']],
    rows: (year) => sql`
      with batch as (select st.id, p.name as program from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id join academic_years ay on ay.id = s.academic_year_id where st.status <> 'dropped' and ${BATCH} = ${year})
      select b.program, count(*)::int as graduating,
        count(*) filter (where exists (select 1 from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement'))::int as placed,
        count(*) filter (where exists (select 1 from student_progressions g where g.student_id = b.id and g.kind = 'higher_studies'))::int as "higherStudies",
        count(*) filter (where exists (select 1 from student_progressions g where g.student_id = b.id and g.kind = 'entrepreneurship'))::int as entrepreneurs,
        array_remove(array_agg((select max(o.ctc_lpa) from placement_offers o join placement_drives d on d.id = o.drive_id where o.student_id = b.id and o.status = 'accepted' and d.kind = 'placement')), null)::float8[] as ctcs
      from batch b group by b.program order by b.program`,
    shape: (rows) =>
      rows.map((r) => {
        const s = ctcSummary(((r.ctcs as unknown[]) ?? []).map(Number));
        const { ctcs: _c, ...rest } = r;
        return { ...rest, medianSalary: s.median === null ? null : Math.round(s.median * 100_000) };
      }),
  },
  companies: {
    columns: [['company', 'Company'], ['sector', 'Sector'], ['drives', 'Drives'], ['registered', 'Registered'], ['offers', 'Offers'], ['accepted', 'Accepted'], ['joined', 'Joined'], ['highestCtc', 'Highest CTC (LPA)'], ['medianCtc', 'Median CTC (LPA)']],
    rows: (year) => sql`
      select c.name as company, c.sector, count(distinct d.id)::int as drives,
        (select count(*)::int from drive_registrations r join placement_drives dd on dd.id = r.drive_id where dd.company_id = c.id and r.status <> 'withdrawn' and extract(year from r.created_at) = ${year}) as registered,
        count(o.id)::int as offers, count(o.id) filter (where o.status = 'accepted')::int as accepted, count(o.id) filter (where o.joining_status = 'joined')::int as joined,
        array_remove(array_agg(o.ctc_lpa) filter (where o.status = 'accepted'), null)::float8[] as ctcs
      from placement_companies c join placement_drives d on d.company_id = c.id left join placement_offers o on o.drive_id = d.id and extract(year from o.offered_on) = ${year}
      where extract(year from coalesce(d.drive_date, d.created_at::date)) = ${year} or o.id is not null
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
  constructor(private readonly db: DbService) {}

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
    const year = parsed.data.year ?? new Date().getFullYear();
    const rows = await this.db.withTenant(p.tenantId, async (tx) => {
      const raw = (await tx.execute<Record<string, unknown>>(def.rows(year))).rows;
      if (parsed.data.format !== 'json') await auditUser(tx, p, 'placement.report_exported', 'placement_report', undefined, { report: id, year, format: parsed.data.format });
      return def.shape ? def.shape(raw) : raw;
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
