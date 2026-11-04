import { eq, inArray } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { departments, sections, subjects } from '../db/schema.js';

/** The departments a person heads. */
export async function headedDepartments(tx: Tx, userId: string): Promise<string[]> {
  return (await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, userId))).map((d) => d.id);
}

/**
 * What a head of department may message: their departments, the programmes those departments teach in, and the
 * classes of those programmes. Principals and administrators are not limited by this.
 */
export async function hodScope(tx: Tx, userId: string): Promise<{ departmentIds: string[]; programIds: string[]; sectionIds: string[] }> {
  const departmentIds = await headedDepartments(tx, userId);
  if (departmentIds.length === 0) return { departmentIds, programIds: [], sectionIds: [] };
  const programIds = (await tx.selectDistinct({ id: subjects.programId }).from(subjects).where(inArray(subjects.departmentId, departmentIds))).map((r) => r.id);
  const sectionIds = programIds.length ? (await tx.select({ id: sections.id }).from(sections).where(inArray(sections.programId, programIds))).map((r) => r.id) : [];
  return { departmentIds, programIds, sectionIds };
}

/** The ids in `wanted` that are not in `allowed`. */
export const outside = (wanted: string[] | undefined, allowed: string[]) => (wanted ?? []).filter((id) => !allowed.includes(id));
