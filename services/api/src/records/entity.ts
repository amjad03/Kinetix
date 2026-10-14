import { Injectable, NotFoundException } from '@nestjs/common';
import type { AnyColumn, SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgSelect, PgTable, SelectedFields } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import type { RowResult } from '../import/import.service.js';
import type { Row as ImportRow } from '../import/row-helpers.js';

/**
 * The record depth kit: one description of a module's list ("entity") gives it add, view, edit, delete to the
 * recycle bin, restore, bulk edit/delete/move, custom bulk actions, duplicate, reorder, history, import and
 * export, all behind `/v1/records/:entity`. A module registers its entity with {@link RecordRegistry.register}
 * from a provider's `onModuleInit` (see docs/requirements/RECORD_DEPTH_KIT.md and src/students/students.records.ts).
 */

/** A list row or a database row: column or field name → value. */
export type Row = Record<string, unknown>;
/** A cell of an export. */
export type Cell = string | number | boolean | null | undefined;

/** Who is acting, inside the request's tenant transaction. */
export interface KitCtx {
  tx: Tx;
  p: UserPrincipal;
}

export interface FieldOption {
  value: string;
  label: string;
  /** Groups a long list in the picker ("BCom" for its classes). */
  group?: string;
}
export type Options = FieldOption[] | ((ctx: KitCtx) => Promise<FieldOption[]>);

/** A value a person can set on a record: in the add and edit forms, and (with `bulk`) in Bulk edit. */
export interface RecordField {
  /** English label; the ERP shows its own `rk.f.<entity>.<key>` string when it has one. */
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'date' | 'email' | 'phone';
  /** Validates the value sent by the ERP (JSON, not text). */
  schema: z.ZodType;
  /** The entity table's column the value is written to. Leave out and give `apply` for anything else. */
  column?: AnyPgColumn;
  /** Writes the value somewhere other than a root column (a profile table, a link table). */
  apply?: (ctx: KitCtx, id: string, value: unknown) => Promise<void>;
  /** The list row key holding the current value, for the edit form (default: the field key). */
  rowKey?: string;
  options?: Options;
  /** Must be given when adding a record. */
  required?: boolean;
  /** Shown in the add form (default true). */
  create?: boolean;
  /** Shown in the edit form (default true). */
  edit?: boolean;
  /** Offered in Bulk edit (default false: names and codes are per record). */
  bulk?: boolean;
  help?: string;
}

export interface ListFilter {
  label: string;
  options?: Options;
  /** The condition for a chosen value; undefined ignores it (an unknown value). */
  where: (value: string, ctx: KitCtx) => SQL | undefined;
}

export interface ListSpec {
  /** The fields of a list row; must include `id`. */
  select: SelectedFields;
  /** Joins added to `select … from <table>`. */
  joins?: (q: PgSelect) => unknown;
  /** Searched by `q`: every word must match one of these (case-insensitive). */
  search?: (AnyColumn | SQL)[];
  filters?: Record<string, ListFilter>;
  /** Sort keys the list accepts → the expression sorted on. */
  sorts: Record<string, AnyColumn | SQL>;
  defaultSort: { id: string; dir: 'asc' | 'desc' };
  /** Sorted on (ascending) after the chosen sort and before the id: a class's roll numbers under a class sort. */
  tiebreak?: (AnyColumn | SQL)[];
  /** Always applied: what this person may see (a head of department sees their department). */
  scope?: (ctx: KitCtx) => SQL | undefined;
}

export interface ExportColumn {
  key: string;
  header: string;
  /** The cell; defaults to `row[key]`. */
  value?: (row: Row) => Cell;
}

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  help?: string;
  example?: string;
  /** Allowed values, offered as a drop-down in the Excel template. */
  options?: string[] | ((ctx: KitCtx) => Promise<string[]>);
}

export interface ImportSpec {
  columns: ImportColumn[];
  /** The columns that identify an existing record: insert mode refuses a row whose key exists. */
  key: string[];
  /** Whether a row's key names an existing record. */
  exists: (ctx: KitCtx, row: ImportRow) => Promise<boolean>;
  /**
   * Writes the rows inside the caller's transaction, each in its own savepoint, and reports each one
   * (use `eachRow` from records/import.ts). Never commits or rolls back by itself.
   */
  run: (ctx: KitCtx, rows: ImportRow[]) => Promise<RowResult[]>;
}

export interface MoveSpec {
  /** "Move to class". */
  label: string;
  options: Options;
  /** A reason is asked for and recorded (a class change on a student's record). */
  reason?: boolean;
  /** Sets this root column to the target… */
  column?: AnyPgColumn;
  /** …or moves the record some other way (through the module's service, which keeps its own history). */
  apply?: (ctx: KitCtx, id: string, to: string, reason?: string) => Promise<void>;
}

export interface CustomAction {
  label: string;
  /** Defaults to the entity's write roles. */
  roles?: RoleName[];
  tone?: 'danger';
  /** Parameters the ERP sends with it. */
  params?: z.ZodType;
  /** Does it to one record; throw (an HttpException) to report that row as failed. Returns a note for the report. */
  apply: (ctx: KitCtx, id: string, params: unknown) => Promise<string | void>;
}

export interface RecordEntity {
  /** URL key: `/v1/records/<key>`. Lower case, digits and dashes. */
  key: string;
  /** The ERP module it belongs to (recycle bin filter). */
  module: string;
  /** The root table. Its primary key must be a single `id` column. */
  table: PgTable;
  /** The audit log `subject_type` this module already uses for these records ("student"). */
  subjectType: string;
  /** Other subject types whose audit entries belong to this record's history ("staff_profile" for staff). */
  historyTypes?: string[];
  roles: { read: RoleName[]; write: RoleName[] };
  /** How a record is named in the bin, reports and history ("R12 Asha Rao"). Gets a list row. */
  label: (row: Row) => string;
  list: ListSpec;
  fields?: Record<string, RecordField>;
  /** Adds a record. Default: inserts the root columns of the given fields with the tenant id. */
  create?: (ctx: KitCtx, values: Record<string, unknown>) => Promise<string>;
  /** Columns of exports, in order. */
  columns: ExportColumn[];
  move?: MoveSpec;
  /** Orderable lists: the sort column, and the columns that group an ordering (a program's subjects). */
  order?: { column: AnyPgColumn; scope?: AnyPgColumn[] };
  /** Duplicate: changes to the copied row (database column names), e.g. a new name. Children are not copied. */
  duplicate?: (ctx: KitCtx, row: Row) => Promise<Row> | Row;
  remove?: {
    /** Refuse a delete with a message ("This class still has students"). */
    guard?: (ctx: KitCtx, id: string) => Promise<string | null>;
    /** Rows linked without a foreign key that go to the bin with the record. */
    dependents?: { table: string; column: string }[];
  };
  import?: ImportSpec;
  actions?: Record<string, CustomAction>;
  /**
   * Rules across fields, checked after an add or an edit is written (still inside the transaction): a message refuses
   * the change with a 400 ("The end date is before the start date"); null accepts it.
   */
  validate?: (ctx: KitCtx, id: string) => Promise<string | null>;
}

/** Every entity the kit serves, by key. Modules add theirs on start-up. */
@Injectable()
export class RecordRegistry {
  private readonly entities = new Map<string, RecordEntity>();

  register(entity: RecordEntity): void {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(entity.key)) throw new Error(`Bad record entity key ${entity.key}`);
    if (this.entities.has(entity.key)) throw new Error(`Record entity ${entity.key} is registered twice`);
    if (!('id' in entity.list.select)) throw new Error(`Record entity ${entity.key}: the list must select id`);
    if (!entity.list.sorts[entity.list.defaultSort.id]) throw new Error(`Record entity ${entity.key}: unknown default sort`);
    this.entities.set(entity.key, entity);
  }

  get(key: string): RecordEntity {
    const e = this.entities.get(key);
    if (!e) throw new NotFoundException('Not found');
    return e;
  }

  find(key: string): RecordEntity | undefined {
    return this.entities.get(key);
  }

  all(): RecordEntity[] {
    return [...this.entities.values()];
  }
}

/** Whether the principal holds one of the roles. */
export const hasRole = (p: UserPrincipal, roles: readonly RoleName[]) => p.roles.some((r) => roles.includes(r));

/** The options of a field, filter or move target. */
export async function resolveOptions(ctx: KitCtx, o: Options | undefined): Promise<FieldOption[] | undefined> {
  if (!o) return undefined;
  return typeof o === 'function' ? o(ctx) : o;
}
