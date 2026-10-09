import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('school learning support: worksheets, mastery tree, remedial plans, readiness, promotion rules, board pass rules, lesson-plan outcomes, forums', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let yearId: string;
  let outcomeId: string;
  let topicIds: string[];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;
  const [A, B, C] = [0, 1, 2];

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    yearId = (await q('select id from academic_years where tenant_id = $1', [t.tenantId]))[0].id;
    const outcome = (await post('principal', '/v1/school/outcomes', { kind: 'outcome', grade: 3, subjectName: 'Corporate Accounting', code: 'CA3.1', statement: 'Journalise share issues' }).expect(201)).body;
    outcomeId = outcome.id;
    // Library content for the topic map: a course, a chapter and two topics.
    const code = `c${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(s.curricula).values({ code, name: 'Test curriculum', level: 'ug' });
    const [course] = await db.insert(s.courses).values({ curriculumCode: code, code: 'ca', title: 'Corporate Accounting', term: 3, source: 'test' }).returning();
    const [chapter] = await db.insert(s.chapters).values({ courseId: course.id, position: 1, title: 'Share capital' }).returning();
    const rows = await db.insert(s.topics).values([{ chapterId: chapter.id, position: 1, title: 'Issue of shares' }, { chapterId: chapter.id, position: 2, title: 'Forfeiture of shares' }]).returning();
    topicIds = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('scores an activity by levels, feeds mastery of the linked outcome, and shows families only their own child', async () => {
    const w = (await post('teacher', '/v1/school-learning/worksheets', { kind: 'activity', title: 'Share issue role play', sectionId: t.section.id, subjectName: 'Corporate Accounting', outcomeId, levels: ['Mastered', 'Secure', 'Developing', 'Beginning'], maxScore: 4 }).expect(201)).body;
    await post('teacher', '/v1/school-learning/worksheets', { kind: 'worksheet', title: 'Bad', sectionId: t.section.id, subjectName: 'X', maxScore: 0 }).expect(400);
    await put('teacher', `/v1/school-learning/worksheets/${w.id}/scores`, { scores: [{ studentId: t.students[A].id, level: 'Wrong level' }] }).expect(400);
    await put('teacher', `/v1/school-learning/worksheets/${w.id}/scores`, { scores: [{ studentId: t.students[A].id, score: 9 }] }).expect(400);
    const done = (await put('teacher', `/v1/school-learning/worksheets/${w.id}/scores`, { scores: [{ studentId: t.students[A].id, level: 'Mastered', remarks: 'Explained journal entries well' }, { studentId: t.students[B].id, level: 'Beginning' }, { studentId: t.students[C].id }] }).expect(200)).body;
    expect(done).toEqual({ scored: 3, masteryUpdated: 2 });
    const detail = (await get('teacher', `/v1/school-learning/worksheets/${w.id}`).expect(200)).body;
    expect(detail.roster.map((r: { level: string | null }) => r.level)).toEqual(['Mastered', 'Beginning', null]);
    const lvl = await q('select student_id, level from mastery_records where tenant_id = $1', [t.tenantId]);
    expect(lvl.find((r) => r.student_id === t.students[A].id)?.level).toBe('mastery');
    expect(lvl.find((r) => r.student_id === t.students[B].id)?.level).toBe('beginning');
    // A numeric worksheet on the same outcome: 7 of 10 is proficient.
    const n = (await post('teacher', '/v1/school-learning/worksheets', { kind: 'worksheet', title: 'Revision sheet', sectionId: t.section.id, subjectName: 'Corporate Accounting', outcomeId, maxScore: 10 }).expect(201)).body;
    await put('teacher', `/v1/school-learning/worksheets/${n.id}/scores`, { scores: [{ studentId: t.students[C].id, score: 7 }] }).expect(200);
    expect((await get('principal', `/v1/school-learning/worksheets?sectionId=${t.section.id}`).expect(200)).body).toHaveLength(2);
    const mine = (await get('parentA', `/v1/school-learning/students/${t.students[A].id}/summary`).expect(200)).body;
    expect(mine.worksheets.find((x: { title: string }) => x.title === 'Share issue role play')).toMatchObject({ level: 'Mastered', remarks: 'Explained journal entries well' });
    await get('parentA', `/v1/school-learning/students/${t.students[B].id}/summary`).expect(404);
    await get('parentA', '/v1/school-learning/worksheets').expect(403);
    await get('outsider', `/v1/school-learning/worksheets/${w.id}`).expect(404);
  });

  it('links topics to an outcome and shows the class mastery under each', async () => {
    await put('principal', `/v1/school-learning/outcomes/${outcomeId}/topics`, { topicIds }).expect(200);
    await put('principal', `/v1/school-learning/outcomes/${outcomeId}/topics`, { topicIds: ['11111111-1111-4111-8111-111111111111'] }).expect(400);
    const tree = (await get('teacher', '/v1/school-learning/outcome-tree?grade=3&subjectName=Corporate%20Accounting').expect(200)).body;
    expect(tree).toHaveLength(1);
    expect(tree[0].topics.map((x: { title: string; chapter: string }) => [x.chapter, x.title])).toEqual([['Share capital', 'Issue of shares'], ['Share capital', 'Forfeiture of shares']]);
    expect(tree[0].mastery).toMatchObject({ mastery: 1, proficient: 1, beginning: 1 });
    await put('teacher', `/v1/school-learning/outcomes/${outcomeId}/topics`, { topicIds }).expect(403);
  });

  it('opens remedial plans from low mastery once, and a catch-up plan for a delayed topic', async () => {
    const first = (await post('teacher', '/v1/school-learning/remedial/generate', { sectionId: t.section.id }).expect(200)).body;
    expect(first).toEqual({ created: 1, alreadyOpen: 0 });
    expect((await post('teacher', '/v1/school-learning/remedial/generate', { sectionId: t.section.id }).expect(200)).body).toEqual({ created: 0, alreadyOpen: 1 });
    const plans = (await get('teacher', '/v1/school-learning/remedial?status=open').expect(200)).body as { id: string; studentName: string; outcome: string; source: string }[];
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ studentName: 'Student B', outcome: 'CA3.1', source: 'low_mastery' });
    const upd = (await put('teacher', `/v1/school-learning/remedial/${plans[0].id}`, { status: 'closed', resultNote: 'Re-taught; scored 8/10 on the check' }).expect(200)).body;
    expect(upd.closedAt).toBeTruthy();
    await post('teacher', '/v1/school-learning/remedial', { studentId: t.students[C].id, subjectName: 'Corporate Accounting', plan: 'Daily 15 minute practice with the teacher' }).expect(201);

    // The year plan put "Forfeiture of shares" in a week three weeks ago; it was never taught.
    const [plan] = await db.insert(s.yearPlans).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, startsOn: '2026-08-01', endsOn: '2027-05-31', createdBy: t.teacher.id }).returning();
    await db.insert(s.yearPlanItems).values([{ tenantId: t.tenantId, planId: plan.id, topicId: topicIds[0], weekOf: '2026-09-28', periods: 2 }, { tenantId: t.tenantId, planId: plan.id, topicId: topicIds[1], weekOf: '2026-09-28', periods: 2 }]);
    await db.insert(s.topicCoverage).values({ tenantId: t.tenantId, sectionId: t.section.id, topicId: topicIds[0], coveredOn: '2026-10-02', coveredBy: t.teacher.id });
    const late = (await get('teacher', `/v1/school-learning/delayed-topics?sectionId=${t.section.id}`).expect(200)).body;
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ topic: 'Forfeiture of shares', daysLate: 22, teacherId: t.teacher.id });
    expect((await post('teacher', '/v1/school-learning/delayed-topics/remediate', { sectionId: t.section.id }).expect(200)).body).toEqual({ created: 1, delayed: 1 });
    expect((await post('teacher', '/v1/school-learning/delayed-topics/remediate', { sectionId: t.section.id }).expect(200)).body).toEqual({ created: 0, delayed: 1 });
    const open = (await get('teacher', `/v1/school-learning/remedial?sectionId=${t.section.id}`).expect(200)).body as { source: string; studentName: string | null; plan: string }[];
    expect(open.find((p) => p.source === 'delayed_topic')).toMatchObject({ studentName: null });
  });

  it('tracks entrance readiness from mock tests', async () => {
    await put('teacher', '/v1/school-learning/readiness/targets', { studentId: t.students[A].id, exam: 'CET', examOn: '2027-04-15', targetPct: 65 }).expect(200);
    for (const [d, sc, bd] of [['2026-08-10', 48, { Physics: 40, Maths: 60 }], ['2026-09-10', 58, { Physics: 52, Maths: 66 }], ['2026-10-10', 66, { Physics: 58, Maths: 74 }]] as const) {
      await post('teacher', '/v1/school-learning/readiness/mocks', { studentId: t.students[A].id, exam: 'CET', takenOn: d, score: sc, maxScore: 100, breakdown: bd }).expect(201);
    }
    await post('teacher', '/v1/school-learning/readiness/mocks', { studentId: t.students[A].id, exam: 'CET', takenOn: '2026-10-11', score: 101, maxScore: 100 }).expect(400);
    const mine = (await get('parentA', `/v1/school-learning/readiness/students/${t.students[A].id}`).expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ exam: 'CET', targetPct: 65, latestPct: 66, band: 'close', trend: 'up', tests: 3 });
    expect(mine[0].weakSubjects).toEqual(['Physics']);
    const cls = (await get('teacher', `/v1/school-learning/readiness/sections/${t.section.id}?exam=CET`).expect(200)).body;
    expect(cls).toHaveLength(1);
    await get('parentB', `/v1/school-learning/readiness/students/${t.students[A].id}`).expect(404);
  });

  it('decides promotion from the year\'s report cards and attendance, then tells the families on approval', async () => {
    await post('principal', '/v1/school-learning/promotion/rules', { name: 'Default rule', minAttendancePct: 75, subjectPassPct: 35, maxCompartmentSubjects: 1, graceMarks: 2, isDefault: true }).expect(201);
    const card = (studentId: string, lines: { subjectName: string; marks: number; maxMarks: number }[]) => put('principal', '/v1/school/report-cards', { studentId, academicYearId: yearId, termLabel: 'Annual', lines }).expect(200);
    await card(t.students[A].id, [{ subjectName: 'Maths', marks: 80, maxMarks: 100 }, { subjectName: 'Science', marks: 60, maxMarks: 100 }]);
    await card(t.students[B].id, [{ subjectName: 'Maths', marks: 20, maxMarks: 100 }, { subjectName: 'Science', marks: 33, maxMarks: 100 }]);
    // Student C has no report card yet. Student A attended 20 of 20 days; B attended 10 of 20.
    for (let i = 1; i <= 20; i++) {
      const day = `2026-09-${String(i).padStart(2, '0')}`;
      for (const [idx, st] of [[A, 'present'], [B, i <= 10 ? 'present' : 'absent'], [C, 'present']] as const) {
        await owner.query("insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1,$2,$3,$4,null,$5,$6,now())", [t.tenantId, t.students[idx].id, t.section.id, day, st, t.teacher.id]);
      }
    }
    const run = (await post('principal', '/v1/school-learning/promotion/evaluate', { academicYearId: yearId, sectionId: t.section.id }).expect(200)).body;
    expect(run.decided.map((d: { fullName: string; decision: string }) => [d.fullName, d.decision])).toEqual([['Student A', 'promoted'], ['Student B', 'detained']]);
    expect(run.noResults).toEqual(['Student C']);
    const list = (await get('principal', `/v1/school-learning/promotion/decisions?academicYearId=${yearId}&status=pending`).expect(200)).body as { id: string; fullName: string; reasons: string[] }[];
    expect(list.find((d) => d.fullName === 'Student B')?.reasons.join(' ')).toContain('Attendance 50%');
    await post('teacher', '/v1/school-learning/promotion/decisions/approve', { ids: list.map((d) => d.id) }).expect(403);
    const approved = (await post('principal', '/v1/school-learning/promotion/decisions/approve', { ids: list.map((d) => d.id) }).expect(200)).body;
    expect(approved).toEqual({ decided: 2, notified: 2 });
    const note = (await get('parentA', '/v1/notifications?limit=10').expect(200)).body.items as { title: string; body: string }[];
    expect(note.some((n) => n.title === 'Promotion decision' && n.body.includes('promoted'))).toBe(true);
    expect((await get('parentB', `/v1/school-learning/students/${t.students[B].id}/summary`).expect(200)).body.promotion).toMatchObject({ decision: 'detained' });
    expect((await get('parentA', `/v1/school-learning/students/${t.students[A].id}/summary`).expect(200)).body.promotion).toMatchObject({ decision: 'promoted' });
    await post('principal', '/v1/school-learning/promotion/decisions/approve', { ids: list.map((d) => d.id) }).expect(400); // already decided
    // Approved decisions are not overwritten by running the rule again.
    const rerun = (await post('principal', '/v1/school-learning/promotion/evaluate', { academicYearId: yearId, sectionId: t.section.id }).expect(200)).body;
    expect(rerun.decided).toEqual([]);
  });

  it('tries a board\'s pass rules on marks and on a PUC student\'s entered marks', async () => {
    const board = (await post('principal', '/v1/admin/institution/boards', { code: 'KPUC', name: 'Karnataka PUC', kind: 'state', passRules: { subjectPassPct: 35, graceMarks: 3, maxCompartmentSubjects: 1, aggregatePassPct: 35 } }).expect(201)).body;
    const out = (await post('teacher', `/v1/school-learning/boards/${board.id}/evaluate`, { marks: [{ subject: 'Physics', theory: 30, theoryMax: 70, practical: 10, practicalMax: 30 }, { subject: 'Maths', theory: 18, theoryMax: 100 }] }).expect(200)).body;
    expect(out).toMatchObject({ board: 'KPUC', result: 'compartment', failedSubjects: ['Maths'] });
    // A PUC student: stream, combination, enrolment and marks.
    const stream = (await post('principal', '/v1/school/puc/streams', { code: 'SCI', name: 'Science' }).expect(201)).body;
    const combo = (await post('principal', '/v1/school/puc/combinations', { streamId: stream.id, code: 'PCM', name: 'Physics Chem Maths', subjects: [{ name: 'Physics', theoryMax: 70, practicalMax: 30, internalMax: 0 }, { name: 'Chemistry', theoryMax: 70, practicalMax: 30, internalMax: 0 }, { name: 'Maths', theoryMax: 100, practicalMax: 0, internalMax: 0 }] }).expect(201)).body;
    await post('principal', '/v1/school/puc/enrollments', { studentId: t.students[A].id, academicYearId: yearId, combinationId: combo.id }).expect(200);
    for (const m of [{ subjectName: 'Physics', theory: 50, practical: 25 }, { subjectName: 'Chemistry', theory: 40, practical: 20 }]) await put('principal', '/v1/school/puc/marks', { studentId: t.students[A].id, academicYearId: yearId, ...m }).expect(200);
    const partial = (await get('principal', `/v1/school-learning/boards/results/students/${t.students[A].id}?academicYearId=${yearId}`).expect(200)).body;
    expect(partial).toMatchObject({ board: 'KPUC', complete: false, result: 'compartment', failedSubjects: ['Maths'] });
    await put('principal', '/v1/school/puc/marks', { studentId: t.students[A].id, academicYearId: yearId, subjectName: 'Maths', theory: 72 }).expect(200);
    const full = (await get('parentA', `/v1/school-learning/boards/results/students/${t.students[A].id}?academicYearId=${yearId}`).expect(200)).body;
    expect(full).toMatchObject({ complete: true, result: 'pass', failedSubjects: [] });
    await get('parentB', `/v1/school-learning/boards/results/students/${t.students[A].id}?academicYearId=${yearId}`).expect(404);
  });

  it('maps a lesson plan to the outcomes it teaches with activity, resource and assessment', async () => {
    const [plan] = await db.insert(s.lessonPlans).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, timetableSlotId: t.slot.id, date: '2026-10-19', teacherId: t.teacher.id, topicIds: [topicIds[0]], content: { objectives: ['Journalise a share issue'], steps: [], materials: [], assessment: 'Exit ticket', homework: '' } }).returning();
    await put('teacher', `/v1/school-learning/lesson-plans/${plan.id}/outcomes`, { items: [{ learningOutcomeId: outcomeId, activity: 'Role play: company and investor', resource: 'Share application forms', assessment: 'Exit ticket: 3 journal entries' }] }).expect(200);
    const rows = (await get('teacher', `/v1/school-learning/lesson-plans/${plan.id}/outcomes`).expect(200)).body;
    expect(rows).toEqual([expect.objectContaining({ code: 'CA3.1', activity: 'Role play: company and investor', assessment: 'Exit ticket: 3 journal entries' })]);
    await put('teacher', `/v1/school-learning/lesson-plans/${plan.id}/outcomes`, { items: [{ activity: 'x' }] }).expect(400);
    await put('teacher', `/v1/school-learning/lesson-plans/${plan.id}/outcomes`, { items: [{ learningOutcomeId: outcomeId, courseOutcomeId: outcomeId }] }).expect(400);
    await put('teacher2', `/v1/school-learning/lesson-plans/${plan.id}/outcomes`, { items: [] }).expect(404); // someone else's plan
    await put('principal', `/v1/school-learning/lesson-plans/${plan.id}/outcomes`, { items: [] }).expect(200);
  });

  it('runs a course forum, copies a course for the next year, and recommends what to practise', async () => {
    const course = (await post('teacher', '/v1/lms/courses', { sectionId: t.section.id, subjectId: t.subject.id }).expect(201)).body;
    await http().patch(`/v1/lms/courses/${course.id}`).set(auth('teacher')).send({ status: 'published' }).expect(200);
    const mod = (await post('teacher', `/v1/lms/courses/${course.id}/modules`, { title: 'Share capital' }).expect(201)).body;
    await post('teacher', `/v1/lms/modules/${mod.id}/items`, { kind: 'topic', title: 'Forfeiture of shares', refId: topicIds[1] }).expect(201);
    await post('teacher', `/v1/lms/modules/${mod.id}/items`, { kind: 'case_study', title: 'Case: Tata share issue', url: 'https://example.org/case.pdf' }).expect(201);
    await post('teacher', `/v1/lms/modules/${mod.id}/items`, { kind: 'simulation', title: 'Journal simulator' }).expect(400); // needs an address
    await post('teacher', `/v1/lms/modules/${mod.id}/items`, { kind: 'virtual_lab', title: 'Share market lab', url: 'https://example.org/lab' }).expect(201);
    const ws = (await q('select id from worksheets where tenant_id = $1 limit 1', [t.tenantId]))[0].id;
    await post('teacher', `/v1/lms/modules/${mod.id}/items`, { kind: 'worksheet', title: 'Revision sheet', refId: ws }).expect(201);
    // Forum: students and teachers post; families read; the teacher moderates.
    const th = (await post('student', `/v1/lms/courses/${course.id}/forum`, { title: 'What is forfeiture?', body: 'I do not follow the second call.' }).expect(201)).body;
    await post('parentA', `/v1/lms/courses/${course.id}/forum`, { title: 'Parent post', body: 'Hello' }).expect(403);
    await post('teacher', `/v1/lms/forum/${th.id}/posts`, { body: 'It is when a shareholder fails to pay the call money.' }).expect(201);
    await post('student', `/v1/lms/forum/${th.id}/posts`, { body: 'Thank you!' }).expect(201);
    const thread = (await get('parentA', `/v1/lms/forum/${th.id}`).expect(200)).body;
    expect(thread.posts).toHaveLength(2);
    expect(thread.canModerate).toBe(false);
    await post('student', `/v1/lms/forum/${th.id}/moderate`, { action: 'pin' }).expect(403);
    await post('teacher', `/v1/lms/forum/${th.id}/moderate`, { action: 'lock' }).expect(200);
    await post('student', `/v1/lms/forum/${th.id}/posts`, { body: 'One more' }).expect(409);
    const first = thread.posts[0];
    await post('teacher', `/v1/lms/forum/posts/${first.id}/hide`).expect(200);
    expect((await get('student', `/v1/lms/forum/${th.id}`).expect(200)).body.posts).toHaveLength(1);
    await post('teacher', `/v1/lms/forum/${th.id}/moderate`, { action: 'hide' }).expect(200);
    expect((await get('student', `/v1/lms/courses/${course.id}/forum`).expect(200)).body).toHaveLength(0);
    expect((await get('teacher', `/v1/lms/courses/${course.id}/forum`).expect(200)).body).toHaveLength(1);
    await get('outsider', `/v1/lms/courses/${course.id}/forum`).expect(404);

    // Recommendations for student B (beginning on CA3.1, which is built by the two topics and the worksheet).
    const reco = (await get('parentB', `/v1/lms/students/${t.students[B].id}/recommendations`).expect(200)).body;
    expect(reco.mastery).toEqual([{ subject: 'Corporate Accounting', assessed: 1, percent: 0 }]);
    expect(reco.recommendations.map((r: { title: string }) => r.title)).toContain('Forfeiture of shares');
    await get('parentB', `/v1/lms/students/${t.students[A].id}/recommendations`).expect(404);

    // Clone the course to the other class (next year's shell): class-bound items are left behind.
    const copy = (await post('principal', `/v1/lms/courses/${course.id}/clone`, { sectionId: t.otherSection.id, title: 'Corporate Accounting 2027' }).expect(201)).body;
    expect(copy).toMatchObject({ modules: 1, copied: 3, skipped: 1 });
    const cloned = (await get('principal', `/v1/lms/courses/${copy.courseId}`).expect(200)).body;
    expect(cloned).toMatchObject({ status: 'draft', title: 'Corporate Accounting 2027' });
    expect(cloned.modules[0].items.map((i: { kind: string }) => i.kind)).toEqual(['topic', 'case_study', 'virtual_lab']);
    await post('principal', `/v1/lms/courses/${course.id}/clone`, { sectionId: t.otherSection.id }).expect(409);
    await post('teacher', `/v1/lms/courses/${course.id}/clone`, { sectionId: t.otherSection.id }).expect(403); // a teacher who does not teach the target class
  });
});
