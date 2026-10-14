import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, asc, eq, getTableName, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { sections, students, tenants, userRoles, users } from '../db/schema.js';
import type { FieldOption, KitCtx, ListFilter } from '../records/entity.js';
import { localParts } from './time.js';

/** Small pieces the library, hostel and transport record lists share (on top of records/helpers.ts). */

/**
 * A column always written with its table ("hostel_rooms"."id"). Drizzle leaves the table off in a query on one table,
 * which makes a correlated subquery's `c.room_id = "id"` match its own row; subqueries use this instead.
 */
export const qual = (col: AnyColumn) => sql.raw(`"${getTableName(col.table)}"."${col.name}"`);

/** Money is typed in rupees in the forms and kept in paise. */
export const Rupees = z.coerce
  .number()
  .min(0, 'The amount cannot be negative')
  .max(100_000_000)
  .transform((v) => Math.round(v * 100));
/** A rupee amount that may be left empty (null). */
export const OptionalRupees = z
  .union([z.literal(''), z.null(), z.coerce.number().min(0).max(100_000_000)])
  .transform((v) => (v === '' || v === null ? null : Math.round(v * 100)));
/** A paise column shown in rupees. */
export const rupeesOf = (col: AnyColumn | SQL) => sql<number | null>`(${col})::float8 / 100`.mapWith((v) => (v === null ? null : Number(v)));
export const Bool = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');
export const OptionalInt = (min: number, max: number) =>
  z
    .union([z.literal(''), z.null(), z.coerce.number().int().min(min).max(max)])
    .transform((v) => (v === '' || v === null ? null : v));
export const OptionalDecimal = (min: number, max: number) =>
  z
    .union([z.literal(''), z.null(), z.coerce.number().min(min).max(max)])
    .transform((v) => (v === '' || v === null ? null : v));
export const Hhmm = z.union([z.literal(''), z.null(), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 07:30')]).transform((v) => (v ? v : null));
export const Url = z.url('Give a full link starting with https://').max(1000);

/** Fixed choices from [value, label] pairs. */
export const choices = (...pairs: [string, string][]): FieldOption[] => pairs.map(([value, label]) => ({ value, label }));
/** An export cell showing a choice's words instead of its stored value. */
export const wordsOf = (list: FieldOption[], key: string) => (r: Record<string, unknown>) => list.find((o) => o.value === r[key])?.label ?? (r[key] as string | null);
/** A schema accepting one of the choices. */
export const oneOf = (list: FieldOption[]) => z.string().refine((v) => list.some((o) => o.value === v), 'Choose one of the listed values');
/** A filter on a column with fixed choices. */
export const choiceFilter = (label: string, col: AnyColumn, list: FieldOption[]): ListFilter => ({ label, options: list, where: (v) => (list.some((o) => o.value === v) ? eq(col, v) : undefined) });
/** A yes/no filter from two conditions. */
export const yesNo = (label: string, yes: SQL, no: SQL, words: [string, string] = ['Yes', 'No']): ListFilter => ({ label, options: choices(['yes', words[0]], ['no', words[1]]), where: (v) => (v === 'yes' ? yes : v === 'no' ? no : undefined) });

export async function todayIn(tx: Tx, now: Date): Promise<string> {
  const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
  return localParts(now, t?.tz ?? 'Asia/Kolkata').date;
}

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Active staff (people with a staff role), optionally with one of the given roles. */
export async function staffOptions(ctx: KitCtx, roles?: RoleName[]): Promise<FieldOption[]> {
  const notStaff = ['student', 'guardian', 'driver'];
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, 'active'), roles?.length ? inArray(userRoles.role, roles) : sql`${userRoles.role}::text not in (${sql.join(notStaff.map((r) => sql`${r}`), sql`, `)})`))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** A student by roll number (exact, active), for forms and imports that name students by roll number. */
export async function studentByRoll(tx: Tx, roll: string): Promise<{ id: string; fullName: string; sectionId: string; term: number }> {
  const r = roll.trim();
  if (!r) throw new BadRequestException('Give the student’s roll number');
  const rows = await tx
    .select({ id: students.id, fullName: students.fullName, sectionId: students.sectionId, term: sections.term })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .where(and(sql`lower(${students.rollNo}) = ${r.toLowerCase()}`, eq(students.status, 'active')))
    .limit(2);
  if (rows.length > 1) throw new BadRequestException(`More than one student has roll number ${r}`);
  if (!rows[0]) throw new NotFoundException(`No active student has roll number ${r}`);
  return rows[0];
}

/** The student and family's app users (for notices sent with notifyUsers). */
export async function familyUserIds(tx: Tx, studentId: string): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`select g.user_id from guardians g where g.student_id = ${studentId}::uuid union select s.user_id from students s where s.id = ${studentId}::uuid and s.user_id is not null`);
  return rows.rows.map((r) => r.user_id);
}

/** Users holding any of the roles (alerts to managers). */
export async function usersWithRoles(tx: Tx, roles: RoleName[]): Promise<string[]> {
  const rows = await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles));
  return rows.map((r) => r.id);
}

/** "R12 Asha Rao (BCom Sem 3 A)" for a student column. */
export const studentLabel = sql<string>`${students.rollNo} || ' ' || ${students.fullName}`;
