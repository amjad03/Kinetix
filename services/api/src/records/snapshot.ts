import { ConflictException, HttpException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import type { DeletedSnapshot } from '../db/schema.js';

/**
 * The recycle bin's engine: before a record is deleted, its row, every row the database will cascade away with it
 * (found from the foreign keys in the catalog, any depth) and every link the database will set to null are kept as
 * JSON. Restoring puts them back in the same order with their original ids, so links from elsewhere work again.
 * Nothing here knows about any one table, which is what lets every module use the bin.
 */

/** More rows than this go with a delete only by mistake; the record is archived instead. */
export const MAX_SNAPSHOT_ROWS = 10_000;

/** Rows that must never come back with a restored person: sign-in sessions, one-time codes, device tokens. */
const NEVER_RESTORED = new Set(['user_sessions', 'otp_codes', 'sso_login_tickets', 'trusted_devices', 'push_devices', 'pairing_codes']);

interface FkEdge {
  parent: string;
  child: string;
  childCols: string[];
  parentCols: string[];
  /** c cascade, n set null, d set default, a no action, r restrict. */
  onDelete: string;
}

interface TableInfo {
  /** Columns that can be inserted (not generated). */
  columns: string[];
  pk: string[];
  identityAlways: boolean;
}

let graphCache: Promise<Map<string, FkEdge[]>> | undefined;
const tableCache = new Map<string, Promise<TableInfo>>();

/**
 * Foreign keys of the public schema by referenced table (and by referencing table under `^<table>`); read once per
 * process (the schema changes only on deploy).
 */
function fkGraph(tx: Tx): Promise<Map<string, FkEdge[]>> {
  graphCache ??= (async () => {
    const { rows } = await tx.execute<{ child: string; parent: string; del: string; child_cols: string[]; parent_cols: string[] }>(sql`
      select cl.relname as child, pl.relname as parent, c.confdeltype as del,
        array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as child_cols,
        array(select a.attname::text from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parent_cols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_class pl on pl.oid = c.confrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      where c.contype = 'f' and ns.nspname = 'public' and c.conparentid = 0 and has_table_privilege(c.conrelid, 'SELECT')`);
    const g = new Map<string, FkEdge[]>();
    for (const r of rows) {
      const edge = { parent: r.parent, child: r.child, childCols: r.child_cols, parentCols: r.parent_cols, onDelete: r.del };
      g.set(r.parent, [...(g.get(r.parent) ?? []), edge]);
      g.set(`^${r.child}`, [...(g.get(`^${r.child}`) ?? []), edge]);
    }
    return g;
  })().catch((e: unknown) => {
    graphCache = undefined;
    throw e;
  });
  return graphCache;
}

function tableInfo(tx: Tx, table: string): Promise<TableInfo> {
  let info = tableCache.get(table);
  if (!info) {
    info = (async () => {
      const { rows } = await tx.execute<{ name: string; generated: string; identity: string; pk: boolean }>(sql`
        select a.attname::text as name, a.attgenerated::text as generated, a.attidentity::text as identity,
          exists (select 1 from pg_index i where i.indrelid = a.attrelid and i.indisprimary and a.attnum = any(i.indkey)) as pk
        from pg_attribute a
        where a.attrelid = to_regclass(${`public.${table}`}) and a.attnum > 0 and not a.attisdropped
        order by a.attnum`);
      if (!rows.length) throw new Error(`Unknown table ${table}`);
      return { columns: rows.filter((r) => !r.generated).map((r) => r.name), pk: rows.filter((r) => r.pk).map((r) => r.name), identityAlways: rows.some((r) => r.identity === 'a') };
    })();
    tableCache.set(table, info);
    info.catch(() => tableCache.delete(table));
  }
  return info;
}

const ident = (name: string) => sql.identifier(name);
const matches = (cols: string[], values: unknown[]): SQL =>
  sql.join(
    cols.map((c, i) => sql`${ident(c)} = ${values[i]}`),
    sql` and `,
  );

async function selectRows(tx: Tx, table: string, where: SQL): Promise<Record<string, unknown>[]> {
  const { rows } = await tx.execute<{ r: Record<string, unknown> }>(sql`select to_jsonb(t) as r from ${ident(table)} t where ${where}`);
  return rows.map((x) => x.r);
}

/** The Postgres error behind a query error (drizzle wraps it). */
export function pgError(e: unknown): { code?: string; detail?: string; table?: string; constraint?: string } | undefined {
  const err = e as { code?: unknown; cause?: unknown };
  if (typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) return err as { code: string };
  if (err?.cause) return pgError(err.cause);
  return undefined;
}

/** Tables whose names are not the words people use. */
const TABLE_WORDS: Record<string, string> = { sections: 'classes', programs: 'programmes', timetable_slots: 'timetable periods', users: 'people', department_staff: 'department staff' };

/** "fee_invoices" → "fee invoices", "sections" → "classes". */
export const tableWords = (table: string) => TABLE_WORDS[table] ?? table.replace(/_/g, ' ');

/** A delete the database refused because other records still point at this one. */
export function inUseError(e: unknown, label: string): HttpException | undefined {
  const pg = pgError(e);
  if (pg?.code !== '23503') return undefined;
  const table = /referenced from table "([^"]+)"/.exec(pg.detail ?? '')?.[1] ?? pg.table ?? 'other records';
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'RECORD_IN_USE',
    message: `${label} cannot be deleted because ${tableWords(table)} still refer to it. Remove or reassign those first, or mark it inactive instead.`,
    table,
  });
}

/**
 * Captures the record and everything the delete will take with it, then deletes it. `dependents` are rows linked
 * without a foreign key, deleted (and kept) first. Throws RECORD_IN_USE when a restricting key refuses the delete.
 */
export async function captureAndDelete(tx: Tx, table: string, id: string, label: string, dependents: { table: string; column: string }[] = []): Promise<DeletedSnapshot & { count: number }> {
  const graph = await fkGraph(tx);
  const [root] = await selectRows(tx, table, sql`${ident('id')} = ${id}`);
  if (!root) throw new ConflictException('This record was already deleted');
  const snap: DeletedSnapshot = { root, rows: [], nulled: [] };
  const seen = new Set<string>([`${table}:${id}`]);
  let count = 1;
  const queue: { table: string; row: Record<string, unknown> }[] = [{ table, row: root }];

  const take = async (child: string, row: Record<string, unknown>) => {
    const info = await tableInfo(tx, child);
    const key = `${child}:${JSON.stringify((info.pk.length ? info.pk : info.columns).map((c) => row[c]))}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (++count > MAX_SNAPSHOT_ROWS) throw tooLarge(label);
    snap.rows.push({ table: child, row });
    queue.push({ table: child, row });
  };

  for (const d of dependents) for (const row of await selectRows(tx, d.table, sql`${ident(d.column)} = ${id}`)) await take(d.table, row);

  while (queue.length) {
    const { table: parent, row } = queue.shift()!;
    for (const edge of graph.get(parent) ?? []) {
      const values = edge.parentCols.map((c) => row[c]);
      if (values.some((v) => v === null || v === undefined)) continue;
      if (edge.onDelete === 'c') {
        for (const child of await selectRows(tx, edge.child, matches(edge.childCols, values))) await take(edge.child, child);
      } else if (edge.onDelete === 'n' || edge.onDelete === 'd') {
        const info = await tableInfo(tx, edge.child);
        const keyCols = info.pk.length ? info.pk : info.columns;
        const { rows } = await tx.execute<{ k: Record<string, unknown> }>(
          sql`select jsonb_build_object(${sql.join(
            keyCols.map((c) => sql`${c}::text, ${ident(c)}`),
            sql`, `,
          )}) as k from ${ident(edge.child)} where ${matches(edge.childCols, values)}`,
        );
        if (!rows.length) continue;
        count += rows.length;
        if (count > MAX_SNAPSHOT_ROWS) throw tooLarge(label);
        snap.nulled.push({ table: edge.child, columns: edge.childCols, values, keys: rows.map((r) => r.k) });
      }
    }
  }

  try {
    await tx.transaction(async (sp) => {
      for (const d of dependents) await sp.execute(sql`delete from ${ident(d.table)} where ${ident(d.column)} = ${id}`);
      await sp.execute(sql`delete from ${ident(table)} where ${ident('id')} = ${id}`);
    });
  } catch (e) {
    throw inUseError(e, label) ?? e;
  }
  return { ...snap, count };
}

const tooLarge = (label: string) =>
  new ConflictException({ statusCode: 409, error: 'Conflict', code: 'RECORD_TOO_LARGE', message: `${label} has too much linked history to delete. Mark it inactive instead.` });

async function insertRow(tx: Tx, table: string, row: Record<string, unknown>): Promise<void> {
  const info = await tableInfo(tx, table);
  const cols = info.columns.filter((c) => Object.hasOwn(row, c));
  const list = sql.join(
    cols.map((c) => ident(c)),
    sql`, `,
  );
  await tx.execute(
    sql`insert into ${ident(table)} (${list}) ${info.identityAlways ? sql`overriding system value` : sql``} select ${list} from jsonb_populate_record(null::${ident(table)}, ${JSON.stringify(row)}::jsonb)`,
  );
}

/** The first record a row links to that no longer exists. */
async function missingParent(tx: Tx, table: string, row: Record<string, unknown>): Promise<{ table: string; id: string } | undefined> {
  const graph = await fkGraph(tx);
  for (const edge of graph.get(`^${table}`) ?? []) {
    const values = edge.childCols.map((c) => row[c]);
    if (values.some((v) => v === null || v === undefined)) continue;
    const [hit] = await selectRows(tx, edge.parent, matches(edge.parentCols, values));
    if (!hit) return { table: edge.parent, id: String(values[0]) };
  }
  return undefined;
}

export interface RestoreReport {
  /** Rows put back, the record included. */
  restored: number;
  /** Linked rows that could not come back (their own parent is gone, or a newer row took their place). */
  skipped: { table: string; reason: string }[];
}

/** Why a restore failed, in words the person can act on. `missingParent` names the record to restore first. */
export class RestoreError extends ConflictException {
  constructor(message: string, code: string, extra: Record<string, unknown> = {}) {
    super({ statusCode: 409, error: 'Conflict', message, code, ...extra });
  }
}

/** Puts a captured record back. The caller names the missing parent from the bin (see RecycleBinService). */
export async function restoreSnapshot(tx: Tx, table: string, snap: DeletedSnapshot, label: string, explainMissing: (table: string, id: string) => Promise<string | null>): Promise<RestoreReport> {
  const id = String(snap.root.id);
  const [exists] = await selectRows(tx, table, sql`${ident('id')} = ${id}`);
  if (exists) throw new RestoreError(`${label} already exists, so there is nothing to restore.`, 'RESTORE_EXISTS');
  try {
    await tx.transaction((sp) => insertRow(sp, table, snap.root));
  } catch (e) {
    const pg = pgError(e);
    if (pg?.code === '23503') {
      // Row-level security keeps the key out of the error, so find the missing parent ourselves.
      const missing = await missingParent(tx, table, snap.root);
      const parentTable = missing?.table ?? /in table "([^"]+)"/.exec(pg.detail ?? '')?.[1] ?? 'another table';
      const parentId = missing?.id ?? '';
      const hint = parentId ? await explainMissing(parentTable, parentId) : null;
      throw new RestoreError(
        hint
          ? `${label} cannot be restored because "${hint}" (${tableWords(parentTable)}) was deleted. Restore "${hint}" first.`
          : `${label} cannot be restored because the ${tableWords(parentTable)} record it belongs to no longer exists.`,
        'RESTORE_PARENT_MISSING',
        { table: parentTable, recordId: parentId || null, blockedBy: hint },
      );
    }
    if (pg?.code === '23505') {
      const m = /Key \(([^)]+)\)=\(([^)]+)\) already exists/.exec(pg.detail ?? '');
      throw new RestoreError(
        m ? `${label} cannot be restored because another record now has the same ${tableWords(m[1].replace(/\btenant_id,\s*/g, ''))} (${m[2].replace(/^[0-9a-f-]{36},\s*/i, '')}). Change that record first.` : `${label} cannot be restored because another record now has the same details.`,
        'RESTORE_DUPLICATE',
      );
    }
    throw e;
  }

  const report: RestoreReport = { restored: 1, skipped: [] };
  const skip = (t: string, e: unknown) => {
    const pg = pgError(e);
    if (pg?.code !== '23503' && pg?.code !== '23505') throw e;
    const reason = pg.code === '23503' ? 'linked record missing' : 'duplicate';
    const s = report.skipped.find((x) => x.table === t && x.reason === reason);
    if (!s) report.skipped.push({ table: t, reason });
  };
  for (const r of snap.rows) {
    if (NEVER_RESTORED.has(r.table)) continue;
    try {
      await tx.transaction((sp) => insertRow(sp, r.table, r.row));
      report.restored++;
    } catch (e) {
      skip(r.table, e);
    }
  }
  for (const n of snap.nulled) {
    const info = await tableInfo(tx, n.table);
    const set = sql.join(
      n.columns.map((c, i) => sql`${ident(c)} = ${n.values[i]}`),
      sql`, `,
    );
    const unset = sql.join(
      n.columns.map((c) => sql`${ident(c)} is null`),
      sql` and `,
    );
    for (let i = 0; i < n.keys.length; i += 200) {
      const keys = n.keys.slice(i, i + 200);
      const keyCols = Object.keys(keys[0] ?? {}).filter((c) => info.columns.includes(c));
      if (!keyCols.length) continue;
      const any = sql.join(
        keys.map((k) => sql`(${matches(keyCols, keyCols.map((c) => k[c]))})`),
        sql` or `,
      );
      try {
        await tx.transaction(async (sp) => {
          const res = await sp.execute(sql`update ${ident(n.table)} set ${set} where (${any}) and ${unset}`);
          report.restored += res.rowCount ?? 0;
        });
      } catch (e) {
        skip(n.table, e);
      }
    }
  }
  return report;
}

/** Copies a row with a new id and the changes given (database column names). Returns the new id. */
export async function cloneRow(tx: Tx, table: string, id: string, changes: Record<string, unknown>): Promise<string> {
  const [row] = await selectRows(tx, table, sql`${ident('id')} = ${id}`);
  if (!row) throw new ConflictException('This record no longer exists');
  const info = await tableInfo(tx, table);
  const copy: Record<string, unknown> = { ...row, ...changes };
  delete copy.id;
  for (const c of ['created_at', 'updated_at']) if (info.columns.includes(c)) copy[c] = new Date().toISOString();
  const cols = info.columns.filter((c) => Object.hasOwn(copy, c));
  const list = sql.join(
    cols.map((c) => ident(c)),
    sql`, `,
  );
  const { rows } = await tx.execute<{ id: string }>(sql`insert into ${ident(table)} (${list}) select ${list} from jsonb_populate_record(null::${ident(table)}, ${JSON.stringify(copy)}::jsonb) returning id::text as id`);
  return rows[0].id;
}

/** The row as the database holds it (column names), for duplicate. */
export async function rawRow(tx: Tx, table: string, id: string): Promise<Record<string, unknown> | undefined> {
  return (await selectRows(tx, table, sql`${ident('id')} = ${id}`))[0];
}
