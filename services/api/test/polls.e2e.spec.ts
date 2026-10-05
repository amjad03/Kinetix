import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type AnswerCardSheet, type PollAnsweredEvent, type PollClosedEvent, type PollResults, type PollView } from '@kinetix/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignCards, isCorrect, normaliseNumber } from '../src/polls/polls.service.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

const next = <T>(s: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), ms);
    s.once(event, (v: T) => {
      clearTimeout(timer);
      resolve(v);
    });
  });

describe('answer cards and class questions', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  /** Questions are asked a minute apart (history is newest first). */
  const tick = () => (clock.at = new Date(clock.at.getTime() + 60_000));
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
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
    other = await createTenant(owner);
    app = await createApp(clock);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      otherStudent: await login(other.slug, other.studentUser.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    board = paired.socket;
    tokens.board = paired.boardToken;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    board.disconnect();
    await app.close();
    await owner.end();
  });

  it('hands out card numbers by roll number and keeps them', () => {
    const roster = [
      { id: 'a', rollNo: 'U03BC007' },
      { id: 'b', rollNo: 'R1' },
      { id: 'c', rollNo: 'X' },
      { id: 'd', rollNo: '7' },
    ];
    expect(assignCards(roster, new Map())).toEqual([
      { cardNo: 7, studentId: 'a' },
      { cardNo: 1, studentId: 'b' },
      { cardNo: 2, studentId: 'c' },
      { cardNo: 3, studentId: 'd' },
    ]);
    expect(assignCards(roster, new Map([[1, 'c']]))).toEqual([
      { cardNo: 7, studentId: 'a' },
      { cardNo: 2, studentId: 'b' },
      { cardNo: 3, studentId: 'd' },
    ]);
    expect(normaliseNumber(' 0.50 ')).toBe('0.5');
    expect(normaliseNumber('1,250')).toBe('1250');
    expect(normaliseNumber('abc')).toBeNull();
    expect(isCorrect({ kind: 'numeric', correct: '0.1' }, String(0.1 + 0.2 - 0.2))).toBe(true);
    expect(isCorrect({ kind: 'mcq', correct: null }, '1')).toBeNull();
  });

  it('prints a class its answer cards: teachers of the class and leaders only', async () => {
    const sheet = (await http().get(`/v1/sections/${t.section.id}/answer-cards`).set(as('teacher')).expect(200)).body as AnswerCardSheet;
    expect(sheet.section.displayName).toBe('BCom Sem 3 A');
    expect(sheet.cards.map((c) => [c.cardNo, c.rollNo])).toEqual([
      [1, 'R1'],
      [2, 'R2'],
      [3, 'R3'],
    ]);
    // A reprint gives the same cards.
    const again = (await http().get(`/v1/sections/${t.section.id}/answer-cards`).set(as('principal')).expect(200)).body as AnswerCardSheet;
    expect(again.cards).toEqual(sheet.cards);
    await http().get(`/v1/sections/${t.section.id}/answer-cards`).set(as('teacher2')).expect(403);
    await http().get(`/v1/sections/${t.section.id}/answer-cards`).set(as('student')).expect(403);
    const onBoard = (await http().get('/v1/answer-cards/current').set(as('board')).expect(200)).body as AnswerCardSheet;
    expect(onBoard.cards).toEqual(sheet.cards);
  });

  it('a question on the board reaches the class; app and card answers are tallied live and stored', async () => {
    const student = await connect(tokens.student);
    const id = randomUUID();
    const opened = next<PollView>(student, RealtimeEvents.PollOpened);
    const created = (
      await http().put(`/v1/polls/${id}`).set(as('board')).send({ kind: 'mcq', question: 'Which share is redeemable?', options: ['A', 'B', 'C', 'D'], correct: '1' }).expect(200)
    ).body as PollResults;
    expect(created).toMatchObject({ id, kind: 'mcq', closedAt: null, correct: '1', tally: { total: 0, classSize: 3 } });
    expect(await opened).toMatchObject({ id, question: 'Which share is redeemable?', subject: 'Corporate Accounting' });
    // Asking again with the same id is the same question.
    await http().put(`/v1/polls/${id}`).set(as('board')).send({ kind: 'mcq', question: 'x', options: ['A', 'B'] }).expect(200);

    const banner = (await http().get('/v1/student/poll').set(as('student')).expect(200)).body as { poll: PollView };
    expect(banner.poll).toMatchObject({ id, myAnswer: null, options: ['A', 'B', 'C', 'D'] });
    // The answer is never shown to students.
    expect(banner.poll).not.toHaveProperty('correct');

    await http().post(`/v1/polls/${id}/answer`).set(as('student')).send({ answer: '9' }).expect(400);
    const answered = next<PollAnsweredEvent>(board, RealtimeEvents.PollAnswered);
    await http().post(`/v1/polls/${id}/answer`).set(as('student')).send({ answer: '1' }).expect(200);
    expect(await answered).toMatchObject({ pollId: id, studentId: t.students[2].id, answer: '1', source: 'app', tally: { total: 1, answers: { '0': 0, '1': 1, '2': 0, '3': 0 } } });
    expect(((await http().get('/v1/student/poll').set(as('student')).expect(200)).body as { poll: PollView }).poll.myAnswer).toBe('1');

    // Students without phones: cards 1 and 2 read from a photo; 42 belongs to nobody.
    const cards = await http()
      .post(`/v1/polls/${id}/cards`)
      .set(as('board'))
      .send({ answers: [{ cardNo: 1, choice: 1 }, { cardNo: 2, choice: 3 }, { cardNo: 42, choice: 0 }] })
      .expect(200);
    expect(cards.body.matched).toHaveLength(2);
    expect(cards.body.unknown).toEqual([42]);
    expect(cards.body.tally).toMatchObject({ total: 3, answers: { '1': 2, '3': 1 } });

    // Someone else's student cannot answer, nor see the question.
    await http().post(`/v1/polls/${id}/answer`).set(as('otherStudent')).send({ answer: '1' }).expect(404);
    expect((await http().get('/v1/student/poll').set(as('otherStudent')).expect(200)).body.poll).toBeNull();

    const closed = next<PollClosedEvent>(student, RealtimeEvents.PollClosed);
    const results = (await http().post(`/v1/polls/${id}/close`).set(as('board')).expect(200)).body as PollResults;
    expect(await closed).toEqual({ pollId: id });
    expect(results.closedAt).not.toBeNull();
    expect(results.responses.map((r) => [r.rollNo, r.answer, r.source, r.correct])).toEqual([
      ['R1', '1', 'card', true],
      ['R2', '3', 'card', false],
      ['R3', '1', 'app', true],
    ]);
    // Closing twice records once.
    await http().post(`/v1/polls/${id}/close`).set(as('board')).expect(200);
    const { rows } = await owner.query(`select student_id, outcome, recorded_by, note from participation_events where poll_id = $1 order by outcome`, [id]);
    expect(rows.map((r) => r.outcome).sort()).toEqual(['correct', 'correct', 'incorrect']);
    expect(rows.every((r) => r.recorded_by === t.teacher.id)).toBe(true);
    expect(rows[0].note).toContain('Which share is redeemable?');

    await http().post(`/v1/polls/${id}/answer`).set(as('student')).send({ answer: '2' }).expect(400);
    await http().post(`/v1/polls/${id}/cards`).set(as('board')).send({ answers: [{ cardNo: 3, choice: 0 }] }).expect(400);
    expect((await http().get('/v1/student/poll').set(as('student')).expect(200)).body.poll).toBeNull();
  });

  it('numeric questions and opinion questions; a new question closes the open one', async () => {
    const first = randomUUID();
    tick();
    await http().put(`/v1/polls/${first}`).set(as('board')).send({ kind: 'numeric', question: 'Premium per share?', correct: '2.5' }).expect(200);
    await http().post(`/v1/polls/${first}/answer`).set(as('student')).send({ answer: 'two' }).expect(400);
    await http().post(`/v1/polls/${first}/answer`).set(as('student')).send({ answer: '2.50' }).expect(200);
    await http().post(`/v1/polls/${first}/cards`).set(as('board')).send({ answers: [{ cardNo: 1, choice: 0 }] }).expect(400);

    const second = randomUUID();
    tick();
    await http().put(`/v1/polls/${second}`).set(as('board')).send({ kind: 'mcq', question: 'Was this clear?', options: ['Yes', 'No'] }).expect(200);
    const firstNow = (await http().get(`/v1/polls/${first}`).set(as('board')).expect(200)).body as PollResults;
    expect(firstNow.closedAt).not.toBeNull();
    expect(firstNow.responses).toMatchObject([{ answer: '2.5', correct: true }]);

    await http().post(`/v1/polls/${second}/answer`).set(as('student')).send({ answer: '0' }).expect(200);
    await http().post(`/v1/polls/${second}/close`).set(as('board')).expect(200);
    const { rows } = await owner.query(`select outcome from participation_events where poll_id = $1`, [second]);
    expect(rows).toEqual([{ outcome: 'answered' }]);

    await http().put(`/v1/polls/${randomUUID()}`).set(as('board')).send({ kind: 'mcq', question: 'x', options: ['A'] }).expect(400);
    await http().put(`/v1/polls/${randomUUID()}`).set(as('board')).send({ kind: 'mcq', question: 'x', options: ['A', 'B'], correct: '5' }).expect(400);
  });

  it('teachers and leaders see past questions of the class; others do not', async () => {
    const history = (await http().get(`/v1/sections/${t.section.id}/polls`).set(as('teacher')).expect(200)).body as PollResults[];
    expect(history.map((p) => p.question)).toEqual(['Was this clear?', 'Premium per share?', 'Which share is redeemable?']);
    await http().get(`/v1/sections/${t.section.id}/polls`).set(as('principal')).expect(200);
    await http().get(`/v1/sections/${t.section.id}/polls`).set(as('teacher2')).expect(403);
    await http().get(`/v1/sections/${t.section.id}/polls`).set(as('student')).expect(403);
  });
});
