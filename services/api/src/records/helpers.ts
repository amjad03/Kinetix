import { and, eq, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Tx } from '../db/db.service.js';

/** Small pieces entity definitions share. */

const UUID = z.uuid();

/** `column = value` when the value is a uuid; otherwise no condition (a stale link with a bad id lists everything). */
export const uuidEq = (col: AnyColumn, v: string): SQL | undefined => (UUID.safeParse(v).success ? eq(col, v) : undefined);

/** Field schemas: the ERP sends numbers as numbers, but a typed-in "6" is accepted too. */
export const Text = (max = 200) => z.string().trim().min(1, 'This value is required').max(max);
export const OptionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();
export const Int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const Ref = z.uuid();
export const OptionalRef = z
  .union([z.uuid(), z.literal('')])
  .nullable()
  .transform((v) => (v === '' ? null : v));
export const DateText = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), z.literal('')])
  .nullable()
  .transform((v) => (v === '' ? null : v));

/**
 * A free name for a copy: "Physics (copy)", then "Physics (copy 2)" and so on, unique in `column` (within `scope`).
 * `max` keeps it within the column's limit.
 */
export async function copyName(tx: Tx, table: PgTable, column: AnyColumn, base: string, scope?: SQL, suffix = (n: number) => (n === 1 ? ' (copy)' : ` (copy ${n})`)): Promise<string> {
  for (let n = 1; n < 200; n++) {
    const name = `${base}${suffix(n)}`;
    const [hit] = await tx
      .select({ one: sql`1` })
      .from(table)
      .where(and(sql`lower(${column}) = ${name.toLowerCase()}`, scope))
      .limit(1);
    if (!hit) return name;
  }
  return `${base}${suffix(Date.now())}`;
}
