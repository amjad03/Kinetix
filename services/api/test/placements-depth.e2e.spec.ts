import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Placements depth: the recruiter portal (self-registration, verification and key, JD posting, shortlist, results,
 * employer feedback), eligibility by batch with late registration after a cleared backlog, debarment for skipping a
 * drive, the dream-offer policy, one offer per group of companies, revocation, joining, offer letters, interview slots,
 * opt-out, placement training, progression, internships, alumni, job posts, the record kit on every list and reports.
 */
describe('placements depth', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const portal = (path: string) => `/v1/public/recruiters/${t.slug}${path}`;
  let key = '';
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));

  async function result(studentId: string, cgpa: number, passed: boolean, startsOn = '2026-09-01') {
    const [sess] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: (await db.select().from(s.academicYears))[0].id, programId: t.program.id, term: 3, name: `Exam ${startsOn}`, startsOn, endsOn: startsOn, status: 'published', createdBy: t.principal.id }).returning();
    const [r] = await db.insert(s.examResults).values({ tenantId: t.tenantId, sessionId: sess.id, studentId, sgpa: cgpa, cgpa, creditsAttempted: 4, creditsEarned: passed ? 4 : 0, creditPoints: 30, outcome: passed ? 'pass' : 'fail' }).returning();
    await db.insert(s.examResultLines).values({ tenantId: t.tenantId, resultId: r.id, subjectId: t.subject.id, credits: 4, percent: passed ? 70 : 20, grade: passed ? 'A' : 'F', gradePoint: passed ? 8 : 0, passed });
    return sess.id;
  }

  /** A drive (kit), a round, and the given students registered by the office and shortlisted. */
  async function shortlistedDrive(companyId: string, title: string, studentIds: string[], extra: object = {}) {
    const d = (await post('officer', '/v1/records/placement-drives', { companyId, title, kind: 'placement', roleTitle: 'Engineer', ctcLpa: 6, ...extra }).expect(201)).body;
    await post('officer', '/v1/records/placement-drives/bulk', { op: 'action', action: 'open', target: { ids: [d.id] } }).expect(200);
    const regs: string[] = [];
    for (const sid of studentIds) regs.push((await post('officer', `/v1/placements/drives/${d.id}/registrations`, { studentId: sid, reason: 'Registered at the desk' }).expect(201)).body.id);
    const r = (await post('officer', `/v1/placements/drives/${d.id}/rounds`, { name: 'Interview' }).expect(201)).body;
    await put('officer', `/v1/placements/drives/${d.id}/rounds/${r.id}/results`, { results: regs.map((registrationId) => ({ registrationId, result: 'pass' })) }).expect(200);
    return { drive: d.id as string, regs };
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    const [officer] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Placement Officer', email: `officer-${Math.random().toString(36).slice(2, 6)}@pl.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: officer.id, role: 'placement_officer' });
    tokens.officer = await login(t.slug, officer.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
    [ids.a, ids.b, ids.c] = t.students.map((x) => x.id);
    await result(ids.c, 7.5, true);
    await result(ids.a, 5.2, false);
    await result(ids.b, 8.1, true);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('lets a company register itself, and the cell verify it and hand over a portal key', async () => {
    const reg = { name: 'Infosys', sector: 'IT services', city: 'Bengaluru', contactName: 'Meera Iyer', designation: 'Campus hiring lead', contactEmail: 'meera@infosys.example', contactPhone: '+919845011111' };
    expect((await http().post(portal('/register')).send(reg).expect(201)).body.status).toBe('pending');
    await http().post(portal('/register')).send({ ...reg, name: 'INFOSYS' }).expect(409);
    await http().post('/v1/public/recruiters/no-such-place/register').send(reg).expect(404);
    const pending = (await get('officer', '/v1/records/placement-companies?f.status=pending').expect(200)).body;
    expect(pending.rows[0]).toMatchObject({ name: 'Infosys', selfRegistered: true, hasPortalKey: false });
    ids.infosys = pending.rows[0].id;
    await post('officer', '/v1/records/placement-drives', { companyId: ids.infosys, title: 'Early', kind: 'placement', roleTitle: 'x' }).expect(400); // not a listed (verified) company
    const v = (await post('officer', `/v1/placements/companies/${ids.infosys}/verify`).expect(200)).body;
    key = v.key;
    expect(key).toMatch(new RegExp(`^${ids.infosys}\\.[0-9a-f]{48}$`));
    expect((await get('officer', `/v1/placements/companies/${ids.infosys}`).expect(200)).body).toMatchObject({ status: 'active', hasPortalKey: true, contacts: [{ name: 'Meera Iyer', isPrimary: true }] });
    await http().get(portal('/me')).expect(401);
    await http().get(portal('/me')).set('x-recruiter-key', `${ids.infosys}.${'0'.repeat(48)}`).expect(401);
    expect((await http().get(portal('/me')).set('x-recruiter-key', key).expect(200)).body.company).toMatchObject({ name: 'Infosys' });
    // Teachers and other institutions see none of it.
    await get('teacher', '/v1/records/placement-companies').expect(403);
    expect((await get('outsider', '/v1/records/placement-companies').expect(200)).body.total).toBe(0);
  });

  it('takes a JD from the portal as a draft drive the cell opens, with eligibility by batch and a late registration', async () => {
    const jd = (await http().post(portal('/drives')).set('x-recruiter-key', key).send({ title: 'Infosys 2026 campus hiring', roleTitle: 'Systems engineer', ctcLpa: 4.5, description: 'Freshers for systems engineering roles', skills: 'Java, SQL', minCgpa: 6, maxBacklogs: 0 }).expect(201)).body;
    ids.jd = jd.id;
    expect(jd.status).toBe('draft');
    await http().get(portal(`/drives/${jd.id}/shortlist`)).set('x-recruiter-key', key).expect(409); // not open yet
    await patch('officer', `/v1/records/placement-drives/${jd.id}`, { registrationClosesOn: '2020-01-01' }).expect(200);
    expect((await post('officer', '/v1/records/placement-drives/bulk', { op: 'action', action: 'open', target: { ids: [jd.id] } }).expect(200)).body).toMatchObject({ succeeded: 1 });
    const el = (await get('officer', `/v1/placements/drives/${jd.id}/eligible`).expect(200)).body;
    expect(el.summary).toMatchObject({ total: 3, eligible: 2, registered: 0 });
    expect(el.students.find((x: { studentId: string }) => x.studentId === ids.a)).toMatchObject({ eligible: false, reasons: ['cgpa_below', 'backlogs_exceeded'], batchYear: 2028 });

    // The window has closed, so the student cannot register; the cell registers them with a reason.
    expect((await post('student', `/v1/placements/students/${ids.c}/drives/${jd.id}/registration`).expect(409)).body.reasons).toEqual(['deadline_passed']);
    const regC = (await post('officer', `/v1/placements/drives/${jd.id}/registrations`, { studentId: ids.c, reason: 'Missed the window while on an exchange' }).expect(201)).body;
    ids.regC = regC.id;
    // A cleared the backlog after the window closed: today's results make them eligible.
    expect((await post('officer', `/v1/placements/drives/${jd.id}/registrations`, { studentId: ids.a, reason: 'Late' }).expect(409)).body.reasons).toEqual(['cgpa_below', 'backlogs_exceeded']);
    await result(ids.a, 6.4, true, '2026-10-01');
    ids.regA = (await post('officer', `/v1/placements/drives/${jd.id}/registrations`, { studentId: ids.a, reason: 'Backlog cleared in the supplementary exam' }).expect(201)).body.id;
    await post('officer', `/v1/placements/drives/${jd.id}/registrations`, { studentId: ids.a, reason: 'Again' }).expect(409);
    expect((await post('officer', `/v1/placements/registrations/${ids.regA}/recheck`).expect(200)).body).toMatchObject({ cgpaAt: 6.4, backlogsAt: 0, eligible: true });
    // Batches: a drive for the 2027 batch excludes this class (graduating 2028).
    await patch('officer', `/v1/records/placement-drives/${jd.id}`, { registrationClosesOn: null }).expect(200);
  });

  it('schedules interview slots in venues, and refuses a clash', async () => {
    const r1 = (await post('officer', `/v1/placements/drives/${ids.jd}/rounds`, { name: 'Aptitude test', kind: 'aptitude' }).expect(201)).body;
    ids.r1 = r1.id;
    const start = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const made = (await post('officer', `/v1/placements/drives/${ids.jd}/rounds/${r1.id}/slots/auto`, { startsAt: start, minutes: 30, gapMinutes: 0, venues: ['Lab 1', 'Lab 2'] }).expect(201)).body;
    expect(made.scheduled).toBe(2);
    await post('officer', `/v1/placements/drives/${ids.jd}/rounds/${r1.id}/slots/auto`, { startsAt: start, minutes: 30, venues: ['Lab 1'] }).expect(409);
    const slots = (await get('officer', `/v1/placements/drives/${ids.jd}/slots`).expect(200)).body;
    expect(slots.map((x: { venue: string }) => x.venue).sort()).toEqual(['Lab 1', 'Lab 2']);
    expect((await put('officer', `/v1/placements/slots/${slots[1].id}`, { venue: slots[0].venue }).expect(409)).body.code).toBe('SLOT_CONFLICT');
    await put('officer', `/v1/placements/slots/${slots[1].id}`, { venue: 'Seminar hall', panel: 'HR and tech lead' }).expect(200);
  });

  it('takes results from the recruiter by roll number, and debars a student who skipped the drive', async () => {
    const csv = await http().get(portal(`/drives/${ids.jd}/shortlist?format=csv`)).set('x-recruiter-key', key).expect(200);
    expect(csv.text).toContain('Roll no,Name,Programme');
    expect(csv.text).toContain('R3');
    expect((await http().put(portal(`/drives/${ids.jd}/rounds/${ids.r1}/results`)).set('x-recruiter-key', key).send({ results: [{ rollNo: 'R2', result: 'pass' }] }).expect(400)).body.unknown).toEqual(['R2']);
    const res = (await http().put(portal(`/drives/${ids.jd}/rounds/${ids.r1}/results`)).set('x-recruiter-key', key).send({ results: [{ rollNo: 'r3', result: 'pass' }, { rollNo: 'R1', result: 'absent' }] }).expect(200)).body;
    expect(res).toMatchObject({ recorded: 2, debarred: 1 });
    const optins = (await get('officer', '/v1/placements/optins').expect(200)).body;
    expect(optins[0]).toMatchObject({ studentId: ids.a, debarReason: 'Absent from Infosys 2026 campus hiring after registering' });
    // While debarred A cannot register; the cell lifts it.
    const d2 = (await post('officer', '/v1/records/placement-drives', { companyId: ids.infosys, title: 'Infosys second batch', kind: 'placement', roleTitle: 'Engineer' }).expect(201)).body.id;
    await post('officer', '/v1/records/placement-drives/bulk', { op: 'action', action: 'open', target: { ids: [d2] } }).expect(200);
    expect((await post('officer', `/v1/placements/drives/${d2}/registrations`, { studentId: ids.a, reason: 'Try' }).expect(409)).body.reasons).toContain('debarred');
    await post('officer', `/v1/placements/students/${ids.a}/lift-debar`).expect(200);
    await post('officer', `/v1/placements/drives/${d2}/registrations`, { studentId: ids.a, reason: 'Debarment lifted on appeal' }).expect(201);
  });

  it('makes an offer the student accepts, then holds them to the dream policy', async () => {
    const offer = (await post('officer', `/v1/placements/drives/${ids.jd}/offers`, { registrationId: ids.regC, ctcLpa: 4.5 }).expect(201)).body;
    ids.offerC = offer.id;
    expect(offer.conditional).toBe(false);
    await post('student', `/v1/placements/offers/${offer.id}/respond`, { response: 'accepted' }).expect(200);
    await post('officer', `/v1/placements/offers/${offer.id}/joining`, { status: 'joined' }).expect(400);
    expect((await post('officer', `/v1/placements/offers/${offer.id}/joining`, { status: 'joined', joinedOn: today }).expect(200)).body).toMatchObject({ joiningStatus: 'joined' });

    const tcs = (await post('officer', '/v1/records/placement-companies', { name: 'Tata Consultancy Services', sector: 'IT services', groupName: 'Tata' }).expect(201)).body.id;
    const regular = (await post('officer', '/v1/records/placement-drives', { companyId: tcs, title: 'TCS Ninja', kind: 'placement', category: 'regular', roleTitle: 'Engineer' }).expect(201)).body.id;
    const dream = (await post('officer', '/v1/records/placement-drives', { companyId: tcs, title: 'TCS Digital', kind: 'placement', category: 'dream', roleTitle: 'Digital engineer', ctcLpa: 7 }).expect(201)).body.id;
    await post('officer', '/v1/records/placement-drives/bulk', { op: 'action', action: 'open', target: { ids: [regular, dream] } }).expect(200);
    const overview = (await get('student', `/v1/placements/students/${ids.c}/overview`).expect(200)).body;
    expect(overview.drives.find((d: { id: string }) => d.id === regular).eligibility.reasons).toEqual(['already_placed']);
    expect(overview.drives.find((d: { id: string }) => d.id === dream).eligibility.eligible).toBe(true);
    expect((await post('student', `/v1/placements/students/${ids.c}/drives/${regular}/registration`).expect(409)).body).toMatchObject({ code: 'ALREADY_PLACED' });
    await post('student', `/v1/placements/students/${ids.c}/drives/${dream}/registration`).expect(200);
    ids.tcs = tcs;
    // The company page and the recruiter portal count each drive's own registrations and offers.
    const page = (await get('officer', `/v1/placements/companies/${tcs}`).expect(200)).body;
    expect(page.drives.find((d: { id: string }) => d.id === dream)).toMatchObject({ registrations: 1, offers: 0 });
    expect(page.drives.find((d: { id: string }) => d.id === regular)).toMatchObject({ registrations: 0, offers: 0 });
    const mine = (await http().get(portal('/me')).set('x-recruiter-key', key).expect(200)).body;
    expect(mine.drives.find((d: { id: string }) => d.id === ids.jd)).toMatchObject({ selected: 1 });
  });

  it('gives one offer per group of companies, and lets a revoked offer free the student', async () => {
    const elxsi = (await post('officer', '/v1/records/placement-companies', { name: 'Tata Elxsi', sector: 'Design', groupName: 'tata' }).expect(201)).body.id;
    const one = await shortlistedDrive(ids.tcs, 'TCS Prime', [ids.b]);
    const two = await shortlistedDrive(elxsi, 'Elxsi design', [ids.b]);
    const first = (await post('officer', `/v1/placements/drives/${one.drive}/offers`, { registrationId: one.regs[0] }).expect(201)).body;
    expect((await post('officer', `/v1/placements/drives/${two.drive}/offers`, { registrationId: two.regs[0] }).expect(409)).body).toMatchObject({ code: 'SAME_GROUP_OFFER' });
    await post('officer', `/v1/placements/offers/${first.id}/revoke`, { reason: 'x' }).expect(400);
    expect((await post('officer', `/v1/placements/offers/${first.id}/revoke`, { reason: 'Hiring freeze at the company' }).expect(200)).body).toMatchObject({ status: 'revoked', revokedReason: 'Hiring freeze at the company' });
    const second = (await post('officer', `/v1/placements/drives/${two.drive}/offers`, { registrationId: two.regs[0] }).expect(201)).body;
    ids.offerB = second.id;
    // B answered on paper; the cell records it.
    expect((await post('officer', `/v1/placements/offers/${second.id}/record-response`, { response: 'accepted' }).expect(200)).body).toMatchObject({ status: 'accepted', respondedVia: 'office' });
    const list = (await get('officer', '/v1/records/placement-offers?f.status=revoked').expect(200)).body;
    expect(list.rows[0]).toMatchObject({ companyName: 'Tata Consultancy Services', groupName: 'Tata' });
  });

  it('keeps the offer letter for the cell and the student', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    await http().post(`/v1/placements/offers/${ids.offerC}/letter`).set(as('officer')).attach('file', Buffer.from('not a letter'), 'x.txt').expect(400);
    expect((await http().post(`/v1/placements/offers/${ids.offerC}/letter`).set(as('officer')).attach('file', pdf, 'offer.pdf').expect(201)).body).toMatchObject({ hasLetter: true, offerLetterName: 'offer.pdf' });
    const got = await get('student', `/v1/placements/offers/${ids.offerC}/letter`).buffer(true).expect(200);
    expect(got.headers['content-type']).toBe('application/pdf');
    await get('teacher', `/v1/placements/offers/${ids.offerC}/letter`).expect(404);
  });

  it('records opt-outs, and the student sees why a drive is closed to them', async () => {
    await put('officer', `/v1/placements/students/${ids.a}/optin`, { optedIn: false }).expect(400);
    await put('officer', `/v1/placements/students/${ids.a}/optin`, { optedIn: false, reason: 'Preparing for CAT' }).expect(200);
    await put('student', `/v1/placements/students/${ids.a}/optin`, { optedIn: true }).expect(403);
    const ov = (await get('officer', `/v1/placements/students/${ids.a}/overview`).expect(200)).body;
    expect(ov.standing).toMatchObject({ optedIn: false });
    expect(ov.drives.find((d: { title: string }) => d.title === 'TCS Ninja').eligibility.reasons).toContain('opted_out');
    expect((await put('student', `/v1/placements/students/${ids.c}/optin`, { optedIn: true }).expect(200)).body.optedIn).toBe(true);
  });

  it('runs placement training with sessions, attendance and test scores', async () => {
    const tr = (await post('officer', '/v1/records/placement-trainings', { title: 'Aptitude bootcamp', kind: 'aptitude', trainer: 'FACE Prep', programId: t.program.id, startsOn: today, endsOn: '2099-12-31', hours: 40 }).expect(201)).body;
    const sess = (await post('officer', `/v1/placements/trainings/${tr.id}/sessions`, { heldOn: today, topic: 'Quantitative aptitude', hours: 2 }).expect(201)).body;
    await post('officer', `/v1/placements/trainings/${tr.id}/sessions`, { heldOn: '2020-01-01', topic: 'Too early' }).expect(400);
    await put('officer', `/v1/placements/training-sessions/${sess.id}/attendance`, { present: [ids.c, ids.b], absent: [ids.a] }).expect(200);
    await put('officer', `/v1/placements/trainings/${tr.id}/scores`, { testName: 'Mock test 1', maxScore: 50, scores: [{ studentId: ids.c, score: 60 }] }).expect(400);
    await put('officer', `/v1/placements/trainings/${tr.id}/scores`, { testName: 'Mock test 1', maxScore: 50, takenOn: today, scores: [{ studentId: ids.c, score: 41 }, { studentId: ids.a, score: 30 }] }).expect(200);
    const detail = (await get('officer', `/v1/placements/trainings/${tr.id}`).expect(200)).body;
    expect(detail).toMatchObject({ status: 'ongoing', tests: ['Mock test 1'] });
    expect(detail.students.find((x: { id: string }) => x.id === ids.c)).toMatchObject({ attendancePct: 100, scores: { 'Mock test 1': { score: 41, maxScore: 50 } } });
    expect(detail.students.find((x: { id: string }) => x.id === ids.a).attendancePct).toBe(0);
    expect((await get('officer', '/v1/records/placement-trainings').expect(200)).body.rows[0]).toMatchObject({ sessions: 1, hoursDone: 2 });
  });

  it('keeps internships, progression and feedback on the record kit', async () => {
    const i = (await post('officer', '/v1/records/internships', { studentId: ids.c, orgName: 'Bosch', title: 'Software intern', startsOn: today, endsOn: '2099-01-31', credits: 4, creditSubjectId: t.subject.id, companyConfirmed: true }).expect(201)).body;
    expect(i).toMatchObject({ credits: 4, creditSubject: 'Corporate Accounting', companyConfirmed: true });
    await post('officer', `/v1/records/internships/${i.id}/move`, { to: t.teacher.id }).expect(200);
    expect((await get('teacher', '/v1/records/internships').expect(200)).body.total).toBe(1);

    await post('officer', '/v1/records/progressions', { studentId: ids.a, kind: 'higher_studies', year: 2028, institution: 'IIM Bangalore', program: 'MBA', exam: 'CAT' }).expect(201);
    const csv = 'Roll number,Progressed to,Year,Institution or employer,Venture\r\nR2,entrepreneurship,2028,,GreenCart Foods\r\nR9,higher_studies,2028,X,\r\n';
    const check = (await http().post('/v1/records/progressions/import').set(as('officer')).attach('file', Buffer.from(csv), 'p.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ rows: 2, error: 1 });
    await post('officer', `/v1/records/progressions/import/${check.id}/commit`, { skipErrors: true }).expect(200);
    expect((await get('officer', '/v1/records/progressions?f.kind=entrepreneurship').expect(200)).body.rows[0]).toMatchObject({ ventureName: 'GreenCart Foods' });

    await http().post(portal('/feedback')).set('x-recruiter-key', key).send({ respondentName: 'Meera Iyer', year, r1: 4, r2: 4, r3: 3, r4: 5, r5: 4, overall: 4, comments: 'Strong basics; communication can improve' }).expect(201);
    expect((await get('officer', '/v1/records/placement-feedback?f.kind=employer').expect(200)).body.rows[0]).toMatchObject({ respondentOrg: 'Infosys', source: 'recruiter_portal', average: 4 });
  });

  it('keeps the alumni directory and job posts, and students see open jobs', async () => {
    const csv = 'Full name,Graduation year,Programme,Email,Employer\r\nAnanya Rao,2019,BCom,ananya@example.in,Deloitte\r\nKarthik S,2020,BCom,,\r\n';
    const check = (await http().post('/v1/records/alumni/import').set(as('officer')).attach('file', Buffer.from(csv), 'a.csv').expect(200)).body;
    await post('officer', `/v1/records/alumni/import/${check.id}/commit`, {}).expect(200);
    const list = (await get('officer', '/v1/records/alumni?f.verified=no&q=ananya').expect(200)).body;
    expect(list.rows[0]).toMatchObject({ fullName: 'Ananya Rao', employer: 'Deloitte', verified: false });
    expect((await post('officer', '/v1/records/alumni/bulk', { op: 'action', action: 'verify', target: { ids: [list.rows[0].id] } }).expect(200)).body).toMatchObject({ succeeded: 1 });
    await post('officer', '/v1/records/alumni-jobs', { title: 'Audit associate', company: 'Deloitte', kind: 'job', applyContact: 'careers@deloitte.example', closesOn: '2099-12-31' }).expect(201);
    expect((await get('student', '/v1/placements/jobs/open').expect(200)).body).toEqual([expect.objectContaining({ title: 'Audit associate', company: 'Deloitte' })]);
  });

  it('reports placement by programme, the NIRF table, offers and the internship register', async () => {
    const branch = (await get('officer', '/v1/placements/reports/branch?year=2028').expect(200)).body;
    expect(branch.rows).toEqual([expect.objectContaining({ program: 'BCom', students: 3, placed: 2, optedOut: 1, higherStudies: 1, medianCtc: expect.any(Number) })]);
    const nirf = (await get('officer', '/v1/placements/reports/nirf?year=2028').expect(200)).body.rows[0];
    expect(nirf).toMatchObject({ graduating: 3, placed: 2, higherStudies: 1, entrepreneurs: 1 });
    expect(nirf.medianSalary).toBeGreaterThan(0);
    const offers = await get('officer', `/v1/placements/reports/offers?year=${year}&format=csv`).expect(200);
    expect(offers.text).toContain('Infosys');
    const x = await get('officer', `/v1/placements/reports/internships?year=${year}&format=xlsx`).buffer(true).expect(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    expect((await get('officer', `/v1/placements/reports/companies?year=${year}`).expect(200)).body.rows.length).toBeGreaterThan(0);
    expect((await get('officer', `/v1/placements/reports/feedback?year=${year}`).expect(200)).body.rows[0]).toMatchObject({ kind: 'employer', responses: 1 });
    await get('teacher', '/v1/placements/reports/branch').expect(403);
    await get('officer', '/v1/placements/reports/nope').expect(404);
  });
});
