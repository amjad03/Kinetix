import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handInVerdict, markAfterPenalty } from '../src/homework/assignment-rules.js';
import { gradeAnswer, itemAccess, itemStats } from '../src/lms/lms-access.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * LMS depth: assignment late policy, cut-off, attempts, extensions, groups with individual marks, the push to
 * internal marks and the compliance report; quizzes with a question pool, time limit, attempts, auto-marking,
 * coding questions left for the teacher and item analysis; content access rules, remedial items and analytics;
 * the student calendar; and the kit lists of assignments and quizzes.
 */
describe('lms depth', () => {
  const owner = ownerPool();
  const start = nextMondayIst('10:30');
  const clock = new FixedClock(start);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const day = (offset: number) => new Date(start.getTime() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('has pure rules for hand-ins, marks, access and item analysis', () => {
    const p = { dueEnd: new Date('2026-10-20T00:00:00Z'), cutoffEnd: new Date('2026-10-22T00:00:00Z'), latePolicy: 'penalty' as const, latePenaltyPct: 10, maxAttempts: 2 };
    expect(handInVerdict(p, new Date('2026-10-19T10:00:00Z'), null)).toEqual({ refusal: null, late: false, penaltyPct: 0, attempt: 1 });
    expect(handInVerdict(p, new Date('2026-10-21T10:00:00Z'), { attempts: 1, returned: false })).toEqual({ refusal: null, late: true, penaltyPct: 10, attempt: 2 });
    expect(handInVerdict(p, new Date('2026-10-21T10:00:00Z'), { attempts: 2, returned: false }).refusal).toBe('You have used all 2 attempts');
    expect(handInVerdict(p, new Date('2026-10-21T10:00:00Z'), { attempts: 2, returned: true }).refusal).toBeNull();
    expect(handInVerdict(p, new Date('2026-10-23T10:00:00Z'), null).refusal).toMatch(/closed/);
    expect(handInVerdict({ ...p, latePolicy: 'reject' }, new Date('2026-10-21T10:00:00Z'), null).refusal).toMatch(/does not take late work/);
    expect(markAfterPenalty(18, 20, 10)).toBe(16.2);
    expect(markAfterPenalty(25, 20, 0)).toBe(20);
    const now = new Date();
    expect(itemAccess({ id: 'a', releaseAt: new Date(now.getTime() + 1000), prerequisiteItemId: null, audienceStudentIds: null }, 's', now, new Set())).toEqual({ visible: false });
    expect(itemAccess({ id: 'a', releaseAt: null, prerequisiteItemId: null, audienceStudentIds: ['x'] }, 's', now, new Set())).toEqual({ visible: false });
    expect(itemAccess({ id: 'a', releaseAt: null, prerequisiteItemId: 'b', audienceStudentIds: null }, 's', now, new Set())).toMatchObject({ visible: true, locked: true });
    expect(itemAccess({ id: 'a', releaseAt: null, prerequisiteItemId: 'b', audienceStudentIds: null }, 's', now, new Set(['b']))).toEqual({ visible: true, locked: false });
    expect(gradeAnswer({ kind: 'multi', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }, { text: 'c', correct: true }], answer: '', marks: 2 }, [2, 0])).toEqual({ correct: true, marks: 2 });
    expect(gradeAnswer({ kind: 'short', options: [], answer: 'Delhi|New Delhi', marks: 1 }, ' new  delhi ')).toEqual({ correct: true, marks: 1 });
    expect(gradeAnswer({ kind: 'code', options: [], answer: '', marks: 5 }, 'x')).toBeNull();
    const s = itemStats([1, 2, 3, 4, 5, 6, 7, 8].map((total) => ({ total, correct: total > 4 })));
    expect(s).toEqual({ attempts: 8, difficulty: 0.5, discrimination: 1 });
  });

  let hwId: string;
  it('runs an assignment with a late penalty, a cut-off, an extension, a group and individual marks', async () => {
    hwId = (await http().post('/v1/homework').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Case study 1', dueOn: day(0) }).expect(201)).body.id;
    await http().put(`/v1/homework/${hwId}/settings`).set(as('teacher2')).send({ maxMarks: 20 }).expect(403);
    await http().put(`/v1/homework/${hwId}/settings`).set(as('teacher')).send({ cutoffOn: day(-1) }).expect(400);
    await http().put(`/v1/homework/${hwId}/settings`).set(as('teacher')).send({ maxMarks: 20, latePolicy: 'penalty', latePenaltyPct: 10, cutoffOn: day(2), maxAttempts: 2 }).expect(200);
    await http().put(`/v1/homework/${hwId}/groups`).set(as('teacher')).send({ groups: [{ name: 'Team A', studentIds: [t.students[2].id, t.students[0].id] }, { name: 'Team B', studentIds: [t.students[0].id] }] }).expect(400);
    await http().put(`/v1/homework/${hwId}/groups`).set(as('teacher')).send({ groups: [{ name: 'Team A', studentIds: [t.students[2].id, t.students[0].id] }] }).expect(200);

    // A day late: taken with the penalty, and handed in for the whole group.
    clock.at = new Date(start.getTime() + 86400_000);
    const sub = (await http().post(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(as('student')).field('text', 'Our analysis').expect(200)).body;
    expect(sub).toMatchObject({ late: true, penaltyPct: 10, attempts: 1 });
    await http().post(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(as('student')).field('text', 'Revised').expect(200);
    await http().post(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(as('student')).field('text', 'Third').expect(409);
    // The Student App shows the hand-in rules with the submission: attempts, late policy and the group.
    const mine = (await http().get(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(as('student')).expect(200)).body;
    expect(mine).toMatchObject({ attempts: 2, rules: { latePolicy: 'penalty', latePenaltyPct: 10, maxAttempts: 2, group: { name: 'Team A', members: [expect.any(String)] } } });
    expect(mine.rules.dueAt).toEqual(expect.any(String));
    expect(mine.rules.cutoffAt).toEqual(expect.any(String));
    const list = (await http().get(`/v1/homework/${hwId}/submissions`).set(as('teacher')).expect(200)).body;
    expect(list.students.filter((s: { status: string | null }) => s.status).map((s: { rollNo: string }) => s.rollNo)).toEqual(['R1', 'R3']);

    // Individual marks, less the penalty; nothing for someone who did not hand in.
    await http().put(`/v1/homework/${hwId}/marks`).set(as('teacher')).send({ entries: [{ studentId: t.students[1].id, marks: 10 }] }).expect(409);
    await http().put(`/v1/homework/${hwId}/marks`).set(as('teacher')).send({ entries: [{ studentId: t.students[2].id, marks: 25 }] }).expect(400);
    const marked = (await http().put(`/v1/homework/${hwId}/marks`).set(as('teacher')).send({ entries: [{ studentId: t.students[2].id, marks: 18 }, { studentId: t.students[0].id, marks: 15 }] }).expect(200)).body;
    expect(marked).toEqual([{ studentId: t.students[2].id, marks: 16.2 }, { studentId: t.students[0].id, marks: 13.5 }]);

    // After the cut-off nothing is taken, except from a student with a later extension.
    clock.at = new Date(start.getTime() + 4 * 86400_000);
    await owner.query(`delete from homework_submissions where homework_id = $1 and student_id = $2`, [hwId, t.students[2].id]);
    await http().post(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(as('student')).field('text', 'Too late').expect(409);
    await http().put(`/v1/homework/${hwId}/extensions/${t.students[2].id}`).set(as('teacher')).send({ dueOn: day(-1) }).expect(400);
    await http().put(`/v1/homework/${hwId}/extensions/${t.students[2].id}`).set(as('teacher')).send({ dueOn: day(5), reason: 'Hospitalised' }).expect(200);
    const ext = (await http().post(`/v1/homework/${hwId}/submissions/${t.students[2].id}`).set(as('student')).field('text', 'With extension').expect(200)).body;
    expect(ext).toMatchObject({ late: false, penaltyPct: 0 });
    await http().put(`/v1/homework/${hwId}/marks`).set(as('teacher')).send({ entries: [{ studentId: t.students[2].id, marks: 18 }] }).expect(200);
    clock.at = start;

    const push = (await http().post(`/v1/homework/${hwId}/push-marks`).set(as('teacher')).expect(200)).body;
    expect(push).toMatchObject({ students: 3, unmarked: 1 });
    const m = (await owner.query(`select s.roll_no, m.marks::float, m.absent from marks m join students s on s.id = m.student_id where m.assessment_id = $1 order by s.roll_no`, [push.assessmentId])).rows;
    expect(m).toEqual([{ roll_no: 'R1', marks: 13.5, absent: false }, { roll_no: 'R2', marks: null, absent: true }, { roll_no: 'R3', marks: 18, absent: false }]);
    expect((await http().post(`/v1/homework/${hwId}/push-marks`).set(as('teacher')).expect(200)).body.assessmentId).toBe(push.assessmentId);

    const rep = (await http().get(`/v1/lms/reports/assignments?sectionId=${t.section.id}`).set(as('teacher')).expect(200)).body;
    expect(rep.assignments[0]).toMatchObject({ title: 'Case study 1', submitted: 2, missing: 1, compliancePct: 67 });
  });

  it('lists assignments through the kit, scoped to the teacher, and keeps handed-in work', async () => {
    const mine = (await http().get('/v1/records/assignments').set(as('teacher')).expect(200)).body;
    expect(mine.rows[0]).toMatchObject({ title: 'Case study 1', submitted: 2, late: 0, students: 3, maxMarks: 20 });
    expect((await http().get('/v1/records/assignments').set(as('teacher2')).expect(200)).body.total).toBe(0);
    await http().delete(`/v1/records/assignments/${hwId}`).set(as('teacher')).expect(403);
    await http().get('/v1/records/assignments').set(as('parent')).expect(403);
    expect((await http().get('/v1/records/assignments').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('runs a quiz from a pool, with a time limit, attempts, marking and item analysis', async () => {
    const quiz = (await http().post('/v1/lms/quizzes').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Unit 1 quiz', opensAt: new Date(start.getTime() - 3600_000), closesAt: new Date(start.getTime() + 86400_000), durationMin: 20, maxAttempts: 2, drawCount: 2 }).expect(201)).body;
    await http().post('/v1/lms/quizzes').set(as('teacher2')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Not mine', opensAt: start, closesAt: new Date(start.getTime() + 3600_000) }).expect(403);
    await http().post(`/v1/lms/quizzes/${quiz.id}/questions`).set(as('teacher')).send({ kind: 'mcq', text: 'Pick one', options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] }).expect(400);
    const q1 = (await http().post(`/v1/lms/quizzes/${quiz.id}/questions`).set(as('teacher')).send({ kind: 'mcq', text: 'Goodwill is a', options: [{ text: 'Fictitious asset', correct: false }, { text: 'Intangible asset', correct: true }], marks: 2 }).expect(201)).body;
    const q2 = (await http().post(`/v1/lms/quizzes/${quiz.id}/questions`).set(as('teacher')).send({ kind: 'short', text: 'Capital of India', answer: 'Delhi|New Delhi' }).expect(201)).body;
    await http().post(`/v1/lms/quizzes/${quiz.id}/publish`).set(as('teacher')).expect(200);
    await http().post(`/v1/lms/quizzes/${quiz.id}/questions`).set(as('teacher')).send({ kind: 'short', text: 'Late add', answer: 'x' }).expect(409);

    const mine = (await http().get('/v1/lms/my-quizzes').set(as('student')).expect(200)).body;
    expect(mine[0]).toMatchObject({ title: 'Unit 1 quiz', canStart: true, attempts: [] });
    const a1 = (await http().post(`/v1/lms/quizzes/${quiz.id}/start`).set(as('student')).expect(200)).body;
    expect(a1.questions).toHaveLength(2);
    expect(JSON.stringify(a1.questions)).not.toContain('correct');
    expect((await http().post(`/v1/lms/quizzes/${quiz.id}/start`).set(as('student')).expect(200)).body.attemptId).toBe(a1.attemptId);
    await http().put(`/v1/lms/quiz-attempts/${a1.attemptId}/answers`).set(as('student')).send({ answers: { [q1.id]: [1] } }).expect(200);
    const r1 = (await http().post(`/v1/lms/quiz-attempts/${a1.attemptId}/submit`).set(as('student')).send({ answers: { [q2.id]: 'mumbai' } }).expect(200)).body;
    expect(r1).toMatchObject({ score: 2, maxScore: 3, needsMarking: false });

    // The second attempt runs out of time: answers given after it are not taken.
    const a2 = (await http().post(`/v1/lms/quizzes/${quiz.id}/start`).set(as('student')).expect(200)).body;
    clock.at = new Date(start.getTime() + 25 * 60_000);
    await http().put(`/v1/lms/quiz-attempts/${a2.attemptId}/answers`).set(as('student')).send({ answers: { [q2.id]: 'Delhi' } }).expect(409);
    const r2 = (await http().post(`/v1/lms/quiz-attempts/${a2.attemptId}/submit`).set(as('student')).send({ answers: { [q2.id]: 'Delhi' } }).expect(200)).body;
    expect(r2.score).toBe(0);
    await http().post(`/v1/lms/quizzes/${quiz.id}/start`).set(as('student')).expect(409);
    clock.at = start;

    const analysis = (await http().get(`/v1/lms/quizzes/${quiz.id}/analysis`).set(as('teacher')).expect(200)).body;
    expect(analysis).toMatchObject({ attempts: 2 });
    expect(analysis.items.find((i: { questionId: string }) => i.questionId === q1.id)).toMatchObject({ attempts: 2, difficulty: 0.5 });

    const kit = (await http().get('/v1/records/lms-quizzes').set(as('teacher')).expect(200)).body;
    expect(kit.rows[0]).toMatchObject({ title: 'Unit 1 quiz', questions: 2, attempts: 2, status: 'published' });
    await http().delete(`/v1/records/lms-quizzes/${quiz.id}`).set(as('teacher')).expect(403);
    const dup = (await http().post(`/v1/records/lms-quizzes/${quiz.id}/duplicate`).set(as('teacher')).expect(201)).body;
    expect(dup).toMatchObject({ title: 'Unit 1 quiz (copy)', status: 'draft' });
    const closed = (await http().post('/v1/records/lms-quizzes/bulk').set(as('teacher')).send({ op: 'action', action: 'close', target: { ids: [quiz.id, dup.id] } }).expect(200)).body;
    expect(closed).toMatchObject({ succeeded: 1, failed: 1 });
  });

  it('leaves a coding answer to the teacher when no runner is available', async () => {
    const quiz = (await http().post('/v1/lms/quizzes').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Lab test', opensAt: new Date(start.getTime() - 3600_000), closesAt: new Date(start.getTime() + 3600_000), shuffle: false }).expect(201)).body;
    await http().post(`/v1/lms/quizzes/${quiz.id}/questions`).set(as('teacher')).send({ kind: 'code', text: 'Print the sum', language: 'c' }).expect(400);
    const q = (await http().post(`/v1/lms/quizzes/${quiz.id}/questions`).set(as('teacher')).send({ kind: 'code', text: 'Print the sum of two numbers', language: 'c', marks: 5, tests: [{ stdin: '2 3', expected: '5' }] }).expect(201)).body;
    await http().post(`/v1/lms/quizzes/${quiz.id}/publish`).set(as('teacher')).expect(200);
    const a = (await http().post(`/v1/lms/quizzes/${quiz.id}/start`).set(as('student')).expect(200)).body;
    const r = (await http().post(`/v1/lms/quiz-attempts/${a.attemptId}/submit`).set(as('student')).send({ answers: { [q.id]: 'int main(){int a,b;scanf("%d %d",&a,&b);printf("%d",a+b);}' } }).expect(200)).body;
    expect(r).toMatchObject({ needsMarking: true, score: 0 });
    await http().put(`/v1/lms/quiz-attempts/${a.attemptId}/mark`).set(as('teacher')).send({ questionId: q.id, marks: 6 }).expect(400);
    const m = (await http().put(`/v1/lms/quiz-attempts/${a.attemptId}/mark`).set(as('teacher')).send({ questionId: q.id, marks: 5 }).expect(200)).body;
    expect(m).toMatchObject({ score: 5, needsMarking: false });
  });

  it('releases course items by date, prerequisite and audience, and reports engagement', async () => {
    const c = (await http().post('/v1/lms/courses').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id }).expect(201)).body;
    const mod = (await http().post(`/v1/lms/courses/${c.id}/modules`).set(as('teacher')).send({ title: 'Unit 1' }).expect(201)).body;
    const i1 = (await http().post(`/v1/lms/modules/${mod.id}/items`).set(as('teacher')).send({ kind: 'link', title: 'Reading', url: 'https://example.org/a' }).expect(201)).body;
    const i2 = (await http().post(`/v1/lms/modules/${mod.id}/items`).set(as('teacher')).send({ kind: 'link', title: 'Practice', url: 'https://example.org/b' }).expect(201)).body;
    const i3 = (await http().post(`/v1/lms/modules/${mod.id}/items`).set(as('teacher')).send({ kind: 'link', title: 'Next week', url: 'https://example.org/c' }).expect(201)).body;
    const i4 = (await http().post(`/v1/lms/modules/${mod.id}/items`).set(as('teacher')).send({ kind: 'link', title: 'Remedial', url: 'https://example.org/d' }).expect(201)).body;
    await http().patch(`/v1/lms/courses/${c.id}`).set(as('teacher')).send({ status: 'published' }).expect(200);
    await http().patch(`/v1/lms/items/${i2.id}/access`).set(as('teacher')).send({ prerequisiteItemId: i2.id }).expect(400);
    await http().patch(`/v1/lms/items/${i2.id}/access`).set(as('teacher')).send({ prerequisiteItemId: i1.id }).expect(200);
    await http().patch(`/v1/lms/items/${i1.id}/access`).set(as('teacher')).send({ prerequisiteItemId: i2.id }).expect(400);
    await http().patch(`/v1/lms/items/${i3.id}/access`).set(as('teacher')).send({ releaseAt: new Date(start.getTime() + 14 * 86400_000) }).expect(200);
    await http().patch(`/v1/lms/items/${i4.id}/access`).set(as('teacher')).send({ audienceStudentIds: [t.students[0].id] }).expect(200);

    const view = (await http().get(`/v1/lms/courses/${c.id}`).set(as('student')).expect(200)).body;
    const items = view.modules[0].items;
    expect(items.map((i: { title: string; locked: boolean }) => [i.title, i.locked])).toEqual([['Reading', false], ['Practice', true]]);
    expect(items[1].url).toBeNull();
    await http().post(`/v1/lms/items/${i2.id}/progress`).set(as('student')).send({}).expect(409);
    await http().post(`/v1/lms/items/${i3.id}/progress`).set(as('student')).send({}).expect(404);
    await http().post(`/v1/lms/items/${i1.id}/progress`).set(as('student')).send({ completed: true }).expect(200);
    expect((await http().get(`/v1/lms/courses/${c.id}`).set(as('student')).expect(200)).body.modules[0].items[1]).toMatchObject({ title: 'Practice', locked: false, url: 'https://example.org/b' });
    expect((await http().get(`/v1/lms/courses/${c.id}`).set(as('parent')).expect(200)).body.modules[0].items.map((i: { title: string }) => i.title)).toContain('Remedial');

    const an = (await http().get(`/v1/lms/courses/${c.id}/analytics`).set(as('teacher')).expect(200)).body;
    expect(an.items.find((i: { id: string }) => i.id === i1.id)).toMatchObject({ students: 1, completed: 1, reachPct: 33 });
    expect(an.students.find((s: { rollNo: string }) => s.rollNo === 'R3')).toMatchObject({ opened: 1, completed: 1, engagementPct: 25 });
    await http().post(`/v1/lms/items/${i4.id}/assign-slow-learners`).set(as('teacher')).expect(400);
  });

  it('gives the student a calendar of deadlines', async () => {
    const cal = (await http().get(`/v1/lms/my-calendar?from=${day(-1)}&to=${day(10)}`).set(as('student')).expect(200)).body;
    expect(cal.items.map((i: { kind: string; title: string }) => `${i.kind}:${i.title}`)).toEqual(expect.arrayContaining(['homework:Case study 1', 'quiz:Lab test']));
    expect(cal.items.find((i: { title: string }) => i.title === 'Case study 1')).toMatchObject({ date: day(5), extended: true, done: true });
  });
});
