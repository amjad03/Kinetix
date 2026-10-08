import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { guardians, students, userRoles } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** Small lookups and notifications shared by the grievance, discipline, counselling and welfare controllers. */
@Injectable()
export class WelfareService {
  constructor(
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  now() {
    return this.clock.now();
  }

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  /** The student record signed in as `p` (role student), or null. */
  async ownStudent(tx: Tx, p: UserPrincipal) {
    const [s] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.userId, p.userId));
    return s ?? null;
  }

  /** Their own record plus their children's. */
  async familyStudents(tx: Tx, p: UserPrincipal): Promise<string[]> {
    const own = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    const kids = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
    return [...own, ...kids].map((r) => r.id);
  }

  /** Resolves who a student/guardian acts for: a student for themself, a guardian for one of their children. */
  async actingStudent(tx: Tx, p: UserPrincipal, studentId?: string): Promise<string> {
    const mine = await this.familyStudents(tx, p);
    const id = studentId ?? (mine.length === 1 ? mine[0] : undefined);
    if (!id || !mine.includes(id)) throw new NotFoundException('Student not found');
    return id;
  }

  async usersWithRole(tx: Tx, roles: string[]): Promise<string[]> {
    const rows = await tx.select({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles as (typeof userRoles.role.enumValues)[number][]));
    return [...new Set(rows.map((r) => r.id))];
  }

  async family(tx: Tx, studentId: string): Promise<string[]> {
    const [s] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
    const g = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, studentId));
    return [...new Set([s?.userId, ...g.map((x) => x.userId)].filter((x): x is string => !!x))];
  }

  async notify(tx: Tx, userIds: string[], kind: 'grievance' | 'welfare', title: string, body: string, key: string, data: Record<string, string> = {}) {
    await this.notifications.notifyUsers(tx, userIds, { kind, text: { title, body }, data, dedupeKey: key });
  }

  async isGuardianOf(tx: Tx, userId: string, studentId: string) {
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.userId, userId), eq(guardians.studentId, studentId)));
    return !!g;
  }
}
