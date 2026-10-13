import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type GameAnsweredEvent, type GameEndedEvent, type GameQuestionEvent, type GameRevealEvent, type QuizGameView, type StudentQuizGame } from '@kinetix/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

const next = <T>(s: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), ms);
    s.once(event, (v: T) => {
      clearTimeout(timer);
      resolve(v);
    });
  });

const questions = [
  { kind: 'mcq', question: 'Which share is redeemable?', options: ['Equity', 'Preference', 'Bonus', 'Rights'], correct: 1, seconds: 20 },
  { kind: 'tf', question: 'Goodwill is an asset.', options: ['True', 'False'], correct: 0, seconds: 10 },
];

describe('Live Quiz', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const later = (ms: number) => (clock.at = new Date(clock.at.getTime() + ms));
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let board: Socket;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const connect = async (token: string) => {
    const s = io(`${url}/realtime`, { auth: { token }, transports: ['websocket'] });
    sockets.push(s);
    await next(s, 'ready');
    return s;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    board = paired.socket;
    tokens.board = paired.boardToken;
    // The class's answer cards: R1 → 1, R2 → 2, R3 (the student with the app) → 3.
    await http().get('/v1/answer-cards/current').set(as('board')).expect(200);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    board.disconnect();
    await app.close();
    await owner.end();
  });

  it('checks the questions it is given', async () => {
    const bad = (q: object) => http().put(`/v1/quiz-games/${randomUUID()}`).set(as('board')).send({ questions: [{ ...questions[0], ...q }] }).expect(400);
    await bad({ correct: 3, options: ['A', 'B'] });
    await bad({ options: ['A'] });
    await bad({ kind: 'tf', options: ['True', 'False', 'Maybe'], correct: 0 });
    await bad({ seconds: 15 });
    await http().put(`/v1/quiz-games/${randomUUID()}`).set(as('board')).send({ questions: [] }).expect(400);
    await http().put(`/v1/quiz-games/${randomUUID()}`).set(as('student')).send({ questions }).expect(403);
  });

  it('plays a game: questions reach the class, app answers score for speed, cards without it, then a podium', async () => {
    const student = await connect(tokens.student);
    const id = randomUUID();
    const created = (await http().put(`/v1/quiz-games/${id}`).set(as('board')).send({ title: 'Shares', questions, cards: true }).expect(200)).body as QuizGameView;
    expect(created).toMatchObject({ id, status: 'lobby', index: -1, count: 2, cards: true, classSize: 3, subject: 'Corporate Accounting' });
    // The same id again is the same game.
    expect((await http().put(`/v1/quiz-games/${id}`).set(as('board')).send({ title: 'Shares', questions }).expect(200)).body.id).toBe(id);
    // A question cannot be revealed or skipped to before it opens.
    await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'reveal', index: 0 }).expect(400);
    await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'question', index: 1 }).expect(400);

    // Question 1 opens: the phone gets it without the right answer.
    const asked = next<GameQuestionEvent>(student, RealtimeEvents.GameQuestion);
    const q1 = (await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'question', index: 0 }).expect(200)).body as QuizGameView;
    expect(q1).toMatchObject({ status: 'question', index: 0, answered: 0 });
    const event = await asked;
    expect(event).toMatchObject({ gameId: id, index: 0, count: 2, question: 'Which share is redeemable?', options: questions[0].options, seconds: 20 });
    expect(event).not.toHaveProperty('correct');
    expect(new Date(event.closesAt).getTime() - new Date(event.openedAt).getTime()).toBe(20_000);
    // Asking for the open question again changes nothing (a retry).
    await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'question', index: 0 }).expect(200);

    const rejoin = (await http().get('/v1/student/quiz-game').set(as('student')).expect(200)).body as StudentQuizGame;
    expect(rejoin).toMatchObject({ status: 'question', myChoice: null, game: { gameId: id, index: 0 } });

    // The student answers 5 s in: right. The board hears it; a second answer does not change it.
    later(5000);
    const heard = next<GameAnsweredEvent>(board, RealtimeEvents.GameAnswered);
    await http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 0, choice: 1 }).expect(200);
    expect(await heard).toMatchObject({ gameId: id, index: 0, studentId: t.students[2].id, choice: 1, source: 'app', elapsedMs: 5000, answered: 1, classSize: 3 });
    expect((await http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 0, choice: 2 }).expect(200)).body).toEqual({ index: 0, choice: 1 });
    await http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 0, choice: 7 }).expect(400);
    await http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 1, choice: 0 }).expect(400);

    // Cards after the countdown: card 1 right, card 2 wrong (then read again, right), card 3 cannot replace the app answer, card 9 is nobody's.
    later(30_000);
    const cards = (await http().post(`/v1/quiz-games/${id}/cards`).set(as('board')).send({ index: 0, answers: [{ cardNo: 1, choice: 1 }, { cardNo: 2, choice: 0 }, { cardNo: 3, choice: 0 }, { cardNo: 9, choice: 1 }] }).expect(200)).body;
    expect(cards.unknown).toEqual([9]);
    expect(cards.matched.map((m: { cardNo: number }) => m.cardNo)).toEqual([1, 2]);
    expect(cards.answered).toBe(3);
    await http().post(`/v1/quiz-games/${id}/cards`).set(as('board')).send({ index: 0, answers: [{ cardNo: 2, choice: 1 }] }).expect(200);
    // Too late in the app.
    await http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 0, choice: 1 }).expect(400);

    // Reveal: the right answer, the tally and the leaderboard; the student hears how they did.
    const revealed = next<GameRevealEvent>(student, RealtimeEvents.GameReveal);
    const r1 = (await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'reveal', index: 0 }).expect(200)).body as QuizGameView;
    expect(r1.status).toBe('reveal');
    expect(r1.questions[0].tally).toEqual([0, 3, 0, 0]);
    expect(r1.leaderboard.map((s) => [s.name, s.score, s.rank])).toEqual([
      ['Student C', 875, 1],
      ['Student A', 500, 2],
      ['Student B', 500, 2],
    ]);
    const mine = await revealed;
    expect(mine).toMatchObject({ gameId: id, index: 0, correct: 1, tally: [0, 3, 0, 0], answered: 3, classSize: 3 });
    expect(mine.me).toEqual({ answered: true, choice: 1, correct: true, points: 875, score: 875, rank: 1, streak: 1 });
    expect(mine.leaderboard).toHaveLength(3);
    // No more cards once revealed.
    await http().post(`/v1/quiz-games/${id}/cards`).set(as('board')).send({ index: 0, answers: [{ cardNo: 1, choice: 0 }] }).expect(400);

    // Question 2: the student answers at once, right again (streak bonus); card 1 is wrong.
    await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'question', index: 1 }).expect(200);
    await http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 1, choice: 0 }).expect(200);
    await http().post(`/v1/quiz-games/${id}/cards`).set(as('board')).send({ index: 1, answers: [{ cardNo: 1, choice: 1 }] }).expect(200);

    // Finishing reveals the open question first, keeps the standings and tells the class.
    const ended = next<GameEndedEvent>(student, RealtimeEvents.GameEnded);
    const done = (await http().post(`/v1/quiz-games/${id}/finish`).set(as('board')).expect(200)).body as QuizGameView;
    expect(done).toMatchObject({ status: 'finished', index: 1 });
    expect(done.questions[1].tally).toEqual([1, 1]);
    expect(done.leaderboard.map((s) => [s.name, s.score, s.rank, s.streak])).toEqual([
      ['Student C', 875 + 1000 + 100, 1, 2],
      // A tie (one right card answer each, A's on the first question, B's read again) shares second place.
      ['Student A', 500, 2, 0],
      ['Student B', 500, 2, 0],
    ]);
    expect(await ended).toMatchObject({ gameId: id, cancelled: false, me: { score: 1975, rank: 1, correct: 2, count: 2 } });
    // Finishing again is the same game; it cannot be moved on.
    expect((await http().post(`/v1/quiz-games/${id}/finish`).set(as('board')).expect(200)).body.status).toBe('finished');
    await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'question', index: 1 }).expect(400);
    expect(((await http().get('/v1/student/quiz-game').set(as('student')).expect(200)).body as StudentQuizGame).game).toBeNull();

    // Kept for the class: its teacher and the principal see it; another teacher does not.
    const history = (await http().get(`/v1/sections/${t.section.id}/quiz-games`).set(as('teacher')).expect(200)).body.games;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id, title: 'Shares', questions: 2, revealed: 2, players: 3 });
    expect(history[0].podium[0]).toMatchObject({ name: 'Student C', score: 1975 });
    const results = (await http().get(`/v1/quiz-games/${id}/results`).set(as('principal')).expect(200)).body;
    expect(results.answers).toHaveLength(5);
    expect(results.answers.find((a: { index: number; source: string }) => a.index === 1 && a.source === 'app')).toMatchObject({ points: 1100, correct: true });
    await http().get(`/v1/quiz-games/${id}/results`).set(as('teacher2')).expect(403);
    await http().get(`/v1/sections/${t.section.id}/quiz-games`).set(as('teacher2')).expect(403);

    // Every answer is participation in the class history.
    const rows = await owner.query(`SELECT outcome, note FROM participation_events WHERE board_session_id IS NOT NULL AND note LIKE 'Live Quiz%' AND tenant_id = $1`, [t.tenantId]);
    expect(rows.rows).toHaveLength(5);
    expect(rows.rows.filter((r) => r.outcome === 'correct')).toHaveLength(4);
  });

  it('a game ended before its first question is cancelled; a new game finishes the one still running', async () => {
    const student = sockets[0];
    const a = randomUUID();
    await http().put(`/v1/quiz-games/${a}`).set(as('board')).send({ questions }).expect(200);
    const ended = next<GameEndedEvent>(student, RealtimeEvents.GameEnded);
    const b = randomUUID();
    await http().put(`/v1/quiz-games/${b}`).set(as('board')).send({ questions }).expect(200);
    expect(await ended).toMatchObject({ gameId: a, cancelled: true, podium: [] });
    expect((await http().get(`/v1/quiz-games/${a}`).set(as('board')).expect(200)).body.status).toBe('finished');
    expect((await http().get('/v1/student/quiz-game').set(as('student')).expect(200)).body).toMatchObject({ status: 'lobby', game: null });
    await http().post(`/v1/quiz-games/${b}/finish`).set(as('board')).expect(200);
  });

  it('an answer sent as the answer is revealed is either refused or counted in full, never half', async () => {
    const id = randomUUID();
    await http().put(`/v1/quiz-games/${id}`).set(as('board')).send({ questions }).expect(200);
    await http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'question', index: 0 }).expect(200);
    later(19_000);
    const [answer, reveal] = await Promise.all([
      http().post(`/v1/quiz-games/${id}/answer`).set(as('student')).send({ index: 0, choice: 1 }),
      http().post(`/v1/quiz-games/${id}/advance`).set(as('board')).send({ phase: 'reveal', index: 0 }),
    ]);
    expect(reveal.status).toBe(200);
    const view = reveal.body as QuizGameView;
    const mine = view.leaderboard.find((s) => s.studentId === t.students[2].id);
    const rejoin = (await http().get('/v1/student/quiz-game').set(as('student')).expect(200)).body as StudentQuizGame;
    if (answer.status === 200) {
      // Saved before the reveal: in the tally, and its points kept with the answer.
      expect(view.questions[0].tally).toEqual([0, 1, 0, 0]);
      expect(mine?.score).toBeGreaterThan(0);
      expect(rejoin.score).toBe(mine?.score);
    } else {
      expect(answer.status).toBe(400);
      expect(view.questions[0].tally).toEqual([0, 0, 0, 0]);
      expect(rejoin.score).toBe(0);
    }
    await http().post(`/v1/quiz-games/${id}/finish`).set(as('board')).expect(200);
  });

  it('suggests questions from the subject question bank and from questions asked in this class', async () => {
    await owner.query(
      `INSERT INTO qb_questions (tenant_id, subject_id, topic, bloom, difficulty, marks, type, text, options, status, author_id)
       VALUES ($1, $2, 'Shares', 'remember', 'easy', 1, 'mcq', 'A share sold below face value is issued at a…', $3, 'approved', $4),
              ($1, $2, 'Shares', 'remember', 'easy', 1, 'short', 'Define a share.', '[]', 'approved', $4)`,
      [t.tenantId, t.subject.id, JSON.stringify([{ text: 'Premium', correct: false }, { text: 'Discount', correct: true }]), t.teacher.id],
    );
    const poll = randomUUID();
    await http().put(`/v1/polls/${poll}`).set(as('board')).send({ kind: 'mcq', question: 'Is goodwill intangible?', options: ['True', 'False'], correct: '0' }).expect(200);
    await http().post(`/v1/polls/${poll}/close`).set(as('board')).expect(200);
    const got = (await http().get('/v1/quiz-games/questions?topic=shares').set(as('board')).expect(200)).body.questions;
    expect(got).toEqual([
      { source: 'bank', topic: 'Shares', kind: 'mcq', question: 'A share sold below face value is issued at a…', options: ['Premium', 'Discount'], correct: 1 },
      { source: 'class', topic: null, kind: 'tf', question: 'Is goodwill intangible?', options: ['True', 'False'], correct: 0 },
    ]);
  });
});
