import { BadRequestException, HttpException } from '@nestjs/common';
import { and, asc, eq, getTableColumns, inArray, ne, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable, SelectedFields } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import { departments, userRoles, users } from '../db/schema.js';
import { fail, lc, outcome, type Row as ImportRow } from '../import/row-helpers.js';
import type { CustomAction, ExportColumn, FieldOption, KitCtx, ListFilter, Options, RecordEntity, RecordField, Row } from '../records/entity.js';
import { copyName, DateText, OptionalRef, Ref } from '../records/helpers.js';
import { eachRow } from '../records/import.js';

/**
 * A short way to describe a register as a record kit entity (docs/requirements/RECORD_DEPTH_KIT.md): each field names its
 * column and kind, and the builder derives the form, the list (with names for people and departments), filters for fixed
 * choices, sorts, export columns and the Excel import (people by e-mail, departments by name, money in rupees). Used by
 * the research office, OBE and IQAC registers.
 */
export type KitKind = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'date' | 'email' | 'money' | 'user' | 'department' | 'ref' | 'datetime' | 'tags' | 'names';

export interface KitField {
  label: string;
  kind: KitKind;
  column: AnyPgColumn;
  required?: boolean;
  /** Text length, or the number range. */
  max?: number;
  min?: number;
  int?: boolean;
  /** Fixed choices (select) or the records a `ref` field points at. */
  options?: Options;
  bulk?: boolean;
  create?: boolean;
  edit?: boolean;
  help?: string;
  example?: string;
  /** Left out of the Excel import (set by the module's own steps). */
  noImport?: boolean;
  /** A `ref` field's import: finds the record from the cell text (a code or a title). */
  lookup?: (ctx: KitCtx, text: string) => Promise<string | null>;
  /** A filter on this field in the list (fixed choices, people and departments get one by default). */
  filter?: boolean;
}

export interface KitSpec {
  key: string;
  module: string;
  table: PgTable;
  subjectType: string;
  roles: { read: RoleName[]; write: RoleName[] };
  /** The field whose value names a record (title, name, partner). */
  title: string;
  fields: Record<string, KitField>;
  /** Extra list values: computed figures, names of linked records. */
  extra?: SelectedFields;
  joins?: RecordEntity['list']['joins'];
  search?: (AnyColumn | SQL)[];
  filters?: Record<string, ListFilter>;
  sorts?: Record<string, AnyColumn | SQL>;
  defaultSort: { id: string; dir: 'asc' | 'desc' };
  scope?: RecordEntity['list']['scope'];
  /** Export columns after the fields' own. */
  exportExtra?: ExportColumn[];
  /** Columns a new record gets that no field sets (created by, status). */
  defaults?: (ctx: KitCtx) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Fields that identify a record in an import (default: the title field). */
  importKey?: string[];
  /** Copies get a free "(copy)" title; changes to the copy (database column names). */
  duplicate?: boolean | ((ctx: KitCtx, row: Row) => Promise<Row> | Row);
  order?: RecordEntity['order'];
  move?: RecordEntity['move'];
  remove?: RecordEntity['remove'];
  actions?: Record<string, CustomAction>;
  validate?: RecordEntity['validate'];
  label?: (row: Row) => string;
  /** No Excel import for this list (records come from the module's own steps). */
  noImport?: boolean;
}

/** Active staff (anyone without only a student or guardian role), by name. */
export async function staffOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, 'active'), ne(userRoles.role, 'student'), ne(userRoles.role, 'guardian')))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

export async function departmentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** Fixed choices from values; the ERP shows its own `rk.o.<entity>.<field>.<value>` words. */
export const choices = (values: readonly string[], words?: Record<string, string>): FieldOption[] => values.map((v) => ({ value: v, label: words?.[v] ?? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));

const IST = '+05:30';
/** "2026-10-15 14:30" (India time) or an ISO timestamp. */
const DateTimeText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/, 'Use a date and time like 2026-10-15 14:30')
  .transform((v) => new Date(/(Z|[+-]\d{2}:\d{2})$/.test(v) ? v.replace(' ', 'T') : `${v.replace(' ', 'T')}${v.length === 16 ? ':00' : ''}${IST}`));

function schemaOf(f: KitField): z.ZodType {
  const req = !!f.required;
  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const max = f.max ?? (f.kind === 'textarea' ? 4000 : 200);
      return req ? z.string().trim().min(1, 'This value is required').max(max) : z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();
    }
    case 'email':
      return req ? z.email() : z.union([z.email(), z.literal('')]).transform((v) => (v === '' ? null : v)).nullable();
    case 'number':
    case 'money': {
      let n = z.coerce.number().min(f.min ?? (f.kind === 'money' ? 0 : -1e12)).max(f.max ?? 1e12);
      if (f.int) n = n.int();
      return req ? n : z.union([n, z.literal('').transform(() => null), z.null()]).nullable();
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      return req ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15') : DateText;
    case 'datetime':
      return req ? DateTimeText : z.union([DateTimeText, z.literal('').transform(() => null), z.null()]).nullable();
    case 'select':
      return req ? z.string().min(1) : z.union([z.string(), z.null()]).transform((v) => (v === '' ? null : v)).nullable();
    case 'tags': {
      const allowed = Array.isArray(f.options) ? f.options.map((o) => o.value) : null;
      return z
        .union([z.string(), z.array(z.string()), z.null()])
        .transform((v) => [...new Set((Array.isArray(v) ? v : (v ?? '').split(/[,;]/)).map((x) => x.trim().toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean))])
        .refine((v) => !allowed || v.every((x) => allowed.includes(x)), allowed ? `Use these values: ${allowed.join(', ')}` : 'This value is not valid')
        .refine((v) => !req || v.length > 0, 'This value is required');
    }
    case 'names':
      return z
        .union([z.string(), z.null()])
        .transform((v) => (v ?? '').split(/;|\n/).map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 50).map((name) => ({ name })))
        .refine((v) => !req || v.length > 0, 'This value is required');
    case 'user':
    case 'department':
    case 'ref':
      return req ? Ref : OptionalRef;
  }
}

const formType = (k: KitKind): RecordField['type'] => (k === 'money' || k === 'number' ? 'number' : k === 'user' || k === 'department' || k === 'ref' ? 'select' : k === 'datetime' || k === 'tags' || k === 'names' ? 'text' : k);

/** Rupees with up to two decimals. */
const rupees = (col: AnyPgColumn) => sql<number>`(${col})::float8 / 100`;
const timeText = (col: AnyPgColumn) => sql<string | null>`to_char((${col}) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`;

/** A date typed in a sheet: 2026-10-15, 15-10-2026 or 15/10/2026. */
export function sheetDate(text: string): string {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : ['', '', ''];
  const out = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const ok = y && !Number.isNaN(Date.parse(`${out}T00:00:00Z`)) && new Date(`${out}T00:00:00Z`).toISOString().startsWith(out);
  return ok ? out : fail('Use a date like 2026-10-15', text);
}

async function optionsOf(ctx: KitCtx, f: KitField): Promise<FieldOption[]> {
  if (f.kind === 'user') return staffOptions(ctx);
  if (f.kind === 'department') return departmentOptions(ctx);
  const o = f.options;
  return !o ? [] : typeof o === 'function' ? o(ctx) : o;
}

/** One cell of an import row as the value the column takes (undefined: leave as it is). */
async function cellValue(ctx: KitCtx, key: string, f: KitField, text: string): Promise<unknown> {
  if (!text) {
    if (f.required) fail('This value is required', f.label);
    return f.kind === 'boolean' ? false : f.kind === 'money' ? 0 : null;
  }
  switch (f.kind) {
    case 'number':
    case 'money': {
      const n = Number(text.replace(/[,₹\s]/g, ''));
      if (!Number.isFinite(n) || (f.int && !Number.isInteger(n)) || n < (f.min ?? (f.kind === 'money' ? 0 : -1e12)) || n > (f.max ?? 1e12)) fail('This value is not valid', text);
      return n;
    }
    case 'date':
      return sheetDate(text);
    case 'datetime': {
      const r = schemaOf({ ...f, required: true }).safeParse(text);
      return r.success ? r.data : fail('Use a date and time like 2026-10-15 14:30', text);
    }
    case 'boolean':
      return /^(y|yes|true|1|हाँ|ಹೌದು)$/i.test(text) ? true : /^(n|no|false|0|नहीं|ಇಲ್ಲ)$/i.test(text) ? false : fail('This value is not valid', text);
    case 'user': {
      const [u] = await ctx.tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${text.toLowerCase()} or ${users.phone} = ${text}`).limit(1);
      return u ? u.id : fail('No member of staff with this email or phone', text);
    }
    case 'department': {
      const [d] = await ctx.tx.select({ id: departments.id }).from(departments).where(sql`lower(${departments.name}) = ${lc(text)}`).limit(1);
      return d ? d.id : fail('No department with this name', text);
    }
    case 'ref': {
      if (f.lookup) return (await f.lookup(ctx, text)) ?? fail('This value is not valid', text);
      // Without a lookup: the record whose name matches, or whose name starts with the code given ("BCM-101").
      const opts = f.options ? await optionsOf(ctx, f) : [];
      const want = text.toLowerCase();
      const hit = opts.find((o) => o.value === text || o.label.toLowerCase() === want) ?? opts.filter((o) => o.label.toLowerCase().startsWith(`${want} `)).at(0);
      return hit ? hit.value : fail('This value is not valid', text);
    }
    case 'select': {
      const opts = await optionsOf(ctx, f);
      const hit = opts.find((o) => o.value.toLowerCase() === text.toLowerCase() || o.label.toLowerCase() === text.toLowerCase());
      return hit ? hit.value : fail('Choose one of the listed values', `${key}: ${text}`);
    }
    case 'email':
      return z.email().safeParse(text).success ? text.toLowerCase() : fail('Enter a valid email address', text);
    case 'tags':
    case 'names': {
      const r = schemaOf(f).safeParse(text);
      return r.success ? r.data : fail(f.kind === 'tags' ? 'Choose one of the listed values' : 'This value is not valid', text);
    }
    default:
      return f.max && text.length > f.max ? fail('This value is too long', text.slice(0, 40)) : text;
  }
}

/** The record kit entity for a register. */
export function kitEntity(s: KitSpec): RecordEntity {
  const cols = getTableColumns(s.table);
  const idCol = (cols as Record<string, AnyPgColumn>).id;
  const prop = (c: AnyPgColumn) => Object.entries(cols).find(([, x]) => x === c)![0];
  const entries = Object.entries(s.fields);

  const select: SelectedFields = { id: idCol };
  const sorts: Record<string, AnyColumn | SQL> = {};
  const filters: Record<string, ListFilter> = {};
  const exportCols: ExportColumn[] = [];
  for (const [key, f] of entries) {
    if (f.kind === 'money') {
      select[key] = rupees(f.column);
      sorts[key] = f.column;
    } else if (f.kind === 'datetime') {
      select[key] = timeText(f.column);
      sorts[key] = f.column;
    } else if (f.kind === 'tags') {
      select[key] = sql<string>`array_to_string(${f.column}, ', ')`;
    } else if (f.kind === 'names') {
      select[key] = sql<string>`coalesce((select string_agg(coalesce(a->>'name', a #>> '{}'), '; ') from jsonb_array_elements(${f.column}) a), '')`;
    } else select[key] = f.column;
    if (f.kind !== 'money' && f.kind !== 'datetime' && f.kind !== 'names') sorts[key] = f.kind === 'tags' ? (select[key] as SQL) : f.column;
    if (f.kind === 'user') select[`${key}Name`] = sql<string | null>`(select x.full_name from users x where x.id = ${f.column})`;
    if (f.kind === 'department') select[`${key}Name`] = sql<string | null>`(select x.name from departments x where x.id = ${f.column})`;
    if (f.kind === 'user' || f.kind === 'department') sorts[key] = select[`${key}Name`] as SQL;
    const wantsFilter = f.filter ?? (f.kind === 'select' || f.kind === 'department' || f.kind === 'boolean' || (f.kind === 'tags' && Array.isArray(f.options)));
    if (wantsFilter) {
      filters[key] = {
        label: f.label,
        options: f.kind === 'boolean' ? choices(['yes', 'no']) : (ctx) => optionsOf(ctx, f),
        where: (v) => (f.kind === 'tags' ? sql`${v} = any(${f.column})` : f.kind === 'boolean' ? (v === 'yes' ? sql`${f.column} = true` : v === 'no' ? sql`${f.column} = false` : undefined) : f.kind === 'department' || f.kind === 'user' || f.kind === 'ref' ? (z.uuid().safeParse(v).success ? eq(f.column, v) : undefined) : eq(f.column, v)),
      };
    }
    exportCols.push({ key, header: f.label, value: f.kind === 'user' || f.kind === 'department' ? (r) => (r[`${key}Name`] as string | null) ?? '' : f.kind === 'boolean' ? (r) => (r[key] ? 'Yes' : 'No') : undefined });
  }
  Object.assign(select, s.extra ?? {});
  Object.assign(sorts, s.sorts ?? {});
  Object.assign(filters, s.filters ?? {});

  const fields: Record<string, RecordField> = {};
  for (const [key, f] of entries) {
    const base: RecordField = { label: f.label, type: formType(f.kind), schema: schemaOf(f), required: f.required, bulk: f.bulk, create: f.create, edit: f.edit, help: f.help ?? (f.kind === 'datetime' ? 'Date and time, for example 2026-10-15 14:30' : f.kind === 'money' ? 'In rupees' : undefined) };
    if (f.kind === 'user' || f.kind === 'department' || f.kind === 'select' || f.kind === 'ref') base.options = (ctx) => optionsOf(ctx, f);
    if (f.kind === 'money') {
      base.apply = async (ctx, id, v) => {
        await ctx.tx.update(s.table).set({ [prop(f.column)]: Math.round(Number(v ?? 0) * 100) }).where(eq(idCol, id));
      };
    } else base.column = f.column;
    fields[key] = base;
  }

  /** Values for an insert: field values by column property, money in paise. */
  const insertValues = (values: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [key, f] of entries) if (key in values) out[prop(f.column)] = f.kind === 'money' ? Math.round(Number(values[key] ?? 0) * 100) : values[key];
    return out;
  };

  const create = async (ctx: KitCtx, values: Record<string, unknown>): Promise<string> => {
    const [row] = (await ctx.tx
      .insert(s.table)
      .values({ tenantId: ctx.p.tenantId, ...(await s.defaults?.(ctx)), ...insertValues(values) })
      .returning({ id: idCol })) as { id: string }[];
    return row.id;
  };

  const keyFields = s.importKey ?? [s.title];
  const keyWhere = async (ctx: KitCtx, r: ImportRow): Promise<SQL | undefined> => {
    const parts: SQL[] = [];
    for (const k of keyFields) {
      const f = s.fields[k];
      const text = r.get(k);
      if (!text) return undefined;
      const v = f.kind === 'text' || f.kind === 'textarea' || f.kind === 'email' ? null : await cellValue(ctx, k, f, text);
      parts.push(v === null ? sql`lower(${f.column}::text) = ${lc(text)}` : eq(f.column, v as never));
    }
    return and(...parts);
  };
  const importable = entries.filter(([, f]) => !f.noImport && f.create !== false);

  const entity: RecordEntity = {
    key: s.key,
    module: s.module,
    table: s.table,
    subjectType: s.subjectType,
    roles: s.roles,
    label: s.label ?? ((r) => String(r[s.title] ?? '')),
    list: {
      select,
      joins: s.joins,
      search: s.search ?? [s.fields[s.title].column],
      filters,
      sorts,
      defaultSort: s.defaultSort,
      scope: s.scope,
    },
    fields,
    create: entries.some(([, f]) => f.create !== false) ? create : undefined,
    columns: [...exportCols, ...(s.exportExtra ?? [])],
    order: s.order,
    move: s.move,
    remove: s.remove,
    actions: s.actions,
    validate: s.validate,
    duplicate: s.duplicate
      ? async (ctx, row) => {
          const titleCol = s.fields[s.title].column;
          const changes = typeof s.duplicate === 'function' ? await s.duplicate(ctx, row) : {};
          return { [titleCol.name]: await copyName(ctx.tx, s.table, titleCol, String(row[titleCol.name] ?? '')), ...changes };
        }
      : undefined,
    import: s.noImport ? undefined : {
      columns: importable.map(([key, f]) => ({
        key,
        header: f.label,
        required: !!f.required,
        help: f.help ?? (f.kind === 'user' ? 'E-mail or mobile number of the member of staff' : f.kind === 'department' ? 'Department name as in the ERP' : f.kind === 'date' ? 'A date like 2026-10-15' : f.kind === 'datetime' ? 'Date and time like 2026-10-15 14:30' : f.kind === 'money' ? 'Amount in rupees' : f.kind === 'boolean' ? 'Yes or No' : undefined),
        example: f.example,
        options: f.kind === 'select' ? async (ctx) => (await optionsOf(ctx, f)).map((o) => o.label) : f.kind === 'department' ? async (ctx) => (await departmentOptions(ctx)).map((o) => o.label) : f.kind === 'boolean' ? ['Yes', 'No'] : undefined,
      })),
      key: keyFields,
      exists: async (ctx, r) => {
        const w = await keyWhere(ctx, r);
        return !!w && !!(await ctx.tx.select({ id: idCol }).from(s.table).where(w).limit(1))[0];
      },
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const c = { tx, p: ctx.p };
          const w = await keyWhere(c, r);
          const [found] = w ? await tx.select({ id: idCol }).from(s.table).where(w).limit(1) : [];
          // A new record needs its required cells; an existing one keeps what an empty cell leaves out.
          const values: Record<string, unknown> = {};
          for (const [key, f] of importable) {
            const text = r.get(key);
            if (text === '' && found) continue;
            if (text === '' && !f.required) continue;
            values[key] = await cellValue(c, key, f, text);
          }
          let id: string;
          let created = false;
          if (found) {
            id = (found as { id: string }).id;
            const set = insertValues(values);
            if (Object.keys(set).length) await tx.update(s.table).set(set).where(eq(idCol, id));
          } else {
            id = await create(c, values);
            created = true;
          }
          const message = await s.validate?.(c, id);
          if (message) throw new BadRequestException(message);
          return outcome(created, !created, [String(r.get(s.title))]);
        }),
    },
  };
  return entity;
}

/** A custom action's params, parsed or refused with a 400. */
export function parseParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const r = schema.safeParse(params ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? 'This value is not valid');
  return r.data;
}

/** A row of the entity's table (database column names), for a custom action or a check. */
export async function rowOf(ctx: KitCtx, table: PgTable, id: string): Promise<Record<string, unknown>> {
  const cols = getTableColumns(table) as Record<string, AnyPgColumn>;
  const [row] = await ctx.tx.select().from(table).where(eq(cols.id, id));
  if (!row) throw new HttpException('Not found', 404);
  return row as Record<string, unknown>;
}

/** Ids among `ids` that exist in the table (for checks on links without a foreign key). */
export async function existing(ctx: KitCtx, table: PgTable, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const cols = getTableColumns(table) as Record<string, AnyPgColumn>;
  return (await ctx.tx.select({ id: cols.id }).from(table).where(inArray(cols.id, ids))).map((r) => (r as { id: string }).id);
}
