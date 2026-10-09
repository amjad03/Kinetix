import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';
import { normName, sameName } from '../src/admissions/dedupe.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

describe('admissions extras: duplicates, correction round, waitlist promotion, landing page, prior education, public events, deferment', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let cycleId: string;
  const apps: { id: string; token: string }[] = [];
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const pub = (path: string) => `/v1/public/admissions/${t.slug}${path}`;
  const apply = (n: number, marks: number, extra: object = {}) =>
    http()
      .post(pub(`/cycles/${cycleId}/applications`))
      .send({ applicantName: `Applicant ${n}`, dateOfBirth: '2008-03-10', phone: `+9198000100${n}0`, guardianName: `Parent ${n}`, guardianPhone: `+9198000200${n}0`, guardianEmail: `parent${n}@example.in`, answers: { marks_12th: marks }, ...extra });
  const status = (i: number, to: string, reason?: string) => http().post(`/v1/admissions/applications/${apps[i].id}/status`).set(as('officer')).send({ status: to, reason });
  const view = (i: number) => http().get(pub(`/applications/${apps[i].id}`)).set('x-application-token', apps[i].token);

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const u = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Officer', $2, $3) returning id`, [t.tenantId, `officer@${t.slug}.in`, hash]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'admissions_officer')`, [t.tenantId, u.rows[0].id]);
    app = await createApp(new FixedClock(new Date()));
    tokens = { officer: await login(`officer@${t.slug}.in`), principal: await login(t.principal.email!), teacher: await login(t.teacher.email!) };
    const year = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    const made = await http()
      .post('/v1/admissions/cycles')
      .set(as('officer'))
      .send({
        programId: t.program.id,
        academicYearId: year,
        name: 'BCom 2026 intake',
        entryTerm: 3,
        seats: 2,
        opensOn: istDay(-1),
        closesOn: istDay(30),
        applicationFeePaise: 0,
        formFields: [{ key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 }],
        documents: [],
        eligibility: {},
        meritRules: [{ field: 'marks_12th', weight: 1 }],
      })
      .expect(201);
    cycleId = made.body.id;
    await http().post(`/v1/admissions/cycles/${cycleId}/status`).set(as('officer')).send({ status: 'open' }).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('reads names the way an office does', () => {
    expect(normName('R. Kavya  Rao')).toBe('rkavyarao');
    expect(sameName('Kavya Rao', 'kavya  rao')).toBe(true);
    expect(sameName('Kavya Rao', 'Kavya Rao S')).toBe(true);
    expect(sameName('Kavya Rao', 'Kavita Rao')).toBe(false);
  });

  it('publishes a landing page for the cycle and keeps a draft private', async () => {
    const empty = (await http().get(`/v1/admissions/cycles/${cycleId}/landing`).set(as('officer')).expect(200)).body;
    expect(empty).toMatchObject({ published: false, headline: 'BCom 2026 intake' });
    await http().put(`/v1/admissions/cycles/${cycleId}/landing`).set(as('officer')).send({ headline: 'Join BCom at our campus', intro: 'Apply online', highlights: [{ title: 'NAAC accredited', text: 'Grade A' }], faqs: [{ q: 'Last date?', a: 'In 30 days' }], published: false }).expect(200);
    await http().get(pub(`/landing/${cycleId}`)).expect(404);
    await http().put(`/v1/admissions/cycles/${cycleId}/landing`).set(as('officer')).send({ headline: 'Join BCom at our campus', intro: 'Apply online', highlights: [{ title: 'NAAC accredited', text: 'Grade A' }], faqs: [{ q: 'Last date?', a: 'In 30 days' }], contactPhone: '+918000000000', published: true }).expect(200);
    const page = (await http().get(pub(`/landing/${cycleId}`)).expect(200)).body;
    expect(page).toMatchObject({ headline: 'Join BCom at our campus', cycle: { name: 'BCom 2026 intake', seats: 2 }, contactPhone: '+918000000000' });
    expect(page.highlights).toHaveLength(1);
    await http().put(`/v1/admissions/cycles/${cycleId}/landing`).set(as('teacher')).send({ headline: 'x', published: true }).expect(403);
  });

  it('flags a second application from the same person and stops enrolment until the office says why', async () => {
    for (const [n, marks] of [[1, 90], [2, 80], [3, 70]] as const) {
      const r = await apply(n, marks).expect(201);
      apps.push({ id: r.body.id, token: r.body.token });
    }
    // The same child applying again from another phone, with the same date of birth.
    const dup = await apply(1, 60, { phone: '+919811111111', guardianPhone: '+919822222222', guardianName: 'Another Parent' }).expect(201);
    apps.push({ id: dup.body.id, token: dup.body.token });
    const found = (await http().get(`/v1/admissions/applications/${apps[0].id}/duplicates`).set(as('officer')).expect(200)).body.duplicates;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'application', id: apps[3].id });
    expect(found[0].reasons).toEqual(['Same name', 'Same date of birth']);
    expect((await http().get(`/v1/admissions/applications/${apps[1].id}/duplicates`).set(as('officer')).expect(200)).body.duplicates).toHaveLength(0);
    await http().get(`/v1/admissions/applications/${apps[0].id}/duplicates`).set(as('teacher')).expect(403);
  });

  it('sends an application back for correction and takes it again when the applicant fixes it', async () => {
    await status(1, 'under_review').expect(200);
    await http().post(`/v1/admissions/applications/${apps[1].id}/request-correction`).set(as('officer')).send({ notes: 'ab' }).expect(400);
    const sent = (await http().post(`/v1/admissions/applications/${apps[1].id}/request-correction`).set(as('officer')).send({ notes: 'The date of birth does not match the certificate', items: ['Date of birth'], dueOn: istDay(5) }).expect(200)).body;
    expect(sent).toMatchObject({ status: 'correction_requested', round: 1 });
    expect((await view(1).expect(200)).body.status).toBe('correction_requested');
    const c = (await http().get(pub(`/applications/${apps[1].id}/corrections`)).set('x-application-token', apps[1].token).expect(200)).body;
    expect(c).toMatchObject({ open: true, latest: { items: ['Date of birth'] }, rounds: 1 });
    await http().get(pub(`/applications/${apps[1].id}/corrections`)).set('x-application-token', apps[0].token).expect(404);
    await http().post(pub(`/applications/${apps[0].id}/resubmit`)).set('x-application-token', apps[0].token).send({}).expect(400); // nothing was asked of that applicant
    await http().post(pub(`/applications/${apps[1].id}/resubmit`)).set('x-application-token', apps[1].token).send({ dateOfBirth: '2008-04-11', note: 'Fixed' }).expect(200);
    expect((await view(1).expect(200)).body.status).toBe('under_review');
    expect((await owner.query('select date_of_birth::text as d from applications where id = $1', [apps[1].id])).rows[0].d).toBe('2008-04-11');
    // Review can send it back again: a second round.
    const again = (await http().post(`/v1/admissions/applications/${apps[1].id}/request-correction`).set(as('officer')).send({ notes: 'Upload a clearer photo' }).expect(200)).body;
    expect(again.round).toBe(2);
    await http().post(pub(`/applications/${apps[1].id}/resubmit`)).set('x-application-token', apps[1].token).send({}).expect(200);
  });

  it('promotes the waitlist in rank order when a seat comes free', async () => {
    for (const i of [0, 1, 2]) {
      if (i !== 1) await status(i, 'under_review').expect(200);
    }
    // applicant 2 was returned to review above
    await http().post(`/v1/admissions/cycles/${cycleId}/evaluate`).set(as('officer')).expect(200);
    const list = (await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(201)).body;
    await http().post(`/v1/admissions/merit-lists/${list.id}/publish`).set(as('officer')).expect(200);
    expect((await view(2).expect(200)).body.status).toBe('waitlisted');
    const wl = (await http().get(`/v1/admissions/cycles/${cycleId}/waitlist`).set(as('officer')).expect(200)).body;
    expect(wl.seatsLeft).toBe(0);
    expect(wl.entries.map((e: { position: number; applicantName: string }) => [e.position, e.applicantName])).toEqual([[1, 'Applicant 3']]);
    expect((await http().post(`/v1/admissions/cycles/${cycleId}/waitlist/promote`).set(as('officer')).send({}).expect(200)).body.promoted).toBe(0);
    await http().post(pub(`/applications/${apps[1].id}/offer/decline`)).set('x-application-token', apps[1].token).send({ reason: 'Chose another college' }).expect(200);
    const done = (await http().post(`/v1/admissions/cycles/${cycleId}/waitlist/promote`).set(as('officer')).send({}).expect(200)).body;
    expect(done).toMatchObject({ promoted: 1, remaining: 0 });
    expect((await view(2).expect(200)).body.status).toBe('offered');
    await http().post(`/v1/admissions/cycles/${cycleId}/waitlist/promote`).set(as('teacher')).send({}).expect(403);
  });

  it('keeps prior schooling and carries it to the student at enrolment; the duplicate must be explained', async () => {
    await http().post(`/v1/admissions/applications/${apps[0].id}/prior-education`).set(as('officer')).send({ level: 'puc', institution: 'Vidya PU College', board: 'Karnataka PUC', passingYear: 2026, percentage: 88.5, tcNumber: 'TC/2026/114' }).expect(201);
    await http().post(`/v1/admissions/applications/${apps[0].id}/prior-education`).set(as('officer')).send({ level: 'secondary', institution: 'Sharada High School', passingYear: 2024, percentage: 92 }).expect(201);
    await http().post(`/v1/admissions/applications/${apps[0].id}/prior-education`).set(as('officer')).send({ level: 'puc', institution: '' }).expect(400);
    await http().post(pub(`/applications/${apps[0].id}/offer/accept`)).set('x-application-token', apps[0].token).send({}).expect(200);
    const blocked = await http().post(`/v1/admissions/applications/${apps[0].id}/enroll`).set(as('officer')).send({ activate: false }).expect(409);
    expect(blocked.body.code).toBe('DUPLICATE_PERSON');
    expect(blocked.body.duplicates[0].id).toBe(apps[3].id);
    await http().post(`/v1/admissions/applications/${apps[0].id}/enroll`).set(as('officer')).send({ activate: false, duplicateOverride: 'x' }).expect(400);
    const enrolled = (await http().post(`/v1/admissions/applications/${apps[0].id}/enroll`).set(as('officer')).send({ activate: false, duplicateOverride: 'Checked with the family: two children, not one' }).expect(201)).body;
    expect(enrolled.status).toBe('enrolled');
    const prior = (await http().get(`/v1/admissions/students/${enrolled.studentId}/prior-education`).set(as('officer')).expect(200)).body as { institution: string; level: string }[];
    expect(prior.map((p) => p.institution)).toEqual(['Sharada High School', 'Vidya PU College']);
    expect((await owner.query("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'admissions.duplicate.overridden'", [t.tenantId])).rows[0].n).toBe(1);
    await http().delete(`/v1/admissions/prior-education/${(prior[0] as unknown as { id: string }).id}`).set(as('officer')).expect(200);

    // A student who is enrolled but cannot start this year is deferred to a later intake.
    const st = (id: string, body: object) => http().post(`/v1/students/${id}/status`).set(as('principal')).send(body);
    await st(enrolled.studentId, { status: 'deferred', reason: 'Family relocating this year' }).expect(400);
    await st(enrolled.studentId, { status: 'deferred', reason: 'Family relocating this year', returnOn: istDay(120) }).expect(200);
    const profile = (await http().get(`/v1/students/${enrolled.studentId}/profile`).set(as('principal')).expect(200)).body;
    expect(profile.status).toBe('deferred');
    expect(profile.allowedStatuses).toEqual(expect.arrayContaining(['enrolled', 'active', 'dropped']));
    await st(enrolled.studentId, { status: 'active', reason: 'Joined the new intake' }).expect(200);
  });

  it('shows open public events with seats left, and nothing that is a draft or for staff only', async () => {
    const start = new Date(Date.now() + 5 * 86400_000).toISOString();
    const end = new Date(Date.now() + 5 * 86400_000 + 3600_000).toISOString();
    const ins = (title: string, status: string, audience: string) => owner.query(`insert into campus_events (tenant_id, title, description, event_type, venue, capacity, starts_at, ends_at, audience, fee_paise, status, created_by) values ($1,$2,'Open day','fest','Main hall',100,$3,$4,$5,0,$6,$7) returning id`, [t.tenantId, title, start, end, audience, status, t.principal.id]);
    const open = (await ins('Open day', 'published', 'all')).rows[0].id;
    await ins('Draft fest', 'draft', 'all');
    await ins('Staff meet', 'published', 'staff');
    const list = (await http().get(`/v1/public/events/${t.slug}`).expect(200)).body;
    expect(list.events.map((e: { title: string }) => e.title)).toEqual(['Open day']);
    expect(list.events[0]).toMatchObject({ capacity: 100, seatsLeft: 100 });
    expect((await http().get(`/v1/public/events/${t.slug}/${open}`).expect(200)).body.event.venue).toBe('Main hall');
    await http().get(`/v1/public/events/nope`).expect(404);
  });
});
