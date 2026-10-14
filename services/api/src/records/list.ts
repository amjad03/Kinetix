import { BadRequestException } from '@nestjs/common';
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, notInArray, or, type AnyColumn, type SQL } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { KitCtx, RecordEntity, Row } from './entity.js';

/** Largest page a list returns, and the most rows "all matching" or an export may cover. */
export const MAX_PAGE_SIZE = 200;
export const MAX_MATCHING = 5000;
export const MAX_EXPORT = 50_000;

/** What a list shows: search, filters, sort and page. The same shape travels in bulk "all matching" requests. */
export const ListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filters: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/), z.string().max(200)).default({}),
  sort: z.object({ id: z.string().max(60), dir: z.enum(['asc', 'desc']) }).nullable().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

/**
 * A list query from URL parameters: `q`, `sort=<key>:<asc|desc>`, `page`, `pageSize` and one `f.<filter>=<value>`
 * per filter (the ERP keeps the same names in its own URL, so a shared link opens the same list).
 */
export function listQueryFromParams(params: Record<string, unknown>): ListQuery {
  const filters: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (k.startsWith('f.') && typeof v === 'string' && v !== '') filters[k.slice(2)] = v;
  const sortText = typeof params.sort === 'string' ? params.sort : '';
  const [id, dir] = sortText.split(':');
  const parsed = ListQuerySchema.safeParse({
    q: typeof params.q === 'string' ? params.q : undefined,
    filters,
    sort: id ? { id, dir: dir === 'desc' ? 'desc' : 'asc' } : null,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  });
  if (!parsed.success) throw new BadRequestException(z.flattenError(parsed.error));
  return parsed.data;
}

const idColumn = (e: RecordEntity): AnyColumn => {
  const col = getTableColumns(e.table).id;
  if (!col) throw new Error(`Record entity ${e.key} has no id column`);
  return col;
};

/** The search, filter and visibility conditions of a list. */
export function whereOf(e: RecordEntity, ctx: KitCtx, q: Pick<ListQuery, 'q' | 'filters'>): SQL | undefined {
  const parts: (SQL | undefined)[] = [e.list.scope?.(ctx)];
  const words = (q.q ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/[\\%_]/g, (c) => `\\${c}`))
    .filter(Boolean)
    .slice(0, 8);
  if (words.length && e.list.search?.length) for (const w of words) parts.push(or(...e.list.search.map((c) => ilike(c as AnyColumn, `%${w}%`))));
  for (const [key, value] of Object.entries(q.filters ?? {})) {
    const f = e.list.filters?.[key];
    if (f && value) parts.push(f.where(value, ctx));
  }
  return and(...parts);
}

/** The ordering: the chosen sort (or the manual order of an orderable list), then the id so pages never overlap. */
export function orderOf(e: RecordEntity, sort: ListQuery['sort']): SQL[] {
  const chosen = sort && e.list.sorts[sort.id] ? sort : null;
  const by = (expr: AnyColumn | SQL, dir: 'asc' | 'desc') => (dir === 'desc' ? desc(expr) : asc(expr));
  const out: SQL[] = [];
  if (chosen) out.push(by(e.list.sorts[chosen.id], chosen.dir));
  else {
    if (e.order) out.push(...(e.order.scope ?? []).map((c) => asc(c)), asc(e.order.column));
    out.push(by(e.list.sorts[e.list.defaultSort.id], e.list.defaultSort.dir));
  }
  out.push(...(e.list.tiebreak ?? []).map((c) => asc(c)), asc(idColumn(e)));
  return out;
}

function base(e: RecordEntity, ctx: KitCtx, fields: Parameters<KitCtx['tx']['select']>[0]) {
  const q = ctx.tx.select(fields).from(e.table).$dynamic();
  return (e.list.joins ? e.list.joins(q as unknown as PgSelect) : q) as typeof q;
}

/** A list row with `_label`, the record's name as the bin, reports and dialogs show it. */
const withLabel = (e: RecordEntity, row: Row): Row => ({ ...row, _label: e.label(row) });

/** One page of the list and the number of matching records. */
export async function listPage(e: RecordEntity, ctx: KitCtx, q: ListQuery): Promise<{ rows: Row[]; total: number; page: number; pageSize: number }> {
  const where = whereOf(e, ctx, q);
  const [{ n }] = (await base(e, ctx, { n: count() }).where(where)) as { n: number }[];
  const pages = Math.max(1, Math.ceil(n / q.pageSize));
  const page = Math.min(q.page, pages);
  const rows = (await base(e, ctx, e.list.select)
    .where(where)
    .orderBy(...orderOf(e, q.sort))
    .limit(q.pageSize)
    .offset((page - 1) * q.pageSize)) as Row[];
  return { rows: rows.map((r) => withLabel(e, r)), total: n, page, pageSize: q.pageSize };
}

/** Every matching row in list order (exports), at most `limit`. `ids` narrows to the chosen records; `except` leaves some out. */
export async function listAll(e: RecordEntity, ctx: KitCtx, q: Pick<ListQuery, 'q' | 'filters' | 'sort'>, limit: number, ids?: string[], except?: string[]): Promise<Row[]> {
  const where = and(whereOf(e, ctx, q), ids ? inArray(idColumn(e), ids) : undefined, except?.length ? notInArray(idColumn(e), except) : undefined);
  return (await base(e, ctx, e.list.select)
    .where(where)
    .orderBy(...orderOf(e, q.sort))
    .limit(limit)) as Row[];
}

/** One record as the list shows it, if this person may see it. */
export async function listRow(e: RecordEntity, ctx: KitCtx, id: string): Promise<Row | undefined> {
  if (!z.uuid().safeParse(id).success) return undefined;
  const [row] = (await base(e, ctx, e.list.select)
    .where(and(e.list.scope?.(ctx), eq(idColumn(e), id)))
    .limit(1)) as Row[];
  return row && withLabel(e, row);
}

/** The rows a bulk request names: the ids given (only those this person may see), or every match of a list query. */
export async function resolveTargets(e: RecordEntity, ctx: KitCtx, target: BulkTarget): Promise<Row[]> {
  if ('ids' in target) {
    const ids = [...new Set(target.ids)];
    const rows = (await base(e, ctx, e.list.select).where(and(e.list.scope?.(ctx), inArray(idColumn(e), ids)))) as Row[];
    // In the order given, so the report reads like the selection.
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return ids.map((id) => byId.get(id)).filter((r): r is Row => !!r);
  }
  const except = new Set(target.except ?? []);
  const rows = (await base(e, ctx, e.list.select)
    .where(whereOf(e, ctx, target.query))
    .orderBy(...orderOf(e, target.query.sort))
    .limit(MAX_MATCHING + except.size + 1)) as Row[];
  const out = rows.filter((r) => !except.has(String(r.id)));
  if (out.length > MAX_MATCHING) throw new BadRequestException(`More than ${MAX_MATCHING} records match. Narrow the list with filters first.`);
  return out;
}

export const BulkTargetSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(MAX_MATCHING) }),
  z.object({ all: z.literal(true), query: ListQuerySchema.omit({ page: true, pageSize: true }), except: z.array(z.uuid()).max(MAX_MATCHING).optional() }),
]);
export type BulkTarget = z.infer<typeof BulkTargetSchema>;

/** Counts records per scope value (reorder checks that all ids share one scope). */
export const scopeKey = (row: Record<string, unknown>, cols: string[]) => JSON.stringify(cols.map((c) => row[c] ?? null));

