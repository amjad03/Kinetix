import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('LMS course shells and gradebook', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  let courseId = '';
  let catIds: string[] = [];

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    for (const [k, u] of Object.entries({ principal: t.principal, teacher: t.teacher, teacher2: t.teacher2, parent: t.guardian, parent2: t.guardian2 })) tokens[k] = await login(u.email!);
    const mk = async (title: string, kind: 'test' | 'exam', max: number, published: boolean, got: [number, number]) => {
      const [a] = await db.insert(s.assessments).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, title, kind, maxMarks: max, heldOn: '2026-09-01', createdBy: t.teacher.id, publishedAt: published ? new Date() : null }).returning();
      await db.insert(s.marks).values(got.map((m, i) => ({ tenantId: t.tenantId, assessmentId: a.id, studentId: t.students[i].id, marks: m })));
    };
    await mk('Unit test 1', 'test', 20, true, [16, 10]);
    await mk('Exam', 'exam', 100, false, [90, 40]);
    await db.insert(s.homework).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, createdBy: t.teacher.id, title: 'HW 1', dueOn: '2026-09-05' });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('only a teacher of the class (or a leader) makes the course; one per class and subject', async () => {
    const body = { sectionId: t.section.id, subjectId: t.subject.id };
    await http().post('/v1/lms/courses').set(as('teacher2')).send(body).expect(403);
    await http().post('/v1/lms/courses').set(as('parent')).send(body).expect(403);
    const c = (await http().post('/v1/lms/courses').set(as('teacher')).send(body).expect(201)).body;
    expect(c).toMatchObject({ status: 'draft', title: 'Corporate Accounting · BCom Sem 3 A' });
    courseId = c.id;
    await http().post('/v1/lms/courses').set(as('principal')).send(body).expect(409);
  });

  it('modules hold ordered items linked to existing content; refs are checked', async () => {
    const m = (await http().post(`/v1/lms/courses/${courseId}/modules`).set(as('teacher')).send({ title: 'Unit 1' }).expect(201)).body;
    const [hw] = await db.select().from(s.homework).where(eq(s.homework.tenantId, t.tenantId));
    await http().post(`/v1/lms/modules/${m.id}/items`).set(as('teacher')).send({ kind: 'homework', title: 'HW 1', refId: hw.id }).expect(201);
    await http().post(`/v1/lms/modules/${m.id}/items`).set(as('teacher')).send({ kind: 'link', title: 'Reading', url: 'https://example.com/r' }).expect(201);
    await http().post(`/v1/lms/modules/${m.id}/items`).set(as('teacher')).send({ kind: 'topic', title: 'Ghost', refId: m.id }).expect(400);
    await http().post(`/v1/lms/modules/${m.id}/items`).set(as('teacher')).send({ kind: 'link', title: 'No url' }).expect(400);
    await http().post(`/v1/lms/courses/${courseId}/announcements`).set(as('teacher')).send({ title: 'Welcome' }).expect(201);
    const d = (await http().get(`/v1/lms/courses/${courseId}`).set(as('teacher')).expect(200)).body;
    expect(d.modules[0].items.map((i: { position: number }) => i.position)).toEqual([1, 2]);
    expect(d.announcements).toHaveLength(1);
  });

  it('drafts are hidden from families until published', async () => {
    await http().get(`/v1/lms/courses/${courseId}`).set(as('parent')).expect(404);
    expect((await http().get('/v1/lms/my').set(as('parent')).expect(200)).body).toEqual([]);
    await http().patch(`/v1/lms/courses/${courseId}`).set(as('teacher2')).send({ status: 'published' }).expect(403);
    await http().patch(`/v1/lms/courses/${courseId}`).set(as('teacher')).send({ status: 'published' }).expect(200);
  });

  it('weights must total 100; the gradebook weights categories and re-bases empty ones', async () => {
    await http().put(`/v1/lms/courses/${courseId}/categories`).set(as('teacher')).send({ categories: [{ name: 'Tests', source: 'test', weight: 50 }] }).expect(400);
    catIds = (await http().put(`/v1/lms/courses/${courseId}/categories`).set(as('teacher')).send({ categories: [{ name: 'Tests', source: 'test', weight: 30 }, { name: 'Homework', source: 'homework', weight: 20 }, { name: 'Exam', source: 'exam', weight: 50 }] }).expect(200)).body.map((c: { id: string }) => c.id);
    const g = (await http().get(`/v1/lms/courses/${courseId}/gradebook`).set(as('teacher')).expect(200)).body;
    const a = g.rows.find((r: { rollNo: string }) => r.rollNo === 'R1');
    expect(a.cells.map((c: { percent: number | null }) => c.percent)).toEqual([80, 0, 90]);
    expect(a.overall).toBe(69); // 0.3*80 + 0.2*0 + 0.5*90
    expect(g.rows.find((r: { rollNo: string }) => r.rollNo === 'R3').overall).toBe(0); // no marks yet, but homework not handed in counts as 0
  });

  it('families see only published marks and their own child; other families see nothing', async () => {
    const mine = (await http().get('/v1/lms/my').set(as('parent')).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ studentName: 'Student A', moduleCount: 1, overall: 48 }); // exam not yet published: tests 80 @30, homework 0 @20
    const d = (await http().get(`/v1/lms/courses/${courseId}`).set(as('parent')).expect(200)).body;
    expect(d.grade.rollNo).toBe('R1');
    expect(d.canManage).toBe(false);
    await http().get(`/v1/lms/courses/${courseId}/gradebook`).set(as('parent')).expect(403);
    await http().get(`/v1/lms/my?studentId=${t.students[0].id}`).set(as('parent2')).expect(404);
  });

  it('overrides need a reason, change the grade and are audited', async () => {
    const o = { studentId: t.students[0].id, categoryId: catIds[1], percent: 100 };
    await http().put(`/v1/lms/courses/${courseId}/overrides`).set(as('teacher')).send({ ...o, reason: '' }).expect(400);
    await http().put(`/v1/lms/courses/${courseId}/overrides`).set(as('teacher2')).send({ ...o, reason: 'Submitted on paper' }).expect(403);
    await http().put(`/v1/lms/courses/${courseId}/overrides`).set(as('teacher')).send({ ...o, reason: 'Submitted on paper' }).expect(200);
    const g = (await http().get(`/v1/lms/courses/${courseId}/gradebook`).set(as('teacher')).expect(200)).body;
    expect(g.rows[0].cells[1]).toEqual({ categoryId: catIds[1], percent: 100, overridden: true });
    const audit = await db.select().from(s.auditLog);
    expect(audit.find((r) => r.action === 'lms.grade_override')?.data).toMatchObject({ from: null, to: 100, reason: 'Submitted on paper' });
  });

  it('exports the gradebook as CSV', async () => {
    const res = await http().get(`/v1/lms/courses/${courseId}/gradebook.csv`).set(as('principal')).expect(200);
    expect(res.text.split('\r\n')[0]).toBe('Roll no,Name,Tests (30%),Homework (20%),Exam (50%),Overall %,Grade');
    expect(res.text).toContain('R1,Student A,80,100,90,');
  });
});
