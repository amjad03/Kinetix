import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type MessageNewEvent } from '@kinetix/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

const next = <T>(s: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), ms);
    s.once(event, (v: T) => {
      clearTimeout(timer);
      resolve(v);
    });
  });

/** Calendar and holidays, settings, syllabus coverage, homework submissions, consent, realtime messages, error codes. */
describe('school year', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const inbox = async (who: string, kind: string) =>
    (await http().get('/v1/notifications').set(auth(who)).expect(200)).body.items.filter((n: { kind: string }) => n.kind === kind);

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.teacher.email!),
      teacher2: await login(t.teacher2.email!),
      principal: await login(t.principal.email!),
      parent: await login(t.guardian.email!),
      student: await login(t.studentUser.email!),
    };
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await owner.end();
  });

  describe('academic calendar', () => {
    it('cancels classes on a holiday everywhere, and tells families', async () => {
      await http().post('/v1/admin/calendar').set(auth('teacher')).send({ kind: 'holiday', title: 'x', startsOn: monday, endsOn: monday }).expect(403);
      const bad = await http().post('/v1/admin/calendar').set(auth('principal')).send({ kind: 'holiday', title: 'x', startsOn: monday, endsOn: '2020-01-01' }).expect(400);
      expect(bad.body.code).toBe('CALENDAR_BAD_RANGE');

      expect((await http().get(`/v1/teacher/timetable?date=${monday}`).set(auth('teacher')).expect(200)).body.periods).toHaveLength(1);
      const e = (await http().post('/v1/admin/calendar').set(auth('principal')).send({ kind: 'holiday', title: 'Local festival', startsOn: monday, endsOn: monday }).expect(201)).body;

      const day = (await http().get(`/v1/teacher/timetable?date=${monday}`).set(auth('teacher')).expect(200)).body;
      expect(day).toMatchObject({ periods: [], holiday: { title: 'Local festival' } });
      expect((await http().get(`/v1/admin/classes?date=${monday}`).set(auth('principal')).expect(200)).body).toMatchObject({ classes: [], holiday: { title: 'Local festival' } });

      const [n] = await inbox('parent', 'calendar');
      expect(n.title).toBe('Holiday: Local festival');
      expect((await inbox('student', 'calendar')).length).toBe(1);
      expect((await http().get(`/v1/calendar?from=${monday}&to=${monday}`).set(auth('parent')).expect(200)).body.events).toEqual([
        expect.objectContaining({ id: e.id, kind: 'holiday', title: 'Local festival', programIds: null, programs: null }),
      ]);

      // Renaming updates the same notification; deleting brings the class back.
      await http().put(`/v1/admin/calendar/${e.id}`).set(auth('principal')).send({ kind: 'holiday', title: 'Festival holiday', startsOn: monday, endsOn: monday }).expect(200);
      expect((await inbox('parent', 'calendar')).map((x: { title: string }) => x.title)).toEqual(['Holiday: Festival holiday']);
      await http().delete(`/v1/admin/calendar/${e.id}`).set(auth('principal')).expect(204);
      expect(await inbox('parent', 'calendar')).toEqual([]); // withdrawn
      expect((await http().get(`/v1/teacher/timetable?date=${monday}`).set(auth('teacher')).expect(200)).body.periods).toHaveLength(1);
    });

    it("holds a program's exams for that program's families only", async () => {
      const other = (await owner.query(`insert into programs (tenant_id, campus_id, name, level, term_count) values ($1, $2, 'BSc', 'ug', 6) returning id`, [t.tenantId, t.campus.id])).rows[0].id;
      await http().post('/v1/admin/calendar').set(auth('principal')).send({ kind: 'exam', title: 'BSc practicals', startsOn: monday, endsOn: monday, programIds: [other] }).expect(201);
      const mine = await http().post('/v1/admin/calendar').set(auth('principal')).send({ kind: 'exam', title: 'Mid-semester exams', startsOn: monday, endsOn: monday, programIds: [t.program.id], notify: false }).expect(201);
      const seen = (await http().get(`/v1/calendar?from=${monday}&to=${monday}`).set(auth('parent')).expect(200)).body.events;
      expect(seen.map((e: { title: string }) => e.title)).toEqual(['Mid-semester exams']);
      expect(seen[0].programs).toEqual(['BCom']);
      expect((await http().get(`/v1/calendar?from=${monday}&to=${monday}`).set(auth('teacher')).expect(200)).body.events).toHaveLength(2);
      expect(await inbox('parent', 'calendar')).toHaveLength(0); // notify: false, and not their program
      // Exams do not cancel classes.
      expect((await http().get(`/v1/teacher/timetable?date=${monday}`).set(auth('teacher')).expect(200)).body.periods).toHaveLength(1);
      await http().delete(`/v1/admin/calendar/${mine.body.id}`).set(auth('principal')).expect(204);
    });
  });

  it('lets the principal change institution settings, audited', async () => {
    expect((await http().get('/v1/admin/settings').set(auth('principal')).expect(200)).body).toEqual({ liveViewEnabled: false, liveViewIndicator: true, classroomAudioToViewers: false, pinFallbackEnabled: false, grievanceOfficer: null, recordingRetentionGraceDays: 7, boardKiosk: { enabled: true, pinSet: false, pinSetAt: null } });
    await http().put('/v1/admin/settings').set(auth('teacher')).send({ liveViewEnabled: true }).expect(403);
    await http().put('/v1/admin/settings').set(auth('principal')).send({ unknown: true }).expect(400);
    const after = (await http().put('/v1/admin/settings').set(auth('principal')).send({ liveViewEnabled: true, classroomAudioToViewers: true }).expect(200)).body;
    expect(after).toMatchObject({ liveViewEnabled: true, classroomAudioToViewers: true, liveViewIndicator: true });
    await http().put('/v1/admin/settings').set(auth('principal')).send({ grievanceOfficer: { name: 'Dr. Meera Rao', email: 'grievance@college.in' } }).expect(200);
    expect((await http().get(`/v1/consents?studentId=${t.students[2].id}`).set(auth('student')).expect(200)).body.grievanceOfficer).toEqual({ name: 'Dr. Meera Rao', email: 'grievance@college.in' });
    const { rows } = await owner.query(`select data from audit_log where tenant_id = $1 and action = 'settings.updated'`, [t.tenantId]);
    expect(rows).toContainEqual({ data: { liveViewEnabled: true, classroomAudioToViewers: true } });
  });

  it('tracks syllabus coverage from the board and the Teacher App', async () => {
    const course = (await owner.query(`select id from courses where code = 'bcom-3-corporate-accounting'`)).rows[0].id;
    await owner.query(`update subjects set course_id = $1 where id = $2`, [course, t.subject.id]);
    const topics = (await owner.query(`select t.id from topics t join chapters c on c.id = t.chapter_id where c.course_id = $1 and t.tenant_id is null order by c.position, t.position`, [course])).rows;
    const q = `sectionId=${t.section.id}&subjectId=${t.subject.id}`;

    await http().post('/v1/coverage').set(auth('teacher2')).send({ sectionId: t.section.id, subjectId: t.subject.id, topicId: topics[0].id }).expect(403);
    await http().post('/v1/coverage').set(auth('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, topicId: topics[0].id }).expect(200);
    const tomorrow = new Date(Date.parse(monday) + 86400_000).toISOString().slice(0, 10);
    const future = await http().post('/v1/coverage').set(auth('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, topicId: topics[1].id, coveredOn: tomorrow }).expect(400);
    expect(future.body.code).toBe('COVERAGE_FUTURE_DATE');

    // From the board, for its open class.
    const paired = await pairBoard(app, t, tokens.teacher);
    sockets.push(paired.socket);
    await http().post('/v1/coverage').set('authorization', `Bearer ${paired.boardToken}`).send({ topicId: topics[1].id }).expect(200);

    const c = (await http().get(`/v1/coverage?${q}`).set(auth('parent')).expect(200)).body;
    expect(c).toMatchObject({ covered: 2, total: topics.length, percent: Math.round((2 / topics.length) * 100) });
    expect(c.topics.map((x: { topicId: string }) => x.topicId).sort()).toEqual([topics[0].id, topics[1].id].sort());
    await http().get(`/v1/coverage?${q}`).set(auth('teacher2')).expect(404);

    await http().delete('/v1/coverage').set(auth('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, topicId: topics[0].id }).expect(204);
    expect((await http().get(`/v1/coverage?${q}`).set(auth('teacher')).expect(200)).body.covered).toBe(1);
  });

  describe('homework submissions', () => {
    let hwId: string;
    beforeAll(async () => {
      hwId = (await http().post('/v1/homework').set(auth('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Ex 4.2', dueOn: monday }).expect(201)).body.id;
    });

    it('lets a student hand in text and photos, and the teacher check or return it', async () => {
      const me = t.students[2].id; // student C has their own login
      await http().post(`/v1/homework/${hwId}/submissions/${me}`).set(auth('student')).field('text', '').expect(400);
      await http().post(`/v1/homework/${hwId}/submissions/${t.students[0].id}`).set(auth('student')).field('text', 'x').expect(404); // someone else
      await http()
        .post(`/v1/homework/${hwId}/submissions/${me}`)
        .set(auth('student'))
        .attach('files', Buffer.from('not a photo'), { filename: 'a.txt', contentType: 'text/plain' })
        .expect(400);
      const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
      const sub = (await http().post(`/v1/homework/${hwId}/submissions/${me}`).set(auth('student')).field('text', 'My answers').attach('files', photo, { filename: 'page1.jpg', contentType: 'image/jpeg' }).expect(200)).body;
      expect(sub).toMatchObject({ status: 'submitted', text: 'My answers', late: false, files: [{ index: 0, name: 'page1.jpg', mime: 'image/jpeg', bytes: photo.length }] });

      const list = (await http().get(`/v1/homework/${hwId}/submissions`).set(auth('teacher')).expect(200)).body;
      expect(list.counts).toMatchObject({ students: t.students.length, submitted: 1, missing: t.students.length - 1 });
      await http().get(`/v1/homework/${hwId}/submissions`).set(auth('student')).expect(403);
      const file = await http().get(`/v1/homework/${hwId}/submissions/${me}/files/0`).set(auth('teacher')).buffer(true).parse((res, cb) => {
        const parts: Buffer[] = [];
        res.on('data', (d: Buffer) => parts.push(d));
        res.on('end', () => cb(null, Buffer.concat(parts)));
      });
      expect(file.status).toBe(200);
      expect(Buffer.compare(file.body as Buffer, photo)).toBe(0);

      await http().post(`/v1/homework/${hwId}/submissions/${me}/review`).set(auth('teacher')).send({ status: 'returned', remark: 'Show the journal entries' }).expect(200);
      expect((await inbox('student', 'homework')).find((n: { title: string }) => n.title.startsWith('Homework to redo'))).toBeTruthy();
      // Handed in again after being returned, now late.
      clock.at = new Date(Date.parse(nextMondayIst('10:30').toISOString()) + 2 * 86400_000);
      const again = (await http().post(`/v1/homework/${hwId}/submissions/${me}`).set(auth('student')).field('text', 'With entries').expect(200)).body;
      expect(again).toMatchObject({ status: 'submitted', late: true, files: [], remark: null });
      await http().post(`/v1/homework/${hwId}/submissions/${me}/review`).set(auth('teacher')).send({ status: 'checked' }).expect(200);
      const row = (await http().get(`/v1/homework/${hwId}/submissions`).set(auth('teacher')).expect(200)).body.students.find((x: { studentId: string }) => x.studentId === me);
      expect(row).toMatchObject({ status: 'checked', checkedBy: expect.any(String), checkedAt: expect.any(String) });
      const checked = await http().post(`/v1/homework/${hwId}/submissions/${me}`).set(auth('student')).field('text', 'again').expect(400);
      expect(checked.body.code).toBe('SUBMISSION_CHECKED');
      clock.at = nextMondayIst('10:30');
    });

    it('lets a guardian hand in for a child without a login', async () => {
      const child = t.students[0].id;
      const sub = (await http().post(`/v1/homework/${hwId}/submissions/${child}`).set(auth('parent')).field('text', 'Done in the notebook').expect(200)).body;
      expect(sub.status).toBe('submitted');
      expect((await http().get(`/v1/homework/${hwId}/submissions/${child}`).set(auth('teacher')).expect(200)).body.text).toBe('Done in the notebook');

      // In a college, a student with their own login hands in for themselves.
      await owner.query(`insert into guardians (tenant_id, user_id, student_id, relation) values ($1, $2, $3, 'father')`, [t.tenantId, t.guardian.id, t.students[2].id]);
      const own = await http().post(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(auth('parent')).field('text', 'x').expect(403);
      expect(own.body.code).toBe('SUBMISSION_STUDENT_ONLY');
      await owner.query(`delete from guardians where user_id = $1 and student_id = $2`, [t.guardian.id, t.students[2].id]);
    });

    it("lists a child's subjects for the family", async () => {
      const subs = (await http().get(`/v1/parent/children/${t.students[0].id}/subjects`).set(auth('parent')).expect(200)).body;
      expect(subs.map((x: { id: string }) => x.id)).toEqual([t.subject.id]);
      await http().get(`/v1/parent/children/${t.students[1].id}/subjects`).set(auth('parent')).expect(404);
    });
  });

  describe('consent', () => {
    it('records decisions (adult student decides in a college), and withdrawing AI consent turns KINETIX AI off', async () => {
      const me = t.students[2].id;
      const before = (await http().get(`/v1/consents?studentId=${me}`).set(auth('student')).expect(200)).body;
      expect(before).toMatchObject({ canDecide: true, purposes: { ai_features: null } });
      // A guardian of another child cannot see this student's consent.
      await http().get(`/v1/consents?studentId=${me}`).set(auth('parent')).expect(404);

      await http().post('/v1/consents').set(auth('student')).send({ studentId: me, purpose: 'ai_features', granted: false }).expect(201);
      const denied = await http().post('/v1/ai/explain').set(auth('student')).send({ question: 'What is goodwill?', language: 'en' }).expect(403);
      expect(denied.body.code).toBe('CONSENT_WITHDRAWN');
      await http().post('/v1/consents').set(auth('student')).send({ studentId: me, purpose: 'ai_features', granted: true }).expect(201);

      // In a college the guardian decides only for a child without their own login.
      expect((await http().get(`/v1/consents?studentId=${t.students[0].id}`).set(auth('parent')).expect(200)).body.canDecide).toBe(true);
      await owner.query(`update tenants set kind = 'school' where id = $1`, [t.tenantId]);
      const school = await http().post('/v1/consents').set(auth('student')).send({ studentId: me, purpose: 'photos', granted: true }).expect(403);
      expect(school.body.code).toBe('CONSENT_GUARDIAN_DECIDES');
      await owner.query(`update tenants set kind = 'college' where id = $1`, [t.tenantId]);

      const summary = (await http().get('/v1/admin/consents').set(auth('principal')).expect(200)).body;
      expect(summary.purposes.find((p: { purpose: string }) => p.purpose === 'ai_features')).toEqual({ purpose: 'ai_features', granted: 1, withdrawn: 0, notAsked: summary.students - 1 });
      expect((await owner.query(`select count(*)::int as n from consents where student_id = $1`, [me])).rows[0].n).toBe(2); // history kept
    });
  });

  it('delivers new messages over the socket to both sides', async () => {
    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    const parentSocket = io(`${url}/realtime`, { auth: { token: tokens.parent }, transports: ['websocket'] });
    sockets.push(parentSocket);
    await next(parentSocket, 'ready');
    const conv = (await http().post('/v1/conversations').set(auth('parent')).send({ studentId: t.students[0].id, withUserId: t.teacher.id }).expect(201)).body;
    const arrived = next<MessageNewEvent>(parentSocket, RealtimeEvents.MessageNew);
    const m = (await http().post(`/v1/conversations/${conv.id}/messages`).set(auth('teacher')).send({ body: 'Hello' }).expect(201)).body;
    expect(await arrived).toEqual({ conversationId: conv.id, messageId: m.id, senderId: t.teacher.id });
  });

  it('gives every error a stable code', async () => {
    expect((await http().post('/v1/auth/login').send({ tenant: t.slug, login: 'nobody@x.in', password: 'pw' }).expect(401)).body).toMatchObject({ code: 'AUTH_WRONG_LOGIN', message: 'Wrong institution, login or password' });
    expect((await http().get('/v1/admin/settings').set(auth('teacher')).expect(403)).body.code).toBe('FORBIDDEN');
    expect((await http().get(`/v1/homework/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`).set(auth('teacher')).expect(404)).body.code).toBe('NOT_FOUND');
  });
});
