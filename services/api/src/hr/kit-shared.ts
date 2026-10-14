import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { and, asc, eq, getTableColumns, ne, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { departments, staffProfiles, users } from '../db/schema.js';
import { fail, outcome } from '../import/row-helpers.js';
import type { ExportColumn, FieldOption, ImportColumn, KitCtx, ListFilter, RecordEntity, RecordField, Row } from '../records/entity.js';
import { uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { HR_ROLES, isHr, STAFF_ROLES } from './hr.access.js';

/** Pieces the HR record kit entities share: staff pickers, filters, rupee fields and self-service lists. */

/** Staff with an HR record, newest leavers last: "Asha Rao (EMP/0004)". HR sees everyone; others only themselves. */
export async function staffOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: users.id, name: users.fullName, code: staffProfiles.employeeCode, status: staffProfiles.status })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(isHr(ctx.p) || ctx.p.roles.includes('accountant') ? undefined : eq(users.id, ctx.p.userId))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: `${r.name} (${r.code})`, group: r.status === 'exited' ? 'Left' : undefined }));
}

export async function departmentChoices(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.sortOrder), asc(departments.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** The staff member a row belongs to. */
export const staffFilter = (col: AnyColumn): ListFilter => ({ label: 'Staff member', options: staffOptions, where: (v) => uuidEq(col, v) });

/** The department of the staff member a row belongs to (through their HR record). */
export const staffDepartmentFilter = (col: AnyColumn): ListFilter => ({
  label: 'Department',
  options: departmentChoices,
  where: (v) => (z.uuid().safeParse(v).success ? sql`exists (select 1 from staff_profiles sp where sp.user_id = ${col} and sp.department_id = ${v}::uuid)` : undefined),
});

/** One of fixed values; anything else is ignored. */
export const choiceFilter = (label: string, options: FieldOption[], col: AnyColumn): ListFilter => ({ label, options, where: (v) => (options.some((o) => o.value === v) ? eq(col, v) : undefined) });

/** HR (and payroll staff when `payroll`) see every row; anyone else only their own. */
export const ownRows =
  (col: AnyColumn, alsoSee: string[] = []) =>
  (ctx: KitCtx): SQL | undefined =>
    isHr(ctx.p) || ctx.p.roles.some((r) => alsoSee.includes(r)) ? undefined : eq(col, ctx.p.userId);

/** "Asha Rao (EMP/0004)" in list selects; pair with a join on users and staff_profiles. */
export const personName = sql<string>`${users.fullName}`;

/** Options from a word list: value → English label. */
export const opts = (pairs: [string, string][]): FieldOption[] => pairs.map(([value, label]) => ({ value, label }));
export const labelOf = (o: FieldOption[], v: unknown) => o.find((x) => x.value === v)?.label ?? (v === null || v === undefined ? '' : String(v));

/** Rupees typed in a form, kept as paise. */
export const Rupees = z.union([z.coerce.number().min(0).max(1_000_000_000), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : Math.round(v * 100)));
export const rupeesOf = (col: AnyColumn) => sql<number | null>`(${col} / 100.0)::float8`;

export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
export const Year = z.coerce.number().int().min(1950).max(2100);
export const OptionalYear = z.union([z.coerce.number().int().min(1950).max(2100), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : v));
export const OptionalNumber = (min: number, max: number) => z.union([z.coerce.number().min(min).max(max), z.literal(''), z.null()]).transform((v) => (v === '' || v === null ? null : v));

/** The table property of a column (for update().set()). */
export function propOf(table: PgTable, column: AnyPgColumn): string {
  const hit = Object.entries(getTableColumns(table)).find(([, c]) => c === column);
  if (!hit) throw new Error('A field column is not on its table');
  return hit[0];
}

/** A field of a self-service list: its column plus how a form value is stored (rupees → paise). */
export interface ChildField extends Omit<RecordField, 'column' | 'apply'> {
  column: AnyPgColumn;
  /** Import header (defaults to the label); leave out to keep the field out of the import. */
  importHelp?: string;
  importExample?: string;
  noImport?: boolean;
}

interface ChildSpec {
  key: string;
  subjectType: string;
  table: PgTable & { id: AnyPgColumn; userId: AnyPgColumn; verifiedAt: AnyPgColumn; verifiedBy: AnyPgColumn; createdAt: AnyPgColumn };
  /** Columns of the list besides the person (id, user and verification are added). */
  select: Record<string, AnyColumn | SQL>;
  label: (r: Row) => string;
  search: (AnyColumn | SQL)[];
  filters?: Record<string, ListFilter>;
  sorts: Record<string, AnyColumn | SQL>;
  defaultSort: { id: string; dir: 'asc' | 'desc' };
  fields: Record<string, ChildField>;
  columns: ExportColumn[];
  /** Checks a new or changed record (dates in order …); throw a 400 to refuse. */
  check?: (values: Record<string, unknown>) => void;
}

/**
 * A list that belongs to staff members (qualifications, experience, publications, documents): HR keeps everyone's;
 * a member of staff keeps their own, and changing a verified entry sends it back for verification. HR verifies
 * (also in bulk) and imports by employee code.
 */
export function staffChildEntity(s: ChildSpec): RecordEntity {
  const t = s.table;
  const props = Object.fromEntries(Object.entries(s.fields).map(([k, f]) => [k, propOf(t, f.column)]));
  const unverify = (ctx: KitCtx) => (isHr(ctx.p) ? {} : { verifiedAt: null, verifiedBy: null });
  const fields: Record<string, RecordField> = {
    userId: { label: 'Staff member', type: 'select', schema: z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null), options: staffOptions, edit: false, help: 'Leave empty for your own record' },
  };
  for (const [k, f] of Object.entries(s.fields)) {
    const { column: _c, importHelp: _h, importExample: _e, noImport: _n, ...rest } = f;
    fields[k] = {
      ...rest,
      apply: async (ctx, id, v) => {
        await ctx.tx.update(t).set({ [props[k]]: v, ...unverify(ctx) }).where(eq(t.id, id));
      },
    };
  }
  const importCols: ImportColumn[] = [
    { key: 'employee_code', header: 'Employee code', required: true, help: 'The staff member; rows are added to their record', example: 'EMP/0001' },
    ...Object.entries(s.fields)
      .filter(([, f]) => !f.noImport)
      .map(([k, f]) => ({
        key: k,
        header: f.label,
        required: !!f.required,
        help: f.importHelp ?? f.help,
        example: f.importExample,
        options: Array.isArray(f.options) ? f.options.map((o) => o.value) : undefined,
      })),
  ];
  return {
    key: s.key,
    module: 'hr',
    table: t,
    subjectType: s.subjectType,
    roles: { read: [...STAFF_ROLES], write: [...STAFF_ROLES] },
    label: s.label,
    list: {
      select: {
        id: t.id,
        userId: t.userId,
        staffName: users.fullName,
        employeeCode: staffProfiles.employeeCode,
        departmentName: departments.name,
        ...s.select,
        verifiedAt: t.verifiedAt,
        verified: sql<boolean>`(${t.verifiedAt} is not null)`,
        createdAt: t.createdAt,
      },
      joins: (q) => q.innerJoin(users, eq(users.id, t.userId)).leftJoin(staffProfiles, eq(staffProfiles.userId, t.userId)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)),
      search: [users.fullName, staffProfiles.employeeCode, ...s.search],
      scope: ownRows(t.userId),
      filters: {
        user: staffFilter(t.userId),
        department: staffDepartmentFilter(t.userId),
        verified: { label: 'Verified', options: opts([['yes', 'Verified'], ['no', 'Not verified']]), where: (v) => (v === 'yes' ? sql`${t.verifiedAt} is not null` : v === 'no' ? sql`${t.verifiedAt} is null` : undefined) },
        ...s.filters,
      },
      sorts: { staff: users.fullName, created: t.createdAt, ...s.sorts },
      defaultSort: s.defaultSort,
    },
    fields,
    create: async (ctx, v) => {
      const userId = (isHr(ctx.p) && (v.userId as string | null)) || ctx.p.userId;
      if (userId !== ctx.p.userId && !isHr(ctx.p)) throw new ForbiddenException('You can add to your own record only');
      const [prof] = await ctx.tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
      if (!prof) throw new BadRequestException('Create the staff record first');
      s.check?.(v);
      const insert: Record<string, unknown> = { tenantId: ctx.p.tenantId, userId };
      for (const [k, p] of Object.entries(props)) if (v[k] !== undefined) insert[p] = v[k];
      if (isHr(ctx.p)) Object.assign(insert, { verifiedAt: new Date(), verifiedBy: ctx.p.userId });
      const [row] = (await ctx.tx.insert(t).values(insert as never).returning({ id: t.id })) as { id: string }[];
      return row.id;
    },
    duplicate: (ctx) => ({ verified_at: null, verified_by: null, created_at: new Date(), ...(isHr(ctx.p) ? {} : { user_id: ctx.p.userId }) }),
    remove: {
      guard: async (ctx, id) => {
        if (isHr(ctx.p)) return null;
        const [r] = await ctx.tx.select({ v: t.verifiedAt }).from(t).where(eq(t.id, id));
        return r?.v ? 'A verified entry can be removed only by HR' : null;
      },
    },
    actions: {
      verify: {
        label: 'Mark verified',
        roles: HR_ROLES,
        apply: async (ctx, id) => {
          const [r] = await ctx.tx.select({ v: t.verifiedAt, userId: t.userId }).from(t).where(eq(t.id, id));
          if (r?.v) return 'Already verified';
          if (r?.userId === ctx.p.userId) throw new ForbiddenException('Someone else must verify your own entries');
          await ctx.tx.update(t).set({ verifiedAt: new Date(), verifiedBy: ctx.p.userId } as never).where(eq(t.id, id));
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${s.subjectType}.verified`, subjectType: s.subjectType, subjectId: id });
        },
      },
    },
    columns: [{ key: 'staffName', header: 'Staff member' }, { key: 'employeeCode', header: 'Employee code' }, ...s.columns, { key: 'verified', header: 'Verified', value: (r) => (r.verified ? 'Yes' : 'No') }],
    import: {
      columns: importCols,
      key: [],
      exists: async () => false,
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          if (!isHr(ctx.p)) fail('Only HR can import');
          const code = r.get('employee_code');
          const [who] = await tx.select({ id: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.employeeCode, code));
          if (!who) fail('No staff member has this employee code', code || '(empty)');
          const values: Record<string, unknown> = {};
          for (const [k, f] of Object.entries(s.fields)) {
            if (f.noImport) continue;
            const raw = r.get(k);
            if (raw === '' && !f.required) continue;
            if (raw === '') fail('This value is required', f.label);
            const parsed = f.schema.safeParse(f.type === 'boolean' ? /^(y|yes|true|1)$/i.test(raw) : raw);
            if (!parsed.success) fail('This value is not valid', `${f.label}: ${raw}`);
            if (Array.isArray(f.options) && !f.options.some((o) => o.value === String(parsed.data))) fail('Choose one of the listed values', `${f.label}: ${raw}`);
            values[k] = parsed.data;
          }
          s.check?.(values);
          const insert: Record<string, unknown> = { tenantId: ctx.p.tenantId, userId: who!.id, verifiedAt: new Date(), verifiedBy: ctx.p.userId };
          for (const [k, p] of Object.entries(props)) if (values[k] !== undefined) insert[p] = values[k];
          await tx.insert(t).values(insert as never);
          return outcome(true, false, [code, s.label(values as Row)]);
        }),
    },
  };
}

/** True when another row of `col` (case-insensitive) has the value. */
export async function taken(ctx: KitCtx, table: PgTable, col: AnyColumn, idCol: AnyColumn, value: string, exceptId?: string): Promise<boolean> {
  const [hit] = await ctx.tx
    .select({ one: sql`1` })
    .from(table)
    .where(and(sql`lower(${col}) = ${value.toLowerCase()}`, exceptId ? ne(idCol, exceptId) : undefined))
    .limit(1);
  return !!hit;
}
