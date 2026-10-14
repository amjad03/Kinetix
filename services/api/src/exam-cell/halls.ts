import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { answerSheetAccounts, examPapers, examReschedules, examSeats, examSessions, invigilationDuties, invigilationSwaps, rooms, sections, staffProfiles, students, subjects, supplementaryRegistrations, userRoles, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { Int, OptionalText, Ref, uuidEq } from '../records/helpers.js';
import { feedCalendar } from '../scheduling/calendar-feed.js';
import { overlaps } from '../exams/seating.js';
import { parseDate } from '../teacher/teacher.service.js';
import { auditCell, CELL, CELL_READ, CELL_STAFF, hasResults, loadSession, rowsOf, sessionOptions } from './common.js';
import { bookProblem, buildRoster, daysBetween, type RosterSlot } from './exam-cell.logic.js';
import { cellSettings } from './settings.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const RescheduleBody = z.object({ examDate: z.string(), startsAt: z.string().regex(TIME), endsAt: z.string().regex(TIME), reason: z.string().trim().min(5).max(300) });
const SwapBody = z.object({ swapWith: z.uuid(), reason: z.string().trim().min(3).max(300) });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
const RosterBody = z.object({ replace: z.boolean().default(false) });

const hm = (t: string) => t.slice(0, 5);

/** Staff who may invigilate: teaching staff and the exam office. */
export async function invigilatorOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, 'active'), sql`${userRoles.role} in ('teacher', 'hod', 'exam_controller')`))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function roomOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: rooms.id, name: rooms.name }).from(rooms).orderBy(asc(rooms.name))).map((r) => ({ value: r.id, label: r.name }));
}

/**
 * The halls: answer-book accounts per hall and sitting, paper postponements with notices to candidates, timetable
 * clashes for candidates with backlog papers, the invigilation roster built by load and seniority, and duty swaps.
 */
@Controller('v1')
export class HallsController {
  constructor(
    private readonly db: DbService,
    private readonly notes: NotificationsService,
  ) {}

  // ---- answer books -------------------------------------------------------------------------

  /** The chief superintendent signs off a hall's account; it must balance first. */
  @Post('answer-sheet-accounts/:id/submit')
  @HttpCode(200)
  @Auth('user', CELL_STAFF)
  submitAccount(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(answerSheetAccounts).where(eq(answerSheetAccounts.id, id));
      if (!a) throw new NotFoundException('Not found');
      if (a.status === 'submitted') throw new ConflictException('This account is already submitted');
      const problem = bookProblem(a, await seatedIn(tx, a.sessionId, a.roomId, a.examDate, a.sitting));
      if (problem) throw new BadRequestException(problem);
      const [row] = await tx.update(answerSheetAccounts).set({ status: 'submitted', submittedBy: p.userId, submittedAt: new Date() }).where(eq(answerSheetAccounts.id, id)).returning();
      await auditCell(tx, p, 'answer_sheet_account.submitted', 'answer_sheet_account', id, { before: { status: 'draft' }, after: { status: 'submitted' } });
      return row;
    });
  }

  // ---- postponement -------------------------------------------------------------------------

  /** Moves a paper to another day or time; candidates and families are told, and the calendar follows. */
  @Post('exam-sessions/:id/papers/:paperId/reschedule')
  @HttpCode(200)
  @Auth('user', CELL)
  reschedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodBody(RescheduleBody)) b: z.infer<typeof RescheduleBody>) {
    const examDate = parseDate(b.examDate, 'examDate');
    if (b.endsAt <= b.startsAt) throw new BadRequestException('A paper must end after it starts');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (hasResults(s)) throw new ConflictException('Results are processed; the timetable can no longer change');
      const [paper] = await tx.select().from(examPapers).where(and(eq(examPapers.id, paperId), eq(examPapers.sessionId, id)));
      if (!paper) throw new NotFoundException('Paper not found');
      const slot = { examDate, startsAt: b.startsAt, endsAt: b.endsAt };
      const others = await tx.select().from(examPapers).where(and(eq(examPapers.sessionId, id), eq(examPapers.sectionId, paper.sectionId), ne(examPapers.id, paperId)));
      if (others.some((o) => overlaps({ examDate: o.examDate, startsAt: hm(o.startsAt), endsAt: hm(o.endsAt) }, slot))) throw new ConflictException('This class already has a paper at that time');
      if (examDate === paper.examDate && b.startsAt === hm(paper.startsAt) && b.endsAt === hm(paper.endsAt)) throw new BadRequestException('That is the paper’s current time');
      const extended = examDate > s.endsOn ? { endsOn: examDate } : examDate < s.startsOn ? { startsOn: examDate } : null;
      if (extended) await tx.update(examSessions).set(extended).where(eq(examSessions.id, id));
      await tx.update(examPapers).set({ examDate, startsAt: b.startsAt, endsAt: b.endsAt }).where(eq(examPapers.id, paperId));
      // Seats and duties of the old sitting no longer hold.
      await tx.delete(examSeats).where(eq(examSeats.paperId, paperId));
      const candidates = (await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, paper.sectionId), eq(students.status, 'active')))).map((r) => r.id);
      const regs = (await tx.select({ id: supplementaryRegistrations.studentId }).from(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, id), eq(supplementaryRegistrations.subjectId, paper.subjectId)))).map((r) => r.id);
      const told = [...new Set([...candidates, ...regs])];
      const [sub] = await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, paper.subjectId));
      const [row] = await tx
        .insert(examReschedules)
        .values({ tenantId: p.tenantId, sessionId: id, paperId, fromDate: paper.examDate, fromStartsAt: paper.startsAt, fromEndsAt: paper.endsAt, toDate: examDate, toStartsAt: b.startsAt, toEndsAt: b.endsAt, reason: b.reason, notified: told.length, createdBy: p.userId })
        .returning();
      await this.notes.examNotice(tx, told, {
        kind: 'calendar',
        text: {
          en: { title: 'Exam rescheduled', body: `${sub?.name ?? 'A paper'} (${s.name}) moves from ${paper.examDate} ${hm(paper.startsAt)} to ${examDate} ${b.startsAt}. ${b.reason}` },
          hi: { title: 'परीक्षा का समय बदला', body: `${sub?.name ?? 'एक प्रश्नपत्र'} (${s.name}) ${paper.examDate} ${hm(paper.startsAt)} से ${examDate} ${b.startsAt} पर चला गया है। ${b.reason}` },
          kn: { title: 'ಪರೀಕ್ಷೆಯ ಸಮಯ ಬದಲಾಗಿದೆ', body: `${sub?.name ?? 'ಒಂದು ಪತ್ರಿಕೆ'} (${s.name}) ${paper.examDate} ${hm(paper.startsAt)} ರಿಂದ ${examDate} ${b.startsAt} ಕ್ಕೆ ಬದಲಾಗಿದೆ. ${b.reason}` },
        },
        data: { sessionId: id, paperId },
        dedupeKey: `exam-reschedule:${row.id}`,
      });
      if (s.status !== 'draft') await feedCalendar(tx, p.tenantId, p.userId);
      await auditCell(tx, p, 'exam.paper.rescheduled', 'exam_session', id, { data: { paperId, from: `${paper.examDate} ${hm(paper.startsAt)}`, to: `${examDate} ${b.startsAt}`, reason: b.reason, notified: told.length } });
      return row;
    });
  }

  /**
   * Candidates who must be in two papers at once: a candidate of this session (by class or registration) with an
   * overlapping paper in any other open session, typically a backlog paper of a supplementary session.
   */
  @Get('exam-sessions/:id/clashes')
  @Auth('user', CELL_READ)
  clashes(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await loadSession(tx, id);
      return rowsOf(
        tx,
        sql`with sits as (
            select st.id as student_id, p.id as paper_id, p.session_id, p.subject_id, p.exam_date, p.starts_at, p.ends_at
              from exam_papers p join exam_sessions s on s.id = p.session_id join students st on st.section_id = p.section_id and st.status = 'active'
              where s.status in ('draft', 'scheduled') and s.kind not in ('supplementary', 'improvement', 'special')
            union
            select r.student_id, p.id, p.session_id, p.subject_id, p.exam_date, p.starts_at, p.ends_at
              from supplementary_registrations r join exam_papers p on p.session_id = r.session_id and p.subject_id = r.subject_id join exam_sessions s on s.id = p.session_id
              where s.status in ('draft', 'scheduled'))
          select distinct st.roll_no as "rollNo", st.full_name as name, a.exam_date as "examDate", to_char(a.starts_at, 'HH24:MI') as "startsAt",
                 sa.code as "paperA", sb.code as "paperB", xa.name as "sessionA", xb.name as "sessionB"
            from sits a join sits b on a.student_id = b.student_id and a.paper_id < b.paper_id and a.exam_date = b.exam_date and a.starts_at < b.ends_at and b.starts_at < a.ends_at
            join students st on st.id = a.student_id join subjects sa on sa.id = a.subject_id join subjects sb on sb.id = b.subject_id
            join exam_sessions xa on xa.id = a.session_id join exam_sessions xb on xb.id = b.session_id
           where a.session_id = ${id}::uuid or b.session_id = ${id}::uuid
           order by a.exam_date, st.roll_no`,
      );
    });
  }

  // ---- invigilation -------------------------------------------------------------------------

  /**
   * Builds the invigilation roster from the seating: per sitting a chief superintendent (the most senior free
   * person) and one invigilator per N candidates in each hall, always the person with the fewest duties so far.
   * Staff already on duty elsewhere at that time are skipped. `replace` clears the session's roster first.
   */
  @Post('exam-sessions/:id/duties/auto')
  @HttpCode(200)
  @Auth('user', CELL)
  roster(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RosterBody)) b: z.infer<typeof RosterBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status === 'draft') throw new ConflictException('Schedule the session first');
      const seats = await rowsOf<{ exam_date: string; starts_at: string; ends_at: string; room_id: string; n: number }>(
        tx,
        sql`select p.exam_date, to_char(min(p.starts_at), 'HH24:MI') as starts_at, to_char(max(p.ends_at), 'HH24:MI') as ends_at, es.room_id, count(*)::int as n
          from exam_seats es join exam_papers p on p.id = es.paper_id where p.session_id = ${id}::uuid group by p.exam_date, p.starts_at, es.room_id order by p.exam_date, 2`,
      );
      if (seats.length === 0) throw new ConflictException('Seat the candidates first: the roster follows the halls in use');
      if (b.replace) await tx.delete(invigilationDuties).where(eq(invigilationDuties.sessionId, id));
      const slots = new Map<string, RosterSlot>();
      for (const r of seats) {
        const key = `${r.exam_date} ${r.starts_at}`;
        const slot = slots.get(key) ?? { key, date: String(r.exam_date), startsAt: r.starts_at, endsAt: r.ends_at, rooms: [] };
        slot.rooms.push({ roomId: r.room_id, candidates: r.n });
        slot.endsAt = slot.endsAt > r.ends_at ? slot.endsAt : r.ends_at;
        slots.set(key, slot);
      }
      const staffIds = (await invigilatorOptions({ tx, p })).map((o) => o.value);
      if (staffIds.length === 0) throw new ConflictException('There are no teaching staff to put on duty');
      const today = new Date().toISOString().slice(0, 10);
      const profile = new Map((await tx.select({ id: staffProfiles.userId, joined: staffProfiles.dateOfJoining }).from(staffProfiles).where(inArray(staffProfiles.userId, staffIds))).map((r) => [r.id, r.joined]));
      const existing = await tx.select().from(invigilationDuties).where(inArray(invigilationDuties.staffId, staffIds));
      const load = (sid: string) => existing.filter((d) => d.staffId === sid && d.sessionId === id).length;
      const covered = new Set(existing.filter((d) => d.sessionId === id).map((d) => `${d.dutyDate} ${hm(d.startsAt)} ${d.roomId}`));
      const todo = [...slots.values()].map((sl) => ({ ...sl, rooms: sl.rooms.filter((r) => !covered.has(`${sl.date} ${sl.startsAt} ${r.roomId}`)) })).filter((sl) => sl.rooms.length > 0);
      const busy = (sid: string, slot: RosterSlot) => existing.some((d) => d.staffId === sid && overlaps({ examDate: d.dutyDate, startsAt: hm(d.startsAt), endsAt: hm(d.endsAt) }, { examDate: slot.date, startsAt: slot.startsAt, endsAt: slot.endsAt }));
      const cfg = await cellSettings(tx);
      const plan = buildRoster(todo, staffIds.map((sid) => ({ id: sid, seniorityDays: profile.get(sid) ? daysBetween(profile.get(sid)!, today) : 0, load: load(sid) })), cfg.perInvigilator, busy);
      for (const d of plan.duties) {
        const slot = slots.get(d.slotKey)!;
        await tx.insert(invigilationDuties).values({ tenantId: p.tenantId, sessionId: id, staffId: d.staffId, roomId: d.roomId, dutyDate: slot.date, startsAt: slot.startsAt, endsAt: slot.endsAt, role: d.role, createdBy: p.userId });
      }
      await auditCell(tx, p, 'exam.roster.built', 'exam_session', id, { data: { duties: plan.duties.length, short: plan.short.length } });
      return { duties: plan.duties.length, chiefs: plan.duties.filter((d) => d.role === 'chief').length, short: plan.short };
    });
  }

  /** An invigilator asks to hand their duty to a colleague who is free then. */
  @Post('invigilation/duties/:id/swap')
  @Auth('user', CELL_STAFF)
  askSwap(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SwapBody)) b: z.infer<typeof SwapBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(invigilationDuties).where(eq(invigilationDuties.id, id));
      if (!d) throw new NotFoundException('Duty not found');
      const isCell = p.roles.some((r) => CELL.includes(r));
      if (d.staffId !== p.userId && !isCell) throw new ForbiddenException('Only the person on duty can ask to swap it');
      if (b.swapWith === d.staffId) throw new BadRequestException('Choose someone else');
      if (!(await invigilatorOptions({ tx, p })).some((o) => o.value === b.swapWith)) throw new BadRequestException('Choose a member of the teaching staff');
      await this.assertFree(tx, b.swapWith, d);
      const [open] = await tx.select({ id: invigilationSwaps.id }).from(invigilationSwaps).where(and(eq(invigilationSwaps.dutyId, id), eq(invigilationSwaps.status, 'requested')));
      if (open) throw new ConflictException('A swap for this duty is already waiting');
      const [row] = await tx.insert(invigilationSwaps).values({ tenantId: p.tenantId, dutyId: id, requestedBy: p.userId, swapWith: b.swapWith, reason: b.reason }).returning();
      await auditCell(tx, p, 'invigilation.swap_requested', 'exam_session', d.sessionId, { data: { dutyId: id, swapWith: b.swapWith, reason: b.reason } });
      return row;
    });
  }

  @Post('invigilation/swaps/:id/decide')
  @HttpCode(200)
  @Auth('user', [...CELL, 'hod'])
  decideSwap(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sw] = await tx.select().from(invigilationSwaps).where(eq(invigilationSwaps.id, id));
      if (!sw) throw new NotFoundException('Swap not found');
      if (sw.status !== 'requested') throw new ConflictException('This swap is already decided');
      if (!b.approve && !b.note) throw new BadRequestException('Say why the swap is not approved');
      const [d] = await tx.select().from(invigilationDuties).where(eq(invigilationDuties.id, sw.dutyId));
      if (b.approve) {
        await this.assertFree(tx, sw.swapWith, d);
        await tx.update(invigilationDuties).set({ staffId: sw.swapWith, status: 'substituted', substitutedFrom: d.staffId }).where(eq(invigilationDuties.id, d.id));
      }
      const status = b.approve ? 'approved' : 'rejected';
      const [row] = await tx.update(invigilationSwaps).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.note ?? null }).where(eq(invigilationSwaps.id, id)).returning();
      await auditCell(tx, p, `invigilation.swap_${status}`, 'exam_session', d.sessionId, { data: { dutyId: d.id, from: d.staffId, to: sw.swapWith } });
      return row;
    });
  }

  @Get('exam-sessions/:id/swaps')
  @Auth('user', CELL_READ)
  swaps(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      rowsOf(
        tx,
        sql`select w.id, w.status, w.reason, w.decision_note as "decisionNote", w.created_at as "createdAt", d.duty_date as "dutyDate", to_char(d.starts_at, 'HH24:MI') as "startsAt", r.name as room,
            a.full_name as "requestedBy", b.full_name as "swapWith", o.full_name as "onDuty"
          from invigilation_swaps w join invigilation_duties d on d.id = w.duty_id join rooms r on r.id = d.room_id
          join users a on a.id = w.requested_by join users b on b.id = w.swap_with join users o on o.id = d.staff_id
          where d.session_id = ${id}::uuid order by w.created_at desc`,
      ),
    );
  }

  private async assertFree(tx: Tx, staffId: string, d: typeof invigilationDuties.$inferSelect) {
    const same = await tx.select().from(invigilationDuties).where(and(eq(invigilationDuties.staffId, staffId), eq(invigilationDuties.dutyDate, d.dutyDate), ne(invigilationDuties.id, d.id)));
    if (same.some((x) => overlaps({ examDate: x.dutyDate, startsAt: hm(x.startsAt), endsAt: hm(x.endsAt) }, { examDate: d.dutyDate, startsAt: hm(d.startsAt), endsAt: hm(d.endsAt) }))) throw new ConflictException('That staff member already has a duty at that time');
  }
}

/** Candidates seated in a hall for a sitting (null when the session has no seating there). */
async function seatedIn(tx: Tx, sessionId: string, roomId: string, examDate: string, sitting: string): Promise<number | null> {
  const [r] = await rowsOf<{ n: number }>(tx, sql`select count(*)::int as n from exam_seats es join exam_papers p on p.id = es.paper_id where p.session_id = ${sessionId}::uuid and es.room_id = ${roomId}::uuid and p.exam_date = ${examDate}::date and to_char(p.starts_at, 'HH24:MI') = ${sitting}`);
  return r && r.n > 0 ? r.n : null;
}

const count = (label: string) => ({ label, type: 'number' as const, schema: Int(0, 5000), bulk: false });

export function answerSheetsEntity(): RecordEntity {
  const draft = async (tx: Tx, id: string) => (await tx.select({ s: answerSheetAccounts.status }).from(answerSheetAccounts).where(eq(answerSheetAccounts.id, id)))[0]?.s === 'draft';
  const num = (key: keyof typeof answerSheetAccounts.$inferInsert, label: string) => ({
    ...count(label),
    apply: async (ctx: KitCtx, id: string, v: unknown) => {
      if (!(await draft(ctx.tx, id))) throw new ConflictException('A submitted account cannot be changed');
      await ctx.tx.update(answerSheetAccounts).set({ [key]: v }).where(eq(answerSheetAccounts.id, id));
    },
  });
  return {
    key: 'answer-sheet-accounts',
    module: 'exams',
    table: answerSheetAccounts,
    subjectType: 'answer_sheet_account',
    roles: { read: CELL_READ, write: CELL_STAFF },
    label: (r) => `${String(r.roomName ?? '')} ${String(r.examDate ?? '')} ${String(r.sitting ?? '')}`.trim(),
    list: {
      select: { id: answerSheetAccounts.id, sessionId: answerSheetAccounts.sessionId, sessionName: examSessions.name, roomId: answerSheetAccounts.roomId, roomName: rooms.name, examDate: answerSheetAccounts.examDate, sitting: answerSheetAccounts.sitting, received: answerSheetAccounts.received, issued: answerSheetAccounts.issued, additional: answerSheetAccounts.additional, spoiled: answerSheetAccounts.spoiled, returned: answerSheetAccounts.returned, present: answerSheetAccounts.present, absent: answerSheetAccounts.absent, malpractice: answerSheetAccounts.malpractice, remarks: answerSheetAccounts.remarks, status: answerSheetAccounts.status },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, answerSheetAccounts.sessionId)).innerJoin(rooms, eq(rooms.id, answerSheetAccounts.roomId)),
      search: [rooms.name, answerSheetAccounts.remarks],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(answerSheetAccounts.sessionId, v) },
        status: { label: 'Status', options: [{ value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' }], where: (v) => (v === 'draft' || v === 'submitted' ? eq(answerSheetAccounts.status, v) : undefined) },
        room: { label: 'Hall', options: roomOptions, where: (v) => uuidEq(answerSheetAccounts.roomId, v) },
      },
      sorts: { date: answerSheetAccounts.examDate, room: rooms.name, status: answerSheetAccounts.status },
      defaultSort: { id: 'date', dir: 'asc' },
      tiebreak: [answerSheetAccounts.sitting, rooms.name],
    },
    fields: {
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx), column: answerSheetAccounts.sessionId },
      roomId: { label: 'Hall', type: 'select', schema: Ref, required: true, edit: false, options: roomOptions, column: answerSheetAccounts.roomId },
      examDate: { label: 'Date', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), required: true, edit: false, column: answerSheetAccounts.examDate },
      sitting: { label: 'Sitting (start time)', type: 'text', schema: z.string().regex(TIME, 'Use a time like 10:00'), required: true, edit: false, column: answerSheetAccounts.sitting },
      received: num('received', 'Books received'),
      issued: num('issued', 'Main books issued'),
      additional: num('additional', 'Additional sheets'),
      spoiled: num('spoiled', 'Spoiled'),
      returned: num('returned', 'Returned (used)'),
      present: num('present', 'Present'),
      absent: num('absent', 'Absent'),
      malpractice: num('malpractice', 'Malpractice cases'),
      remarks: { label: 'Remarks', type: 'textarea', schema: OptionalText(500), apply: async (ctx, id, v) => { await ctx.tx.update(answerSheetAccounts).set({ remarks: v as string | null }).where(eq(answerSheetAccounts.id, id)); } },
    },
    create: async (ctx, v) => {
      const s = await loadSession(ctx.tx, String(v.sessionId));
      const date = String(v.examDate);
      if (date < s.startsOn || date > s.endsOn) throw new BadRequestException('The date is outside the session');
      const [row] = await ctx.tx
        .insert(answerSheetAccounts)
        .values({ tenantId: ctx.p.tenantId, sessionId: s.id, roomId: String(v.roomId), examDate: date, sitting: String(v.sitting), received: Number(v.received ?? 0), issued: Number(v.issued ?? 0), additional: Number(v.additional ?? 0), spoiled: Number(v.spoiled ?? 0), returned: Number(v.returned ?? 0), present: Number(v.present ?? 0), absent: Number(v.absent ?? 0), malpractice: Number(v.malpractice ?? 0), remarks: (v.remarks as string | null) ?? null, createdBy: ctx.p.userId })
        .returning({ id: answerSheetAccounts.id });
      return row.id;
    },
    remove: { guard: async (ctx, id) => ((await draft(ctx.tx, id)) ? null : 'A submitted account stays on record') },
    columns: [
      { key: 'examDate', header: 'Date' },
      { key: 'sitting', header: 'Sitting' },
      { key: 'roomName', header: 'Hall' },
      { key: 'received', header: 'Received' },
      { key: 'issued', header: 'Issued' },
      { key: 'additional', header: 'Additional' },
      { key: 'spoiled', header: 'Spoiled' },
      { key: 'returned', header: 'Returned' },
      { key: 'present', header: 'Present' },
      { key: 'absent', header: 'Absent' },
      { key: 'malpractice', header: 'Malpractice' },
      { key: 'status', header: 'Status' },
      { key: 'remarks', header: 'Remarks' },
    ],
  };
}

export function reschedulesEntity(): RecordEntity {
  return {
    key: 'exam-reschedules',
    module: 'exams',
    table: examReschedules,
    subjectType: 'exam_reschedule',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.code ?? '')} ${String(r.fromDate ?? '')} → ${String(r.toDate ?? '')}`,
    list: {
      select: { id: examReschedules.id, sessionId: examReschedules.sessionId, sessionName: examSessions.name, paperId: examReschedules.paperId, code: subjects.code, subjectName: subjects.name, sectionName: sections.displayName, fromDate: examReschedules.fromDate, fromStartsAt: examReschedules.fromStartsAt, toDate: examReschedules.toDate, toStartsAt: examReschedules.toStartsAt, reason: examReschedules.reason, notified: examReschedules.notified, createdAt: examReschedules.createdAt },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, examReschedules.sessionId)).innerJoin(examPapers, eq(examPapers.id, examReschedules.paperId)).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).innerJoin(sections, eq(sections.id, examPapers.sectionId)),
      search: [subjects.name, subjects.code, examReschedules.reason],
      filters: { session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(examReschedules.sessionId, v) } },
      sorts: { created: examReschedules.createdAt, from: examReschedules.fromDate, to: examReschedules.toDate, subject: subjects.code },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    remove: { guard: async () => 'A postponement stays on record; move the paper again to change it' },
    columns: [
      { key: 'sessionName', header: 'Exam session' },
      { key: 'code', header: 'Paper code' },
      { key: 'subjectName', header: 'Subject' },
      { key: 'sectionName', header: 'Class' },
      { key: 'fromDate', header: 'Was on' },
      { key: 'fromStartsAt', header: 'At' },
      { key: 'toDate', header: 'Moved to' },
      { key: 'toStartsAt', header: 'At ' },
      { key: 'reason', header: 'Reason' },
      { key: 'notified', header: 'Told' },
    ],
  };
}

@Injectable()
export class HallRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}
  onModuleInit(): void {
    this.registry.register(answerSheetsEntity());
    this.registry.register(reschedulesEntity());
  }
}
