import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

describe('admissions growth: lead score, agents, interviews, online entrance test', () => {
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

  const makeCycle = async (name: string, seats: number, meritRules: object[]) => {
    const res = await http()
      .post('/v1/admissions/cycles')
      .set(as('officer'))
      .send({ programId: t.program.id, academicYearId: yearId, name, entryTerm: 3, seats, opensOn: istDay(-1), closesOn: istDay(30), formFields: [{ key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 }], meritRules })
      .expect(201);
    await http().post(`/v1/admissions/cycles/${res.body.id}/status`).set(as('officer')).send({ status: 'open' }).expect(200);
    return res.body.id as string;
  };
  const applyTo = async (cycleId: string, name: string, marks = 80) => {
    const n = ++phoneN;
    const r = await http()
      .post(pub(`/cycles/${cycleId}/applications`))
      .send({ applicantName: name, dateOfBirth: '2008-03-10', phone: `+9198300${String(n).padStart(5, '0')}`, guardianName: `Parent ${name}`, guardianPhone: `+9198400${String(n).padStart(5, '0')}`, answers: { marks_12th: marks } })
      .expect(201);
    return { id: r.body.id as string, token: r.body.token as string, no: r.body.applicationNo as string };
  };
  const toReview = async (cycleId: string, apps: { id: string }[]) => {
    for (const a of apps) await http().post(`/v1/admissions/applications/${a.id}/status`).set(as('officer')).send({ status: 'under_review' }).expect(200);
    await http().post(`/v1/admissions/cycles/${cycleId}/evaluate`).set(as('officer')).expect(200);
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

  it('scores leads by rule, sorts by score, and tracks referral codes, agents and commission per enrolment', async () => {
    const agent = (await http().post('/v1/admissions/agents').set(as('officer')).send({ name: 'Sunrise Consultants', kind: 'partner', commissionPaise: 500_000, phone: '9876500001' }).expect(201)).body;
    expect(agent.referralCode).toMatch(/^SUNR\d{3}$/);
    await http().post('/v1/admissions/agents').set(as('officer')).send({ name: 'Dup', referralCode: agent.referralCode }).expect(409);
    await http().post('/v1/admissions/agents').set(as('teacher')).send({ name: 'Nope' }).expect(403);

    await http().post(pub('/enquiries')).send({ name: 'Cold Web', phone: '98700 00001' }).expect(201);
    await http().post(pub('/enquiries')).send({ name: 'Warm Referral', phone: '98700 00002', email: 'warm@x.in', programId: t.program.id, referralCode: agent.referralCode.toLowerCase() }).expect(201);
    const bad = await http().post(pub('/enquiries')).send({ name: 'Typo', phone: '98700 00003', referralCode: 'NOPE999' }).expect(400);
    expect(bad.body.message).toMatch(/referral code/i);

    let list = (await http().get('/v1/admissions/enquiries?sort=score').set(as('officer')).expect(200)).body as { name: string; leadScore: number; source: string; agentId: string | null }[];
    expect(list.map((e) => e.name).slice(0, 2)).toEqual(['Warm Referral', 'Cold Web']);
    // referral 25 + programme 10 + email 5 = 40; web 5 = 5
    expect(list[0]).toMatchObject({ leadScore: 40, source: 'referral', agentId: agent.id });
    expect(list[1].leadScore).toBe(5);

    // Follow-up work raises the score: a call (+5 activity, +5 stage contacted).
    const cold = (await owner.query(`select id from enquiries where tenant_id = $1 and name = 'Cold Web'`, [t.tenantId])).rows[0].id;
    await http().post(`/v1/admissions/enquiries/${cold}/activities`).set(as('officer')).send({ kind: 'call', note: 'Spoke to parent' }).expect(201);
    list = (await http().get('/v1/admissions/enquiries?sort=score').set(as('officer')).expect(200)).body;
    expect(list.find((e) => e.name === 'Cold Web')!.leadScore).toBe(15);

    // The referral enquiry becomes an enrolled student: the commission accrues once.
    const cycleId = await makeCycle('Referral intake', 5, []);
    const a = await applyTo(cycleId, 'Referred Student');
    await toReview(cycleId, [a]);
    await owner.query(`update enquiries set application_id = $1 where tenant_id = $2 and name = 'Warm Referral'`, [a.id, t.tenantId]);
    await owner.query(`update applications set enquiry_id = (select id from enquiries where tenant_id = $2 and name = 'Warm Referral') where id = $1`, [a.id, t.tenantId]);
    await http().post(`/v1/admissions/applications/${a.id}/status`).set(as('officer')).send({ status: 'offered' }).expect(200);
    await http().post(pub(`/applications/${a.id}/offer/accept`)).set('x-application-token', a.token).expect(200);
    await http().post(`/v1/admissions/applications/${a.id}/enroll`).set(as('officer')).send({}).expect(201);

    const commissions = (await http().get(`/v1/admissions/commissions?agentId=${agent.id}`).set(as('officer')).expect(200)).body;
    expect(commissions).toHaveLength(1);
    expect(commissions[0]).toMatchObject({ amountPaise: 500_000, status: 'accrued', applicantName: 'Referred Student' });
    let agents = (await http().get('/v1/admissions/agents').set(as('officer')).expect(200)).body;
    expect(agents[0]).toMatchObject({ enquiries: 1, enrolled: 1, accruedPaise: 500_000, paidPaise: 0 });

    // Pay it out; paying again is refused.
    await http().post('/v1/admissions/commissions/pay').set(as('officer')).send({ ids: [commissions[0].id], paidOn: istDay(0) }).expect(200);
    await http().post('/v1/admissions/commissions/pay').set(as('officer')).send({ ids: [commissions[0].id], paidOn: istDay(0) }).expect(400);
    agents = (await http().get('/v1/admissions/agents').set(as('officer')).expect(200)).body;
    expect(agents[0]).toMatchObject({ accruedPaise: 0, paidPaise: 500_000 });
    // A deactivated agent's code no longer works.
    await http().patch(`/v1/admissions/agents/${agent.id}`).set(as('officer')).send({ active: false }).expect(200);
    await http().post(pub('/enquiries')).send({ name: 'Late Code', phone: '98700 00009', referralCode: agent.referralCode }).expect(400);
  });

  it('schedules interviews with a panel, collects score sheets and feeds the merit list', async () => {
    const cycleId = await makeCycle('Interview intake', 2, [{ field: 'interview_score', weight: 1 }]);
    const [x, y, z] = [await applyTo(cycleId, 'Ira'), await applyTo(cycleId, 'Jai'), await applyTo(cycleId, 'Kia')];
    await toReview(cycleId, [x, y, z]);
    const slot = new Date(Date.now() + 86400_000).toISOString();
    const panel = [{ userId: officerId, name: 'Officer' }, { userId: null, name: 'Dr Rao' }];
    const iv = async (a: { id: string }, at = slot) => (await http().post('/v1/admissions/interviews').set(as('officer')).send({ applicationId: a.id, slotAt: at, venue: 'Room 4', panel })).body;
    const first = (await http().post('/v1/admissions/interviews').set(as('officer')).send({ applicationId: x.id, slotAt: slot, venue: 'Room 4', panel }).expect(201)).body;
    await http().post('/v1/admissions/interviews').set(as('officer')).send({ applicationId: y.id, slotAt: slot, panel }).expect(409); // same panelists, same slot
    const iy = (await http().post('/v1/admissions/interviews').set(as('officer')).send({ applicationId: y.id, slotAt: new Date(Date.now() + 2 * 86400_000).toISOString(), panel }).expect(201)).body;
    const iz = (await http().post('/v1/admissions/interviews').set(as('officer')).send({ applicationId: z.id, slotAt: new Date(Date.now() + 3 * 86400_000).toISOString(), panel }).expect(201)).body;
    expect(iv).toBeDefined();

    // Only a panelist (or admissions staff) fills a sheet; scores cannot exceed the maximum.
    await http().put(`/v1/admissions/interviews/${first.id}/sheet`).set(as('teacher')).send({ criteria: [{ criterion: 'Communication', score: 5, max: 10 }] }).expect(403);
    await http().put(`/v1/admissions/interviews/${first.id}/sheet`).set(as('officer')).send({ criteria: [{ criterion: 'Communication', score: 11, max: 10 }] }).expect(400);
    await http().post(`/v1/admissions/interviews/${first.id}/complete`).set(as('officer')).send({ outcome: 'selected' }).expect(400); // no sheet yet
    const sheet = (score: number[]) => ({ criteria: [{ criterion: 'Communication', score: score[0], max: 10 }, { criterion: 'Aptitude', score: score[1], max: 10 }] });
    const detail = (await http().put(`/v1/admissions/interviews/${first.id}/sheet`).set(as('officer')).send(sheet([9, 8])).expect(200)).body;
    expect(detail.sheets).toHaveLength(1);
    await http().put(`/v1/admissions/interviews/${iy.id}/sheet`).set(as('officer')).send(sheet([6, 6])).expect(200);
    await http().put(`/v1/admissions/interviews/${iz.id}/sheet`).set(as('officer')).send(sheet([10, 10])).expect(200);
    const done = (await http().post(`/v1/admissions/interviews/${first.id}/complete`).set(as('officer')).send({ outcome: 'selected' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'done', outcome: 'selected', score: 85 });
    await http().post(`/v1/admissions/interviews/${iy.id}/complete`).set(as('officer')).send({ outcome: 'waitlisted' }).expect(200);
    await http().post(`/v1/admissions/interviews/${iz.id}/complete`).set(as('officer')).send({ outcome: 'rejected', remarks: 'Not suitable' }).expect(200);
    await http().put(`/v1/admissions/interviews/${first.id}/sheet`).set(as('officer')).send(sheet([1, 1])).expect(400); // closed

    // Kia scored highest but the panel rejected her: she is left out. Ira (85) ranks above Jai (60).
    const list = (await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(201)).body;
    expect(list.entries.map((e: { applicationId: string; decision: string }) => [e.applicationId, e.decision])).toEqual([[x.id, 'offer'], [y.id, 'offer']]);
    expect(list.entries[0].score).toBe(85);
    const all = (await http().get(`/v1/admissions/interviews?cycleId=${cycleId}`).set(as('officer')).expect(200)).body;
    expect(all).toHaveLength(3);
  });

  it('runs a timed online entrance test from the question bank and scores it into the merit list', async () => {
    const cycleId = await makeCycle('Online intake', 3, [{ field: 'entrance_score', weight: 1 }]);
    const [p, q] = [await applyTo(cycleId, 'Pia'), await applyTo(cycleId, 'Quin')];
    await toReview(cycleId, [p, q]);
    for (let i = 0; i < 6; i++) {
      await http().post('/v1/admissions/entrance-questions').set(as('officer')).send({ topic: 'Maths', question: `What is ${i} + ${i}?`, options: ['0', `${2 * i}`, '99', '7'], correctIndex: 1, marks: 2 }).expect(201);
    }
    await http().post('/v1/admissions/entrance-questions').set(as('officer')).send({ question: 'Bad one?', options: ['a', 'b'], correctIndex: 4 }).expect(400);
    const test = (await http().post('/v1/admissions/entrance-tests').set(as('officer')).send({ cycleId, name: 'Online aptitude', testDate: istDay(0), startsAt: '10:00', durationMinutes: 30, maxScore: 60, passScore: 10, halls: [] }).expect(201)).body;
    const tooMany = await http().put(`/v1/admissions/entrance-tests/${test.id}/online`).set(as('officer')).send({ questionCount: 20, negativeMarks: 0.5, open: true }).expect(400);
    expect(tooMany.body.message).toMatch(/only 6/);
    await http().put(`/v1/admissions/entrance-tests/${test.id}/online`).set(as('officer')).send({ questionCount: 4, negativeMarks: 0.5, open: false }).expect(200);
    expect((await http().get(pub(`/applications/${p.id}/online-tests`)).set('x-application-token', p.token).expect(200)).body).toHaveLength(0); // not open yet
    await http().put(`/v1/admissions/entrance-tests/${test.id}/online`).set(as('officer')).send({ questionCount: 4, negativeMarks: 0.5, open: true }).expect(200);

    // Token login.
    await http().post(pub('/applicant-login')).send({ applicationNo: p.no, token: q.token }).expect(404);
    const lg = (await http().post(pub('/applicant-login')).send({ applicationNo: p.no, token: p.token }).expect(200)).body;
    expect(lg.applicationId).toBe(p.id);
    await http().get(pub(`/applications/${p.id}/online-tests`)).set('x-application-token', q.token).expect(404);
    const tests = (await http().get(pub(`/applications/${p.id}/online-tests`)).set('x-application-token', p.token).expect(200)).body;
    expect(tests).toMatchObject([{ testId: test.id, questionCount: 4, status: 'not_started' }]);

    const run = (await http().post(pub(`/applications/${p.id}/online-tests/${test.id}/start`)).set('x-application-token', p.token).expect(200)).body;
    expect(run.questions).toHaveLength(4);
    expect(JSON.stringify(run)).not.toContain('correctIndex');
    expect(new Date(run.deadlineAt).getTime() - new Date(run.startedAt).getTime()).toBeCloseTo(30 * 60_000, -3);
    const again = (await http().post(pub(`/applications/${p.id}/online-tests/${test.id}/start`)).set('x-application-token', p.token).expect(200)).body;
    expect(again.questions.map((x: { id: string }) => x.id)).toEqual(run.questions.map((x: { id: string }) => x.id)); // resumes the same draw

    // Right answer = index 1. Three right, one wrong: 3*2 - 0.5 = 5.5 of 8, scaled to 60.
    const ids = run.questions.map((x: { id: string }) => x.id) as string[];
    await http().put(pub(`/applications/${p.id}/online-tests/${test.id}/answers`)).set('x-application-token', p.token).send({ answers: { [ids[0]]: 1 } }).expect(200);
    const sub = (await http().post(pub(`/applications/${p.id}/online-tests/${test.id}/submit`)).set('x-application-token', p.token).send({ answers: { [ids[1]]: 1, [ids[2]]: 1, [ids[3]]: 2 } }).expect(200)).body;
    expect(sub.score).toBe(41.25);
    await http().post(pub(`/applications/${p.id}/online-tests/${test.id}/submit`)).set('x-application-token', p.token).send({ answers: {} }).expect(409);
    await http().post(pub(`/applications/${p.id}/online-tests/${test.id}/start`)).set('x-application-token', p.token).expect(409);

    // Quin runs out of time: what was saved is scored when staff look.
    const qrun = (await http().post(pub(`/applications/${q.id}/online-tests/${test.id}/start`)).set('x-application-token', q.token).expect(200)).body;
    await http().put(pub(`/applications/${q.id}/online-tests/${test.id}/answers`)).set('x-application-token', q.token).send({ answers: { [qrun.questions[0].id]: 1, [qrun.questions[1].id]: 1 } }).expect(200);
    await owner.query(`update entrance_attempts set deadline_at = now() - interval '1 minute' where application_id = $1`, [q.id]);
    const attempts = (await http().get(`/v1/admissions/entrance-tests/${test.id}/attempts`).set(as('officer')).expect(200)).body;
    expect(attempts.find((a: { applicationId: string }) => a.applicationId === q.id)).toMatchObject({ answered: 2, score: 30 });
    await http().post(pub(`/applications/${q.id}/online-tests/${test.id}/submit`)).set('x-application-token', q.token).send({ answers: {} }).expect(409);

    // Scores sit on the entrance seat list and drive the merit list.
    const seating = (await http().get(`/v1/admissions/entrance-tests/${test.id}/seating`).set(as('officer')).expect(200)).body as { applicationId: string; score: number; hall: string }[];
    expect(seating.map((s) => [s.hall, s.score]).sort()).toEqual([['Online', 30], ['Online', 41.25]]);
    const list = (await http().post(`/v1/admissions/cycles/${cycleId}/merit-lists`).set(as('officer')).expect(201)).body;
    expect(list.entries.map((e: { applicationId: string; score: number }) => [e.applicationId, e.score])).toEqual([[p.id, 41.25], [q.id, 30]]);
  });
});
