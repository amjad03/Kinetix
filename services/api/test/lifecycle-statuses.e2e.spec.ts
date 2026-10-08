import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('student lifecycle: suspension, leave, expulsion, readmission, transfer out', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const status = (id: string, body: object) => http().post(`/v1/students/${id}/status`).set(as('principal')).send(body);
  const roster = async () => (await http().get(`/v1/sections/${t.section.id}/roster`).set(as('teacher')).expect(200)).body.map((r: { id: string }) => r.id) as string[];

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    tokens = { principal: await login(t.slug, t.principal.email!), teacher: await login(t.slug, t.teacher.email!) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('suspends with an approver and keeps the student off the attendance roster', async () => {
    const [a] = t.students;
    expect(await roster()).toContain(a.id);
    await status(a.id, { status: 'suspended' }).expect(400); // reason needed
    await status(a.id, { status: 'suspended', reason: 'Misconduct in exam', approverId: t.guardian.id }).expect(400); // approver must be staff
    const res = await status(a.id, { status: 'suspended', reason: 'Misconduct in exam', effectiveOn: '2020-01-01', returnOn: '2020-02-01', approverId: t.teacher.id }).expect(200);
    expect(res.body).toMatchObject({ to: 'suspended', approverId: t.teacher.id, returnOn: '2020-02-01' });
    expect(await roster()).not.toContain(a.id);

    const hist = (await http().get(`/v1/students/${a.id}/status-history`).set(as('principal')).expect(200)).body;
    expect(hist[0]).toMatchObject({ toStatus: 'suspended', reason: 'Misconduct in exam', effectiveOn: '2020-01-01', returnOn: '2020-02-01', approverName: t.teacher.fullName });
    const away = (await http().get('/v1/students/absences').set(as('principal')).expect(200)).body;
    expect(away.find((x: { id: string }) => x.id === a.id)).toMatchObject({ status: 'suspended', returnOn: '2020-02-01', overdue: true });

    await status(a.id, { status: 'active' }).expect(200);
    expect(await roster()).toContain(a.id);
  });

  it('needs a return date for a leave of absence', async () => {
    const b = t.students[1];
    await status(b.id, { status: 'on_leave', reason: 'Illness' }).expect(400);
    await status(b.id, { status: 'on_leave', reason: 'Illness', effectiveOn: '2026-10-05', returnOn: '2020-01-01' }).expect(400);
    await status(b.id, { status: 'on_leave', reason: 'Illness', returnOn: '2099-01-01' }).expect(200);
    expect(await roster()).not.toContain(b.id);
    await status(b.id, { status: 'active', reason: 'Back' }).expect(200);
  });

  it('expels, then readmits with a reason and approver', async () => {
    const c = t.students[2]; // has a login
    await status(c.id, { status: 'expelled', reason: 'Serious violation', approverId: t.principal.id }).expect(200);
    expect((await owner.query(`select status from users where id = $1`, [t.studentUser.id])).rows[0].status).toBe('disabled');
    await status(c.id, { status: 'active' }).expect(400); // final through the normal route
    await http().post(`/v1/students/${c.id}/readmit`).set(as('principal')).send({ reason: 'x' }).expect(400);
    await http().post(`/v1/students/${c.id}/readmit`).set(as('teacher')).send({ reason: 'Appeal upheld' }).expect(403);
    await http().post(`/v1/students/${c.id}/readmit`).set(as('principal')).send({ reason: 'Appeal upheld', sectionId: t.otherSection.id }).expect(200);
    expect((await owner.query(`select status from users where id = $1`, [t.studentUser.id])).rows[0].status).toBe('active');
    const hist = (await http().get(`/v1/students/${c.id}/status-history`).set(as('principal')).expect(200)).body;
    expect(hist[0]).toMatchObject({ fromStatus: 'expelled', toStatus: 'active', readmission: true, reason: 'Appeal upheld' });
    expect((await http().get(`/v1/students/${c.id}/profile`).set(as('principal')).expect(200)).body.section.displayName).toBe('BCom Sem 3 B');
    await http().post(`/v1/students/${c.id}/readmit`).set(as('principal')).send({ reason: 'Again please' }).expect(400); // already active
  });

  it('links the issued transfer certificate to a transfer-out and records deaths', async () => {
    const a = t.students[0];
    const tmpl = (await owner.query(`insert into certificate_templates (tenant_id, kind, name, subject_type, title, body, serial_prefix) values ($1, 'transfer_certificate', 'TC', 'student', 'TC', 'Body of the certificate text', 'TC') returning id`, [t.tenantId])).rows[0].id;
    const draft = (await owner.query(`insert into certificates (tenant_id, template_id, subject_type, student_id, requested_by, status) values ($1, $2, 'student', $3, $4, 'requested') returning id`, [t.tenantId, tmpl, a.id, t.principal.id])).rows[0].id;
    await status(a.id, { status: 'transferred', reason: 'Moving cities', certificateId: draft }).expect(400); // not issued yet
    await owner.query(`update certificates set status = 'issued', serial_no = 'TC/2026/0001', issued_at = now() where id = $1`, [draft]);
    const other = (await owner.query(`insert into certificates (tenant_id, template_id, subject_type, student_id, requested_by, status) values ($1, $2, 'student', $3, $4, 'issued') returning id`, [t.tenantId, tmpl, t.students[1].id, t.principal.id])).rows[0].id;
    await status(a.id, { status: 'transferred', reason: 'Moving cities', certificateId: other }).expect(400); // someone else's
    const res = await status(a.id, { status: 'transferred', reason: 'Moving cities', certificateId: draft }).expect(200);
    expect(res.body.certificateId).toBe(draft);
    const hist = (await http().get(`/v1/students/${a.id}/status-history`).set(as('principal')).expect(200)).body;
    expect(hist[0]).toMatchObject({ toStatus: 'transferred', certificateSerial: 'TC/2026/0001' });
    // Readmission is possible after a transfer-out.
    await http().post(`/v1/students/${a.id}/readmit`).set(as('principal')).send({ reason: 'Returned to the city' }).expect(200);

    const d = t.students[1];
    await status(d.id, { status: 'deceased', reason: 'Passed away' }).expect(200);
    await http().post(`/v1/students/${d.id}/readmit`).set(as('principal')).send({ reason: 'Not possible' }).expect(400);
    expect(await roster()).not.toContain(d.id);
    expect((await owner.query(`select count(*)::int as n from audit_log where subject_id = $1 and action = 'students.status_changed.v1'`, [d.id])).rows[0].n).toBeGreaterThan(0);
  });
});
