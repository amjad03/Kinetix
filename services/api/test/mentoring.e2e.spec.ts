import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('student mentoring and early intervention', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
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
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@mn.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hod = await addUser('Hari Hod', 'hod');
    const counsellor = await addUser('Chitra Counsellor', 'counsellor');
    app = await createApp(clock);
    tokens = {
      hod: await login(t.slug, hod.email!),
      counsellor: await login(t.slug, counsellor.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { teacher: t.teacher.id, teacher2: t.teacher2.id, a: t.students[0].id, b: t.students[1].id, c: t.students[2].id });

    // Student A has poor attendance, two failing marks, an overdue fee and an open welfare request; C has nothing.
    for (let d = 1; d <= 10; d++) {
      await db.insert(s.attendanceRecords).values({ tenantId: t.tenantId, studentId: ids.a, sectionId: t.section.id, date: `2026-10-${String(d).padStart(2, '0')}`, status: d <= 5 ? 'present' : 'absent', markedBy: t.teacher.id, occurredAt: new Date('2026-10-10T05:00:00Z') });
    }
    for (const [i, mark] of [20, 10].entries()) {
      const [a] = await db.insert(s.assessments).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, title: `Test ${i + 1}`, kind: 'test', maxMarks: 100, heldOn: '2026-10-05', publishedAt: new Date('2026-10-06T00:00:00Z'), createdBy: t.teacher.id }).returning();
      await db.insert(s.marks).values({ tenantId: t.tenantId, assessmentId: a.id, studentId: ids.a, marks: mark });
      await db.insert(s.marks).values({ tenantId: t.tenantId, assessmentId: a.id, studentId: ids.c, marks: 80 });
    }
    await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: ids.a, sectionId: t.section.id, batchId: randomUUID(), title: 'Term 1', amountPaise: 500000, dueOn: '2026-09-30', createdBy: t.principal.id });
    await db.insert(s.welfareRequests).values({ tenantId: t.tenantId, studentId: ids.a, requestedBy: t.principal.id, kind: 'hardship', title: 'Fee hardship' });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('assigns mentors in bulk by section, keeping existing assignments, and refuses non-faculty', async () => {
    await post('teacher', '/v1/mentoring/assignments/bulk', { sectionId: t.section.id, mentorUserIds: [ids.teacher] }).expect(403);
    await post('principal', '/v1/mentoring/assignments', { studentId: ids.a, mentorUserId: t.guardian.id }).expect(409);
    expect((await get('hod', '/v1/mentoring/mentors').expect(200)).body.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining([ids.teacher, ids.teacher2]));
    await get('teacher', '/v1/mentoring/mentors').expect(403);
    const r = (await post('hod', '/v1/mentoring/assignments/bulk', { sectionId: t.section.id, mentorUserIds: [ids.teacher, ids.teacher2] }).expect(200)).body;
    expect(r).toEqual({ assigned: 3, skipped: 0 });
    expect((await post('hod', '/v1/mentoring/assignments/bulk', { sectionId: t.section.id, mentorUserIds: [ids.teacher] }).expect(200)).body).toEqual({ assigned: 0, skipped: 3 });
    expect((await get('teacher', '/v1/mentoring/assignments').expect(200)).body.map((x: { studentId: string }) => x.studentId).sort()).toEqual([ids.a, ids.c].sort());
    expect((await get('teacher2', '/v1/mentoring/assignments').expect(200)).body).toHaveLength(1);
    expect((await get('principal', '/v1/mentoring/assignments').expect(200)).body).toHaveLength(3);
    await get('student', '/v1/mentoring/assignments').expect(403);
    expect(await audited('mentoring.bulk_assigned')).toBe(2);
  });

  it('reassigning ends the old assignment so a student has one open mentor', async () => {
    await post('principal', '/v1/mentoring/assignments', { studentId: ids.b, mentorUserId: ids.teacher }).expect(201);
    expect((await get('teacher', '/v1/mentoring/assignments').expect(200)).body).toHaveLength(3);
    expect((await get('teacher2', '/v1/mentoring/assignments').expect(200)).body).toHaveLength(0);
    const { rows } = await owner.query('select count(*)::int as n from mentor_assignments where student_id = $1', [ids.b]);
    expect(rows[0].n).toBe(2);
    await post('principal', '/v1/mentoring/assignments', { studentId: ids.b, mentorUserId: ids.teacher2 }).expect(201);
  });

  it('computes risk from attendance, marks, fees and welfare cases, only for the mentor’s own mentees', async () => {
    const list = (await get('teacher', '/v1/mentoring/risk').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ studentId: ids.a, level: 'high', attendancePct: 50, failingMarks: 2, overdueFees: 1, openCases: 1 });
    expect(list[0].signals.map((x: { kind: string }) => x.kind).sort()).toEqual(['attendance', 'cases', 'fees', 'marks']);
    expect((await get('teacher2', '/v1/mentoring/risk').expect(200)).body).toHaveLength(0);
    // The threshold is adjustable: at 40 per cent the attendance signal goes away.
    const low = (await get('hod', `/v1/mentoring/risk?mentorUserId=${ids.teacher}&attendanceBelow=40`).expect(200)).body;
    expect(low[0].signals.map((x: { kind: string }) => x.kind)).not.toContain('attendance');
    expect((await get('principal', '/v1/mentoring/risk?all=true').expect(200)).body).toHaveLength(3);
    await get('parent', '/v1/mentoring/risk').expect(403);
    expect((await get('outsider', '/v1/mentoring/risk').expect(200)).body).toEqual([]);
  });

  it('shows a class at a glance to its teachers only', async () => {
    const r = (await get('teacher', `/v1/mentoring/sections/${t.section.id}/insights`).expect(200)).body;
    expect(r.students).toHaveLength(t.students.length);
    const a = r.students.find((x: { studentId: string }) => x.studentId === ids.a);
    const c = r.students.find((x: { studentId: string }) => x.studentId === ids.c);
    expect(a).toMatchObject({ attendancePct: 50, marksAvgPct: 15, failingMarks: 2, level: 'high' });
    expect(c).toMatchObject({ marksAvgPct: 80, attendancePct: null });
    expect(r.classMarksAvgPct).toBe(48);
    await get('teacher2', `/v1/mentoring/sections/${t.section.id}/insights`).expect(403);
    await get('parent', `/v1/mentoring/sections/${t.section.id}/insights`).expect(403);
    await get('outsider', `/v1/mentoring/sections/${t.section.id}/insights`).expect(404);
  });

  it('keeps private notes to the mentor, the head of department and the counsellor', async () => {
    const body = { studentId: ids.a, heldOn: '2026-10-19', mode: 'in_person', summary: 'Talked about attendance.', privateNotes: 'Cares for a sick parent.', followUpOn: '2026-11-02' };
    await post('teacher2', '/v1/mentoring/sessions', body).expect(403);
    await post('teacher', '/v1/mentoring/sessions', { ...body, summary: '' }).expect(400);
    const made = (await post('teacher', '/v1/mentoring/sessions', body).expect(201)).body;
    expect(made.privateNotes).toBe('Cares for a sick parent.');
    const q = `/v1/mentoring/sessions?studentId=${ids.a}`;
    expect((await get('teacher', q).expect(200)).body[0].privateNotes).toBe('Cares for a sick parent.');
    expect((await get('hod', q).expect(200)).body[0].privateNotes).toBe('Cares for a sick parent.');
    expect((await get('counsellor', q).expect(200)).body[0].privateNotes).toBe('Cares for a sick parent.');
    const seenByPrincipal = (await get('principal', q).expect(200)).body[0];
    expect(seenByPrincipal.privateNotes).toBeUndefined();
    expect(seenByPrincipal).toMatchObject({ hasNotes: true, summary: 'Talked about attendance.' });
    await get('teacher2', q).expect(404);
    expect(await audited('mentoring.session_logged')).toBe(1);
    expect(await audited('mentoring.notes_viewed')).toBe(2);
    const { rows } = await owner.query("select data::text as d from audit_log where tenant_id = $1 and action = 'mentoring.session_logged'", [t.tenantId]);
    expect(rows[0].d).not.toContain('sick parent');
  });

  it('runs an intervention plan from goal to outcome, changeable only by its mentor', async () => {
    const plan = (await post('teacher', '/v1/mentoring/plans', { studentId: ids.a, goal: 'Bring attendance above 75 per cent', actions: ['Call the parent', 'Weekly check-in'], reviewOn: '2026-11-10' }).expect(201)).body;
    expect(plan).toMatchObject({ status: 'open', actions: [{ text: 'Call the parent', done: false }, { text: 'Weekly check-in', done: false }] });
    await post('teacher2', '/v1/mentoring/plans', { studentId: ids.a, goal: 'Someone else’s student', actions: ['x'], reviewOn: '2026-11-10' }).expect(403);
    await put('teacher2', `/v1/mentoring/plans/${plan.id}`, { reviewOn: '2026-12-01' }).expect(403);
    const ticked = (await put('teacher', `/v1/mentoring/plans/${plan.id}`, { actions: [{ text: 'Call the parent', done: true }, { text: 'Weekly check-in', done: false }], reviewOn: '2026-11-15' }).expect(200)).body;
    expect(ticked).toMatchObject({ status: 'in_progress', reviewOn: '2026-11-15' });
    expect((await get('teacher', '/v1/mentoring/plans').expect(200)).body).toHaveLength(1);
    expect((await get('teacher2', '/v1/mentoring/plans').expect(200)).body).toHaveLength(0);
    expect((await get('hod', `/v1/mentoring/plans?studentId=${ids.a}&status=in_progress`).expect(200)).body).toHaveLength(1);
    await post('teacher', `/v1/mentoring/plans/${plan.id}/close`, { outcome: 'ok', outcomeRating: 'improved' }).expect(400);
    const closed = (await post('teacher', `/v1/mentoring/plans/${plan.id}/close`, { outcome: 'Attendance recovered to 82 per cent.', outcomeRating: 'improved' }).expect(200)).body;
    expect(closed).toMatchObject({ status: 'closed', outcomeRating: 'improved' });
    await put('teacher', `/v1/mentoring/plans/${plan.id}`, { reviewOn: '2026-12-01' }).expect(409);
    await post('teacher', `/v1/mentoring/plans/${plan.id}/close`, { outcome: 'Again', outcomeRating: 'improved' }).expect(409);
    expect(await audited('mentoring.plan_closed')).toBe(1);
  });

  it('ends an assignment', async () => {
    const a = (await get('principal', '/v1/mentoring/assignments').expect(200)).body[0];
    await post('teacher', `/v1/mentoring/assignments/${a.id}/end`).expect(403);
    await post('principal', `/v1/mentoring/assignments/${a.id}/end`).expect(200);
    await post('principal', `/v1/mentoring/assignments/${a.id}/end`).expect(409);
    expect((await get('principal', '/v1/mentoring/assignments').expect(200)).body).toHaveLength(2);
  });
});
