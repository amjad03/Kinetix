import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/** Departments and the head of department's view. */
describe('departments', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let deptId: string;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = { teacher: await login(t.slug, t.teacher.email!), principal: await login(t.slug, t.principal.email!), outsider: await login(other.slug, other.principal.email!) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('lets the principal set up a department with an HOD as its head', async () => {
    await http().post('/v1/admin/departments').set(auth('teacher')).send({ name: 'Commerce' }).expect(403);
    const noRole = await http().post('/v1/admin/departments').set(auth('principal')).send({ name: 'Commerce', headUserId: t.teacher2.id }).expect(400);
    expect(noRole.body.message).toMatch(/HOD role/);

    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'hod')`, [t.tenantId, t.teacher2.id]);
    tokens.hod = await login(t.slug, t.teacher2.email!);
    deptId = (await http().post('/v1/admin/departments').set(auth('principal')).send({ name: 'Commerce', headUserId: t.teacher2.id }).expect(201)).body.id;
    const updated = await http()
      .put(`/v1/admin/departments/${deptId}`)
      .set(auth('principal'))
      .send({ staffIds: [t.teacher.id, t.teacher2.id], subjectIds: [t.subject.id] })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Commerce', head: expect.any(String), subjects: [{ id: t.subject.id }] });
    expect(updated.body.staff).toHaveLength(2);

    // Another institution cannot see or change it.
    await http().put(`/v1/admin/departments/${deptId}`).set(auth('outsider')).send({ name: 'x' }).expect(404);
    expect((await http().get('/v1/admin/departments').set(auth('outsider')).expect(200)).body).toEqual([]);
  });

  it("shows the head their department's classes: taught, attendance, homework and marks", async () => {
    await pairBoard(app, t, tokens.teacher); // Monday 10:00 class, taught on the board
    await owner.query(
      `insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at)
       select $1, s.id, s.section_id, $2, $3, case when s.id = $5 then 'absent'::attendance_status else 'present' end, $4, now() from students s where s.section_id = $6`,
      [t.tenantId, monday, t.slot.id, t.teacher.id, t.students[0].id, t.section.id],
    );
    await owner.query(`insert into homework (tenant_id, section_id, subject_id, created_by, title, due_on, created_at) values ($1, $2, $3, $4, 'Ex 3.1', $5, $6)`, [
      t.tenantId,
      t.section.id,
      t.subject.id,
      t.teacher.id,
      monday,
      clock.now(),
    ]);
    const a = (
      await http()
        .post('/v1/assessments')
        .set(auth('teacher'))
        .send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Unit test 1', kind: 'test', maxMarks: 20, heldOn: monday })
        .expect(201)
    ).body;
    await http()
      .put(`/v1/assessments/${a.id}/marks`)
      .set(auth('teacher'))
      .send({ entries: [{ studentId: t.students[0].id, marks: 10 }, { studentId: t.students[1].id, marks: 15 }] })
      .expect(200);
    await http().post(`/v1/assessments/${a.id}/publish`).set(auth('teacher')).expect(200);

    clock.at = nextMondayIst('11:30'); // the 10:00 period is over
    expect((await http().get('/v1/departments').set(auth('hod')).expect(200)).body).toEqual([{ id: deptId, name: 'Commerce', head: { id: t.teacher2.id, fullName: expect.any(String) } }]);
    await http().get('/v1/departments').set(auth('teacher')).expect(403);

    const o = (await http().get(`/v1/departments/${deptId}/overview?from=${monday}&to=${monday}`).set(auth('hod')).expect(200)).body;
    expect(o.department.name).toBe('Commerce');
    expect(o.totals).toMatchObject({ scheduled: 1, taught: 1, taughtPercent: 100, attendanceTaken: 1, attendanceTakenPercent: 100, homework: 1, assessments: 1, published: 1 });
    expect(o.totals.attendancePercent).toBe(Math.round(((t.students.length - 1) / t.students.length) * 100));
    expect(o.classes).toEqual([
      expect.objectContaining({ section: 'BCom Sem 3 A', subject: 'Corporate Accounting', teacherId: t.teacher.id, taught: 1, homework: 1, latestAssessment: expect.objectContaining({ title: 'Unit test 1', averagePercent: 62.5 }) }),
    ]);
    const anita = o.teachers.find((x: { id: string }) => x.id === t.teacher.id);
    expect(anita).toMatchObject({ scheduled: 1, taught: 1, homework: 1 });
    expect(o.teachers.find((x: { id: string }) => x.id === t.teacher2.id)).toMatchObject({ scheduled: 0, taughtPercent: null });

    // The head reads the department's marks, though they do not teach the class.
    expect((await http().get(`/v1/assessments/${a.id}`).set(auth('hod')).expect(200)).body.stats).toMatchObject({ average: 12.5 });
    expect((await http().get(`/v1/assessments?sectionId=${t.section.id}`).set(auth('hod')).expect(200)).body).toHaveLength(1);
    await http().put(`/v1/assessments/${a.id}/marks`).set(auth('hod')).send({ entries: [{ studentId: t.students[0].id, marks: 20 }] }).expect(403);

    // The principal opens any department; a head only their own; others see nothing.
    await http().get(`/v1/departments/${deptId}/overview`).set(auth('principal')).expect(200);
    await http().get(`/v1/departments/${deptId}/overview`).set(auth('outsider')).expect(404);
    await http().get(`/v1/departments/${deptId}/overview?from=${monday}&to=2020-01-01`).set(auth('hod')).expect(400);
  });

  it('stops showing the department once the head is changed', async () => {
    await http().put(`/v1/admin/departments/${deptId}`).set(auth('principal')).send({ headUserId: null }).expect(200);
    expect((await http().get('/v1/departments').set(auth('hod')).expect(200)).body).toEqual([]);
    await http().get(`/v1/departments/${deptId}/overview`).set(auth('hod')).expect(404);
    await http().delete(`/v1/admin/departments/${deptId}`).set(auth('principal')).expect(204);
    const { rows } = await owner.query(`select department_id from subjects where id = $1`, [t.subject.id]);
    expect(rows[0].department_id).toBeNull();
  });
});
