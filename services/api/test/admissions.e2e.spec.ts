import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import { DemoPaymentProvider } from '../src/fees/payment-provider.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4\n% marksheet\n');

describe('admissions: enquiry to enrolled student', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let cycleId: string;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const pub = (path: string) => `/v1/public/admissions/${t.slug}${path}`;
  const apply = (n: number, marks: number, extra: object = {}) =>
    http()
      .post(pub(`/cycles/${cycleId}/applications`))
      .send({ applicantName: `Applicant ${n}`, dateOfBirth: '2008-03-10', phone: `+9198000100${n}0`, guardianName: `Parent ${n}`, guardianPhone: `+9198000200${n}0`, guardianEmail: `parent${n}@example.in`, answers: { marks_12th: marks, stream: 'Commerce' }, ...extra });
  const apps: { id: string; token: string; no: string }[] = [];
  const staffStatus = (i: number, status: string, reason?: string) => http().post(`/v1/admissions/applications/${apps[i].id}/status`).set(as('officer')).send({ status, reason });
  const view = (i: number) => http().get(pub(`/applications/${apps[i].id}`)).set('x-application-token', apps[i].token);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const u = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Officer', $2, $3) returning id`, [t.tenantId, `officer@${t.slug}.in`, hash]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'admissions_officer')`, [t.tenantId, u.rows[0].id]);
    app = await createApp(new FixedClock(new Date()), (b) => b.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'demo' })));
    tokens = {
      officer: await login(t.slug, `officer@${t.slug}.in`),
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

  it('lets only admissions staff in, and keeps institutions apart', async () => {
    await http().get('/v1/admissions/enquiries').expect(401);
    await http().get('/v1/admissions/enquiries').set(as('teacher')).expect(403);
    await http().get('/v1/admissions/cycles').set(as('parent')).expect(403);
    await http().get('/v1/admissions/cycles').set(as('officer')).expect(200);
  });

  it('configures a cycle per program and refuses rules that name unknown questions', async () => {
    const base = {
      programId: t.program.id,
      academicYearId: (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id,
      name: 'BCom 2026 intake',
      entryTerm: 3,
      seats: 2,
      opensOn: istDay(-1),
      closesOn: istDay(30),
      applicationFeePaise: 50_000,
      formFields: [
        { key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 },
        { key: 'stream', label: 'Stream', type: 'select', required: true, options: ['Commerce', 'Science', 'Arts'] },
      ],
      documents: [{ key: 'marksheet', label: '12th marksheet', required: true }],
      eligibility: { minAge: 15, minimums: [{ field: 'marks_12th', min: 40 }], allowed: [{ field: 'stream', values: ['Commerce', 'Science'] }] },
      meritRules: [{ field: 'marks_12th', weight: 1 }],
    };
    await http().post('/v1/admissions/cycles').set(as('officer')).send({ ...base, meritRules: [{ field: 'nope', weight: 1 }] }).expect(400);
    await http().post('/v1/admissions/cycles').set(as('officer')).send({ ...base, closesOn: istDay(-5) }).expect(400);
    await http().post('/v1/admissions/cycles').set(as('officer')).send({ ...base, entryTerm: 9 }).expect(400);
    const made = await http().post('/v1/admissions/cycles').set(as('officer')).send(base).expect(201);
    cycleId = made.body.id;
    expect((await http().get(pub('/cycles')).expect(200)).body.cycles).toHaveLength(0); // still a draft
    await http().post(`/v1/admissions/cycles/${cycleId}/status`).set(as('officer')).send({ status: 'open' }).expect(200);
    const open = (await http().get(pub('/cycles')).expect(200)).body;
    expect(open.cycles).toHaveLength(1);
    expect(open.cycles[0]).toMatchObject({ programName: 'BCom', applicationFeePaise: 50_000 });
    expect(open.cycles[0].formFields).toHaveLength(2);
    await http().get(`/v1/public/admissions/nope/cycles`).expect(404);
  });

  it('takes public enquiries, merges repeats, and runs them through the pipeline', async () => {
    const body = { name: 'Riya Shah', phone: '98000 33333', programId: t.program.id, message: 'Fees?' };
    await http().post(pub('/enquiries')).send(body).expect(201);
    await http().post(pub('/enquiries')).send(body).expect(201); // the same family again: one enquiry
    await http().post(pub('/enquiries')).send({ ...body, name: 'Bot', phone: '98000 44444', website: 'http://spam' }).expect(201); // honeypot: ignored
    await http().post(pub('/enquiries')).send({ name: 'x', phone: '12' }).expect(400);

    const list = (await http().get('/v1/admissions/enquiries').set(as('officer')).expect(200)).body;
    expect(list).toHaveLength(1);
    const e = list[0];
    expect(e).toMatchObject({ name: 'Riya Shah', phone: '+919800033333', source: 'web', stage: 'new', programName: 'BCom' });
    expect(e.counsellorName).toBe('Officer'); // the only officer gets it

    await http().post(`/v1/admissions/enquiries/${e.id}/stage`).set(as('officer')).send({ stage: 'converted' }).expect(400);
    await http().post(`/v1/admissions/enquiries/${e.id}/stage`).set(as('officer')).send({ stage: 'lost' }).expect(400); // needs a reason
    await http().post(`/v1/admissions/enquiries/${e.id}/activities`).set(as('officer')).send({ kind: 'call', note: 'Spoke to mother', nextFollowUpOn: istDay(2) }).expect(201);
    await http().post(`/v1/admissions/enquiries/${e.id}/stage`).set(as('officer')).send({ stage: 'counselling' }).expect(200);
    await http().post(`/v1/admissions/enquiries/${e.id}/assign`).set(as('officer')).send({ counsellorId: t.teacher.id }).expect(400); // not a counsellor
    const detail = (await http().get(`/v1/admissions/enquiries/${e.id}`).set(as('officer')).expect(200)).body;
    expect(detail.stage).toBe('counselling');
    expect(detail.activities.map((a: { note: string }) => a.note)).toEqual(['Spoke to mother', expect.stringContaining('Asked again')]);
    const pipe = (await http().get('/v1/admissions/pipeline').set(as('officer')).expect(200)).body;
    expect(pipe.stages).toMatchObject({ counselling: 1 });
    expect(pipe.followUpsDue).toBe(0);
  });

  it('accepts applications, checks every answer, and tracks them by a secret link', async () => {
    const bad = await apply(0, 150).expect(400);
    expect(bad.body.fields.marks_12th).toBe('At most 100');
    await apply(0, 80, { answers: { marks_12th: 80 } }).expect(400); // the stream is required
    for (const [n, marks] of [[1, 90], [2, 80], [3, 70], [4, 30]] as const) {
      const r = await apply(n, marks, n === 1 ? { phone: '+919800033333' } : {}).expect(201);
      expect(r.body).toMatchObject({ status: 'submitted', feeStatus: 'pending', feeDuePaise: 50_000 });
      expect(r.body.applicationNo).toMatch(/^APP\/2026-27\/0000\d$/);
      apps.push({ id: r.body.id, token: r.body.token, no: r.body.applicationNo });
    }
    await apply(2, 80).expect(400); // already applied
    await http().get(pub(`/applications/${apps[0].id}`)).expect(404);
    await http().get(pub(`/applications/${apps[0].id}`)).set('x-application-token', apps[1].token).expect(404);
    expect((await view(0).expect(200)).body).toMatchObject({ applicationNo: apps[0].no, status: 'submitted', feeDuePaise: 50_000 });
    // The enquiry with the same phone moved on to "applied".
    const enq = (await http().get('/v1/admissions/enquiries').set(as('officer')).expect(200)).body[0];
    expect(enq.stage).toBe('applied');
  });

  it('collects the application fee online, at the counter, or waives it; review waits for the fee', async () => {
    await staffStatus(0, 'under_review').expect(400); // fee unpaid

    const co = await http().post(pub(`/applications/${apps[0].id}/fee/checkout`)).set('x-application-token', apps[0].token).expect(201);
    expect(co.body).toMatchObject({ provider: 'demo', amountPaise: 50_000, currency: 'INR' });
    const pay = (sig: string) => http().post(pub(`/applications/${apps[0].id}/fee/confirm`)).set('x-application-token', apps[0].token).send({ paymentId: co.body.paymentId, providerPaymentId: 'pay_app_1', signature: sig });
    await pay('bad').expect(403);
    const ok = await pay(DemoPaymentProvider.sign(co.body.orderId, 'pay_app_1')).expect(200);
    expect(ok.body).toMatchObject({ feeStatus: 'paid', feeDuePaise: 0 });
    expect(ok.body.receiptNo).toMatch(/^RCPT\//);
    await http().post(pub(`/applications/${apps[0].id}/fee/checkout`)).set('x-application-token', apps[0].token).expect(400); // nothing due

    await http().post(`/v1/admissions/applications/${apps[1].id}/fee/counter`).set(as('officer')).send({ method: 'cash' }).expect(201);
    await http().post(`/v1/admissions/applications/${apps[2].id}/fee/waive`).set(as('officer')).send({ reason: 'Staff child' }).expect(403); // principal only
    await http().post(`/v1/admissions/applications/${apps[2].id}/fee/waive`).set(as('principal')).send({ reason: 'Staff child' }).expect(200);
    await http().post(`/v1/admissions/applications/${apps[3].id}/fee/counter`).set(as('officer')).send({ method: 'upi', reference: 'UTR1' }).expect(201);
  });

  it('takes documents only as real PDFs or images, and staff verify them', async () => {
    const up = (i: number, buf: Buffer, key = 'marksheet') => http().post(pub(`/applications/${apps[i].id}/documents/${key}`)).set('x-application-token', apps[i].token).attach('file', buf, 'ms.pdf');
    await up(0, Buffer.from('MZ not a pdf')).expect(400);
    await up(0, PDF, 'passport').expect(404); // not asked for
    for (const i of [0, 1, 2]) await up(i, PDF).expect(201);
    const detail = (await http().get(`/v1/admissions/applications/${apps[0].id}`).set(as('officer')).expect(200)).body;
    expect(detail.documents).toHaveLength(1);
    expect(detail).not.toHaveProperty('accessTokenHash');
    await http().get(`/v1/admissions/applications/${apps[0].id}/documents/${detail.documents[0].id}/file`).set(as('officer')).expect(200);
    await http().get(`/v1/admissions/applications/${apps[0].id}/documents/${detail.documents[0].id}/file`).set(as('outsider')).expect(404);
    const review = (i: number, body: object, docId: string) => http().post(`/v1/admissions/applications/${apps[i].id}/documents/${docId}/review`).set(as('officer')).send(body);
    await review(0, { status: 'rejected' }, detail.documents[0].id).expect(400); // say why
    await review(0, { status: 'verified' }, detail.documents[0].id).expect(200);
    for (const i of [1, 2]) {
      const d = (await http().get(`/v1/admissions/applications/${apps[i].id}`).set(as('officer')).expect(200)).body.documents[0];
      await review(i, { status: 'verified' }, d.id).expect(200);
    }
  });

  it('evaluates eligibility and ranks a merit list that offers the seats and waitlists the rest', async () => {
    for (const i of [0, 1, 2, 3]) await staffStatus(i, 'under_review').expect(200);
    await staffStatus(0, 'offered').expect(400); // not a legal move yet
    await staffStatus(3, 'rejected').expect(400); // needs a reason
    const ev = (await http().post(`/v1/admissions/cycles/${cycleId}/evaluate`).set(as('officer')).expect(200)).body;
    // Applicant 4 scored 30%, below the 40% minimum.
    expect(ev).toEqual({ eligible: 3, ineligible: 1, waiting: 0 });
    const rejected = (await http().get(`/v1/admissions/applications/${apps[3].id}`).set(as('officer')).expect(200)).body;
    expect(rejected).toMatchObject({ status: 'ineligible' });
    expect(rejected.statusReason).toContain('marks_12th below 40');

    const list = (await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(201)).body;
    expect(list.seats).toBe(2);
    expect(list.entries.map((e: { rank: number; decision: string; score: number }) => [e.rank, e.decision, e.score])).toEqual([[1, 'offer', 90], [2, 'offer', 80], [3, 'waitlist', 70]]);
    const pub1 = (await http().post(`/v1/admissions/merit-lists/${list.id}/publish`).set(as('officer')).expect(200)).body;
    expect(pub1).toMatchObject({ offered: 2, waitlisted: 1 });
    await http().post(`/v1/admissions/merit-lists/${list.id}/publish`).set(as('officer')).expect(409);

    const v0 = (await view(0).expect(200)).body;
    expect(v0).toMatchObject({ status: 'offered', meritRank: 1 });
    expect(v0.offerExpiresOn).toBe(istDay(7));
    expect((await view(2).expect(200)).body.status).toBe('waitlisted');
    expect((await http().get(`/v1/admissions/merit-lists/${list.id}`).set(as('officer')).expect(200)).body.entries[0]).toMatchObject({ applicantName: 'Applicant 1', status: 'offered' });
    await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(201); // regenerating is allowed (v2)...
    const lists = (await http().get(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(200)).body;
    expect(lists.map((l: { version: number }) => l.version)).toEqual([2, 1]);
  });

  it('lets the applicant accept or decline; a declined seat goes to the waitlist', async () => {
    await http().post(pub(`/applications/${apps[2].id}/offer/accept`)).set('x-application-token', apps[2].token).expect(403); // only offers can be accepted
    expect((await http().post(pub(`/applications/${apps[0].id}/offer/accept`)).set('x-application-token', apps[0].token).expect(200)).body.status).toBe('accepted');
    expect((await http().post(pub(`/applications/${apps[1].id}/offer/decline`)).set('x-application-token', apps[1].token).send({ reason: 'Joined elsewhere' }).expect(200)).body.status).toBe('declined');
    await staffStatus(2, 'offered').expect(200); // the freed seat
    await staffStatus(3, 'offered').expect(400);
    const history = (await http().get(`/v1/admissions/applications/${apps[1].id}`).set(as('officer')).expect(200)).body.history;
    expect(history.map((h: { action: string }) => h.action)).toContain('admissions.application.status_changed.v1');
  });

  it('enrols an accepted applicant as an active student with a guardian, and converts the enquiry', async () => {
    await http().post(`/v1/admissions/applications/${apps[2].id}/enroll`).set(as('officer')).send({}).expect(400); // offered, not accepted
    const r = await http().post(`/v1/admissions/applications/${apps[0].id}/enroll`).set(as('officer')).send({}).expect(201);
    expect(r.body).toMatchObject({ status: 'active' });
    expect(r.body.className).toMatch(/^BCom Sem 3/);
    await http().post(`/v1/admissions/applications/${apps[0].id}/enroll`).set(as('officer')).send({}).expect(400); // once only

    const profile = (await http().get(`/v1/students/${r.body.studentId}/profile`).set(as('officer')).expect(200)).body;
    expect(profile).toMatchObject({ fullName: 'Applicant 1', status: 'active', application: { applicationNo: apps[0].no } });
    expect(profile.guardians).toEqual([expect.objectContaining({ fullName: 'Parent 1', isPrimary: true, relation: 'parent' })]);
    expect(profile.timeline.filter((e: { kind: string }) => e.kind === 'status').map((e: { toStatus: string }) => e.toStatus)).toEqual(['active', 'enrolled']);
    expect(profile.timeline.map((e: { kind: string }) => e.kind)).toContain('guardian');
    expect((await view(0).expect(200)).body.status).toBe('enrolled');
    const enq = (await http().get('/v1/admissions/enquiries').set(as('officer')).expect(200)).body[0];
    expect(enq.stage).toBe('converted');
    // The guardian can now sign in by phone: a user with the guardian role exists.
    const g = await owner.query(`select r.role from users u join user_roles r on r.user_id = u.id where u.tenant_id = $1 and u.phone = '+919800020010'`, [t.tenantId]);
    expect(g.rows.map((x: { role: string }) => x.role)).toEqual(['guardian']);
    // Nothing leaks across institutions.
    await http().get(`/v1/admissions/applications/${apps[0].id}`).set(as('outsider')).expect(404);
  });
});
