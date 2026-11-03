import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import { cashfreeSignature } from '../src/fees/gateways.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

/**
 * The admissions pass: the reservation matrix through counselling rounds (vertical, horizontal and supernumerary
 * seats, de-reservation), entrance results and KEA allotments, eligibility from the university profile, the checklist
 * with provisional admission, enrolment with the VTU-style USN, fee structure and sign-in details, the application fee
 * through the Cashfree adapter, campaign broadcasts, the public status page and the returns.
 */
describe('admissions pass', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  let yearId: string;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const pub = (path: string) => `/v1/public/admissions/${t.slug}${path}`;
  let phoneN = 0;
  const phone = () => `+9197400${String(++phoneN).padStart(5, '0')}`;

  // A stand-in for the Cashfree sandbox (orders and order payments), as in fees-gateways.e2e.spec.ts.
  const CF = { keyId: 'TEST1023456789abcdef', keySecret: 'cfsk_ma_test_secret_0001' };
  const orders = new Map<string, { amountPaise: number; paid: boolean; paymentId: string }>();
  let remote: Server;
  let seq = 0;
  const reply = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  function route(req: IncomingMessage, body: string, res: ServerResponse) {
    const url = req.url ?? '';
    if (req.headers['x-client-id'] !== CF.keyId || req.headers['x-client-secret'] !== CF.keySecret) return reply(res, 401, { message: 'authentication Failed' });
    if (url === '/cashfree/pg/orders' && req.method === 'POST') {
      const b = JSON.parse(body) as { order_id: string; order_amount: number; customer_details: { customer_phone: string } };
      if (!/^\d{10}$/.test(b.customer_details.customer_phone)) return reply(res, 400, { message: 'customer_phone invalid' });
      orders.set(b.order_id, { amountPaise: Math.round(b.order_amount * 100), paid: false, paymentId: String(7000 + ++seq) });
      return reply(res, 200, { order_id: b.order_id, order_amount: b.order_amount, order_status: 'ACTIVE', payment_session_id: `session_${'y'.repeat(20)}${seq}` });
    }
    const op = /^\/cashfree\/pg\/orders\/([^/]+)\/payments$/.exec(url);
    if (op) {
      const o = orders.get(op[1]);
      return reply(res, 200, o?.paid ? [{ cf_payment_id: Number(o.paymentId), order_id: op[1], payment_status: 'SUCCESS', payment_amount: o.amountPaise / 100, payment_currency: 'INR' }] : []);
    }
    return reply(res, 404, { message: 'not found' });
  }

  const user = async (tenantId: string, slug: string, name: string, role: string) => {
    const hash = await argon2.hash('pw');
    const u = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [tenantId, name, `${name.toLowerCase()}@${slug}.in`, hash]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, $3)`, [tenantId, u.rows[0].id, role]);
    return `${name.toLowerCase()}@${slug}.in`;
  };

  const makeCycle = async (name: string, seats: number, extra: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/v1/admissions/cycles')
      .set(as('officer'))
      .send({ programId: t.program.id, academicYearId: yearId, name, entryTerm: 3, seats, opensOn: istDay(-1), closesOn: istDay(30), formFields: [{ key: 'marks_12th', label: '12th marks %', type: 'number', required: false, min: 0, max: 100 }], meritRules: [], ...extra })
      .expect(201);
    return res.body.id as string;
  };
  const open = (id: string) => http().post(`/v1/admissions/cycles/${id}/status`).set(as('officer')).send({ status: 'open' }).expect(200);
  const applyTo = async (cycleId: string, name: string, answers: Record<string, string | number> = {}, dob = '2005-03-10') => {
    const r = await http().post(pub(`/cycles/${cycleId}/applications`)).set('x-forwarded-for', `10.9.${phoneN % 250}.${(phoneN >> 3) % 250}`).send({ applicantName: name, dateOfBirth: dob, gender: phoneN % 2 ? 'female' : 'male', phone: phone(), guardianName: `Parent ${name}`, guardianPhone: phone(), answers }).expect(201);
    return { id: r.body.id as string, token: r.body.token as string, no: r.body.applicationNo as string };
  };
  const setting = (rules: Record<string, unknown>) => http().put('/v1/module-settings/admissions').set(as('principal')).send({ rules, templates: {}, defaults: {}, numbering: {} });

  beforeAll(async () => {
    remote = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => route(req, body, res));
    });
    await new Promise<void>((r) => remote.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
    t = await createTenant(owner);
    other = await createTenant(owner);
    yearId = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    const officer = await user(t.tenantId, t.slug, 'Officer', 'admissions_officer');
    const otherOfficer = await user(other.tenantId, other.slug, 'Officer', 'admissions_officer');
    app = await createApp(new FixedClock(new Date()), (m) => m.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'gateways', RAZORPAY_FAKE: 'false', PAYU_FAKE: 'false', PAYMENT_GATEWAY_TEST_BASE: base, API_PUBLIC_URL: 'https://api.zynetix.test', TRUST_PROXY: '1' })));
    tokens.officer = await login(t.slug, officer);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.other = await login(other.slug, otherOfficer);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
    await new Promise<void>((r) => remote.close(() => r()));
  });

  it('refuses other roles and other institutions on every new endpoint', async () => {
    const cycle = await makeCycle('Guarded cycle', 10);
    for (const [method, path] of [
      ['get', `/v1/admissions/cycles/${cycle}/reservation`],
      ['get', '/v1/admissions/pass/catalog'],
      ['get', `/v1/admissions/returns/intake?yearId=${yearId}`],
      ['get', '/v1/admissions/broadcasts'],
      ['get', '/v1/admissions/programme-settings'],
    ] as const) {
      await http()[method](path).set(as('teacher')).expect(403);
    }
    await http().put(`/v1/admissions/cycles/${cycle}/reservation`).set(as('teacher')).send({}).expect(403);
    // The other institution's officer cannot see or change this cycle (row-level security: it does not exist for them).
    await http().get(`/v1/admissions/cycles/${cycle}/reservation`).set(as('other')).expect(404);
    await http().put(`/v1/admissions/cycles/${cycle}/profile-eligibility`).set(as('other')).send({ preset: 'ugc-ug' }).expect(404);
    // De-reservation and programme approvals are the principal's.
    await http().post(`/v1/admissions/cycles/${cycle}/reservation/dereserve`).set(as('officer')).send({}).expect(403);
    await http().put(`/v1/admissions/programme-settings/${t.program.id}`).set(as('officer')).send({ branchCode: 'CS' }).expect(403);
    // Bodies are checked.
    await http().put(`/v1/admissions/cycles/${cycle}/reservation`).set(as('officer')).send({ options: [{ label: 'X', intake: 10 }], seatTypes: [{ seatType: 'merit', percent: 60 }], reservation: { appliesTo: [], categories: [] }, horizontal: { appliesTo: [], kinds: [] }, supernumerary: [] }).expect(400);
    await http().put(`/v1/admissions/cycles/${cycle}/reservation`).set(as('officer')).send({ options: [{ label: 'X', intake: 11 }], seatTypes: [{ seatType: 'merit', percent: 100 }], reservation: { appliesTo: [], categories: [] }, horizontal: { appliesTo: [], kinds: [] }, supernumerary: [] }).expect(400);
  });

  it('fills a reservation matrix through counselling rounds: GM first, reserved, horizontal, supernumerary, then de-reserves', async () => {
    const cycle = await makeCycle('BCom merit with reservation', 12);
    await open(cycle);
    // Intake 10: merit 70% = 7, management 30% = 3. In merit: SC 30% of 7 = 2.1 → SC 2, GM 5. Rural 20% of the GM row
    // (5) = 1 earmarked. TFW 10% of 10 = 1 supernumerary seat in merit.
    const plan = { options: [{ label: 'BCom', intake: 10 }], seatTypes: [{ seatType: 'merit', percent: 70 }, { seatType: 'management', percent: 30 }], reservation: { appliesTo: ['merit'], categories: [{ key: 'SC', percent: 30 }] }, horizontal: { appliesTo: ['merit'], kinds: [{ kind: 'rural', percent: 20 }] }, supernumerary: [{ kind: 'tfw', percent: 10, seatType: 'merit' }] };
    const m = (await http().put(`/v1/admissions/cycles/${cycle}/reservation`).set(as('officer')).send(plan).expect(200)).body;
    expect(m.rows.map((r: { seatType: string; category: string; seats: number; horizontal: object }) => [r.seatType, r.category, r.seats, r.horizontal])).toEqual([
      ['merit', 'sc', 2, {}],
      ['merit', 'merit', 5, { rural: 1 }],
      ['management', 'merit', 3, {}],
      ['merit', 'tfw', 1, {}],
    ]);
    expect(m.totals).toMatchObject({ intake: 10, supernumerary: 1 });

    await http().put(`/v1/admissions/cycles/${cycle}/index-formula`).set(as('officer')).send({ preset: 'simple' }).expect(200);
    const people: [string, number, string][] = [['A1', 98, 'GM'], ['A2', 95, 'SC'], ['A3', 93, 'GM'], ['A4', 90, 'GM'], ['A5', 88, 'GM'], ['A6', 85, 'GM'], ['A7', 80, 'SC'], ['A8', 78, 'GM'], ['M1', 75, 'GM'], ['A9', 70, 'SC'], ['T1', 60, 'GM']];
    const id: Record<string, string> = {};
    for (const [name, pct, cat] of people) {
      id[name] = (await applyTo(cycle, `Merit ${name}`)).id;
      await http().post(`/v1/admissions/applications/${id[name]}/category`).set(as('officer')).send({ category: cat }).expect(200);
      await http().put(`/v1/admissions/applications/${id[name]}/index-marks`).set(as('officer')).send({ marks: { percentage: pct } }).expect(200);
      await http().put(`/v1/admissions/applications/${id[name]}/preferences`).set(as('officer')).send({ options: ['BCom'] }).expect(200);
    }
    // A8 is from a rural school; T1's family earns Rs 5 lakh (TFW); TFW is refused above Rs 8 lakh.
    await http().put(`/v1/admissions/applications/${id.A8}/claims`).set(as('officer')).send({ horizontal: ['rural'] }).expect(200);
    await http().put(`/v1/admissions/applications/${id.T1}/claims`).set(as('officer')).send({ supernumerary: ['tfw'], familyIncomePaise: 9_00_000_00 }).expect(400);
    await http().put(`/v1/admissions/applications/${id.T1}/claims`).set(as('officer')).send({ supernumerary: ['tfw'], familyIncomePaise: 5_00_000_00 }).expect(200);
    // M1 is moved to the management quota with the declaration and the principal's approval.
    const req = (await http().post(`/v1/admissions/applications/${id.M1}/requests`).set(as('officer')).send({ kind: 'management_quota', reason: 'Family asked for a management seat', declaration: true }).expect(201)).body;
    await http().post(`/v1/admissions/requests/${req.id}/decide`).set(as('principal')).send({ decision: 'approve' }).expect(200);
    for (const k of Object.keys(id)) await http().post(`/v1/admissions/applications/${id[k]}/status`).set(as('officer')).send({ status: 'under_review' });
    await http().post(`/v1/admissions/cycles/${cycle}/evaluate`).set(as('officer')).expect(200);
    await http().post(`/v1/admissions/cycles/${cycle}/rank-list`).set(as('officer')).expect(200);

    // Round 1. GM row (5): A1, A2 (an SC candidate on general merit), A3, A4, A5; then rural: A5 (lowest, not rural)
    // gives way to A8. SC row (2): A7, A9. Management: M1. TFW: T1. A5 and A6 wait.
    const r1 = (await http().post(`/v1/admissions/cycles/${cycle}/rounds`).set(as('officer')).expect(201)).body;
    const al1 = (await http().get(`/v1/admissions/rounds/${r1.id}/allotments`).set(as('officer')).expect(200)).body.allotments as { id: string; name: string; seatType: string; seatCategory: string; horizontal: string | null }[];
    const seat = (rows: typeof al1) => Object.fromEntries(rows.map((a) => [a.name.replace('Merit ', ''), `${a.seatType}/${a.seatCategory}${a.horizontal ? `/${a.horizontal}` : ''}`]));
    expect(seat(al1)).toEqual({ A1: 'merit/merit', A2: 'merit/merit', A3: 'merit/merit', A4: 'merit/merit', A7: 'merit/sc', A8: 'merit/merit/rural', M1: 'management/merit', A9: 'merit/sc', T1: 'merit/tfw' });
    expect((await http().post(`/v1/admissions/rounds/${r1.id}/publish`).set(as('officer')).expect(200)).body.offered).toBe(9);
    const status = async (k: string) => (await http().get(`/v1/admissions/applications/${id[k]}`).set(as('officer')).expect(200)).body.status;
    expect(await status('A1')).toBe('offered');
    const answer = (name: string, response: string) => http().post(`/v1/admissions/allotments/${al1.find((a) => a.name === `Merit ${name}`)!.id}/respond`).set(as('officer')).send({ response }).expect(200);
    for (const k of ['A1', 'A4', 'A7', 'A8', 'M1', 'T1']) await answer(k, 'freeze');
    await answer('A2', 'float');
    await answer('A3', 'reject');
    expect(await status('A1')).toBe('accepted');
    expect(await status('A3')).toBe('declined');
    expect((await http().post(`/v1/admissions/rounds/${r1.id}/close`).set(as('officer')).expect(200)).body.forfeited).toBe(1); // A9 did not answer
    expect(await status('A9')).toBe('declined');

    // Round 2: one GM seat is free (A3 rejected): A5 takes it; A2 floats with nothing better. The SC seat A9 forfeited
    // stays empty (no SC candidate left).
    const r2 = (await http().post(`/v1/admissions/cycles/${cycle}/rounds`).set(as('officer')).expect(201)).body;
    const al2 = (await http().get(`/v1/admissions/rounds/${r2.id}/allotments`).set(as('officer')).expect(200)).body.allotments as typeof al1 & { kind: string }[];
    expect(al2.map((a) => [a.name.replace('Merit ', ''), (a as unknown as { kind: string }).kind])).toEqual([['A2', 'kept'], ['A5', 'new']]);
    await http().post(`/v1/admissions/rounds/${r2.id}/publish`).set(as('officer')).expect(200);
    await http().post(`/v1/admissions/allotments/${al2.find((a) => a.name === 'Merit A5')!.id}/respond`).set(as('officer')).send({ response: 'freeze' }).expect(200);
    await http().post(`/v1/admissions/rounds/${r2.id}/close`).set(as('officer')).expect(200);

    // De-reservation: no SC or ST candidate waits, so the empty SC seat becomes a GM seat; A6 takes it in round 3.
    const d = (await http().post(`/v1/admissions/cycles/${cycle}/reservation/dereserve`).set(as('principal')).send({}).expect(201)).body;
    expect(d.moves).toEqual([expect.objectContaining({ option: 'BCom', seatType: 'merit', from: 'sc', to: 'merit', seats: 1 })]);
    expect(d.matrix.rows.find((r: { seatType: string; category: string }) => r.seatType === 'merit' && r.category === 'merit').seats).toBe(6);
    expect(d.matrix.conversions).toHaveLength(1);
    const r3 = (await http().post(`/v1/admissions/cycles/${cycle}/rounds`).set(as('officer')).expect(201)).body;
    const al3 = (await http().get(`/v1/admissions/rounds/${r3.id}/allotments`).set(as('officer')).expect(200)).body.allotments as typeof al1;
    expect(al3.filter((a) => (a as unknown as { kind: string }).kind === 'new').map((a) => a.name)).toEqual(['Merit A6']);
    // Rounds have started: the plan is locked.
    await http().put(`/v1/admissions/cycles/${cycle}/reservation`).set(as('officer')).send(plan).expect(409);
  });

  it('ranks by an entrance test and takes KEA allotments once', async () => {
    const cycle = await makeCycle('BCom by COMEDK rank', 30);
    await open(cycle);
    await http().put(`/v1/admissions/cycles/${cycle}/index-formula`).set(as('officer')).send({ preset: 'comedk_rank' }).expect(200);
    const a = await applyTo(cycle, 'Rank Asha');
    const b = await applyTo(cycle, 'Rank Bharat');
    const res = (await http().post(`/v1/admissions/cycles/${cycle}/entrance-results`).set(as('officer')).send({ exam: 'comedk', rows: [{ applicationNo: a.no, rollNo: 'CK2601', rank: 15230 }, { applicationNo: b.no, rollNo: 'CK2602', rank: 812 }, { applicationNo: 'NOPE-1', rank: 4 }] }).expect(201)).body;
    expect(res).toMatchObject({ updated: 2, marked: 2, unmatched: ['NOPE-1'] });
    await http().post(`/v1/admissions/cycles/${cycle}/rank-list`).set(as('officer')).expect(200);
    const list = (await http().get(`/v1/admissions/cycles/${cycle}/rank-list`).set(as('officer')).expect(200)).body.rows;
    expect(list.map((r: { name: string; overallRank: number }) => [r.name, r.overallRank])).toEqual([['Rank Bharat', 1], ['Rank Asha', 2]]);

    const rows = [
      { allotmentRef: 'KEA/E/2026/R1/0042', rollNo: 'KC112233', rank: 10421, name: 'Kea Chandana', dateOfBirth: '2008-02-14', gender: 'female', phone: phone(), guardianName: 'Ravi Chandra', guardianPhone: phone(), category: '2A', option: 'BCom' },
      { allotmentRef: 'KEA/E/2026/R1/0043', rollNo: 'KC112234', rank: 18210, name: 'Kea Darshan', dateOfBirth: '2008-07-02', gender: 'male', phone: phone(), guardianName: 'Mohan Darshan', guardianPhone: phone(), category: 'GM', option: 'BCom' },
    ];
    const imp = (await http().post(`/v1/admissions/cycles/${cycle}/external-allotments`).set(as('officer')).send({ authority: 'kea', rows }).expect(201)).body;
    expect(imp.created).toBe(2);
    const again = (await http().post(`/v1/admissions/cycles/${cycle}/external-allotments`).set(as('officer')).send({ authority: 'kea', rows }).expect(201)).body;
    expect(again).toMatchObject({ created: 0 });
    expect(again.skipped).toHaveLength(2);
    const apps = (await http().get(`/v1/admissions/applications?cycleId=${cycle}&status=accepted`).set(as('officer')).expect(200)).body;
    const rowsOf = Array.isArray(apps) ? apps : apps.rows;
    expect(rowsOf.map((x: { applicantName: string }) => x.applicantName).sort()).toEqual(['Kea Chandana', 'Kea Darshan']);
  });

  it('checks eligibility against the university rule with the category relaxation', async () => {
    const cycle = await makeCycle('MCom 2027', 20);
    const opts = (await http().get(`/v1/admissions/cycles/${cycle}/profile-eligibility`).set(as('officer')).expect(200)).body;
    expect(opts.presets.map((p: { key: string }) => p.key)).toContain('ka-pg-mcom');
    const set = (await http().put(`/v1/admissions/cycles/${cycle}/profile-eligibility`).set(as('officer')).send({ preset: 'ka-pg-mcom' }).expect(200)).body;
    expect(set.formFields.map((f: { key: string }) => f.key)).toEqual(['marks_12th', 'qualifying_exam', 'qualifying_percent']);
    // An edit of the other rules keeps the preset.
    await http().patch(`/v1/admissions/cycles/${cycle}`).set(as('officer')).send({ eligibility: { minAge: 18 } }).expect(200);
    await open(cycle);
    const degree = "Bachelor's degree";
    const ok = await applyTo(cycle, 'Elig Gm', { qualifying_exam: degree, qualifying_percent: 52 });
    const sc = await applyTo(cycle, 'Elig Sc', { qualifying_exam: degree, qualifying_percent: 42 });
    const low = await applyTo(cycle, 'Elig Low', { qualifying_exam: degree, qualifying_percent: 42 });
    const puc = await applyTo(cycle, 'Elig Puc', { qualifying_exam: 'PUC / Class 12', qualifying_percent: 90 });
    await http().post(`/v1/admissions/applications/${sc.id}/category`).set(as('officer')).send({ category: 'SC' }).expect(200);
    for (const x of [ok, sc, low, puc]) await http().post(`/v1/admissions/applications/${x.id}/status`).set(as('officer')).send({ status: 'under_review' });
    expect((await http().post(`/v1/admissions/cycles/${cycle}/evaluate`).set(as('officer')).expect(200)).body).toMatchObject({ eligible: 2, ineligible: 2 });
    const get = async (x: { id: string }) => (await http().get(`/v1/admissions/applications/${x.id}`).set(as('officer')).expect(200)).body;
    expect((await get(low)).eligibilityNotes).toEqual(['42% is below the 45% needed']);
    expect((await get(puc)).eligibilityNotes[0]).toMatch(/PUC \/ Class 12 is not a qualifying examination/);
    expect((await get(sc)).status).toBe('eligible');
    // Once applications are in, a preset that needs new questions is refused.
    await http().put(`/v1/admissions/cycles/${cycle}/profile-eligibility`).set(as('officer')).send({ preset: 'vtu-be' }).expect(409);
  });

  it('admits provisionally on the checklist, then enrols with the USN, the fee structure and sign-in details', async () => {
    await http().put(`/v1/admissions/programme-settings/${t.program.id}`).set(as('principal')).send({ branchCode: 'cs', sanctionedIntake: 60, approvalBody: 'VTU', approvalRef: 'VTU/AFF/2026/118', approvalValidTo: '2027-06-30' }).expect(200);
    expect((await setting({ registerNumberTemplate: '{region}{college}{yy}{branch}{seq:3}', collegeCode: 'SB', regionCode: '1' })).status).toBe(200);
    await owner.query(`insert into fee_structures (tenant_id, program_id, name, items, status, active, quota) values ($1, $2, 'BCom 2026-27 (government seat)', $3, 'published', true, 'merit')`, [t.tenantId, t.program.id, JSON.stringify([{ head: 'Tuition fee', amountPaise: 45_000_00 }, { head: 'University fee', amountPaise: 3_500_00 }])]);
    await owner.query(`insert into message_templates (tenant_id, key, channel, locale, subject, body, dlt_template_id, active) values ($1, 'admission.welcome', 'sms', 'en', '', 'Welcome to {{institution}}. {{name}}: sign in to the {{app}} app with {{login}}.', '1107161234567890123', true)`, [t.tenantId]);

    const cycle = await makeCycle('BE via KEA', 30);
    const imp = (await http().post(`/v1/admissions/cycles/${cycle}/external-allotments`).set(as('officer')).send({ authority: 'kea', rows: [
      { allotmentRef: 'KEA/E/2026/R1/0101', rollNo: 'KC2001', rank: 5120, name: 'Usha Rani', dateOfBirth: '2008-04-01', gender: 'female', phone: phone(), guardianName: 'Ramesh Rani', guardianPhone: phone(), category: 'SC', option: 'BCom' },
      { allotmentRef: 'KEA/E/2026/R1/0102', rollNo: 'KC2002', rank: 7120, name: 'Lateral Lokesh', dateOfBirth: '2006-04-01', gender: 'male', phone: phone(), guardianName: 'Kumar L', guardianPhone: phone(), category: 'GM', option: 'BCom' },
    ] }).expect(201)).body;
    const usha = (await http().get(`/v1/admissions/applications?cycleId=${cycle}`).set(as('officer')).expect(200)).body;
    const list = (Array.isArray(usha) ? usha : usha.rows) as { id: string; applicantName: string; applicationNo: string }[];
    const u = list.find((x) => x.applicantName === 'Usha Rani')!;
    const l = list.find((x) => x.applicantName === 'Lateral Lokesh')!;
    expect(imp.created).toBe(2);

    // Usha: SC, board unknown (so outside the state board), a KEA government seat.
    const c = (await http().post(`/v1/admissions/applications/${u.id}/checklist`).set(as('officer')).expect(201)).body;
    expect(c.items.map((i: { itemKey: string }) => i.itemKey)).toEqual(['marks_cards', 'tc', 'migration', 'eligibility', 'caste', 'study_certificate', 'allotment_order', 'anti_ragging', 'medical_fitness', 'photos']);
    expect(c).toMatchObject({ complete: false, provisionalOk: false });
    await http().post(`/v1/admissions/applications/${u.id}/admit`).set(as('officer')).send({}).expect(400);
    const item = (k: string) => c.items.find((i: { itemKey: string }) => i.itemKey === k).id;
    for (const k of ['marks_cards', 'caste', 'study_certificate', 'allotment_order', 'anti_ragging']) await http().patch(`/v1/admissions/checklist-items/${item(k)}`).set(as('officer')).send({ status: 'received', referenceNo: k === 'caste' ? 'RD0012345' : null }).expect(200);
    await http().patch(`/v1/admissions/checklist-items/${item('tc')}`).set(as('officer')).send({ status: 'deferred', dueOn: istDay(-1) }).expect(400);
    await http().post(`/v1/admissions/applications/${u.id}/provisional`).set(as('officer')).send({ undertaking: false }).expect(400);
    const letter = (await http().post(`/v1/admissions/applications/${u.id}/provisional`).set(as('officer')).send({ undertaking: true, dueOn: istDay(20) }).expect(201)).body;
    expect(letter).toMatchObject({ kind: 'provisional', name: 'Usha Rani', provisionalUntil: istDay(20) });
    expect(letter.pending.map((p: { label: string }) => p.label)).toEqual(['Transfer certificate from the last institution (original)', 'Migration certificate', 'Eligibility certificate from the university']);

    const done = (await http().post(`/v1/admissions/applications/${u.id}/admit`).set(as('officer')).send({}).expect(201)).body;
    // USN: region 1, college SB, year 26 (2026-27), branch CS, first regular roll.
    expect(done).toMatchObject({ registerNo: '1SB26CS001', provisional: true });
    expect(done.fees).toEqual([expect.objectContaining({ structure: 'BCom 2026-27 (government seat)', amountPaise: 48_500_00 })]);
    expect(done.credentials.map((x: { role: string; status: string; channel: string }) => `${x.role}:${x.channel}:${x.status}`)).toEqual(['student:sms:sent', 'parent:sms:sent']);
    expect(done.credentials[0].destination).toMatch(/^\+9197x+\d{2}$/);
    const log = (await http().get(`/v1/admissions/students/${done.studentId}/credentials`).set(as('officer')).expect(200)).body;
    expect(log).toHaveLength(2);
    const [inv] = (await owner.query(`select amount_paise from fee_invoices where student_id = $1`, [done.studentId])).rows;
    expect(Number(inv.amount_paise)).toBe(48_500_00);

    // The rest come in: the TC original goes to the custody register and the admission is confirmed.
    for (const k of ['tc', 'migration', 'eligibility']) await http().patch(`/v1/admissions/checklist-items/${item(k)}`).set(as('officer')).send({ status: 'received', referenceNo: k === 'eligibility' ? 'BU/EC/2026/5512' : null }).expect(200);
    const after = (await http().get(`/v1/admissions/applications/${u.id}/checklist`).set(as('officer')).expect(200)).body;
    expect(after).toMatchObject({ complete: true, provisional: false });
    expect(after.confirmedAt).toBeTruthy();
    const [custody] = (await owner.query(`select count(*)::int as n from admission_custody_items where application_id = $1`, [u.id])).rows;
    expect(custody.n).toBe(3); // marks cards, TC and migration certificate are originals

    // A lateral entrant takes the 400 series.
    await http().patch(`/v1/admissions/applications/${l.id}/admission-kind`).set(as('officer')).send({ admissionType: 'lateral', entryTermOverride: 3 }).expect(200);
    const lc = (await http().post(`/v1/admissions/applications/${l.id}/checklist`).set(as('officer')).expect(201)).body;
    for (const i of lc.items.filter((x: { required: boolean }) => x.required)) await http().patch(`/v1/admissions/checklist-items/${i.id}`).set(as('officer')).send({ status: 'verified' }).expect(200);
    expect((await http().post(`/v1/admissions/applications/${l.id}/admit`).set(as('officer')).send({}).expect(201)).body.registerNo).toBe('1SB26CS400');

    // Returns: the approval list (also as CSV), the intake return against the sanctioned 60, AISHE by category.
    const appr = (await http().get(`/v1/admissions/returns/approval-list?cycleId=${cycle}`).set(as('officer')).expect(200)).body;
    expect(appr.rows.map((r: { registerNo: string; category: string; eligibilityCertificate: string }) => [r.registerNo, r.category, r.eligibilityCertificate])).toEqual([['1SB26CS400', 'GM', 'verified'], ['1SB26CS001', 'SC', 'received (BU/EC/2026/5512)']]);
    expect(appr.byProgramme[0]).toMatchObject({ sanctionedIntake: 60, approvalRef: 'VTU/AFF/2026/118', admitted: 2 });
    const csv = await http().get(`/v1/admissions/returns/approval-list?cycleId=${cycle}&format=csv`).set(as('officer')).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toMatch(/^Sl\. No\.,Programme,Academic year,Application No\./);
    const intake = (await http().get(`/v1/admissions/returns/intake?yearId=${yearId}`).set(as('officer')).expect(200)).body;
    expect(intake[0]).toMatchObject({ sanctionedIntake: 60, admitted: 1, lateral: 1, vacant: 59 });
    const aishe = (await http().get(`/v1/admissions/returns/aishe?yearId=${yearId}`).set(as('officer')).expect(200)).body;
    expect(aishe.rows[0]).toMatchObject({ sc: { female: 1, male: 0, transgender: 0 }, general: { male: 1, female: 0, transgender: 0 } });
  });

  it('takes the application fee through the Cashfree adapter: signed webhook once, and a status poll', async () => {
    const save = await http().put('/v1/admin/payments/gateways').set(as('principal')).send({ provider: 'cashfree', mode: 'test', ...CF });
    expect(save.status).toBe(200);
    const cycle = await makeCycle('Paid application', 20, { applicationFeePaise: 500_00 });
    await open(cycle);
    const a = await applyTo(cycle, 'Fee Payer');
    const co = (await http().post(pub(`/applications/${a.id}/fee/checkout`)).set('x-application-token', a.token).expect(201)).body;
    expect(co).toMatchObject({ provider: 'cashfree', amountPaise: 500_00, session: { environment: 'sandbox' } });
    const o = orders.get(co.orderId)!;
    expect(o.amountPaise).toBe(500_00);
    const body = JSON.stringify({ data: { order: { order_id: co.orderId, order_amount: 500, order_currency: 'INR' }, payment: { cf_payment_id: Number(o.paymentId), payment_status: 'SUCCESS', payment_amount: 500, payment_currency: 'INR' } }, event_time: '2026-11-03T10:05:00+05:30', type: 'PAYMENT_SUCCESS_WEBHOOK' });
    const ts = '1793600000000';
    const hook = (sig: string) => http().post(`/v1/fees/webhooks/cashfree/${t.slug}`).set('content-type', 'application/json').set('x-webhook-timestamp', ts).set('x-webhook-signature', sig).send(body);
    await hook(cashfreeSignature('wrong-secret', ts, body)).expect(401);
    expect((await hook(cashfreeSignature(CF.keySecret, ts, body)).expect(200)).body.outcome).toBe('credited');
    expect((await hook(cashfreeSignature(CF.keySecret, ts, body)).expect(200)).body.outcome).toBe('duplicate');
    const view = (await http().get(pub(`/applications/${a.id}`)).set('x-application-token', a.token).expect(200)).body;
    expect(view.feeStatus).toBe('paid');
    const [pay] = (await owner.query(`select receipt_no, gateway_account_id from application_payments where application_id = $1 and status = 'paid'`, [a.id])).rows;
    expect(pay.receipt_no).toMatch(/^RCPT\/\d{4}-\d{2}\/\d{5}$/);
    expect(pay.gateway_account_id).toBeTruthy();

    // A second applicant pays at the gateway but the webhook never arrives: the return page asks the gateway.
    const b = await applyTo(cycle, 'Late Webhook');
    const co2 = (await http().post(pub(`/applications/${b.id}/fee/checkout`)).set('x-application-token', b.token).expect(201)).body;
    await http().post(pub(`/applications/${b.id}/fee/refresh`)).set('x-application-token', b.token).expect(200);
    expect((await http().get(pub(`/applications/${b.id}`)).set('x-application-token', b.token).expect(200)).body.feeStatus).toBe('pending');
    orders.get(co2.orderId)!.paid = true;
    expect((await http().post(pub(`/applications/${b.id}/fee/refresh`)).set('x-application-token', b.token).expect(200)).body.feeStatus).toBe('paid');
    // Someone else's token gets nothing.
    await http().post(pub(`/applications/${b.id}/fee/refresh`)).set('x-application-token', a.token).expect(404);
  });

  it('broadcasts a registered template to a lead segment once, skipping opt-outs and repeated numbers', async () => {
    expect((await setting({ broadcastQuietHours: false })).status).toBe(200);
    const unregistered = (await owner.query(`insert into message_templates (tenant_id, key, channel, locale, subject, body, active) values ($1, 'lead.open-day.raw', 'sms', 'en', '', 'Open day on Saturday', true) returning id`, [t.tenantId])).rows[0].id;
    const tpl = (await owner.query(`insert into message_templates (tenant_id, key, channel, locale, subject, body, dlt_template_id, active) values ($1, 'lead.open-day', 'sms', 'en', '', 'Dear {{name}}, {{institution}} holds an open day for {{programme}} this Saturday.', '1107169876543210987', true) returning id`, [t.tenantId])).rows[0].id;
    const mk = async (name: string, ph: string) => (await http().post('/v1/admissions/enquiries').set(as('officer')).send({ name, phone: ph, programId: t.program.id, source: 'walk_in' }).expect(201)).body;
    const p1 = phone();
    const e1 = await mk('Lead One', p1);
    const e3 = await mk('Lead Opted', phone());
    await mk('Lead Four', phone());
    // The same number entered again by another desk (kept as a separate lead).
    await owner.query(`insert into enquiries (tenant_id, name, phone, program_id, source, stage) values ($1, 'Lead One Again', $2, $3, 'phone', 'new')`, [t.tenantId, p1, t.program.id]);
    const e3id = e3.enquiry?.id ?? e3.id;
    await http().post(`/v1/admissions/enquiries/${e3id}/opt-out`).set(as('officer')).send({ optedOut: true }).expect(200);
    const segment = { programId: t.program.id, stages: ['new', 'contacted'] };
    expect((await http().post('/v1/admissions/broadcasts/preview').set(as('officer')).send({ channel: 'sms', segment }).expect(200)).body).toMatchObject({ recipients: 2, optedOut: 1 });
    await http().post('/v1/admissions/broadcasts').set(as('officer')).send({ templateId: unregistered, segment }).expect(409);
    const b = (await http().post('/v1/admissions/broadcasts').set(as('officer')).send({ templateId: tpl, segment, idempotencyKey: 'open-day-2026-11' }).expect(201)).body;
    expect(b).toMatchObject({ total: 2, status: 'queued' });
    expect((await http().post('/v1/admissions/broadcasts').set(as('officer')).send({ templateId: tpl, segment, idempotencyKey: 'open-day-2026-11' }).expect(201)).body.id).toBe(b.id);
    await app.get(JobsService).drain();
    const listed = (await http().get('/v1/admissions/broadcasts').set(as('officer')).expect(200)).body;
    expect(listed.rows.find((r: { id: string }) => r.id === b.id)).toMatchObject({ status: 'done', sent: 2, failed: 0 });
    const sends = (await http().get(`/v1/admissions/broadcasts/${b.id}/sends?status=sent`).set(as('officer')).expect(200)).body;
    expect(sends.rows.map((r: { name: string }) => r.name).sort()).toEqual(['Lead Four', 'Lead One']);
    const e1id = e1.enquiry?.id ?? e1.id;
    const trail = (await http().get(`/v1/admissions/enquiries/${e1id}`).set(as('officer')).expect(200)).body;
    expect(JSON.stringify(trail)).toContain('Campaign message \\"lead.open-day');
  });

  it('answers the public status page only to the right application number and date of birth', async () => {
    const cycle = await makeCycle('Status cycle', 10);
    await open(cycle);
    const a = await applyTo(cycle, 'Status Sharada Kumari', {}, '2007-09-21');
    const no = a.no;
    await http().post(pub('/status')).send({ applicationNo: no, dateOfBirth: '2007-09-22' }).expect(404);
    await http().post(`/v1/public/admissions/${other.slug}/status`).send({ applicationNo: no, dateOfBirth: '2007-09-21' }).expect(404);
    const s = (await http().post(pub('/status')).send({ applicationNo: no.toLowerCase(), dateOfBirth: '2007-09-21' }).expect(200)).body;
    expect(s).toMatchObject({ applicationNo: no, applicant: 'Status S. K.', statusLabel: expect.any(String) });
    expect(s.steps[0]).toMatchObject({ key: 'submitted', done: true });
    expect(JSON.stringify(s)).not.toMatch(/\+91|Parent/);
  });
});
