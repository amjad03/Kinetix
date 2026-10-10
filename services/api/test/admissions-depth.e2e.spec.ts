import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

describe('admission depth: index marks, rank lists, seat matrix, CAP rounds, agent rules, lead connectors', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let yearId: string;
  let officerId: string;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const pub = (path: string) => `/v1/public/admissions/${t.slug}${path}`;
  let phoneN = 0;

  const makeCycle = async (name: string, seats: number) => {
    const res = await http()
      .post('/v1/admissions/cycles')
      .set(as('officer'))
      .send({ programId: t.program.id, academicYearId: yearId, name, entryTerm: 3, seats, opensOn: istDay(-1), closesOn: istDay(30), formFields: [{ key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 }], meritRules: [] })
      .expect(201);
    await http().post(`/v1/admissions/cycles/${res.body.id}/status`).set(as('officer')).send({ status: 'open' }).expect(200);
    return res.body.id as string;
  };
  const applyTo = async (cycleId: string, name: string) => {
    const n = ++phoneN;
    const r = await http()
      .post(pub(`/cycles/${cycleId}/applications`))
      .send({ applicantName: name, dateOfBirth: '2008-03-10', phone: `+9198500${String(n).padStart(5, '0')}`, guardianName: `Parent ${name}`, guardianPhone: `+9198600${String(n).padStart(5, '0')}`, answers: { marks_12th: 80 } })
      .expect(201);
    return { id: r.body.id as string, token: r.body.token as string };
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const u = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Officer', $2, $3) returning id`, [t.tenantId, `officer@${t.slug}.in`, hash]);
    officerId = u.rows[0].id;
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'admissions_officer')`, [t.tenantId, officerId]);
    yearId = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    app = await createApp(new FixedClock(new Date()));
    tokens = { officer: await login(t.slug, `officer@${t.slug}.in`), teacher: await login(t.slug, t.teacher.email!) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('ranks by index mark and runs CAP rounds with category seats, float upgrades and forfeits; the registry sets the reserved shares', async () => {
    const cycleId = await makeCycle('Engineering CAP', 10);
    // Reserved shares come from the rule registry: 50% of seats for SC.
    await owner.query(
      `insert into business_rules (tenant_id, domain, key, version, title, params, status, effective_from, author_id, approver_id, approved_at) values ($1, 'quota', 'admission-seats', 1, 'SC share', $2, 'approved', $3, $4, $4, now())`,
      [t.tenantId, JSON.stringify({ reservedPercent: { sc: 50 } }), istDay(-5), officerId],
    );
    expect((await http().get('/v1/admissions/index-presets').set(as('officer')).expect(200)).body.map((p: { key: string }) => p.key)).toContain('engineering');
    await http().put(`/v1/admissions/cycles/${cycleId}/index-formula`).set(as('officer')).send({ preset: 'engineering' }).expect(200);
    await http().put(`/v1/admissions/cycles/${cycleId}/index-formula`).set(as('teacher')).send({ preset: 'engineering' }).expect(403);

    const apps: Record<string, { id: string; token: string }> = {};
    const marks: Record<string, { entrance: number; maths: number; physics: number; chemistry: number; sc: boolean }> = {
      Asha: { entrance: 280, maths: 95, physics: 90, chemistry: 90, sc: true },
      Bala: { entrance: 270, maths: 90, physics: 90, chemistry: 90, sc: false },
      Chitra: { entrance: 250, maths: 85, physics: 80, chemistry: 80, sc: true },
      Dev: { entrance: 200, maths: 70, physics: 70, chemistry: 70, sc: true },
    };
    for (const [name, m] of Object.entries(marks)) {
      apps[name] = await applyTo(cycleId, name);
      if (m.sc) await owner.query(`update applications set category = 'SC' where id = $1`, [apps[name].id]);
    }
    // Marks above the maximum are refused; a missing mark keeps the applicant off the list.
    await http().put(`/v1/admissions/applications/${apps.Asha.id}/index-marks`).set(as('officer')).send({ marks: { entrance: 301 } }).expect(400);
    const first = (await http().put(`/v1/admissions/applications/${apps.Asha.id}/index-marks`).set(as('officer')).send({ marks: { entrance: 280, maths: 95 } }).expect(200)).body;
    expect(first.complete).toBe(false);
    for (const [name, m] of Object.entries(marks)) {
      const row = (await http().put(`/v1/admissions/applications/${apps[name].id}/index-marks`).set(as('officer')).send({ marks: { entrance: m.entrance, maths: m.maths, physics: m.physics, chemistry: m.chemistry } }).expect(200)).body;
      expect(row.complete).toBe(true);
    }
    // Asha: 280 + 95 + 45 + 45 = 465
    expect((await http().get(`/v1/admissions/cycles/${cycleId}/rank-list`).set(as('officer')).expect(200)).body.rows).toHaveLength(0);
    expect((await http().post(`/v1/admissions/cycles/${cycleId}/rank-list`).set(as('officer')).expect(200)).body).toMatchObject({ ranked: 4 });
    const list = (await http().get(`/v1/admissions/cycles/${cycleId}/rank-list`).set(as('officer')).expect(200)).body.rows as { name: string; indexMark: number; overallRank: number; categoryRank: number | null }[];
    expect(list.map((r) => r.name)).toEqual(['Asha', 'Bala', 'Chitra', 'Dev']);
    expect(list[0]).toMatchObject({ indexMark: 465, overallRank: 1, categoryRank: 1 });
    const sc = (await http().get(`/v1/admissions/cycles/${cycleId}/rank-list?category=SC`).set(as('officer')).expect(200)).body.rows;
    expect(sc.map((r: { name: string }) => r.name)).toEqual(['Asha', 'Chitra', 'Dev']);

    // Seat matrix: 2 seats in each option, the SC share (5 of 10 seats) gives each option 1 SC seat and 1 merit seat.
    const matrix = (await http().put(`/v1/admissions/cycles/${cycleId}/seat-matrix`).set(as('officer')).send({ generate: [{ label: 'CSE', seats: 2 }, { label: 'ME', seats: 2 }] }).expect(200)).body as { option: string; category: string; seats: number }[];
    expect(matrix.filter((m) => m.option === 'CSE').map((m) => [m.category, m.seats]).sort()).toEqual([['merit', 1], ['sc', 1]]);
    await http().put(`/v1/admissions/cycles/${cycleId}/seat-matrix`).set(as('officer')).send({ rows: [{ option: 'CSE', category: 'merit', seats: 99 }] }).expect(400);

    await http().put(`/v1/admissions/applications/${apps.Asha.id}/preferences`).set(as('officer')).send({ options: ['Nowhere'] }).expect(400);
    for (const [name, prefs] of Object.entries({ Asha: ['CSE', 'ME'], Bala: ['CSE', 'ME'], Chitra: ['CSE', 'ME'], Dev: ['CSE', 'ME'] })) {
      await http().put(`/v1/admissions/applications/${apps[name].id}/preferences`).set(as('officer')).send({ options: prefs }).expect(200);
    }

    // Round 1: Asha CSE merit, Bala ME merit, Chitra CSE sc, Dev ME sc.
    const r1 = (await http().post(`/v1/admissions/cycles/${cycleId}/rounds`).set(as('officer')).expect(201)).body;
    expect(r1).toMatchObject({ roundNo: 1, allotments: 4 });
    await http().post(`/v1/admissions/cycles/${cycleId}/rounds`).set(as('officer')).expect(409);
    const al1 = (await http().get(`/v1/admissions/rounds/${r1.id}/allotments`).set(as('officer')).expect(200)).body.allotments as { id: string; name: string; option: string; seatCategory: string }[];
    expect(al1.map((a) => [a.name, a.option, a.seatCategory])).toEqual([['Asha', 'CSE', 'merit'], ['Bala', 'ME', 'merit'], ['Chitra', 'CSE', 'sc'], ['Dev', 'ME', 'sc']]);
    const byName = (n: string, list = al1) => list.find((a) => a.name === n)!;

    // Applicants answer only while the round is published, with their own token.
    await http().post(`/v1/admissions/allotments/${byName('Asha').id}/respond`).set(as('officer')).send({ response: 'freeze' }).expect(409);
    await http().post(`/v1/admissions/rounds/${r1.id}/publish`).set(as('officer')).expect(200);
    await http().post(`/v1/admissions/rounds/${r1.id}/publish`).set(as('officer')).expect(409);
    const mine = await http().get(pub(`/applications/${apps.Asha.id}/allotments`)).set('x-application-token', apps.Asha.token).expect(200);
    expect(mine.body[0]).toMatchObject({ roundNo: 1, option: 'CSE', response: 'pending' });
    await http().get(pub(`/applications/${apps.Asha.id}/allotments`)).set('x-application-token', apps.Bala.token).expect(404);
    await http().post(pub(`/applications/${apps.Asha.id}/allotments/${byName('Bala').id}/respond`)).set('x-application-token', apps.Asha.token).send({ response: 'freeze' }).expect(404);
    await http().post(pub(`/applications/${apps.Asha.id}/allotments/${byName('Asha').id}/respond`)).set('x-application-token', apps.Asha.token).send({ response: 'freeze' }).expect(200);
    await http().put(`/v1/admissions/applications/${apps.Asha.id}/preferences`).set(as('officer')).send({ options: ['ME'] }).expect(409);
    await http().post(`/v1/admissions/allotments/${byName('Bala').id}/respond`).set(as('officer')).send({ response: 'float' }).expect(200);
    await http().post(`/v1/admissions/allotments/${byName('Chitra').id}/respond`).set(as('officer')).send({ response: 'reject' }).expect(200);
    await http().post(`/v1/admissions/allotments/${byName('Dev').id}/respond`).set(as('officer')).send({ response: 'float' }).expect(200);
    const closed = (await http().post(`/v1/admissions/rounds/${r1.id}/close`).set(as('officer')).expect(200)).body;
    expect(closed.forfeited).toBe(0);

    // Round 2: Chitra gave up the CSE sc seat; Dev (floating, wants CSE) upgrades and frees the ME sc seat; Bala keeps ME.
    const r2 = (await http().post(`/v1/admissions/cycles/${cycleId}/rounds`).set(as('officer')).expect(201)).body;
    expect(r2.roundNo).toBe(2);
    const al2 = (await http().get(`/v1/admissions/rounds/${r2.id}/allotments`).set(as('officer')).expect(200)).body.allotments as { name: string; option: string; seatCategory: string; kind: string; response: string }[];
    expect(al2.map((a) => [a.name, a.option, a.seatCategory, a.kind, a.response])).toEqual([['Bala', 'ME', 'merit', 'kept', 'float'], ['Dev', 'CSE', 'sc', 'upgraded', 'pending']]);
    await http().post(`/v1/admissions/rounds/${r2.id}/publish`).set(as('officer')).expect(200);
    expect((await http().post(`/v1/admissions/rounds/${r2.id}/close`).set(as('officer')).expect(200)).body.forfeited).toBe(1);
    const seats = (await http().get(`/v1/admissions/cycles/${cycleId}/seat-matrix`).set(as('officer')).expect(200)).body as { option: string; category: string; left: number }[];
    // Dev forfeited the upgrade by not answering, so no seat stays held in round 2 beyond Asha, Bala; ME sc and CSE sc are free.
    expect(seats.find((s) => s.option === 'ME' && s.category === 'sc')!.left).toBe(1);
    expect(seats.find((s) => s.option === 'CSE' && s.category === 'merit')!.left).toBe(0);
    await http().put(`/v1/admissions/cycles/${cycleId}/seat-matrix`).set(as('officer')).send({ generate: [{ label: 'CSE', seats: 2 }] }).expect(409);
  });

  it('pays agents by the most specific rule (a slab here), then pays them out net of tax', async () => {
    const cycleId = await makeCycle('Agent intake', 5);
    const agent = (await http().post('/v1/admissions/agents').set(as('officer')).send({ name: 'Greenfield Partners', kind: 'partner', commissionPaise: 100_000 }).expect(201)).body;
    await http().post('/v1/admissions/commission-rules').set(as('officer')).send({ kind: 'slab', slabs: [] }).expect(400);
    const rule = (await http().post('/v1/admissions/commission-rules').set(as('officer')).send({ agentId: agent.id, programId: t.program.id, kind: 'slab', slabs: [{ upTo: 1, paise: 700_000 }, { upTo: null, paise: 300_000 }], tdsBps: 1000 }).expect(201)).body;
    const a = await applyTo(cycleId, 'Agent Student');
    await http().put(`/v1/admissions/applications/${a.id}/agent`).set(as('officer')).send({ agentId: agent.id }).expect(200);
    await http().post(`/v1/admissions/applications/${a.id}/status`).set(as('officer')).send({ status: 'under_review' }).expect(200);
    await http().post(`/v1/admissions/cycles/${cycleId}/evaluate`).set(as('officer')).expect(200);
    await http().post(`/v1/admissions/applications/${a.id}/status`).set(as('officer')).send({ status: 'offered' }).expect(200);
    await http().post(pub(`/applications/${a.id}/offer/accept`)).set('x-application-token', a.token).expect(200);
    await http().post(`/v1/admissions/applications/${a.id}/enroll`).set(as('officer')).send({}).expect(201);

    const commissions = (await http().get(`/v1/admissions/commissions?agentId=${agent.id}`).set(as('officer')).expect(200)).body;
    expect(commissions[0]).toMatchObject({ amountPaise: 700_000, status: 'accrued' });
    await http().post(`/v1/admissions/agents/${agent.id}/payouts`).set(as('teacher')).send({ commissionIds: [commissions[0].id], paidOn: istDay(0) }).expect(403);
    const payout = (await http().post(`/v1/admissions/agents/${agent.id}/payouts`).set(as('officer')).send({ commissionIds: [commissions[0].id], paidOn: istDay(0), reference: 'UTR123' }).expect(201)).body;
    expect(payout).toMatchObject({ grossPaise: 700_000, tdsPaise: 70_000, netPaise: 630_000, reference: 'UTR123' });
    await http().post(`/v1/admissions/agents/${agent.id}/payouts`).set(as('officer')).send({ commissionIds: [commissions[0].id], paidOn: istDay(0) }).expect(409);
    expect((await http().get(`/v1/admissions/payouts?agentId=${agent.id}`).set(as('officer')).expect(200)).body).toHaveLength(1);
    await http().delete(`/v1/admissions/commission-rules/${rule.id}`).set(as('officer')).expect(200);
    expect((await http().get('/v1/admissions/commission-rules').set(as('officer')).expect(200)).body).toHaveLength(0);
  });

  it('turns Meta, Google and website leads into enquiries, rejects bad signatures, dedupes, and reports source ROI', async () => {
    const mk = async (body: object) => (await http().post('/v1/admissions/lead-connectors').set(as('officer')).send(body).expect(201)).body;
    const web = await mk({ kind: 'website', name: 'Website form', programId: t.program.id });
    const meta = await mk({ kind: 'meta', name: 'Meta lead ads', secret: 'meta-app-secret-1', programId: t.program.id });
    const google = await mk({ kind: 'google', name: 'Google Ads', secret: 'google-key-12345' });
    expect(web.secret).toHaveLength(48);
    await http().post('/v1/admissions/lead-connectors').set(as('officer')).send({ kind: 'website', name: 'Website form' }).expect(409);
    // The list never shows secrets.
    expect(JSON.stringify((await http().get('/v1/admissions/lead-connectors').set(as('officer')).expect(200)).body)).not.toContain(web.secret);

    const hook = (c: { id: string }) => `/v1/public/leads/${t.slug}/${c.id}`;
    // Website: key in a header.
    await http().post(hook(web)).set('x-lead-key', 'wrong').send({ name: 'Nope', phone: '9810000001' }).expect(404);
    const w1 = await http().post(hook(web)).set('x-lead-key', web.secret).send({ submissionId: 'S1', name: 'Web Lead', phone: '98100 00002', email: 'w@x.in' }).expect(200);
    expect(w1.body.status).toBe('ok');
    expect((await http().post(hook(web)).set('x-lead-key', web.secret).send({ submissionId: 'S1', name: 'Web Lead', phone: '9810000002' }).expect(200)).body.status).toBe('duplicate');
    expect((await http().post(hook(web)).set('x-lead-key', web.secret).send({ submissionId: 'S2', name: 'X', phone: '12' }).expect(200)).body.status).toBe('rejected');

    // Meta: HMAC over the raw body, plus the setup handshake.
    const lead = JSON.stringify({ entry: [{ changes: [{ value: { leadgen_id: 'M1', field_data: [{ name: 'full_name', values: ['Meta Lead'] }, { name: 'phone_number', values: ['+919810000003'] }] } }] }] });
    const sig = (s: string, key = 'meta-app-secret-1') => `sha256=${createHmac('sha256', key).update(s).digest('hex')}`;
    await http().post(hook(meta)).set('content-type', 'application/json').set('x-hub-signature-256', sig(lead, 'other')).send(lead).expect(404);
    expect((await http().post(hook(meta)).set('content-type', 'application/json').set('x-hub-signature-256', sig(lead)).send(lead).expect(200)).body.status).toBe('ok');
    await http().get(`${hook(meta)}?hub.mode=subscribe&hub.verify_token=meta-app-secret-1&hub.challenge=abc123`).expect(200).expect('abc123');
    await http().get(`${hook(meta)}?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc123`).expect(404);

    // Google: the key travels in the payload.
    expect((await http().post(hook(google)).send({ google_key: 'google-key-12345', lead_id: 'G1', user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Google Lead' }, { column_id: 'PHONE_NUMBER', string_value: '+919810000004' }] }).expect(200)).body.status).toBe('ok');
    await http().post(hook(google)).send({ google_key: 'nope', lead_id: 'G2' }).expect(404);

    // A switched-off connector looks like a missing one.
    await http().patch(`/v1/admissions/lead-connectors/${web.id}`).set(as('officer')).send({ active: false }).expect(200);
    await http().post(hook(web)).set('x-lead-key', web.secret).send({ submissionId: 'S3', name: 'Late', phone: '9810000009' }).expect(404);

    const enq = (await http().get('/v1/admissions/enquiries').set(as('officer')).expect(200)).body as { name: string; source: string }[];
    expect(enq.filter((e) => ['Web Lead', 'Meta Lead', 'Google Lead'].includes(e.name)).map((e) => e.source).sort()).toEqual(['campaign', 'campaign', 'web']);

    // Spend and ROI: one enrolment from the Meta channel.
    await owner.query(`update enquiries set stage = 'converted' where tenant_id = $1 and name = 'Meta Lead'`, [t.tenantId]);
    await http().put('/v1/admissions/lead-spend').set(as('officer')).send({ rows: [{ channel: 'Meta', day: istDay(0), spendPaise: 2_000_000, impressions: 5000, clicks: 120 }, { channel: 'google', day: istDay(0), spendPaise: 500_000 }] }).expect(200);
    await http().put('/v1/admissions/lead-spend').set(as('officer')).send({ rows: [{ channel: 'meta', day: istDay(0), spendPaise: 1_000_000, impressions: 5000, clicks: 120 }] }).expect(200);
    const roi = (await http().get('/v1/admissions/source-roi?revenuePerEnrolmentPaise=5000000').set(as('officer')).expect(200)).body;
    const m = roi.rows.find((r: { channel: string }) => r.channel === 'meta');
    expect(m).toMatchObject({ leads: 1, enrolled: 1, spendPaise: 1_000_000, costPerLeadPaise: 1_000_000, costPerEnrolmentPaise: 1_000_000, revenuePaise: 5_000_000, roiPct: 400 });
    expect(roi.rows.find((r: { channel: string }) => r.channel === 'google')).toMatchObject({ leads: 1, enrolled: 0, spendPaise: 500_000, roiPct: -100 });
    expect(roi.total.leads).toBeGreaterThanOrEqual(3);
  });
});
