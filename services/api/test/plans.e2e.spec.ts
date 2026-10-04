import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/** Year plans and lesson plans. */
describe('plans', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let topics: string[];
  let planId: string;
  const sockets: Socket[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const cls = () => ({ sectionId: t.section.id, subjectId: t.subject.id });

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.teacher.email!),
      teacher2: await login(t.teacher2.email!),
      principal: await login(t.principal.email!),
      parent: await login(t.guardian.email!),
    };
    const course = (await owner.query(`select id from courses where code = 'bcom-3-corporate-accounting'`)).rows[0].id;
    await owner.query(`update subjects set course_id = $1 where id = $2`, [course, t.subject.id]);
    topics = (await owner.query(`select t.id from topics t join chapters c on c.id = t.chapter_id where c.course_id = $1 and t.tenant_id is null order by c.position, t.position`, [course])).rows.map((r: { id: string }) => r.id);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await owner.end();
  });

  it('generates a year plan from the timetable, skipping holidays and exams', async () => {
    // One period a week (Monday 10:00). Over 4 weeks, the second Monday is a holiday: 3 periods.
    await http().post('/v1/admin/calendar').set(auth('principal')).send({ kind: 'holiday', title: 'Festival', startsOn: addDays(monday, 7), endsOn: addDays(monday, 7), notify: false }).expect(201);
    await http().post('/v1/year-plans/generate').set(auth('teacher2')).send({ ...cls(), startsOn: monday, endsOn: addDays(monday, 27) }).expect(403);
    const plan = (await http().post('/v1/year-plans/generate').set(auth('teacher')).send({ ...cls(), startsOn: monday, endsOn: addDays(monday, 27) }).expect(200)).body;
    planId = plan.id;
    expect(plan.items).toHaveLength(topics.length);
    const weeks = [...new Set(plan.items.map((i: { weekOf: string }) => i.weekOf))];
    expect(weeks).not.toContain(addDays(monday, 7));
    expect(weeks).toEqual([monday, addDays(monday, 14), addDays(monday, 21)].filter((w) => weeks.includes(w)));
    expect(plan.items[0]).toMatchObject({ topicId: topics[0], weekOf: monday, coveredOn: null, late: false });
    expect(plan.progress).toMatchObject({ total: topics.length, covered: 0, expected: 0, status: 'not_started' });

    // Regenerating replaces the weeks rather than adding a second plan.
    const again = (await http().post('/v1/year-plans/generate').set(auth('teacher')).send({ ...cls(), startsOn: monday, endsOn: addDays(monday, 27) }).expect(200)).body;
    expect(again.id).toBe(planId);
    expect(again.items).toHaveLength(topics.length);
  });

  it('shows progress against the plan, to staff and the class', async () => {
    clock.at = new Date(Date.parse(nextMondayIst('10:30').toISOString()) + 15 * 86400_000); // Tuesday, week 3
    const p = (await http().get(`/v1/year-plans?sectionId=${t.section.id}&subjectId=${t.subject.id}`).set(auth('parent')).expect(200)).body;
    expect(p.progress.status).toBe('behind');
    expect(p.items.filter((i: { late: boolean }) => i.late).length).toBe(p.progress.behindBy);

    // Teaching the planned topics catches up.
    const due = p.items.filter((i: { weekOf: string }) => i.weekOf < addDays(monday, 14)).map((i: { topicId: string }) => i.topicId);
    for (const topicId of due) await http().post('/v1/coverage').set(auth('teacher')).send({ ...cls(), topicId }).expect(200);
    const caught = (await http().get(`/v1/year-plans?sectionId=${t.section.id}&subjectId=${t.subject.id}`).set(auth('teacher')).expect(200)).body;
    expect(caught.progress).toMatchObject({ status: 'on_track', behindBy: 0 });
    await http().get(`/v1/year-plans?sectionId=${t.section.id}&subjectId=${t.subject.id}`).set(auth('teacher2')).expect(404);

    // Moving a topic to another week.
    const last = caught.items[caught.items.length - 1];
    const moved = (await http().put(`/v1/year-plans/${planId}/items`).set(auth('teacher')).send({ items: [{ topicId: last.topicId, weekOf: addDays(monday, 25), periods: 2 }] }).expect(200)).body;
    expect(moved.items.find((i: { topicId: string }) => i.topicId === last.topicId)).toMatchObject({ weekOf: addDays(monday, 21), periods: 2 }); // to its Monday
    clock.at = nextMondayIst('10:30');
  });

  it('plans a period, drafts it with KINETIX AI, shows it on the board, and lets the head review it', async () => {
    const q = `slotId=${t.slot.id}&date=${monday}`;
    const empty = (await http().get(`/v1/lesson-plans/period?${q}`).set(auth('teacher')).expect(200)).body;
    expect(empty.plan).toBeNull();
    expect(empty.suggestedTopicIds.length).toBeGreaterThan(0);

    const draft = (await http().post('/v1/lesson-plans/draft').set(auth('teacher')).send({ slotId: t.slot.id, date: monday }).expect(200)).body;
    expect(draft.content.objectives.length).toBeGreaterThan(0);
    expect(draft.meta.preview).toBe(true); // no AI server in tests

    await http().put('/v1/lesson-plans').set(auth('teacher')).send({ slotId: t.slot.id, date: addDays(monday, 1), content: draft.content }).expect(400); // not a Monday period
    await http().put('/v1/lesson-plans').set(auth('teacher2')).send({ slotId: t.slot.id, date: monday, content: draft.content }).expect(403);
    const saved = (await http().put('/v1/lesson-plans').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, topicIds: draft.topicIds, content: { ...draft.content, homework: 'Ex 4.2' }, aiDrafted: true }).expect(200)).body;
    expect(saved.plan).toMatchObject({ date: monday, aiDrafted: true, content: { homework: 'Ex 4.2' }, reviewedAt: null });
    expect(saved.plan.topics[0].title).toBeTruthy();

    // The teacher's day says the period is planned; the board shows the plan for its open period.
    const day = (await http().get(`/v1/teacher/timetable?date=${monday}`).set(auth('teacher')).expect(200)).body;
    expect(day.periods[0].lessonPlanned).toBe(true);
    const paired = await pairBoard(app, t, tokens.teacher);
    sockets.push(paired.socket);
    expect((await http().get('/v1/lesson-plans/current').set('authorization', `Bearer ${paired.boardToken}`).expect(200)).body.plan.id).toBe(saved.plan.id);

    // Review: the head of the subject's department (or the principal), not another teacher.
    await http().post(`/v1/lesson-plans/${saved.plan.id}/review`).set(auth('teacher2')).send({ remark: 'x' }).expect(403);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'hod')`, [t.tenantId, t.teacher2.id]);
    tokens.hod = await login(t.teacher2.email!);
    const dept = (await http().post('/v1/admin/departments').set(auth('principal')).send({ name: 'Commerce', headUserId: t.teacher2.id }).expect(201)).body;
    await http().put(`/v1/admin/departments/${dept.id}`).set(auth('principal')).send({ subjectIds: [t.subject.id], staffIds: [t.teacher.id] }).expect(200);
    const reviewed = (await http().post(`/v1/lesson-plans/${saved.plan.id}/review`).set(auth('hod')).send({ remark: 'Add a recap question' }).expect(200)).body;
    expect(reviewed).toMatchObject({ reviewRemark: 'Add a recap question', reviewedAt: expect.any(String) });
    const list = (await http().get(`/v1/lesson-plans?sectionId=${t.section.id}&subjectId=${t.subject.id}&from=${monday}&to=${monday}`).set(auth('hod')).expect(200)).body;
    expect(list.plans).toHaveLength(1);

    // Editing after review clears the review (the head sees the new version).
    const edited = (await http().put('/v1/lesson-plans').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, content: draft.content }).expect(200)).body;
    expect(edited.plan.reviewedAt).toBeNull();

    // The department view shows the year plan's status and the lesson plans.
    const o = (await http().get(`/v1/departments/${dept.id}/overview?from=${monday}&to=${monday}`).set(auth('hod')).expect(200)).body;
    expect(o.classes[0]).toMatchObject({ lessonPlans: 1, yearPlan: expect.objectContaining({ total: topics.length }) });
  });
});
