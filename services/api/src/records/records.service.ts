import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, getTableColumns, getTableName, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { csvCell } from '../common/pdf.js';
import { writeWorkbook } from '../common/xlsx.js';
import { auditLog, users } from '../db/schema.js';
import { hasRole, resolveOptions, type KitCtx, type RecordEntity, type RecordField, type Row } from './entity.js';
import { listAll, listRow, MAX_EXPORT, resolveTargets, type BulkTarget, type ListQuery } from './list.js';
import { RecycleBinService } from './recycle-bin.service.js';
import { cloneRow, pgError, rawRow, tableWords } from './snapshot.js';

/** One record's result in a bulk operation. */
export interface BulkRowResult {
  id: string;
  label: string;
  ok: boolean;
  message?: string;
  code?: string;
}

export interface BulkReport {
  op: 'update' | 'delete' | 'move' | 'action';
  /** All rows or none: a failure rolled everything back. */
  atomic: boolean;
  committed: boolean;
  total: number;
  succeeded: number;
  failed: number;
  rows: BulkRowResult[];
}

export interface HistoryEntry {
  id: number;
  at: string;
  action: string;
  actor: { id: string | null; name: string | null; type: string };
  /** What changed, field by field. */
  changes: { field: string; label: string; before: unknown; after: unknown }[];
  /** Everything else the entry recorded (a reason, a batch). */
  data: Record<string, unknown> | null;
}

const ROLLBACK = Symbol('rollback');

/** An error as one row of a bulk report. */
function rowError(e: unknown, label: string): { message: string; code: string } {
  if (e instanceof HttpException) {
    const body = e.getResponse();
    const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
    const code = typeof body === 'object' && body && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : e.getStatus() === 404 ? 'NOT_FOUND' : e.getStatus() === 403 ? 'FORBIDDEN' : 'CONFLICT';
    const text = Array.isArray(message) ? String(message[0]) : typeof message === 'string' ? message : typeof message === 'object' && message && 'fieldErrors' in message ? 'Check the values' : e.message;
    return { message: text, code };
  }
  const pg = pgError(e);
  if (pg?.code === '23505') return { message: `${label}: another record already has the same details`, code: 'DUPLICATE' };
  if (pg?.code === '23503') return { message: `${label}: a linked record is missing or still in use (${tableWords(pg.table ?? 'records')})`, code: 'RECORD_IN_USE' };
  if (pg?.code === '23502' || pg?.code === '23514' || pg?.code === '22P02') return { message: `${label}: a value is not allowed`, code: 'INVALID_VALUE' };
  throw e;
}

/** A unique key the database refused, as a 409 that names the field ("Another record already has this email"). */
function duplicateError(e: unknown): HttpException | undefined {
  const pg = pgError(e);
  if (pg?.code !== '23505') return undefined;
  const m = /Key \(([^)]+)\)=/.exec(pg.detail ?? '');
  const cols = (m?.[1] ?? '').split(',').map((c) => c.trim()).filter((c) => c && !/(^|_)(tenant|section|program|academic_year)_id$/.test(c) && c !== 'tenant_id');
  const field = cols.length ? cols.map((c) => c.replace(/^lower\((.*)\)$/, '$1')).join(', ') : 'details';
  return new ConflictException({ statusCode: 409, error: 'Conflict', code: 'DUPLICATE', message: `Another record already has the same ${tableWords(field)}`, field });
}

/** Runs a write, turning a unique-key refusal into a 409. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw duplicateError(e) ?? e;
  }
}

/** The table property behind a column, for `update().set()`. */
function propOf(e: RecordEntity, column: AnyPgColumn): string {
  const hit = Object.entries(getTableColumns(e.table)).find(([, c]) => c === column);
  if (!hit) throw new Error(`Record entity ${e.key}: a field's column is not on its table`);
  return hit[0];
}

/**
 * The kit's record operations, the same for every entity: create, update, delete to the bin, duplicate, reorder,
 * bulk update/delete/move/actions with a per-row report, history from the audit log, and exports.
 */
@Injectable()
export class RecordsService {
  constructor(private readonly bin: RecycleBinService) {}

  assertRead(ctx: KitCtx, e: RecordEntity) {
    if (!hasRole(ctx.p, e.roles.read) && !hasRole(ctx.p, e.roles.write)) throw new ForbiddenException("Your account doesn't have access to this.");
  }

  assertWrite(ctx: KitCtx, e: RecordEntity) {
    if (!hasRole(ctx.p, e.roles.write)) throw new ForbiddenException("Your account doesn't have access to this.");
  }

  /** What the ERP needs to draw the list: fields with their choices, filters, sorts, export columns, move targets and actions. */
  async meta(ctx: KitCtx, e: RecordEntity) {
    const write = hasRole(ctx.p, e.roles.write);
    const fields = await Promise.all(
      Object.entries(e.fields ?? {}).map(async ([key, f]) => ({
        key,
        label: f.label,
        type: f.type,
        required: !!f.required,
        create: f.create !== false,
        edit: f.edit !== false,
        bulk: !!f.bulk,
        help: f.help ?? null,
        rowKey: f.rowKey ?? key,
        options: write ? ((await resolveOptions(ctx, f.options)) ?? null) : null,
      })),
    );
    const filters = await Promise.all(Object.entries(e.list.filters ?? {}).map(async ([key, f]) => ({ key, label: f.label, options: (await resolveOptions(ctx, f.options)) ?? null })));
    const actions = Object.entries(e.actions ?? {})
      .filter(([, a]) => hasRole(ctx.p, a.roles ?? e.roles.write))
      .map(([key, a]) => ({ key, label: a.label, tone: a.tone ?? null, ...(a.inputs?.length ? { inputs: a.inputs } : {}) }));
    return {
      key: e.key,
      module: e.module,
      subjectType: e.subjectType,
      can: { write, import: write && !!e.import, reorder: write && !!e.order, duplicate: write && !!e.duplicate, move: write && !!e.move, create: write && (!!e.create || Object.values(e.fields ?? {}).some((f) => f.create !== false)) },
      fields,
      filters,
      sorts: Object.keys(e.list.sorts),
      defaultSort: e.list.defaultSort,
      columns: e.columns.map((c) => ({ key: c.key, header: c.header })),
      move: e.move && write ? { label: e.move.label, reason: !!e.move.reason, options: (await resolveOptions(ctx, e.move.options)) ?? [] } : null,
      order: e.order ? { scope: (e.order.scope ?? []).map((c) => c.name) } : null,
      actions: write ? actions : [],
      import: e.import && write ? { columns: e.import.columns.map((c) => ({ key: c.key, header: c.header, required: !!c.required, help: c.help ?? null })), key: e.import.key } : null,
    };
  }

  async get(ctx: KitCtx, e: RecordEntity, id: string): Promise<Row> {
    const row = await listRow(e, ctx, id);
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  /** Validates the values given for these fields; unknown keys and fields not allowed here are refused. */
  private async parseFields(ctx: KitCtx, e: RecordEntity, values: Record<string, unknown>, mode: 'create' | 'edit' | 'bulk'): Promise<[string, RecordField, unknown][]> {
    const out: [string, RecordField, unknown][] = [];
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, raw] of Object.entries(values)) {
      const f = e.fields?.[key];
      const allowed = f && (mode === 'create' ? f.create !== false : mode === 'edit' ? f.edit !== false : !!f.bulk);
      if (!allowed) {
        fieldErrors[key] = ['This field cannot be set here'];
        continue;
      }
      const parsed = f.schema.safeParse(raw);
      if (!parsed.success) {
        fieldErrors[key] = [z.flattenError(parsed.error).formErrors[0] ?? 'This value is not valid'];
        continue;
      }
      const opts = f.type === 'select' ? await resolveOptions(ctx, f.options) : undefined;
      if (opts && parsed.data !== null && parsed.data !== undefined && !opts.some((o) => o.value === String(parsed.data))) {
        fieldErrors[key] = ['Choose one of the listed values'];
        continue;
      }
      out.push([key, f, parsed.data]);
    }
    if (mode === 'create') for (const [key, f] of Object.entries(e.fields ?? {})) if (f.required && f.create !== false && (values[key] === undefined || values[key] === null || values[key] === '')) fieldErrors[key] = ['This value is required'];
    if (Object.keys(fieldErrors).length) throw new BadRequestException({ formErrors: [], fieldErrors });
    if (!out.length && mode !== 'create') throw new BadRequestException('Nothing to change');
    return out;
  }

  /** Writes parsed field values to a record: root columns in one update, the rest through each field's `apply`. */
  private async writeFields(ctx: KitCtx, e: RecordEntity, id: string, values: [string, RecordField, unknown][]) {
    const set: Record<string, unknown> = {};
    for (const [, f, v] of values) if (f.column) set[propOf(e, f.column)] = v;
    if (Object.keys(set).length) {
      const cols = getTableColumns(e.table);
      if ('updatedAt' in cols) set.updatedAt = new Date();
      await ctx.tx
        .update(e.table)
        .set(set)
        .where(eq(cols.id, id));
    }
    for (const [, f, v] of values) if (!f.column) await f.apply!(ctx, id, v);
  }

  async create(ctx: KitCtx, e: RecordEntity, body: Record<string, unknown>): Promise<Row> {
    this.assertWrite(ctx, e);
    const values = await this.parseFields(ctx, e, body, 'create');
    const id = await guarded(async () => {
      if (e.create) return e.create(ctx, Object.fromEntries(values.map(([k, , v]) => [k, v])));
      const insert: Record<string, unknown> = { tenantId: ctx.p.tenantId };
      for (const [, f, v] of values) if (f.column) insert[propOf(e, f.column)] = v;
      const cols = getTableColumns(e.table);
      const [row] = (await ctx.tx.insert(e.table).values(insert).returning({ id: cols.id })) as { id: string }[];
      for (const [, f, v] of values) if (!f.column) await f.apply!(ctx, row.id, v);
      return row.id;
    });
    if (e.order) await this.placeLast(ctx, e, id);
    const after = await this.get(ctx, e, id);
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.created`, subjectType: e.subjectType, subjectId: id, after: this.fieldValues(e, after), data: { label: e.label(after) } });
    return after;
  }

  /** A new record of an orderable list goes after the others of its group. */
  private async placeLast(ctx: KitCtx, e: RecordEntity, id: string) {
    const order = e.order!;
    const t = sql.identifier(getTableName(e.table));
    const col = sql.identifier(order.column.name);
    const same = sql.join(
      (order.scope ?? []).map((c) => sql`o.${sql.identifier(c.name)} is not distinct from n.${sql.identifier(c.name)}`),
      sql` and `,
    );
    await ctx.tx.execute(sql`update ${t} n set ${col} = coalesce((select max(o.${col}) from ${t} o where o.id <> n.id${order.scope?.length ? sql` and ${same}` : sql``} and o.${col} < 1000000), 0) + 10 where n.id = ${id}`);
  }

  /** The record's field values (for before/after in the audit log). */
  private fieldValues(e: RecordEntity, row: Row): Row {
    const keys = Object.entries(e.fields ?? {}).map(([k, f]) => [k, f.rowKey ?? k] as const);
    return keys.length ? Object.fromEntries(keys.map(([k, rk]) => [k, row[rk] ?? null])) : row;
  }

  async update(ctx: KitCtx, e: RecordEntity, id: string, body: Record<string, unknown>, mode: 'edit' | 'bulk' = 'edit'): Promise<Row> {
    this.assertWrite(ctx, e);
    const before = await this.get(ctx, e, id);
    const values = await this.parseFields(ctx, e, body, mode);
    await guarded(() => this.writeFields(ctx, e, id, values));
    const after = await this.get(ctx, e, id);
    const fields = values.map(([k]) => k);
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.updated`, subjectType: e.subjectType, subjectId: id, before: this.fieldValues(e, before), after: this.fieldValues(e, after), fields, data: { label: e.label(after), ...(mode === 'bulk' && { bulk: true }) } });
    return after;
  }

  async remove(ctx: KitCtx, e: RecordEntity, id: string) {
    this.assertWrite(ctx, e);
    const row = await this.get(ctx, e, id);
    return this.bin.moveToBin(ctx, e, id, row);
  }

  async move(ctx: KitCtx, e: RecordEntity, id: string, to: string, reason?: string) {
    this.assertWrite(ctx, e);
    const spec = e.move;
    if (!spec) throw new NotFoundException('Not found');
    const options = (await resolveOptions(ctx, spec.options)) ?? [];
    if (!options.some((o) => o.value === to)) throw new BadRequestException('Choose one of the listed places to move to');
    if (spec.reason && !reason?.trim()) throw new BadRequestException('Give a reason');
    const before = await this.get(ctx, e, id);
    if (spec.apply) await spec.apply(ctx, id, to, reason?.trim());
    else if (spec.column) {
      const cols = getTableColumns(e.table);
      const was = (await rawRow(ctx.tx, getTableName(e.table), id))?.[spec.column.name] ?? null;
      if (was === to) return before;
      await ctx.tx
        .update(e.table)
        .set({ [propOf(e, spec.column)]: to, ...('updatedAt' in cols && { updatedAt: new Date() }) })
        .where(eq(cols.id, id));
      const target = options.find((o) => o.value === to);
      await audit(ctx.tx, {
        tenantId: ctx.p.tenantId,
        actorType: 'user',
        actorId: ctx.p.userId,
        action: `${e.subjectType}.moved`,
        subjectType: e.subjectType,
        subjectId: id,
        changes: { [spec.column.name]: { before: was, after: to } },
        data: { label: e.label(before), to: target?.label ?? to, ...(reason && { reason }) },
      });
    }
    return this.get(ctx, e, id);
  }

  async duplicate(ctx: KitCtx, e: RecordEntity, id: string): Promise<Row> {
    this.assertWrite(ctx, e);
    if (!e.duplicate) throw new NotFoundException('Not found');
    const source = await this.get(ctx, e, id);
    const raw = await rawRow(ctx.tx, getTableName(e.table), id);
    if (!raw) throw new NotFoundException('Not found');
    const changes = await e.duplicate(ctx, raw);
    if (e.order) {
      // The copy goes right after the original.
      changes[e.order.column.name] = Number(raw[e.order.column.name] ?? 0) + 1;
    }
    const newId = await guarded(() => cloneRow(ctx.tx, getTableName(e.table), id, changes));
    const copy = await this.get(ctx, e, newId);
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.created`, subjectType: e.subjectType, subjectId: newId, after: this.fieldValues(e, copy), data: { label: e.label(copy), duplicateOf: id, from: e.label(source) } });
    return copy;
  }

  /**
   * Saves a manual order: `ids` in their new order, all from one group (a program's subjects). Records of the group
   * not listed keep their relative place after the listed ones.
   */
  async reorder(ctx: KitCtx, e: RecordEntity, ids: string[]): Promise<{ ids: string[] }> {
    this.assertWrite(ctx, e);
    if (!e.order) throw new NotFoundException('Not found');
    const cols = getTableColumns(e.table);
    const scope = e.order.scope ?? [];
    const pick = Object.fromEntries([['id', cols.id], ...scope.map((c) => [c.name, c])]);
    const rows = (await ctx.tx
      .select(pick)
      .from(e.table)
      .where(and(e.list.scope?.(ctx), inArray(cols.id, ids)))) as Row[];
    if (rows.length !== new Set(ids).size) throw new NotFoundException('Some records were not found');
    const groupOf = (r: Row) => JSON.stringify(scope.map((c) => r[c.name] ?? null));
    const groups = new Set(rows.map(groupOf));
    if (groups.size > 1) throw new BadRequestException('Records from different groups cannot be ordered together');
    const first = rows[0];
    const others = (await ctx.tx
      .select({ id: cols.id })
      .from(e.table)
      .where(and(...scope.map((c) => (first[c.name] === null ? sql`${c} is null` : eq(c, first[c.name]))), sql`${cols.id} not in (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`))
      .orderBy(e.order.column, cols.id)) as { id: string }[];
    const order = [...ids, ...others.map((o) => o.id)];
    const prop = propOf(e, e.order.column);
    const before = (await ctx.tx
      .select({ id: cols.id, n: e.order.column })
      .from(e.table)
      .where(inArray(cols.id, order))) as { id: string; n: number }[];
    const was = new Map(before.map((b) => [b.id, b.n]));
    for (const [i, id] of order.entries()) {
      const n = (i + 1) * 10;
      if (was.get(id) !== n) await ctx.tx.update(e.table).set({ [prop]: n }).where(eq(cols.id, id));
    }
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.reordered`, subjectType: e.subjectType, data: { ids: order } });
    return { ids: order };
  }

  /**
   * A bulk operation on the chosen records (or every match of the list), in one transaction with a savepoint per
   * record: a record that fails is reported and the rest go ahead, unless `atomic`, when one failure undoes all.
   */
  async bulk(ctx: KitCtx, e: RecordEntity, body: BulkBody): Promise<BulkReport> {
    this.assertWrite(ctx, e);
    const targets = await resolveTargets(e, ctx, body.target as BulkTarget);
    if (!targets.length) throw new BadRequestException('No records were chosen');
    let one: (c: KitCtx, row: Row) => Promise<string | void>;
    if (body.op === 'update') {
      // Checked once, before any row: a bad value fails the whole request.
      await this.parseFields(ctx, e, body.fields, 'bulk');
      one = async (c, row) => void (await this.update(c, e, String(row.id), body.fields, 'bulk'));
    } else if (body.op === 'delete') {
      one = async (c, row) => void (await this.bin.moveToBin(c, e, String(row.id), row));
    } else if (body.op === 'move') {
      if (!e.move) throw new NotFoundException('Not found');
      const options = (await resolveOptions(ctx, e.move.options)) ?? [];
      if (!options.some((o) => o.value === body.to)) throw new BadRequestException('Choose one of the listed places to move to');
      if (e.move.reason && !body.reason?.trim()) throw new BadRequestException('Give a reason');
      one = async (c, row) => void (await this.move(c, e, String(row.id), body.to, body.reason));
    } else {
      const action = e.actions?.[body.action];
      if (!action) throw new NotFoundException('Not found');
      if (!hasRole(ctx.p, action.roles ?? e.roles.write)) throw new ForbiddenException("Your account doesn't have access to this.");
      let params: unknown = body.params;
      if (action.params) {
        const parsed = action.params.safeParse(body.params ?? {});
        if (!parsed.success) throw new BadRequestException(z.flattenError(parsed.error));
        params = parsed.data;
      }
      one = (c, row) => action.apply(c, String(row.id), params);
    }

    const rows: BulkRowResult[] = [];
    let committed = true;
    const runAll = async (tx: KitCtx['tx']) => {
      for (const row of targets) {
        const label = e.label(row);
        try {
          const note = await tx.transaction((sp) => one({ tx: sp, p: ctx.p }, row));
          rows.push({ id: String(row.id), label, ok: true, ...(note && { message: note }) });
        } catch (err) {
          rows.push({ id: String(row.id), label, ok: false, ...rowError(err, label) });
        }
      }
      if (body.atomic && rows.some((r) => !r.ok)) throw ROLLBACK;
    };
    try {
      await ctx.tx.transaction(runAll);
    } catch (err) {
      if (err !== ROLLBACK) throw err;
      committed = false;
    }
    const failed = rows.filter((r) => !r.ok).length;
    const report: BulkReport = { op: body.op, atomic: !!body.atomic, committed, total: rows.length, succeeded: committed ? rows.length - failed : 0, failed, rows };
    if (committed && report.succeeded)
      await audit(ctx.tx, {
        tenantId: ctx.p.tenantId,
        actorType: 'user',
        actorId: ctx.p.userId,
        action: `${e.subjectType}.bulk_${body.op === 'action' ? body.action : body.op}`,
        subjectType: e.subjectType,
        data: { succeeded: report.succeeded, failed, ids: rows.filter((r) => r.ok).map((r) => r.id).slice(0, 500) },
      });
    return report;
  }

  /** The record's audit trail, newest first: who did what, when, and each field's value before and after. */
  async history(ctx: KitCtx, e: RecordEntity, id: string, limit: number, offset: number): Promise<{ items: HistoryEntry[]; total: number }> {
    const types = [e.subjectType, ...(e.historyTypes ?? [])];
    const where = and(inArray(auditLog.subjectType, types), eq(auditLog.subjectId, id));
    const [{ n }] = await ctx.tx.select({ n: count() }).from(auditLog).where(where);
    const rows = await ctx.tx
      .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, actorType: auditLog.actorType, actorId: auditLog.actorId, actorName: users.fullName, data: auditLog.data })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(limit)
      .offset(offset);
    const labelOf = (k: string) => e.fields?.[k]?.label ?? k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return {
      total: n,
      items: rows.map((r) => {
        const data: Record<string, unknown> | null = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? { ...(r.data as Record<string, unknown>) } : r.data === null ? null : { value: r.data };
        const raw = (data?.changes ?? {}) as Record<string, { before: unknown; after: unknown }>;
        if (data) delete data.changes;
        return {
          id: r.id,
          at: r.at.toISOString(),
          action: r.action,
          actor: { id: r.actorId, name: r.actorName, type: r.actorType },
          changes: Object.entries(raw).map(([field, c]) => ({ field, label: labelOf(field), before: c?.before ?? null, after: c?.after ?? null })),
          data: data && Object.keys(data).length ? data : null,
        };
      }),
    };
  }

  /** The list (its filters and sort, or only the chosen ids) as CSV or Excel, with the columns asked for. */
  async export(ctx: KitCtx, e: RecordEntity, q: Pick<ListQuery, 'q' | 'filters' | 'sort'>, format: 'csv' | 'xlsx', columnKeys?: string[], ids?: string[], except?: string[]): Promise<{ body: Buffer; contentType: string; fileName: string; rows: number }> {
    const cols = columnKeys?.length ? columnKeys.map((k) => e.columns.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => !!c) : e.columns;
    if (!cols.length) throw new BadRequestException('Choose at least one column');
    const rows = await listAll(e, ctx, q, MAX_EXPORT, ids, except);
    const cell = (c: (typeof cols)[number], r: Row) => {
      const v = c.value ? c.value(r) : r[c.key];
      if (v instanceof Date) return v.toISOString();
      return v === undefined || v === null ? null : typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
    };
    const table = [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => cell(c, r)))];
    const stamp = new Date().toISOString().slice(0, 10);
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.exported`, subjectType: e.subjectType, data: { format, rows: rows.length, columns: cols.map((c) => c.key), filters: q.filters, q: q.q ?? null, selected: ids?.length ?? null } });
    if (format === 'xlsx') return { body: writeWorkbook([{ name: e.key, rows: table, header: true, widths: cols.map((c) => Math.min(40, Math.max(10, c.header.length + 4))) }]), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${e.key}-${stamp}.xlsx`, rows: rows.length };
    const csv = table.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    return { body: Buffer.from('﻿' + csv, 'utf8'), contentType: 'text/csv; charset=utf-8', fileName: `${e.key}-${stamp}.csv`, rows: rows.length };
  }
}

/** A bulk request: which records, and what to do to them. */
export type BulkBody =
  | { op: 'update'; target: unknown; fields: Record<string, unknown>; atomic?: boolean }
  | { op: 'delete'; target: unknown; atomic?: boolean }
  | { op: 'move'; target: unknown; to: string; reason?: string; atomic?: boolean }
  | { op: 'action'; target: unknown; action: string; params?: unknown; atomic?: boolean };
