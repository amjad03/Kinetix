import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type PairingClaimedEvent, type SessionEndedEvent } from '@kinetix/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

describe('board enrolment and teacher pairing', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let deviceToken: string;
  const sockets: Socket[] = [];

  const login = async (slug: string, email: string) =>
    (await request(app.getHttpServer()).post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body
      .accessToken as string;

  const newCode = async () =>
    (await request(app.getHttpServer()).post('/v1/devices/me/pairing-codes').set('authorization', `Bearer ${deviceToken}`).expect(201)).body as {
      code: string;
      qrPayload: string;
    };

  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(`${url}/realtime`, { auth: { token }, transports: ['websocket'] });
      sockets.push(socket);
      socket.on('ready', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    url = await app.getUrl();
    url = url.replace('[::1]', 'localhost');
    const res = await request(app.getHttpServer())
      .post('/v1/devices/enroll')
      .send({ code: t.enrollmentCode.toLowerCase(), platform: 'android', appVersion: '0.1.0' })
      .expect(201);
    deviceToken = res.body.deviceToken;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await owner.end();
  });

  it('an enrolment code works only once', async () => {
    await request(app.getHttpServer()).post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(401);
  });

  it('pairs by QR, resolves the current period and pushes the session to the board', async () => {
    const socket = await connect(deviceToken);
    const claimed = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));

    const { qrPayload } = await newCode();
    const teacherToken = await login(t.slug, t.teacher.email!);
    const res = await request(app.getHttpServer())
      .post('/v1/pairing/claim')
      .set('authorization', `Bearer ${teacherToken}`)
      .send({ qr: qrPayload })
      .expect(200);

    expect(res.body.board.name).toBe('Room 1 Board');
    expect(res.body.session.section.displayName).toBe('BCom Sem 3 A');
    expect(res.body.session.subject.name).toBe('Corporate Accounting');
    expect(res.body.session.period).toMatchObject({ startsAt: '10:00:00', endsAt: '10:55:00' });
    // Period ends 10:55 IST; the session is allowed 15 minutes of grace.
    expect(new Date(res.body.session.expiresAt).getTime()).toBe(nextMondayIst('11:10').getTime());

    const event = await claimed;
    expect(event.session.sessionId).toBe(res.body.session.sessionId);

    const current = await request(app.getHttpServer())
      .get('/v1/sessions/current')
      .set('authorization', `Bearer ${event.sessionToken}`)
      .expect(200);
    expect(current.body.roster.map((s: { rollNo: string }) => s.rollNo)).toEqual(['R1', 'R2', 'R3']);
  });

  it('a code cannot be claimed twice', async () => {
    const { code } = await newCode();
    const teacherToken = await login(t.slug, t.teacher.email!);
    const claim = () => request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${teacherToken}`).send({ code });
    await claim().expect(200);
    await claim().expect(404);
  });

  it('issuing a new code invalidates the previous one', async () => {
    const first = await newCode();
    await newCode();
    const teacherToken = await login(t.slug, t.teacher.email!);
    await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${teacherToken}`).send({ code: first.code }).expect(404);
  });

  it('rejects a QR code with a forged secret', async () => {
    const { qrPayload } = await newCode();
    const forged = qrPayload.replace(/s=[^&]+/, 's=forged');
    const teacherToken = await login(t.slug, t.teacher.email!);
    await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${teacherToken}`).send({ qr: forged }).expect(404);
  });

  it('a teacher from another institution cannot claim the code', async () => {
    const { code } = await newCode();
    const outsider = await login(other.slug, other.teacher.email!);
    await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${outsider}`).send({ code }).expect(404);
  });

  it('a student cannot claim a board', async () => {
    const { code } = await newCode();
    const student = await login(t.slug, t.studentUser.email!);
    await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${student}`).send({ code }).expect(403);
  });

  it('a second teacher taking over ends the first session', async () => {
    const socket = await connect(deviceToken);
    const t1 = await login(t.slug, t.teacher.email!);
    const claimedBy1 = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));
    await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${t1}`).send({ code: (await newCode()).code }).expect(200);
    const first = await claimedBy1;

    const t2 = await login(t.slug, t.teacher2.email!);
    const claimedBy2 = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));
    await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${t2}`).send({ code: (await newCode()).code }).expect(200);
    const second = await claimedBy2;

    // Teacher 2 has no timetabled period now: an ad-hoc session with no class attached.
    expect(second.session.teacher.id).toBe(t.teacher2.id);
    expect(second.session.section).toBeNull();
    // The first teacher's session token stops working; the second one works.
    await request(app.getHttpServer()).get('/v1/sessions/current').set('authorization', `Bearer ${first.sessionToken}`).expect(401);
    await request(app.getHttpServer()).get('/v1/sessions/current').set('authorization', `Bearer ${second.sessionToken}`).expect(200);
  });

  it('ending the class from the Teacher App signs the board out', async () => {
    const socket = await connect(deviceToken);
    const teacherToken = await login(t.slug, t.teacher.email!);
    const claimed = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));
    const res = await request(app.getHttpServer()).post('/v1/pairing/claim').set('authorization', `Bearer ${teacherToken}`).send({ code: (await newCode()).code }).expect(200);
    const { sessionToken } = await claimed;

    const ended = new Promise<SessionEndedEvent>((r) => socket.once(RealtimeEvents.SessionEnded, r));
    await request(app.getHttpServer()).post(`/v1/sessions/${res.body.session.sessionId}/end`).set('authorization', `Bearer ${teacherToken}`).expect(201);
    expect(await ended).toEqual({ sessionId: res.body.session.sessionId, reason: 'teacher_ended' });
    await request(app.getHttpServer()).get('/v1/sessions/current').set('authorization', `Bearer ${sessionToken}`).expect(401);
  });

  it('rejects sockets without a valid token', async () => {
    const socket = io(`${url}/realtime`, { auth: { token: 'nope' }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((r) => socket.on('disconnect', () => r()));
  });
});
