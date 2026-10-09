import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('placements, internships and alumni', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z')); // 10:00 IST
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
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@pl.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  /** A published exam result: the student's CGPA and whether each subject was passed. */
  async function result(studentId: string, session: string, cgpa: number, passed: boolean) {
    const [r] = await db.insert(s.examResults).values({ tenantId: t.tenantId, sessionId: session, studentId, sgpa: cgpa, cgpa, creditsAttempted: 4, creditsEarned: passed ? 4 : 0, creditPoints: 30, outcome: passed ? 'pass' : 'fail' }).returning();
    await db.insert(s.examResultLines).values({ tenantId: t.tenantId, resultId: r.id, subjectId: t.subject.id, credits: 4, percent: passed ? 70 : 20, grade: passed ? 'A' : 'F', gradePoint: passed ? 8 : 0, passed });
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const officer = await addUser('Pooja Placement', 'placement_officer');
    app = await createApp(clock);
    tokens = {
      officer: await login(t.slug, officer.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    ids.me = t.students[2].id;
    ids.a = t.students[0].id;
    const [session] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: (await db.select().from(s.academicYears))[0].id, programId: t.program.id, term: 3, name: 'Sem 3', startsOn: '2026-09-01', endsOn: '2026-09-20', status: 'published', createdBy: t.principal.id }).returning();
    await result(t.students[2].id, session.id, 7.5, true);
    await result(t.students[0].id, session.id, 5.2, false);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('companies and drives', () => {
    it('is closed to teachers, and a company name is unique', async () => {
      await post('teacher', '/v1/placements/companies', { name: 'Acme' }).expect(403);
      await get('teacher', '/v1/placements/drives').expect(403);
      ids.company = (await post('officer', '/v1/placements/companies', { name: 'Acme Corp', sector: 'IT' }).expect(201)).body.id;
      await post('officer', '/v1/placements/companies', { name: 'ACME CORP' }).expect(409);
      await post('officer', '/v1/placements/companies', { name: '', sector: 'x' }).expect(400);
      const bad = (await post('officer', '/v1/placements/companies', { name: 'Blocked Ltd', status: 'blacklisted' }).expect(201)).body.id;
      await post('officer', '/v1/placements/drives', { companyId: bad, title: 'x', roleTitle: 'y' }).expect(409);
    });

    it('creates a drive as a draft that students cannot see until it opens, with version checks', async () => {
      const drive = { companyId: ids.company, title: 'Acme campus drive', roleTitle: 'Analyst', ctcLpa: 6, minCgpa: 6.5, maxBacklogs: 0, programIds: [t.program.id], registrationClosesOn: '2026-11-01' };
      const d = (await post('officer', '/v1/placements/drives', drive).expect(201)).body;
      ids.drive = d.id;
      expect(d).toMatchObject({ status: 'draft', version: 0, minCgpa: 6.5 });
      expect((await get('student', `/v1/placements/students/${ids.me}/overview`).expect(200)).body.drives).toHaveLength(0);
      await post('officer', '/v1/placements/drives/' + ids.drive + '/status', { status: 'completed' }).expect(409);
      await put('officer', `/v1/placements/drives/${ids.drive}`, { ...drive, title: 'Acme drive 2026', expectedVersion: 0 }).expect(200);
      await put('officer', `/v1/placements/drives/${ids.drive}`, { ...drive, expectedVersion: 0 }).expect(409);
      await post('officer', `/v1/placements/drives/${ids.drive}/status`, { status: 'open' }).expect(200);
      expect(await audited('placement.drive_open')).toBe(1);
    });
  });

  describe('eligibility from exam results, registration and rounds', () => {
    it('shows each student their eligibility; parents only look', async () => {
      const mine = (await get('student', `/v1/placements/students/${ids.me}/overview`).expect(200)).body;
      expect(mine.academics).toEqual({ cgpa: 7.5, backlogs: 0 });
      expect(mine.drives[0]).toMatchObject({ company: 'Acme Corp', eligibility: { eligible: true, reasons: [] }, registration: null });
      const kid = (await get('parent', `/v1/placements/students/${ids.a}/overview`).expect(200)).body;
      expect(kid.academics).toEqual({ cgpa: 5.2, backlogs: 1 });
      expect(kid.drives[0].eligibility).toEqual({ eligible: false, reasons: ['cgpa_below', 'backlogs_exceeded'] });
      await post('parent', `/v1/placements/students/${ids.a}/drives/${ids.drive}/registration`).expect(403);
      await get('parent2', `/v1/placements/students/${ids.a}/overview`).expect(404);
      await get('outsider', `/v1/placements/students/${ids.me}/overview`).expect(404);
    });

    it('registers the student once, only for themselves, and re-registers after a withdrawal', async () => {
      await post('student', `/v1/placements/students/${ids.a}/drives/${ids.drive}/registration`).expect(403);
      const reg = (await post('student', `/v1/placements/students/${ids.me}/drives/${ids.drive}/registration`).expect(200)).body;
      expect(reg).toMatchObject({ status: 'registered', cgpaAt: 7.5, backlogsAt: 0 });
      expect((await post('student', `/v1/placements/students/${ids.me}/drives/${ids.drive}/registration`).expect(200)).body.id).toBe(reg.id);
      ids.reg = reg.id;
      await post('student', `/v1/placements/students/${ids.me}/drives/${ids.drive}/withdraw`).expect(200);
      expect((await post('student', `/v1/placements/students/${ids.me}/drives/${ids.drive}/registration`).expect(200)).body.status).toBe('registered');
      expect((await get('officer', `/v1/placements/drives/${ids.drive}/registrations`).expect(200)).body).toHaveLength(1);
    });

    it('refuses an ineligible student with the reasons, and a closed deadline', async () => {
      const d2 = (await post('officer', '/v1/placements/drives', { companyId: ids.company, title: 'Strict', roleTitle: 'Lead', minCgpa: 9, programIds: [] }).expect(201)).body.id;
      await post('officer', `/v1/placements/drives/${d2}/status`, { status: 'open' }).expect(200);
      const r = await post('student', `/v1/placements/students/${ids.me}/drives/${d2}/registration`).expect(409);
      expect(r.body.reasons).toEqual(['cgpa_below']);
      await post('officer', `/v1/placements/drives/${d2}/status`, { status: 'closed' }).expect(200);
      expect((await post('student', `/v1/placements/students/${ids.me}/drives/${d2}/registration`).expect(409)).body.reasons).toContain('not_open');
    });

    it('runs rounds in order and rejects those who fail', async () => {
      const r1 = (await post('officer', `/v1/placements/drives/${ids.drive}/rounds`, { name: 'Aptitude', kind: 'aptitude' }).expect(201)).body;
      const r2 = (await post('officer', `/v1/placements/drives/${ids.drive}/rounds`, { name: 'HR interview', kind: 'hr' }).expect(201)).body;
      expect([r1.seq, r2.seq]).toEqual([1, 2]);
      const res = (rid: string, result: string) => put('officer', `/v1/placements/drives/${ids.drive}/rounds/${rid}/results`, { results: [{ registrationId: ids.reg, result }] });
      await res(r2.id, 'pass').expect(409); // has not cleared round 1
      await res(r1.id, 'pass').expect(200);
      await post('officer', `/v1/placements/drives/${ids.drive}/offers`, { registrationId: ids.reg }).expect(409); // final round not cleared
      await res(r2.id, 'pass').expect(200);
      await put('officer', `/v1/placements/drives/${ids.drive}/rounds/${r1.id}/results`, { results: [{ registrationId: '00000000-0000-4000-8000-000000000000', result: 'pass' }] }).expect(400);
      const regs = (await get('officer', `/v1/placements/drives/${ids.drive}/registrations`).expect(200)).body;
      expect(regs[0]).toMatchObject({ status: 'shortlisted', rounds: [{ result: 'pass' }, { result: 'pass' }] });
    });
  });

  describe('offers and statistics', () => {
    it('makes an offer once, lets only the student answer it, and allows a single accepted offer', async () => {
      const o = (await post('officer', `/v1/placements/drives/${ids.drive}/offers`, { registrationId: ids.reg, ctcLpa: 7.2, respondBy: '2026-10-30' }).expect(201)).body;
      ids.offer = o.id;
      expect(o).toMatchObject({ status: 'offered', ctcLpa: 7.2, roleTitle: 'Analyst' });
      await post('officer', `/v1/placements/drives/${ids.drive}/offers`, { registrationId: ids.reg }).expect(409);
      await post('officer', `/v1/placements/offers/${o.id}/respond`, { response: 'accepted' }).expect(403);
      await post('parent', `/v1/placements/offers/${o.id}/respond`, { response: 'accepted' }).expect(403);
      expect((await post('student', `/v1/placements/offers/${o.id}/respond`, { response: 'accepted' }).expect(200)).body.status).toBe('accepted');
      expect((await post('student', `/v1/placements/offers/${o.id}/respond`, { response: 'accepted' }).expect(200)).body.status).toBe('accepted');
      await post('student', `/v1/placements/offers/${o.id}/respond`, { response: 'declined' }).expect(409);
      await post('officer', `/v1/placements/offers/${o.id}/withdraw`).expect(409);
      expect((await get('student', `/v1/placements/students/${ids.me}/overview`).expect(200)).body.placed).toBe(true);
      const note = (await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and kind = 'placement'", [t.tenantId])).rows[0].n;
      expect(note).toBeGreaterThan(0);
    });

    it('stops a placed student registering for another placement drive', async () => {
      const d3 = (await post('officer', '/v1/placements/drives', { companyId: ids.company, title: 'Second', roleTitle: 'Dev' }).expect(201)).body.id;
      await post('officer', `/v1/placements/drives/${d3}/status`, { status: 'open' }).expect(200);
      expect((await post('student', `/v1/placements/students/${ids.me}/drives/${d3}/registration`).expect(409)).body.message).toMatch(/already accepted/);
    });

    it('reports statistics for the year', async () => {
      await get('teacher', '/v1/placements/stats').expect(403);
      const st = (await get('officer', '/v1/placements/stats').expect(200)).body;
      expect(st).toMatchObject({ year: 2026, activeStudents: 3, registeredStudents: 1, placedStudents: 1, placementPercent: 100, offers: { total: 1, accepted: 1, declined: 0, pending: 0 }, ctc: { average: 7.2, median: 7.2, highest: 7.2 } });
      expect(st.byCompany[0]).toMatchObject({ name: 'Acme Corp', placed: 1 });
      expect(st.byProgram[0]).toMatchObject({ name: 'BCom', placed: 1 });
      expect((await get('outsider', '/v1/placements/stats').expect(200)).body).toMatchObject({ placedStudents: 0, offers: { total: 0 } });
    });
  });

  describe('internships', () => {
    it('needs a mentor to approve, an evaluation to complete, and keeps the diary to the intern', async () => {
      const body = { studentId: ids.me, orgName: 'Acme Corp', title: 'Summer intern', startsOn: '2026-10-01', endsOn: '2026-12-01' };
      await post('teacher', '/v1/placements/internships', body).expect(403);
      await post('officer', '/v1/placements/internships', { ...body, endsOn: '2026-09-01' }).expect(409);
      const i = (await post('officer', '/v1/placements/internships', body).expect(201)).body;
      await post('officer', `/v1/placements/internships/${i.id}/status`, { status: 'approved' }).expect(409);
      await put('officer', `/v1/placements/internships/${i.id}/mentor`, { mentorUserId: t.studentUser.id }).expect(409);
      await put('officer', `/v1/placements/internships/${i.id}/mentor`, { mentorUserId: t.teacher.id }).expect(200);
      await post('officer', `/v1/placements/internships/${i.id}/status`, { status: 'ongoing' }).expect(409);
      await post('officer', `/v1/placements/internships/${i.id}/status`, { status: 'approved' }).expect(200);
      await post('student', `/v1/placements/internships/${i.id}/diary`, { entryDate: '2026-10-05', entry: 'Day one' }).expect(409); // not ongoing yet
      await post('officer', `/v1/placements/internships/${i.id}/status`, { status: 'ongoing' }).expect(200);
      await post('student', `/v1/placements/internships/${i.id}/diary`, { entryDate: '2026-10-05', entry: 'Day one' }).expect(200);
      await post('student', `/v1/placements/internships/${i.id}/diary`, { entryDate: '2026-10-05', entry: 'Day one, revised' }).expect(200);
      await post('student', `/v1/placements/internships/${i.id}/diary`, { entryDate: '2027-01-05', entry: 'Out of range' }).expect(409);
      await post('teacher2', `/v1/placements/internships/${i.id}/diary`, { entryDate: '2026-10-06', entry: 'x' }).expect(403);
      const diary = (await get('teacher', `/v1/placements/internships/${i.id}/diary`).expect(200)).body;
      expect(diary).toHaveLength(1);
      expect(diary[0].entry).toBe('Day one, revised');
      await get('teacher2', `/v1/placements/internships/${i.id}/diary`).expect(404);
      await post('officer', `/v1/placements/internships/${i.id}/status`, { status: 'completed' }).expect(409); // not evaluated
      await post('teacher2', `/v1/placements/internships/${i.id}/evaluation`, { score: 80 }).expect(404);
      await post('student', `/v1/placements/internships/${i.id}/evaluation`, { score: 80 }).expect(403);
      await post('teacher', `/v1/placements/internships/${i.id}/evaluation`, { score: 120 }).expect(400);
      await post('teacher', `/v1/placements/internships/${i.id}/evaluation`, { score: 86, remarks: 'Strong', employerFeedback: 'Would hire' }).expect(200);
      await post('officer', `/v1/placements/internships/${i.id}/status`, { status: 'completed' }).expect(200);
      expect((await get('teacher', '/v1/placements/internships').expect(200)).body).toHaveLength(1);
      expect((await get('teacher2', '/v1/placements/internships').expect(200)).body).toHaveLength(0);
      expect((await get('student', `/v1/placements/students/${ids.me}/overview`).expect(200)).body.internships[0]).toMatchObject({ status: 'completed', evaluationScore: 86 });
      expect(await audited('internship.evaluated')).toBe(1);
    });
  });

  describe('alumni', () => {
    it('shows students only consenting profiles, without contact details, and routes mentoring through the cell', async () => {
      const base = { fullName: 'Asha Rao', graduationYear: 2019, program: 'BCom', email: 'asha@mail.in', phone: '+919900000001', employer: 'Infosys', mentorAvailable: true };
      const shown = (await post('officer', '/v1/placements/alumni', { ...base, directoryVisible: true }).expect(201)).body;
      await post('officer', '/v1/placements/alumni', { ...base, fullName: 'Private Person', directoryVisible: false }).expect(201);
      await post('teacher', '/v1/placements/alumni', base).expect(403);
      // The two above, and the placed student whom accepting an offer in the drive tests made an alumnus (not in the directory until they consent).
      const all = (await get('officer', '/v1/placements/alumni').expect(200)).body;
      expect(all).toHaveLength(3);
      expect(all.filter((a: { directoryVisible: boolean }) => a.directoryVisible)).toHaveLength(1);
      const dir = (await get('student', '/v1/placements/alumni').expect(200)).body;
      expect(dir).toHaveLength(1);
      expect(dir[0]).toMatchObject({ fullName: 'Asha Rao', employer: 'Infosys' });
      expect(dir[0].email).toBeUndefined();
      expect(dir[0].phone).toBeUndefined();
      const m = (await post('student', '/v1/placements/mentoring-requests', { alumniId: shown.id, topic: 'Careers in audit' }).expect(201)).body;
      await post('student', '/v1/placements/mentoring-requests', { alumniId: shown.id, topic: 'Again' }).expect(409);
      await post('student', `/v1/placements/mentoring-requests/${m.id}/respond`, { status: 'accepted' }).expect(403);
      await post('officer', `/v1/placements/mentoring-requests/${m.id}/respond`, { status: 'completed' }).expect(409);
      await post('officer', `/v1/placements/mentoring-requests/${m.id}/respond`, { status: 'accepted' }).expect(200);
      expect((await get('student', '/v1/placements/mentoring-requests').expect(200)).body[0]).toMatchObject({ status: 'accepted', alumnus: 'Asha Rao' });
      const ev = (await post('officer', '/v1/placements/alumni-events', { title: 'Alumni meet 2026', startsOn: '2026-12-20', venue: 'Auditorium' }).expect(201)).body;
      await post('officer', `/v1/placements/alumni-events/${ev.id}/rsvps`, { alumniId: shown.id }).expect(200);
      await post('officer', `/v1/placements/alumni-events/${ev.id}/rsvps`, { alumniId: shown.id }).expect(200);
      expect((await get('student', '/v1/placements/alumni-events').expect(200)).body[0]).toMatchObject({ title: 'Alumni meet 2026', rsvps: 1 });
    });

    it('keeps institutions apart', async () => {
      expect((await get('outsider', '/v1/placements/alumni').expect(200)).body).toHaveLength(0);
      await get('outsider', `/v1/placements/drives/${ids.drive}`).expect(404);
      const row = (await owner.query('select count(*)::int as n from placement_drives where tenant_id = $1', [other.tenantId])).rows[0].n;
      expect(row).toBe(0);
    });
  });
});
