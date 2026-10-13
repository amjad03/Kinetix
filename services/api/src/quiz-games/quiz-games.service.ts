import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  RealtimeEvents,
  type GameAnsweredEvent,
  type GameEndedEvent,
  type GameQuestionEvent,
  type GameRevealEvent,
  type QuizAnswerSource,
  type QuizGameStatus,
  type QuizGameView,
  type QuizQuestionInput,
  type QuizStanding,
  type StudentQuizGame,
} from '@kinetix/shared';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { answerCards, boardSessions, participationEvents, polls, qbQuestions, quizGameAnswers, quizGames, students, subjects, users } from '../db/schema.js';
import { headsSubject } from '../departments/departments.controller.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';
import { scoreGame, type Player } from './scoring.js';

/** An app answer this long after the countdown ends still counts (the phone's request was on its way). The board waits as long before it shows the answer on its own (live_quiz_game.dart quizAnswerGrace). */
export const ANSWER_GRACE_MS = 1500;
/** Shown between questions, on the board and on the phones. */
export const LEADERBOARD_SIZE = 5;
export const MAX_QUESTIONS = 50;

type Game = typeof quizGames.$inferSelect;
type Answer = typeof quizGameAnswers.$inferSelect;

export interface NewGame {
  title: string;
  questions: QuizQuestionInput[];
  cards: boolean;
}

/** A question the board may put in a game: from the subject's question bank, or asked in this class before. */
export interface QuizQuestionSuggestion extends Omit<QuizQuestionInput, 'seconds'> {
  source: 'bank' | 'class';
  topic: string | null;
}

/**
 * Live Quiz: a Kahoot-style game the teacher runs on the board. The board drives it over REST
 * (create, advance, cards, finish); the server keeps the clock, scores every answer and tells
 * the class over the realtime gateway (namespace `/realtime`, the student's user room and the
 * board's device room).
 *
 * Scoring (scoring.ts): a right answer is 500 points, plus up to 500 for speed when answered in
 * the Student App (500 × the share of the countdown left); printed answer cards score 500, without
 * the speed bonus. Each right answer in a row after the first adds 100 more, up to 500. Wrong
 * or no answer: 0, and the streak starts again.
 *
 * REST, board token:
 *   PUT  /v1/quiz-games/:id              {title, questions[{kind, question, options, correct, seconds}], cards} → QuizGameView (status lobby)
 *   POST /v1/quiz-games/:id/advance      {phase: 'question' | 'reveal', index} → QuizGameView; idempotent (asking again for the state the game is in returns it)
 *   POST /v1/quiz-games/:id/cards        {index, answers[{cardNo, choice}]} → {matched, unknown, answered}
 *   POST /v1/quiz-games/:id/finish       → QuizGameView (status finished, leaderboard = final standings)
 *   GET  /v1/quiz-games/:id, GET /v1/quiz-games/questions?topic= (question bank and past class questions)
 * REST, student token:
 *   POST /v1/quiz-games/:id/answer       {index, choice} → {index, choice}; the first answer is final; 400 after the countdown
 *   GET  /v1/student/quiz-game           → StudentQuizGame (to rejoin after a reconnect)
 * REST, staff: GET /v1/sections/:id/quiz-games, GET /v1/quiz-games/:id/results
 *
 * Realtime events (payload types in packages/shared/src/quiz-games.ts):
 *   `game.question` server → every student of the class: GameQuestionEvent. A question is open; no
 *       right answer in it. Count down from `closesAt` corrected by `serverNow`.
 *   `game.answered` server → the board: GameAnsweredEvent. One answer (app or card) and how many
 *       have answered. Students never get it.
 *   `game.reveal`   server → each student of the class: GameRevealEvent with `me` (their choice,
 *       points, score, rank, streak). The board gets the same, without `me`, as its advance reply.
 *   `game.ended`    server → each student of the class: GameEndedEvent with `me` (score, rank).
 * The phones never send a realtime event for the quiz; they answer over REST.
 */
@Injectable()
export class QuizGamesService {
  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly teacher: TeacherService,
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  // --- On the board --------------------------------------------------------------------------

  /** Creates the game in the board's class (idempotent by id). Any unfinished game there is finished. */
  async create(tx: Tx, p: BoardPrincipal, id: string, input: NewGame): Promise<QuizGameView> {
    const session = await this.activeSession(tx, p);
    if (!session.sectionId) throw new BadRequestException('Open a timetabled class to play a Live Quiz');
    const [had] = await tx.select().from(quizGames).where(eq(quizGames.id, id));
    if (had) {
      if (had.boardSessionId !== session.id) throw new NotFoundException('Game not found');
      return this.view(tx, had);
    }
    if (!input.questions.length || input.questions.length > MAX_QUESTIONS) throw new BadRequestException(`A game has 1 to ${MAX_QUESTIONS} questions`);
    for (const q of input.questions) {
      const n = q.kind === 'tf' ? 2 : q.options.length;
      if (q.kind === 'tf' && q.options.length !== 2) throw new BadRequestException('A true or false question has two answers');
      if (n < 2 || n > 4) throw new BadRequestException('A question has 2 to 4 answers');
      if (q.correct < 0 || q.correct >= n) throw new BadRequestException('The right answer is not one of the answers');
    }
    for (const open of await tx.select().from(quizGames).where(and(eq(quizGames.boardSessionId, session.id), ne(quizGames.status, 'finished')))) {
      await this.finish(tx, p, open.id);
    }
    const [game] = await tx
      .insert(quizGames)
      .values({
        id,
        tenantId: p.tenantId,
        boardSessionId: session.id,
        sectionId: session.sectionId,
        subjectId: session.subjectId,
        teacherId: session.teacherId,
        title: input.title.trim() || 'Live Quiz',
        questions: input.questions.map((q) => ({ kind: q.kind, question: q.question.trim(), options: q.options.map((o) => o.trim()), correct: q.correct, seconds: q.seconds })),
        cards: input.cards,
      })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'quiz_game.create', subjectType: 'quiz_game', subjectId: game.id, data: { questions: game.questions.length } });
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.QuizStarted, aggregateType: 'quiz_game', aggregateId: game.id, payload: { sectionId: game.sectionId, subjectId: game.subjectId, kind: 'game' } });
    return this.view(tx, game);
  }

  async get(tx: Tx, p: BoardPrincipal, id: string): Promise<QuizGameView> {
    return this.view(tx, await this.boardGame(tx, p, id));
  }

  /**
   * Moves the game on: `question` opens question [index] (the first from the lobby, the next after
   * a reveal) and starts its countdown; `reveal` closes the open question, scores it and shows the
   * right answer and the leaderboard. Asking for the state the game is already in returns it, so a
   * retry never skips a question.
   */
  async advance(tx: Tx, p: BoardPrincipal, id: string, phase: 'question' | 'reveal', index: number): Promise<QuizGameView> {
    let game = await this.boardGame(tx, p, id);
    if (game.currentIndex === index && game.status === phase) return this.view(tx, game);
    if (game.status === 'finished') throw new BadRequestException('This game is over');
    if (phase === 'question') {
      const fromLobby = game.status === 'lobby' && index === 0;
      const fromReveal = game.status === 'reveal' && index === game.currentIndex + 1;
      if (!(fromLobby || fromReveal) || index >= game.questions.length) throw new BadRequestException('That question cannot be opened now');
      const now = this.clock.now();
      const q = game.questions[index];
      [game] = await tx
        .update(quizGames)
        .set({ status: 'question', currentIndex: index, openedAt: now, closesAt: new Date(now.getTime() + q.seconds * 1000) })
        .where(eq(quizGames.id, game.id))
        .returning();
      const event: GameQuestionEvent = this.questionEvent(game);
      this.realtime.toUsers(await this.studentUsers(tx, game.sectionId), RealtimeEvents.GameQuestion, event);
      return this.view(tx, game);
    }
    if (game.status !== 'question' || game.currentIndex !== index) throw new BadRequestException('That question is not open');
    game = await this.reveal(tx, game);
    return this.view(tx, game);
  }

  /** Answers read from answer cards for the open question: card number → option index. A card read again replaces its earlier answer; app answers stay. */
  async cardAnswers(tx: Tx, p: BoardPrincipal, id: string, index: number, answers: { cardNo: number; choice: number }[]) {
    const game = await this.boardGame(tx, p, id);
    if (game.status !== 'question' || game.currentIndex !== index) throw new BadRequestException('That question is not open');
    const q = game.questions[index];
    const cardNos = [...new Set(answers.map((a) => a.cardNo))];
    const cards = cardNos.length
      ? await tx
          .select({ cardNo: answerCards.cardNo, studentId: answerCards.studentId })
          .from(answerCards)
          .innerJoin(students, eq(students.id, answerCards.studentId))
          .where(and(eq(answerCards.sectionId, game.sectionId), inArray(answerCards.cardNo, cardNos), eq(students.sectionId, game.sectionId)))
      : [];
    const byCard = new Map(cards.map((c) => [c.cardNo, c.studentId]));
    const matched: { cardNo: number; studentId: string }[] = [];
    const unknown: number[] = [];
    const now = this.clock.now();
    for (const a of answers) {
      const studentId = byCard.get(a.cardNo);
      if (!studentId || a.choice >= q.options.length) {
        unknown.push(a.cardNo);
        continue;
      }
      const values = { tenantId: game.tenantId, gameId: game.id, questionIndex: index, studentId, choice: a.choice, source: 'card' as const, elapsedMs: null, correct: a.choice === q.correct, answeredAt: now };
      const [saved] = await tx
        .insert(quizGameAnswers)
        .values(values)
        .onConflictDoUpdate({ target: [quizGameAnswers.gameId, quizGameAnswers.questionIndex, quizGameAnswers.studentId], set: { choice: values.choice, correct: values.correct, answeredAt: now }, setWhere: eq(quizGameAnswers.source, 'card') })
        .returning();
      if (saved) matched.push({ cardNo: a.cardNo, studentId });
    }
    const answered = await this.answeredCount(tx, game.id, index);
    const classSize = await this.classSize(tx, game.sectionId);
    const deviceId = await this.deviceOf(tx, game);
    for (const m of matched) {
      const choice = answers.find((a) => a.cardNo === m.cardNo)!.choice;
      const event: GameAnsweredEvent = { gameId: game.id, index, studentId: m.studentId, choice, source: 'card', elapsedMs: null, answered, classSize };
      this.realtime.toDevices([deviceId], RealtimeEvents.GameAnswered, event);
    }
    return { matched, unknown, answered };
  }

  /**
   * Ends the game: an open question is revealed first, the final standings are kept and every
   * answer becomes participation in the class history. A game ended before its first question
   * is cancelled. Idempotent.
   */
  async finish(tx: Tx, p: BoardPrincipal, id: string): Promise<QuizGameView> {
    let game = await this.boardGame(tx, p, id);
    if (game.status === 'finished') return this.view(tx, game);
    if (game.status === 'question') game = await this.reveal(tx, game);
    const revealed = game.currentIndex + 1;
    const { standings } = await this.score(tx, game, revealed);
    [game] = await tx.update(quizGames).set({ status: 'finished', standings, finishedAt: this.clock.now(), closesAt: null }).where(eq(quizGames.id, game.id)).returning();
    const answers = revealed ? await tx.select().from(quizGameAnswers).where(eq(quizGameAnswers.gameId, game.id)) : [];
    if (answers.length) {
      await tx.insert(participationEvents).values(
        answers.map((a) => {
          const q = game.questions[a.questionIndex];
          return {
            tenantId: game.tenantId,
            studentId: a.studentId,
            boardSessionId: game.boardSessionId,
            subjectId: game.subjectId,
            outcome: a.correct ? ('correct' as const) : ('incorrect' as const),
            note: `Live Quiz · ${game.title.slice(0, 80)} · Q${a.questionIndex + 1}: ${q.question.slice(0, 200)} → ${q.options[a.choice] ?? a.choice}`.slice(0, 500),
            recordedBy: game.teacherId,
            occurredAt: a.answeredAt,
          };
        }),
      );
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'quiz_game.finish', subjectType: 'quiz_game', subjectId: game.id, data: { revealed, answers: answers.length, players: standings.length } });
    const podium = standings.filter((s) => s.rank <= 3).slice(0, 3);
    const byStudent = new Map(standings.map((s) => [s.studentId, s]));
    for (const s of await this.studentsWithUsers(tx, game.sectionId)) {
      const mine = byStudent.get(s.id);
      const event: GameEndedEvent = { gameId: game.id, podium, cancelled: revealed === 0, me: { score: mine?.score ?? 0, rank: mine?.rank ?? null, correct: mine?.correct ?? 0, count: revealed } };
      this.realtime.toUsers([s.userId], RealtimeEvents.GameEnded, event);
    }
    return this.view(tx, game);
  }

  /** Questions the teacher can put in a game: approved multiple-choice questions of the subject's question bank (and the teacher's own drafts) and right-answer questions asked in this class before. */
  async suggestions(tx: Tx, p: BoardPrincipal, topic?: string): Promise<{ questions: QuizQuestionSuggestion[] }> {
    const session = await this.activeSession(tx, p);
    const out: QuizQuestionSuggestion[] = [];
    const want = topic?.trim().toLowerCase();
    if (session.subjectId) {
      const bank = await tx
        .select({ text: qbQuestions.text, options: qbQuestions.options, topic: qbQuestions.topic })
        .from(qbQuestions)
        .where(and(eq(qbQuestions.subjectId, session.subjectId), eq(qbQuestions.type, 'mcq'), or(eq(qbQuestions.status, 'approved'), eq(qbQuestions.authorId, session.teacherId))))
        .orderBy(desc(qbQuestions.updatedAt))
        .limit(200);
      for (const q of bank) {
        const right = q.options.findIndex((o) => o.correct);
        if (q.options.length < 2 || q.options.length > 4 || right < 0 || q.options.filter((o) => o.correct).length !== 1) continue;
        out.push({ source: 'bank', topic: q.topic, kind: 'mcq', question: q.text, options: q.options.map((o) => o.text), correct: right });
      }
    }
    if (session.sectionId) {
      const asked = await tx
        .select({ question: polls.question, options: polls.options, correct: polls.correct, topicCode: polls.topicCode })
        .from(polls)
        .where(and(eq(polls.sectionId, session.sectionId), eq(polls.kind, 'mcq'), isNotNull(polls.correct), isNotNull(polls.closedAt)))
        .orderBy(desc(polls.openedAt))
        .limit(30);
      const seen = new Set<string>();
      for (const q of asked) {
        if (!q.question || q.options.length < 2 || q.options.length > 4 || seen.has(q.question)) continue;
        seen.add(q.question);
        out.push({ source: 'class', topic: q.topicCode, kind: q.options.length === 2 && /^true$/i.test(q.options[0]) ? 'tf' : 'mcq', question: q.question, options: q.options, correct: Number(q.correct) });
      }
    }
    // Questions on the topic first, then the rest.
    if (want) out.sort((a, b) => Number(!(a.topic ?? '').toLowerCase().includes(want) && !a.question.toLowerCase().includes(want)) - Number(!(b.topic ?? '').toLowerCase().includes(want) && !b.question.toLowerCase().includes(want)));
    return { questions: out.slice(0, 60) };
  }

  // --- In the Student App --------------------------------------------------------------------

  /** A student answers the open question. The first answer is final; none after the countdown. */
  async answer(tx: Tx, p: UserPrincipal, id: string, index: number, choice: number): Promise<{ index: number; choice: number }> {
    const me = await this.me(tx, p);
    const game = await this.studentGame(tx, me.sectionId, id);
    const now = this.clock.now();
    if (game.status !== 'question' || game.currentIndex !== index || !game.openedAt || !game.closesAt || now.getTime() > game.closesAt.getTime() + ANSWER_GRACE_MS) {
      throw new BadRequestException('Time is up for this question');
    }
    const q = game.questions[index];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new BadRequestException('Pick one of the answers');
    const [had] = await tx
      .select({ choice: quizGameAnswers.choice })
      .from(quizGameAnswers)
      .where(and(eq(quizGameAnswers.gameId, game.id), eq(quizGameAnswers.questionIndex, index), eq(quizGameAnswers.studentId, me.id)));
    if (had) return { index, choice: had.choice };
    const elapsedMs = Math.min(q.seconds * 1000, Math.max(0, now.getTime() - game.openedAt.getTime()));
    await tx
      .insert(quizGameAnswers)
      .values({ tenantId: game.tenantId, gameId: game.id, questionIndex: index, studentId: me.id, choice, source: 'app', elapsedMs, correct: choice === q.correct, answeredAt: now })
      .onConflictDoNothing();
    const event: GameAnsweredEvent = { gameId: game.id, index, studentId: me.id, choice, source: 'app', elapsedMs, answered: await this.answeredCount(tx, game.id, index), classSize: await this.classSize(tx, game.sectionId) };
    this.realtime.toDevices([await this.deviceOf(tx, game)], RealtimeEvents.GameAnswered, event);
    return { index, choice };
  }

  /** The game running in the student's class now, if any (to rejoin after a reconnect). */
  async currentForStudent(tx: Tx, p: UserPrincipal): Promise<StudentQuizGame> {
    const me = await this.me(tx, p);
    const [row] = await tx
      .select({ game: quizGames })
      .from(quizGames)
      .innerJoin(boardSessions, eq(boardSessions.id, quizGames.boardSessionId))
      .where(and(eq(quizGames.sectionId, me.sectionId), ne(quizGames.status, 'finished'), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())))
      .orderBy(desc(quizGames.createdAt))
      .limit(1);
    if (!row) return { game: null, status: null, myChoice: null, score: 0 };
    const game = row.game;
    const mine = await tx.select().from(quizGameAnswers).where(and(eq(quizGameAnswers.gameId, game.id), eq(quizGameAnswers.studentId, me.id)));
    return {
      game: game.currentIndex >= 0 ? this.questionEvent(game) : null,
      status: game.status as QuizGameStatus,
      myChoice: mine.find((a) => a.questionIndex === game.currentIndex)?.choice ?? null,
      // Points are given when a question is revealed, so the open one adds nothing yet.
      score: mine.reduce((n, a) => n + a.points, 0),
    };
  }

  // --- For teachers, HODs and leaders later --------------------------------------------------

  /** Finished games of a class, newest first: its teachers, the principal and admins, and HODs for their subjects. */
  async forSection(tx: Tx, p: UserPrincipal, sectionId: string, limit = 30) {
    const teaches = isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, sectionId));
    const rows = await tx.select().from(quizGames).where(and(eq(quizGames.sectionId, sectionId), eq(quizGames.status, 'finished'))).orderBy(desc(quizGames.createdAt)).limit(limit);
    const visible: Game[] = [];
    for (const r of rows) if (teaches || (r.subjectId && (await headsSubject(tx, p, r.subjectId)))) visible.push(r);
    if (!teaches && visible.length === 0 && !p.roles.includes('hod')) throw new ForbiddenException('You do not teach this class');
    return {
      games: visible.map((g) => ({
        id: g.id,
        title: g.title,
        questions: g.questions.length,
        revealed: g.currentIndex + 1,
        players: g.standings?.length ?? 0,
        podium: (g.standings ?? []).filter((s) => s.rank <= 3).slice(0, 3),
        createdAt: g.createdAt.toISOString(),
        finishedAt: g.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  /** One game with everyone's answers, for its class's teachers and leaders. */
  async results(tx: Tx, p: UserPrincipal, id: string) {
    const [game] = await tx.select().from(quizGames).where(eq(quizGames.id, id));
    if (!game) throw new NotFoundException('Game not found');
    const allowed = isSchoolAdmin(p) || (await this.teacher.teachesSection(tx, p.userId, game.sectionId)) || (game.subjectId != null && (await headsSubject(tx, p, game.subjectId)));
    if (!allowed) throw new ForbiddenException('You do not teach this class');
    const answers = await tx
      .select({ index: quizGameAnswers.questionIndex, studentId: quizGameAnswers.studentId, fullName: students.fullName, rollNo: students.rollNo, choice: quizGameAnswers.choice, source: quizGameAnswers.source, correct: quizGameAnswers.correct, points: quizGameAnswers.points, elapsedMs: quizGameAnswers.elapsedMs })
      .from(quizGameAnswers)
      .innerJoin(students, eq(students.id, quizGameAnswers.studentId))
      .where(eq(quizGameAnswers.gameId, game.id))
      .orderBy(asc(quizGameAnswers.questionIndex), asc(students.rollNo));
    return { ...(await this.view(tx, game)), answers };
  }

  // --- Helpers -------------------------------------------------------------------------------

  /** Closes the open question, gives its answers their points and tells each student how they did. */
  private async reveal(tx: Tx, game: Game): Promise<Game> {
    const index = game.currentIndex;
    const [revealed] = await tx.update(quizGames).set({ status: 'reveal', closesAt: null }).where(eq(quizGames.id, game.id)).returning();
    const { standings, points } = await this.score(tx, revealed, index + 1);
    const answers = await tx.select().from(quizGameAnswers).where(and(eq(quizGameAnswers.gameId, game.id), eq(quizGameAnswers.questionIndex, index)));
    for (const a of answers) {
      const got = points.get(`${index}:${a.studentId}`) ?? 0;
      if (got !== a.points) await tx.update(quizGameAnswers).set({ points: got }).where(and(eq(quizGameAnswers.gameId, a.gameId), eq(quizGameAnswers.questionIndex, index), eq(quizGameAnswers.studentId, a.studentId)));
    }
    const base = await this.revealEvent(tx, revealed, index, answers, standings);
    const byStudent = new Map(standings.map((s) => [s.studentId, s]));
    const mine = new Map(answers.map((a) => [a.studentId, a]));
    for (const s of await this.studentsWithUsers(tx, game.sectionId)) {
      const a = mine.get(s.id);
      const st = byStudent.get(s.id);
      const event: GameRevealEvent = {
        ...base,
        me: { answered: !!a, choice: a?.choice ?? null, correct: !!a?.correct, points: points.get(`${index}:${s.id}`) ?? 0, score: st?.score ?? 0, rank: st?.rank ?? null, streak: st?.streak ?? 0 },
      };
      this.realtime.toUsers([s.userId], RealtimeEvents.GameReveal, event);
    }
    return revealed;
  }

  private async revealEvent(tx: Tx, game: Game, index: number, answers: Pick<Answer, 'choice'>[], standings: QuizStanding[]): Promise<GameRevealEvent> {
    const q = game.questions[index];
    const tally = q.options.map(() => 0);
    for (const a of answers) if (a.choice < tally.length) tally[a.choice]++;
    return { gameId: game.id, index, count: game.questions.length, correct: q.correct, tally, answered: answers.length, classSize: await this.classSize(tx, game.sectionId), leaderboard: standings.slice(0, LEADERBOARD_SIZE) };
  }

  private async score(tx: Tx, game: Game, revealed: number) {
    const answers = await tx.select().from(quizGameAnswers).where(eq(quizGameAnswers.gameId, game.id));
    const roster = await tx.select({ studentId: students.id, name: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.sectionId, game.sectionId));
    const players: Player[] = roster;
    return scoreGame(
      game.questions.map((q) => q.seconds),
      revealed,
      answers.map((a) => ({ index: a.questionIndex, studentId: a.studentId, correct: a.correct, source: a.source as QuizAnswerSource, elapsedMs: a.elapsedMs })),
      players,
    );
  }

  private questionEvent(game: Game): GameQuestionEvent {
    const q = game.questions[game.currentIndex];
    return {
      gameId: game.id,
      title: game.title,
      index: game.currentIndex,
      count: game.questions.length,
      kind: q.kind,
      question: q.question,
      options: q.options,
      seconds: q.seconds,
      openedAt: game.openedAt!.toISOString(),
      closesAt: (game.closesAt ?? game.openedAt!).toISOString(),
      serverNow: this.clock.now().toISOString(),
    };
  }

  async view(tx: Tx, game: Game): Promise<QuizGameView> {
    const [teacher] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, game.teacherId));
    const [subject] = game.subjectId ? await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, game.subjectId)) : [];
    const answers = await tx.select({ index: quizGameAnswers.questionIndex, choice: quizGameAnswers.choice }).from(quizGameAnswers).where(eq(quizGameAnswers.gameId, game.id));
    // Revealed questions carry their tally; the open one does not (the class has not seen it yet).
    const revealedUpTo = game.status === 'question' ? game.currentIndex : game.currentIndex + 1;
    const leaderboard = game.status === 'finished' ? (game.standings ?? []) : (await this.score(tx, game, revealedUpTo)).standings.slice(0, LEADERBOARD_SIZE);
    return {
      id: game.id,
      title: game.title,
      status: game.status as QuizGameStatus,
      index: game.currentIndex,
      count: game.questions.length,
      cards: game.cards,
      questions: game.questions.map((q, i) => {
        if (i >= revealedUpTo) return q;
        const tally = q.options.map(() => 0);
        for (const a of answers) if (a.index === i && a.choice < tally.length) tally[a.choice]++;
        return { ...q, tally };
      }),
      openedAt: game.openedAt?.toISOString() ?? null,
      closesAt: game.closesAt?.toISOString() ?? null,
      createdAt: game.createdAt.toISOString(),
      finishedAt: game.finishedAt?.toISOString() ?? null,
      sectionId: game.sectionId,
      subject: subject?.name ?? null,
      teacher: teacher?.fullName ?? '',
      classSize: await this.classSize(tx, game.sectionId),
      answered: game.currentIndex >= 0 ? answers.filter((a) => a.index === game.currentIndex).length : 0,
      leaderboard,
    };
  }

  private async activeSession(tx: Tx, p: BoardPrincipal) {
    const [s] = await tx
      .select()
      .from(boardSessions)
      .where(and(eq(boardSessions.id, p.sessionId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
    if (!s) throw new ForbiddenException('This class has ended');
    return s;
  }

  /**
   * A game played on this board in its current class. Its row stays locked to the end of the
   * request, so a reveal waits for an answer being saved (and the other way round): no answer is
   * left out of a reveal's tally and points.
   */
  private async boardGame(tx: Tx, p: BoardPrincipal, id: string): Promise<Game> {
    const [game] = await tx.select().from(quizGames).where(eq(quizGames.id, id)).for('update');
    if (!game || game.boardSessionId !== p.sessionId) throw new NotFoundException('Game not found');
    return game;
  }

  /** A game of the student's class whose board class is still on, locked like boardGame's. */
  private async studentGame(tx: Tx, sectionId: string, id: string): Promise<Game> {
    const [row] = await tx
      .select({ game: quizGames, endedAt: boardSessions.endedAt, expiresAt: boardSessions.expiresAt })
      .from(quizGames)
      .innerJoin(boardSessions, eq(boardSessions.id, quizGames.boardSessionId))
      .where(eq(quizGames.id, id))
      .for('update', { of: quizGames });
    if (!row || row.game.sectionId !== sectionId) throw new NotFoundException('Game not found');
    if (row.endedAt || row.expiresAt <= this.clock.now()) throw new BadRequestException('Time is up for this question');
    return row.game;
  }

  private async deviceOf(tx: Tx, game: Game): Promise<string> {
    const [s] = await tx.select({ deviceId: boardSessions.deviceId }).from(boardSessions).where(eq(boardSessions.id, game.boardSessionId));
    return s.deviceId;
  }

  private async me(tx: Tx, p: UserPrincipal) {
    const [me] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
    if (!me) throw new ForbiddenException('Only students play the Live Quiz');
    return me;
  }

  private async studentsWithUsers(tx: Tx, sectionId: string): Promise<{ id: string; userId: string }[]> {
    const rows = await tx
      .select({ id: students.id, userId: students.userId })
      .from(students)
      .where(and(eq(students.sectionId, sectionId), eq(students.status, 'active'), isNotNull(students.userId)));
    return rows.map((r) => ({ id: r.id, userId: r.userId! }));
  }

  private async studentUsers(tx: Tx, sectionId: string): Promise<string[]> {
    return (await this.studentsWithUsers(tx, sectionId)).map((s) => s.userId);
  }

  private async classSize(tx: Tx, sectionId: string): Promise<number> {
    const [size] = await tx.select({ n: count() }).from(students).where(and(eq(students.sectionId, sectionId), eq(students.status, 'active')));
    return size?.n ?? 0;
  }

  private async answeredCount(tx: Tx, gameId: string, index: number): Promise<number> {
    const [n] = await tx.select({ n: count() }).from(quizGameAnswers).where(and(eq(quizGameAnswers.gameId, gameId), eq(quizGameAnswers.questionIndex, index)));
    return n?.n ?? 0;
  }
}
