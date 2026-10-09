import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('HR lifecycle: appraisal, training, offers, onboarding, exit', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const binary = (r: request.Test) => r.buffer().parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@life.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const hod = await addUser('Hari Hod', 'hod');
    const hod2 = await addUser('Hita Hod', 'hod');
    const newbie = await addUser('Nina New', 'teacher');
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      hod: await login(t.slug, hod.email!),
      hod2: await login(t.slug, hod2.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      newbie: await login(t.slug, newbie.email!),
      principal: await login(t.slug, t.principal.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { hr: hr.id, hod: hod.id, teacher: t.teacher.id, teacher2: t.teacher2.id, newbie: newbie.id });
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Science', headUserId: hod2.id });
    await db.insert(s.departmentStaff).values({ tenantId: t.tenantId, departmentId: dept.id, userId: t.teacher.id });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'E100', departmentId: dept.id, dateOfJoining: '2020-06-01' });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: newbie.id, employeeCode: 'E200', dateOfJoining: '2026-10-19' });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('runs a faculty appraisal: self form, HoD review of their own department, principal final score', async () => {
    const cats = (await get('teacher', '/v1/hr/appraisal-categories').expect(200)).body;
    expect(cats.categories.map((c: { key: string }) => c.key)).toContain('teaching_learning');
    await post('teacher', '/v1/hr/appraisal-cycles', { period: '2026-27', opensOn: '2026-10-01', closesOn: '2026-12-31' }).expect(403);
    const cycle = (await post('hr', '/v1/hr/appraisal-cycles', { period: '2026-27', opensOn: '2026-10-01', closesOn: '2026-12-31' }).expect(201)).body;
    await post('hr', '/v1/hr/appraisal-cycles', { period: '2026-27', opensOn: '2026-10-01', closesOn: '2026-12-31' }).expect(409);

    await put('teacher', '/v1/hr/appraisals/me', { cycleId: cycle.id, scores: { teaching_learning: { score: 101 } } }).expect(400); // above the category maximum
    await put('teacher', '/v1/hr/appraisals/me', { cycleId: cycle.id, scores: { nonsense: { score: 1 } } }).expect(400);
    const draft = (await put('teacher', '/v1/hr/appraisals/me', { cycleId: cycle.id, scores: { teaching_learning: { score: 80, evidence: '4 courses, 92% pass' } } }).expect(200)).body;
    expect(draft).toMatchObject({ status: 'draft' });
    const sub = (await put('teacher', '/v1/hr/appraisals/me', { cycleId: cycle.id, scores: { teaching_learning: { score: 90, evidence: '4 courses, 92% pass' }, research: { score: 60 }, student_activities: { score: 30 }, administration: { score: 20 }, professional_development: { score: 15 } }, submit: true }).expect(200)).body;
    expect(sub).toMatchObject({ status: 'self_submitted', selfPercent: 71.67 });
    await put('teacher', '/v1/hr/appraisals/me', { cycleId: cycle.id, scores: {}, submit: true }).expect(409); // locked
    expect((await get('teacher', `/v1/hr/appraisals/me?cycleId=${cycle.id}`).expect(200)).body.id).toBe(sub.id);

    const review = { scores: { teaching_learning: { score: 85 }, research: { score: 55 }, student_activities: { score: 30 }, administration: { score: 20 }, professional_development: { score: 15 } }, remarks: 'Strong year' };
    await put('teacher', `/v1/hr/appraisals/${sub.id}/hod-review`, review).expect(403); // not a reviewer
    await put('hod2', `/v1/hr/appraisals/${sub.id}/hod-review`, review).expect(403); // heads another department
    await get('hod2', `/v1/hr/appraisals?cycleId=${cycle.id}`).expect(200).then((r) => expect(r.body).toHaveLength(0));
    expect((await get('hod', `/v1/hr/appraisals?cycleId=${cycle.id}`).expect(200)).body).toHaveLength(1);
    await put('principal', `/v1/hr/appraisals/${sub.id}/finalise`, {}).expect(409); // HoD has not reviewed
    const reviewed = (await put('hod', `/v1/hr/appraisals/${sub.id}/hod-review`, review).expect(200)).body;
    expect(reviewed).toMatchObject({ status: 'hod_reviewed', hodPercent: 68.33 });
    await put('hr', `/v1/hr/appraisals/${sub.id}/finalise`, {}).expect(403); // only the principal
    await get('teacher2', `/v1/hr/appraisals/${sub.id}`).expect(403);
    const fin = (await put('principal', `/v1/hr/appraisals/${sub.id}/finalise`, { remarks: 'Agreed' }).expect(200)).body;
    expect(fin).toMatchObject({ status: 'finalised', finalScore: 68.33, grade: 'Good' });
    await put('principal', `/v1/hr/appraisals/${sub.id}/finalise`, {}).expect(409);
    await put('hod', `/v1/hr/appraisals/${sub.id}/hod-review`, review).expect(409);
    await get('outsider', `/v1/hr/appraisals/${sub.id}`).expect(404);
  });

  it('keeps training and FDP records, with HR verification and a yearly summary', async () => {
    const mine = (await post('teacher', '/v1/hr/training-records', { title: 'FDP on outcome-based education', kind: 'fdp', organiser: 'NITTTR', startsOn: '2026-07-01', endsOn: '2026-07-05', hours: 30, certificateRef: 'CERT-889' }).expect(201)).body;
    expect(mine.verified).toBe(false);
    await post('teacher', '/v1/hr/training-records', { userId: ids.teacher2, title: 'Not mine', startsOn: '2026-07-01', endsOn: '2026-07-01', hours: 1 }).expect(403);
    await post('teacher', '/v1/hr/training-records', { title: 'Backwards', startsOn: '2026-07-05', endsOn: '2026-07-01', hours: 1 }).expect(400);
    expect((await get('hr', '/v1/hr/training-summary?year=2026').expect(200)).body).toHaveLength(0); // nothing verified yet
    await post('teacher', `/v1/hr/training-records/${mine.id}/verify`).expect(403);
    await post('hr', `/v1/hr/training-records/${mine.id}/verify`).expect(200);
    const hrAdded = (await post('hr', '/v1/hr/training-records', { userId: ids.teacher, title: 'Excel workshop', kind: 'workshop', startsOn: '2026-08-10', endsOn: '2026-08-10', hours: 6 }).expect(201)).body;
    expect(hrAdded.verified).toBe(true);
    expect((await get('hr', '/v1/hr/training-summary?year=2026').expect(200)).body).toEqual([{ userId: ids.teacher, fullName: expect.any(String), programmes: 2, hours: 36 }]);
    expect((await get('teacher', '/v1/hr/training-records').expect(200)).body).toHaveLength(2);
    expect((await get('teacher2', '/v1/hr/training-records').expect(200)).body).toHaveLength(0);
    await http().delete(`/v1/hr/training-records/${mine.id}`).set(auth('teacher')).expect(403); // verified: locked
    await http().delete(`/v1/hr/training-records/${hrAdded.id}`).set(auth('teacher2')).expect(403);
  });

  it('issues an offer letter from recruitment, with a PDF, and hires on acceptance', async () => {
    const opening = (await post('hr', '/v1/hr/openings', { title: 'Lecturer in Commerce', positions: 1 }).expect(201)).body;
    const applicant = (await post('hr', `/v1/hr/openings/${opening.id}/applicants`, { fullName: 'Om Prakash', email: 'om@x.in' }).expect(201)).body;
    const body = { annualCtcPaise: 60_000_000, joiningOn: '2026-11-15', validUntil: '2026-11-01', terms: 'Probation of six months.' };
    await post('teacher', `/v1/hr/applicants/${applicant.id}/offer`, body).expect(403);
    await post('hr', `/v1/hr/applicants/${applicant.id}/offer`, { ...body, validUntil: '2026-10-01' }).expect(400); // already expired
    const offer = (await post('hr', `/v1/hr/applicants/${applicant.id}/offer`, body).expect(201)).body;
    expect(offer).toMatchObject({ offerNo: 'OFR/2026/0001', position: 'Lecturer in Commerce', status: 'issued' });
    await post('hr', `/v1/hr/applicants/${applicant.id}/offer`, body).expect(409); // one live offer at a time
    expect((await get('hr', `/v1/hr/openings/${opening.id}/applicants`).expect(200)).body[0].stage).toBe('offer');
    const pdf = await binary(get('hr', `/v1/hr/offers/${offer.id}/pdf`)).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await get('teacher', `/v1/hr/offers/${offer.id}/pdf`).expect(403);
    await get('outsider', `/v1/hr/offers/${offer.id}/pdf`).expect(404);
    await put('hr', `/v1/hr/offers/${offer.id}/status`, { status: 'accepted' }).expect(200);
    expect((await get('hr', `/v1/hr/openings/${opening.id}/applicants`).expect(200)).body[0].stage).toBe('hired');
    await put('hr', `/v1/hr/offers/${offer.id}/status`, { status: 'declined' }).expect(409);
  });

  it('gives a new joiner a dated onboarding checklist they can partly tick themselves', async () => {
    await post('teacher', `/v1/hr/staff/${ids.newbie}/onboarding/start`).expect(403);
    const items = (await post('hr', `/v1/hr/staff/${ids.newbie}/onboarding/start`).expect(201)).body as { id: string; owner: string; dueOn: string; title: string }[];
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.find((i) => i.title.startsWith('Sign the appointment'))!.dueOn).toBe('2026-10-20'); // joined 19 October + 1 day
    await post('hr', `/v1/hr/staff/${ids.newbie}/onboarding/start`).expect(409);
    const mineItem = items.find((i) => i.owner === 'Employee')!;
    const hrItem = items.find((i) => i.owner === 'HR')!;
    expect((await put('newbie', `/v1/hr/onboarding/${mineItem.id}/done`, { done: true }).expect(200)).body.done).toBe(true);
    await put('newbie', `/v1/hr/onboarding/${hrItem.id}/done`, { done: true }).expect(403);
    await put('teacher2', `/v1/hr/onboarding/${mineItem.id}/done`, { done: false }).expect(403);
    await put('hr', `/v1/hr/onboarding/${hrItem.id}/done`, { done: true }).expect(200);
    await get('teacher2', `/v1/hr/staff/${ids.newbie}/onboarding`).expect(403);
    const overview = (await get('hr', '/v1/hr/onboarding').expect(200)).body;
    expect(overview[0]).toMatchObject({ userId: ids.newbie, done: 2 });
  });

  it('takes a resignation through notice, clearance, settlement note and a relieving letter', async () => {
    await post('teacher', '/v1/hr/separations', { userId: ids.teacher2, reason: 'Moving cities' }).expect(403);
    const sep = (await post('teacher', '/v1/hr/separations', { reason: 'Moving to another city', noticeDays: 30 }).expect(201)).body;
    expect(sep).toMatchObject({ status: 'submitted', resignedOn: '2026-10-20', lastWorkingDay: '2026-11-19', noticeShortfallDays: 0 });
    await post('teacher', '/v1/hr/separations', { reason: 'Again please' }).expect(409);
    await post('teacher', `/v1/hr/separations/${sep.id}/accept`).expect(403);
    await get('teacher2', `/v1/hr/separations/${sep.id}`).expect(403);

    // HR agrees the person may leave today; the shortfall is the whole notice period.
    const accepted = (await post('hr', `/v1/hr/separations/${sep.id}/accept`, { lastWorkingDay: '2026-10-20' }).expect(200)).body;
    expect(accepted).toMatchObject({ status: 'clearance', noticeShortfallDays: 30 });
    expect(accepted.clearances.map((c: { department: string }) => c.department).sort()).toEqual(['Accounts', 'Department', 'HR', 'Hostel', 'IT', 'Library']);
    await post('hr', `/v1/hr/separations/${sep.id}/accept`).expect(409);

    await put('teacher', `/v1/hr/separations/${sep.id}/clearances/Library`, { status: 'cleared' }).expect(403);
    await put('hod2', `/v1/hr/separations/${sep.id}/clearances/Library`, { status: 'cleared' }).expect(403); // a HoD cannot clear the library
    await put('hod', `/v1/hr/separations/${sep.id}/clearances/Department`, { status: 'cleared', remarks: 'Marks submitted' }).expect(200);
    await put('hr', `/v1/hr/separations/${sep.id}/clearances/Nowhere`, {}).expect(400);
    await put('hr', `/v1/hr/separations/${sep.id}/settlement`, { settlementPaise: 1, note: 'Too early for this' }).expect(409);
    await put('hr', `/v1/hr/separations/${sep.id}/clearances/Library`, { status: 'cleared', duesPaise: 25_000, remarks: 'Fine for 2 late books' }).expect(200);
    for (const d of ['Accounts', 'HR', 'Hostel', 'IT']) await put('hr', `/v1/hr/separations/${sep.id}/clearances/${d}`, { status: 'cleared' }).expect(200);
    await get('teacher', `/v1/hr/separations/${sep.id}/relieving-letter`).expect(409); // not yet relieved
    await post('hr', `/v1/hr/separations/${sep.id}/relieve`).expect(409); // no settlement yet

    const settled = (await put('hr', `/v1/hr/separations/${sep.id}/settlement`, { settlementPaise: 4_500_000, note: 'Salary to 20 October, leave encashment, less library fine and 30 days notice shortfall.' }).expect(200)).body;
    expect(settled).toMatchObject({ status: 'settled', settlementPaise: 4_500_000, duesPaise: 25_000 });
    const relieved = (await post('hr', `/v1/hr/separations/${sep.id}/relieve`).expect(200)).body;
    expect(relieved).toMatchObject({ status: 'relieved', relievedOn: '2026-10-20' });
    const [staff] = (await owner.query('select status, date_of_leaving from staff_profiles where user_id = $1', [ids.teacher])).rows;
    expect(staff).toMatchObject({ status: 'exited' });
    expect((await owner.query('select status from users where id = $1', [ids.teacher])).rows[0].status).toBe('disabled');

    const letter = await binary(get('hr', `/v1/hr/separations/${sep.id}/relieving-letter`)).expect(200);
    expect((letter.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await post('hr', `/v1/hr/separations/${sep.id}/withdraw`).expect(409);
    await get('outsider', `/v1/hr/separations/${sep.id}`).expect(404);
  });
});
