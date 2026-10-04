import { and, eq, inArray } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { guardians, students } from '../db/schema.js';

/**
 * Whether a user may open something shared with a class (a saved board, a lesson recording):
 * school leaders always; otherwise a student of that class or a guardian of one.
 */
export async function canSeeClassItem(tx: Tx, p: UserPrincipal, item: { ownerId: string; sectionId: string | null; sharedAt: Date | null }): Promise<boolean> {
  if (item.ownerId === p.userId) return true;
  if (p.roles.some((r) => r === 'principal' || r === 'tenant_admin')) return true;
  if (!item.sharedAt || !item.sectionId) return false;
  return isInClass(tx, p.userId, item.sectionId);
}

/** The user is a student of the class, or a guardian of one. */
export async function isInClass(tx: Tx, userId: string, sectionId: string): Promise<boolean> {
  const [own] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.userId, userId), eq(students.sectionId, sectionId)));
  if (own) return true;
  const children = await tx.select({ studentId: guardians.studentId }).from(guardians).where(eq(guardians.userId, userId));
  if (children.length === 0) return false;
  const [inClass] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(inArray(students.id, children.map((c) => c.studentId)), eq(students.sectionId, sectionId)));
  return !!inClass;
}
