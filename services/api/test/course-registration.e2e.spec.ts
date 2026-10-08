import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('course registration (CBCS)', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = new Date('2026-10-20T04:30:00Z');
  const clock = new FixedClock(start);
  const day = (n: number) => new Date(start.getTime() + n * 86_400_000).toISOString();
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
  const events = async (type: string) => (await owner.query('select count(*)::int as n from domain_events where tenant_id = $1 and type = $2', [t.tenantId, type])).rows[0].n as number;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@cr.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }
  async function subject(code: string, departmentId?: string) {
    const [x] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: t.program.id, term: 3, code, name: code, departmentId }).returning();
    return x;
  }
  const offer = (termId: string, subjectId: string, over: object = {}, who = 'hod') => post(who, '/v1/course-registration/offerings', { termId, subjectId, category: 'elective', credits: 3, seatCap: 5, ...over });
  const mine = async (who: string, termId: string) => (await get(who, `/v1/course-registration/me/registrations?termId=${termId}`).expect(200)).body;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hod = await addUser('Hari Hod', 'hod');
    const hod2 = await addUser('Hema Hod', 'hod');
    const s0 = await addUser('Sita Zero', 'student');
    const s1 = await addUser('Sam One', 'student');
    await db.update(s.students).set({ userId: s0.id }).where((await import('drizzle-orm')).eq(s.students.id, t.students[0].id));
    await db.update(s.students).set({ userId: s1.id }).where((await import('drizzle-orm')).eq(s.students.id, t.students[1].id));
    app = await createApp(clock);
    tokens = {
      hod: await login(t.slug, hod.email!),
      hod2: await login(t.slug, hod2.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      s0: await login(t.slug, s0.email!),
      s1: await login(t.slug, s1.email!),
      s2: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    const [dep] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod2.id }).returning();
    const mk = async (name: string, from: string, to: string) => (await db.insert(s.academicTerms).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, name, startsOn: from, endsOn: to }).returning())[0];
    ids.t1 = (await mk('Odd 2026', '2026-08-01', '2026-12-31')).id;
    ids.t2 = (await mk('Even 2027', '2027-01-01', '2027-05-31')).id;
    const slot = async (day: number, a: string, b: string) => (await db.insert(s.timetableSlots).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, dayOfWeek: day, startsAt: a, endsAt: b }).returning())[0].id;
    ids.slotA = await slot(2, '10:00', '10:55');
    ids.slotB = await slot(2, '10:30', '11:30');
    for (const c of ['CORE', 'E1', 'E2', 'E3', 'E4', 'E5', 'PRE', 'ADV', 'O1', 'O2']) ids[c] = (await subject(c, c === 'E1' ? dep.id : undefined)).id;
    // Marks: CGPA 9 / 6 / 8 for the three students, one session.
    const [session] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, programId: t.program.id, term: 2, name: 'Sem 2', startsOn: '2026-05-01', endsOn: '2026-05-10', status: 'published', createdBy: t.principal.id }).returning();
    const res = await db.insert(s.examResults).values([t.students[0], t.students[1], t.students[2]].map((st, i) => ({ tenantId: t.tenantId, sessionId: session.id, studentId: st.id, sgpa: [9, 6, 8][i], cgpa: [9, 6, 8][i], creditsAttempted: 20, creditsEarned: 20, creditPoints: 100, outcome: 'pass' })).map((x) => x)).returning();
    ids.res2 = res.find((r) => r.studentId === t.students[2].id)!.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('setup', () => {
    it('lets heads of department set up offerings, but not students, and rejects bad input', async () => {
      await post('s2', '/v1/course-registration/offerings', {}).expect(403);
      const core = (await offer(ids.t1, ids.CORE, { category: 'core', credits: 4, seatCap: 100 }).expect(201)).body;
      ids.oCORE = core.id;
      await offer(ids.t1, ids.CORE, { category: 'core' }).expect(409);
      await offer(ids.t1, ids.E3, { slotIds: [crypto.randomUUID()] }).expect(409);
      await offer(ids.t1, ids.E2, { credits: -1 }).expect(400);
      await offer(ids.t1, ids.E1, { seatCap: 1 }).expect(403); // Commerce is headed by Hema, not Hari
      ids.oE1 = (await offer(ids.t1, ids.E1, { seatCap: 1, slotIds: [ids.slotA], facultyId: t.teacher.id }, 'principal').expect(201)).body.id;
      ids.oE2 = (await offer(ids.t1, ids.E2, { slotIds: [ids.slotB] }).expect(201)).body.id;
      ids.oE3 = (await offer(ids.t1, ids.E3).expect(201)).body.id;
      ids.oE4 = (await offer(ids.t1, ids.E4, { eligibleSemesters: [5] }).expect(201)).body.id;
      ids.oE5 = (await offer(ids.t1, ids.E5).expect(201)).body.id;
      ids.oADV = (await offer(ids.t1, ids.ADV, { prerequisiteSubjectId: ids.PRE }).expect(201)).body.id;
      await offer(ids.t1, ids.PRE, { prerequisiteSubjectId: ids.PRE }).expect(409);
      expect((await get('hod', `/v1/course-registration/offerings?termId=${ids.t1}`).expect(200)).body).toHaveLength(7);
      await get('s2', `/v1/course-registration/offerings?termId=${ids.t1}`).expect(403);
      expect((await get('outsider', `/v1/course-registration/offerings?termId=${ids.t1}`).expect(200)).body).toHaveLength(0);
    });

    it('lets only the principal set the registration window, and validates it', async () => {
      const w = { termId: ids.t1, opensAt: day(-1), closesAt: day(7), addDropUntil: day(14), minCredits: 8, maxCredits: 10, allocationRule: 'cgpa' };
      await put('hod', '/v1/course-registration/windows', w).expect(403);
      await put('principal', '/v1/course-registration/windows', { ...w, closesAt: day(-2) }).expect(400);
      await put('principal', '/v1/course-registration/windows', { ...w, minCredits: 12 }).expect(400);
      const a = (await put('principal', '/v1/course-registration/windows', w).expect(200)).body;
      const b = (await put('principal', '/v1/course-registration/windows', { ...w, maxCredits: 10 }).expect(200)).body;
      expect(b.id).toBe(a.id);
      await put('principal', '/v1/course-registration/windows', { ...w, termId: ids.t2, minCredits: 0, maxCredits: 10 }).expect(200);
    });
  });

  describe('student registration rules', () => {
    it('shows what each course allows, and adds mandatory core on the first registration', async () => {
      const list = (await get('s2', `/v1/course-registration/me/offerings?termId=${ids.t1}`).expect(200)).body.offerings as { subjectCode: string; eligible: boolean; blockedBy: string | null; seatsLeft: number }[];
      const by = (c: string) => list.find((o) => o.subjectCode === c)!;
      expect(by('E4')).toMatchObject({ eligible: false, blockedBy: 'not_eligible' });
      expect(by('ADV')).toMatchObject({ eligible: false, blockedBy: 'prerequisite' });
      expect(by('E1')).toMatchObject({ eligible: true, blockedBy: null, seatsLeft: 1 });
      const e3 = (await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oE3 }).expect(200)).body;
      expect(e3).toMatchObject({ status: 'registered', approval: 'pending' });
      const m = await mine('s2', ids.t1);
      expect(m.registrations.map((r: { subjectCode: string }) => r.subjectCode).sort()).toEqual(['CORE', 'E3']);
      expect(m.registrations.find((r: { subjectCode: string }) => r.subjectCode === 'CORE')).toMatchObject({ autoCore: true, approval: 'approved' });
      expect(m).toMatchObject({ registeredCredits: 7, minCredits: 8, maxCredits: 10 });
      await post('s2', '/v1/course-registration/me/drop', { offeringId: ids.oCORE }).expect(409);
    });

    it('refuses a prerequisite not cleared, a timetable clash, and an ineligible course', async () => {
      const r1 = await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oADV }).expect(409);
      expect(r1.body.code).toBe('prerequisite');
      await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oE4 }).expect(409);
      await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oE1 }).expect(200);
      const clash = await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oE2 }).expect(409);
      expect(clash.body.code).toBe('clash');
    });

    it('enforces the credit limit and allows the prerequisite once it is passed', async () => {
      // CORE 4 + E3 3 + E1 3 = 10 (the maximum), so one more is refused.
      const over = await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oE5 }).expect(409);
      expect(over.body.code).toBe('credit_limit');
      await db.insert(s.examResultLines).values({ tenantId: t.tenantId, resultId: ids.res2, subjectId: ids.PRE, credits: 3, percent: 70, grade: 'A', gradePoint: 8, passed: true });
      const still = await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oADV }).expect(409);
      expect(still.body.code).toBe('credit_limit');
      await post('s2', '/v1/course-registration/me/drop', { offeringId: ids.oE3 }).expect(200);
      await post('s2', '/v1/course-registration/me/register', { offeringId: ids.oADV }).expect(200);
      expect((await mine('s2', ids.t1)).registeredCredits).toBe(10);
    });

    it('enforces the seat cap', async () => {
      const full = await post('s0', '/v1/course-registration/me/register', { offeringId: ids.oE1 }).expect(409);
      expect(full.body.code).toBe('seats_full');
      const list = (await get('s0', `/v1/course-registration/me/offerings?termId=${ids.t1}`).expect(200)).body.offerings as { subjectCode: string; seatsLeft: number; blockedBy: string }[];
      expect(list.find((o) => o.subjectCode === 'E1')).toMatchObject({ seatsLeft: 0, blockedBy: 'seats_full' });
      await put('hod', '/v1/course-registration/windows', {}).expect(403);
      await request(app.getHttpServer()).patch(`/v1/course-registration/offerings/${ids.oE1}`).set(auth('principal')).send({ seatCap: 0 }).expect(409);
    });

    it('lists the roster for staff and for the faculty of the course only', async () => {
      const r = (await get('hod', `/v1/course-registration/offerings/${ids.oE1}/roster`).expect(200)).body;
      expect(r.students.map((x: { rollNo: string }) => x.rollNo)).toEqual(['R3']);
      await get('teacher', `/v1/course-registration/offerings/${ids.oE1}/roster`).expect(200);
      await get('teacher2', `/v1/course-registration/offerings/${ids.oE1}/roster`).expect(403);
    });
  });

  describe('approval', () => {
    it('queues registrations for the head of department, who approves only their own department, and emits the event', async () => {
      const q = (await get('principal', `/v1/course-registration/approvals?termId=${ids.t1}`).expect(200)).body as { id: string; subjectCode: string }[];
      expect(q.map((x) => x.subjectCode).sort()).toEqual(['ADV', 'E1']);
      const e1 = q.find((x) => x.subjectCode === 'E1')!.id;
      const adv = q.find((x) => x.subjectCode === 'ADV')!.id;
      await post('s2', '/v1/course-registration/approvals/decide', { registrationIds: [e1], decision: 'approved' }).expect(403);
      // E1 belongs to Commerce, headed by Hema; Hari cannot decide it.
      await post('hod', '/v1/course-registration/approvals/decide', { registrationIds: [e1], decision: 'approved' }).expect(403);
      const before = await events('course_registration.approved');
      await post('hod2', '/v1/course-registration/approvals/decide', { registrationIds: [e1, adv], decision: 'approved', note: 'ok' }).expect(200);
      expect(await events('course_registration.approved')).toBe(before + 2);
      await post('hod2', '/v1/course-registration/approvals/decide', { registrationIds: [e1], decision: 'approved' }).expect(409);
      expect((await mine('s2', ids.t1)).approvedCredits).toBe(10);
    });

    it('will not approve a student below the term minimum credits', async () => {
      await post('s1', '/v1/course-registration/me/register', { offeringId: ids.oE3 }).expect(200);
      const q = (await get('principal', `/v1/course-registration/approvals?termId=${ids.t1}`).expect(200)).body as { id: string; studentName: string }[];
      expect(q).toHaveLength(1);
      const low = await post('principal', '/v1/course-registration/approvals/decide', { registrationIds: [q[0].id], decision: 'approved' }).expect(409);
      expect(low.body.code).toBe('below_min_credits');
      await post('principal', '/v1/course-registration/approvals/decide', { registrationIds: [q[0].id], decision: 'rejected', note: 'Pick another course' }).expect(200);
      expect((await mine('s1', ids.t1)).registrations.filter((r: { status: string }) => r.status === 'registered')).toHaveLength(1);
    });
  });

  describe('preference allocation and waitlist', () => {
    it('allocates an oversubscribed elective by CGPA, waitlists the next student, and promotes on a drop', async () => {
      ids.oO1 = (await post('hod', '/v1/course-registration/offerings', { termId: ids.t2, subjectId: ids.O1, category: 'open_elective', credits: 3, seatCap: 1 }).expect(201)).body.id;
      ids.oO2 = (await post('hod', '/v1/course-registration/offerings', { termId: ids.t2, subjectId: ids.O2, category: 'open_elective', credits: 3, seatCap: 5 }).expect(201)).body.id;
      await put('s0', '/v1/course-registration/me/preferences', { termId: ids.t2, offeringIds: [ids.oO1, ids.oO2] }).expect(200);
      await put('s1', '/v1/course-registration/me/preferences', { termId: ids.t2, offeringIds: [ids.oO1, ids.oO2] }).expect(200);
      await put('s2', '/v1/course-registration/me/preferences', { termId: ids.t2, offeringIds: [ids.oO1, ids.oO2, ids.oO1] }).expect(200);
      await put('s2', '/v1/course-registration/me/preferences', { termId: ids.t2, offeringIds: [ids.oO1, ids.oO2] }).expect(200);
      expect((await mine('s0', ids.t2)).registrations.map((r: { status: string }) => r.status)).toEqual(['preference', 'preference']);
      await post('hod', '/v1/course-registration/allocate', { termId: ids.t2 }).expect(200).expect((r) => expect(r.body).toMatchObject({ allocated: 3, waitlisted: 2, notAllotted: 1, students: 3 }));
      const status = async (who: string) => Object.fromEntries((await mine(who, ids.t2)).registrations.map((r: { subjectCode: string; status: string }) => [r.subjectCode, r.status]));
      expect(await status('s0')).toEqual({ O1: 'registered', O2: 'not_allotted' });
      expect(await status('s2')).toEqual({ O1: 'waitlisted', O2: 'registered' });
      expect(await status('s1')).toEqual({ O1: 'waitlisted', O2: 'registered' });
      const roster = (await get('hod', `/v1/course-registration/offerings/${ids.oO1}/roster`).expect(200)).body.students as { rollNo: string; status: string; waitlistPos: number | null }[];
      expect(roster.map((x) => [x.rollNo, x.status, x.waitlistPos])).toEqual([['R1', 'registered', null], ['R3', 'waitlisted', 1], ['R2', 'waitlisted', 2]]);
      // Running it again changes nothing.
      await post('hod', '/v1/course-registration/allocate', { termId: ids.t2 }).expect(200).expect((r) => expect(r.body.students).toBe(0));
      await post('s0', '/v1/course-registration/me/drop', { offeringId: ids.oO1 }).expect(200);
      expect((await status('s2')).O1).toBe('registered');
      expect((await status('s1')).O1).toBe('waitlisted');
    });

    it('refuses to rank core, ineligible or already held courses', async () => {
      await put('s0', '/v1/course-registration/me/preferences', { termId: ids.t1, offeringIds: [ids.oCORE] }).expect(409);
      await put('s0', '/v1/course-registration/me/preferences', { termId: ids.t1, offeringIds: [ids.oE4] }).expect(409);
      await put('s2', '/v1/course-registration/me/preferences', { termId: ids.t2, offeringIds: [ids.oO1] }).expect(409);
    });
  });

  describe('windows and the add/drop deadline', () => {
    it('stops registration after the window closes and drops after the add/drop deadline', async () => {
      clock.at = new Date(start.getTime() + 10 * 86_400_000); // after close (day 7), before add/drop (day 14)
      await put('s0', '/v1/course-registration/me/preferences', { termId: ids.t1, offeringIds: [ids.oE3] }).expect(409);
      await post('s0', '/v1/course-registration/me/register', { offeringId: ids.oE3 }).expect(200); // late add allowed until the deadline
      await post('s0', '/v1/course-registration/me/drop', { offeringId: ids.oE3 }).expect(200);
      clock.at = new Date(start.getTime() + 15 * 86_400_000);
      await post('s0', '/v1/course-registration/me/register', { offeringId: ids.oE3 }).expect(409);
      await post('s2', '/v1/course-registration/me/drop', { offeringId: ids.oADV }).expect(409);
      clock.at = start;
    });
  });
});
