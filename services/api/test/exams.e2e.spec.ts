import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';
import * as s from '../src/db/schema.js';
import { drizzle } from 'drizzle-orm/node-postgres';

describe('assessment schemes, exams and results', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const [A, B, C] = [0, 1, 2];
  let scaleId: string;
  let sessionId: string;
  let iaId: string;
  let seeId: string;
  let comps: { id: string; code: string }[];

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
    };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const enter = (assessmentId: string, values: number[]) =>
    http().put(`/v1/assessments/${assessmentId}/marks`).set(as('teacher')).send({ entries: values.map((marks, i) => ({ studentId: t.students[i].id, marks })) });
  const actions = async () => (await owner.query('select action from audit_log where tenant_id = $1', [t.tenantId])).rows.map((r) => r.action as string);

  it('sets up a grade scale and a Bangalore University NEP scheme (authorised, validated, audited)', async () => {
    const presets = (await http().get('/v1/scheme-presets').set(as('teacher')).expect(200)).body;
    expect(Object.keys(presets.gradeScales)).toEqual(expect.arrayContaining(['bu-nep', 'cbse']));
    await http().post('/v1/grade-scales').set(as('teacher')).send({ name: 'x', preset: 'bu-nep' }).expect(403);
    await http().post('/v1/grade-scales').set(as('principal')).send({ name: 'bad', rules: { bands: [{ grade: 'A', minPercent: 50, gradePoint: 10, pass: true }], pointsMode: 'band', decimals: 2 } }).expect(400);
    scaleId = (await http().post('/v1/grade-scales').set(as('principal')).send({ name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;

    const body = {
      subjectId: t.subject.id,
      academicYearId: t.section.academicYearId,
      name: 'BU NEP theory',
      credits: 4,
      gradeScaleId: scaleId,
      passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
      components: [
        { code: 'IA', name: 'Internal assessment', kind: 'internal', weight: 40 },
        { code: 'SEE', name: 'Semester end exam', kind: 'external', weight: 60 },
      ],
    };
    await http().put('/v1/schemes').set(as('teacher')).send(body).expect(403);
    await http().put('/v1/schemes').set(as('principal')).send({ ...body, components: [{ ...body.components[0], weight: 30 }, body.components[1]] }).expect(400);
    const saved = (await http().put('/v1/schemes').set(as('principal')).send(body).expect(200)).body;
    comps = saved.components;
    expect(comps.map((c) => c.code)).toEqual(['IA', 'SEE']);
    // Saving again edits in place and keeps component ids.
    const again = (await http().put('/v1/schemes').set(as('principal')).send({ ...body, credits: 4 }).expect(200)).body;
    expect(again.components.map((c: { id: string }) => c.id)).toEqual(comps.map((c) => c.id));
    expect((await http().get(`/v1/schemes?subjectId=${t.subject.id}&academicYearId=${t.section.academicYearId}`).set(as('teacher')).expect(200)).body.credits).toBe(4);
  });

  it('runs the marks workflow: draft, submit, verify, moderate, reopen', async () => {
    iaId = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Internal assessment', kind: 'internal', maxMarks: 40, heldOn: '2026-10-20', componentId: comps[0].id }).expect(201)).body.id;
    await http().post(`/v1/assessments/${iaId}/submit`).set(as('teacher')).expect(400); // nobody has marks yet
    await enter(iaId, [32, 20, 40]).expect(200);
    await http().post(`/v1/assessments/${iaId}/submit`).set(as('teacher2')).expect(403);
    await http().post(`/v1/assessments/${iaId}/submit`).set(as('teacher')).expect(200);
    await enter(iaId, [1, 1, 1]).expect(409); // locked once submitted
    await http().post(`/v1/assessments/${iaId}/verify`).set(as('teacher')).expect(403);
    await http().post(`/v1/assessments/${iaId}/moderate`).set(as('principal')).send({ adjustments: [{ studentId: t.students[B].id, moderatedMarks: 24, note: 'grace' }] }).expect(409); // not verified yet
    await http().post(`/v1/assessments/${iaId}/verify`).set(as('principal')).expect(200);
    await http().post(`/v1/assessments/${iaId}/moderate`).set(as('principal')).send({ adjustments: [{ studentId: t.students[B].id, moderatedMarks: 50, note: 'x' }] }).expect(400);
    const mod = (await http().post(`/v1/assessments/${iaId}/moderate`).set(as('principal')).send({ adjustments: [{ studentId: t.students[B].id, moderatedMarks: 24, note: 'Grace marks per BoS' }] }).expect(200)).body;
    expect(mod.markStatus).toBe('moderated');
    expect(mod.students.find((x: { id: string }) => x.id === t.students[B].id)).toMatchObject({ marks: 20, moderatedMarks: 24 });
    // Reopening clears moderation; do it once to prove it, then repeat.
    await http().post(`/v1/assessments/${iaId}/reopen`).set(as('principal')).expect(200);
    expect((await http().get(`/v1/assessments/${iaId}`).set(as('teacher')).expect(200)).body.students[B].moderatedMarks).toBeNull();
    await http().post(`/v1/assessments/${iaId}/submit`).set(as('teacher')).expect(200);
    await http().post(`/v1/assessments/${iaId}/verify`).set(as('principal')).expect(200);
    await http().post(`/v1/assessments/${iaId}/moderate`).set(as('principal')).send({ adjustments: [{ studentId: t.students[B].id, moderatedMarks: 24, note: 'Grace marks per BoS' }] }).expect(200);
  });

  it('schedules papers, seats candidates and issues hall tickets', async () => {
    const body = { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Semester 3 end exam Nov 2026', startsOn: '2026-11-02', endsOn: '2026-11-20' };
    await http().post('/v1/exam-sessions').set(as('teacher')).send(body).expect(403);
    await http().post('/v1/exam-sessions').set(as('principal')).send({ ...body, endsOn: '2026-10-01' }).expect(400);
    sessionId = (await http().post('/v1/exam-sessions').set(as('principal')).send(body).expect(201)).body.id;
    await http().get(`/v1/exam-sessions/${sessionId}`).set(as('otherPrincipal')).expect(404); // other institution

    const paper = { subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 };
    await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send({ ...paper, examDate: '2026-12-25' }).expect(400);
    const p1 = (await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send(paper).expect(201)).body;
    await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send(paper).expect(409);
    seeId = p1.assessmentId;
    expect((await http().get(`/v1/assessments/${seeId}`).set(as('teacher')).expect(200)).body.componentId).toBe(comps[1].id); // linked to the SEE component

    await http().post(`/v1/exam-sessions/${sessionId}/hall-tickets`).set(as('principal')).send({}).expect(409); // not scheduled yet
    await http().post(`/v1/exam-sessions/${sessionId}/schedule`).set(as('principal')).expect(200);
    const [r2] = await db.insert(s.rooms).values({ tenantId: t.tenantId, campusId: t.campus.id, name: 'Hall 2' }).returning();
    await http().post(`/v1/exam-sessions/${sessionId}/seating`).set(as('principal')).send({ halls: [{ roomId: t.room.id, capacity: 2 }] }).expect(400); // 3 candidates, 2 seats
    expect((await http().post(`/v1/exam-sessions/${sessionId}/seating`).set(as('principal')).send({ halls: [{ roomId: t.room.id, capacity: 2 }, { roomId: r2.id, capacity: 5 }] }).expect(200)).body.seated).toBe(3);
    const plan = (await http().get(`/v1/exam-sessions/${sessionId}/seating`).set(as('principal')).expect(200)).body;
    expect(plan.map((x: { rollNo: string; room: string; seatNo: number }) => `${x.room}:${x.seatNo}:${x.rollNo}`).sort()).toEqual(['Hall 2:1:R3', 'Room 1:1:R1', 'Room 1:2:R2']);

    expect((await http().post(`/v1/exam-sessions/${sessionId}/hall-tickets`).set(as('principal')).send({ blocks: [{ studentId: t.students[C].id, reason: 'Fee dues' }] }).expect(200)).body).toEqual({ issued: 2, blocked: 1 });
    const pdf = await http().get(`/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[A].id}/pdf`).set(as('parentA')).buffer().parse((res, cb) => { const d: Buffer[] = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.body as Buffer).toString('latin1')).toContain('Corporate Accounting');
    await http().get(`/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[A].id}/pdf`).set(as('parentB')).expect(404); // not their child
    await http().get(`/v1/exam-sessions/${sessionId}/hall-tickets/${t.students[C].id}/pdf`).set(as('student')).expect(403); // withheld
  });

  it('refuses to process until marks are verified, then grades with SGPA/CGPA to the known values', async () => {
    const blocked = await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(409);
    expect(blocked.body.problems.join(' ')).toMatch(/not verified/);
    await enter(seeId, [45, 24, 23]).expect(200);
    await http().post(`/v1/assessments/${seeId}/submit`).set(as('teacher')).expect(200);
    await http().post(`/v1/assessments/${seeId}/verify`).set(as('principal')).expect(200);
    expect((await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('teacher')).expect(403)).status).toBe(403);
    expect((await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(200)).body).toEqual({ students: 3, passed: 2, failed: 1 });

    const rows = (await http().get(`/v1/exam-sessions/${sessionId}/results`).set(as('principal')).expect(200)).body;
    const by = (i: number) => rows.find((r: { rollNo: string }) => r.rollNo === `R${i + 1}`);
    // A: 32 + 45 = 77 -> A, 7.7. B: moderated 24 + 24 = 48 -> P, 4.8. C: 40 + 23 = 63 but SEE 38.3% < 40% -> F.
    expect(by(A)).toMatchObject({ sgpa: 7.7, cgpa: 7.7, outcome: 'pass', creditsEarned: 4 });
    expect(by(A).lines[0]).toMatchObject({ percent: 77, grade: 'A', gradePoint: 7.7 });
    expect(by(B)).toMatchObject({ sgpa: 4.8, outcome: 'pass' });
    expect(by(B).lines[0]).toMatchObject({ percent: 48, grade: 'P' });
    expect(by(C)).toMatchObject({ sgpa: 0, cgpa: 0, outcome: 'fail', creditsEarned: 0 });
    expect(by(C).lines[0]).toMatchObject({ percent: 63, grade: 'F', passed: false });

    const csv = await http().get(`/v1/exam-sessions/${sessionId}/results.csv`).set(as('principal')).expect(200);
    expect(csv.text).toContain('R1,Student A');
    const detail = (await http().get(`/v1/exam-sessions/${sessionId}`).set(as('principal')).expect(200)).body;
    expect(detail.stats).toMatchObject({ students: 3, passed: 2, passPercent: 66.7 });
    // Families see nothing before publication.
    expect((await http().get(`/v1/results/students/${t.students[A].id}`).set(as('parentA')).expect(200)).body.terms).toEqual([]);
    await http().post(`/v1/assessments/${seeId}/reopen`).set(as('principal')).expect(409); // processed: marks are frozen
  });

  it('publishes, shows results to the student and family, and keeps the marks API working', async () => {
    await http().post(`/v1/exam-sessions/${sessionId}/lock`).set(as('principal')).expect(409);
    await http().post(`/v1/exam-sessions/${sessionId}/publish`).set(as('principal')).expect(200);
    await http().post(`/v1/exam-sessions/${sessionId}/publish`).set(as('principal')).expect(409);
    const mine = (await http().get(`/v1/results/students/${t.students[A].id}`).set(as('parentA')).expect(200)).body;
    expect(mine.cgpa).toBe(7.7);
    expect(mine.terms[0]).toMatchObject({ sessionName: 'Semester 3 end exam Nov 2026', sgpa: 7.7 });
    expect(mine.terms[0].lines[0]).toMatchObject({ code: 'BCOM-3.1', grade: 'A' });
    await http().get(`/v1/results/students/${t.students[A].id}`).set(as('parentB')).expect(404);
    expect((await http().get(`/v1/results/students/${t.students[C].id}`).set(as('student')).expect(200)).body.terms[0].lines[0].grade).toBe('F');

    // The existing marks screen of the Student and Parent apps still works, with moderated marks.
    const marks = (await http().get(`/v1/marks/students/${t.students[B].id}`).set(as('parentB')).expect(200)).body;
    expect(marks.assessments.find((a: { title: string }) => a.title === 'Semester 3 end exam Nov 2026 - Corporate Accounting')).toMatchObject({ marks: 24, maxMarks: 60 });

    const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };
    const card = await http().get(`/v1/results/students/${t.students[A].id}/marks-card.pdf?sessionId=${sessionId}`).set(as('parentA')).buffer().parse(bin).expect(200);
    expect((card.body as Buffer).toString('latin1')).toContain('SGPA: 7.70');
    const tr = await http().get(`/v1/results/students/${t.students[A].id}/transcript.pdf`).set(as('parentA')).buffer().parse(bin).expect(200);
    expect((tr.body as Buffer).toString('latin1')).toContain('Overall CGPA: 7.70');
    await http().get(`/v1/results/students/${t.students[A].id}/transcript.pdf`).set(as('parentB')).expect(404);
  });

  it('handles revaluation and re-grades the student, then locks the results', async () => {
    const rq = { sessionId, subjectId: t.subject.id, reason: 'Totalling error suspected' };
    const r = (await http().post(`/v1/results/students/${t.students[B].id}/revaluations`).set(as('parentB')).send(rq).expect(201)).body;
    expect(r.previousPercent).toBe(48);
    await http().post(`/v1/results/students/${t.students[B].id}/revaluations`).set(as('parentB')).send(rq).expect(409); // already open
    await http().post(`/v1/results/students/${t.students[A].id}/revaluations`).set(as('parentB')).send(rq).expect(404);
    await http().post(`/v1/revaluations/${r.id}/complete`).set(as('principal')).send({ marks: 40 }).expect(409); // must be accepted first
    await http().post(`/v1/revaluations/${r.id}/decide`).set(as('teacher')).send({ accept: true }).expect(403);
    await http().post(`/v1/revaluations/${r.id}/decide`).set(as('principal')).send({ accept: true }).expect(200);
    await http().post(`/v1/revaluations/${r.id}/complete`).set(as('principal')).send({ marks: 61 }).expect(400);
    // SEE 40/60 -> 40; with IA moderated 24: 64 -> B+, 6.4.
    expect((await http().post(`/v1/revaluations/${r.id}/complete`).set(as('principal')).send({ marks: 40 }).expect(200)).body).toMatchObject({ previousPercent: 48, newPercent: 64, sgpa: 6.4, cgpa: 6.4 });
    expect((await http().get(`/v1/exam-sessions/${sessionId}/revaluations`).set(as('principal')).expect(200)).body[0].status).toBe('completed');

    await http().post(`/v1/exam-sessions/${sessionId}/lock`).set(as('principal')).expect(200);
    await http().post(`/v1/results/students/${t.students[B].id}/revaluations`).set(as('parentB')).send(rq).expect(409); // window closed
    await http().post('/v1/exam-sessions/' + sessionId + '/process').set(as('principal')).expect(409);
  });

  it('leaves an audit trail of every step', async () => {
    expect(await actions()).toEqual(
      expect.arrayContaining(['gradescale.created', 'scheme.created', 'marks.submitted', 'marks.verified', 'marks.moderated', 'marks.reopened', 'exam.session.created', 'exam.paper.added', 'exam.seating.generated', 'exam.halltickets.issued', 'exam.results.processed', 'exam.results.published', 'revaluation.requested', 'revaluation.accepted', 'revaluation.completed', 'exam.results.locked', 'transcript.generated']),
    );
  });
});
