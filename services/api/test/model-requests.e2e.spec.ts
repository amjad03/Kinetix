import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';
import type { Socket } from 'socket.io-client';

describe('3D model requests', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let board: Socket;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
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

  it('keeps a board request once per id, counts requests for the same model, and shows them only to the school', async () => {
    const id = randomUUID();
    const body = { name: ' Muscular system ', subject: 'biology', classLevel: '9', note: 'For the chapter on movement' };
    const saved = (await http().put(`/v1/model-requests/${id}`).set(as('board')).send(body).expect(200)).body;
    expect(saved).toMatchObject({ id, name: 'Muscular system', subject: 'biology', classLevel: '9', note: 'For the chapter on movement', status: 'open', votes: 1 });
    expect(saved.teacherName).toBeTruthy();

    // The outbox sends it again after a dropped connection: still one request.
    await http().put(`/v1/model-requests/${id}`).set(as('board')).send(body).expect(200);
    // Another teacher's request for the same model in other spacing and case is a vote.
    const second = (await http().put(`/v1/model-requests/${randomUUID()}`).set(as('board')).send({ name: 'muscular  SYSTEM' }).expect(200)).body;
    expect(second).toMatchObject({ votes: 2, subject: null, classLevel: null, note: null });

    const list = (await http().get('/v1/model-requests').set(as('principal')).expect(200)).body.requests;
    expect(list).toHaveLength(2);
    expect(list.every((r: { votes: number }) => r.votes === 2)).toBe(true);
    expect((await http().get('/v1/model-requests').set(as('teacher')).expect(200)).body.requests).toHaveLength(2);

    // Another school sees none of them; students cannot read them or send one; a name is needed.
    expect((await http().get('/v1/model-requests').set(as('otherPrincipal')).expect(200)).body.requests).toHaveLength(0);
    await http().get('/v1/model-requests').set(as('student')).expect(403);
    await http().put(`/v1/model-requests/${randomUUID()}`).set(as('student')).send({ name: 'Heart' }).expect(403);
    await http().put(`/v1/model-requests/${randomUUID()}`).set(as('board')).send({ name: '  ' }).expect(400);
    await http().put('/v1/model-requests/not-a-uuid').set(as('board')).send({ name: 'Heart' }).expect(400);
  });
});
