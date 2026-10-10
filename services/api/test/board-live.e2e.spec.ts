import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type AttendanceUpdatedEvent } from '@kinetix/shared';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

const next = <T>(s: Socket, event: string, ms = 5000) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no ${event}`)), ms);
    s.once(event, (d: T) => {
      clearTimeout(t);
      res(d);
    });
  });

describe('board live: attendance push, poll to course outcome tagging, replayed board saves', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let teacherToken: string;
  let boardToken: string;
  let boardSocket: Socket;
  let staffSocket: Socket;
  const http = () => request(app.getHttpServer());
  const board = () => ({ authorization: `Bearer ${boardToken}` });

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    teacherToken = (await http().post('/v1/auth/login').send({ tenant: t.slug, login: t.teacher.email, password: 'pw' }).expect(201)).body.accessToken;
    const paired = await pairBoard(app, t, teacherToken);
    boardToken = paired.boardToken;
    boardSocket = paired.socket;
    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    staffSocket = io(`${url}/realtime`, { auth: { token: teacherToken }, transports: ['websocket'] });
    await next(staffSocket, 'ready');
  });

  afterAll(async () => {
    staffSocket.disconnect();
    boardSocket.disconnect();
    await app.close();
    await owner.end();
  });

  it('tells staff (the ERP attendance page) and families at once when attendance is marked on the board, after the marks are saved', async () => {
    const arrived = next<AttendanceUpdatedEvent>(staffSocket, RealtimeEvents.AttendanceUpdated);
    const ops = [
      { opId: randomUUID(), type: 'attendance.marked', occurredAt: clock.now().toISOString(), payload: { studentId: t.students[0].id, status: 'absent' } },
      { opId: randomUUID(), type: 'attendance.marked', occurredAt: clock.now().toISOString(), payload: { studentId: t.students[1].id, status: 'present' } },
    ];
    const res = await http().post('/v1/sync/push').set(board()).send({ ops }).expect(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);
    const e = await arrived;
    expect(e).toMatchObject({ absent: 1, present: 1 });
    expect(e.studentIds.sort()).toEqual([t.students[0].id, t.students[1].id].sort());
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Replaying the same ops changes nothing and announces nothing new.
    const again = await http().post('/v1/sync/push').set(board()).send({ ops }).expect(200);
    expect(again.body.results.map((r: { status: string }) => r.status)).toEqual(['duplicate', 'duplicate']);
  });

  it('lets the teacher tag a question with the subject\'s course outcomes from the board, which then count as OBE evidence', async () => {
    const co = await owner.query(`select s.subject_id from board_sessions s where s.tenant_id = $1 and s.subject_id is not null order by s.started_at desc limit 1`, [t.tenantId]);
    const subjectId = co.rows[0].subject_id as string;
    const set = await owner.query(`insert into co_sets (tenant_id, subject_id, version, status, created_by) values ($1, $2, 1, 'active', $3) returning id`, [t.tenantId, subjectId, t.teacher.id]);
    const co1 = (await owner.query(`insert into course_outcomes (tenant_id, co_set_id, code, statement, ord) values ($1, $2, 'CO1', 'Explain share capital', 1) returning id`, [t.tenantId, set.rows[0].id])).rows[0].id as string;
    await owner.query(`insert into course_outcomes (tenant_id, co_set_id, code, statement, ord) values ($1, $2, 'CO2', 'Record transactions', 2)`, [t.tenantId, set.rows[0].id]);

    const list = (await http().get('/v1/classroom/course-outcomes').set(board()).expect(200)).body as { id: string; code: string }[];
    expect(list.map((c) => c.code)).toEqual(['CO1', 'CO2']);

    const q = randomUUID();
    await http().put(`/v1/polls/${q}`).set(board()).send({ kind: 'mcq', question: 'Which share is redeemable?', options: ['A', 'B', 'C', 'D'], correct: '1' }).expect(200);
    await http().put(`/v1/polls/${q}/cos`).set(board()).send({ coIds: [co1] }).expect(200).expect({ tagged: 1 });
    expect((await owner.query(`select co_id from poll_co_map where poll_id = $1`, [q])).rows.map((r) => r.co_id)).toEqual([co1]);
    // Replacing tags, and refusing an outcome that belongs to nobody's subject.
    await http().put(`/v1/polls/${q}/cos`).set(board()).send({ coIds: [] }).expect(200).expect({ tagged: 0 });
    await http().put(`/v1/polls/${q}/cos`).set(board()).send({ coIds: [randomUUID()] }).expect(400);
    await http().put(`/v1/polls/${randomUUID()}/cos`).set(board()).send({ coIds: [] }).expect(404);
  });

  it('keeps a board save idempotent so an offline save replayed later (even twice) is one board at the next version', async () => {
    const id = randomUUID();
    const body = { title: 'Shares', share: true, pages: [{ strokes: [] }] };
    await http().put(`/v1/whiteboards/${id}`).set(board()).send(body).expect(200);
    const second = await http().put(`/v1/whiteboards/${id}`).set(board()).send({ ...body, title: 'Shares v2' });
    expect(second.status).toBe(200);
    const row = (await owner.query(`select title, version, shared_at from whiteboards where id = $1`, [id])).rows[0];
    expect(row).toMatchObject({ title: 'Shares v2', version: 2 });
    expect(row.shared_at).not.toBeNull();
  });
});
