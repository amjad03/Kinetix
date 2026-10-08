import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { examResultLines, examResults, examSessions, guardians, sections, students } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { type Academics, countBacklogs } from './eligibility.js';

/** Academics-driven eligibility and the small lookups the placement controllers share. */
@Injectable()
export class PlacementsService {
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

  /** CGPA and backlogs from the published exam results, and the programme from the student's section. */
  async academics(tx: Tx, studentId: string): Promise<Academics> {
    const [s] = await tx.select({ programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const rows = await tx
      .select({ cgpa: examResults.cgpa, subjectId: examResultLines.subjectId, passed: examResultLines.passed, startsOn: examSessions.startsOn })
      .from(examResults)
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .innerJoin(examResultLines, eq(examResultLines.resultId, examResults.id))
      .where(and(eq(examResults.studentId, studentId), inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn), asc(examResults.computedAt));
    return { cgpa: rows.length ? rows[rows.length - 1].cgpa : null, backlogs: countBacklogs(rows), programId: s.programId };
  }

  /** The student record signed in as `p` (role student), or null. */
  async ownStudent(tx: Tx, p: UserPrincipal) {
    const [s] = await tx.select({ id: students.id, fullName: students.fullName }).from(students).where(eq(students.userId, p.userId));
    return s ?? null;
  }

  /** The students this user may view: their own record, or their children. */
  async visibleStudents(tx: Tx, p: UserPrincipal): Promise<string[]> {
    const own = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    const kids = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
    return [...own, ...kids].map((r) => r.id);
  }

  async family(tx: Tx, studentId: string): Promise<string[]> {
    const [s] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
    const g = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, studentId));
    return [...new Set([s?.userId, ...g.map((x) => x.userId)].filter((x): x is string => !!x))];
  }

  async notifyStudent(tx: Tx, studentId: string, title: string, body: string, key: string, kind: 'placement' | 'welfare' | 'grievance' = 'placement') {
    await this.notifications.notifyUsers(tx, await this.family(tx, studentId), { kind, text: { title, body }, data: { studentId }, dedupeKey: key });
  }
}
