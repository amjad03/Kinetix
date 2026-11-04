import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { csvCell } from '../common/pdf.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, driveRegistrations, driveRounds, examResultLines, examResults, examSessions, guardians, placementCompanies, placementDrives, placementOffers, programs, roundResults, sections, students } from '../db/schema.js';
import { studentPriorEducation } from '../db/schema-g1.js';
import { placementOptins } from '../db/schema-placements.js';
import { placementDocuments } from '../db/schema-placements-pass.js';
import { studentProfiles } from '../db/schema-sis.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { type Academics, CATEGORIES, checkEligibility, countBacklogHistory, countBacklogs, graduationYear, type OfferPolicy, priorProfile, type Standing, standingReasons } from './eligibility.js';
import { AICTE_HOURS_PER_CREDIT, NATS_DEFAULTS, type NatsRates } from './placement-pass.logic.js';

/** The placement documents that must be verified, by the `requiredDocs` setting. */
export const REQUIRED_DOCS: Record<string, string[]> = { resume: ['resume'], resume_marks: ['resume', 'marks_10', 'marks_12'], all: ['resume', 'marks_10', 'marks_12', 'semester_marks', 'id_proof'] };

/** The placement cell's rules from its settings (Settings → Placements). */
export interface PlacementRules {
  policy: OfferPolicy;
  requireOptIn: boolean;
  debarDays: number;
  /** Packages at or above these lines (lakh a year) are dream and super dream when a drive leaves the category unset; 0 = off. */
  dreamMinLpa: number;
  superDreamMinLpa: number;
  notifyOnOpen: boolean;
  requiredDocs: string;
  hoursPerCredit: number;
  creditsRequired: number;
  nats: NatsRates;
}

/** The tenant of the transaction (set by `withTenant`). */
async function currentTenant(tx: Tx): Promise<string> {
  return (await tx.execute<{ id: string }>(sql`select nullif(current_setting('app.tenant_id', true), '') as id`)).rows[0]?.id ?? '';
}

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
    const a = (await this.academicsMany(tx, [studentId])).get(studentId);
    if (!a) throw new NotFoundException('Student not found');
    return a;
  }

  /**
   * Everything a drive's criteria read, for many students in a fixed number of queries: CGPA, current backlogs and
   * the history of backlogs from the published results, programme and batch from the class, gender from the profile,
   * class 10 and 12 percentages and gap years from prior education, and whether the required placement documents
   * are verified.
   */
  async academicsMany(tx: Tx, studentIds: string[]): Promise<Map<string, Academics>> {
    const out = new Map<string, Academics>();
    if (!studentIds.length) return out;
    const ids = [...new Set(studentIds)];
    const base = await tx
      .select({ id: students.id, programId: sections.programId, term: sections.term, termCount: programs.termCount, level: programs.level, yearEnds: academicYears.endsOn, enrolledOn: students.enrolledOn, gender: studentProfiles.gender })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .leftJoin(studentProfiles, eq(studentProfiles.studentId, students.id))
      .where(inArray(students.id, ids));
    const lines = await tx
      .select({ studentId: examResults.studentId, cgpa: examResults.cgpa, subjectId: examResultLines.subjectId, passed: examResultLines.passed })
      .from(examResults)
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .innerJoin(examResultLines, eq(examResultLines.resultId, examResults.id))
      .where(and(inArray(examResults.studentId, ids), inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn), asc(examResults.computedAt));
    const prior = await tx.select({ studentId: studentPriorEducation.studentId, level: studentPriorEducation.level, passingYear: studentPriorEducation.passingYear, percentage: studentPriorEducation.percentage }).from(studentPriorEducation).where(inArray(studentPriorEducation.studentId, ids));
    const docs = await tx.select({ studentId: placementDocuments.studentId, kind: placementDocuments.kind }).from(placementDocuments).where(and(inArray(placementDocuments.studentId, ids), eq(placementDocuments.status, 'verified')));
    const need = REQUIRED_DOCS[(await this.rules(tx, await currentTenant(tx))).requiredDocs] ?? REQUIRED_DOCS.resume;
    const group = <T extends { studentId: string | null }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) if (r.studentId) m.set(r.studentId, [...(m.get(r.studentId) ?? []), r]);
      return m;
    };
    const [byLines, byPrior, byDocs] = [group(lines), group(prior), group(docs)];
    for (const s of base) {
      const mine = byLines.get(s.id) ?? [];
      const pp = priorProfile((byPrior.get(s.id) ?? []).map((x) => ({ level: String(x.level), passingYear: x.passingYear, percentage: x.percentage === null ? null : Number(x.percentage) })), s.enrolledOn ? Number(String(s.enrolledOn).slice(0, 4)) : null);
      const verified = new Set((byDocs.get(s.id) ?? []).map((d) => d.kind));
      out.set(s.id, {
        cgpa: mine.length ? mine[mine.length - 1].cgpa : null,
        backlogs: countBacklogs(mine),
        backlogHistory: countBacklogHistory(mine),
        programId: s.programId,
        batchYear: graduationYear(String(s.yearEnds), s.termCount, s.term, String(s.level)),
        gender: s.gender,
        ...pp,
        docsVerified: need.every((k) => verified.has(k)),
      });
    }
    return out;
  }

  /** Opt-in, debarment and the highest category of placement offer the student accepted. */
  async standing(tx: Tx, studentId: string): Promise<Standing> {
    return (await this.standingMany(tx, [studentId])).get(studentId)!;
  }

  /** The same for many students in two queries. */
  async standingMany(tx: Tx, studentIds: string[]): Promise<Map<string, Standing>> {
    const ids = [...new Set(studentIds)];
    const out = new Map<string, Standing>(ids.map((id) => [id, { optedIn: null, debarredUntil: null, placedCategory: null }]));
    if (!ids.length) return out;
    for (const o of await tx.select().from(placementOptins).where(inArray(placementOptins.studentId, ids))) out.set(o.studentId, { ...out.get(o.studentId)!, optedIn: o.optedIn, debarredUntil: o.debarredUntil ?? null });
    const placed = await tx.select({ studentId: placementOffers.studentId, category: placementDrives.category }).from(placementOffers).innerJoin(placementDrives, eq(placementDrives.id, placementOffers.driveId)).where(and(inArray(placementOffers.studentId, ids), eq(placementOffers.status, 'accepted'), eq(placementDrives.kind, 'placement')));
    for (const x of placed) {
      const cur = out.get(x.studentId)!;
      if (cur.placedCategory === null || CATEGORIES.indexOf(x.category as never) > CATEGORIES.indexOf(cur.placedCategory as never)) out.set(x.studentId, { ...cur, placedCategory: x.category });
    }
    return out;
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
    // Checked for the whole batch first, then written in a few statements (a shortlist can be hundreds of students).
    const already = new Set((await tx.select({ r: roundResults.registrationId }).from(roundResults).where(and(eq(roundResults.roundId, roundId), inArray(roundResults.registrationId, regs.map((x) => x.id))))).map((x) => x.r));
    const regOf = new Map(regs.map((x) => [x.id, x]));
    for (const r of results) {
      const reg = regOf.get(r.registrationId)!;
      if (['withdrawn', 'selected'].includes(reg.status) || (reg.status === 'rejected' && !already.has(reg.id))) throw new ConflictException(`A ${reg.status} registration cannot take a round result`);
      if (prevPassed && !prevPassed.has(reg.id)) throw new ConflictException('The student has not cleared the previous round');
    }
    await tx
      .insert(roundResults)
      .values(results.map((r) => ({ tenantId: by.tenantId, roundId, registrationId: r.registrationId, result: r.result, note: r.note })))
      .onConflictDoUpdate({ target: [roundResults.roundId, roundResults.registrationId], set: { result: sql`excluded.result`, note: sql`excluded.note`, recordedAt: new Date() } });
    const passIds = results.filter((r) => r.result === 'pass').map((r) => r.registrationId);
    const otherIds = results.filter((r) => r.result !== 'pass').map((r) => r.registrationId);
    if (passIds.length) await tx.update(driveRegistrations).set({ status: 'shortlisted' }).where(inArray(driveRegistrations.id, passIds));
    if (otherIds.length) await tx.update(driveRegistrations).set({ status: 'rejected' }).where(inArray(driveRegistrations.id, otherIds));
    const debar = round.seq === 1 && drive.kind === 'placement' && debarDays > 0 ? results.filter((r) => r.result === 'absent').map((r) => regOf.get(r.registrationId)!.studentId) : [];
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + debarDays * 86_400_000).toISOString().slice(0, 10);
    if (debar.length) {
      const reason = `Absent from ${drive.title} after registering`;
      await tx.insert(placementOptins).values(debar.map((studentId) => ({ tenantId: by.tenantId, studentId, debarredUntil: until, debarReason: reason, updatedBy: by.userId }))).onConflictDoUpdate({ target: placementOptins.studentId, set: { debarredUntil: until, debarReason: reason, updatedBy: by.userId, updatedAt: new Date() } });
      await this.notifyLogins(tx, await this.familyMany(tx, debar), drive.title, `You missed ${round.name} after registering, so you cannot register for placement drives until ${until}`, `debar:${roundId}`, { driveId });
    }
    const told = new Set(debar);
    const studentsWith = (want: (x: string) => boolean) => results.filter((r) => want(r.result) && !told.has(regOf.get(r.registrationId)!.studentId)).map((r) => regOf.get(r.registrationId)!.studentId);
    const cleared = studentsWith((x) => x === 'pass');
    const notSelected = studentsWith((x) => x !== 'pass');
    if (cleared.length) await this.notifyLogins(tx, await this.familyMany(tx, cleared), drive.title, `${round.name}: you cleared this round`, `round:${roundId}:pass`, { driveId });
    if (notSelected.length) await this.notifyLogins(tx, await this.familyMany(tx, notSelected), drive.title, `${round.name}: you were not selected`, `round:${roundId}:fail`, { driveId });
    return { recorded: results.length, debarred: debar.length };
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
    // Quoted, and formulas neutralised: the shortlist goes to recruiters who open it in a spreadsheet.
    const cell = csvCell;
    const head = ['Roll no', 'Name', 'Programme', 'Class', 'CGPA', 'Backlogs', 'Status', ...rounds.map((x) => x.name)];
    const csv = [head, ...rows.map((r) => [r.rollNo, r.fullName, r.program, r.className, r.cgpaAt, r.backlogsAt, r.status, ...rounds.map((x) => r.rounds[x.name])])].map((line) => line.map(cell).join(',')).join('\n');
    return { drive, rounds: rounds.map((x) => ({ id: x.id, seq: x.seq, name: x.name, kind: x.kind })), rows, csv };
  }

  /** The placement cell's rules from its settings. */
  async rules(tx: Tx, tenantId: string): Promise<PlacementRules> {
    const r = (await qualitySettings(tx, tenantId, 'placements')).rules;
    const n = (k: string, d: number) => (r[k] === undefined || r[k] === null || r[k] === '' ? d : Number(r[k]));
    return {
      policy: (r.offerPolicy as OfferPolicy) ?? 'dream',
      requireOptIn: r.requireOptIn === true,
      debarDays: n('debarDaysForAbsence', 0),
      dreamMinLpa: n('dreamMinLpa', 0),
      superDreamMinLpa: n('superDreamMinLpa', 0),
      notifyOnOpen: r.notifyEligibleOnOpen !== false,
      requiredDocs: String(r.requiredDocs ?? 'resume'),
      hoursPerCredit: n('internshipHoursPerCredit', AICTE_HOURS_PER_CREDIT),
      creditsRequired: n('internshipCreditsRequired', 0),
      nats: { minGraduate: n('natsStipendGraduate', NATS_DEFAULTS.minGraduate), minDiploma: n('natsStipendDiploma', NATS_DEFAULTS.minDiploma), minVocational: n('natsStipendDiploma', NATS_DEFAULTS.minVocational), govtSharePct: n('natsGovtSharePct', NATS_DEFAULTS.govtSharePct) },
    };
  }

  /** Tells every eligible student and their family that a drive opened (once per drive). Returns how many students were told. */
  async notifyDriveOpened(tx: Tx, tenantId: string, driveId: string): Promise<number> {
    const [d] = await tx.select().from(placementDrives).where(eq(placementDrives.id, driveId));
    if (!d || d.status !== 'open' || d.notifiedAt) return 0;
    const rules = await this.rules(tx, tenantId);
    if (!rules.notifyOnOpen) return 0;
    const pool = await tx.select({ id: students.id }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(and(eq(students.status, 'active'), d.programIds.length ? inArray(sections.programId, d.programIds) : undefined));
    const ids = pool.map((x) => x.id);
    const [acad, stand, today] = [await this.academicsMany(tx, ids), await this.standingMany(tx, ids), await this.today(tx)];
    const eligible = ids.filter((id) => {
      const a = acad.get(id);
      return !!a && checkEligibility({ ...d, registrationOpensOn: null }, a, today).eligible && !standingReasons(d.kind, d.category, stand.get(id)!, rules, today).length;
    });
    const [co] = await tx.select({ name: placementCompanies.name }).from(placementCompanies).where(eq(placementCompanies.id, d.companyId));
    const closes = d.registrationClosesOn ? ` Register by ${d.registrationClosesOn}.` : '';
    await this.notifications.notifyUsers(tx, await this.familyMany(tx, eligible), { kind: 'placement', text: { title: `${co?.name ?? 'A company'} is hiring`, body: `${d.roleTitle}${d.ctcLpa ? `, ${d.ctcLpa} LPA` : ''}: you are eligible for ${d.title}.${closes}` }, data: { driveId }, dedupeKey: `drive-open:${driveId}` });
    await tx.update(placementDrives).set({ notifiedAt: new Date() }).where(eq(placementDrives.id, driveId));
    return eligible.length;
  }

  /** A placement notice to given logins (an alumnus, a recruiter's contact with a login). */
  async notifyLogins(tx: Tx, userIds: string[], title: string, body: string, key: string, data: Record<string, string> = {}) {
    await this.notifications.notifyUsers(tx, userIds, { kind: 'placement', text: { title, body }, data, dedupeKey: key });
  }

  /** The logins of many students and their families, in two queries. */
  async familyMany(tx: Tx, studentIds: string[]): Promise<string[]> {
    if (!studentIds.length) return [];
    const own = await tx.select({ userId: students.userId }).from(students).where(inArray(students.id, studentIds));
    const g = await tx.select({ userId: guardians.userId }).from(guardians).where(inArray(guardians.studentId, studentIds));
    return [...new Set([...own, ...g].map((x) => x.userId).filter((x): x is string => !!x))];
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
