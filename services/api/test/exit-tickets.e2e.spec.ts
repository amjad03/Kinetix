import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';
import type { Socket } from 'socket.io-client';

describe('exit tickets', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let board: Socket;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    board = paired.socket;
    tokens.board = paired.boardToken;
  });

  afterAll(async () => {
    board.disconnect();
    await app.close();
    await owner.end();
  });

  it('keeps the questions of a lesson as one ticket with results the teacher and principal can read', async () => {
    const q1 = randomUUID();
    const q2 = randomUUID();
    await http().put(`/v1/polls/${q1}`).set(as('board')).send({ kind: 'mcq', question: 'Which share is redeemable?', options: ['A', 'B', 'C', 'D'], correct: '1' }).expect(200);
    await http().post(`/v1/polls/${q1}/answer`).set(as('student')).send({ answer: '1' }).expect(200);
    await http().post(`/v1/polls/${q1}/close`).set(as('board')).expect(200);
    await http().put(`/v1/polls/${q2}`).set(as('board')).send({ kind: 'numeric', question: 'How many?', options: [], correct: '4' }).expect(200);
    await http().post(`/v1/polls/${q2}/answer`).set(as('student')).send({ answer: '5' }).expect(200);
    await http().post(`/v1/polls/${q2}/close`).set(as('board')).expect(200);

    const id = randomUUID();
    const saved = (await http().put(`/v1/exit-tickets/${id}`).set(as('board')).send({ topic: ' Preference shares ', pollIds: [q1, q2] }).expect(200)).body;
    expect(saved).toMatchObject({ id, topic: 'Preference shares', questions: 2, respondents: 1, correctRate: 0.5 });
    expect(saved.results.map((r: { question: string }) => r.question)).toEqual(['Which share is redeemable?', 'How many?']);
    expect(saved.students).toHaveLength(1);
    expect(saved.students[0]).toMatchObject({ answered: 2, correct: 1 });

    // Saving again changes nothing: one ticket.
    await http().put(`/v1/exit-tickets/${id}`).set(as('board')).send({ topic: 'Preference shares', pollIds: [q1, q2] }).expect(200);
    const list = (await http().get(`/v1/sections/${t.section.id}/exit-tickets`).set(as('teacher')).expect(200)).body.tickets;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, questions: 2, respondents: 1, correctRate: 0.5 });
    const read = (await http().get(`/v1/exit-tickets/${id}`).set(as('principal')).expect(200)).body;
    expect(read.results).toHaveLength(2);

    // Not the teacher's class, a student, or a ticket of questions that were not asked here.
    await http().get(`/v1/exit-tickets/${id}`).set(as('teacher2')).expect(403);
    await http().get(`/v1/exit-tickets/${id}`).set(as('student')).expect(403);
    await http().put(`/v1/exit-tickets/${randomUUID()}`).set(as('board')).send({ topic: 'x', pollIds: [randomUUID()] }).expect(404);
    await http().put(`/v1/exit-tickets/${randomUUID()}`).set(as('board')).send({ topic: 'x', pollIds: [] }).expect(400);
    await http().put(`/v1/exit-tickets/${randomUUID()}`).set(as('student')).send({ topic: 'x', pollIds: [q1] }).expect(403);
  });
});
