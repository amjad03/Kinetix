import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type LiveFrameEvent, type LiveViewersEvent, type LiveWatchAck } from '@kinetix/shared';
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

describe('live classroom view', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let board: Socket;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const connect = async (token: string) => {
    const s = io(`${url}/realtime`, { auth: { token }, transports: ['websocket'] });
    sockets.push(s);
    await Promise.race([next(s, 'ready'), next(s, 'disconnect').then(() => undefined)]);
    return s;
  };
  const watch = (s: Socket) => s.emitWithAck(RealtimeEvents.LiveWatch, { deviceId: t.device.id }) as Promise<LiveWatchAck>;
  const auditRows = async (action: string) =>
    (await owner.query(`select actor_id, data from audit_log where tenant_id = $1 and action = $2`, [t.tenantId, action])).rows;

  beforeAll(async () => {
    t = await createTenant(owner);
    await owner.query(`update tenants set settings = '{"liveViewEnabled": true, "liveViewIndicator": true}' where id = $1`, [t.tenantId]);
    app = await createApp(new FixedClock(nextMondayIst('10:30')));
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    tokens = { teacher: await login(t.teacher.email!), principal: await login(t.principal.email!) };
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

  it('only school leaders and students may watch (others connect for their messages only)', async () => {
    const teacherSocket = await connect(tokens.teacher);
    expect(teacherSocket.connected).toBe(true);
    expect(await watch(teacherSocket)).toMatchObject({ ok: false, error: 'Only school leaders and students can watch classes' });
  });

  it('streams the board to the principal only while they watch, and audits it', async () => {
    const principal = await connect(tokens.principal);
    const viewers = next<LiveViewersEvent>(board, RealtimeEvents.LiveViewers);
    const snapshotWanted = next(board, RealtimeEvents.LiveSnapshotRequest);
    const ack = await watch(principal);
    expect(ack).toMatchObject({ ok: true, session: { teacher: expect.any(String), section: 'BCom Sem 3 A', subject: 'Corporate Accounting' }, audio: { allowed: false, on: false } });
    expect(await viewers).toEqual({ count: 1, leaders: 1, students: 0, indicator: true, listeners: 0 });
    await snapshotWanted;

    const devices = await http().get('/v1/admin/devices').set('authorization', `Bearer ${tokens.principal}`).expect(200);
    expect(devices.body.find((d: { id: string }) => d.id === t.device.id)).toMatchObject({ online: true, viewers: 1 });

    const frame: LiveFrameEvent = {
      snapshot: { canvas: { w: 1920, h: 1080 }, background: 'plain', events: [[0, 'L', [[]], 0]] },
      events: [[120, 'b', 1, { t: 'pen', c: -16777216, w: 4, p: [10, 10] }], [140, 'p', 1, 20, 20]],
    };
    const received = next<LiveFrameEvent>(principal, RealtimeEvents.LiveFrame);
    board.emit(RealtimeEvents.LiveFrame, frame);
    expect(await received).toEqual({ ...frame, deviceId: t.device.id });

    const stopped = next<LiveViewersEvent>(board, RealtimeEvents.LiveViewers);
    await principal.emitWithAck(RealtimeEvents.LiveUnwatch, { deviceId: t.device.id });
    expect((await stopped).count).toBe(0);
    expect(await auditRows('live_view.start')).toEqual([expect.objectContaining({ actor_id: t.principal.id })]);
    expect((await auditRows('live_view.end'))[0].data).toEqual({ seconds: expect.any(Number) });

    // Frames sent with nobody watching go nowhere.
    let leaked = false;
    principal.once(RealtimeEvents.LiveFrame, () => (leaked = true));
    board.emit(RealtimeEvents.LiveFrame, frame);
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false);
  });

  it('tells viewers when the class ends, and refuses to watch a board with no class', async () => {
    const principal = await connect(tokens.principal);
    expect((await watch(principal)).ok).toBe(true);
    const ended = next<{ reason: string }>(principal, RealtimeEvents.LiveEnded);
    await http().post('/v1/sessions/current/end').set('authorization', `Bearer ${tokens.board}`).expect(201);
    expect((await ended).reason).toBe('class_ended');
    expect(await watch(principal)).toEqual({ ok: false, error: 'No class is being taught on this board right now', code: 'LIVE_NO_CLASS' });
  });

  it('respects the institution turning live view off', async () => {
    await owner.query(`update tenants set settings = '{"liveViewEnabled": false}' where id = $1`, [t.tenantId]);
    const principal = await connect(tokens.principal);
    expect(await watch(principal)).toEqual({ ok: false, error: 'Live view is turned off for your institution', code: 'LIVE_VIEW_OFF' });
  });
});
