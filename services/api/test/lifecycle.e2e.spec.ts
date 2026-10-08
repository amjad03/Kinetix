import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('student lifecycle', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let sem4: string;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const status = (id: string, body: object) => http().post(`/v1/students/${id}/status`).set(as('principal')).send(body);
  const profile = async (id: string) => (await http().get(`/v1/students/${id}/profile`).set(as('principal')).expect(200)).body;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const year = (await owner.query(`select academic_year_id as id from sections where id = $1`, [t.section.id])).rows[0].id;
    sem4 = (await owner.query(`insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name) values ($1, $2, $3, 4, 'A', 'BCom Sem 4 A') returning id`, [t.tenantId, t.program.id, year])).rows[0].id;
    app = await createApp(new FixedClock(new Date()));
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('applies the transition rules and keeps the reasons on the record', async () => {
    const [s1, s2] = t.students;
    await status(s1.id, { status: 'active' }).expect(400); // already active
    await status(s1.id, { status: 'enrolled' }).expect(400); // cannot go back
    await status(s1.id, { status: 'on_leave' }).expect(400); // a reason is needed
    await status(s1.id, { status: 'alumni', reason: 'done' }).expect(400); // Sem 3 of 6 is not the final term
    await status(s1.id, { status: 'on_leave', reason: 'Medical leave for a term', returnOn: '2099-01-01' }).expect(200);
    await http().post(`/v1/students/${s1.id}/status`).set(as('teacher')).send({ status: 'active' }).expect(403);
    await http().post(`/v1/students/${s1.id}/status`).set(as('outsider')).send({ status: 'active' }).expect(404);
    await status(s1.id, { status: 'active' }).expect(200);
    await status(s2.id, { status: 'transferred', reason: 'Moved to another city' }).expect(200);
    await status(s2.id, { status: 'active' }).expect(400); // transferred is final

    const p = await profile(s1.id);
    expect(p).toMatchObject({ status: 'active', finalTerm: false, section: { displayName: 'BCom Sem 3 A' } });
    expect(p.timeline.map((e: { fromStatus: string; toStatus: string; reason: string | null }) => [e.fromStatus, e.toStatus, e.reason])).toEqual([['on_leave', 'active', null], ['active', 'on_leave', 'Medical leave for a term']]);
    expect(p.timeline[0].actorName).toBe(t.principal.fullName);
    expect(p.allowedStatuses).toEqual(['on_leave', 'detained', 'promoted', 'transferred', 'dropped', 'suspended', 'expelled', 'deceased']);
    expect((await owner.query(`select count(*)::int as n from audit_log where subject_id = $1 and action = 'students.status_changed.v1'`, [s1.id])).rows[0].n).toBe(2);
  });

  it('promotes a class in bulk, detains who it is told to, and previews first', async () => {
    const [, , s3] = t.students;
    const [s1] = t.students;
    const body = { label: '2026-27 to 2027-28', mappings: [{ fromSectionId: t.section.id, toSectionId: sem4 }], detain: [{ studentId: s3.id, reason: 'Attendance below 50%' }] };
    await http().post('/v1/students/promotions').set(as('teacher')).send(body).expect(403);
    await http().post('/v1/students/promotions').set(as('principal')).send({ ...body, mappings: [{ fromSectionId: t.section.id, toSectionId: t.otherSection.id }] }).expect(400); // not the next term
    await http().post('/v1/students/promotions').set(as('principal')).send({ ...body, mappings: [{ fromSectionId: t.section.id, toSectionId: null }] }).expect(400); // not final: choose where it goes
    await http().post('/v1/students/promotions').set(as('principal')).send({ ...body, detain: [{ studentId: t.students[1].id, reason: 'x y z' }] }).expect(400); // already transferred

    const dry = (await http().post('/v1/students/promotions').set(as('principal')).send({ ...body, dryRun: true }).expect(200)).body;
    expect(dry).toMatchObject({ dryRun: true, promoted: 1, detained: 1, graduated: 0, skipped: 1, batchId: null });
    expect((await profile(s1.id)).section.displayName).toBe('BCom Sem 3 A'); // nothing happened

    const done = (await http().post('/v1/students/promotions').set(as('principal')).send(body).expect(200)).body;
    expect(done).toMatchObject({ dryRun: false, promoted: 1, detained: 1, skipped: 1 });
    const p1 = await profile(s1.id);
    expect(p1).toMatchObject({ status: 'active', section: { displayName: 'BCom Sem 4 A' }, rollNo: 'R1' });
    expect(p1.timeline[0]).toMatchObject({ kind: 'promotion', fromSection: 'BCom Sem 3 A', toSection: 'BCom Sem 4 A', batchId: done.batchId });
    const p3 = await profile(s3.id);
    expect(p3).toMatchObject({ status: 'detained', section: { displayName: 'BCom Sem 3 A' } });
    expect(p3.timeline[0]).toMatchObject({ toStatus: 'detained', reason: 'Attendance below 50%' });
    const hist = (await http().get('/v1/students/promotions/history').set(as('principal')).expect(200)).body;
    expect(hist[0]).toMatchObject({ label: '2026-27 to 2027-28', summary: expect.objectContaining({ promoted: 1 }) });
    await status(s3.id, { status: 'active' }).expect(200); // a detained student can rejoin
  });

  it('graduates a final-term class and lets the school move a student between classes', async () => {
    const year = (await owner.query(`select academic_year_id as id from sections where id = $1`, [t.section.id])).rows[0].id;
    const final = (await owner.query(`insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name) values ($1, $2, $3, 6, 'A', 'BCom Sem 6 A') returning id`, [t.tenantId, t.program.id, year])).rows[0].id;
    const st = (await owner.query(`insert into students (tenant_id, section_id, roll_no, full_name) values ($1, $2, '1', 'Final Year') returning id`, [t.tenantId, final])).rows[0].id;
    await status(st, { status: 'promoted' }).expect(400); // final-term students graduate instead
    await http().post('/v1/students/promotions').set(as('principal')).send({ label: 'Graduation 2027', mappings: [{ fromSectionId: final, toSectionId: null }] }).expect(200);
    const p = await profile(st);
    expect(p).toMatchObject({ status: 'alumni', finalTerm: true, allowedStatuses: [] });
    await status(st, { status: 'active' }).expect(400);

    const s1 = t.students[0].id;
    await http().post(`/v1/students/${s1}/section`).set(as('principal')).send({ sectionId: t.section.id, reason: 'moving back' }).expect(200);
    await http().post(`/v1/students/${s1}/section`).set(as('principal')).send({ sectionId: t.section.id, reason: 'again' }).expect(400); // already there
    const moved = await profile(s1);
    expect(moved.section.displayName).toBe('BCom Sem 3 A');
    expect(moved.timeline[0]).toMatchObject({ kind: 'section', fromSection: 'BCom Sem 4 A', toSection: 'BCom Sem 3 A', reason: 'moving back' });
  });

  it('links guardians by phone, keeps one primary, and blocks removing the last', async () => {
    const [s1] = t.students; // already has the test guardian
    const first = (await profile(s1.id)).guardians;
    expect(first).toHaveLength(1);
    const g = (body: object) => http().post(`/v1/students/${s1.id}/guardians`).set(as('principal')).send(body);
    await g({ fullName: 'Aunt', phone: 'abc' }).expect(400);
    const added = await g({ fullName: 'Uncle Rao', phone: '98000 55555', relation: 'uncle', isPrimary: true, isEmergencyContact: true }).expect(201);
    await g({ fullName: 'Uncle Rao', phone: '+919800055555' }).expect(409); // already linked
    let now = (await profile(s1.id)).guardians;
    expect(now.find((x: { isPrimary: boolean }) => x.isPrimary)).toMatchObject({ fullName: 'Uncle Rao', phone: '+919800055555', isEmergencyContact: true });
    await http().patch(`/v1/students/${s1.id}/guardians/${added.body.id}`).set(as('principal')).send({ isPrimary: false }).expect(400); // name another primary instead
    await http().delete(`/v1/students/${s1.id}/guardians/${added.body.id}`).set(as('principal')).expect(204);
    now = (await profile(s1.id)).guardians;
    expect(now).toHaveLength(1);
    expect(now[0].isPrimary).toBe(true); // passed to the remaining guardian
    await http().delete(`/v1/students/${s1.id}/guardians/${now[0].id}`).set(as('principal')).expect(400); // the last one
    await http().get(`/v1/students/${s1.id}/profile`).set(as('parent')).expect(403); // families see their own app, not the record
    await http().get(`/v1/students/${s1.id}/profile`).set(as('outsider')).expect(404);
    const list = (await http().get('/v1/students?status=active&q=Student').set(as('principal')).expect(200)).body;
    expect(list.length).toBeGreaterThan(0);
  });

  it('closes the login of a student who transfers out', async () => {
    const stu = t.students[2]; // has their own login
    expect((await owner.query(`select status from users where id = $1`, [t.studentUser.id])).rows[0].status).toBe('active');
    await status(stu.id, { status: 'dropped', reason: 'Left the programme' }).expect(200);
    expect((await owner.query(`select status from users where id = $1`, [t.studentUser.id])).rows[0].status).toBe('disabled');
  });
});
