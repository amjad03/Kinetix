import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeEvents, type AnswerCardSheet, type PollAnswerSource, type PollAnsweredEvent, type PollKind, type PollResults, type PollTally, type PollView } from '@kinetix/shared';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { answerCards, boardSessions, participationEvents, pollResponses, polls, sections, students, subjects, users } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';

/** Printed answer cards per class (packages/kinetix_cards has 100 distinct patterns). */
export const MAX_CARDS = 100;

export interface NewPoll {
  kind: PollKind;
  question: string;
  options: string[];
  correct?: string | null;
  topicCode?: string | null;
}

type Poll = typeof polls.$inferSelect;

/** A numeric answer as stored: the number in plain form ("0.50" → "0.5"), or null when it is not one. */
export function normaliseNumber(raw: string): string | null {
  const s = raw.trim().replace(/,/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

/** A word-cloud answer as stored: one to three words, trimmed and lower-case (so "Photosynthesis " and
 * "photosynthesis" count together), at most 40 characters; null when there is nothing to count. */
export function normaliseWord(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!s || s.length > 40 || s.split(' ').length > 3 || !/[\p{L}\p{N}]/u.test(s)) return null;
  return s;
}

/** Whether [answer] is right, or null when the question has no right answer. */
export function isCorrect(poll: Pick<Poll, 'kind' | 'correct'>, answer: string): boolean | null {
  if (poll.correct == null) return null;
  if (poll.kind === 'mcq') return answer === poll.correct;
  const a = Number(answer);
  const b = Number(poll.correct);
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
}

/**
 * Card numbers for the students of a class who have none yet: the number in their roll number
 * when it is free ("U03BC007" → 7), otherwise the lowest free one. Existing cards never change.
 */
export function assignCards(roster: { id: string; rollNo: string }[], taken: Map<number, string>): { cardNo: number; studentId: string }[] {
  const hasCard = new Set(taken.values());
  const used = new Set(taken.keys());
  const waiting = roster.filter((s) => !hasCard.has(s.id));
  const out: { cardNo: number; studentId: string }[] = [];
  const rest: typeof waiting = [];
  for (const s of waiting) {
    const n = Number(/(\d+)\D*$/.exec(s.rollNo)?.[1] ?? NaN);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_CARDS && !used.has(n)) {
      used.add(n);
      out.push({ cardNo: n, studentId: s.id });
    } else {
      rest.push(s);
    }
  }
  let next = 1;
  for (const s of rest) {
    while (used.has(next)) next++;
    if (next > MAX_CARDS) break;
    used.add(next);
    out.push({ cardNo: next, studentId: s.id });
  }
  return out;
}

/**
 * "Ask the class": questions the teacher asks on the board, answered in the Student App or by
 * holding up printed answer cards that the board's camera reads. Closing a question records
 * every answer as a participation event, so it shows in class history, the HOD's view and the
 * parent app.
 */
@Injectable()
export class PollsService {
  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly teacher: TeacherService,
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  // --- Answer cards --------------------------------------------------------------------------

  /** The class's cards, handing out numbers to students who have none yet. */
  async cardSheet(tx: Tx, tenantId: string, sectionId: string): Promise<AnswerCardSheet> {
    const [section] = await tx.select({ id: sections.id, displayName: sections.displayName }).from(sections).where(eq(sections.id, sectionId));
    if (!section) throw new NotFoundException('Class not found');
    const roster = await tx
      .select({ id: students.id, rollNo: students.rollNo, fullName: students.fullName })
      .from(students)
      .where(and(eq(students.sectionId, sectionId), eq(students.status, 'active')))
      .orderBy(asc(students.rollNo));
    const existing = await tx.select({ cardNo: answerCards.cardNo, studentId: answerCards.studentId }).from(answerCards).where(eq(answerCards.sectionId, sectionId));
    const fresh = assignCards(roster, new Map(existing.map((c) => [c.cardNo, c.studentId])));
    if (fresh.length) await tx.insert(answerCards).values(fresh.map((c) => ({ ...c, tenantId, sectionId }))).onConflictDoNothing();
    const byStudent = new Map(roster.map((s) => [s.id, s]));
    const cards = [...existing, ...fresh]
      .filter((c) => byStudent.has(c.studentId))
      .map((c) => ({ cardNo: c.cardNo, studentId: c.studentId, rollNo: byStudent.get(c.studentId)!.rollNo, fullName: byStudent.get(c.studentId)!.fullName }))
      .sort((a, b) => a.cardNo - b.cardNo);
    return { section, cards };
  }

  /** The cards of the class open on the board (none for a class without a section). */
  async boardCardSheet(tx: Tx, p: BoardPrincipal): Promise<AnswerCardSheet | { section: null; cards: [] }> {
    const session = await this.activeSession(tx, p);
    return session.sectionId ? this.cardSheet(tx, p.tenantId, session.sectionId) : { section: null, cards: [] };
  }

  // --- On the board --------------------------------------------------------------------------

  /** Opens a question in the board's class (idempotent by id). Any other open question there is closed. */
  async open(tx: Tx, p: BoardPrincipal, id: string, input: NewPoll): Promise<PollResults> {
    const session = await this.activeSession(tx, p);
    if (!session.sectionId) throw new BadRequestException('Open a timetabled class to ask it a question');
    const [had] = await tx.select().from(polls).where(eq(polls.id, id));
    if (had) {
      if (had.boardSessionId !== session.id) throw new NotFoundException('Question not found');
      return this.results(tx, had);
    }
    const options = input.kind === 'mcq' ? input.options : [];
    if (input.kind === 'mcq' && (options.length < 2 || options.length > 6)) throw new BadRequestException('A question needs 2 to 6 answers');
    // A word cloud has no right answer.
    let correct = input.kind === 'word' ? null : (input.correct ?? null);
    if (correct != null) {
      correct = input.kind === 'mcq' ? (/^\d$/.test(correct) && Number(correct) < options.length ? correct : null) : normaliseNumber(correct);
      if (correct == null) throw new BadRequestException('The right answer is not one of the answers');
    }
    for (const open of await tx.select().from(polls).where(and(eq(polls.boardSessionId, session.id), isNull(polls.closedAt)))) {
      await this.close(tx, p, open.id);
    }
    const [poll] = await tx
      .insert(polls)
      .values({
        id,
        tenantId: p.tenantId,
        boardSessionId: session.id,
        sectionId: session.sectionId,
        subjectId: session.subjectId,
        teacherId: session.teacherId,
        kind: input.kind,
        question: input.question.trim(),
        options,
        correct,
        topicCode: input.topicCode ?? null,
        openedAt: this.clock.now(),
      })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'poll.open', subjectType: 'poll', subjectId: poll.id });
    // A question with a right answer is a quiz: announce it so the OBE and analytics consumers can follow.
    if (poll.correct !== null) await this.events.emit(tx, p.tenantId, { type: DomainEvents.QuizStarted, aggregateType: 'poll', aggregateId: poll.id, payload: { sectionId: poll.sectionId, subjectId: poll.subjectId, kind: poll.kind } });
    const view = await this.view(tx, poll);
    this.realtime.toUsers(await this.studentUsers(tx, poll.sectionId), RealtimeEvents.PollOpened, view);
    return this.results(tx, poll);
  }

  /** Answers read from answer cards: card number → option index. Unknown cards are reported back. */
  async cardAnswers(tx: Tx, p: BoardPrincipal, id: string, answers: { cardNo: number; choice: number }[]) {
    const poll = await this.boardPoll(tx, p, id);
    if (poll.closedAt) throw new BadRequestException('This question is closed');
    if (poll.kind !== 'mcq') throw new BadRequestException('Answer cards are for multiple-choice questions');
    const cardNos = [...new Set(answers.map((a) => a.cardNo))];
    const cards = cardNos.length
      ? await tx
          .select({ cardNo: answerCards.cardNo, studentId: answerCards.studentId })
          .from(answerCards)
          .innerJoin(students, eq(students.id, answerCards.studentId))
          .where(and(eq(answerCards.sectionId, poll.sectionId), inArray(answerCards.cardNo, cardNos), eq(students.sectionId, poll.sectionId)))
      : [];
    const byCard = new Map(cards.map((c) => [c.cardNo, c.studentId]));
    const matched: { cardNo: number; studentId: string }[] = [];
    const unknown: number[] = [];
    for (const a of answers) {
      const studentId = byCard.get(a.cardNo);
      if (!studentId || a.choice >= poll.options.length) {
        unknown.push(a.cardNo);
        continue;
      }
      await this.saveAnswer(tx, poll, studentId, String(a.choice), 'card');
      matched.push({ cardNo: a.cardNo, studentId });
    }
    const tally = await this.tally(tx, poll);
    for (const m of matched) {
      const answer = String(answers.find((a) => a.cardNo === m.cardNo)!.choice);
      this.notifyBoard(p.deviceId, { pollId: poll.id, studentId: m.studentId, answer, source: 'card', tally });
    }
    return { matched, unknown, tally };
  }

  /** Closes the question and records everyone's answer as participation. Idempotent. */
  async close(tx: Tx, p: BoardPrincipal, id: string): Promise<PollResults> {
    const poll = await this.boardPoll(tx, p, id);
    const [closed] = await tx
      .update(polls)
      .set({ closedAt: this.clock.now() })
      .where(and(eq(polls.id, poll.id), isNull(polls.closedAt)))
      .returning();
    if (!closed) return this.results(tx, poll);
    const responses = await tx.select().from(pollResponses).where(eq(pollResponses.pollId, poll.id));
    if (responses.length) {
      await tx.insert(participationEvents).values(
        responses.map((r) => {
          const right = isCorrect(poll, r.answer);
          return {
            tenantId: p.tenantId,
            studentId: r.studentId,
            boardSessionId: poll.boardSessionId,
            subjectId: poll.subjectId,
            topicCode: poll.topicCode,
            pollId: poll.id,
            outcome: right == null ? ('answered' as const) : right ? ('correct' as const) : ('incorrect' as const),
            note: `${poll.question.slice(0, 200)} → ${this.label(poll, r.answer)}`.slice(0, 500),
            recordedBy: poll.teacherId,
            occurredAt: r.answeredAt,
          };
        }),
      );
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'poll.close', subjectType: 'poll', subjectId: poll.id, data: { responses: responses.length } });
    this.realtime.toUsers(await this.studentUsers(tx, poll.sectionId), RealtimeEvents.PollClosed, { pollId: poll.id });
    return this.results(tx, closed);
  }

  async boardResults(tx: Tx, p: BoardPrincipal, id: string): Promise<PollResults> {
    return this.results(tx, await this.boardPoll(tx, p, id));
  }

  // --- In the Student App --------------------------------------------------------------------

  /** The question open in the student's class right now, if any (the "Live question" banner). */
  async currentForStudent(tx: Tx, p: UserPrincipal): Promise<PollView | null> {
    const me = await this.me(tx, p);
    const [poll] = await tx
      .select({ poll: polls })
      .from(polls)
      .innerJoin(boardSessions, eq(boardSessions.id, polls.boardSessionId))
      .where(and(eq(polls.sectionId, me.sectionId), isNull(polls.closedAt), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())))
      .orderBy(desc(polls.openedAt))
      .limit(1);
    if (!poll) return null;
    const [mine] = await tx.select({ answer: pollResponses.answer }).from(pollResponses).where(and(eq(pollResponses.pollId, poll.poll.id), eq(pollResponses.studentId, me.id)));
    return { ...(await this.view(tx, poll.poll)), myAnswer: mine?.answer ?? null };
  }

  async answer(tx: Tx, p: UserPrincipal, id: string, raw: string): Promise<{ answer: string }> {
    const me = await this.me(tx, p);
    const [row] = await tx
      .select({ poll: polls, deviceId: boardSessions.deviceId, endedAt: boardSessions.endedAt, expiresAt: boardSessions.expiresAt })
      .from(polls)
      .innerJoin(boardSessions, eq(boardSessions.id, polls.boardSessionId))
      .where(eq(polls.id, id));
    if (!row || row.poll.sectionId !== me.sectionId) throw new NotFoundException('Question not found');
    if (row.poll.closedAt || row.endedAt || row.expiresAt <= this.clock.now()) throw new BadRequestException('This question is closed');
    const poll = row.poll;
    const answer =
      poll.kind === 'mcq' ? (/^\d$/.test(raw.trim()) && Number(raw) < poll.options.length ? raw.trim() : null) : poll.kind === 'word' ? normaliseWord(raw) : normaliseNumber(raw);
    if (answer == null) throw new BadRequestException(poll.kind === 'mcq' ? 'Pick one of the answers' : poll.kind === 'word' ? 'Type one to three words' : 'Type a number');
    await this.saveAnswer(tx, poll, me.id, answer, 'app');
    this.notifyBoard(row.deviceId, { pollId: poll.id, studentId: me.id, answer, source: 'app', tally: await this.tally(tx, poll) });
    return { answer };
  }

  // --- For teachers, HODs and leaders later --------------------------------------------------

  /** Questions asked in a class, newest first: its teachers, the principal and admins, and HODs for their subjects. */
  async forSection(tx: Tx, p: UserPrincipal, sectionId: string, limit = 30): Promise<PollResults[]> {
    const teaches = isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, sectionId));
    const rows = await tx.select().from(polls).where(and(eq(polls.sectionId, sectionId), isNotNull(polls.closedAt))).orderBy(desc(polls.openedAt)).limit(limit);
    const visible: Poll[] = [];
    for (const r of rows) if (teaches || (r.subjectId && (await headsSubject(tx, p, r.subjectId)))) visible.push(r);
    if (!teaches && visible.length === 0 && !p.roles.includes('hod')) throw new ForbiddenException('You do not teach this class');
    return Promise.all(visible.map((r) => this.results(tx, r)));
  }

  // --- Helpers -------------------------------------------------------------------------------

  private async saveAnswer(tx: Tx, poll: Poll, studentId: string, answer: string, source: PollAnswerSource) {
    const answeredAt = this.clock.now();
    await tx
      .insert(pollResponses)
      .values({ tenantId: poll.tenantId, pollId: poll.id, studentId, answer, source, answeredAt })
      .onConflictDoUpdate({ target: [pollResponses.pollId, pollResponses.studentId], set: { answer, source, answeredAt } });
  }

  private notifyBoard(deviceId: string, event: PollAnsweredEvent) {
    this.realtime.toDevices([deviceId], RealtimeEvents.PollAnswered, event);
  }

  private async activeSession(tx: Tx, p: BoardPrincipal) {
    const [s] = await tx
      .select()
      .from(boardSessions)
      .where(and(eq(boardSessions.id, p.sessionId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
    if (!s) throw new ForbiddenException('This class has ended');
    return s;
  }

  /** A question asked on this board in its current class. */
  private async boardPoll(tx: Tx, p: BoardPrincipal, id: string): Promise<Poll> {
    const [poll] = await tx.select().from(polls).where(eq(polls.id, id));
    if (!poll || poll.boardSessionId !== p.sessionId) throw new NotFoundException('Question not found');
    return poll;
  }

  private async me(tx: Tx, p: UserPrincipal) {
    const [me] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
    if (!me) throw new ForbiddenException('Only students answer class questions');
    return me;
  }

  private async studentUsers(tx: Tx, sectionId: string): Promise<string[]> {
    const rows = await tx
      .select({ userId: students.userId })
      .from(students)
      .where(and(eq(students.sectionId, sectionId), eq(students.status, 'active'), isNotNull(students.userId)));
    return rows.map((r) => r.userId!);
  }

  private label(poll: Poll, answer: string): string {
    return poll.kind === 'mcq' ? (poll.options[Number(answer)] ?? answer) : answer;
  }

  private async tally(tx: Tx, poll: Poll): Promise<PollTally> {
    const rows = await tx.select({ answer: pollResponses.answer, n: count() }).from(pollResponses).where(eq(pollResponses.pollId, poll.id)).groupBy(pollResponses.answer);
    const [size] = await tx.select({ n: count() }).from(students).where(and(eq(students.sectionId, poll.sectionId), eq(students.status, 'active')));
    const answers: Record<string, number> = {};
    if (poll.kind === 'mcq') poll.options.forEach((_, i) => (answers[String(i)] = 0));
    for (const r of rows) answers[r.answer] = r.n;
    return { answers, total: rows.reduce((a, r) => a + r.n, 0), classSize: size?.n ?? 0 };
  }

  private async view(tx: Tx, poll: Poll): Promise<PollView> {
    const [teacher] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, poll.teacherId));
    const [subject] = poll.subjectId ? await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, poll.subjectId)) : [];
    return {
      id: poll.id,
      kind: poll.kind,
      question: poll.question,
      options: poll.options,
      openedAt: poll.openedAt.toISOString(),
      closedAt: poll.closedAt?.toISOString() ?? null,
      subject: subject?.name ?? null,
      teacher: teacher?.fullName ?? '',
    };
  }

  /** A question with its tally and every response. */
  async results(tx: Tx, poll: Poll): Promise<PollResults> {
    const responses = await tx
      .select({ studentId: pollResponses.studentId, rollNo: students.rollNo, fullName: students.fullName, answer: pollResponses.answer, source: pollResponses.source })
      .from(pollResponses)
      .innerJoin(students, eq(students.id, pollResponses.studentId))
      .where(eq(pollResponses.pollId, poll.id))
      .orderBy(asc(students.rollNo));
    return {
      ...(await this.view(tx, poll)),
      correct: poll.correct,
      tally: await this.tally(tx, poll),
      responses: responses.map((r) => ({ ...r, correct: isCorrect(poll, r.answer) })),
    };
  }
}
