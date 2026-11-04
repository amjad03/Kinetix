import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { studentPriorEducation } from '../src/db/schema-g1.js';
import { studentProfiles } from '../src/db/schema-sis.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * The placements production pass, worked by hand on the test college (one BCom class of three students, Sem 3 of 6
 * in 2026-27, so the batch graduates in 2028):
 *   A: woman, class 10 88% (2022), class 12 80% (2024), joined 2024 (no gap), all subjects passed.
 *   B: man, class 10 76% (2022), class 12 78% (2024), all passed; goes on to an MBA and qualifies GATE.
 *   C: woman, class 10 70% (2020), class 12 72% (2022), joined 2024 (two years' gap), one subject failed.
 * Settings: dream from 6 LPA, super dream from 10 LPA, 14 internship credits, AICTE 45 hours a credit.
 */
describe('placements pass', () => {
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
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
  const action = (entity: string, name: string, id: string, params?: object) => post('officer', `/v1/records/${entity}/bulk`, { op: 'action', action: name, target: { ids: [id] }, ...(params ? { params } : {}) });

  async function result(studentId: string, passed: boolean) {
    const [sess] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: (await db.select().from(s.academicYears).where(eq(s.academicYears.tenantId, t.tenantId)))[0].id, programId: t.program.id, term: 3, name: `Exam ${studentId.slice(0, 4)}`, startsOn: '2026-09-01', endsOn: '2026-09-01', status: 'published', createdBy: t.principal.id }).returning();
    const [r] = await db.insert(s.examResults).values({ tenantId: t.tenantId, sessionId: sess.id, studentId, sgpa: 7, cgpa: 7, creditsAttempted: 4, creditsEarned: passed ? 4 : 0, creditPoints: 28, outcome: passed ? 'pass' : 'fail' }).returning();
    await db.insert(s.examResultLines).values({ tenantId: t.tenantId, resultId: r.id, subjectId: t.subject.id, credits: 4, percent: passed ? 70 : 20, grade: passed ? 'A' : 'F', gradePoint: passed ? 7 : 0, passed });
  }
  async function newDrive(title: string, extra: object) {
    const d = (await post('officer', '/v1/records/placement-drives', { companyId: ids.company, title, kind: 'placement', roleTitle: 'Analyst', ...extra }).expect(201)).body;
    return d as { id: string; category: string };
  }
  const notices = async (key: string) => db.select().from(s.notifications).where(and(eq(s.notifications.tenantId, t.tenantId), like(s.notifications.dedupeKey, key)));

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    const [officer] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Placement Officer', email: `officer-${Math.random().toString(36).slice(2, 6)}@pl.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: officer.id, role: 'placement_officer' });
    const [alum] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Ravi Alumnus', email: `alum-${Math.random().toString(36).slice(2, 6)}@pl.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: alum.id, role: 'alumni' });
    tokens.officer = await login(t.slug, officer.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.alumni = await login(t.slug, alum.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
    [ids.a, ids.b, ids.c] = t.students.map((x) => x.id);
    await db.update(s.students).set({ enrolledOn: '2024-08-01' }).where(eq(s.students.tenantId, t.tenantId));
    await db.insert(studentProfiles).values([
      { tenantId: t.tenantId, studentId: ids.a, gender: 'female' },
      { tenantId: t.tenantId, studentId: ids.b, gender: 'male' },
      { tenantId: t.tenantId, studentId: ids.c, gender: 'female' },
    ]);
    const prior = (studentId: string, y10: number, p10: number, y12: number, p12: number) => [
      { tenantId: t.tenantId, studentId, level: 'secondary' as const, institution: 'Govt High School', board: 'KSEEB', passingYear: y10, percentage: p10 },
      { tenantId: t.tenantId, studentId, level: 'puc' as const, institution: 'City PU College', board: 'PUE Karnataka', passingYear: y12, percentage: p12 },
    ];
    await db.insert(studentPriorEducation).values([...prior(ids.a, 2022, 88, 2024, 80), ...prior(ids.b, 2022, 76, 2024, 78), ...prior(ids.c, 2020, 70, 2022, 72)]);
    await result(ids.a, true);
    await result(ids.b, true);
    await result(ids.c, false);
    const cur = (await get('principal', '/v1/quality-hub/settings/placements').expect(200)).body.settings;
    await put('principal', '/v1/quality-hub/settings/placements', { ...cur, rules: { ...cur.rules, dreamMinLpa: 6, superDreamMinLpa: 10, internshipCreditsRequired: 14 } }).expect(200);
    ids.company = (await post('officer', '/v1/records/placement-companies', { name: 'Brightwave Technologies', sector: 'IT services' }).expect(201)).body.id;
    const [al] = await db.insert(s.alumniProfiles).values({ tenantId: t.tenantId, userId: alum.id, fullName: 'Ravi Alumnus', graduationYear: 2021, program: 'BCom', employer: 'Infosys', directoryVisible: true, mentorAvailable: true }).returning();
    ids.alumni = al.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('applies gender, class 12, gap-year and verified-document rules, and tells only the eligible when the drive opens', async () => {
    // 12 LPA is at or above the 10 LPA line: super dream without being told.
    const d = await newDrive('Women in analytics 2028', { ctcLpa: 12, genderRule: 'female', minTwelfthPct: 75, maxGapYears: 1, maxBacklogs: 1, requireVerifiedDocs: true });
    expect(d.category).toBe('super_dream');
    ids.d2 = d.id;
    const why = async () => Object.fromEntries((await get('officer', `/v1/placements/drives/${d.id}/eligible`).expect(200)).body.students.map((x: { studentId: string; reasons: string[] }) => [x.studentId, x.reasons]));
    let r = await why();
    expect(r[ids.a]).toEqual(['documents_not_verified']);
    expect(r[ids.b]).toEqual(['gender_not_eligible', 'documents_not_verified']);
    // C: 72% in class 12 (below 75) and two years between class 12 (2022) and joining (2024).
    expect(r[ids.c]).toEqual(['twelfth_below', 'gap_exceeded', 'documents_not_verified']);
    const el = (await get('officer', `/v1/placements/drives/${d.id}/eligible`).expect(200)).body.students.find((x: { studentId: string }) => x.studentId === ids.c);
    expect(el).toMatchObject({ tenthPct: 70, twelfthPct: 72, gapYears: 2, gender: 'female', backlogs: 1, backlogHistory: 1 });

    // The cell uploads A's resume (verified at once); C uploads her own (waits for the cell).
    const up = (who: string, sid: string, kind = 'resume') => http().post(`/v1/placements/students/${sid}/documents`).set(as(who)).field('kind', kind).attach('file', PDF, 'resume.pdf');
    expect((await up('officer', ids.a).expect(201)).body).toMatchObject({ status: 'verified', kind: 'resume' });
    await up('student', ids.a).expect(403); // a student uploads only their own
    await http().post(`/v1/placements/students/${ids.c}/documents`).set(as('student')).field('kind', 'resume').attach('file', Buffer.from('plain text'), 'x.txt').expect(400);
    const mine = (await up('student', ids.c).expect(201)).body;
    expect(mine.status).toBe('pending');
    expect(mine.storageKey).toBeUndefined();
    r = await why();
    expect(r[ids.a]).toEqual([]);
    expect(r[ids.c]).toContain('documents_not_verified');
    await action('placement-documents', 'reject', mine.id, { reason: 'x' }).expect(400); // a reason of a few words
    expect((await action('placement-documents', 'verify', mine.id).expect(200)).body.succeeded).toBe(1);
    expect((await get('student', `/v1/placements/students/${ids.c}/documents`).expect(200)).body.required).toEqual([{ kind: 'resume', label: 'Resume', status: 'verified' }]);
    r = await why();
    expect(r[ids.c]).toEqual(['twelfth_below', 'gap_exceeded']);
    expect((await notices('doc:%')).length).toBe(1); // C was told her resume is verified

    // Opening tells A's family only (A has no login; her father does), once.
    await action('placement-drives', 'open', d.id).expect(200);
    const told = await notices(`drive-open:${d.id}`);
    expect(told.map((n) => n.userId)).toEqual([t.guardian.id]);
    expect(told[0]).toMatchObject({ title: 'Brightwave Technologies is hiring' });
    await action('placement-drives', 'close', d.id).expect(200);
    await action('placement-drives', 'open', d.id).expect(200);
    expect((await notices(`drive-open:${d.id}`)).length).toBe(1);

    // C cannot register; the registration keeps the resume on file.
    expect((await post('student', `/v1/placements/students/${ids.c}/drives/${d.id}/registration`).expect(409)).body.reasons).toEqual(['twelfth_below', 'gap_exceeded']);
    const reg = (await post('officer', `/v1/placements/drives/${d.id}/registrations`, { studentId: ids.a, reason: 'Registered at the desk' }).expect(201)).body;
    expect((await db.select().from(s.driveRegistrations).where(eq(s.driveRegistrations.id, reg.id)))[0].resumeDocumentId).not.toBeNull();
  });

  it('imports a round from a spreadsheet: checks every line, refuses errors unless skipped, and tells each student', async () => {
    // 9 LPA: above the dream line (6), below super dream (10).
    const d = await newDrive('Brightwave analyst drive', { ctcLpa: 9, maxBacklogs: 1 });
    expect(d.category).toBe('dream');
    ids.d3 = d.id;
    await action('placement-drives', 'open', d.id).expect(200);
    for (const sid of [ids.a, ids.c]) await post('officer', `/v1/placements/drives/${d.id}/registrations`, { studentId: sid, reason: 'Desk' }).expect(201);
    const round = (await post('officer', `/v1/placements/drives/${d.id}/rounds`, { name: 'Aptitude test', kind: 'aptitude' }).expect(201)).body;
    const csv = 'Roll No,Result,Remarks\r\nR1,Cleared,Good\r\nR3,pass,\r\nR9,pass,\r\nR3,fail,\r\nR2,maybe,\r\n';
    const url = `/v1/placements/drives/${d.id}/rounds/${round.id}/import`;
    const check = (await post('officer', url, { csv }).expect(200)).body;
    expect(check.committed).toBe(false);
    expect(check.summary).toEqual({ lines: 5, ok: 2, errors: 3, pass: 2, fail: 0, absent: 0 });
    expect(check.lines.map((l: { error: string | null }) => l.error)).toEqual([null, null, 'Not registered for this drive', 'This roll number is listed twice', 'Unknown result "maybe": use pass, fail or absent']);
    expect((await post('officer', url, { csv, commit: true }).expect(409)).body.code).toBe('IMPORT_HAS_ERRORS');
    expect((await db.select().from(s.roundResults).where(eq(s.roundResults.roundId, round.id))).length).toBe(0); // nothing saved
    const done = (await post('officer', url, { csv, commit: true, skipErrors: true }).expect(200)).body;
    expect(done).toMatchObject({ committed: true, recorded: 2, debarred: 0 });
    const regs = (await get('officer', `/v1/placements/drives/${d.id}/registrations`).expect(200)).body;
    expect(regs.map((r: { status: string }) => r.status)).toEqual(['shortlisted', 'shortlisted']);
    expect((await notices(`round:${round.id}:pass`)).length).toBe(2); // A's father and C
    // A shortlist with no result column passes everyone listed; a teacher cannot import.
    await post('teacher', url, { csv: 'Roll no\nR1\n' }).expect(403);
    expect((await post('officer', url, { csv: 'Roll no\nR1\n' }).expect(200)).body.summary).toMatchObject({ ok: 1, pass: 1 });
    await post('officer', url, { csv: 'Name\nA\n' }).expect(400);

    // Offers: C (9 LPA) accepts in the app; A gets 6 LPA on another dream drive and accepts at the office.
    const offC = (await post('officer', `/v1/placements/drives/${d.id}/offers`, { registrationId: regs.find((r: { studentId: string }) => r.studentId === ids.c).id }).expect(201)).body;
    await post('student', `/v1/placements/offers/${offC.id}/respond`, { response: 'accepted' }).expect(200);
    const d1 = await newDrive('Brightwave trainee drive', { ctcLpa: 6 });
    expect(d1.category).toBe('dream');
    await action('placement-drives', 'open', d1.id).expect(200);
    const regA = (await post('officer', `/v1/placements/drives/${d1.id}/registrations`, { studentId: ids.a, reason: 'Desk' }).expect(201)).body;
    const r1 = (await post('officer', `/v1/placements/drives/${d1.id}/rounds`, { name: 'HR', kind: 'hr' }).expect(201)).body;
    await put('officer', `/v1/placements/drives/${d1.id}/rounds/${r1.id}/results`, { results: [{ registrationId: regA.id, result: 'pass' }] }).expect(200);
    const offA = (await post('officer', `/v1/placements/drives/${d1.id}/offers`, { registrationId: regA.id }).expect(201)).body;
    await post('officer', `/v1/placements/offers/${offA.id}/record-response`, { response: 'accepted' }).expect(200);
    // B goes for an MBA after qualifying GATE.
    await post('officer', '/v1/records/progressions', { studentId: ids.b, kind: 'higher_studies', year: 2028, institution: 'IIM Bangalore', program: 'MBA' }).expect(201);
    await post('officer', '/v1/records/progressions', { studentId: ids.b, kind: 'competitive_exam', year: 2028, exam: 'GATE', examRef: 'GATE-2028-1' }).expect(201);
  });

  it('reports NIRF, NAAC 5.2, AISHE and the branch with hand-worked figures, and prints the brochure', async () => {
    const rep = async (id: string) => (await get('officer', `/v1/placements/reports/${id}?year=2028`).expect(200)).body.rows;
    // Branch: 3 graduating, 2 placed (A 6, C 9 LPA) = 66.7%; median and average (6 + 9) / 2 = 7.5; highest 9.
    expect((await rep('branch'))[0]).toMatchObject({ program: 'BCom', students: 3, placed: 2, placementPct: 66.7, higherStudies: 1, medianCtc: 7.5, averageCtc: 7.5, highestCtc: 9 });
    // NIRF: one batch with students in the three years; C has a pending backlog, so 2 graduate in the minimum time.
    expect(await rep('nirf')).toEqual([{ program: 'BCom', academicYear: '2027-28', intake: 3, lateral: 0, graduating: 2, placed: 2, medianSalary: 750000, higherStudies: 1, entrepreneurs: 0 }]);
    // NAAC: 2028 is 2/3 = 66.67% placed, 1/3 = 33.33% to higher education and 33.33% qualified; the four years before
    // have no batch (0%), so the five-year averages are 66.67 / 5 = 13.33 and 33.33 / 5 = 6.67.
    const naac = await rep('naac52');
    expect(naac).toHaveLength(6);
    expect(naac[4]).toMatchObject({ year: '2027-28', outgoing: 3, placed: 2, placedPct: 66.67, higherStudies: 1, higherStudiesPct: 33.33, qualified: 1, qualifiedPct: 33.33 });
    expect(naac[0]).toMatchObject({ year: '2023-24', outgoing: 0, placedPct: 0 });
    expect(naac[5]).toMatchObject({ year: 'Average of the years', placedPct: 13.33, higherStudiesPct: 6.67, qualifiedPct: 6.67 });
    // AISHE: two of the three are women, both placed; the man went to higher studies.
    expect(await rep('aishe')).toEqual([{ program: 'BCom', passedOut: 3, passedOutFemale: 2, placed: 2, placedFemale: 2, higherStudies: 1, higherStudiesFemale: 0, medianSalary: 750000 }]);
    const xl = await get('officer', '/v1/placements/reports/naac52?year=2028&format=csv').expect(200);
    expect(xl.text.split('\r\n')[0]).toContain('Placed (5.2.1)');
    const pdf = await get('officer', '/v1/placements/brochure?year=2026').buffer(true).parse((res, cb) => {
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => cb(null, Buffer.concat(parts)));
    }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher', '/v1/placements/brochure').expect(403);
    await get('teacher', '/v1/placements/reports/naac52').expect(403);
  });

  it('enforces the dream ladder: a dream-placed student may sit only for super dream', async () => {
    const d = await newDrive('Another dream drive', { ctcLpa: 7 });
    await action('placement-drives', 'open', d.id).expect(200);
    expect((await post('officer', `/v1/placements/drives/${d.id}/registrations`, { studentId: ids.a, reason: 'Desk' }).expect(409)).body.reasons).toEqual(['already_placed']);
    // The super-dream drive is still open to A.
    const el = (await get('officer', `/v1/placements/drives/${ids.d2}/eligible`).expect(200)).body.students.find((x: { studentId: string }) => x.studentId === ids.a);
    expect(el.eligible).toBe(true);
  });

  it('keeps the recruiter relationship: stage, interactions with follow-ups due, and the log on the company', async () => {
    const co = (await post('officer', '/v1/records/placement-companies', { name: 'Kaveri Financial Services', sector: 'Banking', ownerUserId: null }).expect(201)).body;
    expect(co.crmStage).toBe('prospect');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    await post('officer', '/v1/records/placement-interactions', { companyId: co.id, kind: 'call', happenedOn: today, summary: 'Asked for the 2027 hiring plan', followUpOn: '2000-01-01' }).expect(400); // follow-up before the call
    const i = (await post('officer', '/v1/records/placement-interactions', { companyId: co.id, kind: 'call', happenedOn: today, summary: 'Asked for the 2027 hiring plan', nextAction: 'Send the brochure', followUpOn: today }).expect(201)).body;
    expect((await get('officer', `/v1/records/placement-companies/${co.id}`).expect(200)).body).toMatchObject({ crmStage: 'contacted', lastContact: today, followUp: today });
    expect((await get('officer', '/v1/records/placement-companies?f.followUp=due').expect(200)).body.rows.map((r: { id: string }) => r.id)).toEqual([co.id]);
    expect((await action('placement-interactions', 'followedUp', i.id).expect(200)).body.succeeded).toBe(1);
    expect((await get('officer', '/v1/records/placement-companies?f.followUp=due').expect(200)).body.total).toBe(0);
    expect((await get('officer', `/v1/records/placement-interactions?f.company=${co.id}`).expect(200)).body.rows[0]).toMatchObject({ kind: 'call', followUpDone: true, recordedBy: 'Placement Officer' });
    // The recruiter portal key's hash is never sent, even to the cell.
    const list = (await get('officer', '/v1/placements/companies').expect(200)).body;
    expect(list.every((c: Record<string, unknown>) => !('portalTokenHash' in c) && 'hasPortalKey' in c)).toBe(true);
    await get('teacher', '/v1/records/placement-interactions').expect(403);
    expect((await get('outsider', '/v1/records/placement-interactions').expect(200)).body.total).toBe(0);
  });

  it('tracks a NATS apprenticeship: the statutory minimum, the Government share, the contract and the monthly stipend', async () => {
    const base = { studentId: ids.b, establishment: 'Hoysala Logistics', category: 'graduate', role: 'Graduate apprentice', startsOn: '2026-07-01', endsOn: '2027-06-30' };
    // ₹10,000 is under the ₹12,300 minimum for a graduate apprentice.
    expect((await post('officer', '/v1/records/apprenticeships', { ...base, stipendPaise: 10000 }).expect(400)).body.fieldErrors.stipendPaise[0]).toContain('12,300');
    const a = (await post('officer', '/v1/records/apprenticeships', { ...base, stipendPaise: 15000, natsEnrolmentNo: 'N1234567890' }).expect(201)).body;
    // Half of the ₹12,300 minimum: ₹6,150 a month (not half of the ₹15,000 paid).
    expect(a).toMatchObject({ stipendPaise: 1_500_000, stipendRupees: 15000, govtSharePaise: 615_000, status: 'enrolled' });
    await put('officer', `/v1/placements/apprenticeships/${a.id}/stipends`, { month: '2026-08', employerPaidPaise: 1_500_000 }).expect(409); // no contract yet
    expect((await action('apprenticeships', 'registerContract', a.id, { contractNo: 'KA-2026-0042' }).expect(200)).body.succeeded).toBe(1);
    await put('officer', `/v1/placements/apprenticeships/${a.id}/stipends`, { month: '2026-08', employerPaidPaise: 1_500_000, dbtReference: 'DBT-88' }).expect(200);
    // Again for the same month replaces it (idempotent).
    await put('officer', `/v1/placements/apprenticeships/${a.id}/stipends`, { month: '2026-08', employerPaidPaise: 1_500_000, dbtPaise: 615_000, dbtReference: 'DBT-88' }).expect(200);
    await put('officer', `/v1/placements/apprenticeships/${a.id}/stipends`, { month: '2026-06', employerPaidPaise: 1 }).expect(400); // before it began
    const st = (await get('officer', `/v1/placements/apprenticeships/${a.id}/stipends`).expect(200)).body;
    expect(st.months[0]).toMatchObject({ month: '2026-07', employerPaidPaise: null });
    expect(st.months[1]).toMatchObject({ month: '2026-08', employerPaidPaise: 1_500_000, dbtPaise: 615_000 });
    expect(st.totals).toMatchObject({ employerPaidPaise: 1_500_000, dbtPaise: 615_000 });
    // A diploma apprentice paid ₹11,000: half the ₹10,900 minimum is ₹5,450.
    const dip = (await post('officer', '/v1/records/apprenticeships', { ...base, studentId: ids.a, category: 'diploma', stipendPaise: 11000 }).expect(201)).body;
    expect(dip.govtSharePaise).toBe(545_000);
    expect((await action('apprenticeships', 'complete', dip.id, { certificateNo: 'COP-1' }).expect(200)).body.failed).toBe(1); // not started
    await get('teacher', '/v1/records/apprenticeships').expect(403);
    expect((await get('outsider', '/v1/records/apprenticeships').expect(200)).body.total).toBe(0);
    await get('outsider', `/v1/placements/apprenticeships/${a.id}/stipends`).expect(404);
  });

  it('works out AICTE internship credits from hours and shows each student what is short', async () => {
    const i = (await post('officer', '/v1/records/internships', { studentId: ids.a, orgName: 'Brightwave Technologies', title: 'Data intern', startsOn: '2026-05-01', endsOn: '2026-06-15', hours: 100 }).expect(201)).body;
    expect(i.credits).toBe(2); // 100 hours / 45 = 2 whole credits
    await patch('officer', `/v1/records/internships/${i.id}`, { hours: 140 }).expect(200);
    expect((await get('officer', `/v1/records/internships/${i.id}`).expect(200)).body.credits).toBe(3); // 140 / 45 = 3.1
    await db.update(s.internships).set({ status: 'completed' }).where(eq(s.internships.id, i.id));
    const rows = (await get('officer', '/v1/placements/reports/credits?year=2028').expect(200)).body.rows;
    expect(rows.find((r: { rollNo: string }) => r.rollNo === 'R1')).toMatchObject({ internships: 1, hours: 140, credits: 3, required: 14, short: 11 });
    expect(rows.find((r: { rollNo: string }) => r.rollNo === 'R2')).toMatchObject({ credits: 0, short: 14 });
  });

  it('lets a student ask an alumnus for a referral; the alumnus answers and the student is told', async () => {
    const r = (await post('student', '/v1/placements/referrals', { alumniId: ids.alumni, company: 'Infosys', role: 'Systems engineer', message: 'Could you refer me for the systems engineer opening?' }).expect(201)).body;
    await post('student', '/v1/placements/referrals', { alumniId: ids.alumni, company: 'infosys', message: 'Asking once more for the same role' }).expect(409);
    expect((await notices(`referral:${r.id}`)).length).toBe(1); // the alumnus
    expect((await get('alumni', '/v1/alumni-portal/referrals').expect(200)).body[0]).toMatchObject({ student: 'Student C', company: 'Infosys', status: 'requested' });
    await post('alumni', `/v1/alumni-portal/referrals/${r.id}/status`, { status: 'referred', note: 'Sent to the hiring manager' }).expect(200);
    expect((await notices(`referral:${r.id}:referred`)).length).toBe(1);
    await post('officer', `/v1/alumni-portal/referrals/${r.id}/status`, { status: 'hired' }).expect(403);
    expect((await get('officer', '/v1/records/placement-referrals?f.status=referred').expect(200)).body.rows[0]).toMatchObject({ fullName: 'Student C', alumniName: 'Ravi Alumnus' });
  });

  it('gives the student a dashboard of everything placement, and a resume drafted from their record', async () => {
    const d = (await get('student', `/v1/placements/students/${ids.c}/dashboard`).expect(200)).body;
    expect(d.standing).toMatchObject({ cgpa: 7, backlogs: 1, backlogHistory: 1, tenthPct: 70, twelfthPct: 72, gapYears: 2, batchYear: 2028, docsVerified: true, placedCategory: 'dream', documents: [{ kind: 'resume', status: 'verified' }] });
    const reg = d.registrations.find((r: { driveId: string }) => r.driveId === ids.d3);
    expect(reg).toMatchObject({ status: 'selected', company: 'Brightwave Technologies' });
    expect(reg.rounds).toEqual([expect.objectContaining({ name: 'Aptitude test', kind: 'aptitude', result: 'pass' })]);
    expect(d.offers[0]).toMatchObject({ ctcLpa: 9, status: 'accepted', category: 'dream' });
    expect(d.referrals[0]).toMatchObject({ company: 'Infosys', status: 'referred' });
    expect(d.internships.credits).toMatchObject({ earned: 0, required: 14, short: 14, met: false });
    // The family sees it; another student's family, a teacher and another college do not.
    await get('outsider', `/v1/placements/students/${ids.c}/dashboard`).expect(404);
    await get('student', `/v1/placements/students/${ids.a}/dashboard`).expect(404);
    expect((await get('principal', `/v1/placements/students/${ids.a}/dashboard`).expect(200)).body.offers[0]).toMatchObject({ ctcLpa: 6 });

    const draft = (await get('student', '/v1/careers/resume/draft').expect(200)).body;
    expect(draft.headline).toBe('BCom student, class of 2028');
    expect(draft.education[0]).toMatchObject({ degree: 'BCom', score: 'CGPA 7.00' });
    expect(draft.education[1]).toMatchObject({ degree: 'Class 12 / PUC (PUE Karnataka)', years: '2022', score: '72%' });
    await get('officer', '/v1/careers/resume/draft').expect(403);
  });
});
