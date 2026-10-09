import { feedCalendar } from '../scheduling/calendar-feed.js';
import { ENV, type Env } from '../config/env.js';
import { hallTicketCode } from './hall-ticket-code.js';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { toCsv } from '../common/pdf.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, examPapers, examResultLines, examResults, examSeats, examSessions, hallTickets, programs, revaluationRequests, rooms, schemeComponents, sections, students, subjects, assessmentSchemes, tenants, examRegistrationWindows, examRegistrations, users } from '../db/schema.js';
import type { Readable } from 'node:stream';
import { ObjectStorage } from '../storage/storage.service.js';
import { WorkflowsService } from '../workflows/workflows.service.js';
import { workflowDefinitions, workflowRequests } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { parseDate } from '../teacher/teacher.service.js';
import { attendanceSettings, overallAttendance } from '../attendance-governance/eligibility.js';
import { hallTicketPdf } from './documents.js';
import { ExamsService, type SessionRow } from './exams.service.js';
import { allocateSeats, overlaps, slotGroups } from './seating.js';
import { studentHeader } from './results.controller.js';
import { ADMIN } from './schemes.controller.js';

const MANAGE: RoleName[] = [...ADMIN, 'hod'];
const STAFF: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const SessionBody = z.object({
  academicYearId: z.uuid(),
  programId: z.uuid(),
  term: z.number().int().min(1).max(20),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(['regular', 'supplementary']).default('regular'),
  startsOn: z.string(),
  endsOn: z.string(),
});
const PaperBody = z.object({
  subjectId: z.uuid(),
  sectionId: z.uuid(),
  examDate: z.string(),
  startsAt: z.string().regex(TIME),
  endsAt: z.string().regex(TIME),
  maxMarks: z.number().positive().max(1000),
});
const SeatingBody = z.object({ halls: z.array(z.object({ roomId: z.uuid(), capacity: z.number().int().min(1).max(2000) })).min(1).max(40) });
const TicketsBody = z.object({ blocks: z.array(z.object({ studentId: z.uuid(), reason: z.string().trim().min(1).max(200) })).max(500).default([]), /** Also withhold tickets from students under the attendance threshold (after condonation). */ blockByAttendance: z.boolean().default(false) });

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Results are published through the approval workflow when the institution has an active "result_publish" route. */
async function approvalGate(tx: Tx, sessionId: string): Promise<{ required: boolean; approved: boolean }> {
  const [def] = await tx.select({ id: workflowDefinitions.id }).from(workflowDefinitions).where(and(eq(workflowDefinitions.requestType, 'result_publish'), eq(workflowDefinitions.active, true)));
  if (!def) return { required: false, approved: true };
  const [ok] = await tx.select({ id: workflowRequests.id }).from(workflowRequests).where(and(eq(workflowRequests.sourceModule, 'exam_session'), eq(workflowRequests.sourceId, sessionId), eq(workflowRequests.status, 'approved')));
  return { required: true, approved: !!ok };
}

/** Exam sessions: papers, seating, hall tickets, result processing, publish and lock. */
@Controller('v1/exam-sessions')
export class ExamSessionsController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: ObjectStorage,
    private readonly workflows: WorkflowsService,
  ) {}

  @Post()
  @Auth('user', ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SessionBody)) body: z.infer<typeof SessionBody>) {
    const startsOn = parseDate(body.startsOn, 'startsOn');
    const endsOn = parseDate(body.endsOn, 'endsOn');
    if (endsOn < startsOn) throw new BadRequestException('The session cannot end before it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [prog] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, body.programId));
      if (!prog) throw new NotFoundException('Programme not found');
      const [s] = await tx.insert(examSessions).values({ tenantId: p.tenantId, ...body, startsOn, endsOn, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.session.created', subjectType: 'exam_session', subjectId: s.id, data: { name: s.name } });
      return s;
    });
  }

  @Get()
  @Auth('user', MANAGE)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('programId') programId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(examSessions).where(programId ? eq(examSessions.programId, programId) : sql`true`).orderBy(sql`${examSessions.startsOn} desc`),
    );
  }

  @Get(':id')
  @Auth('user', MANAGE)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      const papers = await tx
        .select({ id: examPapers.id, subjectId: examPapers.subjectId, subject: subjects.name, sectionId: examPapers.sectionId, section: sections.displayName, examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, maxMarks: examPapers.maxMarks, assessmentId: examPapers.assessmentId })
        .from(examPapers)
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .innerJoin(sections, eq(sections.id, examPapers.sectionId))
        .where(eq(examPapers.sessionId, id))
        .orderBy(asc(examPapers.examDate), asc(examPapers.startsAt));
      const results = await tx.select({ outcome: examResults.outcome, sgpa: examResults.sgpa }).from(examResults).where(eq(examResults.sessionId, id));
      const pass = results.filter((r) => r.outcome === 'pass').length;
      return {
        ...s,
        papers,
        stats: { students: results.length, passed: pass, passPercent: results.length ? Math.round((pass / results.length) * 1000) / 10 : null, averageSgpa: results.length ? Math.round((results.reduce((a, r) => a + r.sgpa, 0) / results.length) * 100) / 100 : null },
      };
    });
  }

  @Post(':id/papers')
  @Auth('user', ADMIN)
  addPaper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PaperBody)) body: z.infer<typeof PaperBody>) {
    const examDate = parseDate(body.examDate, 'examDate');
    if (body.endsAt <= body.startsAt) throw new BadRequestException('A paper must end after it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      this.assertOpen(s);
      if (examDate < s.startsOn || examDate > s.endsOn) throw new BadRequestException('The paper is outside the session dates');
      const [section] = await tx.select().from(sections).where(eq(sections.id, body.sectionId));
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, body.subjectId));
      if (!section || section.programId !== s.programId || section.term !== s.term) throw new BadRequestException('That class is not part of this session');
      if (!subject || subject.programId !== s.programId || subject.term !== s.term) throw new BadRequestException('That subject is not taught in this term');
      const mine = await tx.select().from(examPapers).where(eq(examPapers.sessionId, id));
      if (mine.some((m) => m.subjectId === body.subjectId && m.sectionId === body.sectionId)) throw new ConflictException('That paper is already scheduled');
      if (mine.some((m) => m.sectionId === body.sectionId && overlaps(m, { examDate, startsAt: body.startsAt, endsAt: body.endsAt }))) throw new ConflictException('This class already has a paper at that time');
      const [ext] = await tx
        .select({ id: schemeComponents.id })
        .from(schemeComponents)
        .innerJoin(assessmentSchemes, eq(assessmentSchemes.id, schemeComponents.schemeId))
        .where(and(eq(assessmentSchemes.subjectId, subject.id), eq(assessmentSchemes.academicYearId, s.academicYearId), eq(schemeComponents.kind, 'external')))
        .limit(1);
      const [a] = await tx
        .insert(assessments)
        .values({ tenantId: p.tenantId, sectionId: section.id, subjectId: subject.id, title: `${s.name} - ${subject.name}`, kind: 'exam', maxMarks: body.maxMarks, heldOn: examDate, createdBy: p.userId, componentId: ext?.id ?? null })
        .returning({ id: assessments.id });
      const [paper] = await tx.insert(examPapers).values({ tenantId: p.tenantId, sessionId: id, subjectId: subject.id, sectionId: section.id, examDate, startsAt: body.startsAt, endsAt: body.endsAt, maxMarks: body.maxMarks, assessmentId: a.id }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.paper.added', subjectType: 'exam_session', subjectId: id, data: { paperId: paper.id, subject: subject.name, examDate } });
      return paper;
    });
  }

  @Delete(':id/papers/:paperId')
  @HttpCode(200)
  @Auth('user', ADMIN)
  removePaper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      this.assertOpen(await this.exams.session(tx, id));
      const [paper] = await tx.select().from(examPapers).where(and(eq(examPapers.id, paperId), eq(examPapers.sessionId, id)));
      if (!paper) throw new NotFoundException('Paper not found');
      await tx.delete(examPapers).where(eq(examPapers.id, paperId));
      if (paper.assessmentId) await tx.delete(assessments).where(and(eq(assessments.id, paper.assessmentId), eq(assessments.markStatus, 'draft')));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.paper.removed', subjectType: 'exam_session', subjectId: id, data: { paperId } });
      return { removed: true };
    });
  }

  /** Publishes the timetable: from now on hall tickets and seating can be made. */
  @Post(':id/schedule')
  @HttpCode(200)
  @Auth('user', ADMIN)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status !== 'draft') throw new ConflictException('The session is already scheduled');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(examPapers).where(eq(examPapers.sessionId, id));
      if (n === 0) throw new BadRequestException('Add at least one paper first');
      await tx.update(examSessions).set({ status: 'scheduled' }).where(eq(examSessions.id, id));
      await feedCalendar(tx, p.tenantId, p.userId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.session.scheduled', subjectType: 'exam_session', subjectId: id, data: { papers: n } });
      return { status: 'scheduled' };
    });
  }

  /** Seats everyone: papers at the same time share the halls, neighbours write different papers. */
  @Post(':id/seating')
  @HttpCode(200)
  @Auth('user', ADMIN)
  seating(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SeatingBody)) body: z.infer<typeof SeatingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      this.assertOpen(s);
      const papers = await tx.select().from(examPapers).where(eq(examPapers.sessionId, id));
      if (papers.length === 0) throw new BadRequestException('Add papers first');
      const roomRows = await tx.select({ id: rooms.id, name: rooms.name }).from(rooms).where(inArray(rooms.id, body.halls.map((h) => h.roomId)));
      if (roomRows.length !== new Set(body.halls.map((h) => h.roomId)).size) throw new BadRequestException('Unknown hall');
      const halls = body.halls.map((h) => ({ ...h, name: roomRows.find((r) => r.id === h.roomId)!.name }));
      await tx.delete(examSeats).where(inArray(examSeats.paperId, papers.map((x) => x.id)));
      let seated = 0;
      for (const group of slotGroups(papers)) {
        const cands: { paperId: string; studentId: string; rollNo: string }[] = [];
        for (const paperId of group) {
          const paper = papers.find((x) => x.id === paperId)!;
          const roster = await tx.select({ id: students.id, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, paper.sectionId), eq(students.status, 'active')));
          cands.push(...roster.map((r) => ({ paperId, studentId: r.id, rollNo: r.rollNo })));
        }
        let seats;
        try {
          seats = allocateSeats(cands, halls);
        } catch (e) {
          throw new BadRequestException((e as Error).message);
        }
        if (seats.length) await tx.insert(examSeats).values(seats.map((x) => ({ tenantId: p.tenantId, ...x })));
        seated += seats.length;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.seating.generated', subjectType: 'exam_session', subjectId: id, data: { seated, halls: halls.length } });
      return { seated };
    });
  }

  @Get(':id/seating')
  @Auth('user', MANAGE)
  seatingPlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ paperId: examSeats.paperId, subject: subjects.name, examDate: examPapers.examDate, startsAt: examPapers.startsAt, room: rooms.name, seatNo: examSeats.seatNo, studentId: students.id, student: students.fullName, rollNo: students.rollNo })
        .from(examSeats)
        .innerJoin(examPapers, eq(examPapers.id, examSeats.paperId))
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .innerJoin(rooms, eq(rooms.id, examSeats.roomId))
        .innerJoin(students, eq(students.id, examSeats.studentId))
        .where(eq(examPapers.sessionId, id))
        .orderBy(asc(examPapers.examDate), asc(examPapers.startsAt), asc(rooms.name), asc(examSeats.seatNo)),
    );
  }

  /** Issues a hall ticket to every candidate; blocked ones (detained, dues) get none. */
  @Post(':id/hall-tickets')
  @HttpCode(200)
  @Auth('user', ADMIN)
  issueTickets(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TicketsBody)) body: z.infer<typeof TicketsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status === 'draft') throw new ConflictException('Schedule the session before issuing hall tickets');
      const papers = await tx.select({ sectionId: examPapers.sectionId }).from(examPapers).where(eq(examPapers.sessionId, id));
      const roster = await tx.select({ id: students.id, rollNo: students.rollNo }).from(students).where(and(inArray(students.sectionId, [...new Set(papers.map((x) => x.sectionId))]), eq(students.status, 'active')));
      const blocks = new Map(body.blocks.map((b) => [b.studentId, b.reason]));
      if (body.blockByAttendance) {
        const cfg = await attendanceSettings(tx);
        const att = await overallAttendance(tx, roster.map((r) => r.id), cfg.thresholdPct);
        for (const r of roster) {
          const a = att.get(r.id);
          if (a && !a.eligible && !blocks.has(r.id)) blocks.set(r.id, `Attendance ${a.effectivePct}% is below ${cfg.thresholdPct}%`);
        }
      }
      // With a registration window, only registered students (eligible, or overridden by the controller) get a ticket.
      const [win] = await tx.select({ id: examRegistrationWindows.id }).from(examRegistrationWindows).where(eq(examRegistrationWindows.sessionId, id));
      if (win) {
        const regs = new Map((await tx.select({ studentId: examRegistrations.studentId, status: examRegistrations.status, reasons: examRegistrations.reasons }).from(examRegistrations).where(eq(examRegistrations.sessionId, id))).map((x) => [x.studentId, x]));
        for (const r of roster) {
          const reg = regs.get(r.id);
          if (!blocks.has(r.id) && reg?.status !== 'registered') blocks.set(r.id, reg ? `Not eligible: ${reg.reasons.join('; ')}` : 'Not registered for this examination');
        }
      }
      for (const r of roster) {
        const v = { blocked: blocks.has(r.id), blockedReason: blocks.get(r.id) ?? null };
        await tx.insert(hallTickets).values({ tenantId: p.tenantId, sessionId: id, studentId: r.id, ticketNo: `HT-${id.slice(0, 6).toUpperCase()}-${r.rollNo}`, ...v }).onConflictDoUpdate({ target: [hallTickets.sessionId, hallTickets.studentId], set: v });
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.halltickets.issued', subjectType: 'exam_session', subjectId: id, data: { issued: roster.length - blocks.size, blocked: blocks.size } });
      return { issued: roster.length - blocks.size, blocked: blocks.size };
    });
  }

  @Get(':id/hall-tickets')
  @Auth('user', MANAGE)
  tickets(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ studentId: hallTickets.studentId, student: students.fullName, rollNo: students.rollNo, ticketNo: hallTickets.ticketNo, blocked: hallTickets.blocked, blockedReason: hallTickets.blockedReason }).from(hallTickets).innerJoin(students, eq(students.id, hallTickets.studentId)).where(eq(hallTickets.sessionId, id)).orderBy(asc(students.rollNo)),
    );
  }

  /** A student's hall ticket (the student, their family, or staff). */
  @Get(':id/hall-tickets/:studentId/pdf')
  @Auth('user')
  async ticketPdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, MANAGE);
      const s = await this.exams.session(tx, id);
      const [t] = await tx.select().from(hallTickets).where(and(eq(hallTickets.sessionId, id), eq(hallTickets.studentId, studentId)));
      if (!t) throw new NotFoundException('No hall ticket issued');
      if (t.blocked) throw new ForbiddenException(`Hall ticket withheld: ${t.blockedReason ?? 'contact the examination office'}`);
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
      const papers = await tx
        .select({ examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, subject: subjects.name, room: rooms.name, seat: examSeats.seatNo })
        .from(examPapers)
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .leftJoin(examSeats, and(eq(examSeats.paperId, examPapers.id), eq(examSeats.studentId, studentId)))
        .leftJoin(rooms, eq(rooms.id, examSeats.roomId))
        .where(and(eq(examPapers.sessionId, id), eq(examPapers.sectionId, st.sectionId)))
        .orderBy(asc(examPapers.examDate), asc(examPapers.startsAt));
      const [tenant] = await tx.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, p.tenantId));
      const verifyUrl = `${this.env.VERIFY_BASE_URL.replace(/\/$/, '')}/hallticket/${tenant.slug}/${encodeURIComponent(hallTicketCode(this.env.JWT_SECRET, p.tenantId, t.ticketNo))}`;
      const [ph] = await tx.select({ key: users.photoKey }).from(students).innerJoin(users, eq(users.id, students.userId)).where(eq(students.id, studentId));
      const photo = ph?.key ? await readAll((await this.storage.get(ph.key)).stream).catch(() => null) : null;
      return hallTicketPdf({ ...(await studentHeader(tx, p.tenantId, studentId)), sessionName: s.name, ticketNo: t.ticketNo, verifyUrl, photo, papers: papers.map((x) => ({ date: x.examDate, time: `${x.startsAt}-${x.endsAt}`, subject: x.subject, room: x.room, seat: x.seat })) });
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="hall-ticket.pdf"');
    res.end(pdf);
  }

  /** Grades every candidate from the verified marks; can be repeated until the results are published. */
  @Post(':id/process')
  @HttpCode(200)
  @Auth('user', ADMIN)
  process(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status === 'draft') throw new ConflictException('Schedule the session first');
      if (s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are already published; use revaluation to correct a result');
      const problems = await this.exams.blockers(tx, s);
      if (problems.length) throw new ConflictException({ message: 'The session cannot be processed yet', problems });
      const results = await this.exams.compute(tx, s);
      await this.exams.store(tx, p.tenantId, s, results);
      await tx.update(examSessions).set({ status: 'processed', processedAt: new Date() }).where(eq(examSessions.id, id));
      const passed = results.filter((r) => r.outcome === 'pass').length;
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.results.processed', subjectType: 'exam_session', subjectId: id, data: { students: results.length, passed } });
      return { students: results.length, passed, failed: results.length - passed };
    });
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Auth('user', ADMIN)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status !== 'processed') throw new ConflictException(s.status === 'published' || s.status === 'locked' ? 'Results are already published' : 'Process the results first');
      const gate = await approvalGate(tx, id);
      if (!gate.approved) throw new ConflictException('Results need approval before they are published. Send them for approval first.');
      const now = new Date();
      await tx.update(examSessions).set({ status: 'published', publishedAt: now }).where(eq(examSessions.id, id));
      await feedCalendar(tx, p.tenantId, p.userId);
      const papers = await tx.select().from(examPapers).where(eq(examPapers.sessionId, id));
      const aIds = papers.map((x) => x.assessmentId).filter((x): x is string => !!x);
      if (aIds.length) await tx.update(assessments).set({ publishedAt: now }).where(and(inArray(assessments.id, aIds), sql`${assessments.publishedAt} is null`));
      for (const sectionId of new Set(papers.map((x) => x.sectionId))) await this.notifications.marksPublished(tx, { id: `${id}:${sectionId}`, sectionId, title: 'Results', subjectName: s.name });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.results.published', subjectType: 'exam_session', subjectId: id });
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.ResultsPublished, aggregateType: 'exam_session', aggregateId: id, actorId: p.userId, payload: { name: s.name, papers: papers.length } });
      return { status: 'published' };
    });
  }

  /** Where the publish approval stands: whether the institution requires it, and the latest request. */
  @Get(':id/publish-approval')
  @Auth('user', ADMIN)
  approvalState(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gate = await approvalGate(tx, id);
      const [req] = await tx.select({ id: workflowRequests.id, status: workflowRequests.status, createdAt: workflowRequests.createdAt }).from(workflowRequests).where(and(eq(workflowRequests.sourceModule, 'exam_session'), eq(workflowRequests.sourceId, id))).orderBy(desc(workflowRequests.createdAt)).limit(1);
      return { ...gate, request: req ?? null };
    });
  }

  /** Sends the processed results through the "result_publish" approval route; publishing opens once it is approved. */
  @Post(':id/request-publish')
  @HttpCode(200)
  @Auth('user', ADMIN)
  requestPublish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status !== 'processed') throw new ConflictException('Process the results first');
      const gate = await approvalGate(tx, id);
      if (!gate.required) throw new ConflictException('No approval route is set up for results; publish directly');
      if (gate.approved) throw new ConflictException('The results are already approved');
      const [open] = await tx.select({ id: workflowRequests.id }).from(workflowRequests).where(and(eq(workflowRequests.sourceModule, 'exam_session'), eq(workflowRequests.sourceId, id), eq(workflowRequests.status, 'pending')));
      if (open) throw new ConflictException('An approval request is already open for these results');
      const req = await this.workflows.start(tx, { tenantId: p.tenantId, requesterId: p.userId, requestType: 'result_publish', title: `Publish results: ${s.name}`, payload: { session: s.name }, sourceModule: 'exam_session', sourceId: id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.results.approval_requested', subjectType: 'exam_session', subjectId: id });
      return { requestId: req.id, status: req.status };
    });
  }

  /** After the revaluation window: no more changes to marks or results. */
  @Post(':id/lock')
  @HttpCode(200)
  @Auth('user', ADMIN)
  lock(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status !== 'published') throw new ConflictException('Only published results can be locked');
      await tx.update(examSessions).set({ status: 'locked', lockedAt: new Date() }).where(eq(examSessions.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.results.locked', subjectType: 'exam_session', subjectId: id });
      return { status: 'locked' };
    });
  }

  @Get(':id/results')
  @Auth('user', MANAGE)
  results(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.resultRows(tx, id, sectionId));
  }

  @Get(':id/results.csv')
  @Auth('user', MANAGE)
  async resultsCsv(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const rows = await this.db.withTenant(p.tenantId, (tx) => this.resultRows(tx, id));
    const codes = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.code)))].sort();
    const csv = toCsv([
      ['Roll no', 'Name', 'Class', ...codes.flatMap((c) => [`${c} %`, `${c} grade`]), 'Credits earned', 'SGPA', 'CGPA', 'Result'],
      ...rows.map((r) => [r.rollNo, r.fullName, r.section, ...codes.flatMap((c) => { const l = r.lines.find((x) => x.code === c); return [l?.percent ?? '', l?.grade ?? '']; }), r.creditsEarned, r.sgpa, r.cgpa, r.outcome]),
    ]);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="results.csv"');
    res.end(csv);
  }

  private async resultRows(tx: Tx, sessionId: string, sectionId?: string) {
    const rows = await tx
      .select({ id: examResults.id, studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, section: sections.displayName, sectionId: sections.id, sgpa: examResults.sgpa, cgpa: examResults.cgpa, creditsEarned: examResults.creditsEarned, creditsAttempted: examResults.creditsAttempted, outcome: examResults.outcome })
      .from(examResults)
      .innerJoin(students, eq(students.id, examResults.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(and(eq(examResults.sessionId, sessionId), sectionId ? eq(students.sectionId, sectionId) : sql`true`))
      .orderBy(asc(students.rollNo));
    const lines = rows.length
      ? await tx.select({ resultId: examResultLines.resultId, code: subjects.code, subject: subjects.name, credits: examResultLines.credits, percent: examResultLines.percent, grade: examResultLines.grade, gradePoint: examResultLines.gradePoint, passed: examResultLines.passed }).from(examResultLines).innerJoin(subjects, eq(subjects.id, examResultLines.subjectId)).where(inArray(examResultLines.resultId, rows.map((r) => r.id)))
      : [];
    return rows.map((r) => ({ ...r, lines: lines.filter((l) => l.resultId === r.id) }));
  }

  @Get(':id/revaluations')
  @Auth('user', MANAGE)
  revaluations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: revaluationRequests.id, status: revaluationRequests.status, reason: revaluationRequests.reason, previousPercent: revaluationRequests.previousPercent, newPercent: revaluationRequests.newPercent, decisionNote: revaluationRequests.decisionNote, student: students.fullName, rollNo: students.rollNo, subject: subjects.name, subjectId: subjects.id, studentId: students.id, createdAt: revaluationRequests.createdAt })
        .from(revaluationRequests)
        .innerJoin(students, eq(students.id, revaluationRequests.studentId))
        .innerJoin(subjects, eq(subjects.id, revaluationRequests.subjectId))
        .where(eq(revaluationRequests.sessionId, id))
        .orderBy(asc(revaluationRequests.createdAt)),
    );
  }

  private assertOpen(s: SessionRow) {
    if (s.status === 'processed' || s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are processed; the timetable can no longer change');
  }
}
