import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { guardians, students } from '../db/schema.js';

/**
 * Whether a user may see one student's records: staff in [staffRoles], the student, or one of
 * their guardians. Throws 404 otherwise (so ids reveal nothing), and for unknown students.
 */
export async function assertCanSeeStudent(tx: Tx, p: UserPrincipal, studentId: string, staffRoles: RoleName[]): Promise<void> {
  const [s] = await tx.select({ id: students.id, userId: students.userId }).from(students).where(eq(students.id, studentId));
  if (!s) throw new NotFoundException('Student not found');
  if (p.roles.some((r) => staffRoles.includes(r))) return;
  if (s.userId === p.userId) return;
  const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
  if (!g) throw new NotFoundException('Student not found');
}
