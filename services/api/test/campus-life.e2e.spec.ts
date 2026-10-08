import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('clubs, committees and campus events', () => {
  const owner = ownerPool();
  const start = new Date('2026-10-20T04:30:00Z');
  const clock = new FixedClock(start);
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
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);
  const at = (hours: number) => new Date(start.getTime() + hours * 3_600_000).toISOString();
  const C = '/v1/campus-life';

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { me: t.students[2].id, kid: t.students[0].id, kid2: t.students[1].id, teacher: t.teacher.id, teacher2: t.teacher2.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('clubs', () => {
    it('staff create a club; names are unique and students cannot create', async () => {
      const res = await post('teacher', `${C}/clubs`, { name: 'Robotics', category: 'technical', facultyCoordinatorId: ids.teacher }).expect(201);
      ids.club = res.body.id;
      await post('principal', `${C}/clubs`, { name: 'Robotics' }).expect(409);
      await post('student', `${C}/clubs`, { name: 'Chess' }).expect(403);
      expect((await get('teacher', `${C}/clubs`).expect(200)).body).toHaveLength(1);
      expect((await get('outsider', `${C}/clubs`).expect(200)).body).toHaveLength(0);
    });

    it('a join request needs approval; a second request is refused', async () => {
      const mine = (await get('student', `${C}/me/clubs`).expect(200)).body;
      expect(mine[0]).toMatchObject({ name: 'Robotics', membership: null, points: 0 });
      const j = await post('student', `${C}/clubs/${ids.club}/join`, {}).expect(201);
      expect(j.body.status).toBe('requested');
      await post('student', `${C}/clubs/${ids.club}/join`, {}).expect(409);
      await post('parent', `${C}/clubs/${ids.club}/join`, { studentId: ids.kid }).expect(201);
      await post('parent', `${C}/clubs/${ids.club}/join`, { studentId: ids.kid2 }).expect(404);
      const list = (await get('teacher', `${C}/clubs/${ids.club}/members?status=requested`).expect(200)).body;
      expect(list).toHaveLength(2);
      const mem = list.find((m: { studentId: string }) => m.studentId === ids.me);
      await post('student', `${C}/clubs/${ids.club}/members/${mem.id}/decision`, { decision: 'approve' }).expect(403);
      await post('teacher', `${C}/clubs/${ids.club}/members/${mem.id}/decision`, { decision: 'approve' }).expect(200);
      await post('teacher', `${C}/clubs/${ids.club}/members/${mem.id}/decision`, { decision: 'reject' }).expect(409);
      const kidReq = list.find((m: { studentId: string }) => m.studentId === ids.kid);
      await post('teacher', `${C}/clubs/${ids.club}/members/${kidReq.id}/decision`, { decision: 'reject' }).expect(200);
      expect((await get('student', `${C}/me/clubs`)).body[0].membership).toMatchObject({ status: 'active', role: 'member' });
      expect((await get('teacher', `${C}/clubs`)).body[0]).toMatchObject({ members: 1, pending: 0 });
    });

    it('activities award points to attending members only, once', async () => {
      await post('teacher', `${C}/clubs/${ids.club}/activities`, { title: 'Line follower build', activityOn: '2026-10-18', points: 10 }).then((r) => {
        expect(r.status).toBe(201);
        ids.activity = r.body.id;
      });
      const r1 = await post('teacher', `${C}/activities/${ids.activity}/attendance`, { studentIds: [ids.me, ids.kid] }).expect(200);
      expect(r1.body).toEqual({ marked: 1, skipped: [ids.kid] });
      expect((await post('teacher', `${C}/activities/${ids.activity}/attendance`, { studentIds: [ids.me] }).expect(200)).body.marked).toBe(0);
      const table = (await get('teacher', `${C}/clubs/${ids.club}/points`).expect(200)).body;
      expect(table).toEqual([expect.objectContaining({ studentId: ids.me, points: 10, activities: 1 })]);
      expect((await get('student', `${C}/me/clubs`)).body[0].points).toBe(10);
      expect((await get('teacher', `${C}/clubs/${ids.club}/activities`)).body[0].attended).toBe(1);
    });

    it('issues a participation certificate PDF to the student, not to another family', async () => {
      const res = await get('student', `${C}/clubs/${ids.club}/members/${ids.me}/certificate`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      await get('parent2', `${C}/clubs/${ids.club}/members/${ids.me}/certificate`).expect(403);
      await get('teacher', `${C}/clubs/${ids.club}/members/${ids.kid}/certificate`).expect(404);
    });

    it('a member can leave', async () => {
      await post('student', `${C}/clubs/${ids.club}/leave`, {}).expect(200);
      expect((await get('student', `${C}/me/clubs`)).body[0].membership.status).toBe('left');
    });
  });

  describe('committees', () => {
    it('the office creates a statutory committee with members and tenure', async () => {
      await post('teacher', `${C}/committees`, { name: 'IQAC', statutory: true }).expect(403);
      ids.committee = (await post('principal', `${C}/committees`, { name: 'IQAC', statutory: true, description: 'Internal quality assurance' }).expect(201)).body.id;
      await post('principal', `${C}/committees`, { name: 'IQAC' }).expect(409);
      await post('principal', `${C}/committees/${ids.committee}/members`, { userId: ids.teacher, role: 'chair', tenureStart: '2026-04-01' }).expect(201);
      const past = await post('principal', `${C}/committees/${ids.committee}/members`, { userId: ids.teacher2, role: 'member', tenureStart: '2025-04-01', tenureEnd: '2026-03-31' }).expect(201);
      await post('principal', `${C}/committees/${ids.committee}/members`, { userId: ids.teacher2, tenureStart: '2026-05-01', tenureEnd: '2026-04-01' }).expect(400);
      const all = (await get('principal', `${C}/committees/${ids.committee}/members`).expect(200)).body;
      expect(all).toHaveLength(2);
      const cur = (await get('principal', `${C}/committees/${ids.committee}/members?current=true`)).body;
      expect(cur.map((m: { userId: string }) => m.userId)).toEqual([ids.teacher]);
      await patch('principal', `${C}/committees/${ids.committee}/members/${past.body.id}`, { tenureEnd: '2026-03-30' }).expect(200);
      const list = (await get('principal', `${C}/committees?statutory=true`).expect(200)).body;
      expect(list[0]).toMatchObject({ name: 'IQAC', members: 1, openActions: 0 });
    });

    it('meetings carry an agenda, minutes mark them held, and action items track owner, due date and status', async () => {
      const m = await post('principal', `${C}/committees/${ids.committee}/meetings`, { title: 'Q2 review', meetingOn: '2026-10-10', agenda: '1. AQAR draft\n2. Feedback analysis' }).expect(201);
      ids.meeting = m.body.id;
      expect(m.body.status).toBe('scheduled');
      const held = await patch('principal', `${C}/meetings/${ids.meeting}`, { minutes: 'AQAR draft approved with changes.' }).expect(200);
      expect(held.body.status).toBe('held');
      const a = await post('principal', `${C}/meetings/${ids.meeting}/actions`, { title: 'Circulate AQAR', ownerUserId: ids.teacher, dueOn: '2026-10-15' }).expect(201);
      ids.action = a.body.id;
      await post('principal', `${C}/meetings/${ids.meeting}/actions`, { title: 'Book hall', ownerUserId: ids.teacher2, dueOn: '2026-11-15' }).expect(201);
      const overdue = (await get('principal', `${C}/action-items?overdue=true`).expect(200)).body;
      expect(overdue).toHaveLength(1);
      expect(overdue[0]).toMatchObject({ title: 'Circulate AQAR', overdue: true, committeeName: 'IQAC' });
      await get('teacher', `${C}/action-items`).expect(403);
      expect((await get('teacher', `${C}/action-items?mine=true`).expect(200)).body).toHaveLength(1);
      await post('teacher2', `${C}/action-items/${ids.action}/status`, { status: 'done' }).expect(403);
      const done = await post('teacher', `${C}/action-items/${ids.action}/status`, { status: 'done' }).expect(200);
      expect(done.body.completedAt).toBeTruthy();
      expect((await get('principal', `${C}/action-items?overdue=true`)).body).toHaveLength(0);
      const meetings = (await get('principal', `${C}/committees/${ids.committee}/meetings`)).body;
      expect(meetings[0]).toMatchObject({ actions: 2, openActions: 1 });
      await patch('principal', `${C}/meetings/${ids.meeting}`, { status: 'cancelled' }).expect(200);
      await patch('principal', `${C}/meetings/${ids.meeting}`, { minutes: 'x' }).expect(409);
    });
  });

  describe('events', () => {
    it('staff create and publish an event; a draft is invisible to students', async () => {
      const ev = await post('teacher', `${C}/events`, { title: 'Science fest', venue: 'Main hall', capacity: 2, startsAt: at(-1), endsAt: at(5), feePaise: 50000, eventType: 'fest' }).expect(201);
      ids.event = ev.body.id;
      expect(ev.body.status).toBe('draft');
      await post('teacher', `${C}/events`, { title: 'Bad', capacity: 5, startsAt: at(2), endsAt: at(1) }).expect(400);
      expect((await get('student', `${C}/me/events`).expect(200)).body).toHaveLength(0);
      await post('student', `${C}/events/${ids.event}/register`, {}).expect(409);
      await post('teacher', `${C}/events/${ids.event}/publish`).expect(200);
      await post('teacher', `${C}/events/${ids.event}/publish`).expect(409);
      const visible = (await get('student', `${C}/me/events`).expect(200)).body;
      expect(visible[0]).toMatchObject({ title: 'Science fest', seatsLeft: 2, feePaise: 50000, registration: null });
      expect((await get('outsider', `${C}/events`)).body).toHaveLength(0);
    });

    it('registers up to capacity, then waitlists; a cancellation promotes the next in line', async () => {
      const r1 = await post('student', `${C}/events/${ids.event}/register`, {}).expect(201);
      expect(r1.body.status).toBe('registered');
      expect(r1.body.qrToken.length).toBeGreaterThan(16);
      await post('student', `${C}/events/${ids.event}/register`, {}).expect(409);
      const r2 = await post('parent', `${C}/events/${ids.event}/register`, { studentId: ids.kid }).expect(201);
      expect(r2.body.status).toBe('registered');
      expect(r2.body.qrToken).not.toBe(r1.body.qrToken);
      const r3 = await post('parent2', `${C}/events/${ids.event}/register`, {}).expect(201);
      expect(r3.body.status).toBe('waitlisted');
      await post('parent2', `${C}/events/${ids.event}/register`, { studentId: ids.me }).expect(404);
      expect((await get('teacher', `${C}/events`)).body[0]).toMatchObject({ registered: 2, waitlisted: 1, checkedIn: 0 });
      await post('student', `${C}/events/${ids.event}/cancel-registration`, {}).expect(200);
      const mine = (await get('parent2', `${C}/me/registrations`).expect(200)).body;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ title: 'Science fest', status: 'registered', checkedIn: false, canGiveFeedback: false });
      ids.token2 = mine[0].qrToken;
      ids.token1 = r2.body.qrToken;
      // The student cancelled, so can come back and now waits.
      const again = await post('student', `${C}/events/${ids.event}/register`, {}).expect(201);
      expect(again.body.status).toBe('waitlisted');
      expect(again.body.qrToken).not.toBe(r1.body.qrToken);
      await post('student', `${C}/events/${ids.event}/cancel-registration`, {}).expect(200);
    });

    it('QR check-in marks attendance once and rejects unknown, waitlisted and foreign codes', async () => {
      await post('student', `${C}/events/${ids.event}/check-in`, { token: ids.token1 }).expect(403);
      const ok = await post('teacher', `${C}/events/${ids.event}/check-in`, { token: ids.token1 }).expect(200);
      expect(ok.body).toMatchObject({ fullName: 'Student A', rollNo: 'R1' });
      expect(ok.body.checkedInAt).toBeTruthy();
      await post('teacher', `${C}/events/${ids.event}/check-in`, { token: ids.token1 }).expect(409);
      await post('teacher', `${C}/events/${ids.event}/check-in`, { token: 'not-a-real-token-123' }).expect(404);
      const other2 = await post('teacher', `${C}/events`, { title: 'Quiz', capacity: 5, startsAt: at(1), endsAt: at(2) }).expect(201);
      await post('teacher', `${C}/events/${other2.body.id}/publish`).expect(200);
      await post('teacher', `${C}/events/${other2.body.id}/check-in`, { token: ids.token2 }).expect(404);
      // A waitlisted student cannot be checked in.
      await post('student', `${C}/events/${ids.event}/register`, {}).expect(201);
      const wait = (await get('student', `${C}/me/registrations`)).body[0];
      expect(wait.status).toBe('waitlisted');
      await post('teacher', `${C}/events/${ids.event}/check-in`, { token: wait.qrToken }).expect(409);
      await post('teacher', `${C}/events/${ids.event}/check-in`, { token: ids.token2 }).expect(200);
    });

    it('feedback is for those who attended, once, with a rating from 1 to 5', async () => {
      await post('student', `${C}/events/${ids.event}/feedback`, { rating: 4 }).expect(404);
      await post('parent', `${C}/events/${ids.event}/feedback`, { studentId: ids.kid, rating: 6 }).expect(400);
      expect((await get('parent', `${C}/me/registrations`)).body[0].canGiveFeedback).toBe(true);
      await post('parent', `${C}/events/${ids.event}/feedback`, { studentId: ids.kid, rating: 5, comment: 'Loved the robotics demo' }).expect(201);
      await post('parent', `${C}/events/${ids.event}/feedback`, { studentId: ids.kid, rating: 3 }).expect(409);
      await post('parent2', `${C}/events/${ids.event}/feedback`, { rating: 3 }).expect(201);
      const fb = (await get('teacher', `${C}/events/${ids.event}/feedback`).expect(200)).body;
      expect(fb).toHaveLength(2);
    });

    it('the summary reports attendance, fees expected and the average rating', async () => {
      const s = (await get('principal', `${C}/events/${ids.event}/summary`).expect(200)).body;
      expect(s).toMatchObject({ capacity: 2, registered: 2, waitlisted: 1, attended: 2, attendancePercent: 100, expectedFeePaise: 100000, feedbackCount: 2, averageRating: 4 });
      await get('student', `${C}/events/${ids.event}/summary`).expect(403);
    });

    it('a cancelled event refuses registration, and a raised capacity admits the waitlist', async () => {
      await patch('teacher', `${C}/events/${ids.event}`, { capacity: 3 }).expect(200);
      expect((await get('student', `${C}/me/registrations`)).body[0].status).toBe('registered');
      await post('teacher', `${C}/events/${ids.event}/cancel`).expect(200);
      await post('parent2', `${C}/events/${ids.event}/cancel-registration`, {}).expect(409); // already checked in
      await post('parent2', `${C}/events/${ids.event}/register`, {}).expect(409);
      await patch('teacher', `${C}/events/${ids.event}`, { venue: 'x' }).expect(409);
    });
  });
});
