import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { guardians, students } from '../db/schema.js';

/** Small lookups shared by the clubs, committees and events controllers. */
@Injectable()
export class CampusLifeService {
  constructor(private readonly clock: Clock) {}

  now() {
    return this.clock.now();
  }

  /** Their own student record plus their children's. */
  async familyStudents(tx: Tx, p: UserPrincipal): Promise<string[]> {
    const own = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    const kids = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
    return [...own, ...kids].map((r) => r.id);
  }

  /** Who a student or guardian acts for: themself, or one of their children. */
  async actingStudent(tx: Tx, p: UserPrincipal, studentId?: string): Promise<string> {
    const mine = await this.familyStudents(tx, p);
    const id = studentId ?? (mine.length === 1 ? mine[0] : undefined);
    if (!id || !mine.includes(id)) throw new NotFoundException('Student not found');
    return id;
  }
}
