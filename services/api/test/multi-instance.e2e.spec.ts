import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type LiveFrameEvent, type LiveViewersEvent, type LiveWatchAck } from '@kinetix/shared';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

// Two API instances sharing Redis. Runs only when a Redis is reachable (REDIS_TEST_URL, or localhost:6379).
const redisUrl = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
const probe = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 500 });
probe.on('error', () => undefined);
const redisUp = await probe.connect().then(
  () => true,
  () => false,
);
probe.disconnect();

const next = <T>(s: Socket, event: string, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), ms);
    s.once(event, (v: T) => {
      clearTimeout(timer);
      resolve(v);
    });
  });

describe.skipIf(!redisUp)('two API instances over Redis', () => {
  const owner = ownerPool();
  let one: INestApplication;
  let two: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let board: Socket;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await createTenant(owner);
    await owner.query(`update tenants set settings = '{"liveViewEnabled": true, "liveViewIndicator": true}' where id = $1`, [t.tenantId]);
    process.env.REDIS_URL = redisUrl;
    try {
      const clock = new FixedClock(nextMondayIst('10:30'));
      one = await createApp(clock);
      two = await createApp(clock);
    } finally {
      delete process.env.REDIS_URL;
    }
    const teacher = (await request(one.getHttpServer()).post('/v1/auth/login').send({ tenant: t.slug, login: t.teacher.email, password: 'pw' }).expect(201)).body.accessToken;
    board = (await pairBoard(one, t, teacher)).socket;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    board?.disconnect();
    await one?.close();
    await two?.close();
    await owner.end();
  });

  it('a principal on instance two watches a board connected to instance one', async () => {
    const token = (await request(two.getHttpServer()).post('/v1/auth/login').send({ tenant: t.slug, login: t.principal.email, password: 'pw' }).expect(201)).body.accessToken;
    const url = (await two.getUrl()).replace('[::1]', 'localhost');
    const principal = io(`${url}/realtime`, { auth: { token }, transports: ['websocket'] });
    sockets.push(principal);
    await next(principal, 'ready');

    const viewers = next<LiveViewersEvent>(board, RealtimeEvents.LiveViewers);
    const ack = (await principal.emitWithAck(RealtimeEvents.LiveWatch, { deviceId: t.device.id })) as LiveWatchAck;
    expect(ack).toMatchObject({ ok: true });
    expect(await viewers).toMatchObject({ count: 1, leaders: 1 });

    // Instance one's dashboard sees the viewer held by instance two.
    const devices = await request(one.getHttpServer()).get('/v1/admin/devices').set('authorization', `Bearer ${token}`).expect(200);
    expect(devices.body.find((d: { id: string }) => d.id === t.device.id)).toMatchObject({ online: true, viewers: 1 });

    const frame: LiveFrameEvent = { events: [[120, 'p', 1, 20, 20]] } as unknown as LiveFrameEvent;
    const received = next<LiveFrameEvent>(principal, RealtimeEvents.LiveFrame);
    board.emit(RealtimeEvents.LiveFrame, frame);
    expect(await received).toMatchObject({ deviceId: t.device.id });

    const ended = next(principal, RealtimeEvents.LiveEnded);
    board.disconnect();
    expect(await ended).toMatchObject({ deviceId: t.device.id, reason: 'offline' });
  });

  it('GET /ready includes Redis', async () => {
    expect((await request(two.getHttpServer()).get('/ready').expect(200)).body.checks).toEqual({ database: 'ok', migrations: 'ok', redis: 'ok' });
  });
});
