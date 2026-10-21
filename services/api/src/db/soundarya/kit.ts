/** Small helpers for the Soundarya demo seed: bulk inserts by column name, a seeded random source and date maths. */
import type pg from 'pg';

/** Wraps a value that must be stored as JSON even when it is an array. */
export class Json {
  constructor(readonly value: unknown) {}
}
export const J = (value: unknown) => new Json(value);

export type Row = Record<string, unknown>;
const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const encode = (v: unknown): unknown => {
  if (v instanceof Json) return JSON.stringify(v.value);
  if (v === undefined) return null;
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v);
  return v;
};

/** Deterministic random numbers so every run produces the same demo. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
    /** Roughly normal (sum of uniforms). */
    gauss: (mean: number, sd: number) => mean + sd * ((next() + next() + next() + next() - 2) / 0.5774 / 2),
  };
}
export type Rng = ReturnType<typeof rng>;

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400_000));
/** ISO weekday, Monday = 1 ... Sunday = 7. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
export const at = (date: string, time = '10:00') => new Date(`${date}T${time}:00+05:30`);
export const rupees = (n: number) => Math.round(n * 100);

const camelRow = (r: Row): Row => {
  const o: Row = {};
  for (const [k, v] of Object.entries(r)) o[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return o;
};

let readPool: pg.Pool | null = null;
/** Sets the app-role pool used for tenant-scoped reads (see `q`). */
export function setReadPool(p: pg.Pool | null): void {
  readPool = p;
}

export function makeKit(pool: pg.Pool, tenantId: string) {
  /**
   * Inserts rows (adding tenant_id unless `noTenant`) and returns the inserted rows.
   * Keys are camelCase column names; a key missing from some rows falls back to the column default.
   */
  async function ins<T = Row>(table: string, rows: Row | Row[], o: { noTenant?: boolean; returning?: boolean } = {}): Promise<T[]> {
    const list = (Array.isArray(rows) ? rows : [rows]).map((r) => (o.noTenant ? r : { tenantId, ...r }));
    if (list.length === 0) return [];
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    const maxRows = Math.max(1, Math.floor(30000 / cols.length));
    const out: T[] = [];
    for (let i = 0; i < list.length; i += maxRows) {
      const chunk = list.slice(i, i + maxRows);
      const params: unknown[] = [];
      const values = chunk
        .map((r) => `(${cols.map((c) => (!(c in r) || r[c] === null || r[c] === undefined ? 'DEFAULT' : (params.push(encode(r[c])), `$${params.length}`))).join(',')})`)
        .join(',');
      const res = await pool.query(`insert into ${table} (${cols.map(snake).join(',')}) values ${values}${o.returning === false ? '' : ' returning *'}`, params);
      if (o.returning !== false) out.push(...(res.rows.map(camelRow) as T[]));
    }
    return out;
  }
  const one = async <T = Row>(table: string, row: Row, o: { noTenant?: boolean } = {}) => (await ins<T>(table, row, o))[0];
  const q = async <T = Row>(sql: string, params: unknown[] = []) => {
    // Reads go through the app role with the tenant set, so row-level security keeps them to this tenant
    // (the owner role bypasses it, and the database may hold other demo institutions).
    if (readPool && tenantId && /^\s*select\b/i.test(sql)) {
      const client = await readPool.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
        const res = await client.query(sql, params);
        await client.query('commit');
        return res.rows.map(camelRow) as T[];
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    }
    return (await pool.query(sql, params)).rows.map(camelRow) as T[];
  };
  return { ins, one, q, tenantId, pool };
}
export type Kit = ReturnType<typeof makeKit>;

/** Removes a tenant and every row it owns (other tenants and the global library are untouched); safe when it does not exist. */
export async function wipeTenant(pool: pg.Pool, slug: string): Promise<void> {
  const found = await pool.query('select id from tenants where slug = $1', [slug]);
  if (found.rowCount === 0) return;
  const tenantId = found.rows[0].id as string;
  const tables = (await pool.query("select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' and table_name <> 'tenants' order by 1")).rows.map((r) => r.table_name as string);
  let remaining = tables;
  // Foreign keys between tenant tables decide the order: retry what failed until everything is gone.
  for (let pass = 0; pass < 12 && remaining.length; pass++) {
    const next: string[] = [];
    for (const t of remaining) {
      try {
        await pool.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
      } catch {
        next.push(t);
      }
    }
    remaining = next;
  }
  if (remaining.length) throw new Error(`Could not clear: ${remaining.join(', ')}`);
  await pool.query('delete from tenants where id = $1', [tenantId]);
}
