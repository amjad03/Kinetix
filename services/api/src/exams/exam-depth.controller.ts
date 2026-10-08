import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examPapers, examResultLines, examResultRules, examResults, examSessions, graceAwards, invigilationDuties, malpracticeCases, marks, rooms, sections, students, subjects, supplementaryRegistrations, users } from '../db/schema.js';
import { parseDate } from '../teacher/teacher.service.js';
import { ExamsService } from './exams.service.js';
import { progression, rankDescending } from './ranks.js';
import { ADMIN } from './schemes.controller.js';
import { overlaps } from './seating.js';

const MANAGE: RoleName[] = [...ADMIN, 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const DutyBody = z.object({
  staffId: z.uuid(),
  roomId: z.uuid(),
  dutyDate: z.string(),
  startsAt: z.string().regex(TIME),
  endsAt: z.string().regex(TIME),
  role: z.enum(['invigilator', 'chief']).default('invigilator'),
});
const SubstituteBody = z.object({ staffId: z.uuid() });
const SupplementaryBody = z.object({ studentId: z.uuid(), subjectIds: z.array(z.uuid()).min(1).max(20) });
const MalpracticeBody = z.object({ studentId: z.uuid(), paperId: z.uuid().optional(), roomId: z.uuid().optional(), description: z.string().trim().min(3).max(2000) });
const MalpracticeDecideBody = z.object({ outcome: z.enum(['penalised', 'dismissed']), penalty: z.string().trim().max(300).optional(), note: z.string().trim().max(500).optional() });
const RulesBody = z.object({
  graceMaxPerSubject: z.number().min(0).max(50),
  graceMaxTotal: z.number().min(0).max(200),
  progressionMinCredits: z.number().min(0).max(500).nullable().default(null),
  progressionMaxBacklogs: z.number().int().min(0).max(50).nullable().default(null),
});
const GraceBody = z.object({ dryRun: z.boolean().default(false) });

class DryRun extends Error {
  constructor(readonly result: unknown) {
    super('dry run');
  }
}

/** Exam controller depth: invigilation roster, supplementary registration, malpractice cases. */
@Controller('v1')
export class ExamControllerDepthController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  // ---- Invigilation -------------------------------------------------------------------------

  @Post('exam-sessions/:id/duties')
  @Auth('user', MANAGE)
  addDuty(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DutyBody)) body: z.infer<typeof DutyBody>) {
    const dutyDate = parseDate(body.dutyDate, 'dutyDate');
    if (body.endsAt <= body.startsAt) throw new BadRequestException('A duty must end after it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (dutyDate < s.startsOn || dutyDate > s.endsOn) throw new BadRequestException('The duty is outside the session dates');
      const [room] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, body.roomId));
      if (!room) throw new NotFoundException('Room not found');
      const [staff] = await tx.select({ id: users.id }).from(users).where(eq(users.id, body.staffId));
      if (!staff) throw new NotFoundException('Staff member not found');
      await this.assertFree(tx, body.staffId, { examDate: dutyDate, startsAt: body.startsAt, endsAt: body.endsAt });
      const [row] = await tx.insert(invigilationDuties).values({ tenantId: p.tenantId, sessionId: id, ...body, dutyDate, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.duty.assigned', subjectType: 'exam_session', subjectId: id, data: { dutyId: row.id, staffId: body.staffId, roomId: body.roomId } });
      return row;
    });
  }

  @Get('exam-sessions/:id/duties')
  @Auth('user', MANAGE)
  duties(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: invigilationDuties.id, staffId: invigilationDuties.staffId, staff: users.fullName, roomId: invigilationDuties.roomId, room: rooms.name, dutyDate: invigilationDuties.dutyDate, startsAt: invigilationDuties.startsAt, endsAt: invigilationDuties.endsAt, role: invigilationDuties.role, status: invigilationDuties.status })
        .from(invigilationDuties)
        .innerJoin(users, eq(users.id, invigilationDuties.staffId))
        .innerJoin(rooms, eq(rooms.id, invigilationDuties.roomId))
        .where(eq(invigilationDuties.sessionId, id))
        .orderBy(asc(invigilationDuties.dutyDate), asc(invigilationDuties.startsAt), asc(rooms.name)),
    );
  }

  @Delete('exam-sessions/:id/duties/:dutyId')
  @HttpCode(200)
  @Auth('user', MANAGE)
  removeDuty(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('dutyId', ParseUUIDPipe) dutyId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(invigilationDuties).where(and(eq(invigilationDuties.id, dutyId), eq(invigilationDuties.sessionId, id))).returning({ id: invigilationDuties.id });
      if (gone.length === 0) throw new NotFoundException('Duty not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.duty.removed', subjectType: 'exam_session', subjectId: id, data: { dutyId } });
      return { ok: true };
    });
  }

  /** Hands a duty to another staff member (illness, leave); the new person must be free. */
  @Post('exam-sessions/:id/duties/:dutyId/substitute')
  @HttpCode(200)
  @Auth('user', MANAGE)
  substitute(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('dutyId', ParseUUIDPipe) dutyId: string, @Body(new ZodBody(SubstituteBody)) body: z.infer<typeof SubstituteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(invigilationDuties).where(and(eq(invigilationDuties.id, dutyId), eq(invigilationDuties.sessionId, id)));
      if (!d) throw new NotFoundException('Duty not found');
      if (d.staffId === body.staffId) throw new BadRequestException('That person already has this duty');
      const [staff] = await tx.select({ id: users.id }).from(users).where(eq(users.id, body.staffId));
      if (!staff) throw new NotFoundException('Staff member not found');
      await this.assertFree(tx, body.staffId, { examDate: d.dutyDate, startsAt: d.startsAt, endsAt: d.endsAt }, d.id);
      const [row] = await tx.update(invigilationDuties).set({ staffId: body.staffId, status: 'substituted', substitutedFrom: d.staffId }).where(eq(invigilationDuties.id, dutyId)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.duty.substituted', subjectType: 'exam_session', subjectId: id, data: { dutyId, from: d.staffId, to: body.staffId } });
      return row;
    });
  }

  /** The caller's own duties. */
  @Get('invigilation/mine')
  @Auth('user', STAFF)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: invigilationDuties.id, session: examSessions.name, room: rooms.name, dutyDate: invigilationDuties.dutyDate, startsAt: invigilationDuties.startsAt, endsAt: invigilationDuties.endsAt, role: invigilationDuties.role })
        .from(invigilationDuties)
        .innerJoin(examSessions, eq(examSessions.id, invigilationDuties.sessionId))
        .innerJoin(rooms, eq(rooms.id, invigilationDuties.roomId))
        .where(eq(invigilationDuties.staffId, p.userId))
        .orderBy(asc(invigilationDuties.dutyDate), asc(invigilationDuties.startsAt)),
    );
  }

  /** Throws when the staff member already has a duty (in any session) overlapping the slot. */
  private async assertFree(tx: Tx, staffId: string, slot: { examDate: string; startsAt: string; endsAt: string }, exceptId?: string) {
    const same = await tx.select().from(invigilationDuties).where(and(eq(invigilationDuties.staffId, staffId), eq(invigilationDuties.dutyDate, slot.examDate), exceptId ? ne(invigilationDuties.id, exceptId) : sql`true`));
    if (same.some((d) => overlaps({ examDate: d.dutyDate, startsAt: d.startsAt.slice(0, 5), endsAt: d.endsAt.slice(0, 5) }, { ...slot, startsAt: slot.startsAt.slice(0, 5), endsAt: slot.endsAt.slice(0, 5) }))) throw new ConflictException('That staff member already has a duty at that time');
  }

  // ---- Supplementary / repeat exams ---------------------------------------------------------

  /** The subjects a student has not passed (latest attempt failed): what they may register for in a supplementary session. */
  @Get('results/students/:studentId/backlogs')
  @Auth('user')
  backlogs(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const [st] = await tx.select({ programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
      const latest = await this.exams.latestAttempts(tx, [studentId], st.programId);
      return (latest.get(studentId) ?? []).filter((l) => !l.passed).map(({ passed: _p, credits: _c, ...l }) => l);
    });
  }

  /** Registers a student for failed subjects in a supplementary session. */
  @Post('exam-sessions/:id/supplementary')
  @Auth('user')
  register(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SupplementaryBody)) body: z.infer<typeof SupplementaryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, body.studentId, MANAGE);
      const s = await this.exams.session(tx, id);
      if (s.kind !== 'supplementary') throw new ConflictException('Registration is only for supplementary sessions');
      if (s.status === 'processed' || s.status === 'published' || s.status === 'locked') throw new ConflictException('Registration is closed');
      const [st] = await tx.select({ programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, body.studentId));
      if (st.programId !== s.programId) throw new BadRequestException('The student is not in this programme');
      const failed = ((await this.exams.latestAttempts(tx, [body.studentId], s.programId)).get(body.studentId) ?? []).filter((l) => !l.passed);
      const rows = [];
      for (const subjectId of new Set(body.subjectIds)) {
        const f = failed.find((x) => x.subjectId === subjectId);
        if (!f) throw new BadRequestException('The student has not failed one of those subjects');
        const [dup] = await tx.select({ id: supplementaryRegistrations.id }).from(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, id), eq(supplementaryRegistrations.studentId, body.studentId), eq(supplementaryRegistrations.subjectId, subjectId)));
        if (dup) throw new ConflictException('Already registered for one of those subjects');
        const [row] = await tx.insert(supplementaryRegistrations).values({ tenantId: p.tenantId, sessionId: id, studentId: body.studentId, subjectId, failedInSessionId: f.sessionId, registeredBy: p.userId }).returning();
        rows.push(row);
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.supplementary.registered', subjectType: 'exam_session', subjectId: id, data: { studentId: body.studentId, subjects: rows.length } });
      return rows;
    });
  }

  @Get('exam-sessions/:id/supplementary')
  @Auth('user', MANAGE)
  registrations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: supplementaryRegistrations.id, studentId: supplementaryRegistrations.studentId, student: students.fullName, rollNo: students.rollNo, subjectId: supplementaryRegistrations.subjectId, subject: subjects.name, code: subjects.code })
        .from(supplementaryRegistrations)
        .innerJoin(students, eq(students.id, supplementaryRegistrations.studentId))
        .innerJoin(subjects, eq(subjects.id, supplementaryRegistrations.subjectId))
        .where(eq(supplementaryRegistrations.sessionId, id))
        .orderBy(asc(students.rollNo), asc(subjects.code)),
    );
  }

  @Delete('exam-sessions/:id/supplementary/:regId')
  @HttpCode(200)
  @Auth('user', MANAGE)
  unregister(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('regId', ParseUUIDPipe) regId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.id, regId), eq(supplementaryRegistrations.sessionId, id))).returning({ id: supplementaryRegistrations.id });
      if (gone.length === 0) throw new NotFoundException('Registration not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.supplementary.cancelled', subjectType: 'exam_session', subjectId: id, data: { regId } });
      return { ok: true };
    });
  }

  // ---- Malpractice --------------------------------------------------------------------------

  /** An invigilator or teacher records a malpractice case. */
  @Post('exam-sessions/:id/malpractice')
  @Auth('user', STAFF)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MalpracticeBody)) body: z.infer<typeof MalpracticeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.exams.session(tx, id);
      const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, body.studentId));
      if (!st) throw new NotFoundException('Student not found');
      if (body.paperId) {
        const [paper] = await tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.id, body.paperId), eq(examPapers.sessionId, id)));
        if (!paper) throw new BadRequestException('That paper is not in this session');
      }
      const [row] = await tx.insert(malpracticeCases).values({ tenantId: p.tenantId, sessionId: id, ...body, reportedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.malpractice.reported', subjectType: 'malpractice_case', subjectId: row.id, data: { studentId: body.studentId } });
      return row;
    });
  }

  @Get('exam-sessions/:id/malpractice')
  @Auth('user', MANAGE)
  cases(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: malpracticeCases.id, studentId: malpracticeCases.studentId, student: students.fullName, rollNo: students.rollNo, paperId: malpracticeCases.paperId, description: malpracticeCases.description, status: malpracticeCases.status, penalty: malpracticeCases.penalty, decisionNote: malpracticeCases.decisionNote, createdAt: malpracticeCases.createdAt })
        .from(malpracticeCases)
        .innerJoin(students, eq(students.id, malpracticeCases.studentId))
        .where(eq(malpracticeCases.sessionId, id))
        .orderBy(asc(malpracticeCases.createdAt)),
    );
  }

  @Post('malpractice/:id/decide')
  @HttpCode(200)
  @Auth('user', ADMIN)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MalpracticeDecideBody)) body: z.infer<typeof MalpracticeDecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(malpracticeCases).where(eq(malpracticeCases.id, id));
      if (!c) throw new NotFoundException('Case not found');
      if (c.status !== 'reported') throw new ConflictException('Already decided');
      if (body.outcome === 'penalised' && !body.penalty) throw new BadRequestException('Say what the penalty is');
      await tx.update(malpracticeCases).set({ status: body.outcome, penalty: body.outcome === 'penalised' ? body.penalty : null, decisionNote: body.note ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(malpracticeCases.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `exam.malpractice.${body.outcome}`, subjectType: 'malpractice_case', subjectId: id, data: { studentId: c.studentId, penalty: body.penalty ?? null } });
      return { status: body.outcome };
    });
  }
}

/** Results depth: grace marks, subject and class ranks, and the progression check. */
@Controller('v1/exam-sessions/:id')
export class ResultsDepthController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  @Get('result-rules')
  @Auth('user', MANAGE)
  rules(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.loadRules(tx, id)) ?? { sessionId: id, graceMaxPerSubject: 0, graceMaxTotal: 0, progressionMinCredits: null, progressionMaxBacklogs: null });
  }

  @Put('result-rules')
  @Auth('user', ADMIN)
  setRules(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RulesBody)) body: z.infer<typeof RulesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are published; the rules can no longer change');
      const [row] = await tx.insert(examResultRules).values({ tenantId: p.tenantId, sessionId: id, ...body }).onConflictDoUpdate({ target: examResultRules.sessionId, set: body }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.rules.set', subjectType: 'exam_session', subjectId: id, data: body });
      return row;
    });
  }

  /**
   * Gives grace marks to students who fail a subject: the smallest whole number of marks (within the
   * per-subject and per-student limits and the paper maximum) that makes the subject pass is added to
   * the exam marks as moderated marks, then results are re-calculated. With `dryRun` nothing is saved.
   */
  @Post('grace')
  @HttpCode(200)
  @Auth('user', ADMIN)
  async grace(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(GraceBody)) body: z.infer<typeof GraceBody>) {
    try {
      return await this.db.withTenant(p.tenantId, async (tx) => {
        const s = await this.exams.session(tx, id);
        if (s.status !== 'processed') throw new ConflictException('Grace marks are applied to processed results that are not yet published');
        const rules = await this.loadRules(tx, id);
        if (!rules || rules.graceMaxPerSubject <= 0 || rules.graceMaxTotal <= 0) throw new ConflictException('Set the grace limits first');
        const papers = await tx.select().from(examPapers).where(eq(examPapers.sessionId, id));
        const results = await this.exams.compute(tx, s);
        const given = await tx.select().from(graceAwards).where(eq(graceAwards.sessionId, id));
        const awards: { studentId: string; subjectId: string; marks: number }[] = [];
        const touched = new Set<string>();
        for (const r of results) {
          let used = given.filter((g) => g.studentId === r.studentId).reduce((a, g) => a + g.marks, 0);
          const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, r.studentId));
          for (const line of r.lines.filter((l) => !l.result.passed)) {
            if (given.some((g) => g.studentId === r.studentId && g.subjectId === line.subjectId)) continue;
            const paper = papers.find((x) => x.subjectId === line.subjectId && x.sectionId === st.sectionId);
            if (!paper?.assessmentId) continue;
            const [m] = await tx.select().from(marks).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
            if (!m || m.absent || m.marks === null) continue;
            const base = m.moderatedMarks ?? m.marks;
            const limit = Math.floor(Math.min(rules.graceMaxPerSubject, rules.graceMaxTotal - used, paper.maxMarks - base));
            let won = 0;
            for (let g = 1; g <= limit && !won; g++) {
              await tx.update(marks).set({ moderatedMarks: base + g, moderationNote: `Grace marks +${g}` }).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
              const [again] = await this.exams.compute(tx, s, r.studentId);
              if (again.lines.find((l) => l.subjectId === line.subjectId)?.result.passed) won = g;
            }
            if (!won) {
              await tx.update(marks).set({ moderatedMarks: m.moderatedMarks, moderationNote: m.moderationNote }).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
              continue;
            }
            used += won;
            awards.push({ studentId: r.studentId, subjectId: line.subjectId, marks: won });
            touched.add(r.studentId);
            await tx.insert(graceAwards).values({ tenantId: p.tenantId, sessionId: id, studentId: r.studentId, subjectId: line.subjectId, marks: won, appliedBy: p.userId });
            await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.grace_applied', subjectType: 'exam_session', subjectId: id, data: { studentId: r.studentId, subjectId: line.subjectId, marks: won, from: base, to: base + won } });
          }
        }
        if (touched.size) await this.exams.store(tx, p.tenantId, s, await this.recompute(tx, s, [...touched]));
        const out = { dryRun: body.dryRun, awards, students: touched.size };
        if (body.dryRun) throw new DryRun(out);
        return out;
      });
    } catch (e) {
      if (e instanceof DryRun) return e.result;
      throw e;
    }
  }

  @Get('grace')
  @Auth('user', MANAGE)
  graceList(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ studentId: graceAwards.studentId, student: students.fullName, rollNo: students.rollNo, subjectId: graceAwards.subjectId, subject: subjects.name, marks: graceAwards.marks, appliedAt: graceAwards.appliedAt })
        .from(graceAwards)
        .innerJoin(students, eq(students.id, graceAwards.studentId))
        .innerJoin(subjects, eq(subjects.id, graceAwards.subjectId))
        .where(eq(graceAwards.sessionId, id))
        .orderBy(asc(students.rollNo)),
    );
  }

  /**
   * Class rank (within the section) and programme rank by SGPA, and with `subjectId` the subject-wise
   * rank by percent. Ties share a rank. Only students who passed every subject are ranked overall.
   */
  @Get('ranks')
  @Auth('user', MANAGE)
  ranks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('subjectId') subjectId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.exams.session(tx, id);
      const rows = await tx
        .select({ studentId: examResults.studentId, name: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, section: sections.displayName, sgpa: examResults.sgpa, outcome: examResults.outcome })
        .from(examResults)
        .innerJoin(students, eq(students.id, examResults.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(examResults.sessionId, id));
      if (rows.length === 0) throw new ConflictException('No results yet; process the session first');
      const ranked = rankDescending(rows.filter((r) => r.outcome === 'pass'), (r) => r.sgpa);
      const programmeRank = new Map(ranked.map((r) => [r.studentId, r.rank]));
      const classRank = new Map<string, number>();
      for (const sec of new Set(rows.map((r) => r.sectionId)))
        for (const r of rankDescending(rows.filter((x) => x.sectionId === sec && x.outcome === 'pass'), (x) => x.sgpa)) classRank.set(r.studentId, r.rank);
      const overall = [...rows].sort((a, b) => b.sgpa - a.sgpa || a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })).map((r) => ({ studentId: r.studentId, name: r.name, rollNo: r.rollNo, section: r.section, sgpa: r.sgpa, passed: r.outcome === 'pass', classRank: classRank.get(r.studentId) ?? null, programmeRank: programmeRank.get(r.studentId) ?? null }));
      let subject: unknown = undefined;
      if (subjectId) {
        const lines = await tx
          .select({ studentId: examResults.studentId, name: students.fullName, rollNo: students.rollNo, percent: examResultLines.percent, grade: examResultLines.grade, passed: examResultLines.passed })
          .from(examResultLines)
          .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
          .innerJoin(students, eq(students.id, examResults.studentId))
          .where(and(eq(examResults.sessionId, id), eq(examResultLines.subjectId, subjectId)));
        subject = rankDescending(lines.filter((l) => l.passed), (l) => l.percent);
      }
      return { students: overall, subject };
    });
  }

  /** Who may move to the next term under the session's rule (credits earned and backlogs, counting earlier terms). */
  @Get('progression')
  @Auth('user', MANAGE)
  progressionReport(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      const rules = await this.loadRules(tx, id);
      if (!rules || (rules.progressionMinCredits === null && rules.progressionMaxBacklogs === null)) throw new ConflictException('Set the progression rule first');
      const rows = await tx
        .select({ studentId: examResults.studentId, name: students.fullName, rollNo: students.rollNo })
        .from(examResults)
        .innerJoin(students, eq(students.id, examResults.studentId))
        .where(eq(examResults.sessionId, id))
        .orderBy(asc(students.rollNo));
      if (rows.length === 0) throw new ConflictException('No results yet; process the session first');
      const latest = await this.exams.latestAttempts(tx, rows.map((r) => r.studentId), s.programId, id);
      const students_ = rows.map((r) => {
        const ls = latest.get(r.studentId) ?? [];
        const creditsEarned = ls.filter((l) => l.passed).reduce((a, l) => a + l.credits, 0);
        const backlogs = ls.filter((l) => !l.passed).length;
        return { ...r, creditsEarned, backlogs, ...progression({ creditsEarned, backlogs }, { minCreditsEarned: rules.progressionMinCredits, maxBacklogs: rules.progressionMaxBacklogs }) };
      });
      return { rule: { minCredits: rules.progressionMinCredits, maxBacklogs: rules.progressionMaxBacklogs }, eligible: students_.filter((x) => x.eligible).length, held: students_.filter((x) => !x.eligible).length, students: students_ };
    });
  }

  private async loadRules(tx: Tx, id: string) {
    const [r] = await tx.select().from(examResultRules).where(eq(examResultRules.sessionId, id));
    return r ?? null;
  }

  private async recompute(tx: Tx, s: Awaited<ReturnType<ExamsService['session']>>, studentIds: string[]) {
    const out = [];
    for (const sid of studentIds) out.push(...(await this.exams.compute(tx, s, sid)));
    return out;
  }
}
