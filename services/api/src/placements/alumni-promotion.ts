import { eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { academicYears, alumniProfiles, placementCompanies, programs, sections, students } from '../db/schema.js';

/**
 * A student who accepts an offer gets an alumni profile (PRD 89.6) with the employer and role already filled in, so the
 * placement loop ends in the alumni network without anyone retyping. The profile stays out of the directory until the
 * graduate gives consent. Returns the profile id, or null when the student already has one.
 */
export async function promoteToAlumni(tx: Tx, tenantId: string, studentId: string, offer: { roleTitle: string }, companyId: string): Promise<string | null> {
  const [existing] = await tx.select({ id: alumniProfiles.id }).from(alumniProfiles).where(eq(alumniProfiles.studentId, studentId));
  if (existing) {
    await tx.update(alumniProfiles).set({ designation: offer.roleTitle, employer: await companyName(tx, companyId) }).where(eq(alumniProfiles.id, existing.id));
    return null;
  }
  const [s] = await tx
    .select({ name: students.fullName, program: programs.name, endsOn: academicYears.endsOn })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
    .where(eq(students.id, studentId));
  if (!s) return null;
  const [row] = await tx
    .insert(alumniProfiles)
    .values({ tenantId, studentId, fullName: s.name, graduationYear: Number(s.endsOn.slice(0, 4)), program: s.program, employer: await companyName(tx, companyId), designation: offer.roleTitle })
    .returning({ id: alumniProfiles.id });
  return row.id;
}

async function companyName(tx: Tx, companyId: string): Promise<string> {
  const [c] = await tx.select({ name: placementCompanies.name }).from(placementCompanies).where(eq(placementCompanies.id, companyId));
  return c?.name ?? '';
}
