import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Fee holds across offices: with the institution's dues block on (off by default), overdue fees hold back the hall
 * ticket, the result shown to the student and family, and the transfer certificate, with a clear message; the
 * principal can let one through for a student (audited) and withdraw that again.
 */
describe('fee holds on hall tickets, results and the TC', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T06:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  let sessionId = '';
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const actions = async () => (await owner.query('select action from audit_log where tenant_id = $1', [t.tenantId])).rows.map((r) => r.action as string);

  beforeAll(async () => {
    t = await createTenant(owner);
    const [acc] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Rekha Accounts', email: 'rekha@holds.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: acc.id, role: 'accountant' });
    app = await createApp(clock);
    tok.acc = await login(t.slug, 'rekha@holds.in');
    tok.principal = await login(t.slug, t.principal.email!);
    tok.parent = await login(t.slug, t.guardian.email!);
    // Student A owes a fee that fell due ten days ago.
    await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Semester fee', amountPaise: 1_250_000, dueOn: '2026-10-10', createdBy: t.principal.id });
    sessionId = (await http().post('/v1/exam-sessions').set(as('principal')).send({ academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Semester 3 end exam Nov 2026', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
    await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send({ subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201);
    await http().post(`/v1/exam-sessions/${sessionId}/schedule`).set(as('principal')).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const issueTickets = async () => (await http().post(`/v1/exam-sessions/${sessionId}/hall-tickets`).set(as('principal')).send({}).expect(200)).body;
  const ticketPdf = (who: string) => http().get(`/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[0].id}/pdf`).set(as(who));

  it('holds nothing while the setting is off', async () => {
    expect(await issueTickets()).toEqual({ issued: 3, blocked: 0 });
    await ticketPdf('parent').expect(200);
    expect((await http().get(`/v1/fee-holds/${t.students[0].id}`).set(as('acc')).expect(200)).body.holds.every((h: { held: boolean }) => !h.held)).toBe(true);
  });

  it('holds the hall ticket for overdue fees until the principal lets it through', async () => {
    await http().put('/v1/fee-accounts/settings').set(as('acc')).send({ duesBlock: { hallTicket: true, results: true, tc: true, minRupees: 100 } }).expect(200);
    // A ticket already out is held as soon as the dues are overdue.
    expect((await ticketPdf('parent').expect(403)).body.message).toMatch(/hall ticket is held for unpaid fees: Rs\. 12,500\.00 is overdue/);
    expect(await issueTickets()).toEqual({ issued: 2, blocked: 1 });
    const list = (await http().get(`/v1/exam-sessions/${sessionId}/hall-tickets`).set(as('principal')).expect(200)).body;
    expect(list.find((x: { studentId: string }) => x.studentId === t.students[0].id).blockedReason).toMatch(/unpaid fees/);

    await http().post(`/v1/fee-holds/${t.students[0].id}/overrides`).set(as('acc')).send({ purpose: 'hallTicket', reason: 'Instalment promised' }).expect(403);
    const o = (await http().post(`/v1/fee-holds/${t.students[0].id}/overrides`).set(as('principal')).send({ purpose: 'hallTicket', reason: 'Instalment agreed with the family' }).expect(201)).body;
    await http().post(`/v1/fee-holds/${t.students[0].id}/overrides`).set(as('principal')).send({ purpose: 'hallTicket', reason: 'Again' }).expect(409);
    expect(await issueTickets()).toEqual({ issued: 3, blocked: 0 });
    await ticketPdf('parent').expect(200);
    const st = (await http().get(`/v1/fee-holds/${t.students[0].id}`).set(as('acc')).expect(200)).body;
    expect(st.holds.find((h: { purpose: string }) => h.purpose === 'hallTicket')).toMatchObject({ held: true, overridden: true, message: null });
    expect(st.overrides[0]).toMatchObject({ purpose: 'hallTicket', reason: 'Instalment agreed with the family' });

    expect(st.holds.every((h: { enabled: boolean }) => h.enabled)).toBe(true);
    // The overrides in force, across students, for the fees office's list.
    const current = (await http().get('/v1/fee-holds').set(as('acc')).expect(200)).body;
    expect(current).toEqual([expect.objectContaining({ id: o.id, studentId: t.students[0].id, studentName: t.students[0].fullName, purpose: 'hallTicket', grantedBy: t.principal.fullName, revokedAt: null })]);
    await http().get('/v1/fee-holds').set(as('parent')).expect(403);

    // Withdrawn, the hold applies again.
    await http().delete(`/v1/fee-holds/overrides/${o.id}`).set(as('acc')).send({ reason: 'Instalment not paid' }).expect(403);
    await http().delete(`/v1/fee-holds/overrides/${o.id}`).set(as('principal')).send({ reason: 'Instalment not paid' }).expect(200);
    expect((await http().get('/v1/fee-holds').set(as('acc')).expect(200)).body).toEqual([]);
    expect((await http().get('/v1/fee-holds?all=1').set(as('acc')).expect(200)).body).toEqual([expect.objectContaining({ id: o.id, revokedBy: t.principal.fullName })]);
    await ticketPdf('parent').expect(403);
    expect(await actions()).toEqual(expect.arrayContaining(['fee_hold.overridden', 'fee_hold.override_revoked']));
  });

  it('holds the result from the family but not from staff', async () => {
    expect((await http().get(`/v1/results/students/${t.students[0].id}/transcript.pdf`).set(as('parent')).expect(403)).body.message).toMatch(/result is held for unpaid fees/);
    // Staff are not held back (here there is simply nothing published yet).
    await http().get(`/v1/results/students/${t.students[0].id}/transcript.pdf`).set(as('principal')).expect(404);
    expect((await http().get(`/v1/results/students/${t.students[0].id}`).set(as('parent')).expect(200)).body).toMatchObject({ cgpa: null, terms: [] });
  });

  it('holds the transfer certificate until the dues are cleared or allowed', async () => {
    const tmpl = (await owner.query(`insert into certificate_templates (tenant_id, kind, name, subject_type, title, body, serial_prefix) values ($1, 'transfer_certificate', 'TC', 'student', 'TC', 'Certified that the student studied here', 'TC') returning id`, [t.tenantId])).rows[0].id;
    const req = (await http().post('/v1/documents/requests').set(as('principal')).send({ templateId: tmpl, studentId: t.students[0].id, purpose: 'Higher studies' }).expect(201)).body;
    await http().post(`/v1/documents/requests/${req.id}/approve`).set(as('principal')).send({}).expect(200);
    expect((await http().post(`/v1/documents/requests/${req.id}/issue`).set(as('principal')).expect(403)).body.message).toMatch(/transfer certificate is held for unpaid fees/);
    await http().post(`/v1/fee-holds/${t.students[0].id}/overrides`).set(as('principal')).send({ purpose: 'tc', reason: 'Leaving for a scholarship abroad' }).expect(201);
    expect((await http().post(`/v1/documents/requests/${req.id}/issue`).set(as('principal')).expect(200)).body).toMatchObject({ status: 'issued' });
  });
});
