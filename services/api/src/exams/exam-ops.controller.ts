import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { assessments, examPapers, examResultLines, examResults, examSessions, marks, qbPapers, rooms, sections, students, subjects, tenants, userRoles, users } from '../db/schema.js';
import { examPracticalCandidates, examPracticalSlots, markNormalisations, resultClassBands } from '../db/schema-depth.js';
import { classOf, type ClassBand, DEFAULT_BANDS, distinctionCount, normalise, overlaps } from './exam-ops.logic.js';
import { progressReportPdf, rankListPdf } from './exam-ops-pdf.js';
import { ExamsService } from './exams.service.js';
import { rankDescending } from './ranks.js';
import { studentHeader } from './results.controller.js';
import { ADMIN } from './schemes.controller.js';

const MANAGE: RoleName[] = [...ADMIN, 'hod'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-05');

const PracticalBody = z
  .object({
  subjectId: z.uuid(),
  kind: z.enum(['practical', 'viva', 'project']).default('practical'),
  batchLabel: z.string().trim().max(60).default(''),
  roomId: z.uuid().nullish(),
  slotDate: Day,
  startsAt: z.string().regex(TIME),
  endsAt: z.string().regex(TIME),
  internalExaminerId: z.uuid(),
  externalExaminerName: z.string().trim().max(120).default(''),
  externalExaminerOrg: z.string().trim().max(160).default(''),
  maxMarks: z.number().min(0).max(1000).default(0),
  /** The candidates: named one by one, or everyone in a class. */
  studentIds: z.array(z.uuid()).min(1).max(200).optional(),
  sectionId: z.uuid().optional(),
}).refine((b) => !!b.studentIds || !!b.sectionId, { message: 'Choose the candidates or a class', path: ['studentIds'] });
const PracticalMarksBody = z
  .object({
    entries: z.array(z.object({ studentId: z.uuid(), present: z.boolean(), marks: z.number().min(0).nullish(), remarks: z.string().trim().max(300).optional() })).min(1).max(200).optional(),
    /** Or one line per candidate, "roll no, marks" ("absent" for someone who did not come): what the examiner types at the desk. */
    sheet: z.string().trim().max(8000).optional(),
  })
  .refine((b) => !!b.entries || !!b.sheet, { message: 'Give the marks', path: ['entries'] });
const NormaliseBody = z.object({ method: z.enum(['scale', 'add', 'target_mean']), value: z.number().min(-100).max(1000), reason: z.string().trim().min(3).max(300), preview: z.boolean().default(false) });
const BandsBody = z.object({ bands: z.array(z.object({ name: z.string().trim().min(2).max(40), minPercent: z.number().min(0).max(100) })).min(1).max(8) });

/** Practical and viva sittings with examiners, bulk normalisation, result classes, and consolidated result documents (PRD sections 23 and 25). */
@Controller('v1')
export class ExamOpsController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  /** What the exam operations screen offers to choose from: sessions and their papers, staff, assessments that can be normalised, locked papers. */
  @Get('exam-ops/options')
  @Auth('user', MANAGE)
  options(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sessionRows = await tx.select({ id: examSessions.id, name: examSessions.name, status: examSessions.status, startsOn: examSessions.startsOn }).from(examSessions).orderBy(desc(examSessions.startsOn)).limit(30);
      const papers = sessionRows.length
        ? await tx.select({ id: examPapers.id, sessionId: examPapers.sessionId, subjectId: examPapers.subjectId, subject: subjects.name, sectionId: examPapers.sectionId, section: sections.displayName }).from(examPapers).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).innerJoin(sections, eq(sections.id, examPapers.sectionId)).where(inArray(examPapers.sessionId, sessionRows.map((x) => x.id))).limit(400)
        : [];
      const staffIds = tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, ['teacher', 'hod', 'principal', 'examiner', 'exam_controller']));
      const staff = await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, staffIds)).orderBy(asc(users.fullName));
      const controllers = await tx.select({ id: users.id, fullName: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(eq(userRoles.role, 'exam_controller')).orderBy(asc(users.fullName));
      const normalisable = await tx.select({ id: assessments.id, title: assessments.title, maxMarks: assessments.maxMarks, markStatus: assessments.markStatus, section: sections.displayName, subject: subjects.name }).from(assessments).innerJoin(sections, eq(sections.id, assessments.sectionId)).innerJoin(subjects, eq(subjects.id, assessments.subjectId)).where(and(inArray(assessments.markStatus, ['verified', 'moderated']), sql`${assessments.publishedAt} is null`)).orderBy(desc(assessments.heldOn)).limit(100);
      const lockedPapers = await tx.select({ id: qbPapers.id, title: qbPapers.title }).from(qbPapers).where(eq(qbPapers.status, 'locked')).orderBy(desc(qbPapers.lockedAt)).limit(100);
      return { sessions: sessionRows, papers, staff, controllers, normalisable, lockedPapers };
    });
  }

  // ---- practical / viva / project sittings ----------------------------------------------------------------

  @Post('exam-sessions/:id/practicals')
  @Auth('user', MANAGE)
  createPractical(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PracticalBody)) b: z.infer<typeof PracticalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.exams.session(tx, id);
      if (b.startsAt >= b.endsAt) throw new BadRequestException('The sitting must end after it starts');
      const [ex] = await tx.select({ id: users.id }).from(users).where(eq(users.id, b.internalExaminerId));
      if (!ex) throw new BadRequestException('Choose an internal examiner from the staff');
      const [sub] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.subjectId));
      if (!sub) throw new BadRequestException('Subject not found');
      const wanted = b.studentIds ?? (await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, b.sectionId!), eq(students.status, 'active'))).orderBy(asc(students.rollNo)).limit(200)).map((r) => r.id);
      if (wanted.length === 0) throw new BadRequestException('That class has no students');
      const found = await tx.select({ id: students.id }).from(students).where(inArray(students.id, wanted));
      if (found.length !== new Set(wanted).size) throw new BadRequestException('Some candidates are not students of this institution');
      const sameDay = await tx.select().from(examPracticalSlots).where(and(eq(examPracticalSlots.slotDate, b.slotDate), ne(examPracticalSlots.status, 'cancelled')));
      for (const o of sameDay.filter((x) => overlaps(b.startsAt, b.endsAt, x.startsAt.slice(0, 5), x.endsAt.slice(0, 5)))) {
        if (o.internalExaminerId === b.internalExaminerId) throw new ConflictException('That examiner already has a sitting at this time');
        if (b.roomId && o.roomId === b.roomId) throw new ConflictException('That room is already booked at this time');
      }
      const [slot] = await tx
        .insert(examPracticalSlots)
        .values({ tenantId: p.tenantId, sessionId: id, subjectId: b.subjectId, kind: b.kind, batchLabel: b.batchLabel, roomId: b.roomId ?? null, slotDate: b.slotDate, startsAt: b.startsAt, endsAt: b.endsAt, internalExaminerId: b.internalExaminerId, externalExaminerName: b.externalExaminerName, externalExaminerOrg: b.externalExaminerOrg, maxMarks: b.maxMarks, createdBy: p.userId })
        .returning();
      await tx.insert(examPracticalCandidates).values([...new Set(wanted)].map((studentId) => ({ tenantId: p.tenantId, slotId: slot.id, studentId })));
      await auditUser(tx, p, 'exam.practical_scheduled', 'exam_practical_slot', slot.id, { candidates: wanted.length });
      return slot;
    });
  }

  @Get('exam-sessions/:id/practicals')
  @Auth('user', MANAGE)
  listPracticals(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.slotRows(tx, eq(examPracticalSlots.sessionId, id)));
  }

  /** The sittings the signed-in examiner has been given. */
  @Get('practicals/mine')
  @Auth('user')
  minePracticals(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => this.slotRows(tx, and(eq(examPracticalSlots.internalExaminerId, p.userId), ne(examPracticalSlots.status, 'cancelled'))));
  }

  private async slotRows(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], where: ReturnType<typeof and>) {
    const slots = await tx
      .select({ slot: examPracticalSlots, subject: subjects.name, room: rooms.name, examiner: users.fullName })
      .from(examPracticalSlots)
      .innerJoin(subjects, eq(subjects.id, examPracticalSlots.subjectId))
      .innerJoin(users, eq(users.id, examPracticalSlots.internalExaminerId))
      .leftJoin(rooms, eq(rooms.id, examPracticalSlots.roomId))
      .where(where)
      .orderBy(asc(examPracticalSlots.slotDate), asc(examPracticalSlots.startsAt));
    const ids = slots.map((s) => s.slot.id);
    const cands = ids.length
      ? await tx.select({ c: examPracticalCandidates, name: students.fullName, rollNo: students.rollNo }).from(examPracticalCandidates).innerJoin(students, eq(students.id, examPracticalCandidates.studentId)).where(inArray(examPracticalCandidates.slotId, ids)).orderBy(asc(students.rollNo))
      : [];
    return slots.map((s) => ({ ...s.slot, subject: s.subject, room: s.room, examiner: s.examiner, candidates: cands.filter((c) => c.c.slotId === s.slot.id).map((c) => ({ studentId: c.c.studentId, name: c.name, rollNo: c.rollNo, present: c.c.present, marks: c.c.marks, remarks: c.c.remarks })) }));
  }

  /** The internal examiner (or exam staff) records who attended and the marks. */
  @Post('practicals/:id/marks')
  @HttpCode(200)
  @Auth('user')
  practicalMarks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PracticalMarksBody)) b: z.infer<typeof PracticalMarksBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [slot] = await tx.select().from(examPracticalSlots).where(eq(examPracticalSlots.id, id));
      if (!slot) throw new NotFoundException('Sitting not found');
      if (slot.internalExaminerId !== p.userId && !p.roles.some((r) => MANAGE.includes(r))) throw new ForbiddenException('Only the examiner of this sitting can enter marks');
      if (slot.status === 'cancelled') throw new ConflictException('This sitting was cancelled');
      let entries = b.entries ?? [];
      if (b.sheet) {
        const roster = await tx.select({ studentId: examPracticalCandidates.studentId, rollNo: students.rollNo }).from(examPracticalCandidates).innerJoin(students, eq(students.id, examPracticalCandidates.studentId)).where(eq(examPracticalCandidates.slotId, id));
        entries = [];
        for (const line of b.sheet.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const [roll, value = ''] = line.split(',').map((x) => x.trim());
          const who = roster.find((r) => r.rollNo.toLowerCase() === roll.toLowerCase());
          if (!who) throw new BadRequestException(`"${roll}" is not in this sitting`);
          if (/^(a|ab|absent)$/i.test(value)) entries.push({ studentId: who.studentId, present: false });
          else {
            const marks = Number(value);
            if (value === '' || !Number.isFinite(marks) || marks < 0) throw new BadRequestException(`Give the marks for ${roll}, or "absent"`);
            entries.push({ studentId: who.studentId, present: true, marks });
          }
        }
      }
      for (const e of entries) {
        if (e.present && e.marks != null && e.marks > slot.maxMarks) throw new BadRequestException(`Marks cannot be more than ${slot.maxMarks}`);
        const res = await tx.update(examPracticalCandidates).set({ present: e.present, marks: e.present ? (e.marks ?? null) : null, remarks: e.remarks ?? null }).where(and(eq(examPracticalCandidates.slotId, id), eq(examPracticalCandidates.studentId, e.studentId))).returning({ id: examPracticalCandidates.id });
        if (res.length === 0) throw new BadRequestException('Some students are not in this sitting');
      }
      const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(examPracticalCandidates).where(and(eq(examPracticalCandidates.slotId, id), sql`${examPracticalCandidates.present} is null`));
      const status = open.n === 0 ? 'done' : 'scheduled';
      await tx.update(examPracticalSlots).set({ status }).where(eq(examPracticalSlots.id, id));
      await auditUser(tx, p, 'exam.practical_marks', 'exam_practical_slot', id, { entries: entries.length });
      return { status, pending: open.n };
    });
  }

  @Post('practicals/:id/cancel')
  @HttpCode(200)
  @Auth('user', MANAGE)
  cancelPractical(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(examPracticalSlots).set({ status: 'cancelled' }).where(and(eq(examPracticalSlots.id, id), eq(examPracticalSlots.status, 'scheduled'))).returning();
      if (!row) throw new ConflictException('Only a scheduled sitting can be cancelled');
      await auditUser(tx, p, 'exam.practical_cancelled', 'exam_practical_slot', id);
      return row;
    });
  }

  // ---- normalisation ----------------------------------------------------------------------------------------

  /** Scale, shift or re-centre a whole assessment's marks. `preview` shows the effect without saving; the before values are kept so it can be undone. */
  @Post('exam-ops/normalise/:assessmentId')
  @HttpCode(200)
  @Auth('user', MANAGE)
  normalise(@CurrentPrincipal() p: UserPrincipal, @Param('assessmentId', ParseUUIDPipe) assessmentId: string, @Body(new ZodBody(NormaliseBody)) b: z.infer<typeof NormaliseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(assessments).where(eq(assessments.id, assessmentId)).for('update');
      if (!a) throw new NotFoundException('Assessment not found');
      if (a.markStatus !== 'verified' && a.markStatus !== 'moderated') throw new ConflictException('Verify the marks before normalising');
      if (a.publishedAt) throw new ConflictException('These marks are published; use revaluation');
      const rows = await tx.select().from(marks).where(and(eq(marks.assessmentId, assessmentId), eq(marks.absent, false)));
      const current = rows.filter((r) => (r.moderatedMarks ?? r.marks) !== null).map((r) => ({ studentId: r.studentId, marks: (r.moderatedMarks ?? r.marks) as number }));
      const changes = normalise(b.method, b.value, a.maxMarks, current);
      const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100 : 0);
      const summary = { students: current.length, changed: changes.length, meanBefore: mean(current.map((c) => c.marks)), meanAfter: mean(current.map((c) => changes.find((x) => x.studentId === c.studentId)?.after ?? c.marks)) };
      if (b.preview) return { preview: true, ...summary, changes: changes.slice(0, 200) };
      if (changes.length === 0) throw new ConflictException('That change would not alter any mark');
      const prior = new Map(rows.map((r) => [r.studentId, r.moderatedMarks]));
      for (const c of changes) await tx.update(marks).set({ moderatedMarks: c.after, moderationNote: `Normalised (${b.method} ${b.value}): ${b.reason}`, updatedAt: new Date() }).where(and(eq(marks.assessmentId, assessmentId), eq(marks.studentId, c.studentId)));
      await tx.update(assessments).set({ markStatus: 'moderated', moderatedBy: p.userId, moderatedAt: new Date() }).where(eq(assessments.id, assessmentId));
      const [log] = await tx.insert(markNormalisations).values({ tenantId: p.tenantId, assessmentId, method: b.method, value: b.value, affected: changes.length, before: changes.map((c) => ({ studentId: c.studentId, moderated: prior.get(c.studentId) ?? null })), reason: b.reason, appliedBy: p.userId }).returning();
      await auditUser(tx, p, 'marks.normalised', 'assessment', assessmentId, { method: b.method, value: b.value, changed: changes.length });
      return { preview: false, id: log.id, ...summary };
    });
  }

  @Get('exam-ops/normalisations')
  @Auth('user', MANAGE)
  normalisations(@CurrentPrincipal() p: UserPrincipal, @Query('assessmentId') assessmentId?: string) {
    if (assessmentId && !z.uuid().safeParse(assessmentId).success) throw new BadRequestException('Choose an assessment');
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .select({ id: markNormalisations.id, assessmentId: markNormalisations.assessmentId, title: assessments.title, method: markNormalisations.method, value: markNormalisations.value, affected: markNormalisations.affected, reason: markNormalisations.reason, appliedAt: markNormalisations.appliedAt, revertedAt: markNormalisations.revertedAt })
        .from(markNormalisations)
        .innerJoin(assessments, eq(assessments.id, markNormalisations.assessmentId))
        .where(assessmentId ? eq(markNormalisations.assessmentId, assessmentId) : undefined)
        .orderBy(desc(markNormalisations.appliedAt))
        .limit(100),
    );
  }

  /** Puts the moderated marks back as they were before this normalisation. */
  @Post('exam-ops/normalisations/:id/revert')
  @HttpCode(200)
  @Auth('user', MANAGE)
  revert(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [n] = await tx.select().from(markNormalisations).where(eq(markNormalisations.id, id)).for('update');
      if (!n) throw new NotFoundException('Normalisation not found');
      if (n.revertedAt) throw new ConflictException('Already undone');
      const [a] = await tx.select({ publishedAt: assessments.publishedAt }).from(assessments).where(eq(assessments.id, n.assessmentId));
      if (a?.publishedAt) throw new ConflictException('These marks are published; use revaluation');
      for (const r of n.before) await tx.update(marks).set({ moderatedMarks: r.moderated, moderationNote: r.moderated === null ? null : 'Restored after undoing a normalisation', updatedAt: new Date() }).where(and(eq(marks.assessmentId, n.assessmentId), eq(marks.studentId, r.studentId)));
      await tx.update(markNormalisations).set({ revertedAt: new Date() }).where(eq(markNormalisations.id, id));
      await auditUser(tx, p, 'marks.normalisation_reverted', 'assessment', n.assessmentId);
      return { reverted: n.before.length };
    });
  }

  // ---- result classes ---------------------------------------------------------------------------------------

  @Get('exam-ops/class-bands')
  @Auth('user', MANAGE)
  getBands(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ bands: await this.bands(tx), custom: !!(await tx.select({ id: resultClassBands.id }).from(resultClassBands))[0] }));
  }

  @Put('exam-ops/class-bands')
  @Auth('user', ADMIN)
  putBands(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BandsBody)) b: z.infer<typeof BandsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bands = [...b.bands].sort((x, y) => y.minPercent - x.minPercent);
      await tx.insert(resultClassBands).values({ tenantId: p.tenantId, bands, updatedBy: p.userId }).onConflictDoUpdate({ target: resultClassBands.tenantId, set: { bands, updatedBy: p.userId, updatedAt: new Date() } });
      await auditUser(tx, p, 'exam.class_bands_saved', 'result_class_bands', p.tenantId);
      return { bands };
    });
  }

  private async bands(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0]): Promise<ClassBand[]> {
    const [row] = await tx.select().from(resultClassBands);
    return row?.bands ?? DEFAULT_BANDS;
  }

  /** Overall percentage, class and subject-wise distinctions for every candidate of a processed session. */
  @Get('exam-sessions/:id/classification')
  @Auth('user', MANAGE)
  classification(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.classRows(tx, id));
  }

  private async classRows(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], sessionId: string) {
    await this.exams.session(tx, sessionId);
    const bands = await this.bands(tx);
    const rows = await tx
      .select({ studentId: examResults.studentId, name: students.fullName, rollNo: students.rollNo, section: sections.displayName, sgpa: examResults.sgpa, outcome: examResults.outcome })
      .from(examResults)
      .innerJoin(students, eq(students.id, examResults.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(examResults.sessionId, sessionId))
      .orderBy(asc(students.rollNo));
    if (rows.length === 0) throw new ConflictException('No results yet; process the session first');
    const lines = await tx.select({ studentId: examResults.studentId, percent: examResultLines.percent, credits: examResultLines.credits, passed: examResultLines.passed }).from(examResultLines).innerJoin(examResults, eq(examResults.id, examResultLines.resultId)).where(eq(examResults.sessionId, sessionId));
    const out = rows.map((r) => {
      const mine = lines.filter((l) => l.studentId === r.studentId);
      const credits = mine.reduce((a, l) => a + l.credits, 0);
      const percent = mine.length ? Math.round((mine.reduce((a, l) => a + l.percent * (credits ? l.credits : 1), 0) / (credits ? credits : mine.length)) * 100) / 100 : null;
      const passedAll = r.outcome === 'pass' && mine.every((l) => l.passed);
      return { ...r, percent, class: percent === null ? '-' : classOf(bands, percent, passedAll), distinctions: distinctionCount(bands, mine.map((l) => l.percent)) };
    });
    const ranked = rankDescending(out.filter((r) => r.class !== 'Fail' && r.percent !== null), (r) => r.percent as number);
    const rank = new Map(ranked.map((r) => [r.studentId, r.rank]));
    return { bands, students: out.map((r) => ({ ...r, rank: rank.get(r.studentId) ?? null })) };
  }

  /** The consolidated result sheet as a PDF: rank, SGPA, percentage and class for the whole session. */
  @Get('exam-sessions/:id/consolidated.pdf')
  @Auth('user', MANAGE)
  async consolidated(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      const { students: rows } = await this.classRows(tx, id);
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const sorted = [...rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
      await auditUser(tx, p, 'exam.consolidated_downloaded', 'exam_session', id);
      return rankListPdf(t?.name ?? '', s.name, sorted.map((r) => ({ rank: r.rank, rollNo: r.rollNo, name: r.name, section: r.section, sgpa: r.sgpa, percent: r.percent, className: r.class })));
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="consolidated-result.pdf"');
    res.end(pdf);
  }

  /** A student's progress report across published sessions (the student, the family, or exam staff). */
  @Get('results/students/:studentId/progress-report.pdf')
  @Auth('user')
  async progress(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, MANAGE);
      const bands = await this.bands(tx);
      const results = await tx
        .select({ id: examResults.id, name: examSessions.name, startsOn: examSessions.startsOn, sgpa: examResults.sgpa, cgpa: examResults.cgpa, outcome: examResults.outcome })
        .from(examResults)
        .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
        .where(and(eq(examResults.studentId, studentId), inArray(examSessions.status, ['published', 'locked'])))
        .orderBy(asc(examSessions.startsOn));
      const lines = results.length
        ? await tx.select({ resultId: examResultLines.resultId, subject: subjects.name, percent: examResultLines.percent, grade: examResultLines.grade, passed: examResultLines.passed, credits: examResultLines.credits }).from(examResultLines).innerJoin(subjects, eq(subjects.id, examResultLines.subjectId)).where(inArray(examResultLines.resultId, results.map((r) => r.id)))
        : [];
      const sessions = results.map((r) => {
        const mine = lines.filter((l) => l.resultId === r.id);
        const credits = mine.reduce((a, l) => a + l.credits, 0);
        const percent = mine.length ? mine.reduce((a, l) => a + l.percent * (credits ? l.credits : 1), 0) / (credits ? credits : mine.length) : null;
        return { name: r.name, sgpa: r.sgpa, cgpa: r.cgpa, outcome: r.outcome, percent, className: percent === null ? '' : classOf(bands, percent, r.outcome === 'pass' && mine.every((l) => l.passed)), lines: mine.map((l) => ({ subject: l.subject, percent: l.percent, grade: l.grade, passed: l.passed })) };
      });
      return progressReportPdf(await studentHeader(tx, p.tenantId, studentId), sessions);
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="progress-report.pdf"');
    res.end(pdf);
  }
}
