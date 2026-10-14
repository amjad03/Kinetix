import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnnouncementsService } from '../src/announcements/announcements.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** A tiny real PDF and PNG (the upload checks magic numbers). */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

describe('Communication: announcements to boards and apps, and two-way family chat', () => {
  const owner = ownerPool();
  // Tuesday 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await owner.query(text, params)).rows as T[];
  const send = (who: string, body: Record<string, unknown>) => http().post('/v1/announcements').set(as(who)).send({ title: 'Notice', body: 'Hello **all**', ...body });

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.parent = await login(t.slug, t.guardian.email!);
    tok.parent2 = await login(t.slug, t.guardian2.email!);
    tok.student = await login(t.slug, t.studentUser.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    tok.outsiderParent = await login(other.slug, other.guardian.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('announcements', () => {
    it('resolves a class audience per channel and previews the counts', async () => {
      const preview = (await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['teacher', 'student', 'parent'], audience: { scope: 'sections', sectionIds: [t.section.id] } }).expect(200)).body;
      // Teacher of the class (timetable), student C's own account, and the two guardians.
      expect(preview).toMatchObject({ teacher: 1, student: 1, parent: 2, people: 4 });
      const other = (await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['teacher', 'student', 'parent'], audience: { scope: 'sections', sectionIds: [t.otherSection.id] } }).expect(200)).body;
      expect(other).toMatchObject({ teacher: 0, student: 0, parent: 0 });
      // A class teacher counts as staff of the class.
      await owner.query('update sections set class_teacher_id = $1 where id = $2', [t.teacher2.id, t.otherSection.id]);
      expect((await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['teacher'], audience: { scope: 'sections', sectionIds: [t.otherSection.id] } }).expect(200)).body.teacher).toBe(1);
      await owner.query('update sections set class_teacher_id = null where id = $1', [t.otherSection.id]);
      await http().post('/v1/announcements/preview').set(as('teacher')).send({ channels: ['teacher'], audience: { scope: 'all' } }).expect(403);
      await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['teacher'], audience: { scope: 'sections' } }).expect(400);
    });

    it('resolves departments, programs and picked individuals', async () => {
      const [dept] = await q<{ id: string }>(`insert into departments (tenant_id, name) values ($1, 'Commerce') returning id`, [t.tenantId]);
      await owner.query('insert into department_staff (tenant_id, department_id, user_id) values ($1, $2, $3)', [t.tenantId, dept.id, t.teacher2.id]);
      await owner.query('update subjects set department_id = $1 where id = $2', [dept.id, t.subject.id]);
      const byDept = (await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['teacher', 'parent'], audience: { scope: 'departments', departmentIds: [dept.id] } }).expect(200)).body;
      expect(byDept).toMatchObject({ teacher: 1, parent: 2 });
      const byProgram = (await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['student', 'parent'], audience: { scope: 'programs', programIds: [t.program.id] } }).expect(200)).body;
      expect(byProgram).toMatchObject({ student: 1, parent: 2 });
      // Individuals: a picked parent, a picked student record (→ their guardian), and a picked teacher not on the teacher channel.
      const people = (await http().post('/v1/announcements/preview').set(as('principal')).send({ channels: ['parent'], audience: { scope: 'people', userIds: [t.guardian.id, t.teacher.id], studentIds: [t.students[1].id] } }).expect(200)).body;
      expect(people).toMatchObject({ parent: 2, teacher: 0, people: 2 });
      const found = (await http().get('/v1/announcements/people?q=parent').set(as('principal')).expect(200)).body;
      expect(found.users.map((u: { id: string; kind: string }) => [u.id, u.kind])).toContainEqual([t.guardian.id, 'parent']);
      // Ids from another institution reach nobody.
      await send('principal', { channels: ['parent'], audience: { scope: 'people', userIds: [other.guardian.id] } }).expect(400);
    });

    let important: string;
    it('fans out to boards and apps; important ones are pushed and pinned', async () => {
      const res = (
        await send('principal', {
          title: 'School closed tomorrow',
          body: 'Due to heavy rain the campus is **closed**.\n- Online classes as usual\n- See [details](https://example.com/rain)',
          priority: 'important',
          requiresAck: true,
          channels: ['boards', 'teacher', 'student', 'parent'],
          audience: { scope: 'all' },
          attachments: [{ filename: 'circular.pdf', contentType: 'application/pdf', contentBase64: PDF }],
          expiresAt: new Date(clock.now().getTime() + 2 * 86400_000).toISOString(),
        }).expect(201)
      ).body;
      important = res.id;
      expect(res).toMatchObject({ status: 'sent', priority: 'important', stats: { recipients: expect.any(Number), delivered: 0, read: 0 } });
      expect(res.stats.byChannel.parent.recipients).toBe(2);
      expect(res.stats.byChannel.student.recipients).toBe(1);
      expect(res.stats.byChannel.teacher.recipients).toBeGreaterThanOrEqual(3);
      // The board broadcast went out in plain text, without a second family notification.
      const [b] = await q<{ body: string; priority: string }>('select b.body, b.priority from broadcasts b join announcements a on a.broadcast_id = b.id where a.id = $1', [important]);
      expect(b).toMatchObject({ priority: 'important', body: expect.stringContaining('closed') });
      expect(b.body).not.toContain('**');
      expect(res.stats.boards).toMatchObject({ boards: 1, active: true });
      expect(await q(`select 1 from notifications where dedupe_key like 'broadcast:%' and tenant_id = $1`, [t.tenantId])).toEqual([]);
      const pushed = await q<{ user_id: string }>(`select user_id from notifications where dedupe_key = $1`, [`announcement:${important}`]);
      expect(pushed.map((r) => r.user_id)).toEqual(expect.arrayContaining([t.guardian.id, t.guardian2.id, t.studentUser.id, t.teacher.id]));

      // A normal message is in the inbox but not pushed.
      const normal = (await send('principal', { title: 'Library timings', channels: ['parent'], audience: { scope: 'sections', sectionIds: [t.section.id] } }).expect(201)).body;
      expect(await q(`select 1 from notifications where dedupe_key = $1`, [`announcement:${normal.id}`])).toEqual([]);

      const inbox = (await http().get('/v1/announcements/inbox?app=parent').set(as('parent')).expect(200)).body;
      expect(inbox).toMatchObject({ unread: 2, pinned: 1 });
      expect(inbox.items[0]).toMatchObject({ id: important, pinned: true, canAcknowledge: true, attachments: [{ name: 'circular.pdf', type: 'application/pdf' }] });
      expect(inbox.items[0].attachments[0].key).toBeUndefined();
      // The teacher app shows staff messages; the student app the student's.
      expect((await http().get('/v1/announcements/inbox?app=teacher').set(as('teacher')).expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([important]);
      expect((await http().get('/v1/announcements/inbox?app=student').set(as('student')).expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([important]);
      expect((await http().get('/v1/announcements/inbox?app=student').set(as('parent')).expect(200)).body.items).toEqual([]);
      await http().get('/v1/announcements/inbox?app=board').set(as('parent')).expect(400);

      const file = await http().get(`/v1/announcements/inbox/${important}/attachments/${inbox.items[0].attachments[0].id}`).set(as('parent')).expect(200);
      expect(file.headers['content-type']).toContain('application/pdf');
      await http().get(`/v1/announcements/inbox/${normal.id}`).set(as('parent2')).expect(200);
      await http().get(`/v1/announcements/inbox/${important}`).set(as('outsiderParent')).expect(404);
      await http().get(`/v1/announcements/inbox/${important}/attachments/${inbox.items[0].attachments[0].id}`).set(as('outsiderParent')).expect(404);
    });

    it('tracks delivery, reads and acknowledgements, lists who has not read, and reminds them', async () => {
      await http().post(`/v1/announcements/inbox/${important}/read`).set(as('parent')).expect(200);
      const acked = (await http().post(`/v1/announcements/inbox/${important}/ack`).set(as('parent')).expect(200)).body;
      expect(acked).toMatchObject({ pinned: false, acknowledgedAt: expect.any(String), readAt: expect.any(String) });
      const [n] = await q<{ read_at: Date | null }>('select read_at from notifications where dedupe_key = $1 and user_id = $2', [`announcement:${important}`, t.guardian.id]);
      expect(n.read_at).not.toBeNull();
      await http().post(`/v1/announcements/inbox/${important}/read`).set(as('student')).expect(200);

      const d = (await http().get(`/v1/announcements/${important}`).set(as('principal')).expect(200)).body;
      expect(d.stats.byChannel.parent).toEqual({ recipients: 2, delivered: 1, read: 1, acknowledged: 1 });
      expect(d.stats.byChannel.student).toMatchObject({ delivered: 1, read: 1, acknowledged: 0 });
      expect(d.stats.read).toBe(2);
      expect(d.stats.readPct).toBe(Math.floor((200) / d.stats.recipients));

      const unread = (await http().get(`/v1/announcements/${important}/recipients?filter=unread&channel=parent`).set(as('principal')).expect(200)).body;
      expect(unread).toEqual([expect.objectContaining({ userId: t.guardian2.id, detail: 'Student B (BCom Sem 3 A)', readAt: null })]);

      // Reminding goes to everyone who has not acknowledged (it requires acknowledgement).
      const r = (await http().post(`/v1/announcements/${important}/remind`).set(as('principal')).expect(200)).body;
      expect(r.reminded).toBe(d.stats.recipients - 1);
      const reminded = await q<{ user_id: string; title: string }>('select user_id, title from notifications where dedupe_key = $1', [`announcement-remind:${important}`]);
      expect(reminded.map((x) => x.user_id)).not.toContain(t.guardian.id);
      expect(reminded[0].title).toBe('Reminder: School closed tomorrow');
      await http().post(`/v1/announcements/${important}/remind`).set(as('principal')).expect(409); // too soon
      expect(await q(`select 1 from audit_log where action = 'announcement.reminded' and subject_id = $1`, [important])).toHaveLength(1);
      expect(await q(`select 1 from audit_log where action = 'announcement.acknowledged' and actor_id = $1`, [t.guardian.id])).toHaveLength(1);
    });

    it('saves drafts, schedules, edits before sending, then sends when due', async () => {
      const draft = (await send('principal', { mode: 'draft', channels: ['parent'], audience: { scope: 'all' } }).expect(201)).body;
      expect(draft).toMatchObject({ status: 'draft', stats: { recipients: 0 } });
      const edited = (await http().patch(`/v1/announcements/${draft.id}`).set(as('principal')).send({ title: 'PTM on Saturday', body: 'Please attend.', channels: ['parent'], audience: { scope: 'all' }, mode: 'draft' }).expect(200)).body;
      expect(edited.title).toBe('PTM on Saturday');
      const sent = (await http().post(`/v1/announcements/${draft.id}/send`).set(as('principal')).expect(200)).body;
      expect(sent).toMatchObject({ status: 'sent', stats: { recipients: 2 } });
      await http().patch(`/v1/announcements/${draft.id}`).set(as('principal')).send({ title: 'x', body: 'y', channels: ['parent'], audience: { scope: 'all' } }).expect(409);

      const at = new Date(clock.now().getTime() + 3600_000).toISOString();
      const sch = (await send('principal', { title: 'Sports day', sendAt: at, channels: ['student'], audience: { scope: 'all' } }).expect(201)).body;
      expect(sch).toMatchObject({ status: 'scheduled', stats: { recipients: 0 } });
      expect(await q(`select 1 from jobs where kind = 'announcements.send' and payload->>'id' = $1`, [sch.id])).toHaveLength(1);
      await http().patch(`/v1/announcements/${sch.id}`).set(as('principal')).send({ title: 'Sports day moved', body: 'Now on Friday.', sendAt: at, channels: ['student', 'parent'], audience: { scope: 'all' } }).expect(200);
      const svc = app.get(AnnouncementsService);
      expect(await svc.sendDue(t.tenantId)).toBe(0); // not yet
      const before = clock.at;
      clock.at = new Date(clock.now().getTime() + 3601_000);
      expect(await svc.sendDue(t.tenantId)).toBe(1);
      clock.at = before;
      const done = (await http().get(`/v1/announcements/${sch.id}`).set(as('principal')).expect(200)).body;
      expect(done).toMatchObject({ status: 'sent', title: 'Sports day moved', stats: { byChannel: { student: { recipients: 1 }, parent: { recipients: 2 } } } });
      await send('principal', { sendAt: at, expiresAt: at, channels: ['student'], audience: { scope: 'all' } }).expect(400); // expires before it goes out
    });

    it('recalls, duplicates and deletes, and keeps institutions apart', async () => {
      const copy = (await http().post(`/v1/announcements/${important}/duplicate`).set(as('principal')).expect(201)).body;
      expect(copy).toMatchObject({ status: 'draft', title: 'School closed tomorrow', attachments: [{ name: 'circular.pdf' }] });
      await http().delete(`/v1/announcements/${important}`).set(as('principal')).expect(409);
      const recalled = (await http().post(`/v1/announcements/${important}/recall`).set(as('principal')).expect(200)).body;
      expect(recalled.status).toBe('recalled');
      expect(recalled.stats.boards.active).toBe(false);
      expect((await http().get('/v1/announcements/inbox?app=parent').set(as('parent2')).expect(200)).body.items.map((i: { id: string }) => i.id)).not.toContain(important);
      const [n] = await q<{ retracted_at: Date | null }>('select retracted_at from notifications where dedupe_key = $1 and user_id = $2', [`announcement:${important}`, t.guardian2.id]);
      expect(n.retracted_at).not.toBeNull();
      await http().delete(`/v1/announcements/${copy.id}`).set(as('principal')).expect(204);
      await http().get(`/v1/announcements/${important}`).set(as('outsider')).expect(404);
      expect((await http().get('/v1/announcements').set(as('outsider')).expect(200)).body).toEqual([]);
      const list = (await http().get('/v1/announcements?status=sent').set(as('principal')).expect(200)).body;
      expect(list.every((a: { status: string }) => a.status === 'sent')).toBe(true);
      await http().get('/v1/announcements').set(as('teacher')).expect(403);
    });

    it('offers built-in and saved templates', async () => {
      const mine = (await http().post('/v1/announcements/templates').set(as('principal')).send({ name: 'Bus delay', title: 'Bus running late', body: 'Route <n> is late by <m> minutes.', channels: ['parent'] }).expect(201)).body;
      const list = (await http().get('/v1/announcements/templates').set(as('principal')).expect(200)).body;
      expect(list[0]).toMatchObject({ id: mine.id, builtIn: false });
      expect(list.find((x: { id: string }) => x.id === 'builtin:ptm')).toMatchObject({ builtIn: true, requiresAck: true });
      await http().post('/v1/announcements/templates').set(as('principal')).send({ name: 'x', title: 'x', body: '[bad](javascript:alert(1))' }).expect(400);
      await http().delete(`/v1/announcements/templates/${mine.id}`).set(as('principal')).expect(204);
    });
  });

  describe('family chat', () => {
    let office: string;
    it('offers the class teacher, subject teachers and the office to a parent', async () => {
      await http().put(`/v1/conversations/class-teachers/${t.section.id}`).set(as('principal')).send({ userId: t.teacher2.id }).expect(200);
      await http().put(`/v1/conversations/class-teachers/${t.section.id}`).set(as('teacher')).send({ userId: t.teacher2.id }).expect(403);
      const c = (await http().get('/v1/conversations/contacts').set(as('parent')).expect(200)).body;
      expect(c.asFamily[0]).toMatchObject({ office: true, staff: [{ id: t.teacher2.id, classTeacher: true }, { id: t.teacher.id, classTeacher: false, subjects: ['Corporate Accounting'] }] });
      // The class teacher may be written to even without a timetable slot.
      await http().post('/v1/conversations').set(as('parent')).send({ studentId: t.students[0].id, withUserId: t.teacher2.id }).expect(201);
      await http().post('/v1/conversations').set(as('parent')).send({ studentId: t.students[1].id, office: true }).expect(404); // not their child
    });

    it('runs an office thread with ticks, office hours and safeguarding reads', async () => {
      await http().put('/v1/conversations/settings').set(as('principal')).send({ officeHours: { start: '11:00', end: '17:00', days: [1, 2, 3, 4, 5] } }).expect(200);
      await http().put('/v1/conversations/settings').set(as('principal')).send({ officeHours: { start: '17:00', end: '11:00', days: [1] } }).expect(400);
      const c = (await http().post('/v1/conversations').set(as('parent')).send({ studentId: t.students[0].id, office: true }).expect(201)).body;
      office = c.id;
      expect(c).toMatchObject({ kind: 'office', status: 'open', staff: { id: t.principal.id } });
      const again = (await http().post('/v1/conversations').set(as('parent')).send({ studentId: t.students[0].id, office: true }).expect(201)).body;
      expect(again.id).toBe(office);

      // 10:00 is before office hours: the parent is told when to expect a reply.
      const m = (await http().post(`/v1/conversations/${office}/messages`).set(as('parent')).send({ body: 'Need a bonafide certificate', attachment: { filename: 'id.png', contentType: 'image/png', contentBase64: PNG } }).expect(201)).body;
      expect(m).toMatchObject({ status: 'sent', afterHours: true, officeHours: { start: '11:00', end: '17:00' }, attachment: { name: 'id.png' } });
      await http().post(`/v1/conversations/${office}/messages`).set(as('parent')).send({ body: '', attachment: { filename: 'x.txt', contentType: 'text/plain', contentBase64: 'aGk=' } }).expect(400);
      const thread = () => http().get(`/v1/conversations/${office}/messages`).set(as('parent')).expect(200);
      expect((await thread()).body).toMatchObject({ afterHours: true, canWrite: true, messages: [{ status: 'sent' }] });

      // Office staff (principals by default) see it; listing marks it delivered, reading marks it read.
      const list = (await http().get('/v1/conversations?status=open').set(as('principal')).expect(200)).body;
      expect(list.find((x: { id: string }) => x.id === office)).toMatchObject({ unread: 1, side: 'staff', lastMessage: 'Need a bonafide certificate' });
      expect((await thread()).body.messages[0].status).toBe('delivered');
      await http().post(`/v1/conversations/${office}/read`).set(as('principal')).expect(204);
      expect((await thread()).body.messages[0].status).toBe('read');
      const file = await http().get(`/v1/conversations/${office}/messages/${m.id}/attachment`).set(as('principal')).expect(200);
      expect(file.headers['content-type']).toContain('image/png');
      await http().get(`/v1/conversations/${office}/messages/${m.id}/attachment`).set(as('parent2')).expect(404);

      clock.at = new Date(clock.at.getTime() + 60_000);
      await http().post(`/v1/conversations/${office}/messages`).set(as('principal')).send({ body: 'It will be ready tomorrow.' }).expect(201);
      expect((await http().get('/v1/conversations/unread').set(as('parent')).expect(200)).body).toMatchObject({ unread: 1, threads: 1 });
      const [n] = await q<{ title: string }>(`select title from notifications where user_id = $1 and kind = 'message' order by created_at desc limit 1`, [t.guardian.id]);
      expect(n.title).toBe(`Message from ${t.principal.fullName}`);

      // Office staff find a student's family to start a thread; teachers of other classes cannot.
      const fam = (await http().get(`/v1/conversations/families/${t.students[1].id}`).set(as('principal')).expect(200)).body;
      expect(fam).toMatchObject({ office: true, people: [{ id: t.guardian2.id, relation: 'mother' }] });
      await http().get(`/v1/conversations/families/${t.students[1].id}`).set(as('outsider')).expect(404);

      // Other tenants and other parents see nothing.
      await http().get(`/v1/conversations/${office}/messages`).set(as('outsider')).expect(404);
      await http().get(`/v1/conversations/${office}/messages`).set(as('parent2')).expect(404);
      await http().post(`/v1/conversations/${office}/messages`).set(as('teacher')).send({ body: 'x' }).expect(404);
    });

    it('lets staff close, reopen, resolve, mute and reassign threads', async () => {
      const c = (await http().post('/v1/conversations').set(as('parent')).send({ studentId: t.students[0].id, withUserId: t.teacher.id }).expect(201)).body;
      await http().post(`/v1/conversations/${c.id}/status`).set(as('parent')).send({ status: 'closed' }).expect(404);
      await http().post(`/v1/conversations/${c.id}/status`).set(as('teacher')).send({ status: 'closed' }).expect(200);
      await http().post(`/v1/conversations/${c.id}/messages`).set(as('parent')).send({ body: 'Hello?' }).expect(409);
      expect((await http().get(`/v1/conversations/${c.id}/messages`).set(as('parent')).expect(200)).body).toMatchObject({ canWrite: false, messages: [{ kind: 'system', body: `Closed by ${t.teacher.fullName}`, status: null }] });
      await http().post(`/v1/conversations/${c.id}/status`).set(as('teacher')).send({ status: 'resolved' }).expect(200);
      // A family message reopens a resolved thread.
      await http().post(`/v1/conversations/${c.id}/messages`).set(as('parent')).send({ body: 'One more question' }).expect(201);
      expect((await http().get('/v1/conversations?status=open').set(as('teacher')).expect(200)).body.map((x: { id: string }) => x.id)).toContain(c.id);

      // Muted: no notification for the teacher.
      await http().post(`/v1/conversations/${c.id}/mute`).set(as('teacher')).send({ muted: true }).expect(200);
      const before = await q(`select 1 from notifications where user_id = $1 and kind = 'message'`, [t.teacher.id]);
      await http().post(`/v1/conversations/${c.id}/messages`).set(as('parent')).send({ body: 'Muted?' }).expect(201);
      expect(await q(`select 1 from notifications where user_id = $1 and kind = 'message'`, [t.teacher.id])).toHaveLength(before.length);

      // Reassigning hands the thread over: the old teacher loses it, the new one is told.
      await http().post(`/v1/conversations/${c.id}/assign`).set(as('teacher')).send({ userId: t.guardian2.id }).expect(400); // not staff
      await http().post(`/v1/conversations/${c.id}/assign`).set(as('teacher')).send({ userId: t.teacher2.id }).expect(409); // already has a thread with teacher2
      const c2 = (await http().post('/v1/conversations').set(as('parent2')).send({ studentId: t.students[1].id, withUserId: t.teacher.id }).expect(201)).body;
      const moved = (await http().post(`/v1/conversations/${c2.id}/assign`).set(as('teacher')).send({ userId: t.teacher2.id }).expect(200)).body;
      expect(moved.staff.id).toBe(t.teacher2.id);
      await http().get(`/v1/conversations/${c2.id}/messages`).set(as('teacher')).expect(404);
      expect((await http().get(`/v1/conversations/${c2.id}/messages`).set(as('teacher2')).expect(200)).body.messages.at(-1).body).toBe(`Assigned to ${t.teacher2.fullName} by ${t.teacher.fullName}`);
      expect(await q(`select 1 from notifications where user_id = $1 and data->>'conversationId' = $2`, [t.teacher2.id, c2.id])).toHaveLength(1);
      expect(await q(`select action from audit_log where subject_id = $1 order by id`, [c.id])).toEqual(
        expect.arrayContaining([{ action: 'conversation.closed' }, { action: 'conversation.resolved' }, { action: 'conversation.muted' }]),
      );

      // Leaders can read any thread for safeguarding (audited) but not write in it.
      const all = (await http().get('/v1/conversations?all=true').set(as('principal')).expect(200)).body;
      expect(all.find((x: { id: string }) => x.id === c.id)).toMatchObject({ side: 'leader', lastMessage: null });
      await http().get('/v1/conversations?all=true').set(as('teacher')).expect(403);
      await http().get(`/v1/conversations/${c.id}/messages`).set(as('principal')).expect(200);
      await http().post(`/v1/conversations/${c.id}/messages`).set(as('principal')).send({ body: 'x' }).expect(404);
      expect(await q(`select 1 from audit_log where action = 'conversation.read_by_leader' and subject_id = $1`, [c.id])).toHaveLength(1);
      // Search and class filters.
      expect((await http().get(`/v1/conversations?q=Student%20B`).set(as('teacher2')).expect(200)).body.map((x: { id: string }) => x.id)).toEqual([c2.id]);
      expect((await http().get(`/v1/conversations?sectionId=${t.otherSection.id}`).set(as('teacher2')).expect(200)).body).toEqual([]);
    });

    it('lets students chat only with their own teachers, and only when the institution allows it', async () => {
      // College: on by default.
      const own = (await http().post('/v1/conversations').set(as('student')).send({ studentId: t.students[2].id, withUserId: t.teacher.id }).expect(201)).body;
      expect(own.family.id).toBe(t.studentUser.id);
      await http().post('/v1/conversations').set(as('student')).send({ studentId: t.students[0].id, withUserId: t.teacher.id }).expect(404); // someone else
      await http().put(`/v1/conversations/class-teachers/${t.section.id}`).set(as('principal')).send({ userId: null }).expect(200);
      await http().post('/v1/conversations').set(as('student')).send({ studentId: t.students[2].id, withUserId: t.teacher2.id }).expect(403); // not their teacher
      await http().put('/v1/conversations/settings').set(as('principal')).send({ studentChat: false }).expect(200);
      await http().post('/v1/conversations').set(as('student')).send({ studentId: t.students[2].id, withUserId: t.teacher.id }).expect(404);
      expect((await http().get('/v1/conversations/settings').set(as('student')).expect(200)).body).toMatchObject({ studentChat: false });
      expect((await http().get('/v1/conversations/contacts').set(as('student')).expect(200)).body.asFamily).toEqual([]);

      // School: off by default.
      await owner.query(`update tenants set kind = 'school' where id = $1`, [other.tenantId]);
      const otherStudent = await login(other.slug, other.studentUser.email!);
      await http().post('/v1/conversations').set({ authorization: `Bearer ${otherStudent}` }).send({ studentId: other.students[2].id, withUserId: other.teacher.id }).expect(404);
      expect((await http().get('/v1/conversations/settings').set({ authorization: `Bearer ${otherStudent}` }).expect(200)).body.studentChat).toBe(false);
    });
  });
});
