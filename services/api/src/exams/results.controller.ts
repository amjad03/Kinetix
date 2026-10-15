import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { withheldSessions } from '../exam-cell/withholds.js';
import { revaluationOutcome } from '../exam-cell/exam-cell.logic.js';
import { reviseResult } from '../exam-cell/result-runs.js';
import { revaluationThreshold } from '../exam-cell/settings.js';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examPapers, examResultLines, examResults, examSeats, examSessions, feeInvoices, hallTickets, marks, programs, revaluationRequests, rooms, sections, students, subjects, tenants } from '../db/schema.js';
import { chargeRevaluationFee, revaluationFeeState } from '../exam-cell/exam-fees.js';
import { marksCardData, transcriptData, type ResultData, type StudentHeader } from './documents.js';
import { FeeHoldsService } from '../fee-depth/fee-holds.js';
import { DocumentEngine } from '../documents/document-engine.service.js';
import { studentBlock } from '../documents/doc-data.js';
import { ExamsService } from './exams.service.js';
import { ADMIN } from './schemes.controller.js';
import { REVAL_KINDS, revalFee } from '../exam-office/exam-office.logic.js';
import { loadOfficeSettings } from '../exam-office/settings.js';

const MANAGE: RoleName[] = [...ADMIN, 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

export async function studentHeader(tx: Tx, tenantId: string, studentId: string): Promise<StudentHeader> {
  const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  const [s] = await tx
    .select({ name: students.fullName, rollNo: students.rollNo, className: sections.displayName, program: programs.name })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(eq(students.id, studentId));
  if (!s) throw new NotFoundException('Student not found');
  return { institution: t?.name ?? '', ...s };
}

const RevalBody = z.object({ sessionId: z.uuid(), subjectId: z.uuid(), reason: z.string().trim().min(3).max(500), kind: z.enum(REVAL_KINDS).default('revaluation') });
const DecideBody = z.object({ accept: z.boolean(), note: z.string().trim().max(500).optional() });
const CompleteBody = z.object({ marks: z.number().min(0).optional(), note: z.string().trim().max(500).optional() });

/** A student's published results (student, family, staff), grade-card and transcript PDFs, and revaluation. */
@Controller('v1')
export class ResultsController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
    private readonly engine: DocumentEngine,
    private readonly holds: FeeHoldsService,
  ) {}

  /** For the student or family (not staff): fee dues hold the results back when the institution says so. */
  private async feeHold(tx: Tx, p: UserPrincipal, studentId: string): Promise<string | null> {
    if (p.roles.some((r) => STAFF.includes(r))) return null;
    const h = await this.holds.check(tx, p.tenantId, studentId, 'results');
    return h.held && !h.overridden ? h.message : null;
  }

  @Get('results/students/:studentId')
  @Auth('user')
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const held = await withheldSessions(tx, studentId);
      const all = await this.published(tx, studentId);
      const fees = await this.feeHold(tx, p, studentId);
      if (fees) for (const t of all) if (!held.has(t.sessionId)) held.set(t.sessionId, fees);
      // A withheld result shows as withheld, never its figures.
      const terms = all.map((t) => (held.has(t.sessionId) ? { sessionId: t.sessionId, sessionName: t.sessionName, term: t.term, withheld: true, withheldReason: held.get(t.sessionId)!, sgpa: null, cgpa: null, creditsAttempted: null, creditsEarned: null, outcome: 'withheld', lines: [] } : { ...t, withheld: false }));
      const open = all.filter((t) => !held.has(t.sessionId));
      return { cgpa: open.length ? open[open.length - 1].cgpa : null, terms };
    });
  }

  /**
   * What a student sits and when (student, family, staff): every scheduled session for their class
   * with the timetable, seat, hall ticket status and any revaluation requests they have made.
   */
  @Get('results/students/:studentId/exams')
  @Auth('user')
  examsForStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
      if (!st) throw new NotFoundException('Student not found');
      const papers = await tx
        .select({ sessionId: examPapers.sessionId, subjectId: examPapers.subjectId, subject: subjects.name, examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, maxMarks: examPapers.maxMarks, room: rooms.name, seat: examSeats.seatNo })
        .from(examPapers)
        .innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId))
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .leftJoin(examSeats, and(eq(examSeats.paperId, examPapers.id), eq(examSeats.studentId, studentId)))
        .leftJoin(rooms, eq(rooms.id, examSeats.roomId))
        .where(and(eq(examPapers.sectionId, st.sectionId), ne(examSessions.status, 'draft')))
        .orderBy(asc(examPapers.examDate), asc(examPapers.startsAt));
      const sessionIds = [...new Set(papers.map((x) => x.sessionId))];
      if (sessionIds.length === 0) return { sessions: [] };
      const sessions = await tx.select().from(examSessions).where(inArray(examSessions.id, sessionIds)).orderBy(desc(examSessions.startsOn));
      const tickets = await tx.select().from(hallTickets).where(and(eq(hallTickets.studentId, studentId), inArray(hallTickets.sessionId, sessionIds)));
      const revals = await tx
        .select({ id: revaluationRequests.id, sessionId: revaluationRequests.sessionId, subjectId: revaluationRequests.subjectId, subject: subjects.name, status: revaluationRequests.status, previousPercent: revaluationRequests.previousPercent, newPercent: revaluationRequests.newPercent, createdAt: revaluationRequests.createdAt })
        .from(revaluationRequests)
        .innerJoin(subjects, eq(subjects.id, revaluationRequests.subjectId))
        .where(and(eq(revaluationRequests.studentId, studentId), inArray(revaluationRequests.sessionId, sessionIds)))
        .orderBy(desc(revaluationRequests.createdAt));
      return {
        sessions: sessions.map((s) => {
          const t = tickets.find((x) => x.sessionId === s.id);
          return {
            id: s.id,
            name: s.name,
            kind: s.kind,
            startsOn: s.startsOn,
            endsOn: s.endsOn,
            status: s.status,
            hallTicket: t ? { ticketNo: t.ticketNo, blocked: t.blocked, blockedReason: t.blockedReason } : null,
            papers: papers.filter((x) => x.sessionId === s.id).map(({ sessionId: _s, ...x }) => x),
            revaluations: revals.filter((x) => x.sessionId === s.id).map(({ sessionId: _s, ...x }) => x),
          };
        }),
      };
    });
  }

  @Get('results/students/:studentId/marks-card.pdf')
  @Auth('user')
  async marksCard(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('sessionId', ParseUUIDPipe) sessionId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const term = (await this.published(tx, studentId)).find((t) => t.sessionId === sessionId);
      if (!term) throw new NotFoundException('No published result for that session');
      if ((await withheldSessions(tx, studentId)).has(sessionId)) throw new ForbiddenException('This result is withheld. Contact the examination office.');
      const fees = await this.feeHold(tx, p, studentId);
      if (fees) throw new ForbiddenException(fees);
      const block = await studentBlock(tx, studentId);
      const h = await studentHeader(tx, p.tenantId, studentId);
      const out = await this.engine.produce(tx, p, {
        docType: 'marks_card',
        title: 'Statement of Marks',
        subject: { type: 'student', id: studentId, name: h.name },
        source: { type: 'marks_card', id: `${studentId}:${sessionId}` },
        data: { ...block, ...marksCardData(term) },
        keyFields: [{ label: 'Candidate', value: `${h.name} (${h.rollNo})` }, { label: 'Examination', value: `${term.sessionName}, semester ${term.term}` }, { label: 'SGPA', value: term.sgpa.toFixed(2) }, { label: 'CGPA', value: term.cgpa.toFixed(2) }, { label: 'Result', value: term.outcome === 'pass' ? 'Pass' : 'Not passed' }],
      });
      return out.pdf;
    });
    this.send(res, pdf, 'marks-card.pdf');
  }

  @Get('results/students/:studentId/transcript.pdf')
  @Auth('user')
  async transcript(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const fees = await this.feeHold(tx, p, studentId);
      if (fees) throw new ForbiddenException(fees);
      const held = await withheldSessions(tx, studentId);
      const terms = (await this.published(tx, studentId)).filter((t) => !held.has(t.sessionId));
      if (terms.length === 0) throw new NotFoundException('No published results yet');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transcript.generated', subjectType: 'student', subjectId: studentId });
      const h = await studentHeader(tx, p.tenantId, studentId);
      const data = transcriptData(terms);
      const tr = data.transcript as Record<string, unknown>;
      const out = await this.engine.produce(tx, p, {
        docType: 'transcript',
        title: 'Consolidated Marks Memo',
        subject: { type: 'student', id: studentId, name: h.name },
        source: { type: 'transcript', id: studentId },
        data: { ...(await studentBlock(tx, studentId)), ...data },
        keyFields: [{ label: 'Candidate', value: `${h.name} (${h.rollNo})` }, { label: 'Programme', value: h.program }, { label: 'CGPA', value: String(tr.cgpa) }, { label: 'Credits earned', value: String(tr.creditsEarned) }],
      });
      return out.pdf;
    });
    this.send(res, pdf, 'transcript.pdf');
  }

  /** A student or family member asks for a paper to be re-checked; only while results are published and open. */
  @Post('results/students/:studentId/revaluations')
  @Auth('user')
  request(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(RevalBody)) body: z.infer<typeof RevalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, MANAGE);
      const s = await this.exams.session(tx, body.sessionId);
      if (s.status !== 'published') throw new ConflictException(s.status === 'locked' ? 'The revaluation window is closed' : 'Results are not published');
      const cfg = await loadOfficeSettings(tx);
      if (s.publishedAt && Date.now() > new Date(s.publishedAt).getTime() + cfg.revaluation.windowDays * 86_400_000) throw new ConflictException('The revaluation window is closed');
      const [line] = await tx
        .select({ percent: examResultLines.percent })
        .from(examResultLines)
        .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
        .where(and(eq(examResults.sessionId, body.sessionId), eq(examResults.studentId, studentId), eq(examResultLines.subjectId, body.subjectId)));
      if (!line) throw new BadRequestException('The student has no result in that subject');
      const open = await tx.select({ id: revaluationRequests.id }).from(revaluationRequests).where(and(eq(revaluationRequests.sessionId, body.sessionId), eq(revaluationRequests.studentId, studentId), eq(revaluationRequests.subjectId, body.subjectId), inArray(revaluationRequests.status, ['requested', 'accepted'])));
      if (open.length) throw new ConflictException('A revaluation request for this subject is already open');
      const [row] = await tx.insert(revaluationRequests).values({ tenantId: p.tenantId, ...body, feePaise: revalFee(cfg.revaluation, body.kind), studentId, previousPercent: line.percent, requestedBy: p.userId }).returning();
      // The fee goes on the student's fee account; the request is decided once it is paid.
      const [sub] = await tx.select({ code: subjects.code }).from(subjects).where(eq(subjects.id, body.subjectId));
      const KIND_WORD = { revaluation: 'Revaluation', retotalling: 'Retotalling', photocopy: 'Answer script photocopy' } as const;
      const invoiceId = await chargeRevaluationFee(tx, p, { requestId: row.id, studentId, title: `${KIND_WORD[body.kind]} fee: ${sub?.code ?? ''}, ${s.name}`, amountPaise: row.feePaise, now: new Date() });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'revaluation.requested', subjectType: 'revaluation', subjectId: row.id, data: { studentId, subjectId: body.subjectId, kind: body.kind, feePaise: row.feePaise, invoiceId } });
      return { ...row, feeInvoiceId: invoiceId };
    });
  }

  @Post('revaluations/:id/decide')
  @HttpCode(200)
  @Auth('user', ADMIN)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) body: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      if (r.status !== 'requested') throw new ConflictException('Already decided');
      const fee = await revaluationFeeState(tx, r);
      if (body.accept && fee === 'due') throw new ConflictException('The fee for this request is not paid yet');
      const status = body.accept ? 'accepted' : 'rejected';
      // A rejected request whose fee is unpaid has nothing to pay for any more.
      if (!body.accept && fee === 'due' && r.feeInvoiceId) await tx.update(feeInvoices).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(feeInvoices.id, r.feeInvoiceId), eq(feeInvoices.paidPaise, 0)));
      await tx.update(revaluationRequests).set({ status, decisionNote: body.note ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(revaluationRequests.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `revaluation.${status}`, subjectType: 'revaluation', subjectId: id });
      return { status };
    });
  }

  /**
   * Records the outcome of a request. A photocopy is completed when the copy is handed over. For a revaluation the
   * re-checked marks replace the original only when they differ by the change rule's share of the maximum (the exam
   * cell's setting, else the affiliation profile's); a retotalling corrects any difference. A change re-grades the
   * student, keeps a versioned revision and recalculates the CGPA of later terms.
   */
  @Post('revaluations/:id/complete')
  @HttpCode(200)
  @Auth('user', ADMIN)
  complete(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CompleteBody)) body: z.infer<typeof CompleteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      if (r.status !== 'accepted') throw new ConflictException('Accept the request first');
      const s = await this.exams.session(tx, r.sessionId);
      if (s.status !== 'published') throw new ConflictException('The results are locked');
      if (r.kind === 'photocopy') {
        await tx.update(revaluationRequests).set({ status: 'completed', decisionNote: body.note ?? 'Copy of the answer script given', decidedBy: p.userId, decidedAt: new Date() }).where(eq(revaluationRequests.id, id));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'revaluation.completed', subjectType: 'revaluation', subjectId: id, data: { kind: 'photocopy' } });
        return { previousPercent: r.previousPercent, newPercent: r.previousPercent, changed: false };
      }
      if (body.marks === undefined) throw new BadRequestException('Enter the re-checked marks');
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, r.studentId));
      const papers = await tx.select().from(examPapers).where(and(eq(examPapers.sessionId, r.sessionId), eq(examPapers.subjectId, r.subjectId)));
      const paper = papers.find((x) => x.sectionId === st.sectionId) ?? papers[0];
      if (!paper?.assessmentId) throw new NotFoundException('No paper for that subject');
      if (body.marks > paper.maxMarks) throw new BadRequestException(`Marks cannot be more than ${paper.maxMarks}`);
      const [old] = await tx.select().from(marks).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
      const original = old?.moderatedMarks ?? old?.marks ?? 0;
      const threshold = r.kind === 'retotalling' ? null : await revaluationThreshold(tx, s.programId);
      const outcome = revaluationOutcome(original, body.marks, paper.maxMarks, threshold);
      let newPercent = r.previousPercent;
      let sgpaNow: number | null = null;
      let cgpaNow: number | null = null;
      if (outcome.changed) {
        await tx.update(marks).set({ marks: body.marks, moderatedMarks: null, absent: false, remark: r.kind === 'retotalling' ? 'Retotalling' : 'Revaluation', updatedAt: new Date() }).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
        const rev = await reviseResult(tx, this.exams, p.tenantId, p.userId, s, r.studentId, 'revaluation', `${r.kind === 'retotalling' ? 'Retotalling' : 'Revaluation'}: ${original} to ${body.marks}`);
        newPercent = rev.result?.lines.find((l) => l.subjectId === r.subjectId)?.result.percent ?? null;
        sgpaNow = rev.result?.sgpa ?? null;
        cgpaNow = rev.result?.cgpa ?? null;
      }
      const note = outcome.changed ? (body.note ?? null) : (body.note ?? `No change: the difference of ${outcome.difference} marks is below the change rule`);
      await tx.update(revaluationRequests).set({ status: 'completed', newPercent, decisionNote: note, decidedBy: p.userId, decidedAt: new Date() }).where(eq(revaluationRequests.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'revaluation.completed', subjectType: 'revaluation', subjectId: id, data: { from: original, revalued: body.marks, changed: outcome.changed, threshold } });
      return { previousPercent: r.previousPercent, newPercent, changed: outcome.changed, difference: outcome.difference, sgpa: sgpaNow, cgpa: cgpaNow };
    });
  }

  private async load(tx: Tx, id: string) {
    const [r] = await tx.select().from(revaluationRequests).where(eq(revaluationRequests.id, id));
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  private send(res: Response, pdf: Buffer, name: string) {
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="${name}"`);
    res.end(pdf);
  }

  /** The student's results from published (or locked) sessions, oldest first. */
  private async published(tx: Tx, studentId: string): Promise<(ResultData & { sessionId: string })[]> {
    const rs = await tx
      .select({ id: examResults.id, sessionId: examSessions.id, sessionName: examSessions.name, term: examSessions.term, sgpa: examResults.sgpa, cgpa: examResults.cgpa, creditsAttempted: examResults.creditsAttempted, creditsEarned: examResults.creditsEarned, outcome: examResults.outcome })
      .from(examResults)
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .where(and(eq(examResults.studentId, studentId), inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn));
    if (rs.length === 0) return [];
    const lines = await tx
      .select({ resultId: examResultLines.resultId, code: subjects.code, subject: subjects.name, credits: examResultLines.credits, percent: examResultLines.percent, grade: examResultLines.grade, gradePoint: examResultLines.gradePoint, passed: examResultLines.passed })
      .from(examResultLines)
      .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
      .where(inArray(examResultLines.resultId, rs.map((r) => r.id)))
      .orderBy(desc(subjects.code));
    return rs.map(({ id, ...r }) => ({ ...r, lines: lines.filter((l) => l.resultId === id).sort((a, b) => a.code.localeCompare(b.code)).map(({ resultId: _r, ...l }) => l) }));
  }
}
