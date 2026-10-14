import { and, asc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getTableColumns } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/db.service.js';
import { sections, students, userRoles, users } from '../db/schema.js';
import { fail } from '../import/row-helpers.js';
import type { FieldOption, KitCtx } from '../records/entity.js';

/**
 * Pieces the campus life, welfare, communication and LMS record kit entities share: people pickers, money in
 * rupees over paise columns, and an insert that stamps the tenant and who created the record.
 */

/** Active staff (anyone with a role other than student, guardian or alumni), by name. */
export async function staffOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, 'active'), notInArray(userRoles.role, ['student', 'guardian', 'alumni', 'external_examiner'])))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** Students in the institution's classes, grouped by class: "R12 Asha Rao". */
export async function studentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: students.id, name: students.fullName, roll: students.rollNo, cls: sections.displayName })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .where(inArray(students.status, ['active', 'enrolled', 'on_leave']))
    .orderBy(asc(sections.displayName), asc(students.rollNo));
  return rows.map((r) => ({ value: r.id, label: `${r.roll} ${r.name}`, group: r.cls }));
}

/** A student named in an import row by roll number (and optionally the class). */
export async function studentByRoll(tx: Tx, roll: string, className?: string): Promise<string> {
  const rows = await tx
    .select({ id: students.id })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .where(and(sql`lower(${students.rollNo}) = ${roll.toLowerCase()}`, className ? sql`lower(${sections.displayName}) = ${className.toLowerCase()}` : undefined));
  if (rows.length === 0) fail('No student with this roll number', roll);
  if (rows.length > 1) fail('More than one student has this roll number: give the class too', roll);
  return rows[0].id;
}

/** A member of staff named in an import row by email. */
export async function staffByEmail(tx: Tx, email: string): Promise<string> {
  const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
  if (!u) fail('No member of staff with this email', email);
  return u!.id;
}

/** Rupees as typed (a number, up to two decimals) for a paise column. */
export const Rupees = z.coerce.number().min(0).max(100_000_000).transform((v) => Math.round(v * 100));
export const rupeesOf = (col: SQL | unknown) => sql<number>`round(${col}::numeric / 100, 2)::float8`;

/** Inserts a kit record with the tenant and (when the table has the column) who created it. Returns its id. */
export async function insertRecord(ctx: KitCtx, table: PgTable, values: Record<string, unknown>, createdByColumn = 'createdBy'): Promise<string> {
  const cols = getTableColumns(table) as Record<string, unknown>;
  const row = { tenantId: ctx.p.tenantId, ...(createdByColumn in cols ? { [createdByColumn]: ctx.p.userId } : {}), ...values };
  const [out] = (await ctx.tx.insert(table).values(row as never).returning({ id: (cols as { id: never }).id })) as { id: string }[];
  return out.id;
}

/**
 * A column written with its table name, for correlated subqueries: drizzle leaves the table off when a select has
 * no joins, and an unqualified "id" inside `(select … from x where x.ref = id)` would mean x's own id.
 */
export const qualified = (table: string, column = 'id') => sql.raw(`"${table}"."${column}"`);

/** The academic year label for a date: "2026-27" (years start in June). */
export function yearLabelOf(d: Date): string {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 5 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
