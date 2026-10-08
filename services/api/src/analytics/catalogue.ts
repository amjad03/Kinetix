import { sql } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { classroomAnalytics, drilldown, institutionKpis, LEVELS, rows, scopeSql, type Cell, type Level, type Metric, type Range, type Row, type Scope } from './queries.js';
import { placementOffersSql, researchOutputsSql } from './sources.js';

export type ColumnKind = 'text' | 'int' | 'percent' | 'money' | 'date';
export interface Column {
  key: string;
  label: string;
  /** `money` values are paise; exports show rupees. */
  kind?: ColumnKind;
}
export interface ReportData {
  columns: Column[];
  rows: Row[];
  summary?: { label: string; value: Cell }[];
}

export interface ParamDef {
  name: 'campusId' | 'programId' | 'sectionId' | 'academicYearId' | 'from' | 'to' | 'by';
  label: string;
  type: 'uuid' | 'date' | 'enum';
  options?: string[];
  required?: boolean;
}

export interface RunCtx {
  scope: Scope;
  range: Range;
  /** The trailing year (or the requested range) for placement and research, which are annual. */
  annual: Range;
  by: Level;
  timezone: string;
  today: string;
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  category: 'institution' | 'academic' | 'finance' | 'people' | 'classroom';
  roles: RoleName[];
  params: ParamDef[];
  run(tx: Tx, ctx: RunCtx): Promise<ReportData>;
}

const MGMT: RoleName[] = ['tenant_admin', 'principal'];
const ACADEMIC: RoleName[] = [...MGMT, 'hod'];
const FINANCE: RoleName[] = [...MGMT, 'accountant'];
const PEOPLE: RoleName[] = [...MGMT, 'hr_manager'];

const SCOPE_PARAMS: ParamDef[] = [
  { name: 'campusId', label: 'Campus', type: 'uuid' },
  { name: 'programId', label: 'Program', type: 'uuid' },
  { name: 'sectionId', label: 'Section', type: 'uuid' },
];
const RANGE_PARAMS: ParamDef[] = [
  { name: 'from', label: 'From', type: 'date' },
  { name: 'to', label: 'To', type: 'date' },
];
const BY_PARAM: ParamDef = { name: 'by', label: 'Group by', type: 'enum', options: [...LEVELS] };

const NAME_COLS: Column[] = [{ key: 'label', label: 'Name' }];
const byColumns = (by: Level): Column[] => (by === 'campus' ? NAME_COLS : [{ key: 'parent', label: by === 'program' ? 'Campus' : 'Program' }, ...NAME_COLS]);

const drill = (metric: Metric, columns: Column[]) => async (tx: Tx, c: RunCtx): Promise<ReportData> => ({ columns: [...byColumns(c.by), ...columns], rows: await drilldown(tx, metric, c.by, c.scope, c.range, c.timezone, c.today) });

export const REPORTS: ReportDef[] = [
  {
    key: 'kpi.summary',
    title: 'Institution KPIs',
    description: 'Enrolment, attendance, results, fees, staff, placement and research on one page.',
    category: 'institution',
    roles: MGMT,
    params: [...SCOPE_PARAMS, ...RANGE_PARAMS],
    async run(tx, c) {
      const k = await institutionKpis(tx, c.scope, c.range, c.annual, c.timezone, c.today);
      const r = (area: string, metric: string, value: Cell, kind: ColumnKind = 'int'): Row => ({ area, metric, value, kind });
      return {
        columns: [{ key: 'area', label: 'Area' }, { key: 'metric', label: 'Measure' }, { key: 'value', label: 'Value' }],
        rows: [
          r('Enrolment', 'Active students', k.enrolment.active), r('Enrolment', 'All students on roll', k.enrolment.total), r('Enrolment', 'Joined in the period', k.enrolment.joinedInRange),
          r('Attendance', 'Attendance %', k.attendance.percent, 'percent'), r('Attendance', 'Marks recorded', k.attendance.marks),
          r('Results', `Pass % (${k.results.session ?? 'no published results'})`, k.results.passPercent, 'percent'), r('Results', 'Average SGPA', k.results.averageSgpa),
          r('Fees', 'Billed (Rs)', k.fees.billedPaise / 100), r('Fees', 'Collected (Rs)', k.fees.collectedPaise / 100), r('Fees', 'Outstanding (Rs)', k.fees.outstandingPaise / 100), r('Fees', 'Overdue (Rs)', k.fees.overduePaise / 100), r('Fees', 'Received in the period (Rs)', k.fees.collectedInRangePaise / 100),
          r('Staff', 'Active staff', k.staff.active), r('Staff', 'Teachers', k.staff.teachers),
          r('Placement', 'Offers', k.placement.offers), r('Placement', 'Students placed', k.placement.students), r('Placement', 'Average package (Rs)', k.placement.averagePackagePaise / 100), r('Placement', 'Highest package (Rs)', k.placement.highestPackagePaise / 100),
          r('Research', 'Outputs', k.research.outputs), r('Research', 'Grants (Rs)', k.research.grantsPaise / 100),
        ].map(({ kind: _k, ...row }) => row),
      };
    },
  },
  {
    key: 'enrolment.summary',
    title: 'Enrolment',
    description: 'Students on roll and new joiners by campus, program or section.',
    category: 'academic',
    roles: ACADEMIC,
    params: [...SCOPE_PARAMS, ...RANGE_PARAMS, BY_PARAM],
    run: drill('enrolment', [{ key: 'active', label: 'Active', kind: 'int' }, { key: 'total', label: 'On roll', kind: 'int' }, { key: 'joined', label: 'Joined in period', kind: 'int' }]),
  },
  {
    key: 'attendance.summary',
    title: 'Attendance',
    description: 'Attendance percentage by campus, program or section for a period.',
    category: 'academic',
    roles: ACADEMIC,
    params: [...SCOPE_PARAMS, ...RANGE_PARAMS, BY_PARAM],
    run: drill('attendance', [{ key: 'marks', label: 'Marks', kind: 'int' }, { key: 'present', label: 'Present or late', kind: 'int' }, { key: 'percent', label: 'Attendance %', kind: 'percent' }]),
  },
  {
    key: 'results.summary',
    title: 'Results',
    description: 'Pass percentage and average SGPA from published results.',
    category: 'academic',
    roles: ACADEMIC,
    params: [...SCOPE_PARAMS, BY_PARAM],
    run: drill('results', [{ key: 'students', label: 'Results', kind: 'int' }, { key: 'passed', label: 'Passed', kind: 'int' }, { key: 'pass_percent', label: 'Pass %', kind: 'percent' }, { key: 'average_sgpa', label: 'Average SGPA' }]),
  },
  {
    key: 'fees.summary',
    title: 'Fees collected and outstanding',
    description: 'Billed, collected, outstanding and overdue fees by campus, program or section.',
    category: 'finance',
    roles: FINANCE,
    params: [...SCOPE_PARAMS, BY_PARAM],
    run: drill('fees', [{ key: 'billed_paise', label: 'Billed', kind: 'money' }, { key: 'collected_paise', label: 'Collected', kind: 'money' }, { key: 'outstanding_paise', label: 'Outstanding', kind: 'money' }, { key: 'overdue_paise', label: 'Overdue', kind: 'money' }]),
  },
  {
    key: 'fees.defaulters',
    title: 'Overdue fees by student',
    description: 'Students with fees past their due date, oldest first.',
    category: 'finance',
    roles: FINANCE,
    params: SCOPE_PARAMS,
    async run(tx, c) {
      const sc = scopeSql(c.scope);
      return {
        columns: [{ key: 'roll_no', label: 'Roll no' }, { key: 'student', label: 'Student' }, { key: 'section', label: 'Class' }, { key: 'title', label: 'Fee' }, { key: 'due_on', label: 'Due on', kind: 'date' }, { key: 'outstanding_paise', label: 'Outstanding', kind: 'money' }],
        rows: await rows(tx, sql`select s.roll_no, s.full_name as student, sec.display_name as section, i.title, to_char(i.due_on, 'YYYY-MM-DD') as due_on, (i.amount_paise - i.paid_paise)::float8 as outstanding_paise
          from fee_invoices i join students s on s.id = i.student_id join sections sec on sec.id = i.section_id join programs pr on pr.id = sec.program_id
          where i.status = 'due' and i.paid_paise < i.amount_paise and i.due_on < ${c.today}::date ${sc} order by i.due_on, sec.display_name, s.roll_no limit 5000`),
      };
    },
  },
  {
    key: 'staff.headcount',
    title: 'Staff headcount',
    description: 'Active staff by department and employment type.',
    category: 'people',
    roles: PEOPLE,
    params: [],
    async run(tx) {
      return {
        columns: [{ key: 'department', label: 'Department' }, { key: 'employment_type', label: 'Employment type' }, { key: 'staff', label: 'Staff', kind: 'int' }],
        rows: await rows(tx, sql`select coalesce(d.name, 'No department') as department, p.employment_type, count(*)::int as staff
          from staff_profiles p left join departments d on d.id = p.department_id where p.status = 'active' group by 1, 2 order by 1, 2`),
      };
    },
  },
  {
    key: 'placement.offers',
    title: 'Placement offers',
    description: 'Offers made to students in the period, with company and package.',
    category: 'institution',
    roles: MGMT,
    params: [...SCOPE_PARAMS, ...RANGE_PARAMS],
    async run(tx, c) {
      const sc = scopeSql(c.scope);
      return {
        columns: [{ key: 'offered_on', label: 'Offered on', kind: 'date' }, { key: 'student', label: 'Student' }, { key: 'section', label: 'Class' }, { key: 'company', label: 'Company' }, { key: 'role', label: 'Role' }, { key: 'package_paise', label: 'Package (yearly)', kind: 'money' }, { key: 'status', label: 'Status' }],
        rows: await rows(tx, sql`select to_char(p.offered_on, 'YYYY-MM-DD') as offered_on, s.full_name as student, sec.display_name as section, p.company, p.role, p.package_paise::float8 as package_paise, p.status
          from ${placementOffersSql} join students s on s.id = p.student_id join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id
          where p.offered_on between ${c.annual.from}::date and ${c.annual.to}::date ${sc} order by p.offered_on desc, p.company`),
      };
    },
  },
  {
    key: 'research.outputs',
    title: 'Research outputs',
    description: 'Papers, books, patents, projects and conference presentations in the period.',
    category: 'people',
    roles: PEOPLE,
    params: RANGE_PARAMS,
    async run(tx, c) {
      return {
        columns: [{ key: 'published_on', label: 'Date', kind: 'date' }, { key: 'kind', label: 'Kind' }, { key: 'title', label: 'Title' }, { key: 'venue', label: 'Venue' }, { key: 'author', label: 'Faculty' }, { key: 'grant_paise', label: 'Grant', kind: 'money' }],
        rows: await rows(tx, sql`select to_char(r.published_on, 'YYYY-MM-DD') as published_on, r.kind, r.title, r.venue, coalesce(u.full_name, '') as author, r.grant_paise::float8 as grant_paise
          from ${researchOutputsSql} left join users u on u.id = r.staff_user_id
          where r.published_on between ${c.annual.from}::date and ${c.annual.to}::date order by r.published_on desc`),
      };
    },
  },
  {
    key: 'classroom.usage',
    title: 'Classroom usage',
    description: 'Board sessions, hours taught and teachers per class.',
    category: 'classroom',
    roles: ACADEMIC,
    params: [...SCOPE_PARAMS, ...RANGE_PARAMS],
    async run(tx, c) {
      const a = await classroomAnalytics(tx, c.scope, c.range, c.timezone, c.today);
      return {
        columns: [{ key: 'parent', label: 'Program' }, { key: 'label', label: 'Class' }, { key: 'sessions', label: 'Sessions', kind: 'int' }, { key: 'hours', label: 'Hours' }, { key: 'teachers', label: 'Teachers', kind: 'int' }],
        rows: a.bySection,
        summary: [{ label: 'Sessions', value: a.sessions.total }, { label: 'Hours', value: a.sessions.hours }, { label: 'Teachers', value: a.sessions.teachers }, { label: 'Boards used', value: a.sessions.boards }],
      };
    },
  },
  {
    key: 'classroom.tools',
    title: 'Classroom tool usage',
    description: 'How often polls, whiteboards, recordings and KINETIX AI were used.',
    category: 'classroom',
    roles: ACADEMIC,
    params: [...SCOPE_PARAMS, ...RANGE_PARAMS],
    async run(tx, c) {
      const a = await classroomAnalytics(tx, c.scope, c.range, c.timezone, c.today);
      return { columns: [{ key: 'label', label: 'Tool' }, { key: 'uses', label: 'Uses', kind: 'int' }], rows: [...a.tools, ...a.aiTasks.map((t) => ({ tool: `ai.${t.task}`, label: `KINETIX AI: ${t.task}`, uses: t.uses }))] };
    },
  },
  {
    key: 'classroom.syllabus_coverage',
    title: 'Syllabus coverage',
    description: 'Topics taught on the board against the syllabus of each class.',
    category: 'classroom',
    roles: ACADEMIC,
    params: SCOPE_PARAMS,
    run: async (tx, c) => ({ columns: [{ key: 'parent', label: 'Program' }, { key: 'label', label: 'Class' }, { key: 'topics', label: 'Topics in syllabus', kind: 'int' }, { key: 'covered', label: 'Covered', kind: 'int' }, { key: 'percent', label: 'Coverage %', kind: 'percent' }], rows: await drilldown(tx, 'coverage', 'section', c.scope, c.range, c.timezone, c.today) }),
  },
];

export const reportByKey = (key: string): ReportDef | undefined => REPORTS.find((r) => r.key === key);
export const reportsFor = (roles: RoleName[]): ReportDef[] => REPORTS.filter((r) => r.roles.some((x) => roles.includes(x)));

/** The cell as an export shows it: money in rupees, percentages with a sign-less one decimal. */
export function exportCell(col: Column, v: Cell): string | number {
  if (v === null || v === undefined) return '';
  if (col.kind === 'money' && typeof v === 'number') return (v / 100).toFixed(2);
  return v;
}
