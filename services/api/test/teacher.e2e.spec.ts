import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

describe('Teacher App endpoints', () => {
  const owner = ownerPool();
  // Monday 10:30 IST: in the middle of the fixture teacher's 10:00–10:55 period.
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = new Date(clock.at.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const shift = (days: number) => new Date(new Date(`${monday}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let teacher: string;
  let teacher2: string;
  let principal: string;
  let student: string;

  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (token: string) => ({
    get: (path: string) => http().get(path).set('authorization', `Bearer ${token}`),
    post: (path: string, body?: object) => http().post(path).set('authorization', `Bearer ${token}`).send(body),
  });

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    teacher = await login(t.slug, t.teacher.email!);
    teacher2 = await login(t.slug, t.teacher2.email!);
    principal = await login(t.slug, t.principal.email!);
    student = await login(t.slug, t.studentUser.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('GET /v1/me returns the profile with roles and institution', async () => {
    const res = await as(teacher).get('/v1/me').expect(200);
    expect(res.body).toMatchObject({ id: t.teacher.id, fullName: t.teacher.fullName, preferredLanguage: 'en', roles: ['teacher'] });
    expect(res.body.tenant.name).toMatch(/^Tenant /);
    await http().get('/v1/me').expect(401);
  });

  it("returns today's periods with the current one flagged, and points an empty day at the next one", async () => {
    const today = await as(teacher).get('/v1/teacher/timetable').expect(200);
    expect(today.body).toMatchObject({ date: monday, today: monday, isoWeekday: 1 });
    expect(today.body.periods).toHaveLength(1);
    expect(today.body.periods[0]).toMatchObject({
      slotId: t.slot.id,
      startsAt: '10:00:00',
      endsAt: '10:55:00',
      section: { displayName: 'BCom Sem 3 A' },
      subject: { name: 'Corporate Accounting', code: 'BCOM-3.1' },
      room: { name: 'Room 1' },
      isNow: true,
      attendanceTaken: false,
    });

    const sunday = await as(teacher).get(`/v1/teacher/timetable?date=${shift(-1)}`).expect(200);
    expect(sunday.body).toMatchObject({ isoWeekday: 7, periods: [], nextTeachingDate: monday });

    // Next Monday: same period, but not "now".
    const nextWeek = await as(teacher).get(`/v1/teacher/timetable?date=${shift(7)}`).expect(200);
    expect(nextWeek.body.periods[0].isNow).toBe(false);

    await as(teacher).get('/v1/teacher/timetable?date=2026-02-30').expect(400);
    await as(student).get('/v1/teacher/timetable').expect(403);
  });

  it('lists the classes a teacher is timetabled for', async () => {
    const res = await as(teacher).get('/v1/teacher/classes').expect(200);
    expect(res.body).toEqual([{ section: { id: t.section.id, displayName: 'BCom Sem 3 A' }, subject: { id: t.subject.id, code: 'BCOM-3.1', name: 'Corporate Accounting' } }]);
    expect((await as(teacher2).get('/v1/teacher/classes').expect(200)).body).toEqual([]);
  });

  it('shows a roster only to teachers of the class, principals and admins', async () => {
    const res = await as(teacher).get(`/v1/sections/${t.section.id}/roster`).expect(200);
    expect(res.body.map((s: { rollNo: string }) => s.rollNo)).toEqual(['R1', 'R2', 'R3']);
    expect(Object.keys(res.body[0]).sort()).toEqual(['fullName', 'id', 'rollNo']);
    await as(principal).get(`/v1/sections/${t.section.id}/roster`).expect(200);
    await as(teacher2).get(`/v1/sections/${t.section.id}/roster`).expect(403);
    await as(student).get(`/v1/sections/${t.section.id}/roster`).expect(403);
    // Another institution's class does not exist as far as this tenant can see.
    await as(teacher).get(`/v1/sections/${other.section.id}/roster`).expect(404);
  });

  it('records attendance for a period, reloads it, and flags the period as taken', async () => {
    const [a, b, c] = t.students;
    const res = await as(teacher)
      .post('/v1/attendance', {
        slotId: t.slot.id,
        date: monday,
        records: [
          { studentId: a.id, status: 'present' },
          { studentId: b.id, status: 'absent' },
          { studentId: c.id, status: 'late' },
        ],
      })
      .expect(201);
    expect(res.body).toMatchObject({ taken: true, counts: { present: 1, absent: 1, late: 1, excused: 0 } });

    const sheet = await as(teacher).get(`/v1/attendance?slotId=${t.slot.id}&date=${monday}`).expect(200);
    expect(sheet.body.records).toHaveLength(3);
    expect(sheet.body.records.find((r: { studentId: string }) => r.studentId === b.id).status).toBe('absent');

    const tt = await as(teacher).get('/v1/teacher/timetable').expect(200);
    expect(tt.body.periods[0].attendanceTaken).toBe(true);

    // A correction a minute later replaces the mark (last writer wins).
    clock.at = new Date(clock.at.getTime() + 60_000);
    const fixed = await as(teacher).post('/v1/attendance', { slotId: t.slot.id, date: monday, records: [{ studentId: b.id, status: 'present' }] }).expect(201);
    expect(fixed.body.counts).toEqual({ present: 2, absent: 0, late: 1, excused: 0 });
  });

  it('rejects attendance for students outside the class, other teachers, future dates and wrong days', async () => {
    const mark = (studentId: string) => [{ studentId, status: 'present' }];
    // A student from another institution: the FK would accept the id, the RLS lookup does not.
    const stranger = await as(teacher).post('/v1/attendance', { slotId: t.slot.id, date: monday, records: mark(other.students[0].id) }).expect(400);
    expect(stranger.body.studentIds).toEqual([other.students[0].id]);
    await as(teacher2).post('/v1/attendance', { slotId: t.slot.id, date: monday, records: mark(t.students[0].id) }).expect(403);
    await as(teacher2).get(`/v1/attendance?slotId=${t.slot.id}&date=${monday}`).expect(403);
    await as(teacher).post('/v1/attendance', { slotId: t.slot.id, date: shift(7), records: mark(t.students[0].id) }).expect(400);
    await as(teacher).post('/v1/attendance', { slotId: t.slot.id, date: shift(-1), records: mark(t.students[0].id) }).expect(400);
    await as(teacher).post('/v1/attendance', { slotId: other.slot.id, date: monday, records: mark(t.students[0].id) }).expect(404);
    await as(teacher).post('/v1/attendance', { slotId: t.slot.id, date: monday, records: [] }).expect(400);
  });

  it("shows the teacher's active board session until the class is ended", async () => {
    expect((await as(teacher).get('/v1/teacher/session').expect(200)).body).toEqual({ active: null });

    const enrolled = await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201);
    const { code } = (await http().post('/v1/devices/me/pairing-codes').set('authorization', `Bearer ${enrolled.body.deviceToken}`).expect(201)).body;
    const claim = await as(teacher).post('/v1/pairing/claim', { code }).expect(200);

    const res = await as(teacher).get('/v1/teacher/session').expect(200);
    expect(res.body.active.board).toEqual({ id: t.device.id, name: 'Room 1 Board' });
    expect(res.body.active.session).toMatchObject({ sessionId: claim.body.session.sessionId, section: { displayName: 'BCom Sem 3 A' } });
    // Another teacher does not see it.
    expect((await as(teacher2).get('/v1/teacher/session').expect(200)).body).toEqual({ active: null });

    await as(teacher).post(`/v1/sessions/${claim.body.session.sessionId}/end`).expect(201);
    expect((await as(teacher).get('/v1/teacher/session').expect(200)).body).toEqual({ active: null });
  });

  it('assigns homework to a class the teacher teaches and lists it', async () => {
    const body = { sectionId: t.section.id, subjectId: t.subject.id, title: 'Exercise 4.2', instructions: 'Questions 1 to 5', dueOn: shift(2) };
    const created = await as(teacher).post('/v1/homework', body).expect(201);
    expect(created.body).toMatchObject({
      title: 'Exercise 4.2',
      dueOn: shift(2),
      section: { displayName: 'BCom Sem 3 A' },
      subject: { name: 'Corporate Accounting' },
      createdBy: { id: t.teacher.id },
      boardSessionId: null,
    });

    const mine = await as(teacher).get('/v1/teacher/homework').expect(200);
    expect(mine.body.map((h: { id: string }) => h.id)).toEqual([created.body.id]);
    const forClass = await as(principal).get(`/v1/homework?sectionId=${t.section.id}`).expect(200);
    expect(forClass.body).toHaveLength(1);
    expect((await as(teacher2).get('/v1/teacher/homework').expect(200)).body).toEqual([]);
  });

  it('rejects homework for other classes, foreign subjects and past due dates', async () => {
    const body = { sectionId: t.section.id, subjectId: t.subject.id, title: 'x', dueOn: shift(1) };
    await as(teacher2).post('/v1/homework', body).expect(403);
    await as(teacher).post('/v1/homework', { ...body, subjectId: other.subject.id }).expect(400);
    await as(teacher).post('/v1/homework', { ...body, sectionId: other.section.id }).expect(404);
    await as(teacher).post('/v1/homework', { ...body, dueOn: shift(-1) }).expect(400);
    await as(teacher).post('/v1/homework', { ...body, title: '  ' }).expect(400);
    await as(teacher2).get(`/v1/homework?sectionId=${t.section.id}`).expect(403);
    await as(student).post('/v1/homework', body).expect(403);
  });
});
