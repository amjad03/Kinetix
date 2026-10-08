import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import type { Column, ReportData } from './catalogue.js';
import { rows as sqlRows } from './queries.js';

/**
 * The custom report builder: a saved definition (columns, filters, group-by with count / sum / avg,
 * sort) over one dataset from a fixed catalogue. Every column and table comes from the catalogue
 * below, never from the request: the request only picks keys, and values are bound parameters.
 * Rows are tenant-isolated twice over (row-level security and an explicit tenant predicate), and
 * a dataset is limited to the roles listed, with teachers further limited to the classes they teach.
 */

export type FieldType = 'text' | 'int' | 'number' | 'money' | 'date' | 'bool';
export interface Field {
  key: string;
  label: string;
  type: FieldType;
  /** A SQL expression over the dataset's tables. Only ever written here. */
  expr: string;
}
export interface Dataset {
  key: string;
  label: string;
  description: string;
  roles: RoleName[];
  from: string;
  /** The alias of the table whose `tenant_id` is checked. */
  base: string;
  /** Joined with `sec` (sections): a teacher sees only the classes they teach. */
  classScoped: boolean;
  fields: Field[];
}

const MGMT: RoleName[] = ['tenant_admin', 'principal'];
const CLASS_FROM = 'join sections sec on sec.id = %SEC% join programs pr on pr.id = sec.program_id';
const f = (key: string, label: string, type: FieldType, expr: string): Field => ({ key, label, type, expr });
const studentFields = [f('student', 'Student', 'text', 's.full_name'), f('roll_no', 'Roll no', 'text', 's.roll_no'), f('class', 'Class', 'text', 'sec.display_name'), f('program', 'Program', 'text', 'pr.name')];

export const DATASETS: Dataset[] = [
  {
    key: 'students',
    label: 'Students',
    description: 'One row per student: class, program and status.',
    roles: [...MGMT, 'hod', 'teacher'],
    from: `students s ${CLASS_FROM.replace('%SEC%', 's.section_id')}`,
    base: 's',
    classScoped: true,
    fields: [...studentFields, f('status', 'Status', 'text', 's.status'), f('enrolled_on', 'Enrolled on', 'date', 's.enrolled_on'), f('term', 'Term', 'int', 'sec.term')],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'One row per attendance mark. "Present" is 1 for present or late, so its average is the attendance rate.',
    roles: [...MGMT, 'hod', 'teacher'],
    from: `attendance_records a join students s on s.id = a.student_id ${CLASS_FROM.replace('%SEC%', 'a.section_id')}`,
    base: 'a',
    classScoped: true,
    fields: [
      ...studentFields,
      f('date', 'Date', 'date', 'a.date'),
      f('month', 'Month', 'text', "to_char(a.date, 'YYYY-MM')"),
      f('status', 'Status', 'text', 'a.status::text'),
      f('present', 'Present', 'int', "(case when a.status in ('present', 'late') then 1 else 0 end)"),
    ],
  },
  {
    key: 'marks',
    label: 'Marks',
    description: 'One row per student and assessment, using the moderated mark when there is one.',
    roles: [...MGMT, 'hod', 'teacher'],
    from: `marks m join assessments asm on asm.id = m.assessment_id join students s on s.id = m.student_id ${CLASS_FROM.replace('%SEC%', 'asm.section_id')} join subjects sub on sub.id = asm.subject_id`,
    base: 'm',
    classScoped: true,
    fields: [
      ...studentFields,
      f('subject', 'Subject', 'text', 'sub.name'),
      f('assessment', 'Assessment', 'text', 'asm.title'),
      f('kind', 'Kind', 'text', 'asm.kind::text'),
      f('held_on', 'Held on', 'date', 'asm.held_on'),
      f('marks', 'Marks', 'number', 'coalesce(m.moderated_marks, m.marks)'),
      f('max_marks', 'Maximum marks', 'number', 'asm.max_marks'),
      f('percent', 'Percent', 'number', 'round(coalesce(m.moderated_marks, m.marks) / nullif(asm.max_marks, 0) * 100, 1)'),
      f('absent', 'Absent', 'bool', 'm.absent'),
    ],
  },
  {
    key: 'fees',
    label: 'Fee invoices',
    description: 'One row per fee invoice. Amounts are in rupees in filters and exports.',
    roles: [...MGMT, 'accountant'],
    from: `fee_invoices i join students s on s.id = i.student_id ${CLASS_FROM.replace('%SEC%', 'i.section_id')}`,
    base: 'i',
    classScoped: false,
    fields: [
      ...studentFields,
      f('title', 'Fee', 'text', 'i.title'),
      f('status', 'Status', 'text', 'i.status::text'),
      f('due_on', 'Due on', 'date', 'i.due_on'),
      f('due_month', 'Due month', 'text', "to_char(i.due_on, 'YYYY-MM')"),
      f('amount', 'Amount', 'money', 'i.amount_paise'),
      f('paid', 'Paid', 'money', 'i.paid_paise'),
      f('balance', 'Balance', 'money', '(i.amount_paise - i.paid_paise)'),
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'One row per staff member. Bank, tax and identity details are not available.',
    roles: [...MGMT, 'hr_manager'],
    from: 'staff_profiles sp join users u on u.id = sp.user_id left join departments d on d.id = sp.department_id left join designations dg on dg.id = sp.designation_id',
    base: 'sp',
    classScoped: false,
    fields: [
      f('employee_code', 'Employee code', 'text', 'sp.employee_code'),
      f('name', 'Name', 'text', 'u.full_name'),
      f('department', 'Department', 'text', "coalesce(d.name, '')"),
      f('designation', 'Designation', 'text', "coalesce(dg.name, '')"),
      f('employment_type', 'Employment type', 'text', 'sp.employment_type'),
      f('status', 'Status', 'text', 'sp.status'),
      f('joined_on', 'Joined on', 'date', 'sp.date_of_joining'),
      f('gender', 'Gender', 'text', "coalesce(sp.gender, '')"),
    ],
  },
];

export const datasetByKey = (key: string): Dataset | undefined => DATASETS.find((d) => d.key === key);
export const datasetsFor = (roles: RoleName[]): Dataset[] => DATASETS.filter((d) => d.roles.some((r) => roles.includes(r)));
export const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null'] as const;
export const AGGREGATES = ['count', 'sum', 'avg', 'min', 'max'] as const;

const Key = z.string().regex(/^[a-z_]{1,40}$/);
const Scalar = z.union([z.string().max(200), z.number(), z.boolean()]);
export const DefinitionSchema = z.object({
  /** Detail mode: the columns to show (all when empty). Ignored when grouping or aggregating. */
  columns: z.array(Key).max(30).default([]),
  filters: z.array(z.object({ field: Key, op: z.enum(OPERATORS), value: z.union([Scalar, z.array(Scalar).max(100)]).optional() })).max(20).default([]),
  groupBy: z.array(Key).max(5).default([]),
  aggregates: z.array(z.object({ fn: z.enum(AGGREGATES), field: Key.optional() })).max(10).default([]),
  sort: z.array(z.object({ field: Key, dir: z.enum(['asc', 'desc']).default('asc') })).max(5).default([]),
  limit: z.number().int().min(1).max(5000).default(1000),
});
export type Definition = z.infer<typeof DefinitionSchema>;

const NUMERIC: FieldType[] = ['int', 'number', 'money'];
const fail = (m: string): never => {
  throw new BadRequestException(m);
};

/** Output columns of a definition, in order; throws 400 for anything not in the catalogue. */
export function planOutputs(ds: Dataset, d: Definition): { key: string; label: string; type: FieldType; expr: string; group?: boolean }[] {
  const field = (k: string) => ds.fields.find((x) => x.key === k) ?? fail(`"${k}" is not a column of ${ds.label}`);
  for (const x of d.filters) field(x.field);
  if (d.groupBy.length === 0 && d.aggregates.length === 0) {
    const cols = d.columns.length ? d.columns : ds.fields.map((x) => x.key);
    if (new Set(cols).size !== cols.length) fail('A column is listed twice');
    return cols.map((k) => ({ ...field(k) }));
  }
  const out: { key: string; label: string; type: FieldType; expr: string; group?: boolean }[] = d.groupBy.map((k) => ({ ...field(k), group: true }));
  if (new Set(d.groupBy).size !== d.groupBy.length) fail('A group-by column is listed twice');
  const aggs = d.aggregates.length ? d.aggregates : [{ fn: 'count' as const, field: undefined }];
  for (const a of aggs) {
    if (a.fn === 'count') {
      if (a.field) field(a.field);
      out.push({ key: a.field ? `count_${a.field}` : 'count', label: a.field ? `Count of ${field(a.field).label}` : 'Count', type: 'int', expr: a.field ? `count(${field(a.field).expr})` : 'count(*)' });
      continue;
    }
    if (!a.field) fail(`${a.fn} needs a column`);
    const x = field(a.field!);
    if ((a.fn === 'sum' || a.fn === 'avg') && !NUMERIC.includes(x.type)) fail(`${a.fn} works on numbers, and "${x.label}" is not one`);
    if ((a.fn === 'min' || a.fn === 'max') && x.type === 'bool') fail(`${a.fn} does not work on yes/no columns`);
    const type: FieldType = a.fn === 'avg' && x.type === 'int' ? 'number' : x.type;
    out.push({ key: `${a.fn}_${x.key}`, label: `${a.fn[0].toUpperCase()}${a.fn.slice(1)} of ${x.label}`, type, expr: a.fn === 'avg' ? `round(avg(${x.expr}), 2)` : `${a.fn}(${x.expr})` });
  }
  const keys = out.map((o) => o.key);
  if (new Set(keys).size !== keys.length) fail('An aggregate is listed twice');
  return out;
}

function scalar(x: Field, v: unknown): string | number | boolean {
  if (x.type === 'bool') {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 'false') return v === 'true';
    return fail(`"${x.label}" is yes or no`);
  }
  if (x.type === 'date') {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(`"${x.label}" needs a date like 2026-10-15`);
    return v;
  }
  if (NUMERIC.includes(x.type)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return fail(`"${x.label}" needs a number`);
    return x.type === 'money' ? Math.round(n * 100) : n;
  }
  return String(v);
}

function condition(x: Field, op: (typeof OPERATORS)[number], value: unknown): SQL {
  const e = sql.raw(`(${x.expr})`);
  if (op === 'is_null') return sql`${e} is null`;
  if (op === 'not_null') return sql`${e} is not null`;
  if (value === undefined) return fail(`"${x.label}" needs a value`);
  if (op === 'in') {
    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0) return fail('The list of values is empty');
    return sql`${e} in (${sql.join(list.map((v) => sql`${scalar(x, v)}`), sql`, `)})`;
  }
  if (Array.isArray(value)) return fail(`"${op}" takes one value`);
  if (op === 'contains') return sql`${e}::text ilike ${`%${String(value).replace(/[\\%_]/g, '\\$&')}%`}`;
  const v = scalar(x, value);
  if (x.type === 'bool' && op !== 'eq' && op !== 'neq') return fail('Yes/no columns can only be compared for equality');
  const cmp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
  return x.type === 'date' ? sql`${e} ${sql.raw(cmp)} ${v}::date` : sql`${e} ${sql.raw(cmp)} ${v}`;
}

export interface Caller {
  tenantId: string;
  userId: string;
  roles: RoleName[];
}

export function assertMayUse(ds: Dataset, roles: RoleName[]): void {
  if (!ds.roles.some((r) => roles.includes(r))) throw new ForbiddenException('Insufficient role for this dataset');
}

/** Runs a definition as `who`: their role must allow the dataset; a teacher sees only the classes they teach. */
export async function runCustomReport(tx: Tx, who: Caller, ds: Dataset, def: Definition): Promise<ReportData & { truncated: boolean }> {
  assertMayUse(ds, who.roles);
  const outs = planOutputs(ds, def);
  const aggregate = outs.some((o) => o.group) || def.aggregates.length > 0 || def.groupBy.length > 0;
  const wheres: SQL[] = [sql`${sql.raw(`${ds.base}.tenant_id`)} = ${who.tenantId}::uuid`];
  for (const c of def.filters) wheres.push(condition(ds.fields.find((x) => x.key === c.field)!, c.op, c.value));
  const wide = who.roles.some((r) => MGMT.includes(r)) || (ds.key === 'fees' && who.roles.includes('accountant')) || (ds.key === 'staff' && who.roles.includes('hr_manager')) || who.roles.includes('hod');
  if (ds.classScoped && !wide) wheres.push(sql`sec.id in (select section_id from timetable_slots where teacher_id = ${who.userId}::uuid)`);

  const select = sql.join(outs.map((o) => sql`${sql.raw(o.type === 'date' ? `(${o.expr})::text` : o.expr)} as ${sql.identifier(o.key)}`), sql`, `);
  const keys = new Set(outs.map((o) => o.key));
  const sorts = def.sort.map((s) => (keys.has(s.field) ? sql`${sql.identifier(s.field)} ${sql.raw(s.dir)} nulls last` : fail(`Cannot sort by "${s.field}": it is not in the result`)));
  if (sorts.length === 0) sorts.push(sql`${sql.identifier(outs[0].key)} asc nulls last`);
  const groupBy = aggregate && def.groupBy.length ? sql` group by ${sql.join(outs.filter((o) => o.group).map((o) => sql.raw(`(${o.expr})`)), sql`, `)}` : sql``;
  const q = sql`select ${select} from ${sql.raw(ds.from)} where ${sql.join(wheres, sql` and `)}${groupBy} order by ${sql.join(sorts, sql`, `)} limit ${def.limit}`;

  const raw = await sqlRows<Record<string, unknown>>(tx, q);
  const columns: Column[] = outs.map((o) => ({ key: o.key, label: o.label, kind: o.type === 'money' ? 'money' : o.type === 'int' ? 'int' : o.type === 'date' ? 'date' : 'text' }));
  const rows = raw.map((r) => {
    const row: Record<string, string | number | null> = {};
    for (const o of outs) {
      const v = r[o.key];
      row[o.key] = v === null || v === undefined ? null : NUMERIC.includes(o.type) ? Number(v) : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
    }
    return row;
  });
  return { columns, rows, truncated: raw.length >= def.limit };
}
