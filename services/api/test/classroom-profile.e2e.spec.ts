import type { INestApplication } from '@nestjs/common';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

// Board profile: Your Classrooms, Schedule a Training, End class with notes, student buzzer.
describe('classroom profile', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let board: string;
  let socket: Socket;
  let teacherTok: string;
  let principalTok: string;
  let studentTok: string;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    teacherTok = await login(t.teacher.email!);
    principalTok = await login(t.principal.email!);
    studentTok = await login(t.studentUser.email!);
    const paired = await pairBoard(app, t, teacherTok);
    board = paired.boardToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('Your Classrooms lists the classes taught with sessions and last taken', async () => {
    const list = (await http().get('/v1/classroom/classrooms').set(bearer(board)).expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ sectionId: t.section.id, subjectId: t.subject.id, section: 'A', standard: 3, sessions: 1 })]);
    expect(list[0].lastTakenAt).toBeTruthy();
    await http().post('/v1/classroom/classrooms/open').set(bearer(board)).send({ sectionId: t.otherSection.id }).expect(403);
    const opened = await http().post('/v1/classroom/classrooms/open').set(bearer(board)).send({ sectionId: t.section.id, subjectId: t.subject.id }).expect(200);
    expect(opened.body.section.id).toBe(t.section.id);
    await http().get('/v1/classroom/classrooms').set(bearer(studentTok)).expect(403);
  });

  it('Schedule a Training: pick a slot, store the request, admin sees and confirms it', async () => {
    const slots = (await http().get('/v1/classroom/trainings/slots').set(bearer(board)).expect(200)).body as { at: string; taken: boolean }[];
    expect(slots.length).toBeGreaterThan(5);
    await http().post('/v1/classroom/trainings').set(bearer(board)).send({ slotAt: '2020-01-01T10:00:00.000Z', topic: 'Smart board basics' }).expect(400);
    const made = await http().post('/v1/classroom/trainings').set(bearer(board)).send({ slotAt: slots[0]!.at, topic: 'Smart board basics' }).expect(201);
    expect(made.body).toMatchObject({ status: 'requested', topic: 'Smart board basics' });
    const mine = (await http().get('/v1/classroom/trainings/mine').set(bearer(board)).expect(200)).body;
    expect(mine).toHaveLength(1);
    const all = (await http().get('/v1/classroom/trainings').set(bearer(principalTok)).expect(200)).body;
    expect(all[0]).toMatchObject({ id: made.body.id, requester: t.teacher.fullName });
    await http().get('/v1/classroom/trainings').set(bearer(teacherTok)).expect(403);
    await http().patch(`/v1/classroom/trainings/${made.body.id}`).set(bearer(principalTok)).send({ status: 'confirmed', adminNote: 'Room 2' }).expect(200);
    expect((await http().get('/v1/classroom/trainings/mine').set(bearer(board)).expect(200)).body[0]).toMatchObject({ status: 'confirmed', adminNote: 'Room 2' });
  });

  it('students buzz from the Student App: first buzz order reaches the board, teacher locks and resets', async () => {
    // Closed until the teacher opens it.
    expect((await http().get('/v1/student/buzzer').set(bearer(studentTok)).expect(200)).body).toMatchObject({ active: false });
    await http().post('/v1/student/buzzer/press').set(bearer(studentTok)).expect(400);

    const updates: { presses: unknown[] }[] = [];
    socket.on('buzzer.updated', (e) => updates.push(e));
    await http().post('/v1/classroom/buzzer/lock').set(bearer(board)).send({ locked: false }).expect(200);
    const pressed = (await http().post('/v1/student/buzzer/press').set(bearer(studentTok)).expect(200)).body;
    expect(pressed).toMatchObject({ active: true, myRank: 1 });
    await http().post('/v1/student/buzzer/press').set(bearer(studentTok)).expect(200); // a second tap keeps rank 1
    await new Promise((r) => setTimeout(r, 200));
    expect(updates.at(-1)?.presses).toHaveLength(1);
    const state = (await http().get('/v1/classroom/buzzer').set(bearer(board)).expect(200)).body;
    expect(state.presses).toEqual([expect.objectContaining({ rank: 1, studentId: t.studentUser.id, name: t.studentUser.fullName })]);

    await http().post('/v1/classroom/buzzer/lock').set(bearer(board)).send({ locked: true }).expect(200);
    await http().post('/v1/student/buzzer/press').set(bearer(studentTok)).expect(400);
    const reset = (await http().post('/v1/classroom/buzzer/reset').set(bearer(board)).expect(200)).body;
    expect(reset).toMatchObject({ locked: false, roundNo: 2, presses: [] });
    expect((await http().post('/v1/student/buzzer/press').set(bearer(studentTok)).expect(200)).body.myRank).toBe(1);
  });

  it('End class saves and publishes notes, closes the session and gives a summary and share link', async () => {
    const res = (await http().post('/v1/classroom/end').set(bearer(board)).send({ notes: 'Journal entries\n- debit / credit', publish: true }).expect(200)).body;
    expect(res).toMatchObject({ ended: true, notesSaved: true, published: true, summary: { buzzes: 2,buzzerRounds: 2 } });
    expect(res.sharePath).toMatch(/^\/v1\/class-notes\//);
    const open = await owner.query(`select count(*)::int n from board_sessions where tenant_id = $1 and ended_at is null`, [t.tenantId]);
    expect(open.rows[0].n).toBe(0);
    const notes = (await http().get('/v1/student/class-notes').set(bearer(studentTok)).expect(200)).body;
    expect(notes).toEqual([expect.objectContaining({ notes: 'Journal entries\n- debit / credit' })]);
    const page = await http().get(res.sharePath).expect(200);
    expect(page.text).toContain('Journal entries');
    await http().get(`/v1/class-notes/${t.tenantId}.nope`).expect(404);
  });
});
