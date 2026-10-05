import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type RemoteAttachAck, type RemoteBoardState, type RemoteCommand } from '@kinetix/shared';
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

/** Resolves true if [event] arrives within [ms], false otherwise. */
const arrives = (s: Socket, event: string, ms = 300) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      s.off(event, on);
      resolve(false);
    }, ms);
    const on = () => {
      clearTimeout(timer);
      resolve(true);
    };
    s.once(event, on);
  });

describe('phone remote', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let board: Socket;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const connect = async (token: string) => {
    const s = io(`${url}/realtime`, { auth: { token }, transports: ['websocket'] });
    sockets.push(s);
    await next(s, 'ready');
    return s;
  };
  const attach = (s: Socket, deviceId = t.device.id) => s.emitWithAck(RealtimeEvents.RemoteAttach, { deviceId }) as Promise<RemoteAttachAck>;
  const send = (s: Socket, c: unknown) => s.emitWithAck(RealtimeEvents.RemoteCommand, c) as Promise<{ ok: boolean; error?: string }>;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(nextMondayIst('10:30')));
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      otherTeacher: await login(other.slug, other.teacher.email!),
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

  it('only the teacher teaching on the board may attach', async () => {
    for (const who of ['teacher2', 'principal', 'student', 'otherTeacher']) {
      const s = await connect(tokens[who]);
      expect(await attach(s), who).toMatchObject({ ok: false });
      expect(await send(s, { type: 'page.next' }), who).toEqual({ ok: false, error: 'Not connected to a board' });
    }
    const phone = await connect(tokens.teacher);
    expect(await attach(phone, randomUUID())).toMatchObject({ ok: false });
    const hello = next<RemoteCommand>(board, RealtimeEvents.RemoteCommand);
    expect(await attach(phone)).toEqual({ ok: true, board: { id: t.device.id, name: 'Room 1 Board' } });
    expect(await hello).toEqual({ type: 'hello' });
    const { rows } = await owner.query(`select actor_id from audit_log where tenant_id = $1 and action = 'remote.attach'`, [t.tenantId]);
    expect(rows).toEqual([{ actor_id: t.teacher.id }]);
  });

  it('relays commands to the board, and the board state to its teacher only', async () => {
    const phone = await connect(tokens.teacher);
    const bystander = await connect(tokens.teacher2);
    const hello = next(board, RealtimeEvents.RemoteCommand);
    await attach(phone);
    await hello;

    for (const c of [{ type: 'page.next' }, { type: 'timer.start', seconds: 120 }, { type: 'pointer', x: 0.25, y: 0.75 }, { type: 'recording.start' }, { type: 'slide.previous' }]) {
      const got = next<RemoteCommand>(board, RealtimeEvents.RemoteCommand);
      expect(await send(phone, c)).toEqual({ ok: true });
      expect(await got).toEqual(c);
    }
    // Malformed or server-only commands are refused.
    for (const c of [{ type: 'photo.show', photoId: randomUUID() }, { type: 'pointer', x: 3, y: 0 }, { type: 'timer.start', seconds: 1 }, { type: 'format.disk' }, null]) {
      expect(await send(phone, c)).toEqual({ ok: false, error: 'Unknown command' });
    }

    const state: RemoteBoardState = { page: 2, pages: 3, recording: true, timerRunning: false, slide: null };
    const toTeacher = next<RemoteBoardState>(phone, RealtimeEvents.RemoteState);
    const leaked = arrives(bystander, RealtimeEvents.RemoteState);
    board.emit(RealtimeEvents.RemoteState, state);
    expect(await toTeacher).toEqual({ ...state, deviceId: t.device.id });
    expect(await leaked).toBe(false);
    // Users cannot pretend to be the board.
    const spoofed = arrives(phone, RealtimeEvents.RemoteState);
    bystander.emit(RealtimeEvents.RemoteState, state);
    expect(await spoofed).toBe(false);
  });

  it('a photo from the phone goes to that board once; nobody else can send or fetch it', async () => {
    const photoId = randomUUID();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
    await http().put(`/v1/remote/${t.device.id}/photos/${photoId}`).set('authorization', `Bearer ${tokens.teacher2}`).set('content-type', 'image/png').send(png).expect(403);
    await http().put(`/v1/remote/${t.device.id}/photos/${photoId}`).set('authorization', `Bearer ${tokens.teacher}`).set('content-type', 'text/html').send('<b>').expect(400);
    const shown = next<RemoteCommand>(board, RealtimeEvents.RemoteCommand);
    await http().put(`/v1/remote/${t.device.id}/photos/${photoId}`).set('authorization', `Bearer ${tokens.teacher}`).set('content-type', 'image/png').send(png).expect(204);
    expect(await shown).toEqual({ type: 'photo.show', photoId });
    await http().get(`/v1/remote/photos/${photoId}`).set('authorization', `Bearer ${tokens.teacher}`).expect(403);
    const got = await http()
      .get(`/v1/remote/photos/${photoId}`)
      .set('authorization', `Bearer ${tokens.board}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(got.body as Buffer, png)).toBe(0);
    await http().get(`/v1/remote/photos/${photoId}`).set('authorization', `Bearer ${tokens.board}`).expect(404);
  });

  it('stops working when the class ends', async () => {
    const phone = await connect(tokens.teacher);
    await attach(phone);
    await http().post('/v1/sessions/current/end').set('authorization', `Bearer ${tokens.board}`).expect(201);
    expect(await send(phone, { type: 'page.next' })).toEqual({ ok: false, error: 'The class on this board has ended' });
    expect(await attach(phone)).toMatchObject({ ok: false });
    await http()
      .put(`/v1/remote/${t.device.id}/photos/${randomUUID()}`)
      .set('authorization', `Bearer ${tokens.teacher}`)
      .set('content-type', 'image/png')
      .send(Buffer.from([1, 2, 3]))
      .expect(403);
  });
});
