import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Put, Post, Res } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, attendanceRecords, examPapers, examRegistrationWindows, examRegistrations, examRoomLayouts, examSeats, examSessions, feeInvoices, rooms, sections, students, subjects, tenants } from '../db/schema.js';
import { parseDate } from '../teacher/teacher.service.js';
import { antiCollusionSeats, roomCapacity, type RoomLayout, type SeatCandidate } from './anti-collusion.js';
import { seatingChartPdf } from './documents.js';
import { ExamsService } from './exams.service.js';
import { ineligibleReasons, windowState, type EligibilityFacts, type EligibilityRules } from './registration-rules.js';
import { slotGroups } from './seating.js';
import { ADMIN } from './schemes.controller.js';

const MANAGE: RoleName[] = [...ADMIN, 'hod'];

const WindowBody = z
  .object({
    opensOn: z.string(),
    closesOn: z.string(),
    minAttendancePercent: z.number().min(0).max(100).nullable().default(null),
    blockOnFeeDues: z.boolean().default(true),
    maxBacklogs: z.number().int().min(0).max(50).nullable().default(null),
  });
const RegisterBody = z.object({ studentId: z.uuid() });
const OverrideBody = z.object({ reason: z.string().trim().min(5).max(300) });
const PlanBody = z.object({
  rooms: z
    .array(z.object({ roomId: z.uuid(), rows: z.number().int().min(1).max(40), benchesPerRow: z.number().int().min(1).max(20), seatsPerBench: z.number().int().min(1).max(4).default(2) }))
    .min(1)
    .max(40),
});

/** Registration for an examination session (window, eligibility, controller override) and the anti-collusion seating plan. */
@Controller('v1/exam-sessions/:id')
export class ExamRegistrationController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
    private readonly clock: Clock,
  ) {}

  // ---- registration window ------------------------------------------------------------------

  @Put('registration-window')
  @Auth('user', ADMIN)
  setWindow(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(WindowBody)) b: z.infer<typeof WindowBody>) {
    const opensOn = parseDate(b.opensOn, 'opensOn');
    const closesOn = parseDate(b.closesOn, 'closesOn');
    if (closesOn < opensOn) throw new BadRequestException('The window cannot close before it opens');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status === 'processed' || s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are processed; registration can no longer change');
      const v = { opensOn, closesOn, minAttendancePercent: b.minAttendancePercent, blockOnFeeDues: b.blockOnFeeDues, maxBacklogs: b.maxBacklogs };
      const [row] = await tx.insert(examRegistrationWindows).values({ tenantId: p.tenantId, sessionId: id, createdBy: p.userId, ...v }).onConflictDoUpdate({ target: examRegistrationWindows.sessionId, set: v }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.registration.window_set', subjectType: 'exam_session', subjectId: id, data: v });
      return row;
    });
  }

  @Get('registration-window')
  @Auth('user')
  window(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.exams.session(tx, id);
      const [w] = await tx.select().from(examRegistrationWindows).where(eq(examRegistrationWindows.sessionId, id));
      if (!w) return null;
      return { ...w, state: windowState(w, await this.today(tx)) };
    });
  }

  /** What a student's registration would look like now, without registering them. */
  @Get('eligibility/:studentId')
  @Auth('user')
  eligibility(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, MANAGE);
      const w = await this.windowOf(tx, id);
      const facts = await this.facts(tx, id, studentId);
      return { facts, reasons: ineligibleReasons(this.rules(w), facts), eligible: ineligibleReasons(this.rules(w), facts).length === 0 };
    });
  }

  /** Registers a student while the window is open. A student who fails a rule is recorded as ineligible, with the reasons, until the controller overrides. */
  @Post('register')
  @HttpCode(200)
  @Auth('user')
  register(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RegisterBody)) b: z.infer<typeof RegisterBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, MANAGE);
      const w = await this.windowOf(tx, id);
      const state = windowState(w, await this.today(tx));
      if (state !== 'open') throw new ConflictException(state === 'upcoming' ? `Registration opens on ${w.opensOn}` : `Registration closed on ${w.closesOn}`);
      await this.assertInSession(tx, id, b.studentId);
      const [prev] = await tx.select().from(examRegistrations).where(and(eq(examRegistrations.sessionId, id), eq(examRegistrations.studentId, b.studentId)));
      if (prev?.status === 'registered') return prev;
      const reasons = ineligibleReasons(this.rules(w), await this.facts(tx, id, b.studentId));
      const v = { status: reasons.length ? ('ineligible' as const) : ('registered' as const), reasons, registeredAt: this.clock.now() };
      const [row] = await tx.insert(examRegistrations).values({ tenantId: p.tenantId, sessionId: id, studentId: b.studentId, ...v }).onConflictDoUpdate({ target: [examRegistrations.sessionId, examRegistrations.studentId], set: v }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.registration.submitted', subjectType: 'student', subjectId: b.studentId, data: { sessionId: id, status: row.status, reasons } });
      return row;
    });
  }

  @Get('registrations')
  @Auth('user', MANAGE)
  registrations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ studentId: examRegistrations.studentId, student: students.fullName, rollNo: students.rollNo, status: examRegistrations.status, reasons: examRegistrations.reasons, overridden: sql<boolean>`${examRegistrations.overriddenBy} is not null`, overrideReason: examRegistrations.overrideReason, registeredAt: examRegistrations.registeredAt })
        .from(examRegistrations)
        .innerJoin(students, eq(students.id, examRegistrations.studentId))
        .where(eq(examRegistrations.sessionId, id))
        .orderBy(asc(students.rollNo)),
    );
  }

  /** The controller registers an ineligible student anyway; the reason is kept with the registration. Works after the window has closed. */
  @Post('registrations/:studentId/override')
  @HttpCode(200)
  @Auth('user', ADMIN)
  override(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(OverrideBody)) b: z.infer<typeof OverrideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status === 'processed' || s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are processed; registration can no longer change');
      await this.windowOf(tx, id);
      await this.assertInSession(tx, id, studentId);
      const reasons = (await tx.select({ r: examRegistrations.reasons }).from(examRegistrations).where(and(eq(examRegistrations.sessionId, id), eq(examRegistrations.studentId, studentId))))[0]?.r ?? [];
      const v = { status: 'registered' as const, reasons, overriddenBy: p.userId, overrideReason: b.reason, registeredAt: this.clock.now() };
      const [row] = await tx.insert(examRegistrations).values({ tenantId: p.tenantId, sessionId: id, studentId, ...v }).onConflictDoUpdate({ target: [examRegistrations.sessionId, examRegistrations.studentId], set: v }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.registration.overridden', subjectType: 'student', subjectId: studentId, data: { sessionId: id, reasons, reason: b.reason } });
      return row;
    });
  }

  // ---- anti-collusion seating plan ----------------------------------------------------------

  /**
   * Seats every candidate of every sitting in the given halls (rows of benches): neighbours never write the same
   * subject, and programmes are mixed where possible. Replaces the earlier plan. Refused, with nothing saved,
   * when the halls cannot take everyone.
   */
  @Post('seating-plan')
  @HttpCode(200)
  @Auth('user', ADMIN)
  plan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PlanBody)) body: z.infer<typeof PlanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      if (s.status === 'processed' || s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are processed; the seating can no longer change');
      const papers = await tx.select({ id: examPapers.id, subjectId: examPapers.subjectId, sectionId: examPapers.sectionId, examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, programId: sections.programId }).from(examPapers).innerJoin(sections, eq(sections.id, examPapers.sectionId)).where(eq(examPapers.sessionId, id));
      if (papers.length === 0) throw new BadRequestException('Add papers first');
      if (new Set(body.rooms.map((r) => r.roomId)).size !== body.rooms.length) throw new BadRequestException('A hall is listed twice');
      const roomRows = await tx.select({ id: rooms.id, name: rooms.name }).from(rooms).where(inArray(rooms.id, body.rooms.map((r) => r.roomId)));
      if (roomRows.length !== body.rooms.length) throw new BadRequestException('Unknown hall');
      const layouts: RoomLayout[] = body.rooms.map((r) => ({ ...r, name: roomRows.find((x) => x.id === r.roomId)!.name }));
      await tx.delete(examSeats).where(inArray(examSeats.paperId, papers.map((x) => x.id)));
      await tx.delete(examRoomLayouts).where(eq(examRoomLayouts.sessionId, id));
      await tx.insert(examRoomLayouts).values(layouts.map((l) => ({ tenantId: p.tenantId, sessionId: id, roomId: l.roomId, rows: l.rows, benchesPerRow: l.benchesPerRow, seatsPerBench: l.seatsPerBench })));
      let seated = 0;
      let vacant = 0;
      const groups = slotGroups(papers);
      for (const [i, group] of groups.entries()) {
        const cands: SeatCandidate[] = [];
        for (const paperId of group) {
          const paper = papers.find((x) => x.id === paperId)!;
          const roster = await tx.select({ id: students.id, rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, paper.sectionId), eq(students.status, 'active')));
          cands.push(...roster.map((r) => ({ paperId, studentId: r.id, rollNo: r.rollNo, subjectKey: paper.subjectId, programKey: paper.programId })));
        }
        const result = antiCollusionSeats(cands, layouts);
        if (result.unplaced.length) {
          const cap = layouts.reduce((n, l) => n + roomCapacity(l), 0);
          throw new BadRequestException(`Sitting ${i + 1} has ${cands.length} candidates but the halls (${cap} seats) can take only ${result.seats.length} without neighbours writing the same subject. Add halls or benches.`);
        }
        if (result.seats.length) await tx.insert(examSeats).values(result.seats.map((x) => ({ tenantId: p.tenantId, paperId: x.paperId, studentId: x.studentId, roomId: x.roomId, seatNo: x.seatNo })));
        seated += result.seats.length;
        vacant += result.vacant;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'exam.seating.anti_collusion', subjectType: 'exam_session', subjectId: id, data: { seated, vacant, sittings: groups.length, halls: layouts.length } });
      return { seated, vacant, sittings: groups.length };
    });
  }

  /** The sittings of the plan, with the halls used and how many are seated in each. */
  @Get('seating-plan')
  @Auth('user', MANAGE)
  planOverview(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.exams.session(tx, id);
      const papers = await tx.select({ id: examPapers.id, examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, subject: subjects.name }).from(examPapers).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).where(eq(examPapers.sessionId, id));
      const layouts = await tx.select({ roomId: examRoomLayouts.roomId, room: rooms.name, rows: examRoomLayouts.rows, benchesPerRow: examRoomLayouts.benchesPerRow, seatsPerBench: examRoomLayouts.seatsPerBench }).from(examRoomLayouts).innerJoin(rooms, eq(rooms.id, examRoomLayouts.roomId)).where(eq(examRoomLayouts.sessionId, id)).orderBy(asc(rooms.name));
      const seats = papers.length ? await tx.select({ paperId: examSeats.paperId, roomId: examSeats.roomId }).from(examSeats).where(inArray(examSeats.paperId, papers.map((x) => x.id))) : [];
      const sittings = slotGroups(papers).map((group, slot) => {
        const ps = papers.filter((x) => group.includes(x.id));
        const inGroup = seats.filter((x) => group.includes(x.paperId));
        return {
          slot,
          examDate: ps[0].examDate,
          startsAt: ps.map((x) => x.startsAt).sort()[0],
          endsAt: ps.map((x) => x.endsAt).sort().reverse()[0],
          subjects: [...new Set(ps.map((x) => x.subject))],
          seated: inGroup.length,
          halls: layouts.filter((l) => inGroup.some((x) => x.roomId === l.roomId)).map((l) => ({ roomId: l.roomId, room: l.room, seated: inGroup.filter((x) => x.roomId === l.roomId).length })),
        };
      });
      return { layouts, sittings };
    });
  }

  /** The seating chart of one hall for one sitting (`slot` from the plan overview), as a PDF. */
  @Get('seating-plan/sittings/:slot/rooms/:roomId/pdf')
  @Auth('user', MANAGE)
  async chart(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('slot', ParseIntPipe) slot: number, @Param('roomId', ParseUUIDPipe) roomId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, id);
      const papers = await tx.select({ id: examPapers.id, examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, subject: subjects.name, code: subjects.code }).from(examPapers).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).where(eq(examPapers.sessionId, id));
      const group = slotGroups(papers)[slot];
      if (!group) throw new NotFoundException('No such sitting');
      const [layout] = await tx.select({ rows: examRoomLayouts.rows, benchesPerRow: examRoomLayouts.benchesPerRow, seatsPerBench: examRoomLayouts.seatsPerBench, room: rooms.name }).from(examRoomLayouts).innerJoin(rooms, eq(rooms.id, examRoomLayouts.roomId)).where(and(eq(examRoomLayouts.sessionId, id), eq(examRoomLayouts.roomId, roomId)));
      if (!layout) throw new NotFoundException('That hall is not in the seating plan');
      const placed = await tx
        .select({ paperId: examSeats.paperId, seatNo: examSeats.seatNo, rollNo: students.rollNo, name: students.fullName })
        .from(examSeats)
        .innerJoin(students, eq(students.id, examSeats.studentId))
        .where(and(eq(examSeats.roomId, roomId), inArray(examSeats.paperId, group)));
      const ps = papers.filter((x) => group.includes(x.id));
      const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
      return seatingChartPdf({
        institution: t?.name ?? '',
        sessionName: s.name,
        room: layout.room,
        sitting: `${ps[0].examDate}  ${ps.map((x) => x.startsAt).sort()[0]}-${ps.map((x) => x.endsAt).sort().reverse()[0]}`,
        rows: layout.rows,
        benchesPerRow: layout.benchesPerRow,
        seatsPerBench: layout.seatsPerBench,
        seats: placed.map((x) => ({ seatNo: x.seatNo, rollNo: x.rollNo, name: x.name, subject: ps.find((y) => y.id === x.paperId)?.code ?? '' })),
      });
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="seating-chart.pdf"');
    res.end(pdf);
  }

  // ---- helpers ------------------------------------------------------------------------------

  private async windowOf(tx: Tx, sessionId: string) {
    await this.exams.session(tx, sessionId);
    const [w] = await tx.select().from(examRegistrationWindows).where(eq(examRegistrationWindows.sessionId, sessionId));
    if (!w) throw new NotFoundException('No registration window is set for this session');
    return w;
  }

  private rules(w: { minAttendancePercent: number | null; blockOnFeeDues: boolean; maxBacklogs: number | null }): EligibilityRules {
    return { minAttendancePercent: w.minAttendancePercent, blockOnFeeDues: w.blockOnFeeDues, maxBacklogs: w.maxBacklogs };
  }

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  /** The student must belong to the session's programme and term. */
  private async assertInSession(tx: Tx, sessionId: string, studentId: string) {
    const s = await this.exams.session(tx, sessionId);
    const [st] = await tx.select({ programId: sections.programId, term: sections.term, status: students.status }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!st || st.programId !== s.programId) throw new BadRequestException('The student is not in this programme');
    if (s.kind === 'regular' && st.term !== s.term) throw new BadRequestException('The student is not in this term');
  }

  private async facts(tx: Tx, sessionId: string, studentId: string): Promise<EligibilityFacts> {
    const s = await this.exams.session(tx, sessionId);
    const today = await this.today(tx);
    const [year] = await tx.select({ startsOn: academicYears.startsOn, endsOn: academicYears.endsOn }).from(academicYears).where(eq(academicYears.id, s.academicYearId));
    const [att] = await tx
      .select({ total: sql<number>`count(*)::int`, attended: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late', 'excused'))::int` })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.studentId, studentId), sql`${attendanceRecords.timetableSlotId} is null`, sql`${attendanceRecords.date} between ${year?.startsOn ?? '1900-01-01'} and ${year?.endsOn ?? '2999-12-31'}`));
    const [due] = await tx
      .select({ paise: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}), 0)::bigint` })
      .from(feeInvoices)
      .where(and(eq(feeInvoices.studentId, studentId), eq(feeInvoices.status, 'due'), sql`${feeInvoices.dueOn} <= ${today}`));
    const latest = await this.exams.latestAttempts(tx, [studentId], s.programId);
    return {
      attendancePercent: att && att.total > 0 ? Math.round((att.attended / att.total) * 1000) / 10 : null,
      feeDuePaise: Number(due?.paise ?? 0),
      backlogs: (latest.get(studentId) ?? []).filter((l) => !l.passed).length,
    };
  }
}
