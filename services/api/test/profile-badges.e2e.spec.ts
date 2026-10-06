import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/** The smallest valid JPEG header is enough: the API checks the type, the apps crop and compress. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);

describe('profile and badges', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const inbox = async (who: string) =>
    (await http().get('/v1/notifications').set(auth(who)).expect(200)).body.items as { kind: string; title: string; body: string; data: Record<string, string> }[];

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
      outsider: await login(other.slug, other.teacher.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('PATCH /v1/me', () => {
    it('changes name, email and a teacher’s subjects, and records it', async () => {
      const me = (
        await http()
          .patch('/v1/me')
          .set(auth('teacher'))
          .send({ fullName: '  Asha Rao ', email: 'Asha.Rao@X.in', teachingSubjects: ['Accounts', 'Economics'] })
          .expect(200)
      ).body;
      expect(me).toMatchObject({ fullName: 'Asha Rao', email: 'asha.rao@x.in', teachingSubjects: ['Accounts', 'Economics'], photoUrl: null });
      const log = await db.select().from(s.auditLog).where(eq(s.auditLog.actorId, t.teacher.id));
      expect(log.some((l) => l.action === 'profile.updated' && (l.data as { fields: string[] }).fields.includes('email'))).toBe(true);
      // Signing in with the new email works.
      await http().post('/v1/auth/login').send({ tenant: t.slug, login: 'asha.rao@x.in', password: 'pw' }).expect(201);
    });

    it('validates', async () => {
      await http().patch('/v1/me').set(auth('teacher')).send({ fullName: 'A' }).expect(400);
      await http().patch('/v1/me').set(auth('teacher')).send({ email: 'not-an-email' }).expect(400);
      await http().patch('/v1/me').set(auth('teacher')).send({ phone: '+919999999999' }).expect(400);
      await http().patch('/v1/me').set(auth('teacher')).send({ email: t.principal.email }).expect(409);
      await http().patch('/v1/me').set(auth('student')).send({ teachingSubjects: ['Maths'] }).expect(403);
      // A parent clears their email; the language alone still works.
      expect((await http().patch('/v1/me').set(auth('parent')).send({ email: '' }).expect(200)).body.email).toBeNull();
      expect((await http().patch('/v1/me').set(auth('parent')).send({ preferredLanguage: 'hi' }).expect(200)).body.preferredLanguage).toBe('hi');
      await http().patch('/v1/me').set(auth('parent')).send({ preferredLanguage: 'en' }).expect(200);
    });
  });

  describe('profile photo', () => {
    it('uploads, shows to those who may see it, and removes', async () => {
      await http().post('/v1/me/photo').set(auth('parent')).attach('photo', Buffer.from('not an image'), 'x.jpg').expect(400);
      await http().post('/v1/me/photo').set(auth('parent')).expect(400);
      const me = (await http().post('/v1/me/photo').set(auth('parent')).attach('photo', JPEG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(200)).body;
      expect(me.photoUrl).toMatch(new RegExp(`^/v1/users/${t.guardian.id}/photo\\?v=\\d+$`));
      expect((await http().get('/v1/me').set(auth('parent')).expect(200)).body.photoUrl).toBe(me.photoUrl);

      const got = await http().get(me.photoUrl).set(auth('parent')).expect(200);
      expect(got.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.compare(got.body as Buffer, JPEG)).toBe(0);
      await http().get(me.photoUrl).set(auth('teacher')).expect(200);
      // Another family, and another institution, cannot.
      await http().get(me.photoUrl).set(auth('parent2')).expect(404);
      await http().get(me.photoUrl).set(auth('student')).expect(404);
      await http().get(me.photoUrl).set(auth('outsider')).expect(404);

      // A teacher's photo is seen by families; it shows in the class roster for a student with a login.
      const teacherPhoto = (await http().post('/v1/me/photo').set(auth('teacher')).attach('photo', JPEG, 'me.jpg').expect(200)).body.photoUrl;
      await http().get(teacherPhoto).set(auth('parent2')).expect(200);
      const studentPhoto = (await http().post('/v1/me/photo').set(auth('student')).attach('photo', JPEG, 'me.jpg').expect(200)).body.photoUrl;
      const roster = (await http().get(`/v1/sections/${t.section.id}/roster`).set(auth('teacher')).expect(200)).body as { id: string; photoUrl: string | null }[];
      expect(roster.find((r) => r.id === t.students[2].id)!.photoUrl).toBe(studentPhoto);
      expect(roster.find((r) => r.id === t.students[0].id)!.photoUrl).toBeNull();

      const log = await db.select().from(s.auditLog).where(eq(s.auditLog.actorId, t.guardian.id));
      expect(log.some((l) => l.action === 'profile.photo_changed')).toBe(true);
      expect((await http().delete('/v1/me/photo').set(auth('parent')).expect(200)).body.photoUrl).toBeNull();
      await http().get(me.photoUrl).set(auth('parent')).expect(404);
    });
  });

  describe('badges', () => {
    it('lets the class’s teachers award, tells the family, and shows to the right people', async () => {
      const award = (who: string, body: Record<string, unknown>) => http().post('/v1/badges').set(auth(who)).send(body);
      const view = (
        await award('teacher', { studentId: t.students[0].id, sectionId: t.section.id, badge: 'master_of_maths', subjectId: t.subject.id }).expect(201)
      ).body;
      expect(view).toMatchObject({ badge: 'master_of_maths', studentId: t.students[0].id, awardedBy: { id: t.teacher.id }, subject: { name: 'Corporate Accounting' } });

      // Not this class's teacher, a student, the wrong class, an unknown badge, another institution.
      await award('teacher2', { studentId: t.students[0].id, sectionId: t.section.id, badge: 'best_leader' }).expect(403);
      await award('student', { studentId: t.students[0].id, sectionId: t.section.id, badge: 'best_leader' }).expect(403);
      await award('teacher', { studentId: t.students[0].id, sectionId: t.otherSection.id, badge: 'best_leader' }).expect(403);
      await award('principal', { studentId: t.students[0].id, sectionId: t.otherSection.id, badge: 'best_leader' }).expect(400);
      await award('teacher', { studentId: t.students[0].id, sectionId: t.section.id, badge: 'gold_star' }).expect(400);
      await award('outsider', { studentId: t.students[0].id, sectionId: t.section.id, badge: 'best_leader' }).expect(403);

      const notes = await inbox('parent');
      expect(notes.find((n) => n.kind === 'badge')).toMatchObject({ title: expect.stringContaining('Master of Maths'), data: { studentId: t.students[0].id, badge: 'master_of_maths' } });
      expect((await inbox('parent2')).some((n) => n.kind === 'badge')).toBe(false);

      const list = (await http().get(`/v1/badges/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body;
      expect(list.badges).toHaveLength(1);
      expect(list.counts).toEqual({ master_of_maths: 1 });
      await http().get(`/v1/badges/students/${t.students[0].id}`).set(auth('teacher2')).expect(200);
      await http().get(`/v1/badges/students/${t.students[0].id}`).set(auth('principal')).expect(200);
      await http().get(`/v1/badges/students/${t.students[0].id}`).set(auth('parent2')).expect(404);
      await http().get(`/v1/badges/students/${t.students[0].id}`).set(auth('student')).expect(404);
      await http().get(`/v1/badges/students/${t.students[0].id}`).set(auth('outsider')).expect(404);
    });

    it('awards from the board, for the student with a login too', async () => {
      const { boardToken, socket } = await pairBoard(app, t, tokens.teacher);
      try {
        await http()
          .post('/v1/badges')
          .set({ authorization: `Bearer ${boardToken}` })
          .send({ studentId: t.students[2].id, sectionId: t.section.id, badge: 'creative_mind' })
          .expect(201);
      } finally {
        socket.disconnect();
      }
      const mine = (await http().get(`/v1/badges/students/${t.students[2].id}`).set(auth('student')).expect(200)).body;
      expect(mine.badges[0]).toMatchObject({ badge: 'creative_mind', awardedBy: { id: t.teacher.id } });
      expect((await inbox('student')).some((n) => n.kind === 'badge' && n.title.includes('Creative Mind'))).toBe(true);
    });
  });

  describe('homework reminders', () => {
    it('reminds the students who have not handed in, and their families', async () => {
      const dueOn = new Date(clock.at.getTime() + 2 * 86400_000).toISOString().slice(0, 10);
      const hw = (
        await http().post('/v1/homework').set(auth('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Exercise 9', dueOn }).expect(201)
      ).body;
      await http().post(`/v1/homework/${hw.id}/submissions/${t.students[1].id}`).set(auth('parent2')).field('text', 'Done').expect(200);
      await http().post(`/v1/homework/${hw.id}/submissions/remind`).set(auth('teacher2')).expect(403);
      expect((await http().post(`/v1/homework/${hw.id}/submissions/remind`).set(auth('teacher')).expect(200)).body).toEqual({ reminded: 2 });
      expect((await inbox('parent')).some((n) => n.title.startsWith('Homework not handed in') && n.body.includes('Exercise 9'))).toBe(true);
      expect((await inbox('student')).some((n) => n.title.startsWith('Homework not handed in'))).toBe(true);
      expect((await inbox('parent2')).some((n) => n.title.startsWith('Homework not handed in'))).toBe(false);
    });
  });
});
