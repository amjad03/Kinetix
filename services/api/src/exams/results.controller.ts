import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examPapers, examResultLines, examResults, examSeats, examSessions, hallTickets, marks, programs, revaluationRequests, rooms, sections, students, subjects, tenants } from '../db/schema.js';
import { marksCardPdf, transcriptPdf, type ResultData, type StudentHeader } from './documents.js';
import { ExamsService } from './exams.service.js';
import { ADMIN } from './schemes.controller.js';

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

const RevalBody = z.object({ sessionId: z.uuid(), subjectId: z.uuid(), reason: z.string().trim().min(3).max(500) });
const DecideBody = z.object({ accept: z.boolean(), note: z.string().trim().max(500).optional() });
const CompleteBody = z.object({ marks: z.number().min(0) });

/** A student's published results (student, family, staff), grade-card and transcript PDFs, and revaluation. */
@Controller('v1')
export class ResultsController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  @Get('results/students/:studentId')
  @Auth('user')
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const terms = await this.published(tx, studentId);
      return { cgpa: terms.length ? terms[terms.length - 1].cgpa : null, terms };
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
      return marksCardPdf(await studentHeader(tx, p.tenantId, studentId), term);
    });
    this.send(res, pdf, 'marks-card.pdf');
  }

  @Get('results/students/:studentId/transcript.pdf')
  @Auth('user')
  async transcript(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, STAFF);
      const terms = await this.published(tx, studentId);
      if (terms.length === 0) throw new NotFoundException('No published results yet');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transcript.generated', subjectType: 'student', subjectId: studentId });
      return transcriptPdf(await studentHeader(tx, p.tenantId, studentId), terms);
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
      const [line] = await tx
        .select({ percent: examResultLines.percent })
        .from(examResultLines)
        .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
        .where(and(eq(examResults.sessionId, body.sessionId), eq(examResults.studentId, studentId), eq(examResultLines.subjectId, body.subjectId)));
      if (!line) throw new BadRequestException('The student has no result in that subject');
      const open = await tx.select({ id: revaluationRequests.id }).from(revaluationRequests).where(and(eq(revaluationRequests.sessionId, body.sessionId), eq(revaluationRequests.studentId, studentId), eq(revaluationRequests.subjectId, body.subjectId), inArray(revaluationRequests.status, ['requested', 'accepted'])));
      if (open.length) throw new ConflictException('A revaluation request for this subject is already open');
      const [row] = await tx.insert(revaluationRequests).values({ tenantId: p.tenantId, ...body, studentId, previousPercent: line.percent, requestedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'revaluation.requested', subjectType: 'revaluation', subjectId: row.id, data: { studentId, subjectId: body.subjectId } });
      return row;
    });
  }

  @Post('revaluations/:id/decide')
  @HttpCode(200)
  @Auth('user', ADMIN)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) body: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      if (r.status !== 'requested') throw new ConflictException('Already decided');
      const status = body.accept ? 'accepted' : 'rejected';
      await tx.update(revaluationRequests).set({ status, decisionNote: body.note ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(revaluationRequests.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `revaluation.${status}`, subjectType: 'revaluation', subjectId: id });
      return { status };
    });
  }

  /** Records the re-checked marks of the external paper and re-grades the student. */
  @Post('revaluations/:id/complete')
  @HttpCode(200)
  @Auth('user', ADMIN)
  complete(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CompleteBody)) body: z.infer<typeof CompleteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      if (r.status !== 'accepted') throw new ConflictException('Accept the request first');
      const s = await this.exams.session(tx, r.sessionId);
      if (s.status !== 'published') throw new ConflictException('The results are locked');
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, r.studentId));
      const [paper] = await tx.select().from(examPapers).where(and(eq(examPapers.sessionId, r.sessionId), eq(examPapers.subjectId, r.subjectId), eq(examPapers.sectionId, st.sectionId)));
      if (!paper?.assessmentId) throw new NotFoundException('No paper for that subject');
      if (body.marks > paper.maxMarks) throw new BadRequestException(`Marks cannot be more than ${paper.maxMarks}`);
      const [old] = await tx.select().from(marks).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
      await tx.update(marks).set({ marks: body.marks, moderatedMarks: null, absent: false, remark: 'Revaluation', updatedAt: new Date() }).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, r.studentId)));
      const [res] = await this.exams.compute(tx, s, r.studentId);
      await this.exams.store(tx, p.tenantId, s, [res]);
      const line = res.lines.find((l) => l.subjectId === r.subjectId);
      await tx.update(revaluationRequests).set({ status: 'completed', newPercent: line?.result.percent ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(revaluationRequests.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'revaluation.completed', subjectType: 'revaluation', subjectId: id, data: { from: old?.moderatedMarks ?? old?.marks ?? null, to: body.marks, sgpa: res.sgpa } });
      return { previousPercent: r.previousPercent, newPercent: line?.result.percent ?? null, sgpa: res.sgpa, cgpa: res.cgpa };
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
