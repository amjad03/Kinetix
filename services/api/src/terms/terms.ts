import { BadRequestException } from '@nestjs/common';
import { and, asc, eq, gte, lte, ne, or, sql, isNull } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { academicTerms, academicYears } from '../db/schema.js';

export type Term = typeof academicTerms.$inferSelect;

/** Whether a term applies to a program (a term without programs applies to all). */
export function termCovers(t: { programIds: string[] | null }, programId: string): boolean {
  return t.programIds === null || t.programIds.includes(programId);
}

/** Whether two terms could both apply to some program. */
export function programsMeet(a: string[] | null, b: string[] | null): boolean {
  return a === null || b === null || a.some((id) => b.includes(id));
}

/** The term of a program on a date (YYYY-MM-DD), if there is one. */
export async function termFor(tx: Tx, date: string, programId: string): Promise<Term | undefined> {
  const rows = await tx
    .select()
    .from(academicTerms)
    .where(and(lte(academicTerms.startsOn, date), gte(academicTerms.endsOn, date), or(isNull(academicTerms.programIds), sql`${programId}::uuid = any(${academicTerms.programIds})`)))
    .orderBy(asc(academicTerms.startsOn));
  // Terms of the same program never overlap; prefer one made for the program over a general one.
  return rows.find((t) => t.programIds !== null) ?? rows[0];
}

/** A new or changed term must sit inside its academic year and not overlap a term of the same programs. */
export async function assertTermFits(tx: Tx, t: { id?: string; academicYearId: string; startsOn: string; endsOn: string; programIds: string[] | null }): Promise<void> {
  const [year] = await tx.select().from(academicYears).where(eq(academicYears.id, t.academicYearId));
  if (!year) throw new BadRequestException('Academic year not found');
  if (t.startsOn < year.startsOn || t.endsOn > year.endsOn) throw new BadRequestException(`The term must be within the academic year ${year.label} (${year.startsOn} to ${year.endsOn})`);
  const overlapping = await tx
    .select()
    .from(academicTerms)
    .where(and(lte(academicTerms.startsOn, t.endsOn), gte(academicTerms.endsOn, t.startsOn), t.id ? ne(academicTerms.id, t.id) : undefined));
  const clash = overlapping.find((o) => programsMeet(o.programIds, t.programIds));
  if (clash) throw new BadRequestException(`The term overlaps "${clash.name}" (${clash.startsOn} to ${clash.endsOn}) for the same programs`);
}
