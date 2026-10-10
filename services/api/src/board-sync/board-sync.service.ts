import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { BoardPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { boardSessions, devices, examPapers, examSeats, examSessions, invigilationDuties, rooms, sections, subjects, users } from '../db/schema.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

/** How long before a paper starts the board switches to exam room mode. */
export const EXAM_LEAD_MINUTES = 15;

const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Board features that keep the room in step with the timetable and the exam schedule. */
@Injectable()
export class BoardSyncService {
  constructor(
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly sessions: SessionsService,
  ) {}

  private async roomOf(tx: Tx, deviceId: string): Promise<string | null> {
    const [d] = await tx.select({ roomId: devices.roomId }).from(devices).where(eq(devices.id, deviceId));
    return d?.roomId ?? null;
  }

  /**
   * The period the signed-in teacher is teaching in this room now, and whether the board is already on it. A board that stays signed in
   * past the bell uses this to offer the next class instead of carrying on with the last one.
   */
  async now(tx: Tx, p: BoardPrincipal) {
    const slot = await this.timetable.currentSlotForTeacher(tx, p.teacherId, await this.roomOf(tx, p.deviceId));
    const [session] = await tx.select({ slotId: boardSessions.timetableSlotId, sectionId: boardSessions.sectionId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
    if (!slot) return { slot: null, onIt: false, sessionSectionId: session?.sectionId ?? null };
    const [names] = await tx
      .select({ sectionName: sections.name, subjectName: subjects.name })
      .from(sections)
      .innerJoin(subjects, eq(subjects.id, slot.subjectId))
      .where(eq(sections.id, slot.sectionId));
    return {
      slot: { id: slot.id, sectionId: slot.sectionId, subjectId: slot.subjectId, sectionName: names?.sectionName ?? '', subjectName: names?.subjectName ?? '', startsAt: slot.startsAt, endsAt: slot.endsAt },
      onIt: session?.slotId === slot.id,
      sessionSectionId: session?.sectionId ?? null,
    };
  }

  /**
   * Moves the board's session onto the teacher's current period and keeps the period on the session, so attendance taken from here
   * lands against that period in the ERP (opening a class by hand has no period).
   */
  async openNow(tx: Tx, p: BoardPrincipal) {
    const slot = await this.timetable.currentSlotForTeacher(tx, p.teacherId, await this.roomOf(tx, p.deviceId));
    if (!slot) throw new NotFoundException('You have no class in this room right now');
    await tx
      .update(boardSessions)
      .set({ sectionId: slot.sectionId, subjectId: slot.subjectId, timetableSlotId: slot.id, expiresAt: new Date(slot.endsAtInstant.getTime() + 5 * 60_000) })
      .where(and(eq(boardSessions.id, p.sessionId), sql`${boardSessions.endedAt} is null`));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.teacherId, action: 'board_session.period_opened', subjectType: 'board_session', subjectId: p.sessionId, data: { slotId: slot.id, sectionId: slot.sectionId } });
    return { ...(await this.sessions.context(tx, p.sessionId)), roster: await this.sessions.roster(tx, slot.sectionId) };
  }

  /**
   * Exam room mode for a board: the paper being sat in this board's room (from 15 minutes before it starts to its end), how many
   * candidates are seated there and who invigilates. `active` is false when the room has no paper now.
   */
  async examRoom(tx: Tx, deviceId: string) {
    const roomId = await this.roomOf(tx, deviceId);
    if (!roomId) return { active: false as const };
    const now = localParts(this.clock.now(), await this.timetable.tenantTimezone(tx));
    const at = minutesOf(now.time);
    const papers = await tx
      .selectDistinct({ id: examPapers.id, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, maxMarks: examPapers.maxMarks, subject: subjects.name, section: sections.name, session: examSessions.name, sessionId: examPapers.sessionId })
      .from(examSeats)
      .innerJoin(examPapers, eq(examPapers.id, examSeats.paperId))
      .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
      .innerJoin(sections, eq(sections.id, examPapers.sectionId))
      .innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId))
      .where(and(eq(examSeats.roomId, roomId), eq(examPapers.examDate, now.date)))
      .orderBy(asc(examPapers.startsAt));
    const paper = papers.find((x) => at >= minutesOf(x.startsAt) - EXAM_LEAD_MINUTES && at < minutesOf(x.endsAt));
    if (!paper) return { active: false as const };
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(examSeats).where(and(eq(examSeats.paperId, paper.id), eq(examSeats.roomId, roomId)));
    const [room] = await tx.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, roomId));
    const duty = await tx
      .select({ name: users.fullName, role: invigilationDuties.role })
      .from(invigilationDuties)
      .innerJoin(users, eq(users.id, invigilationDuties.staffId))
      .where(and(eq(invigilationDuties.roomId, roomId), eq(invigilationDuties.dutyDate, now.date), lte(invigilationDuties.startsAt, paper.endsAt), gte(invigilationDuties.endsAt, paper.startsAt)));
    const start = minutesOf(paper.startsAt);
    const end = minutesOf(paper.endsAt);
    return {
      active: true as const,
      room: room?.name ?? '',
      paper: { id: paper.id, subject: paper.subject, section: paper.section, session: paper.session, startsAt: paper.startsAt, endsAt: paper.endsAt, maxMarks: paper.maxMarks },
      seated: n,
      invigilators: duty,
      startsInMinutes: Math.max(0, start - at),
      minutesLeft: Math.max(0, end - Math.max(at, start)),
      started: at >= start,
    };
  }
}
