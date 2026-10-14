import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DbService } from '../db/db.service.js';
import { PAYROLL_ROLES } from './hr.access.js';
import { LeaveService } from './leave.service.js';
import { cadreRatio, sfr } from './hr-master.logic.js';

export const HR_REPORTS = ['staff-strength', 'staff-category', 'faculty-cadre', 'sfr', 'naac-faculty', 'publications', 'attendance-register', 'leave-register', 'leave-balances', 'payroll-register', 'salary-statement', 'pf', 'esi', 'pt', 'pt-return', 'lwf', 'tds', 'bank-transfer', 'form16', 'appraisal-summary', 'fdp-summary', 'attrition'] as const;
export type HrReport = (typeof HR_REPORTS)[number];

type Row = Record<string, string | number | null>;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Indian financial year of a month or date: 2026-05 → 2026 (April 2026 to March 2027). */
export const fyOf = (ym: string) => (Number(ym.slice(5, 7)) >= 4 ? Number(ym.slice(0, 4)) : Number(ym.slice(0, 4)) - 1);

/**
 * HR and payroll reports. Each returns `{ columns, rows }` with stable column keys; the ERP labels them.
 * Filters: `month` (YYYY-MM), `fy` (start year), `year`, `departmentId`.
 */
@Controller('v1/hr/reports')
export class HrReportsController {
  constructor(
    private readonly db: DbService,
    private readonly leave: LeaveService,
  ) {}

  @Get(':kind')
  @Auth('user', PAYROLL_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query() q: Record<string, string | undefined>) {
    if (!HR_REPORTS.includes(kind as HrReport)) throw new BadRequestException('Unknown report');
    const today = new Date().toISOString().slice(0, 10);
    const month = q.month && MONTH.test(q.month) ? q.month : today.slice(0, 7);
    const fy = q.fy && /^\d{4}$/.test(q.fy) ? Number(q.fy) : fyOf(month);
    const year = q.year && /^\d{4}$/.test(q.year) ? Number(q.year) : Number(today.slice(0, 4));
    const dept = q.departmentId && /^[0-9a-f-]{36}$/.test(q.departmentId) ? q.departmentId : null;
    const deptCond = (col: SQL) => (dept ? sql`and ${col} = ${dept}::uuid` : sql``);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const run = async (query: SQL): Promise<Row[]> => (await tx.execute<Row>(query)).rows;
      const slips = (extra: SQL) => sql`
        select s.data->'user'->>'employeeCode' as code, s.data->'user'->>'fullName' as name, s.data->'user'->>'department' as department, ${extra}
        from payslips s join payroll_runs r on r.id = s.run_id left join staff_profiles sp on sp.user_id = s.user_id
        where r.month = ${month} and r.status <> 'reversed' ${deptCond(sql`sp.department_id`)} order by 2`;
      let columns: string[];
      let rows: Row[];
      switch (kind as HrReport) {
        case 'staff-strength':
          columns = ['department', 'designation', 'permanent', 'contract', 'probation', 'visiting', 'female', 'male', 'total'];
          rows = await run(sql`
            select coalesce(d.name, '—') as department, coalesce(g.name, '—') as designation,
              count(*) filter (where sp.employment_type = 'permanent')::int as permanent, count(*) filter (where sp.employment_type = 'contract')::int as contract,
              count(*) filter (where sp.employment_type = 'probation')::int as probation, count(*) filter (where sp.employment_type = 'visiting')::int as visiting,
              count(*) filter (where sp.gender = 'female')::int as female, count(*) filter (where sp.gender = 'male')::int as male, count(*)::int as total
            from staff_profiles sp left join departments d on d.id = sp.department_id left join designations g on g.id = sp.designation_id
            where sp.status <> 'exited' ${deptCond(sql`sp.department_id`)} group by 1, 2 order by 1, 2`);
          break;
        case 'staff-category':
          columns = ['category', 'cadre', 'female', 'male', 'other', 'general', 'ews', 'obc', 'sc', 'st', 'differentlyAbled', 'phd', 'netSet', 'total'];
          rows = await run(sql`
            select case sp.staff_category when 'teaching' then 'Teaching' else 'Non-teaching' end as category, coalesce(initcap(replace(sp.cadre, '_', ' ')), '—') as cadre,
              count(*) filter (where sp.gender = 'female')::int as female, count(*) filter (where sp.gender = 'male')::int as male, count(*) filter (where sp.gender = 'other')::int as other,
              count(*) filter (where sp.social_category = 'general')::int as general, count(*) filter (where sp.social_category = 'ews')::int as ews, count(*) filter (where sp.social_category = 'obc')::int as obc,
              count(*) filter (where sp.social_category = 'sc')::int as sc, count(*) filter (where sp.social_category = 'st')::int as st, count(*) filter (where sp.differently_abled)::int as "differentlyAbled",
              count(*) filter (where sp.phd_status = 'awarded')::int as phd, count(*) filter (where sp.net_set <> 'none')::int as "netSet", count(*)::int as total
            from staff_profiles sp where sp.status <> 'exited' ${deptCond(sql`sp.department_id`)} group by 1, 2 order by 1 desc, 2`);
          break;
        case 'faculty-cadre':
          columns = ['department', 'professor', 'associate', 'assistant', 'others', 'total', 'requiredProfessor', 'requiredAssociate', 'meetsRatio'];
          rows = (
            await run(sql`
            select coalesce(d.name, '—') as department,
              count(*) filter (where coalesce(sp.cadre, g.cadre) = 'professor')::int as professor, count(*) filter (where coalesce(sp.cadre, g.cadre) = 'associate_professor')::int as associate,
              count(*) filter (where coalesce(sp.cadre, g.cadre) = 'assistant_professor')::int as assistant,
              count(*) filter (where coalesce(sp.cadre, g.cadre) is null or coalesce(sp.cadre, g.cadre) not in ('professor', 'associate_professor', 'assistant_professor'))::int as others, count(*)::int as total
            from staff_profiles sp left join departments d on d.id = sp.department_id left join designations g on g.id = sp.designation_id
            where sp.status <> 'exited' and sp.staff_category = 'teaching' ${deptCond(sql`sp.department_id`)} group by 1 order by 1`)
          ).map((r) => {
            const ratio = cadreRatio({ professor: Number(r.professor), associate: Number(r.associate), assistant: Number(r.assistant) });
            return { ...r, requiredProfessor: ratio.required.professor, requiredAssociate: ratio.required.associate, meetsRatio: ratio.meets ? 'Yes' : 'No' };
          });
          break;
        case 'sfr': {
          columns = ['programme', 'students', 'teachers', 'sfr'];
          const prog = await run(sql`
            select pr.name as programme,
              (select count(*)::int from students st join sections sc on sc.id = st.section_id where sc.program_id = pr.id and st.status in ('active', 'enrolled', 'on_leave', 'detained')) as students,
              (select count(distinct ts.teacher_id)::int from timetable_slots ts join sections sc on sc.id = ts.section_id where sc.program_id = pr.id and ts.archived_at is null) as teachers
            from programs pr order by pr.sort_order, pr.name`);
          const [tot] = await run(sql`
            select (select count(*)::int from students where status in ('active', 'enrolled', 'on_leave', 'detained')) as students,
              (select count(*)::int from staff_profiles where status <> 'exited' and staff_category = 'teaching') as teachers`);
          rows = [...prog.map((r) => ({ ...r, sfr: sfr(Number(r.students), Number(r.teachers)) })), { programme: 'Institution', students: tot.students, teachers: tot.teachers, sfr: sfr(Number(tot.students), Number(tot.teachers)) }];
          break;
        }
        case 'naac-faculty':
          columns = ['code', 'name', 'pan', 'gender', 'department', 'designation', 'appointedOn', 'nature', 'highestQualification', 'phd', 'phdYear', 'netSet', 'experienceHere', 'experienceTotal', 'publications', 'stillServing'];
          rows = await run(sql`
            select sp.employee_code as code, u.full_name as name, coalesce(sp.pan, '') as pan, coalesce(sp.gender, '') as gender, coalesce(d.name, '') as department, coalesce(g.name, '') as designation,
              sp.date_of_joining::text as "appointedOn", case sp.post_type when 'sanctioned' then 'Full time (sanctioned post)' when 'self_financing' then 'Full time (self-financing)' else 'Guest / part time' end as nature,
              coalesce((select q.title from staff_qualifications q where q.user_id = sp.user_id and q.kind = 'degree' order by case q.level when 'Post-doctoral' then 1 when 'Ph.D.' then 2 when 'M.Phil.' then 3 when 'PG' then 4 when 'UG' then 5 else 6 end, q.year desc nulls last limit 1), '') as "highestQualification",
              case sp.phd_status when 'awarded' then 'Yes' when 'submitted' then 'Thesis submitted' when 'pursuing' then 'Pursuing' else 'No' end as phd, sp.phd_year as "phdYear",
              case sp.net_set when 'none' then 'No' else upper(replace(sp.net_set, '_', '-')) end as "netSet",
              round(((coalesce(sp.date_of_leaving, current_date) - sp.date_of_joining) / 365.25)::numeric, 1)::float as "experienceHere",
              round((((coalesce(sp.date_of_leaving, current_date) - sp.date_of_joining) + coalesce((select sum(e.to_date - e.from_date + 1) from staff_experience e where e.user_id = sp.user_id and e.kind = 'teaching'), 0)) / 365.25)::numeric, 1)::float as "experienceTotal",
              (select count(*)::int from staff_publications pb where pb.user_id = sp.user_id) as publications,
              case when sp.status = 'exited' then 'No' else 'Yes' end as "stillServing"
            from staff_profiles sp join users u on u.id = sp.user_id left join departments d on d.id = sp.department_id left join designations g on g.id = sp.designation_id
            where sp.staff_category = 'teaching' and sp.date_of_joining is not null and sp.date_of_joining <= ${`${fy + 1}-03-31`}::date
              and (sp.date_of_leaving is null or sp.date_of_leaving >= ${`${fy}-04-01`}::date) ${deptCond(sql`sp.department_id`)} order by 5, 2`);
          break;
        case 'publications':
          columns = ['code', 'name', 'department', 'kind', 'title', 'venue', 'year', 'issnIsbn', 'indexing', 'impactFactor', 'authorRole', 'verified'];
          rows = await run(sql`
            select sp.employee_code as code, u.full_name as name, coalesce(d.name, '') as department, pb.kind, pb.title, pb.venue, pb.year, pb.issn_isbn as "issnIsbn",
              case pb.indexing when 'scopus' then 'Scopus' when 'wos' then 'Web of Science' when 'ugc_care' then 'UGC-CARE' when 'peer_reviewed' then 'Peer reviewed' else 'Not indexed' end as indexing,
              pb.impact_factor::float as "impactFactor", pb.author_role as "authorRole", case when pb.verified_at is null then 'No' else 'Yes' end as verified
            from staff_publications pb join users u on u.id = pb.user_id left join staff_profiles sp on sp.user_id = pb.user_id left join departments d on d.id = sp.department_id
            where pb.year in (${fy}, ${fy + 1}) ${deptCond(sql`sp.department_id`)} order by pb.year desc, 2`);
          break;
        case 'attendance-register':
          columns = ['code', 'name', 'department', 'present', 'halfDay', 'absent', 'onLeave', 'marked', 'lateIns'];
          rows = await run(sql`
            select sp.employee_code as code, u.full_name as name, coalesce(d.name, '') as department,
              count(a.*) filter (where a.status = 'present')::int as present, count(a.*) filter (where a.status = 'half_day')::int as "halfDay",
              count(a.*) filter (where a.status = 'absent')::int as absent, count(a.*) filter (where a.status = 'on_leave')::int as "onLeave", count(a.*)::int as marked,
              count(a.*) filter (where a.check_in_at is not null and (a.check_in_at at time zone 'Asia/Kolkata')::time > ((coalesce(hs.attendance->>'officeStart', '09:00'))::time + make_interval(mins => coalesce((hs.attendance->>'graceMinutes')::int, 0))))::int as "lateIns"
            from staff_profiles sp join users u on u.id = sp.user_id left join departments d on d.id = sp.department_id
            left join hr_settings hs on hs.tenant_id = sp.tenant_id
            left join staff_attendance a on a.user_id = sp.user_id and to_char(a.date, 'YYYY-MM') = ${month}
            where sp.status <> 'exited' ${deptCond(sql`sp.department_id`)} group by 1, 2, 3 order by 2`);
          break;
        case 'leave-register':
          columns = ['code', 'name', 'leaveType', 'fromDate', 'toDate', 'days', 'status', 'decidedBy'];
          rows = await run(sql`
            select sp.employee_code as code, u.full_name as name, t.name as "leaveType", r.from_date::text as "fromDate", r.to_date::text as "toDate", r.days::float as days, r.status, coalesce(db.full_name, '') as "decidedBy"
            from leave_requests r join users u on u.id = r.user_id join leave_types t on t.id = r.leave_type_id left join staff_profiles sp on sp.user_id = r.user_id left join users db on db.id = r.decided_by
            where extract(year from r.from_date) = ${year} ${deptCond(sql`sp.department_id`)} order by r.from_date desc`);
          break;
        case 'leave-balances': {
          columns = ['code', 'name', 'leaveType', 'opening', 'accrued', 'used', 'pending', 'available'];
          const staff = await run(sql`select sp.user_id as id, sp.employee_code as code, u.full_name as name from staff_profiles sp join users u on u.id = sp.user_id where sp.status <> 'exited' ${deptCond(sql`sp.department_id`)} order by 3`);
          rows = [];
          for (const s of staff) for (const b of await this.leave.balances(tx, p.tenantId, String(s.id), year)) if (b.leaveType.paid) rows.push({ code: s.code, name: s.name, leaveType: b.leaveType.name, opening: b.opening, accrued: b.accrued, used: b.used, pending: b.pending, available: b.available });
          break;
        }
        case 'payroll-register':
          columns = ['code', 'name', 'department', 'paidDays', 'grossPaise', 'pfPaise', 'esiPaise', 'ptPaise', 'tdsPaise', 'deductionsPaise', 'netPaise'];
          rows = await run(slips(sql`(s.data->>'paidDays')::float as "paidDays", s.gross_paise as "grossPaise", s.employee_pf_paise as "pfPaise", coalesce((s.data->>'esiPaise')::bigint, 0) as "esiPaise", s.pt_paise as "ptPaise", s.tds_paise as "tdsPaise", s.deductions_paise as "deductionsPaise", s.net_paise as "netPaise"`));
          break;
        case 'salary-statement':
          columns = ['code', 'name', 'department', 'months', 'grossPaise', 'pfPaise', 'ptPaise', 'tdsPaise', 'netPaise'];
          rows = await run(sql`
            select s.data->'user'->>'employeeCode' as code, s.data->'user'->>'fullName' as name, max(s.data->'user'->>'department') as department, count(*)::int as months,
              sum(s.gross_paise)::bigint as "grossPaise", sum(s.employee_pf_paise)::bigint as "pfPaise", sum(s.pt_paise)::bigint as "ptPaise", sum(s.tds_paise)::bigint as "tdsPaise", sum(s.net_paise)::bigint as "netPaise"
            from payslips s join payroll_runs r on r.id = s.run_id left join staff_profiles sp on sp.user_id = s.user_id
            where r.status = 'locked' and r.month >= ${`${fy}-04`} and r.month <= ${`${fy + 1}-03`} ${deptCond(sql`sp.department_id`)} group by 1, 2 order by 2`);
          break;
        case 'pf':
          columns = ['code', 'name', 'uan', 'pfWagePaise', 'pfPaise', 'epfPaise', 'epsPaise'];
          rows = (await run(slips(sql`s.data->>'uan' as uan, coalesce((s.data->>'pfWagePaise')::bigint, 0) as "pfWagePaise", s.employee_pf_paise as "pfPaise", coalesce((s.data->'employer'->>'epfPaise')::bigint, 0) as "epfPaise", coalesce((s.data->'employer'->>'epsPaise')::bigint, 0) as "epsPaise"`))).filter((r) => Number(r.pfPaise) > 0);
          break;
        case 'esi':
          columns = ['code', 'name', 'esiNumber', 'grossPaise', 'esiPaise', 'esiEmployerPaise'];
          rows = (await run(slips(sql`s.data->>'esiNumber' as "esiNumber", s.gross_paise as "grossPaise", coalesce((s.data->>'esiPaise')::bigint, 0) as "esiPaise", coalesce((s.data->'employer'->>'esiPaise')::bigint, 0) as "esiEmployerPaise"`))).filter((r) => Number(r.esiPaise) > 0);
          break;
        case 'pt':
          columns = ['code', 'name', 'department', 'grossPaise', 'ptPaise'];
          rows = await run(slips(sql`s.gross_paise as "grossPaise", s.pt_paise as "ptPaise"`));
          break;
        case 'pt-return': {
          // Karnataka PT return (Form 5): employees and tax by salary slab for the month.
          columns = ['slab', 'ratePaise', 'employees', 'ptPaise'];
          const settings = (await tx.execute<{ pt_slabs: { minGrossPaise: number; amountPaise: number; februaryAmountPaise?: number }[] }>(sql`select pt_slabs from payroll_settings limit 1`)).rows[0]?.pt_slabs ?? [];
          const slabs = [...settings].sort((a, b) => a.minGrossPaise - b.minGrossPaise);
          const gross = await run(sql`select s.gross_paise as gross, s.pt_paise as pt from payslips s join payroll_runs r on r.id = s.run_id left join staff_profiles sp on sp.user_id = s.user_id where r.month = ${month} and r.status in ('approved', 'locked') and r.kind = 'regular' ${deptCond(sql`sp.department_id`)}`);
          const feb = month.slice(5, 7) === '02';
          rows = slabs.map((sl, k) => {
            const top = slabs[k + 1]?.minGrossPaise ?? Infinity;
            const inSlab = gross.filter((g) => Number(g.gross) >= sl.minGrossPaise && Number(g.gross) < top);
            const rupee = (p: number) => (p / 100).toLocaleString('en-IN');
            return { slab: top === Infinity ? `Rs. ${rupee(sl.minGrossPaise)} and above` : `Rs. ${rupee(sl.minGrossPaise)} to Rs. ${rupee(top - 100)}`, ratePaise: feb && sl.februaryAmountPaise !== undefined ? sl.februaryAmountPaise : sl.amountPaise, employees: inSlab.length, ptPaise: inSlab.reduce((n, g) => n + Number(g.pt), 0) };
          });
          break;
        }
        case 'lwf':
          columns = ['code', 'name', 'department', 'lwfPaise', 'lwfEmployerPaise'];
          rows = (await run(slips(sql`coalesce((s.data->>'lwfPaise')::bigint, 0) as "lwfPaise", coalesce((s.data->'employer'->>'lwfPaise')::bigint, 0) as "lwfEmployerPaise"`))).filter((r) => Number(r.lwfPaise) > 0 || Number(r.lwfEmployerPaise) > 0);
          break;
        case 'tds':
          columns = ['code', 'name', 'pan', 'taxableGrossPaise', 'tdsPaise'];
          rows = await run(slips(sql`s.data->>'pan' as pan, s.taxable_gross_paise as "taxableGrossPaise", s.tds_paise as "tdsPaise"`));
          break;
        case 'bank-transfer':
          columns = ['code', 'name', 'bank', 'ifsc', 'account', 'netPaise'];
          rows = await run(slips(sql`coalesce(sp.bank_name, '') as bank, coalesce(sp.bank_ifsc, '') as ifsc, case when sp.bank_account_last4 is null then 'Missing' else 'XXXX' || sp.bank_account_last4 end as account, s.net_paise as "netPaise"`));
          break;
        case 'form16':
          columns = ['code', 'name', 'pan', 'regime', 'months', 'taxableGrossPaise', 'tdsPaise'];
          rows = await run(sql`
            select s.data->'user'->>'employeeCode' as code, s.data->'user'->>'fullName' as name, max(s.data->>'pan') as pan, max(s.data->>'taxRegime') as regime, count(*)::int as months,
              sum(s.taxable_gross_paise)::bigint as "taxableGrossPaise", sum(s.tds_paise)::bigint as "tdsPaise"
            from payslips s join payroll_runs r on r.id = s.run_id left join staff_profiles sp on sp.user_id = s.user_id
            where r.status = 'locked' and r.month >= ${`${fy}-04`} and r.month <= ${`${fy + 1}-03`} ${deptCond(sql`sp.department_id`)} group by 1, 2 order by 2`);
          break;
        case 'appraisal-summary':
          columns = ['period', 'code', 'name', 'department', 'status', 'finalScore', 'grade'];
          rows = await run(sql`
            select c.period, sp.employee_code as code, u.full_name as name, coalesce(d.name, '') as department, a.status, a.final_score::float as "finalScore", coalesce(a.grade, '') as grade
            from appraisals a join appraisal_cycles c on c.id = a.cycle_id join users u on u.id = a.user_id left join staff_profiles sp on sp.user_id = a.user_id left join departments d on d.id = sp.department_id
            where c.id = coalesce(${q.cycleId && /^[0-9a-f-]{36}$/.test(q.cycleId) ? q.cycleId : null}::uuid, (select id from appraisal_cycles order by opens_on desc limit 1)) ${deptCond(sql`sp.department_id`)} order by a.final_score desc nulls last, 3`);
          break;
        case 'fdp-summary':
          columns = ['code', 'name', 'department', 'programmes', 'hours', 'verified'];
          rows = await run(sql`
            select sp.employee_code as code, u.full_name as name, coalesce(d.name, '') as department, count(t.*)::int as programmes, coalesce(sum(t.hours), 0)::float as hours, count(t.*) filter (where t.verified)::int as verified
            from staff_profiles sp join users u on u.id = sp.user_id left join departments d on d.id = sp.department_id
            left join training_records t on t.user_id = sp.user_id and t.starts_on >= ${`${fy}-04-01`}::date and t.starts_on <= ${`${fy + 1}-03-31`}::date
            where sp.status <> 'exited' ${deptCond(sql`sp.department_id`)} group by 1, 2, 3 order by 5 desc, 2`);
          break;
        case 'attrition':
          columns = ['department', 'opening', 'joined', 'left', 'closing', 'attritionPct'];
          rows = (
            await run(sql`
            select coalesce(d.name, '—') as department,
              count(*) filter (where sp.date_of_joining < ${`${fy}-04-01`}::date and (sp.date_of_leaving is null or sp.date_of_leaving >= ${`${fy}-04-01`}::date))::int as opening,
              count(*) filter (where sp.date_of_joining between ${`${fy}-04-01`}::date and ${`${fy + 1}-03-31`}::date)::int as joined,
              count(*) filter (where sp.date_of_leaving between ${`${fy}-04-01`}::date and ${`${fy + 1}-03-31`}::date)::int as "left",
              count(*) filter (where sp.date_of_joining <= ${`${fy + 1}-03-31`}::date and (sp.date_of_leaving is null or sp.date_of_leaving > ${`${fy + 1}-03-31`}::date))::int as closing
            from staff_profiles sp left join departments d on d.id = sp.department_id where true ${deptCond(sql`sp.department_id`)} group by 1 order by 1`)
          ).map((r) => {
            const avg = (Number(r.opening) + Number(r.closing)) / 2;
            return { ...r, attritionPct: avg ? Math.round((Number(r.left) / avg) * 1000) / 10 : 0 };
          });
          break;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.report_viewed', subjectType: 'hr_report', data: { kind, month, fy, year, dept } });
      return { kind, filters: { month, fy, year, departmentId: dept }, columns, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /Paise$/.test(k) ? Number(v) : v]))) };
    });
  }
}
