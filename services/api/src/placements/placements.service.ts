import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, driveRegistrations, driveRounds, examResultLines, examResults, examSessions, guardians, placementDrives, placementOffers, programs, roundResults, sections, students } from '../db/schema.js';
import { placementOptins } from '../db/schema-placements.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { type Academics, CATEGORIES, countBacklogs, graduationYear, type OfferPolicy, type Standing } from './eligibility.js';

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
    const [s] = await tx
      .select({ programId: sections.programId, term: sections.term, termCount: programs.termCount, level: programs.level, yearEnds: academicYears.endsOn })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const rows = await tx
      .select({ cgpa: examResults.cgpa, subjectId: examResultLines.subjectId, passed: examResultLines.passed, startsOn: examSessions.startsOn })
      .from(examResults)
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .innerJoin(examResultLines, eq(examResultLines.resultId, examResults.id))
      .where(and(eq(examResults.studentId, studentId), inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn), asc(examResults.computedAt));
    return { cgpa: rows.length ? rows[rows.length - 1].cgpa : null, backlogs: countBacklogs(rows), programId: s.programId, batchYear: graduationYear(String(s.yearEnds), s.termCount, s.term, String(s.level)) };
  }

  /** Opt-in, debarment and the highest category of placement offer the student accepted. */
  async standing(tx: Tx, studentId: string): Promise<Standing> {
    const [o] = await tx.select().from(placementOptins).where(eq(placementOptins.studentId, studentId));
    const placed = await tx.select({ category: placementDrives.category }).from(placementOffers).innerJoin(placementDrives, eq(placementDrives.id, placementOffers.driveId)).where(and(eq(placementOffers.studentId, studentId), eq(placementOffers.status, 'accepted'), eq(placementDrives.kind, 'placement')));
    const top = placed.reduce<string | null>((best, x) => (best === null || CATEGORIES.indexOf(x.category as never) > CATEGORIES.indexOf(best as never) ? x.category : best), null);
    return { optedIn: o ? o.optedIn : null, debarredUntil: o?.debarredUntil ?? null, placedCategory: top };
  }

  /**
   * Records one round's results (the office, or a recruiter through the portal): a pass shortlists, a fail or an
   * absence rejects. Each must have cleared the round before. An absence from the first round of a placement drive
   * debars the student for the settings' number of days.
   */
  async recordResults(tx: Tx, by: { tenantId: string; userId: string | null }, driveId: string, roundId: string, results: { registrationId: string; result: 'pass' | 'fail' | 'absent'; note: string }[]) {
    const [drive] = await tx.select().from(placementDrives).where(eq(placementDrives.id, driveId));
    if (!drive) throw new NotFoundException('Drive not found');
    const [round] = await tx.select().from(driveRounds).where(and(eq(driveRounds.id, roundId), eq(driveRounds.driveId, driveId)));
    if (!round) throw new NotFoundException('Round not found');
    if (['draft', 'cancelled'].includes(drive.status)) throw new ConflictException('This drive is not running');
    const regs = await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, driveId), inArray(driveRegistrations.id, results.map((r) => r.registrationId))));
    if (regs.length !== new Set(results.map((r) => r.registrationId)).size) throw new BadRequestException('Some registrations do not belong to this drive');
    const prev = round.seq > 1 ? (await tx.select({ id: driveRounds.id }).from(driveRounds).where(and(eq(driveRounds.driveId, driveId), eq(driveRounds.seq, round.seq - 1))))[0] : null;
    const prevPassed = prev ? new Set((await tx.select({ r: roundResults.registrationId }).from(roundResults).where(and(eq(roundResults.roundId, prev.id), eq(roundResults.result, 'pass')))).map((x) => x.r)) : null;
    const { debarDays } = await this.rules(tx, by.tenantId);
    const today = await this.today(tx);
    let debarred = 0;
    for (const r of results) {
      const reg = regs.find((x) => x.id === r.registrationId)!;
      if (['withdrawn', 'selected'].includes(reg.status) || (reg.status === 'rejected' && !(await tx.select({ x: roundResults.result }).from(roundResults).where(and(eq(roundResults.roundId, roundId), eq(roundResults.registrationId, reg.id))))[0])) throw new ConflictException(`A ${reg.status} registration cannot take a round result`);
      if (prevPassed && !prevPassed.has(reg.id)) throw new ConflictException('The student has not cleared the previous round');
      await tx.insert(roundResults).values({ tenantId: by.tenantId, roundId, registrationId: reg.id, result: r.result, note: r.note }).onConflictDoUpdate({ target: [roundResults.roundId, roundResults.registrationId], set: { result: r.result, note: r.note, recordedAt: new Date() } });
      await tx.update(driveRegistrations).set({ status: r.result === 'pass' ? 'shortlisted' : 'rejected' }).where(eq(driveRegistrations.id, reg.id));
      if (r.result === 'absent' && round.seq === 1 && drive.kind === 'placement' && debarDays > 0) {
        const until = new Date(Date.parse(`${today}T00:00:00Z`) + debarDays * 86_400_000).toISOString().slice(0, 10);
        const reason = `Absent from ${drive.title} after registering`;
        await tx.insert(placementOptins).values({ tenantId: by.tenantId, studentId: reg.studentId, debarredUntil: until, debarReason: reason, updatedBy: by.userId }).onConflictDoUpdate({ target: placementOptins.studentId, set: { debarredUntil: until, debarReason: reason, updatedBy: by.userId, updatedAt: new Date() } });
        debarred++;
        await this.notifyStudent(tx, reg.studentId, drive.title, `You missed ${round.name} after registering, so you cannot register for placement drives until ${until}`, `debar:${roundId}:${reg.id}`);
      } else await this.notifyStudent(tx, reg.studentId, drive.title, `${round.name}: ${r.result === 'pass' ? 'you cleared this round' : 'you were not selected'}`, `round:${roundId}:${reg.id}`);
    }
    return { recorded: results.length, debarred };
  }

  /** A drive's registrations (not withdrawn) with marks at registration and each round's result, and the same as CSV. */
  async shortlist(tx: Tx, driveId: string) {
    const [drive] = await tx.select({ id: placementDrives.id, title: placementDrives.title }).from(placementDrives).where(eq(placementDrives.id, driveId));
    if (!drive) throw new NotFoundException('Drive not found');
    const rounds = await tx.select().from(driveRounds).where(eq(driveRounds.driveId, driveId)).orderBy(asc(driveRounds.seq));
    const regs = await tx
      .select({ id: driveRegistrations.id, status: driveRegistrations.status, cgpaAt: driveRegistrations.cgpaAt, backlogsAt: driveRegistrations.backlogsAt, rollNo: students.rollNo, fullName: students.fullName, className: sections.displayName, program: programs.name })
      .from(driveRegistrations)
      .innerJoin(students, eq(students.id, driveRegistrations.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(and(eq(driveRegistrations.driveId, driveId), inArray(driveRegistrations.status, ['registered', 'shortlisted', 'rejected', 'selected'])))
      .orderBy(asc(students.rollNo));
    const results = regs.length ? await tx.select().from(roundResults).where(inArray(roundResults.registrationId, regs.map((r) => r.id))) : [];
    const rows = regs.map((r) => ({ ...r, rounds: Object.fromEntries(rounds.map((x) => [x.name, results.find((y) => y.roundId === x.id && y.registrationId === r.id)?.result ?? ''])) }));
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Roll no', 'Name', 'Programme', 'Class', 'CGPA', 'Backlogs', 'Status', ...rounds.map((x) => x.name)];
    const csv = [head, ...rows.map((r) => [r.rollNo, r.fullName, r.program, r.className, r.cgpaAt, r.backlogsAt, r.status, ...rounds.map((x) => r.rounds[x.name])])].map((line) => line.map(cell).join(',')).join('\n');
    return { drive, rounds: rounds.map((x) => ({ id: x.id, seq: x.seq, name: x.name, kind: x.kind })), rows, csv };
  }

  /** The placement cell's rules from its settings. */
  async rules(tx: Tx, tenantId: string): Promise<{ policy: OfferPolicy; requireOptIn: boolean; debarDays: number }> {
    const r = (await qualitySettings(tx, tenantId, 'placements')).rules;
    return { policy: (r.offerPolicy as OfferPolicy) ?? 'dream', requireOptIn: r.requireOptIn === true, debarDays: Number(r.debarDaysForAbsence ?? 0) };
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
