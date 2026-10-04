import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type LiveViewersEvent, type LiveWatchAck } from '@kinetix/shared';
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

/** Library, marks, messages, timetable editing and live classes for students. */
describe('school life', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const inbox = async (who: string, kind: string) =>
    (await http().get('/v1/notifications').set(auth(who)).expect(200)).body.items.filter((n: { kind: string }) => n.kind === kind);

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
      outsider: await login(other.slug, other.principal.email!),
    };
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await owner.end();
  });

  describe('library', () => {
    it('issues and returns books, fines late returns, and shows the family', async () => {
      const book = (await http().post('/v1/library/books').set(auth('principal')).send({ title: 'Corporate Accounting', author: 'S. N. Maheshwari', copies: 1 }).expect(201)).body;
      await http().post('/v1/library/books').set(auth('teacher')).send({ title: 'x' }).expect(403);
      const loan = (await http().post('/v1/library/loans').set(auth('principal')).send({ bookId: book.id, studentId: t.students[0].id }).expect(201)).body;
      await http().post('/v1/library/loans').set(auth('principal')).send({ bookId: book.id, studentId: t.students[1].id }).expect(400); // only copy is out

      const mine = (await http().get(`/v1/library/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body;
      expect(mine.current).toEqual([expect.objectContaining({ id: loan.id, book: expect.objectContaining({ title: 'Corporate Accounting' }), overdue: false })]);
      await http().get(`/v1/library/students/${t.students[0].id}`).set(auth('parent2')).expect(404);
      expect((await inbox('parent', 'library'))[0].title).toBe('Library book borrowed: Corporate Accounting');

      // Returned 3 days late: ₹2 a day.
      await owner.query(`update library_loans set due_on = due_on - 17 where id = $1`, [loan.id]);
      const overdue = (await http().get('/v1/library/loans?overdue=true').set(auth('principal')).expect(200)).body;
      expect(overdue).toEqual([expect.objectContaining({ id: loan.id, fineSoFarPaise: 600 })]);
      const back = (await http().post(`/v1/library/loans/${loan.id}/return`).set(auth('principal')).expect(200)).body;
      expect(back.finePaise).toBe(600);
      const after = (await http().get(`/v1/library/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body;
      expect(after).toMatchObject({ current: [], finesPaise: 600 });
      expect((await http().get('/v1/library/fines').set(auth('principal')).expect(200)).body.map((f: { id: string }) => f.id)).toEqual([loan.id]);
      await http().post(`/v1/library/loans/${loan.id}/fine-paid`).set(auth('principal')).expect(200);
      expect((await http().get('/v1/library/fines').set(auth('principal')).expect(200)).body).toEqual([]);
      expect((await http().get(`/v1/library/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body.finesPaise).toBe(0);
      const found = (await http().get('/v1/library/students?q=student b').set(auth('principal')).expect(200)).body;
      expect(found).toEqual([expect.objectContaining({ id: t.students[1].id, className: 'BCom Sem 3 A' })]);
      await http().get('/v1/library/students?q=student').set(auth('parent')).expect(403);
      expect((await http().get('/v1/library/books?q=maheshwari').set(auth('principal')).expect(200)).body[0]).toMatchObject({ copies: 1, onLoan: 0 });
    });
  });

  describe('marks', () => {
    it('lets the class teacher enter and publish marks that families then see with the class average', async () => {
      const body = { sectionId: t.section.id, subjectId: t.subject.id, title: 'Unit test 1', kind: 'test', maxMarks: 25, heldOn: monday };
      await http().post('/v1/assessments').set(auth('teacher2')).send(body).expect(403); // does not teach this class
      const a = (await http().post('/v1/assessments').set(auth('teacher')).send(body).expect(201)).body;
      expect(a.students).toHaveLength(3);
      await http().post(`/v1/assessments/${a.id}/publish`).set(auth('teacher')).expect(400); // nothing entered

      await http().put(`/v1/assessments/${a.id}/marks`).set(auth('teacher')).send({ entries: [{ studentId: t.students[0].id, marks: 30 }] }).expect(400);
      await http().put(`/v1/assessments/${a.id}/marks`).set(auth('teacher')).send({ entries: [{ studentId: other.students[0].id, marks: 3 }] }).expect(400);
      const entered = (
        await http()
          .put(`/v1/assessments/${a.id}/marks`)
          .set(auth('teacher'))
          .send({
            entries: [
              { studentId: t.students[0].id, marks: 18.5 },
              { studentId: t.students[1].id, marks: 22 },
              { studentId: t.students[2].id, marks: null, absent: true },
            ],
          })
          .expect(200)
      ).body;
      expect(entered.stats).toEqual({ count: 2, average: 20.3, highest: 22, lowest: 18.5 });
      expect((await http().get(`/v1/assessments?sectionId=${t.section.id}`).set(auth('teacher')).expect(200)).body[0]).toMatchObject({ entered: 3, classSize: 3, average: 20.3 });

      expect((await http().get(`/v1/marks/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body.assessments).toEqual([]); // not published yet
      await http().post(`/v1/assessments/${a.id}/publish`).set(auth('teacher')).expect(200);
      const forParent = (await http().get(`/v1/marks/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body;
      expect(forParent.assessments[0]).toMatchObject({ title: 'Unit test 1', marks: 18.5, maxMarks: 25, classAverage: 20.3, classHighest: 22, subject: 'Corporate Accounting' });
      expect(forParent.subjects).toEqual([{ subject: 'Corporate Accounting', percent: 74 }]);
      expect((await http().get(`/v1/marks/students/${t.students[2].id}`).set(auth('student')).expect(200)).body.assessments[0]).toMatchObject({ absent: true, marks: null });
      await http().get(`/v1/marks/students/${t.students[0].id}`).set(auth('student')).expect(404);
      expect((await inbox('parent', 'marks'))[0].title).toBe('Marks published: Corporate Accounting');
    });
  });

  describe('messages', () => {
    it("lets a parent write to their child's teacher, and the teacher reply", async () => {
      const contacts = (await http().get('/v1/conversations/contacts').set(auth('parent')).expect(200)).body;
      expect(contacts.asFamily[0]).toMatchObject({ student: { id: t.students[0].id }, staff: [expect.objectContaining({ id: t.teacher.id, subjects: ['Corporate Accounting'] })] });

      await http().post('/v1/conversations').set(auth('parent')).send({ studentId: t.students[0].id, withUserId: t.teacher2.id }).expect(403); // not their teacher
      await http().post('/v1/conversations').set(auth('parent')).send({ studentId: t.students[1].id, withUserId: t.teacher.id }).expect(404); // not their child
      const c = (await http().post('/v1/conversations').set(auth('parent')).send({ studentId: t.students[0].id, withUserId: t.teacher.id }).expect(201)).body;
      const again = (await http().post('/v1/conversations').set(auth('parent')).send({ studentId: t.students[0].id, withUserId: t.teacher.id }).expect(201)).body;
      expect(again.id).toBe(c.id);

      await http().post(`/v1/conversations/${c.id}/messages`).set(auth('parent')).send({ body: 'Aarav was unwell on Monday; he will submit the homework tomorrow.' }).expect(201);
      expect((await inbox('teacher', 'message'))[0]).toMatchObject({ title: `Message from ${t.guardian.fullName}` });
      const teacherList = (await http().get('/v1/conversations').set(auth('teacher')).expect(200)).body;
      expect(teacherList[0]).toMatchObject({ id: c.id, unread: 1, lastMessage: expect.stringContaining('unwell') });

      await http().post(`/v1/conversations/${c.id}/messages`).set(auth('teacher')).send({ body: 'Thank you for letting me know.' }).expect(201);
      await http().post(`/v1/conversations/${c.id}/read`).set(auth('teacher')).expect(204);
      expect((await http().get('/v1/conversations').set(auth('teacher')).expect(200)).body[0].unread).toBe(0);
      const thread = (await http().get(`/v1/conversations/${c.id}/messages`).set(auth('parent')).expect(200)).body;
      expect(thread.messages.map((m: { body: string }) => m.body)).toEqual(['Aarav was unwell on Monday; he will submit the homework tomorrow.', 'Thank you for letting me know.']);
      expect(thread.conversation.unread).toBe(1);

      await http().get(`/v1/conversations/${c.id}/messages`).set(auth('parent2')).expect(404);
      await http().post(`/v1/conversations/${c.id}/messages`).set(auth('principal')).send({ body: 'x' }).expect(404);
      const all = (await http().get('/v1/conversations?all=true').set(auth('principal')).expect(200)).body;
      expect(all.find((x: { id: string }) => x.id === c.id)).toMatchObject({ lastMessage: null });
      await http().get('/v1/conversations?all=true').set(auth('teacher')).expect(403);
      await http().get(`/v1/conversations/${c.id}/messages`).set(auth('principal')).expect(200); // audited read
      const { rows } = await owner.query(`select count(*)::int as n from audit_log where action = 'conversation.read_by_leader' and tenant_id = $1`, [t.tenantId]);
      expect(rows[0].n).toBe(1);
      // Staff find the families of their classes to start a thread.
      const staffContacts = (await http().get(`/v1/conversations/contacts?sectionId=${t.section.id}`).set(auth('teacher')).expect(200)).body;
      expect(staffContacts.asStaff.find((x: { student: { id: string } }) => x.student.id === t.students[1].id).guardians).toEqual([
        { id: t.guardian2.id, fullName: t.guardian2.fullName, relation: 'mother' },
      ]);
      await http().post('/v1/conversations').set(auth('teacher')).send({ studentId: t.students[1].id, withUserId: t.guardian2.id }).expect(201);
      expect((await http().get('/v1/conversations/contacts').set(auth('teacher2')).expect(200)).body.asStaff).toEqual([]);
      // An adult student at a college can write for themselves.
      const own = await http().post('/v1/conversations').set(auth('student')).send({ studentId: t.students[2].id, withUserId: t.teacher.id }).expect(201);
      expect(own.body.family.id).toBe(t.studentUser.id);
    });
  });

  describe('timetable editing', () => {
    it('adds, moves and removes periods with clash checks, keeping history', async () => {
      const slot = { sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, roomId: t.room.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '09:55' };
      await http().post('/v1/admin/timetable/slots').set(auth('teacher')).send(slot).expect(403);
      const added = (await http().post('/v1/admin/timetable/slots').set(auth('principal')).send(slot).expect(201)).body;
      expect(added).toMatchObject({ dayOfWeek: 2, startsAt: '09:00:00', section: { displayName: 'BCom Sem 3 A' }, teacher: { id: t.teacher.id } });

      const clash = await http().post('/v1/admin/timetable/slots').set(auth('principal')).send({ ...slot, sectionId: t.otherSection.id, startsAt: '09:30', endsAt: '10:25' }).expect(409);
      expect(clash.body.message).toBe('This teacher is already teaching at 09:00–09:55 that day');
      await http().post('/v1/admin/timetable/slots').set(auth('principal')).send({ ...slot, endsAt: '08:00' }).expect(400);

      const moved = (await http().patch(`/v1/admin/timetable/slots/${added.id}`).set(auth('principal')).send({ ...slot, startsAt: '11:00', endsAt: '11:55' }).expect(200)).body;
      expect(moved.id).not.toBe(added.id);
      const week = (await http().get(`/v1/admin/timetable?sectionId=${t.section.id}`).set(auth('principal')).expect(200)).body;
      expect(week.map((s: { dayOfWeek: number; startsAt: string }) => `${s.dayOfWeek} ${s.startsAt}`)).toEqual(['1 10:00:00', '2 11:00:00']);
      await http().delete(`/v1/admin/timetable/slots/${moved.id}`).set(auth('principal')).expect(204);
      await http().delete(`/v1/admin/timetable/slots/${moved.id}`).set(auth('principal')).expect(404);
      const { rows } = await owner.query(`select count(*)::int as n from timetable_slots where tenant_id = $1 and archived_at is not null`, [t.tenantId]);
      expect(rows[0].n).toBe(2);
      expect((await http().get('/v1/admin/staff').set(auth('principal')).expect(200)).body.map((s: { id: string }) => s.id)).toContain(t.teacher.id);
    });
  });

  describe('live class for students', () => {
    it('lets students of the class watch once the teacher goes live, and sends them away when it stops', async () => {
      const paired = await pairBoard(app, t, tokens.teacher);
      const board = paired.socket;
      sockets.push(board);
      const url = (await app.getUrl()).replace('[::1]', 'localhost');
      const student = io(`${url}/realtime`, { auth: { token: tokens.student }, transports: ['websocket'] });
      sockets.push(student);
      await next(student, 'ready');
      const watch = () => student.emitWithAck(RealtimeEvents.LiveWatch, { deviceId: t.device.id }) as Promise<LiveWatchAck>;

      expect((await http().get('/v1/student/live').set(auth('student')).expect(200)).body).toEqual({ live: null });
      expect(await watch()).toEqual({ ok: false, error: 'Your teacher has not started a live class' });

      await http().post('/v1/sessions/current/live').set('authorization', `Bearer ${paired.boardToken}`).send({ on: true }).expect(200);
      expect((await http().get('/v1/student/live').set(auth('student')).expect(200)).body.live).toMatchObject({ deviceId: t.device.id, subject: 'Corporate Accounting' });
      expect((await inbox('student', 'live'))[0].title).toBe('Live now: Corporate Accounting');
      expect(await inbox('parent', 'live')).toEqual([]); // students only

      const viewers = next<LiveViewersEvent>(board, RealtimeEvents.LiveViewers);
      expect((await watch()).ok).toBe(true);
      expect(await viewers).toMatchObject({ count: 1, leaders: 0, students: 1 });

      const parentSocket = io(`${url}/realtime`, { auth: { token: tokens.parent }, transports: ['websocket'] });
      sockets.push(parentSocket);
      await new Promise((r) => parentSocket.once('disconnect', r)); // families cannot watch

      const ended = next<{ reason: string }>(student, RealtimeEvents.LiveEnded);
      const stopped = next<LiveViewersEvent>(board, RealtimeEvents.LiveViewers);
      await http().post('/v1/sessions/current/live').set('authorization', `Bearer ${paired.boardToken}`).send({ on: false }).expect(200);
      expect((await ended).reason).toBe('live_off');
      expect((await stopped).count).toBe(0);
    });
  });
});
