import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** The smallest JPEG the learning story can embed: a JFIF header, a 1x1 frame header and the end marker. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);

describe('school diary, parent-teacher meetings, early years and health records', () => {
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
  const notified = async (like: string, userId: string) => (await owner.query('select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and dedupe_key like $3', [t.tenantId, userId, like])).rows[0].n as number;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@sl.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const counsellor = await addUser('Chitra Counsellor', 'counsellor');
    const admin = await addUser('Adil Admin', 'tenant_admin');
    const [year] = await db.select().from(s.academicYears).where(eq(s.academicYears.tenantId, t.tenantId));
    const [term] = await db.insert(s.academicTerms).values({ tenantId: t.tenantId, academicYearId: year.id, name: 'Term 1', startsOn: '2026-08-01', endsOn: '2026-12-31' }).returning();
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      admin: await login(t.slug, admin.email!),
      counsellor: await login(t.slug, counsellor.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { section: t.section.id, other: t.otherSection.id, kid: t.students[0].id, kid2: t.students[1].id, teacher: t.teacher.id, parent: t.guardian.id, term: term.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('school diary', () => {
    it('lets a teacher of the class write an entry and tells the families', async () => {
      const e = (await post('teacher', '/v1/diary', { sectionId: ids.section, classwork: 'Chapter 4 exercises', homeworkNote: 'Finish page 31', notice: 'Picnic form due Friday' }).expect(201)).body;
      expect(e).toMatchObject({ entryDate: '2026-10-20', sectionId: ids.section });
      ids.entry = e.id;
      expect(await notified(`diary:${e.id}`, ids.parent)).toBe(1);
      expect(await audited('diary.entry_created')).toBe(1);
      await post('teacher', '/v1/diary', { sectionId: ids.section }).expect(400);
    });

    it('refuses a teacher of another class, parents and students', async () => {
      await post('teacher2', '/v1/diary', { sectionId: ids.section, notice: 'Hello' }).expect(403);
      await post('principal', '/v1/diary', { sectionId: ids.other, notice: 'School closes early' }).expect(201);
      await post('parent', '/v1/diary', { sectionId: ids.section, notice: 'Hello' }).expect(403);
      await post('student', '/v1/diary', { sectionId: ids.section, notice: 'Hello' }).expect(403);
      await get('teacher2', `/v1/diary?sectionId=${ids.section}`).expect(403);
    });

    it('serves the Teacher App create and list', async () => {
      await post('teacher', '/v1/teacher/diary', { sectionId: ids.section, subjectId: t.subject.id, classwork: 'Revision' }).expect(201);
      const mine = (await get('teacher', '/v1/teacher/diary').expect(200)).body;
      expect(mine).toHaveLength(2);
      await post('parent', '/v1/teacher/diary', { sectionId: ids.section, classwork: 'x' }).expect(403);
    });

    it('shows the Parent App the child diary and records one acknowledgement per child', async () => {
      const list = (await get('parent', `/v1/parent/children/${ids.kid}/diary`).expect(200)).body;
      expect(list).toHaveLength(2);
      expect(list.every((x: { acknowledgedAt: string | null }) => x.acknowledgedAt === null)).toBe(true);
      await get('parent2', `/v1/parent/children/${ids.kid}/diary`).expect(404);
      await post('parent2', `/v1/parent/children/${ids.kid}/diary/${ids.entry}/acknowledge`).expect(404);
      await post('parent', `/v1/parent/children/${ids.kid}/diary/${ids.entry}/acknowledge`).expect(201);
      await post('parent', `/v1/parent/children/${ids.kid}/diary/${ids.entry}/acknowledge`).expect(201);
      expect(await audited('diary.acknowledged')).toBe(1);
      const after = (await get('parent', `/v1/parent/children/${ids.kid}/diary?date=2026-10-20`).expect(200)).body;
      expect(after.filter((x: { acknowledgedAt: string | null }) => x.acknowledgedAt).length).toBe(1);
    });

    it('lets staff see who has acknowledged', async () => {
      const acks = (await get('teacher', `/v1/diary/${ids.entry}/acknowledgements`).expect(200)).body;
      expect(acks).toHaveLength(3);
      expect(acks.filter((a: { acknowledgedAt: string | null }) => a.acknowledgedAt)).toHaveLength(1);
      const list = (await get('teacher', `/v1/diary?sectionId=${ids.section}`).expect(200)).body;
      expect(list.find((x: { id: string }) => x.id === ids.entry)).toMatchObject({ acknowledged: 1, students: 3 });
      await get('outsider', `/v1/diary/${ids.entry}/acknowledgements`).expect(404);
    });
  });

  describe('parent-teacher meetings', () => {
    it('lets the office create a meeting and a teacher cut slots', async () => {
      await post('teacher', '/v1/ptm/events', { title: 'Term 1 PTM', eventDate: '2026-10-24' }).expect(403);
      const ev = (await post('admin', '/v1/ptm/events', { title: 'Term 1 PTM', eventDate: '2026-10-24', location: 'Hall' }).expect(201)).body;
      ids.event = ev.id;
      const made = (await post('teacher', `/v1/ptm/events/${ev.id}/slots`, { from: '10:00', to: '11:00', durationMinutes: 30 }).expect(201)).body;
      expect(made).toEqual({ created: 2, skipped: 0 });
      expect((await post('teacher', `/v1/ptm/events/${ev.id}/slots`, { from: '10:00', to: '11:00', durationMinutes: 30 }).expect(201)).body).toEqual({ created: 0, skipped: 2 });
      await post('teacher2', `/v1/ptm/events/${ev.id}/slots`, { teacherId: ids.teacher, from: '12:00', to: '13:00', durationMinutes: 30 }).expect(403);
      await post('teacher', `/v1/ptm/events/${ev.id}/slots`, { from: '11:00', to: '10:00', durationMinutes: 30 }).expect(409);
      await post('parent', `/v1/ptm/events/${ev.id}/slots`, { from: '10:00', to: '11:00', durationMinutes: 30 }).expect(403);
    });

    it('shows a guardian only the free slots of their child teachers', async () => {
      const slots = (await get('parent', `/v1/ptm/events/${ids.event}/slots?studentId=${ids.kid}`).expect(200)).body;
      expect(slots).toHaveLength(2);
      expect(slots[0].startsAt).toBe('2026-10-24T04:30:00.000Z');
      ids.slot1 = slots[0].id;
      ids.slot2 = slots[1].id;
      await get('parent2', `/v1/ptm/events/${ids.event}/slots?studentId=${ids.kid}`).expect(404);
      await get('parent', `/v1/ptm/events/${ids.event}/slots`).expect(409);
      await get('student', `/v1/ptm/events/${ids.event}/slots`).expect(403);
      expect((await get('teacher2', `/v1/ptm/events/${ids.event}/slots`).expect(200)).body).toHaveLength(0);
    });

    it('books one slot per child per teacher and never double-books a slot', async () => {
      await post('parent', `/v1/ptm/slots/${ids.slot1}/book`, { studentId: ids.kid }).expect(201);
      await post('parent', `/v1/ptm/slots/${ids.slot2}/book`, { studentId: ids.kid }).expect(409);
      await post('parent2', `/v1/ptm/slots/${ids.slot1}/book`, { studentId: ids.kid2 }).expect(409);
      await post('parent2', `/v1/ptm/slots/${ids.slot2}/book`, { studentId: ids.kid }).expect(404);
      await post('parent2', `/v1/ptm/slots/${ids.slot2}/book`, { studentId: ids.kid2 }).expect(201);
      expect(await notified('ptm:book:%', ids.teacher)).toBe(2);
      const mine = (await get('parent', '/v1/ptm/my-bookings').expect(200)).body;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ student: 'Student A', event: 'Term 1 PTM' });
      const view = (await get('parent', `/v1/ptm/events/${ids.event}/slots?studentId=${ids.kid}`).expect(200)).body;
      expect(view.find((x: { id: string }) => x.id === ids.slot2)).toBeUndefined();
      expect(view.find((x: { id: string }) => x.id === ids.slot1)).toMatchObject({ mine: true });
    });

    it('reschedules to another free slot and cancels', async () => {
      await post('teacher', `/v1/ptm/events/${ids.event}/slots`, { from: '11:00', to: '11:30', durationMinutes: 30 }).expect(201);
      const free = (await get('parent', `/v1/ptm/events/${ids.event}/slots?studentId=${ids.kid}`).expect(200)).body.find((x: { mine: boolean; student: string | null }) => !x.mine && !x.student);
      await post('parent', `/v1/ptm/slots/${ids.slot1}/reschedule`, { toSlotId: ids.slot2 }).expect(409);
      const moved = (await post('parent', `/v1/ptm/slots/${ids.slot1}/reschedule`, { toSlotId: free.id }).expect(200)).body;
      expect(moved).toMatchObject({ id: free.id, studentId: ids.kid });
      const slot1 = (await get('teacher', `/v1/ptm/events/${ids.event}/my-schedule`).expect(200)).body.find((x: { id: string }) => x.id === ids.slot1);
      expect(slot1.studentId).toBeNull();
      await post('parent2', `/v1/ptm/slots/${free.id}/cancel`).expect(404);
      await post('parent2', `/v1/ptm/slots/${ids.slot2}/cancel`).expect(200);
      await post('parent2', `/v1/ptm/slots/${ids.slot2}/cancel`).expect(409);
      ids.moved = free.id;
    });

    it('gives the teacher their schedule and sends each reminder once', async () => {
      const sched = (await get('teacher', `/v1/ptm/events/${ids.event}/my-schedule`).expect(200)).body;
      expect(sched.filter((x: { student: string | null }) => x.student)).toHaveLength(1);
      await get('parent', `/v1/ptm/events/${ids.event}/my-schedule`).expect(403);
      expect((await post('teacher', `/v1/ptm/events/${ids.event}/remind`).expect(200)).body).toEqual({ reminded: 1 });
      expect((await post('teacher', `/v1/ptm/events/${ids.event}/remind`).expect(200)).body).toEqual({ reminded: 0 });
      expect(await notified('ptm:remind:%', ids.parent)).toBe(1);
    });

    it('stops bookings once the meeting is closed', async () => {
      await post('teacher', `/v1/ptm/events/${ids.event}/close`).expect(403);
      await post('admin', `/v1/ptm/events/${ids.event}/close`).expect(200);
      await post('parent2', `/v1/ptm/slots/${ids.slot2}/book`, { studentId: ids.kid2 }).expect(409);
      expect((await get('parent', '/v1/ptm/events').expect(200)).body[0]).toMatchObject({ status: 'closed', slots: 3, booked: 1 });
    });
  });

  describe('early years', () => {
    it('loads the milestone framework for the principal only', async () => {
      await post('teacher', '/v1/early-years/framework/seed').expect(403);
      expect((await post('principal', '/v1/early-years/framework/seed').expect(200)).body.added).toBe(40);
      expect((await post('principal', '/v1/early-years/framework/seed').expect(200)).body.added).toBe(0);
      const fw = (await get('teacher', '/v1/early-years/framework?ageBand=3-4').expect(200)).body;
      expect(fw).toHaveLength(10);
      expect(new Set(fw.map((m: { domain: string }) => m.domain))).toEqual(new Set(['physical', 'language', 'cognitive', 'social_emotional', 'creative']));
      ids.milestone = fw.find((m: { domain: string }) => m.domain === 'language').id;
      await post('principal', '/v1/early-years/framework/milestones', { domain: 'creative', ageBand: '3-4', title: 'Builds with blocks' }).expect(201);
      await post('principal', '/v1/early-years/framework/milestones', { domain: 'creative', ageBand: '3-4', title: 'Builds with blocks' }).expect(409);
    });

    it('records an observation with a photo and sets the milestone status', async () => {
      const r = await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('teacher')).field('note', 'Told the story of the three bears').field('milestoneId', ids.milestone).field('status', 'developing').attach('photo', JPEG, { filename: 'story.jpg', contentType: 'image/jpeg' }).expect(201);
      expect(r.body).toMatchObject({ domain: 'language', status: 'developing', hasPhoto: true, observedOn: '2026-10-20' });
      ids.obs = r.body.id;
      await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('teacher')).field('note', 'Ran across the yard').field('domain', 'physical').expect(201);
      await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('teacher')).field('note', 'Not a photo').field('domain', 'physical').attach('photo', Buffer.from('plain text'), { filename: 'x.jpg', contentType: 'image/jpeg' }).expect(400);
      await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('teacher')).field('note', 'No domain').expect(400);
      await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('teacher')).field('note', 'Status alone').field('domain', 'physical').field('status', 'achieved').expect(400);
      await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('teacher2')).field('note', 'Not my class').field('domain', 'physical').expect(403);
      await http().post(`/v1/early-years/students/${ids.kid}/observations`).set(auth('parent')).field('note', 'Parents cannot').field('domain', 'physical').expect(403);
    });

    it('updates milestone status and shows the child record', async () => {
      await put('teacher', `/v1/early-years/students/${ids.kid}/milestones/${ids.milestone}`, { status: 'achieved' }).expect(200);
      await put('teacher', `/v1/early-years/students/${ids.kid}/milestones/${ids.milestone}`, { status: 'excellent' }).expect(400);
      await put('teacher2', `/v1/early-years/students/${ids.kid}/milestones/${ids.milestone}`, { status: 'emerging' }).expect(403);
      const rec = (await get('teacher', `/v1/early-years/students/${ids.kid}`).expect(200)).body;
      expect(rec.milestones.find((m: { id: string }) => m.id === ids.milestone).status).toBe('achieved');
      expect(rec.observations).toHaveLength(2);
      const roster = (await get('teacher', `/v1/early-years/classes/${ids.section}/students`).expect(200)).body;
      expect(roster.find((x: { id: string }) => x.id === ids.kid)).toMatchObject({ achieved: 1, observations: 2 });
      expect(await audited('early_years.observation_added')).toBe(2);
    });

    it('serves the Parent App the child record, the photo and the learning story', async () => {
      const mine = (await get('parent', `/v1/parent/children/${ids.kid}/early-years`).expect(200)).body;
      expect(mine.milestones).toHaveLength(1);
      expect(mine.observations).toHaveLength(2);
      await get('parent2', `/v1/parent/children/${ids.kid}/early-years`).expect(404);
      const photo = await get('parent', `/v1/parent/children/${ids.kid}/early-years/observations/${ids.obs}/photo`).expect(200);
      expect(photo.headers['content-type']).toContain('image/jpeg');
      await get('parent2', `/v1/parent/children/${ids.kid}/early-years/observations/${ids.obs}/photo`).expect(404);
      const pdf = await get('parent', `/v1/parent/children/${ids.kid}/early-years/learning-story.pdf?termId=${ids.term}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await get('parent', `/v1/parent/children/${ids.kid}/early-years/learning-story.pdf?termId=${ids.term}x`).expect(400);
    });

    it('serves staff the learning story for a term', async () => {
      const pdf = await get('teacher', `/v1/early-years/students/${ids.kid}/learning-story.pdf?termId=${ids.term}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await get('teacher2', `/v1/early-years/students/${ids.kid}/learning-story.pdf?termId=${ids.term}`).expect(403);
      expect((await get('teacher', '/v1/early-years/terms').expect(200)).body[0].name).toBe('Term 1');
    });
  });

  describe('health records', () => {
    const profile = { bloodGroup: 'B+', allergies: ['Peanuts', 'Penicillin'], conditions: ['Asthma'], medications: ['Inhaler'], emergencyContacts: [{ name: 'Ravi Kumar', relation: 'father', phone: '9876543210' }], notes: 'Keep inhaler in the bag' };

    it('keeps the record from teachers, students and other guardians', async () => {
      for (const who of ['teacher', 'student', 'parent']) await get(who, `/v1/student-health/students/${ids.kid}`).expect(403);
      await put('teacher', `/v1/student-health/students/${ids.kid}/profile`, profile).expect(403);
      await post('teacher', `/v1/student-health/students/${ids.kid}/visits`, { complaint: 'Headache' }).expect(403);
      await get('teacher', '/v1/student-health/visits').expect(403);
      await get('outsider', `/v1/student-health/students/${ids.kid}`).expect(404);
    });

    it('lets the counsellor save the profile and every read is audited', async () => {
      const saved = (await put('counsellor', `/v1/student-health/students/${ids.kid}/profile`, profile).expect(200)).body;
      expect(saved).toMatchObject({ bloodGroup: 'B+', allergies: ['Peanuts', 'Penicillin'] });
      await put('counsellor', `/v1/student-health/students/${ids.kid}/profile`, { ...profile, bloodGroup: 'Z+' }).expect(400);
      await put('principal', `/v1/student-health/students/${ids.kid}/profile`, { ...profile, allergies: ['Peanuts'] }).expect(200);
      const before = await audited('health.viewed');
      const rec = (await get('counsellor', `/v1/student-health/students/${ids.kid}`).expect(200)).body;
      expect(rec.profile).toMatchObject({ allergies: ['Peanuts'], conditions: ['Asthma'] });
      expect(await audited('health.viewed')).toBe(before + 1);
      await get('admin', `/v1/student-health/students/${t.tenantId}`).expect(404);
    });

    it('logs a nurse visit and tells the family when a child is sent home', async () => {
      await post('principal', `/v1/student-health/students/${ids.kid}/visits`, { complaint: 'Stomach ache', action: 'Rested for 20 minutes' }).expect(201);
      expect(await notified('health:home:%', ids.parent)).toBe(0);
      const home = (await post('principal', `/v1/student-health/students/${ids.kid}/visits`, { complaint: 'Fever', action: 'Called parent', sentHome: true }).expect(201)).body;
      expect(await notified(`health:home:${home.id}`, ids.parent)).toBe(1);
      const sentHome = (await get('principal', '/v1/student-health/visits?sentHome=true').expect(200)).body;
      expect(sentHome).toHaveLength(1);
      expect(sentHome[0]).toMatchObject({ complaint: 'Fever', student: 'Student A' });
      await post('principal', `/v1/student-health/students/${ids.kid}/visits`, { complaint: '' }).expect(400);
    });

    it('records vaccinations', async () => {
      await post('counsellor', `/v1/student-health/students/${ids.kid}/vaccinations`, { vaccine: 'MMR', dose: '2', givenOn: '2026-09-01', nextDueOn: '2027-09-01' }).expect(201);
      await post('counsellor', `/v1/student-health/students/${ids.kid}/vaccinations`, { vaccine: 'MMR', givenOn: 'last week' }).expect(400);
      const rec = (await get('counsellor', `/v1/student-health/students/${ids.kid}`).expect(200)).body;
      expect(rec.vaccinations).toHaveLength(1);
      expect(rec.visits).toHaveLength(2);
    });

    it('shows a guardian only their own child, with an audit entry', async () => {
      const before = await audited('health.viewed');
      const mine = (await get('parent', `/v1/parent/children/${ids.kid}/health`).expect(200)).body;
      expect(mine.profile.allergies).toEqual(['Peanuts']);
      expect(mine.visits).toHaveLength(2);
      expect(await audited('health.viewed')).toBe(before + 1);
      await get('parent2', `/v1/parent/children/${ids.kid}/health`).expect(404);
      await get('student', `/v1/parent/children/${ids.kid}/health`).expect(403);
    });

    it('lists classes for choosing a student without exposing medical details', async () => {
      const roster = (await get('counsellor', `/v1/student-health/classes/${ids.section}/students`).expect(200)).body;
      expect(roster.find((x: { id: string }) => x.id === ids.kid)).toEqual({ id: ids.kid, fullName: 'Student A', rollNo: 'R1', hasProfile: true });
      await get('teacher', `/v1/student-health/classes/${ids.section}/students`).expect(403);
    });
  });
});
