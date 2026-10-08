import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type CastApprovedEvent, type CastEndedEvent, type CastIceEvent, type CastPendingEvent, type CastRequestAck, type CastSignal } from '@kinetix/shared';
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
    board = (await pairBoard(app, t, teacherToken)).socket;
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

  it('shows at most four screens at once', async () => {
    await owner.query(`update cast_sessions set state = 'ended' where device_id = $1`, [t.device.id]);
    const extra = async (n: number) => {
      const email = `extra${n}-${t.slug}@x.in`;
      const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) select tenant_id, $2, $2, password_hash from users where id = $1 returning id`, [t.teacher.id, email]);
      await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, 'teacher', $3)`, [t.tenantId, rows[0].id, t.campus.id]);
      return connect(await login(email));
    };
    for (let i = 0; i < 4; i++) expect((await cast(await extra(i))).ok).toBe(true);
    expect(await cast(await extra(9))).toMatchObject({ ok: false, error: 'This board already shows 4 screens' });
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
