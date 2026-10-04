import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type BroadcastMessage, type PairingClaimedEvent } from '@kinetix/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/** Broadcasts from the principal and the board's sync outbox, on a board with an active class. */
describe('broadcasts and sync', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let url: string;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let deviceToken: string;
  let sessionToken: string;
  let principalToken: string;
  let socket: Socket;
  const http = () => request(app.getHttpServer());

  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    deviceToken = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'windows' }).expect(201)).body.deviceToken;

    socket = io(`${url}/realtime`, { auth: { token: deviceToken }, transports: ['websocket'] });
    await new Promise((r) => socket.once('ready', r));

    const { code } = (await http().post('/v1/devices/me/pairing-codes').set('authorization', `Bearer ${deviceToken}`).expect(201)).body;
    const claimed = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));
    await http().post('/v1/pairing/claim').set('authorization', `Bearer ${await login(t.slug, t.teacher.email!)}`).send({ code }).expect(200);
    sessionToken = (await claimed).sessionToken;
    principalToken = await login(t.slug, t.principal.email!);
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  describe('circulate', () => {
    it('delivers a message for a class to the board teaching that class, in real time', async () => {
      const received = new Promise<BroadcastMessage>((r) => socket.once(RealtimeEvents.BroadcastNew, r));
      const res = await http()
        .post('/v1/broadcasts')
        .set('authorization', `Bearer ${principalToken}`)
        .send({ title: 'Fee reminder', body: 'Last date is Friday', audience: { sectionIds: [t.section.id] } })
        .expect(201);
      expect(res.body.targetedBoards).toBe(1);
      const msg = await received;
      expect(msg).toMatchObject({ id: res.body.id, title: 'Fee reminder', priority: 'info' });
      expect(msg.sender.id).toBe(t.principal.id);
    });

    it('does not reach a board that is teaching a different class', async () => {
      const res = await http()
        .post('/v1/broadcasts')
        .set('authorization', `Bearer ${principalToken}`)
        .send({ title: 'Sem 3 B only', body: '…', audience: { sectionIds: [t.otherSection.id] } })
        .expect(201);
      expect(res.body.targetedBoards).toBe(0);
    });

    it('tracks displayed and acknowledged, and an emergency stays until cleared', async () => {
      const res = await http()
        .post('/v1/broadcasts')
        .set('authorization', `Bearer ${principalToken}`)
        .send({ title: 'Fire drill', body: 'Evacuate now', priority: 'emergency', audience: { all: true } })
        .expect(201);
      expect(res.body.requiresAck).toBe(true);

      const pending = await http().get('/v1/broadcasts/pending').set('authorization', `Bearer ${sessionToken}`).expect(200);
      expect(pending.body.map((m: BroadcastMessage) => m.id)).toContain(res.body.id);

      await http().post(`/v1/broadcasts/${res.body.id}/displayed`).set('authorization', `Bearer ${sessionToken}`).expect(204);
      let report = await http().get(`/v1/broadcasts/${res.body.id}/delivery`).set('authorization', `Bearer ${principalToken}`).expect(200);
      expect(report.body).toMatchObject({ total: 1, displayed: 1, acknowledged: 0 });

      const cleared = new Promise<{ id: string }>((r) => socket.once(RealtimeEvents.BroadcastCleared, r));
      await http().post(`/v1/broadcasts/${res.body.id}/clear`).set('authorization', `Bearer ${principalToken}`).expect(200);
      expect((await cleared).id).toBe(res.body.id);
      const after = await http().get('/v1/broadcasts/pending').set('authorization', `Bearer ${sessionToken}`).expect(200);
      expect(after.body.map((m: BroadcastMessage) => m.id)).not.toContain(res.body.id);

      await http().post(`/v1/broadcasts/${res.body.id}/ack`).set('authorization', `Bearer ${sessionToken}`).expect(204);
      report = await http().get(`/v1/broadcasts/${res.body.id}/delivery`).set('authorization', `Bearer ${principalToken}`).expect(200);
      expect(report.body.acknowledged).toBe(1);
    });

    it('an info banner is not shown again once displayed; an important card is, until OK is pressed', async () => {
      const send = (priority: string) =>
        http().post('/v1/broadcasts').set('authorization', `Bearer ${principalToken}`).send({ title: priority, body: '…', priority, audience: { all: true } }).expect(201);
      const info = (await send('info')).body.id;
      const important = (await send('important')).body.id;
      for (const id of [info, important]) {
        await http().post(`/v1/broadcasts/${id}/displayed`).set('authorization', `Bearer ${deviceToken}`).expect(204);
      }
      const pending = (await http().get('/v1/broadcasts/pending').set('authorization', `Bearer ${deviceToken}`).expect(200)).body.map((m: BroadcastMessage) => m.id);
      expect(pending).not.toContain(info);
      expect(pending).toContain(important);
    });

    it('teachers cannot circulate', async () => {
      const teacher = await login(t.slug, t.teacher.email!);
      await http().post('/v1/broadcasts').set('authorization', `Bearer ${teacher}`).send({ title: 'x', body: 'y', audience: { all: true } }).expect(403);
    });

    it('requires an audience', async () => {
      await http().post('/v1/broadcasts').set('authorization', `Bearer ${principalToken}`).send({ title: 'x', body: 'y', audience: {} }).expect(400);
    });
  });

  describe('sync push', () => {
    const push = (ops: unknown[]) => http().post('/v1/sync/push').set('authorization', `Bearer ${sessionToken}`).send({ ops }).expect(200);
    const at = (time: string) => nextMondayIst(time).toISOString();

    it('applies attendance and participation, and treats a resend as a duplicate', async () => {
      const ops = [
        { opId: randomUUID(), type: 'attendance.marked', occurredAt: at('10:05'), payload: { studentId: t.students[0].id, status: 'absent' } },
        { opId: randomUUID(), type: 'participation.recorded', occurredAt: at('10:20'), payload: { studentId: t.students[1].id, outcome: 'correct', topicCode: 'bu.bcom.3.ca.u1' } },
      ];
      const first = await push(ops);
      expect(first.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);
      const again = await push(ops);
      expect(again.body.results.map((r: { status: string }) => r.status)).toEqual(['duplicate', 'duplicate']);

      const { rows } = await owner.query('select status from attendance_records where student_id = $1', [t.students[0].id]);
      expect(rows).toEqual([{ status: 'absent' }]);
      const { rows: p } = await owner.query('select outcome, topic_code from participation_events where student_id = $1', [t.students[1].id]);
      expect(p).toEqual([{ outcome: 'correct', topic_code: 'bu.bcom.3.ca.u1' }]);
    });

    it('keeps the latest attendance mark even when an older one arrives later', async () => {
      const s = t.students[2].id;
      await push([{ opId: randomUUID(), type: 'attendance.marked', occurredAt: at('10:10'), payload: { studentId: s, status: 'late' } }]);
      await push([{ opId: randomUUID(), type: 'attendance.marked', occurredAt: at('10:02'), payload: { studentId: s, status: 'absent' } }]);
      const { rows } = await owner.query('select status from attendance_records where student_id = $1', [s]);
      expect(rows).toEqual([{ status: 'late' }]);
    });

    it("rejects students from another institution or class without failing the batch", async () => {
      const ok = randomUUID();
      const res = await push([
        { opId: randomUUID(), type: 'attendance.marked', occurredAt: at('10:05'), payload: { studentId: other.students[0].id, status: 'present' } },
        { opId: ok, type: 'participation.recorded', occurredAt: at('10:06'), payload: { studentId: t.students[0].id, outcome: 'partial' } },
        { opId: randomUUID(), type: 'homework.teleport', occurredAt: at('10:07'), payload: {} },
      ]);
      expect(res.body.results).toEqual([
        expect.objectContaining({ status: 'rejected', reason: 'student is not in this class' }),
        { opId: ok, status: 'applied' },
        expect.objectContaining({ status: 'rejected', reason: 'unknown operation type homework.teleport' }),
      ]);
      const { rows } = await owner.query('select count(*)::int as n from attendance_records where student_id = $1', [other.students[0].id]);
      expect(rows[0].n).toBe(0);
    });

    it('needs a paired board, not just a device token', async () => {
      await http().post('/v1/sync/push').set('authorization', `Bearer ${deviceToken}`).send({ ops: [] }).expect(403);
    });
  });
});
