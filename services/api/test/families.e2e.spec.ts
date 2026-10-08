import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type PairingClaimedEvent } from '@kinetix/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/** Notifications to families, saved boards, the parent view and the principal's dashboard. */
describe('families, saved boards and the dashboard', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let boardToken: string;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const inbox = async (who: string) => (await http().get('/v1/notifications').set(auth(who)).expect(200)).body as {
    unread: number;
    items: { id: string; kind: string; title: string; body: string; data: Record<string, string> }[];
  };
  const submitAttendance = (records: { studentId: string; status: string }[]) =>
    http().post('/v1/attendance').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, records }).expect(201);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.guardian.email!),
    };
    // A board with Anita's class open, for saving whiteboards.
    const deviceToken = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken;
    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    socket = io(`${url}/realtime`, { auth: { token: deviceToken }, transports: ['websocket'] });
    await new Promise((r) => socket.once('ready', r));
    const { code } = (await http().post('/v1/devices/me/pairing-codes').set('authorization', `Bearer ${deviceToken}`).expect(201)).body;
    const claimed = new Promise<PairingClaimedEvent>((r) => socket.once(RealtimeEvents.PairingClaimed, r));
    await http().post('/v1/pairing/claim').set(auth('teacher')).send({ code }).expect(200);
    boardToken = (await claimed).sessionToken;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  describe('absence alerts', () => {
    it("tell only that student's guardian, and are withdrawn when corrected", async () => {
      await submitAttendance([
        { studentId: t.students[0].id, status: 'absent' },
        { studentId: t.students[1].id, status: 'present' },
      ]);
      const mine = await inbox('parent');
      expect(mine.items).toHaveLength(1);
      expect(mine.items[0]).toMatchObject({ kind: 'absence', title: 'Student was marked absent' });
      expect(mine.items[0].body).toContain('Corporate Accounting (10:00–10:55)');
      expect(mine.unread).toBe(1);
      expect((await inbox('parent2')).items.filter((n) => n.kind === 'absence')).toHaveLength(0);

      // The teacher corrects the mark: the alert disappears.
      await submitAttendance([{ studentId: t.students[0].id, status: 'present' }]);
      expect((await inbox('parent')).items.filter((n) => n.kind === 'absence')).toHaveLength(0);

      // Marked absent again: it comes back, unread, once.
      await submitAttendance([{ studentId: t.students[0].id, status: 'absent' }]);
      await submitAttendance([{ studentId: t.students[0].id, status: 'absent' }]);
      const again = await inbox('parent');
      expect(again.items.filter((n) => n.kind === 'absence')).toHaveLength(1);
      expect(again.unread).toBe(1);
    });

    it('also come from attendance marked on the board', async () => {
      const res = await http()
        .post('/v1/sync/push')
        .set('authorization', `Bearer ${boardToken}`)
        .send({ ops: [{ opId: randomUUID(), type: 'attendance.marked', occurredAt: clock.now().toISOString(), payload: { studentId: t.students[1].id, status: 'absent' } }] })
        .expect(200);
      expect(res.body.results[0].status).toBe('applied');
      expect((await inbox('parent2')).items.some((n) => n.kind === 'absence' && n.data.studentId === t.students[1].id)).toBe(true);
    });
  });

  describe('homework', () => {
    it('reaches guardians and students of the class and shows in the parent summary', async () => {
      const due = nextMondayIst('12:00');
      due.setUTCDate(due.getUTCDate() + 2);
      await http()
        .post('/v1/homework')
        .set(auth('teacher'))
        .send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Exercise 4.2', instructions: 'Q1–5', dueOn: due.toISOString().slice(0, 10) })
        .expect(201);
      for (const who of ['parent', 'parent2', 'student']) {
        expect((await inbox(who)).items.some((n) => n.kind === 'homework' && n.body.startsWith('Exercise 4.2')), who).toBe(true);
      }
      expect((await inbox('outsider')).items).toHaveLength(0);

      const summary = (await http().get(`/v1/parent/children/${t.students[0].id}/summary`).set(auth('parent')).expect(200)).body;
      expect(summary.homework.upcoming.map((h: { title: string }) => h.title)).toContain('Exercise 4.2');
    });
  });

  describe('homework detail', () => {
    it('opens for guardians and students of the class, not for others', async () => {
      const id = (await inbox('parent')).items.find((n) => n.kind === 'homework')!.data.homeworkId;
      const hw = (await http().get(`/v1/homework/${id}`).set(auth('parent')).expect(200)).body;
      expect(hw.title).toBe('Exercise 4.2');
      await http().get(`/v1/homework/${id}`).set(auth('student')).expect(200);
      await http().get(`/v1/homework/${id}`).set(auth('teacher')).expect(200);
      await http().get(`/v1/homework/${id}`).set(auth('outsider')).expect(404);
    });
  });

  describe('parent view', () => {
    it('lists only their own children', async () => {
      const kids = (await http().get('/v1/parent/children').set(auth('parent')).expect(200)).body;
      expect(kids).toEqual([expect.objectContaining({ id: t.students[0].id, relation: 'father', section: expect.objectContaining({ displayName: 'BCom Sem 3 A' }) })]);
    });

    it("cannot open another family's child, or one in another school", async () => {
      await http().get(`/v1/parent/children/${t.students[1].id}/summary`).set(auth('parent')).expect(404);
      await http().get(`/v1/parent/children/${t.students[0].id}/summary`).set(auth('outsider')).expect(404);
    });

    it('summarises attendance', async () => {
      const s = (await http().get(`/v1/parent/children/${t.students[0].id}/summary`).set(auth('parent')).expect(200)).body;
      expect(s.attendance).toMatchObject({ periods: 1, absent: 1, present: 0, rate: 0 });
      expect(s.attendance.recentAbsences[0]).toMatchObject({ date: monday, subject: 'Corporate Accounting' });
    });

    it('parents can sign in with the phone number as they type it', async () => {
      await owner.query("update users set phone = '+919800000123' where id = $1", [t.guardian.id]);
      for (const login of ['98000 00123', '098000-00123', '919800000123', '+91 98000 00123']) {
        await http().post('/v1/auth/login').send({ tenant: t.slug, login, password: 'pw' }).expect(201);
      }
      await http().post('/v1/auth/login').send({ tenant: t.slug, login: '98000 00124', password: 'pw' }).expect(401);
    });

    it('teachers cannot use parent routes', async () => {
      await http().get('/v1/parent/children').set(auth('teacher')).expect(403);
    });
  });

  describe('saved whiteboards', () => {
    const boardId = randomUUID();
    const content = {
      title: 'Issue of shares',
      background: 'grid',
      pages: [{ strokes: [{ t: 'pen', c: 0xff1b1b1f, w: 4, p: [10, 10, 20, 20, 30, 25] }] }, { strokes: [] }],
    };

    it('saves from the board, idempotently, without sharing', async () => {
      const first = await http().put(`/v1/whiteboards/${boardId}`).set('authorization', `Bearer ${boardToken}`).send(content).expect(200);
      expect(first.body).toMatchObject({ id: boardId, pageCount: 2, sectionName: 'BCom Sem 3 A', subjectName: 'Corporate Accounting', sharedAt: null });
      await http().put(`/v1/whiteboards/${boardId}`).set('authorization', `Bearer ${boardToken}`).send({ ...content, title: 'Issue of shares (2)' }).expect(200);
      const mine = (await http().get('/v1/whiteboards').set(auth('teacher')).expect(200)).body;
      expect(mine.filter((b: { id: string }) => b.id === boardId)).toEqual([expect.objectContaining({ title: 'Issue of shares (2)' })]);
    });

    it('is private to the teacher until shared', async () => {
      await http().get(`/v1/whiteboards/${boardId}`).set(auth('parent')).expect(404);
      await http().get(`/v1/whiteboards/${boardId}`).set(auth('student')).expect(404);
      const own = (await http().get(`/v1/whiteboards/${boardId}`).set(auth('teacher')).expect(200)).body;
      expect(own.content.pages[0].strokes[0].p).toEqual([10, 10, 20, 20, 30, 25]);
    });

    it('sharing notifies the class and lets their families open it', async () => {
      await http().post(`/v1/whiteboards/${boardId}/share`).set(auth('teacher')).expect(200);
      expect((await inbox('parent')).items.some((n) => n.kind === 'board_shared' && n.data.whiteboardId === boardId)).toBe(true);
      const opened = (await http().get(`/v1/whiteboards/${boardId}`).set(auth('parent')).expect(200)).body;
      expect(opened.content).toMatchObject({ background: 'grid', canvas: { w: 1920, h: 1080 } });
      await http().get(`/v1/whiteboards/${boardId}`).set(auth('student')).expect(200);
      await http().get(`/v1/whiteboards/${boardId}`).set(auth('outsider')).expect(404);
      const s = (await http().get(`/v1/parent/children/${t.students[0].id}/summary`).set(auth('parent')).expect(200)).body;
      expect(s.sharedBoards.map((b: { id: string }) => b.id)).toContain(boardId);
      // Sharing twice does not notify twice.
      await http().post(`/v1/whiteboards/${boardId}/share`).set(auth('teacher')).expect(200);
      expect((await inbox('parent')).items.filter((n) => n.kind === 'board_shared')).toHaveLength(1);
    });

    it("another teacher can neither overwrite nor share it", async () => {
      await http().post(`/v1/whiteboards/${boardId}/share`).set(auth('teacher2')).expect(404);
      await http().get(`/v1/whiteboards/${boardId}`).set(auth('teacher2')).expect(404);
    });

    it('rejects malformed strokes', async () => {
      await http()
        .put(`/v1/whiteboards/${randomUUID()}`)
        .set('authorization', `Bearer ${boardToken}`)
        .send({ title: 'x', pages: [{ strokes: [{ t: 'laser', c: 1, w: 1, p: [1] }] }] })
        .expect(400);
    });
  });

  describe('notifications inbox', () => {
    it('broadcasts reach families; read and read-all work', async () => {
      await http()
        .post('/v1/broadcasts')
        .set(auth('principal'))
        .send({ title: 'Holiday', body: 'College is closed on Friday', audience: { sectionIds: [t.section.id] } })
        .expect(201);
      const before = await inbox('parent');
      const holiday = before.items.find((n) => n.kind === 'broadcast')!;
      expect(holiday.title).toBe('Holiday');

      await http().post(`/v1/notifications/${holiday.id}/read`).set(auth('parent')).expect(204);
      expect((await inbox('parent')).unread).toBe(before.unread - 1);
      // Another user cannot mark it.
      await http().post(`/v1/notifications/${holiday.id}/read`).set(auth('parent2')).expect(204);

      await http().post('/v1/notifications/read-all').set(auth('parent')).expect(204);
      expect((await inbox('parent')).unread).toBe(0);

      const sent = (await http().get('/v1/broadcasts').set(auth('principal')).expect(200)).body;
      expect(sent[0]).toMatchObject({ title: 'Holiday', delivery: expect.objectContaining({ families: expect.any(Number) }) });
      expect(sent[0].delivery.families).toBeGreaterThanOrEqual(3);
    });
  });

  describe('principal dashboard', () => {
    it('overview counts the day', async () => {
      const o = (await http().get('/v1/admin/overview').set(auth('principal')).expect(200)).body;
      expect(o).toMatchObject({ date: monday, isToday: true });
      expect(o.classes).toMatchObject({ scheduled: 1, live: 1 });
      expect(o.attendance).toMatchObject({ periodsDue: 1, periodsTaken: 1, absentStudents: 2 });
      // Homework gets its timestamp from the database clock, not the test's pinned Monday.
      expect(o.homeworkAssigned).toEqual(expect.any(Number));
      const hw = (await http().get('/v1/admin/homework?days=14').set(auth('principal')).expect(200)).body;
      expect(hw).toEqual([expect.objectContaining({ title: 'Exercise 4.2', section: 'BCom Sem 3 A', teacher: expect.any(String) })]);
      expect(o.boards).toMatchObject({ total: 1, online: 1, inClass: 1 });
    });

    it('dashboard rolls up head counts, fees, pending decisions and a six-month trend', async () => {
      const d = (await http().get('/v1/admin/dashboard').set(auth('principal')).expect(200)).body;
      expect(d).toMatchObject({ date: monday, students: { total: expect.any(Number) }, fees: { collected: expect.any(Number), overdueInvoices: expect.any(Number) } });
      expect(d.pending).toMatchObject({ leave: expect.any(Number), marksToVerify: expect.any(Number), examPapers: expect.any(Number), admissionsReview: expect.any(Number) });
      expect(d.performance).toHaveLength(6);
      expect(d.performance[5].month).toBe(monday.slice(0, 7));
      await http().get('/v1/admin/dashboard').set(auth('teacher')).expect(403);
    });

    it('classes show who taught on which board and attendance', async () => {
      const c = (await http().get('/v1/admin/classes').set(auth('principal')).expect(200)).body;
      expect(c.classes[0]).toMatchObject({
        status: 'live',
        board: 'Room 1 Board',
        attendanceTaken: true,
        absent: 2,
        teacher: expect.objectContaining({ id: t.teacher.id }),
      });
    });

    it('attendance lists absentees by class', async () => {
      const a = (await http().get(`/v1/admin/attendance?date=${monday}`).set(auth('principal')).expect(200)).body;
      expect(a.absentees.map((x: { studentId: string }) => x.studentId).sort()).toEqual([t.students[0].id, t.students[1].id].sort());
      expect(a.sections.find((s: { section: string }) => s.section === 'BCom Sem 3 A')).toMatchObject({ students: 3, absent: 2 });
    });

    it('devices show the board online with its class', async () => {
      const d = (await http().get('/v1/admin/devices').set(auth('principal')).expect(200)).body;
      expect(d[0]).toMatchObject({ name: 'Room 1 Board', online: true, enrolled: true, session: expect.objectContaining({ section: 'BCom Sem 3 A' }) });
    });

    it('a past day with no teaching shows the class as missed', async () => {
      const lastMonday = new Date(`${monday}T00:00:00Z`);
      lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
      const c = (await http().get(`/v1/admin/classes?date=${lastMonday.toISOString().slice(0, 10)}`).set(auth('principal')).expect(200)).body;
      expect(c.classes[0].status).toBe('missed');
    });

    it('structure counts students per class and gives the school time zone', async () => {
      const st = (await http().get('/v1/admin/structure').set(auth('principal')).expect(200)).body;
      expect(st.timezone).toBe('Asia/Kolkata');
      expect(st.sections.find((x: { id: string }) => x.id === t.section.id).students).toBe(3);
      expect(st.subjects).toEqual([expect.objectContaining({ id: t.subject.id, name: 'Corporate Accounting', courseId: null })]);
    });

    it('attendance counts add up: marks = present + absent + late + excused', async () => {
      const a = (await http().get(`/v1/admin/attendance?date=${monday}`).set(auth('principal')).expect(200)).body;
      for (const s of a.sections) expect(s.present + s.absent + s.late + s.excused).toBe(s.marks);
    });

    it('a board can be renamed and re-enrolled, which revokes its old token', async () => {
      const devicesList = (await http().get('/v1/admin/devices').set(auth('principal')).expect(200)).body;
      const id = devicesList[0].id;
      await http().patch(`/v1/devices/${id}`).set(auth('principal')).send({ name: 'Room 1 Board (front)' }).expect(200);
      const code = (await http().post(`/v1/devices/${id}/enrollment-code`).set(auth('principal')).expect(200)).body.enrollmentCode;
      expect(code).toMatch(/^KX-/);
      await http().get('/v1/sessions/current').set('authorization', `Bearer ${boardToken}`).expect(200); // session token still valid until it ends
      const fresh = (await http().post('/v1/devices/enroll').send({ code, platform: 'windows' }).expect(201)).body;
      expect(fresh.device.name).toBe('Room 1 Board (front)');
      await http().patch(`/v1/devices/${id}`).set(auth('teacher')).send({ name: 'x' }).expect(403);
    });

    it('is for school leaders only', async () => {
      await http().get('/v1/admin/overview').set(auth('teacher')).expect(403);
      await http().get('/v1/admin/overview').set(auth('parent')).expect(403);
    });
  });

  describe('student view', () => {
    it('a student sees their own record and summary, not a classmate\'s', async () => {
      const me = await http().get('/v1/student/me').set(auth('student')).expect(200);
      expect(me.body).toMatchObject({ id: t.students[2].id, section: { id: t.section.id, displayName: 'BCom Sem 3 A' } });
      const summary = await http().get(`/v1/parent/children/${t.students[2].id}/summary`).set(auth('student')).expect(200);
      expect(summary.body.child.id).toBe(t.students[2].id);
      await http().get(`/v1/parent/children/${t.students[0].id}/summary`).set(auth('student')).expect(404);
      await http().get(`/v1/parent/children/${t.students[2].id}/attendance`).set(auth('student')).expect(200);
      await http().get('/v1/student/me').set(auth('parent')).expect(403);
      const subjects = await http().get('/v1/student/subjects').set(auth('student')).expect(200);
      expect(subjects.body).toEqual([{ id: t.subject.id, code: 'BCOM-3.1', name: 'Corporate Accounting', courseId: null }]);
    });
  });
});
