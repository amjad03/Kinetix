import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

describe('admissions: entrance tests, seat quotas and campaigns', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let yearId: string;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const pub = (path: string) => `/v1/public/admissions/${t.slug}${path}`;
  let phoneN = 0;

  const makeCycle = async (name: string, seats: number, meritRules: object[]) => {
    const res = await http()
      .post('/v1/admissions/cycles')
      .set(as('officer'))
      .send({
        programId: t.program.id,
        academicYearId: yearId,
        name,
        entryTerm: 3,
        seats,
        opensOn: istDay(-1),
        closesOn: istDay(30),
        formFields: [{ key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 }],
        meritRules,
      })
      .expect(201);
    await http().post(`/v1/admissions/cycles/${res.body.id}/status`).set(as('officer')).send({ status: 'open' }).expect(200);
    return res.body.id as string;
  };
  const applyTo = async (cycleId: string, name: string, marks: number) => {
    const n = ++phoneN;
    const r = await http()
      .post(pub(`/cycles/${cycleId}/applications`))
      .send({ applicantName: name, dateOfBirth: '2008-03-10', phone: `+9198100${String(n).padStart(5, '0')}`, guardianName: `Parent ${name}`, guardianPhone: `+9198200${String(n).padStart(5, '0')}`, answers: { marks_12th: marks } })
      .expect(201);
    return { id: r.body.id as string, token: r.body.token as string, no: r.body.applicationNo as string };
  };
  const toReview = async (cycleId: string, apps: { id: string }[]) => {
    for (const a of apps) await http().post(`/v1/admissions/applications/${a.id}/status`).set(as('officer')).send({ status: 'under_review' }).expect(200);
    await http().post(`/v1/admissions/cycles/${cycleId}/evaluate`).set(as('officer')).expect(200);
  };
  const statusOf = async (id: string) => (await owner.query(`select status from applications where id = $1`, [id])).rows[0].status as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    const hash = await argon2.hash('pw');
    const u = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Officer', $2, $3) returning id`, [t.tenantId, `officer@${t.slug}.in`, hash]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'admissions_officer')`, [t.tenantId, u.rows[0].id]);
    yearId = (await owner.query(`select id from academic_years where tenant_id = $1`, [t.tenantId])).rows[0].id;
    app = await createApp(new FixedClock(new Date()));
    tokens = { officer: await login(t.slug, `officer@${t.slug}.in`), teacher: await login(t.slug, t.teacher.email!) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('runs an entrance test: halls with capacity, seats, hall tickets, scores into the merit list, quotas at offer', async () => {
    const cycleId = await makeCycle('Entrance intake', 3, [{ field: 'entrance_score', weight: 1 }]);
    const names = ['Asha', 'Bala', 'Chitra', 'Dev', 'Esha'];
    const apps = [];
    for (const [i, n] of names.entries()) apps.push(await applyTo(cycleId, n, 90 - i));
    await toReview(cycleId, apps);

    // Quotas: one of the three seats is reserved for OBC.
    await http().put(`/v1/admissions/cycles/${cycleId}/quotas`).set(as('teacher')).send({ quotas: [] }).expect(403);
    await http().put(`/v1/admissions/cycles/${cycleId}/quotas`).set(as('officer')).send({ quotas: [{ category: 'OBC', reservedSeats: 4 }] }).expect(400); // more than the seats
    const q = (await http().put(`/v1/admissions/cycles/${cycleId}/quotas`).set(as('officer')).send({ quotas: [{ category: 'OBC', reservedSeats: 1 }] }).expect(200)).body;
    expect(q).toMatchObject({ seats: 3, generalSeats: 2, generalLeft: 2, quotas: [{ category: 'OBC', reservedSeats: 1, taken: 0, left: 1 }] });
    await http().post(`/v1/admissions/applications/${apps[3].id}/category`).set(as('officer')).send({ category: 'obc' }).expect(200);

    // The test, with a hall too small for five candidates.
    const test = (await http().post('/v1/admissions/entrance-tests').set(as('officer')).send({ cycleId, name: 'BCom entrance', testDate: istDay(0), startsAt: '10:00', maxScore: 100, passScore: 40, venue: 'Main block', halls: [{ name: 'Hall A', capacity: 2 }] }).expect(201)).body;
    expect(test).toMatchObject({ capacity: 2, seated: 0 });
    const tooSmall = await http().post(`/v1/admissions/entrance-tests/${test.id}/allocate`).set(as('officer')).expect(409);
    expect(tooSmall.body.message).toMatch(/5 candidates.*only 2/);
    expect((await http().get(`/v1/admissions/entrance-tests/${test.id}/seating`).set(as('officer')).expect(200)).body).toHaveLength(0); // nothing allocated
    await http().post(`/v1/admissions/entrance-tests/${test.id}/halls`).set(as('officer')).send({ name: 'Hall A', capacity: 5 }).expect(409); // duplicate name
    await http().post(`/v1/admissions/entrance-tests/${test.id}/halls`).set(as('officer')).send({ name: 'Hall B', capacity: 3 }).expect(201);
    const done = (await http().post(`/v1/admissions/entrance-tests/${test.id}/allocate`).set(as('officer')).expect(200)).body;
    expect(done).toMatchObject({ allocated: 5, seated: 5 });
    const seating = (await http().get(`/v1/admissions/entrance-tests/${test.id}/seating`).set(as('officer')).expect(200)).body;
    expect(seating.map((s: { hall: string; seatNo: number }) => `${s.hall}-${s.seatNo}`)).toEqual(['Hall A-1', 'Hall A-2', 'Hall B-1', 'Hall B-2', 'Hall B-3']);
    expect((await http().post(`/v1/admissions/entrance-tests/${test.id}/allocate`).set(as('officer')).expect(200)).body.allocated).toBe(0); // idempotent

    // Hall tickets: staff and the applicant.
    const ticket = await http().get(`/v1/admissions/entrance-tests/${test.id}/hall-ticket/${apps[0].id}`).set(as('officer')).buffer().parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(ticket.headers['content-type']).toContain('application/pdf');
    expect((ticket.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await http().get(pub(`/applications/${apps[1].id}/hall-ticket`)).set('x-application-token', apps[1].token).expect(200);
    await http().get(pub(`/applications/${apps[1].id}/hall-ticket`)).set('x-application-token', apps[0].token).expect(404);

    // No merit list until scores are in.
    await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(409);
    const future = (await http().post('/v1/admissions/entrance-tests').set(as('officer')).send({ cycleId, name: 'Later test', testDate: istDay(5), startsAt: '10:00', maxScore: 50, halls: [] }).expect(201)).body;
    await http().put(`/v1/admissions/entrance-tests/${future.id}/scores`).set(as('officer')).send({ scores: [{ applicationId: apps[0].id, score: 10 }] }).expect(400); // not held yet
    await http().put(`/v1/admissions/entrance-tests/${test.id}/scores`).set(as('officer')).send({ scores: [{ applicationId: apps[0].id, score: 101 }] }).expect(400); // above the maximum
    const scored = (await http().put(`/v1/admissions/entrance-tests/${test.id}/scores`).set(as('officer')).send({
      scores: [
        { applicationId: apps[0].id, score: 70 },
        { applicationId: apps[1].id, score: 60 },
        { applicationId: apps[2].id, score: 55 },
        { applicationId: apps[3].id, score: 45 },
        { applicationId: apps[4].id, absent: true },
      ],
    }).expect(200)).body;
    expect(scored.scored).toBe(5);

    // Merit list: Esha was absent. Asha and Bala take the two general seats, Chitra is waitlisted
    // (general seats full) and Dev takes the reserved OBC seat despite ranking below her.
    const list = (await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(201)).body;
    const entries = list.entries as { applicationId: string; rank: number; score: number; decision: string }[];
    expect(entries.map((e) => [e.applicationId, e.decision])).toEqual([
      [apps[0].id, 'offer'],
      [apps[1].id, 'offer'],
      [apps[2].id, 'waitlist'],
      [apps[3].id, 'offer'],
    ]);
    expect(entries[0].score).toBe(70);
    await http().post(`/v1/admissions/merit-lists/${list.id}/publish`).set(as('officer')).expect(200);
    expect(await statusOf(apps[0].id)).toBe('offered');
    expect(await statusOf(apps[2].id)).toBe('waitlisted');
    expect(await statusOf(apps[3].id)).toBe('offered');
    expect(await statusOf(apps[4].id)).toBe('eligible'); // absent: not ranked
    expect((await http().get(`/v1/admissions/cycles/${cycleId}/quotas`).set(as('officer')).expect(200)).body).toMatchObject({ generalLeft: 0, quotas: [{ category: 'OBC', taken: 1, left: 0 }] });
  });

  it('enforces category quotas when an offer is made by hand', async () => {
    const cycleId = await makeCycle('Quota intake', 2, []);
    await http().put(`/v1/admissions/cycles/${cycleId}/quotas`).set(as('officer')).send({ quotas: [{ category: 'SC', reservedSeats: 1 }] }).expect(200);
    const [x, y, z] = [await applyTo(cycleId, 'Xena', 80), await applyTo(cycleId, 'Yash', 70), await applyTo(cycleId, 'Zoya', 60)];
    await toReview(cycleId, [x, y, z]);
    await http().post(`/v1/admissions/applications/${z.id}/category`).set(as('officer')).send({ category: 'SC' }).expect(200);
    const offer = (a: { id: string }) => http().post(`/v1/admissions/applications/${a.id}/status`).set(as('officer')).send({ status: 'offered' });
    await offer(x).expect(200); // takes the one general seat
    const refused = await offer(y).expect(409);
    expect(refused.body.message).toMatch(/general seats/i);
    await offer(z).expect(200); // the reserved SC seat
    await http().put(`/v1/admissions/cycles/${cycleId}/quotas`).set(as('officer')).send({ quotas: [{ category: 'SC', reservedSeats: 2 }] }).expect(409); // offers already made would not fit
  });

  it('tracks campaigns from the enquiry and reports conversion', async () => {
    await http().post('/v1/admissions/campaigns').set(as('officer')).send({ name: 'Diwali drive', channel: 'instagram', utmSource: 'instagram', utmMedium: 'paid', utmCampaign: 'diwali26', budgetPaise: 100_000 }).expect(201);
    await http().post('/v1/admissions/campaigns').set(as('officer')).send({ name: 'Diwali drive', channel: 'x' }).expect(400); // duplicate name
    const base = { programId: t.program.id };
    await http().post(pub('/enquiries')).send({ ...base, name: 'Meera Rao', phone: '98111 00001', utmCampaign: 'diwali26', utmSource: 'instagram', utmMedium: 'paid' }).expect(201);
    await http().post(pub('/enquiries')).send({ ...base, name: 'Nita Rao', phone: '98111 00002', utmCampaign: 'DIWALI26' }).expect(201);
    await http().post(pub('/enquiries')).send({ ...base, name: 'Omar Khan', phone: '98111 00003', utmCampaign: 'unknown-tag' }).expect(201); // unknown: no campaign
    await http().post('/v1/admissions/enquiries').set(as('officer')).send({ name: 'Walk In', phone: '98111 00004', source: 'walk_in' }).expect(201);

    const rows = (await owner.query(`select name, utm_source, utm_medium, campaign_id from enquiries where tenant_id = $1 and phone like '+9198111%' order by phone`, [t.tenantId])).rows;
    expect(rows.map((r: { campaign_id: string | null }) => !!r.campaign_id)).toEqual([true, true, false, false]);
    expect(rows[0]).toMatchObject({ utm_source: 'instagram', utm_medium: 'paid' });

    await owner.query(`update enquiries set stage = 'converted' where tenant_id = $1 and phone = '+919811100001'`, [t.tenantId]);
    const report = (await http().get('/v1/admissions/reports/campaigns').set(as('officer')).expect(200)).body;
    const c = report.campaigns.find((x: { name: string }) => x.name === 'Diwali drive');
    expect(c).toMatchObject({ enquiries: 2, enrolled: 1, conversionPct: 50, costPerEnrolmentPaise: 100_000 });
    expect(report.unattributed.enquiries).toBeGreaterThanOrEqual(2);
    await http().get('/v1/admissions/reports/campaigns').set(as('teacher')).expect(403);
  });
});
