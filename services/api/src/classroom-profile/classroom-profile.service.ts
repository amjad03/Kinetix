import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import {
  boardSessions,
  buzzerPresses,
  buzzerRounds,
  classNotes,
  programs,
  sections,
  students,
  subjects,
  timetableSlots,
  trainingRequests,
  users,
} from '../db/schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { SessionsService } from '../sessions/sessions.service.js';

/** Pushed to the board when a student buzzes or the teacher locks or resets. */
export const BUZZER_UPDATED = 'buzzer.updated';
export const TRAINING_STATUSES = ['requested', 'confirmed', 'done', 'cancelled'] as const;
/** Training slots offered each working day, in IST. */
const TRAINING_TIMES = ['10:00', '14:30'];
/** At most this many requests may share one slot. */
const SLOT_CAPACITY = 3;

export interface BuzzerState {
  open: boolean;
  locked: boolean;
  roundNo: number;
  presses: { rank: number; studentId: string; name: string; at: string }[];
}

@Injectable()
export class ClassroomProfileService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---- Your profile / Your classrooms ------------------------------------------------------

  /** Every class the teacher is timetabled for or has taken: sessions count and last taken. */
  async classrooms(tx: Tx, teacherId: string) {
    const taken = await tx
      .select({
        sectionId: boardSessions.sectionId,
        subjectId: boardSessions.subjectId,
        sessions: sql<number>`count(*)::int`,
        lastTakenAt: sql<Date>`max(${boardSessions.startedAt})`,
      })
      .from(boardSessions)
      .where(and(eq(boardSessions.teacherId, teacherId), sql`${boardSessions.sectionId} is not null`))
      .groupBy(boardSessions.sectionId, boardSessions.subjectId);
    const slots = await tx
      .selectDistinct({ sectionId: timetableSlots.sectionId, subjectId: timetableSlots.subjectId })
      .from(timetableSlots)
      .where(and(eq(timetableSlots.teacherId, teacherId), isNull(timetableSlots.archivedAt)));
    const key = (s: string | null, j: string | null) => `${s}:${j}`;
    const rows = new Map<string, { sectionId: string; subjectId: string | null; sessions: number; lastTakenAt: Date | null }>();
    for (const t of taken) rows.set(key(t.sectionId, t.subjectId), { sectionId: t.sectionId as string, subjectId: t.subjectId, sessions: t.sessions, lastTakenAt: t.lastTakenAt ? new Date(t.lastTakenAt) : null });
    for (const s of slots) if (!rows.has(key(s.sectionId, s.subjectId))) rows.set(key(s.sectionId, s.subjectId), { sectionId: s.sectionId, subjectId: s.subjectId, sessions: 0, lastTakenAt: null });
    if (!rows.size) return [];
    const secs = await tx
      .select({ id: sections.id, name: sections.name, displayName: sections.displayName, term: sections.term, programName: programs.name })
      .from(sections)
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(inArray(sections.id, [...new Set([...rows.values()].map((r) => r.sectionId))]));
    const subjectIds = [...new Set([...rows.values()].map((r) => r.subjectId).filter((x): x is string => !!x))];
    const subs = subjectIds.length ? await tx.select({ id: subjects.id, name: subjects.name }).from(subjects).where(inArray(subjects.id, subjectIds)) : [];
    return [...rows.values()]
      .map((r) => {
        const sec = secs.find((s) => s.id === r.sectionId);
        return {
          sectionId: r.sectionId,
          section: sec?.name ?? '',
          standard: sec?.term ?? null,
          program: sec?.programName ?? '',
          className: sec?.displayName ?? '',
          subjectId: r.subjectId,
          subject: subs.find((s) => s.id === r.subjectId)?.name ?? null,
          sessions: r.sessions,
          lastTakenAt: r.lastTakenAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.lastTakenAt ?? '').localeCompare(a.lastTakenAt ?? '') || a.className.localeCompare(b.className));
  }

  /** "Open class": the board's current session switches to a class the teacher teaches. */
  async openClass(tx: Tx, tenantId: string, sessionId: string, teacherId: string, sectionId: string, subjectId: string | null) {
    const mine = (await this.classrooms(tx, teacherId)).some((c) => c.sectionId === sectionId && (subjectId == null || c.subjectId === subjectId));
    if (!mine) throw new ForbiddenException('You do not teach this class');
    await tx.update(boardSessions).set({ sectionId, subjectId, timetableSlotId: null }).where(and(eq(boardSessions.id, sessionId), isNull(boardSessions.endedAt)));
    await audit(tx, { tenantId, actorType: 'user', actorId: teacherId, action: 'board_session.class_opened', subjectType: 'board_session', subjectId: sessionId, data: { sectionId, subjectId } });
    const context = await this.sessions.context(tx, sessionId);
    return { ...context, roster: await this.sessions.roster(tx, sectionId) };
  }

  // ---- Schedule a training -----------------------------------------------------------------

  /** Open slots for the next five working days; a slot with enough requests is shown as taken. */
  async trainingSlots(tx: Tx) {
    const now = this.clock.now();
    const istNow = new Date(now.getTime() + 330 * 60_000);
    const out: { at: string; taken: boolean }[] = [];
    const day = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
    const counts = await tx
      .select({ slotAt: trainingRequests.slotAt, n: sql<number>`count(*)::int` })
      .from(trainingRequests)
      .where(and(gte(trainingRequests.slotAt, now), inArray(trainingRequests.status, ['requested', 'confirmed'])))
      .groupBy(trainingRequests.slotAt);
    for (let added = 0; added < 5; day.setUTCDate(day.getUTCDate() + 1)) {
      if (day.getUTCDay() === 0) continue;
      added += 1;
      for (const t of TRAINING_TIMES) {
        const [h, m] = t.split(':').map(Number);
        const at = new Date(day.getTime() + (h! * 60 + m!) * 60_000 - 330 * 60_000);
        if (at <= now) continue;
        out.push({ at: at.toISOString(), taken: (counts.find((c) => c.slotAt.getTime() === at.getTime())?.n ?? 0) >= SLOT_CAPACITY });
      }
    }
    return out;
  }

  async requestTraining(tx: Tx, tenantId: string, userId: string, deviceId: string | null, body: { slotAt: string; topic: string; notes?: string }) {
    const slot = new Date(body.slotAt);
    const offered = (await this.trainingSlots(tx)).find((s) => new Date(s.at).getTime() === slot.getTime());
    if (!offered) throw new BadRequestException('Pick one of the offered slots');
    if (offered.taken) throw new BadRequestException('That slot is full; pick another');
    const [row] = await tx
      .insert(trainingRequests)
      .values({ tenantId, requestedBy: userId, deviceId, slotAt: slot, topic: body.topic, notes: body.notes ?? '' })
      .returning();
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'training.requested', subjectType: 'training_request', subjectId: row!.id });
    return this.trainingView(row!);
  }

  trainingView(r: typeof trainingRequests.$inferSelect, requester?: string) {
    return { id: r.id, slotAt: r.slotAt.toISOString(), topic: r.topic, notes: r.notes, status: r.status, adminNote: r.adminNote, requestedBy: r.requestedBy, requester: requester ?? null, createdAt: r.createdAt.toISOString() };
  }

  async myTrainings(tx: Tx, userId: string) {
    const rows = await tx.select().from(trainingRequests).where(eq(trainingRequests.requestedBy, userId)).orderBy(desc(trainingRequests.slotAt)).limit(50);
    return rows.map((r) => this.trainingView(r));
  }

  async allTrainings(tx: Tx, status?: string) {
    const rows = await tx
      .select({ r: trainingRequests, who: users.fullName })
      .from(trainingRequests)
      .innerJoin(users, eq(users.id, trainingRequests.requestedBy))
      .where(status ? eq(trainingRequests.status, status) : undefined)
      .orderBy(asc(trainingRequests.slotAt))
      .limit(500);
    return rows.map((x) => this.trainingView(x.r, x.who));
  }

  async decideTraining(tx: Tx, tenantId: string, actorId: string, id: string, status: (typeof TRAINING_STATUSES)[number], adminNote?: string) {
    const [row] = await tx
      .update(trainingRequests)
      .set({ status, ...(adminNote !== undefined ? { adminNote } : {}) })
      .where(eq(trainingRequests.id, id))
      .returning();
    if (!row) throw new NotFoundException('Training request not found');
    await audit(tx, { tenantId, actorType: 'user', actorId, action: `training.${status}`, subjectType: 'training_request', subjectId: id });
    return this.trainingView(row);
  }

  // ---- End class ---------------------------------------------------------------------------

  /** Saves the notes, publishes them to the section's students, closes the session and returns a summary. */
  async endClass(tx: Tx, tenantId: string, sessionId: string, teacherId: string, body: { notes?: string; title?: string; publish?: boolean }) {
    const [s] = await tx.select().from(boardSessions).where(eq(boardSessions.id, sessionId));
    if (!s) throw new NotFoundException('Session not found');
    const [round] = await tx.select().from(buzzerRounds).where(eq(buzzerRounds.boardSessionId, sessionId));
    const [buzz] = await tx.select({ n: sql<number>`count(*)::int` }).from(buzzerPresses).where(eq(buzzerPresses.boardSessionId, sessionId));
    const [subject] = s.subjectId ? await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, s.subjectId)) : [];
    const [section] = s.sectionId ? await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, s.sectionId)) : [];
    const now = this.clock.now();
    const summary = {
      section: section?.name ?? null,
      subject: subject?.name ?? null,
      minutes: Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 60_000)),
      buzzerRounds: round?.roundNo ?? 0,
      buzzes: buzz?.n ?? 0,
    };
    const notes = (body.notes ?? '').trim();
    let shareToken: string | null = null;
    let published = false;
    if (notes) {
      const publish = !!body.publish && !!s.sectionId;
      const title = body.title?.trim() || [subject?.name, section?.name].filter(Boolean).join(' · ') || 'Class notes';
      const token = `${tenantId}.${randomBytes(18).toString('base64url')}`;
      const [saved] = await tx
        .insert(classNotes)
        .values({ tenantId, boardSessionId: sessionId, teacherId, sectionId: s.sectionId, subjectId: s.subjectId, title, notes, summary, publishedAt: publish ? now : null, shareToken: token })
        .onConflictDoUpdate({ target: classNotes.boardSessionId, set: { notes, title, summary, publishedAt: publish ? now : null } })
        .returning({ shareToken: classNotes.shareToken });
      shareToken = saved!.shareToken;
      published = publish;
      await audit(tx, { tenantId, actorType: 'user', actorId: teacherId, action: published ? 'class_notes.published' : 'class_notes.saved', subjectType: 'board_session', subjectId: sessionId });
    }
    await this.sessions.end(tx, tenantId, sessionId, 'teacher_ended', false);
    return { ended: true, notesSaved: !!notes, published, sharePath: shareToken ? `/v1/class-notes/${shareToken}` : null, summary };
  }

  /** The public page behind a shared link: the notes only when the teacher published them or chose to share. */
  async sharedNotes(token: string) {
    const tenantId = token.split('.')[0] ?? '';
    if (!/^[0-9a-f-]{36}$/.test(tenantId)) throw new NotFoundException();
    return this.db.withTenant(tenantId, async (tx) => {
      const [n] = await tx
        .select({ title: classNotes.title, notes: classNotes.notes, publishedAt: classNotes.publishedAt, createdAt: classNotes.createdAt, teacher: users.fullName })
        .from(classNotes)
        .innerJoin(users, eq(users.id, classNotes.teacherId))
        .where(eq(classNotes.shareToken, token));
      if (!n) throw new NotFoundException();
      return n;
    });
  }

  /** Published notes for a student's class, newest first. */
  async studentNotes(tx: Tx, userId: string) {
    const [me] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, userId));
    if (!me) return [];
    const rows = await tx
      .select({ id: classNotes.id, title: classNotes.title, notes: classNotes.notes, publishedAt: classNotes.publishedAt, teacher: users.fullName, shareToken: classNotes.shareToken })
      .from(classNotes)
      .innerJoin(users, eq(users.id, classNotes.teacherId))
      .where(and(eq(classNotes.sectionId, me.sectionId), sql`${classNotes.publishedAt} is not null`))
      .orderBy(desc(classNotes.publishedAt))
      .limit(50);
    return rows.map((r) => ({ ...r, publishedAt: r.publishedAt?.toISOString() ?? null }));
  }

  // ---- Buzzer ------------------------------------------------------------------------------

  async buzzerState(tx: Tx, sessionId: string): Promise<BuzzerState> {
    const [round] = await tx.select().from(buzzerRounds).where(eq(buzzerRounds.boardSessionId, sessionId));
    if (!round) return { open: false, locked: true, roundNo: 0, presses: [] };
    const rows = await tx
      .select({ studentId: buzzerPresses.studentUserId, seq: buzzerPresses.seq, at: buzzerPresses.pressedAt, name: users.fullName })
      .from(buzzerPresses)
      .innerJoin(users, eq(users.id, buzzerPresses.studentUserId))
      .where(and(eq(buzzerPresses.boardSessionId, sessionId), eq(buzzerPresses.roundNo, round.roundNo)))
      .orderBy(asc(buzzerPresses.seq));
    return { open: true, locked: round.locked, roundNo: round.roundNo, presses: rows.map((r) => ({ rank: r.seq, studentId: r.studentId, name: r.name, at: r.at.toISOString() })) };
  }

  private async deviceOf(tx: Tx, sessionId: string): Promise<string> {
    const [s] = await tx.select({ d: boardSessions.deviceId }).from(boardSessions).where(eq(boardSessions.id, sessionId));
    return s!.d;
  }

  private async push(tx: Tx, sessionId: string): Promise<BuzzerState> {
    const state = await this.buzzerState(tx, sessionId);
    this.realtime.toDevices([await this.deviceOf(tx, sessionId)], BUZZER_UPDATED, state);
    return state;
  }

  /** Teacher: open the buzzer for the class (locked or not) or lock it. */
  async setBuzzer(tx: Tx, tenantId: string, sessionId: string, locked: boolean): Promise<BuzzerState> {
    await tx.insert(buzzerRounds).values({ tenantId, boardSessionId: sessionId, locked }).onConflictDoUpdate({ target: buzzerRounds.boardSessionId, set: { locked } });
    return this.push(tx, sessionId);
  }

  /** Teacher: next question. Clears the order and unlocks. */
  async resetBuzzer(tx: Tx, tenantId: string, sessionId: string): Promise<BuzzerState> {
    await tx
      .insert(buzzerRounds)
      .values({ tenantId, boardSessionId: sessionId })
      .onConflictDoUpdate({ target: buzzerRounds.boardSessionId, set: { roundNo: sql`${buzzerRounds.roundNo} + 1`, locked: false } });
    return this.push(tx, sessionId);
  }

  /** The open board session of the student's class, if any. */
  async studentSession(tx: Tx, userId: string): Promise<string | null> {
    const [me] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, userId));
    if (!me) return null;
    const [s] = await tx
      .select({ id: boardSessions.id })
      .from(boardSessions)
      .where(and(eq(boardSessions.sectionId, me.sectionId), isNull(boardSessions.endedAt), gte(boardSessions.expiresAt, this.clock.now())))
      .orderBy(desc(boardSessions.startedAt))
      .limit(1);
    return s?.id ?? null;
  }

  /** What the student sees: whether the buzzer is open and their place. */
  async studentBuzzer(tx: Tx, userId: string) {
    const sessionId = await this.studentSession(tx, userId);
    if (!sessionId) return { active: false, locked: true, roundNo: 0, myRank: null as number | null, firstName: null as string | null };
    const st = await this.buzzerState(tx, sessionId);
    return {
      active: st.open,
      locked: st.locked,
      roundNo: st.roundNo,
      myRank: st.presses.find((p) => p.studentId === userId)?.rank ?? null,
      firstName: st.presses[0]?.name ?? null,
    };
  }

  /** A student presses. Order is decided under a row lock so two taps never share a rank. */
  async press(tx: Tx, tenantId: string, userId: string) {
    const sessionId = await this.studentSession(tx, userId);
    if (!sessionId) throw new BadRequestException('Your class is not on the board right now');
    const rows = await tx.execute(sql`select round_no, locked from buzzer_rounds where board_session_id = ${sessionId} for update`);
    const round = (rows as unknown as { rows?: { round_no: number; locked: boolean }[] }).rows?.[0] ?? (rows as unknown as { round_no: number; locked: boolean }[])[0];
    if (!round) throw new BadRequestException('The teacher has not opened the buzzer');
    if (round.locked) throw new BadRequestException('The buzzer is locked');
    const [c] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(buzzerPresses)
      .where(and(eq(buzzerPresses.boardSessionId, sessionId), eq(buzzerPresses.roundNo, round.round_no)));
    await tx
      .insert(buzzerPresses)
      .values({ tenantId, boardSessionId: sessionId, roundNo: round.round_no, studentUserId: userId, seq: (c?.n ?? 0) + 1 })
      .onConflictDoNothing();
    await this.push(tx, sessionId);
    return this.studentBuzzer(tx, userId);
  }
}
