import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { guardians, sections, students, timetableSlots, userRoles } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** Who writes the school diary. */
export const DIARY_WRITERS: RoleName[] = ['teacher', 'hod', 'principal', 'tenant_admin'];
/** Who sets up parent-teacher meetings. */
export const PTM_ORGANISERS: RoleName[] = ['tenant_admin', 'principal'];
/** Teachers who give meeting slots and see their bookings. */
export const PTM_TEACHERS: RoleName[] = ['teacher', 'hod', 'principal'];
/** Who records observations and milestone progress for the youngest classes. */
export const EARLY_YEARS_STAFF: RoleName[] = ['teacher', 'hod', 'principal', 'tenant_admin'];
/**
 * Health records are limited to the people who need them. There is no nurse role yet, so the
 * principal, the administrator and the counsellor hold them; teachers never see the record.
 */
export const HEALTH_STAFF: RoleName[] = ['principal', 'tenant_admin', 'counsellor'];

export const hasAny = (p: UserPrincipal, roles: RoleName[]) => p.roles.some((r) => roles.includes(r));

/** Lookups and notifications shared by the diary, meeting, early years and health controllers. */
@Injectable()
export class SchoolLifeService {
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

  /** True when the user has a live timetable slot in the section. */
  async teachesSection(tx: Tx, userId: string, sectionId: string): Promise<boolean> {
    const [r] = await tx
      .select({ id: timetableSlots.id })
      .from(timetableSlots)
      .where(and(eq(timetableSlots.teacherId, userId), eq(timetableSlots.sectionId, sectionId), isNull(timetableSlots.archivedAt)))
      .limit(1);
    return !!r;
  }

  /** Principals, administrators and heads of department act for any section; teachers only for sections they teach. */
  async assertCanActFor(tx: Tx, p: UserPrincipal, sectionId: string): Promise<void> {
    const [sec] = await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, sectionId));
    if (!sec) throw new NotFoundException('Class not found');
    if (hasAny(p, ['principal', 'tenant_admin', 'hod'])) return;
    if (!(await this.teachesSection(tx, p.userId, sectionId))) throw new ForbiddenException('You do not teach this class');
  }

  /** The student if the signed-in guardian is linked to them; otherwise "not found". */
  async guardianChild(tx: Tx, p: UserPrincipal, studentId: string) {
    const [c] = await tx
      .select({ id: students.id, fullName: students.fullName, sectionId: students.sectionId })
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .where(and(eq(guardians.userId, p.userId), eq(guardians.studentId, studentId)));
    if (!c) throw new NotFoundException('Child not found');
    return c;
  }

  /** Guardians of one student. */
  async guardiansOf(tx: Tx, studentId: string): Promise<string[]> {
    const rows = await tx.select({ id: guardians.userId }).from(guardians).where(eq(guardians.studentId, studentId));
    return [...new Set(rows.map((r) => r.id))];
  }

  /** Guardians of every student in the section. */
  async guardiansOfSection(tx: Tx, sectionId: string): Promise<string[]> {
    const rows = await tx.select({ id: guardians.userId }).from(guardians).innerJoin(students, eq(students.id, guardians.studentId)).where(eq(students.sectionId, sectionId));
    return [...new Set(rows.map((r) => r.id))];
  }

  async usersWithRole(tx: Tx, roles: RoleName[]): Promise<string[]> {
    const rows = await tx.select({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles));
    return [...new Set(rows.map((r) => r.id))];
  }

  async notify(tx: Tx, userIds: string[], kind: 'homework' | 'calendar' | 'welfare', title: string, body: string, key: string, data: Record<string, string> = {}) {
    await this.notifications.notifyUsers(tx, userIds, { kind, text: { title, body }, data, dedupeKey: key });
  }
}
