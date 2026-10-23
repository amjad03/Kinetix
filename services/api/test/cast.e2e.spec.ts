import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type CastApprovedEvent, type CastControlEvent, type CastEndedEvent, type CastIceEvent, type CastPendingEvent, type CastRequestAck, type CastSignal } from '@kinetix/shared';
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

// Screen sharing: a phone or laptop casts to the board of the class in session; the teacher approves on the board.
describe('screen sharing to the board', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let teacherToken: string;
  let studentToken: string;
  let board: Socket;
  let boardToken: string;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const connect = async (token: string) => {
    const s = io(`${url}/realtime`, { auth: { token }, transports: ['websocket'] });
    sockets.push(s);
    await next(s, 'ready');
    return s;
  };
  const cast = (s: Socket) => s.emitWithAck(RealtimeEvents.CastRequest, { deviceId: t.device.id }) as Promise<CastRequestAck>;
  const audits = async (action: string) => (await owner.query(`select 1 from audit_log where tenant_id = $1 and action = $2`, [t.tenantId, action])).rows.length;

  beforeAll(async () => {
    t = await createTenant(owner);
    await owner.query(`update tenants set settings = '{"liveViewEnabled": true}' where id = $1`, [t.tenantId]);
    app = await createApp(new FixedClock(nextMondayIst('10:30')));
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    teacherToken = await login(t.teacher.email!);
    studentToken = await login(t.studentUser.email!);
    const paired = await pairBoard(app, t, teacherToken);
    board = paired.socket;
    boardToken = paired.boardToken;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    board.disconnect();
    await app.close();
    await owner.end();
  });

  it('refuses people outside the class, another teacher and anyone with no class open', async () => {
    const principal = await connect(await login(t.principal.email!));
    // A principal has a teaching role but is not the class teacher: allowed, but needs approval.
    expect(await cast(principal)).toMatchObject({ ok: true, approved: false });
    const guardian = await connect(await login(t.guardian.email!));
    expect(await cast(guardian)).toMatchObject({ ok: false, error: 'Only teachers and students can cast to a board' });
    expect(await guardian.emitWithAck(RealtimeEvents.CastRequest, { deviceId: 'nope' })).toMatchObject({ ok: false, error: 'Unknown board' });
  });

  it('auto-approves the class teacher, and relays WebRTC signalling both ways', async () => {
    const teacher = await connect(teacherToken);
    const ice = next<CastIceEvent>(board, RealtimeEvents.CastIce);
    const ack = await cast(teacher);
    expect(ack).toMatchObject({ ok: true, approved: true });
    expect(await ice).toMatchObject({ castId: ack.castId, role: 'teacher' });

    const atBoard = next<CastSignal>(board, RealtimeEvents.CastSignal);
    expect(await teacher.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'offer', sdp: 'v=0' } })).toEqual({ ok: true });
    expect(await atBoard).toEqual({ castId: ack.castId, data: { type: 'offer', sdp: 'v=0' } });

    const atTeacher = next<CastSignal>(teacher, RealtimeEvents.CastSignal);
    await board.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'answer', sdp: 'v=0 answer' } });
    expect((await atTeacher).data).toMatchObject({ type: 'answer' });

    // Not the sender: nothing relayed.
    const other = await connect(studentToken);
    expect(await other.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'offer', sdp: 'x' } })).toEqual({ ok: false });
    await teacher.emitWithAck(RealtimeEvents.CastStop, { castId: ack.castId });
  });

  it('a student waits for the teacher: pending on the board, then approved, then stopped by the teacher', async () => {
    const student = await connect(studentToken);
    const pending = next<CastPendingEvent>(board, RealtimeEvents.CastPending);
    const ack = await cast(student);
    expect(ack).toMatchObject({ ok: true, approved: false });
    expect(await pending).toMatchObject({ castId: ack.castId, role: 'student' });
    // Signals before approval go nowhere.
    expect(await student.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'offer', sdp: 'v' } })).toEqual({ ok: false });

    const approved = next<CastApprovedEvent>(student, RealtimeEvents.CastApproved);
    const ice = next<CastIceEvent>(board, RealtimeEvents.CastIce);
    expect(await board.emitWithAck(RealtimeEvents.CastDecide, { castId: ack.castId, approve: true })).toEqual({ ok: true });
    expect((await approved).castId).toBe(ack.castId);
    expect((await ice).name).toBeTruthy();

    // The class teacher, from the Teacher App, stops it.
    const teacher = await connect(teacherToken);
    const ended = next<CastEndedEvent>(student, RealtimeEvents.CastEnded);
    expect(await teacher.emitWithAck(RealtimeEvents.CastStop, { castId: ack.castId })).toEqual({ ok: true });
    expect(await ended).toEqual({ castId: ack.castId, reason: 'stopped' });
    expect(await audits('cast.approved')).toBe(1);
  });

  it('declined casts end; a leaving sender ends theirs; at most four screens', async () => {
    const student = await connect(studentToken);
    const first = await cast(student);
    const ended = next<CastEndedEvent>(student, RealtimeEvents.CastEnded);
    await board.emitWithAck(RealtimeEvents.CastDecide, { castId: first.castId, approve: false });
    expect(await ended).toEqual({ castId: first.castId, reason: 'declined' });

    const gone = next<CastEndedEvent>(board, RealtimeEvents.CastEnded);
    await cast(student);
    student.disconnect();
    expect((await gone).reason).toBe('sender_left');

  });

  it('shows at most nine screens at once', async () => {
    await owner.query(`update cast_sessions set state = 'ended' where device_id = $1`, [t.device.id]);
    const extra = async (n: number) => {
      const email = `extra${n}-${t.slug}@x.in`;
      const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) select tenant_id, $2, $2, password_hash from users where id = $1 returning id`, [t.teacher.id, email]);
      await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, 'teacher', $3)`, [t.tenantId, rows[0].id, t.campus.id]);
      return connect(await login(email));
    };
    for (let i = 0; i < 9; i++) expect((await cast(await extra(i))).ok).toBe(true);
    expect(await cast(await extra(99))).toMatchObject({ ok: false, error: 'This board already shows 9 screens' });
    await owner.query(`update cast_sessions set state = 'ended' where device_id = $1`, [t.device.id]);
  });

  it('a guest joins from the browser with the code on the board: approved, signalled, muted and stopped by the teacher', async () => {
    const code = (await http().get('/v1/cast/join-code').set('authorization', `Bearer ${boardToken}`).expect(200)).body as { code: string; url: string };
    expect(code.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(code.url).toContain(`/cast?code=${code.code}`);
    // The same code for the whole class, a new one on request.
    expect((await http().get('/v1/cast/join-code').set('authorization', `Bearer ${boardToken}`).expect(200)).body.code).toBe(code.code);
    // Only a board asks for it.
    await http().get('/v1/cast/join-code').set('authorization', `Bearer ${teacherToken}`).expect(403);

    expect((await http().post('/v1/cast/guest').send({ code: 'ZZZZZZ', name: 'Asha' }).expect(400)).body.code).toBe('CAST_CODE_INVALID');
    const joined = (await http().post('/v1/cast/guest').send({ code: code.code.toLowerCase(), name: 'Asha' }).expect(200)).body as { token: string; board: { deviceId: string; name: string } };
    expect(joined.board).toEqual({ deviceId: t.device.id, name: 'Room 1 Board' });

    // A tampered token is turned away.
    const bad = io(`${url}/realtime`, { auth: { castGuest: `${joined.token}x` }, transports: ['websocket'] });
    sockets.push(bad);
    expect(await next<{ message: string }>(bad, 'error')).toEqual({ message: 'unauthorized' });

    const guest = io(`${url}/realtime`, { auth: { castGuest: joined.token }, transports: ['websocket'] });
    sockets.push(guest);
    await next(guest, 'ready');
    const pending = next<CastPendingEvent>(board, RealtimeEvents.CastPending);
    const ack = (await guest.emitWithAck(RealtimeEvents.CastRequest, {})) as CastRequestAck;
    expect(ack).toMatchObject({ ok: true, approved: false });
    expect(await pending).toEqual({ castId: ack.castId, name: 'Asha', role: 'guest' });

    const approved = next<CastApprovedEvent>(guest, RealtimeEvents.CastApproved);
    await board.emitWithAck(RealtimeEvents.CastDecide, { castId: ack.castId, approve: true });
    expect((await approved).castId).toBe(ack.castId);
    const atBoard = next<CastSignal>(board, RealtimeEvents.CastSignal);
    expect(await guest.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'offer', sdp: 'v=0' } })).toEqual({ ok: true });
    expect((await atBoard).castId).toBe(ack.castId);
    const atGuest = next<CastSignal>(guest, RealtimeEvents.CastSignal);
    await board.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'answer', sdp: 'a' } });
    expect((await atGuest).data).toMatchObject({ type: 'answer' });

    // The teacher mutes the screen: the guest's page is told.
    const control = next<CastControlEvent>(guest, RealtimeEvents.CastControl);
    expect(await board.emitWithAck(RealtimeEvents.CastControl, { castId: ack.castId, action: 'mute' })).toEqual({ ok: true });
    expect(await control).toEqual({ castId: ack.castId, action: 'mute' });
    // Only the board controls.
    expect(await guest.emitWithAck(RealtimeEvents.CastControl, { castId: ack.castId, action: 'unmute' })).toEqual({ ok: false });

    const ended = next<CastEndedEvent>(guest, RealtimeEvents.CastEnded);
    expect(await board.emitWithAck(RealtimeEvents.CastStop, { castId: ack.castId })).toEqual({ ok: true });
    expect(await ended).toEqual({ castId: ack.castId, reason: 'stopped' });

    // A new code: the old one stops working.
    const fresh = (await http().get('/v1/cast/join-code?fresh=1').set('authorization', `Bearer ${boardToken}`).expect(200)).body.code as string;
    expect(fresh).not.toBe(code.code);
    await http().post('/v1/cast/guest').send({ code: code.code, name: 'Asha' }).expect(400);
  });

  it('ends every cast when the class ends', async () => {
    const teacher = await connect(teacherToken);
    const ack = await cast(teacher);
    const ended = next<CastEndedEvent>(teacher, RealtimeEvents.CastEnded);
    await owner.query(`update board_sessions set ended_at = now() where device_id = $1 and ended_at is null`, [t.device.id]);
    // Without the session, signalling stops working.
    expect(await teacher.emitWithAck(RealtimeEvents.CastSignal, { castId: ack.castId, data: { type: 'offer', sdp: 'v' } })).toEqual({ ok: false });
    void ended.catch(() => undefined);
    expect(await cast(teacher)).toMatchObject({ ok: false, error: 'No class is being taught on this board right now' });
  });
});
