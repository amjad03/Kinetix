import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { FieldOption, KitCtx, RecordField } from '../records/entity.js';

/** Small pieces the fees and accounts record lists share: rupee fields over paise columns, comma lists, guards. */

/** A rupee amount typed in the form, kept in paise. */
export const Rupees = z.coerce.number().min(0, 'Use 0 or more').max(10_000_000_00);

/** The column's value in rupees, for the list row (the form shows rupees). */
export const rupeesOf = (col: AnyPgColumn | SQL) => sql<number | null>`(${col}::numeric / 100)`.mapWith((v) => (v === null ? null : Number(v)));

const propOf = (table: PgTable, column: AnyPgColumn) => {
  const hit = Object.entries(getTableColumns(table)).find(([, c]) => c === column);
  if (!hit) throw new Error('Column is not on the table');
  return hit[0];
};

/** Writes one column of the record (used by fields that convert their value first). */
export async function setColumn(ctx: KitCtx, table: PgTable, column: AnyPgColumn, id: string, value: unknown) {
  const cols = getTableColumns(table) as Record<string, AnyPgColumn>;
  await ctx.tx
    .update(table)
    .set({ [propOf(table, column)]: value })
    .where(eq(cols.id, id));
}

/** A rupee field stored in a paise column; the list row gives the rupees under `rowKey`. */
export function rupeeField(label: string, table: PgTable, column: AnyPgColumn, rowKey: string, o: Partial<RecordField> = {}): RecordField {
  return { label, type: 'number', schema: Rupees, rowKey, apply: (ctx, id, v) => setColumn(ctx, table, column, id, Math.round(Number(v) * 100)), ...o };
}

/** "TUI, LAB" ⇄ ['TUI', 'LAB']: a list of codes typed with commas. */
export const CodeList = z
  .string()
  .trim()
  .max(300)
  .transform((v) => [...new Set(v.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))]);
export const joinCodes = (col: AnyPgColumn) => sql<string>`array_to_string(${col}, ', ')`;

/** A guard that refuses every delete with a reason (records that are cancelled or voided, never deleted). */
export const never = (why: string) => async () => why;

/** The row as it stands, or a 404. */
export async function rowOf<T>(ctx: KitCtx, table: PgTable, id: string): Promise<T> {
  const cols = getTableColumns(table) as Record<string, AnyPgColumn>;
  const [r] = (await ctx.tx.select().from(table).where(eq(cols.id, id))) as T[];
  if (!r) throw new NotFoundException('Not found');
  return r;
}

/** Refuses a change unless the record's status is one of these. */
export function assertStatus(status: string, allowed: string[], message: string) {
  if (!allowed.includes(status)) throw new ConflictException(message);
}

const ACRONYMS: Record<string, string> = { nri: 'NRI', dd: 'Demand draft', upi: 'UPI', bank_transfer: 'Bank transfer (NEFT/RTGS)' };
export const opts = (values: string[], label = (v: string) => ACRONYMS[v] ?? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())): FieldOption[] => values.map((v) => ({ value: v, label: label(v) }));
