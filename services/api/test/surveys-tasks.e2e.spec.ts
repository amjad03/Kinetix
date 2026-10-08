import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { TasksService } from '../src/tasks/tasks.service.js';
import { SurveysService } from '../src/surveys/surveys.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('surveys and tasks', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = new Date('2026-10-20T04:30:00Z');
  const clock = new FixedClock(start);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const count = async (sql: string, args: unknown[]) => (await owner.query(sql, args)).rows[0].n as number;

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
      outsider: await login(other.slug, other.principal.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const questions = (coId?: string) => [
    { kind: 'single', prompt: 'How is the pace of teaching?', options: ['Slow', 'Right', 'Fast'] },
    { kind: 'multiple', prompt: 'What helps you learn?', options: ['Notes', 'Labs', 'Videos'], required: false },
    { kind: 'rating', prompt: 'Rate the course overall', coId },
    { kind: 'text', prompt: 'Any comments?', required: false },
  ];

  describe('surveys', () => {
    let anon: string;
    let named: string;
    let qs: { id: string; kind: string }[];
    let coId: string;

    it('builds a survey for a section, linked to a course outcome', async () => {
      const [set] = await db.insert(s.coSets).values({ tenantId: t.tenantId, subjectId: t.subject.id, version: 1, createdBy: t.principal.id }).returning();
      const [co] = await db.insert(s.courseOutcomes).values({ tenantId: t.tenantId, coSetId: set.id, code: 'CO1', statement: 'Explain accounts' }).returning();
      coId = co.id;
      const res = await post('teacher', '/v1/surveys', { title: 'Course feedback', audience: 'section', sectionId: t.section.id, anonymous: true, questions: questions(coId) }).expect(201);
      anon = res.body.id;
      qs = res.body.questions;
      expect(res.body.status).toBe('draft');
      expect(qs).toHaveLength(4);
      expect(qs[2]).toMatchObject({ kind: 'rating', coId });
    });

    it('rejects bad definitions and people who may not build', async () => {
      await post('teacher', '/v1/surveys', { title: 'Bad', audience: 'staff', questions: [{ kind: 'single', prompt: 'One option only', options: ['A'] }] }).expect(400);
      await post('teacher', '/v1/surveys', { title: 'No section', audience: 'section', questions: questions() }).expect(400);
      await post('teacher', '/v1/surveys', { title: 'Bad outcome', audience: 'staff', questions: questions('00000000-0000-4000-8000-000000000000') }).expect(404);
      await post('student', '/v1/surveys', { title: 'Mine', audience: 'staff', questions: questions() }).expect(403);
    });

    it('shows nothing until it is published, then only to its audience', async () => {
      expect((await get('student', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      await post('teacher', `/v1/surveys/${anon}/publish`).expect(200);
      await post('teacher', `/v1/surveys/${anon}/publish`).expect(409);
      const mine = (await get('student', '/v1/surveys/mine').expect(200)).body;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ id: anon, answered: false, anonymous: true });
      expect(mine[0].questions).toHaveLength(4);
      expect((await get('parent', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      expect((await get('teacher2', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      expect(await count("select count(*)::int as n from notifications where tenant_id = $1 and kind = 'survey'", [t.tenantId])).toBe(1);
    });

    it('accepts one response per person and checks the answers', async () => {
      await post('parent', `/v1/surveys/${anon}/responses`, { answers: [] }).expect(404);
      await post('student', `/v1/surveys/${anon}/responses`, { answers: [{ questionId: qs[0].id, choices: ['Right'] }] }).expect(400);
      await post('student', `/v1/surveys/${anon}/responses`, { answers: [{ questionId: qs[0].id, choices: ['Right'] }, { questionId: qs[2].id, rating: 7 }] }).expect(400);
      await post('student', `/v1/surveys/${anon}/responses`, { answers: [{ questionId: qs[0].id, choices: ['Sideways'] }, { questionId: qs[2].id, rating: 4 }] }).expect(400);
      await post('student', `/v1/surveys/${anon}/responses`, { answers: [{ questionId: qs[0].id, choices: ['Right'] }, { questionId: qs[1].id, choices: ['Labs', 'Notes'] }, { questionId: qs[2].id, rating: 4 }, { questionId: qs[3].id, text: 'Clear lessons' }] }).expect(201);
      await post('student', `/v1/surveys/${anon}/responses`, { answers: [{ questionId: qs[0].id, choices: ['Fast'] }, { questionId: qs[2].id, rating: 1 }] }).expect(409);
      const mine = (await get('student', '/v1/surveys/mine').expect(200)).body;
      expect(mine[0]).toMatchObject({ answered: true, questions: [] });
    });

    it('keeps an anonymous survey unlinked from the respondent', async () => {
      expect(await count('select count(*)::int as n from survey_answers where survey_id = $1 and response_id is not null', [anon])).toBe(0);
      expect(await count('select count(*)::int as n from survey_answers where survey_id = $1', [anon])).toBe(4);
    });

    it('summarises per question and exports CSV without names', async () => {
      const r = (await get('teacher', `/v1/surveys/${anon}/results`).expect(200)).body;
      expect(r.responses).toBe(1);
      expect(r.questions[0].counts).toEqual([{ option: 'Slow', count: 0 }, { option: 'Right', count: 1 }, { option: 'Fast', count: 0 }]);
      expect(r.questions[2]).toMatchObject({ average: 4, coId });
      expect(r.questions[3].texts).toEqual(['Clear lessons']);
      const csv = await get('teacher', `/v1/surveys/${anon}/export.csv`).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Clear lessons');
      expect(csv.text).not.toContain('Student C');
      await get('teacher2', `/v1/surveys/${anon}/results`).expect(404);
      await get('outsider', `/v1/surveys/${anon}/results`).expect(404);
      await get('student', `/v1/surveys/${anon}/results`).expect(403);
    });

    it('names respondents in a named survey for guardians', async () => {
      const res = await post('principal', '/v1/surveys', { title: 'Parent feedback', audience: 'guardians', questions: questions() }).expect(201);
      named = res.body.id;
      await post('principal', `/v1/surveys/${named}/publish`).expect(200);
      const q = (await get('parent', '/v1/surveys/mine').expect(200)).body[0].questions as { id: string }[];
      await post('parent', `/v1/surveys/${named}/responses`, { answers: [{ questionId: q[0].id, choices: ['Slow'] }, { questionId: q[2].id, rating: 2 }] }).expect(201);
      const csv = await get('principal', `/v1/surveys/${named}/export.csv`).expect(200);
      expect(csv.text).toContain(t.guardian.fullName);
      expect((await get('principal', '/v1/surveys').expect(200)).body.find((x: { id: string }) => x.id === named).responses).toBe(1);
      expect((await get('teacher', '/v1/surveys').expect(200)).body.map((x: { id: string }) => x.id)).toEqual([anon]);
    });

    it('closes, announces surveys.closed and stops accepting answers', async () => {
      await post('teacher', `/v1/surveys/${anon}/close`).expect(200);
      await post('teacher', `/v1/surveys/${anon}/close`).expect(409);
      expect(await count("select count(*)::int as n from domain_events where tenant_id = $1 and type = 'surveys.closed' and aggregate_id = $2", [t.tenantId, anon])).toBe(1);
      expect((await get('student', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      await post('student', `/v1/surveys/${anon}/responses`, { answers: [] }).expect(409);
    });

    it('honours the answer window and closes expired surveys', async () => {
      const opens = new Date(start.getTime() + 2 * 3_600_000).toISOString();
      const closes = new Date(start.getTime() + 24 * 3_600_000).toISOString();
      const id = (await post('principal', '/v1/surveys', { title: 'Staff pulse', audience: 'staff', opensAt: opens, closesAt: closes, questions: [{ kind: 'rating', prompt: 'How is your week?' }] }).expect(201)).body.id;
      await post('principal', `/v1/surveys/${id}/publish`).expect(200);
      expect((await get('teacher', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      clock.at = new Date(start.getTime() + 3 * 3_600_000);
      const mine = (await get('teacher', '/v1/surveys/mine').expect(200)).body;
      expect(mine).toHaveLength(1);
      expect((await get('student', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      await post('teacher', `/v1/surveys/${id}/responses`, { answers: [{ questionId: mine[0].questions[0].id, rating: 5 }] }).expect(201);
      clock.at = new Date(start.getTime() + 25 * 3_600_000);
      expect((await get('teacher2', '/v1/surveys/mine').expect(200)).body).toEqual([]);
      expect(await app.get(SurveysService).closeExpired(t.tenantId)).toEqual([id]);
      expect(await count("select count(*)::int as n from domain_events where tenant_id = $1 and type = 'surveys.closed'", [t.tenantId])).toBe(2);
      clock.at = start;
    });
  });

  describe('tasks', () => {
    let first: string;

    it('creates a task for someone else and lists it on both sides', async () => {
      const res = await post('teacher', '/v1/tasks', { title: 'Collect lab records', assigneeId: t.teacher2.id, priority: 'high', slaHours: 4, sourceModule: 'lms', sourceId: 'abc' }).expect(201);
      first = res.body.id;
      expect(res.body).toMatchObject({ status: 'open', ownerId: t.teacher.id, assigneeId: t.teacher2.id, slaHours: 4, sourceModule: 'lms' });
      expect(res.body.dueAt).toBe(new Date(start.getTime() + 4 * 3_600_000).toISOString());
      const mine = (await get('teacher2', '/v1/tasks/mine').expect(200)).body;
      expect(mine.map((x: { id: string }) => x.id)).toEqual([first]);
      expect(mine[0]).toMatchObject({ ownerName: expect.any(String), overdue: false });
      expect((await get('teacher', '/v1/tasks/assigned-by-me').expect(200)).body).toHaveLength(1);
      expect((await get('teacher', '/v1/tasks/mine').expect(200)).body).toEqual([]);
      expect(await count("select count(*)::int as n from notifications where tenant_id = $1 and kind = 'task' and user_id = $2", [t.tenantId, t.teacher2.id])).toBe(1);
      await post('student', '/v1/tasks', { title: 'Not allowed', assigneeId: t.teacher.id }).expect(403);
      await post('teacher', '/v1/tasks', { title: 'Nobody', assigneeId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      const people = (await get('teacher', '/v1/tasks/people').expect(200)).body.map((x: { id: string }) => x.id);
      expect(people).toContain(t.teacher2.id);
      expect(people).not.toContain(t.studentUser.id);
    });

    it('moves status with an audit entry and refuses outsiders and bad moves', async () => {
      await post('principal', `/v1/tasks/${first}/status`, { status: 'done' }).expect(403);
      await post('teacher2', `/v1/tasks/${first}/status`, { status: 'in_progress' }).expect(200);
      await post('teacher2', `/v1/tasks/${first}/status`, { status: 'in_progress' }).expect(409);
      await post('teacher2', `/v1/tasks/${first}/status`, { status: 'done', expectedVersion: 0 }).expect(409);
      const done = await post('teacher2', `/v1/tasks/${first}/status`, { status: 'done', expectedVersion: 1 }).expect(200);
      expect(done.body.completedAt).not.toBeNull();
      expect(await count("select count(*)::int as n from audit_log where tenant_id = $1 and action = 'task.status_changed' and subject_id = $2", [t.tenantId, first])).toBe(2);
      expect((await get('teacher2', '/v1/tasks/mine').expect(200)).body).toEqual([]);
      expect((await get('teacher2', '/v1/tasks/mine?status=all').expect(200)).body).toHaveLength(1);
      await post('outsider', `/v1/tasks/${first}/status`, { status: 'open' }).expect(404);
    });

    it('lets other modules raise a task inside their transaction', async () => {
      const svc = app.get(TasksService);
      const { DbService } = await import('../src/db/db.service.js');
      const row = await app.get(DbService).withTenant(t.tenantId, (tx) => svc.create(tx, { tenantId: t.tenantId, ownerId: t.principal.id, assigneeId: t.teacher.id, title: 'Review grievance', sourceModule: 'grievances', sourceId: 'g-1' }));
      expect(row).toMatchObject({ sourceModule: 'grievances', sourceId: 'g-1', status: 'open' });
      expect((await get('teacher', '/v1/tasks/mine').expect(200)).body).toHaveLength(1);
    });

    it("escalates an overdue task once, to the assignee's department head else to the owner", async () => {
      const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: t.principal.id }).returning();
      await db.insert(s.staffProfiles).values({ userId: t.teacher2.id, tenantId: t.tenantId, employeeCode: 'E2', departmentId: dept.id });
      const a = (await post('teacher', '/v1/tasks', { title: 'Submit marks', assigneeId: t.teacher2.id, slaHours: 2 }).expect(201)).body.id;
      const b = (await post('teacher2', '/v1/tasks', { title: 'Plan syllabus', assigneeId: t.teacher.id, slaHours: 2 }).expect(201)).body.id;
      const c = (await post('teacher', '/v1/tasks', { title: 'Later work', assigneeId: t.teacher2.id, slaHours: 48 }).expect(201)).body.id;
      const svc = app.get(TasksService);
      expect(await svc.escalateOverdue(t.tenantId)).toEqual([]);
      clock.at = new Date(start.getTime() + 3 * 3_600_000);
      expect((await svc.escalateOverdue(t.tenantId)).sort()).toEqual([a, b].sort());
      expect(await svc.escalateOverdue(t.tenantId)).toEqual([]);
      const told = async (task: string) => (await owner.query("select user_id from notifications where tenant_id = $1 and dedupe_key = $2", [t.tenantId, `task:overdue:${task}`])).rows.map((r) => r.user_id);
      expect(await told(a)).toEqual([t.principal.id]);
      expect(await told(b)).toEqual([t.teacher2.id]);
      expect(await told(c)).toEqual([]);
      expect((await get('teacher2', '/v1/tasks/mine').expect(200)).body.find((x: { id: string }) => x.id === a).overdue).toBe(true);
      clock.at = start;
    });
  });
});
