import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';
import { allocateRoundRobin, differsBeyond, finalMarks, newDummyNo, pickSecondValuation } from '../src/evaluation/evaluation.logic.js';
import { progression, rankDescending } from '../src/exams/ranks.js';

describe('evaluation and rank rules', () => {
  it('round-robin respects the cap and exclusions', () => {
    const plan = allocateRoundRobin([{ id: 'a', exclude: [] }, { id: 'b', exclude: [] }, { id: 'c', exclude: [] }], [{ id: 'x', load: 0 }, { id: 'y', load: 0 }], 2);
    expect([...plan.values()].filter((v) => v === 'x')).toHaveLength(2);
    expect(() => allocateRoundRobin([{ id: 'a', exclude: [] }, { id: 'b', exclude: [] }, { id: 'c', exclude: [] }], [{ id: 'x', load: 0 }], 2)).toThrow(RangeError);
    expect(allocateRoundRobin([{ id: 'a', exclude: ['x'] }], [{ id: 'x', load: 0 }, { id: 'y', load: 5 }], 6).get('a')).toBe('y');
  });
  it('picks an even share for second valuation and works out final marks', () => {
    const s = ['1', '2', '3', '4', '5'].map((n) => ({ id: n, dummyNo: n }));
    expect(pickSecondValuation(s, 40)).toHaveLength(2);
    expect(pickSecondValuation(s, 0)).toEqual([]);
    expect(differsBeyond(20, 31, 10)).toBe(true);
    expect(differsBeyond(20, 30, 10)).toBe(false);
    expect(finalMarks({ first: 20, second: 30, third: null, secondRequired: true, thirdRequired: false })).toBe(25);
    expect(finalMarks({ first: 20, second: 40, third: null, secondRequired: true, thirdRequired: true })).toBeNull();
    expect(finalMarks({ first: 20, second: 40, third: 31, secondRequired: true, thirdRequired: true })).toBe(31);
    expect(newDummyNo(new Set())).toMatch(/^\d{7}$/);
  });
  it('ties share a rank and the next is skipped', () => {
    expect(rankDescending([{ s: 7.7 }, { s: 7.7 }, { s: 6 }, { s: 5 }], (x) => x.s).map((x) => x.rank)).toEqual([1, 1, 3, 4]);
    expect(progression({ creditsEarned: 3, backlogs: 2 }, { minCreditsEarned: 4, maxBacklogs: 1 })).toEqual({ eligible: false, reasons: ['credits', 'backlogs'] });
    expect(progression({ creditsEarned: 3, backlogs: 2 }, { minCreditsEarned: null, maxBacklogs: null }).eligible).toBe(true);
  });
});

describe('on-screen evaluation, exam controller depth and results depth', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const au = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(au(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(au(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(au(who)).send(body);
  const q = async <R = { id: string }>(sql: string, args: unknown[]) => (await owner.query(sql, args)).rows as R[];
  const ids: Record<string, string> = {};
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const rolls = ['R1', 'R2', 'R3', 'R4'];
  const dummyOf: Record<string, string> = {};
  const seen = new Set<string>();

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
      outsider: await login(other.slug, other.principal.email!),
    };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  /** The valuations an examiner holds, with the ones seen before filtered out when `fresh`. */
  const mine = async (who: string) => (await get(who, '/v1/evaluation/allocations/mine').expect(200)).body as { id: string; dummyNo: string; round: number; status: string }[];
  /** Enters and submits marks totalling `total` (10 on Q1, the rest on Q2) for one valuation. */
  const value = async (who: string, allocId: string, total: number) => {
    const detail = (await get(who, `/v1/evaluation/allocations/${allocId}`).expect(200)).body;
    const [q1, q2] = detail.questions as { id: string }[];
    await put(who, `/v1/evaluation/allocations/${allocId}/marks`, { entries: [{ questionId: q1.id, marks: 10, comment: 'ok' }, { questionId: q2.id, marks: total - 10 }] }).expect(200);
    return await post(who, `/v1/evaluation/allocations/${allocId}/submit`);
  };
  const allocFor = async (who: string, roll: string, round: number) => (await mine(who)).find((a) => a.dummyNo === dummyOf[roll] && a.round === round);

  it('sets up a scheme, a session, a paper and four students', async () => {
    const scale = (await post('principal', '/v1/grade-scales', { name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
    const comps = (await put('principal', '/v1/schemes', {
      subjectId: t.subject.id,
      academicYearId: t.section.academicYearId,
      name: 'BU NEP theory',
      credits: 4,
      gradeScaleId: scale,
      passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
      components: [
        { code: 'IA', name: 'Internal', kind: 'internal', weight: 40 },
        { code: 'SEE', name: 'Semester end', kind: 'external', weight: 60 },
      ],
    }).expect(200)).body.components as { id: string; code: string }[];
    const [d] = await q<{ id: string }>(`insert into students (tenant_id, section_id, roll_no, full_name) values ($1,$2,'R4','Student D') returning id`, [t.tenantId, t.section.id]);
    ids.D = d.id;
    // Internal marks (verified): A 32, B 20, C 20, D 32.
    ids.ia = (await q(`insert into assessments (tenant_id, section_id, subject_id, title, kind, max_marks, held_on, created_by, mark_status, component_id) values ($1,$2,$3,'IA','internal',40,'2026-09-01',$4,'verified',$5) returning id`, [t.tenantId, t.section.id, t.subject.id, t.teacher.id, comps[0].id]))[0].id;
    const people = [t.students[0].id, t.students[1].id, t.students[2].id, ids.D];
    for (const [i, m] of [32, 20, 20, 32].entries()) await q(`insert into marks (tenant_id, assessment_id, student_id, marks) values ($1,$2,$3,$4)`, [t.tenantId, ids.ia, people[i], m]);

    ids.session = (await post('principal', '/v1/exam-sessions', { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Sem 3 end exam', startsOn: '2026-11-02', endsOn: '2026-11-20' }).expect(201)).body.id;
    const paper = (await post('principal', `/v1/exam-sessions/${ids.session}/papers`, { subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body;
    ids.paper = paper.id;
    ids.see = paper.assessmentId;
    await post('principal', `/v1/exam-sessions/${ids.session}/schedule`).expect(200);
  });

  describe('on-screen evaluation', () => {
    const E = () => `/v1/evaluation/papers/${ids.paper}`;

    it('only the exam office sets up the paper; the question marks must add up', async () => {
      await put('teacher', `${E()}/questions`, { questions: [{ no: '1', maxMarks: 60 }] }).expect(403);
      await put('principal', `${E()}/questions`, { questions: [{ no: '1', maxMarks: 20 }, { no: '2', maxMarks: 30 }] }).expect(400);
      await put('principal', `${E()}/questions`, { questions: [{ no: '1', maxMarks: 20 }, { no: '2', maxMarks: 40 }] }).expect(200);
      await put('principal', `${E()}/config`, { perExaminerCap: 2, secondSharePercent: 100, thresholdMarks: 5 }).expect(200);
      await get('outsider', E()).expect(404);
    });

    it('uploads scans under a dummy number only, and rejects bad files and repeats', async () => {
      const up = (roll: string, ctype = 'image/png') => http().post(`${E()}/scripts`).set(au('principal')).field('rollNo', roll).attach('files', PNG, { filename: 'scan.png', contentType: ctype });
      await up('R9').expect(404);
      await up('R1', 'text/plain').expect(400);
      await http().post(`${E()}/scripts`).set(au('teacher')).field('rollNo', 'R1').attach('files', PNG, { filename: 's.png', contentType: 'image/png' }).expect(403);
      for (const r of rolls) {
        const res = await up(r).expect(201);
        expect(res.body.dummyNo).toMatch(/^\d{7}$/);
        dummyOf[r] = res.body.dummyNo;
      }
      await up('R1').expect(409);
      expect(new Set(Object.values(dummyOf)).size).toBe(4);
    });

    it('caps the scripts per examiner when allocating', async () => {
      await post('principal', `${E()}/allocate`, { examinerIds: [t.teacher.id] }).expect(409); // 4 scripts, cap 2, one examiner
      await post('principal', `${E()}/allocate`, { examinerIds: [t.studentUser.id] }).expect(409); // not an examiner role
      expect((await mine('teacher')).length).toBe(0); // the failed allocation left nothing behind
      await put('principal', `${E()}/config`, { perExaminerCap: 4, secondSharePercent: 100, thresholdMarks: 5 }).expect(200);
      const r = await post('principal', `${E()}/allocate`, { examinerIds: [t.teacher.id, t.teacher2.id] }).expect(200);
      expect(r.body).toEqual({ first: 4, third: 0 });
      expect((await mine('teacher')).length).toBe(2);
      expect((await mine('teacher2')).length).toBe(2);
      await put('principal', `${E()}/questions`, { questions: [{ no: '1', maxMarks: 60 }] }).expect(409); // valuation has started
    });

    it('shows an evaluator the script and questions but nothing that identifies the student', async () => {
      const a = (await mine('teacher'))[0];
      const detail = (await get('teacher', `/v1/evaluation/allocations/${a.id}`).expect(200)).body;
      const text = JSON.stringify([detail, await mine('teacher')]);
      for (const secret of [...t.students.map((s) => s.fullName), 'Student D', ...rolls, ...t.students.map((s) => s.id), ids.D]) expect(text).not.toContain(secret);
      expect(detail.questions).toHaveLength(2);
      expect(detail.pages).toEqual([{ index: 0, name: 'page-1', mime: 'image/png' }]);
      const page = await get('teacher', `/v1/evaluation/allocations/${a.id}/pages/0`).buffer(true).parse((res, cb) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); }).expect(200);
      expect((page.body as Buffer).equals(PNG)).toBe(true);
      await get('teacher2', `/v1/evaluation/allocations/${a.id}`).expect(404); // someone else's valuation
      await get('student', '/v1/evaluation/allocations/mine').expect(403);
      await get('parentA', `/v1/evaluation/allocations/${a.id}`).expect(403);
    });

    it('validates marks per question and requires every question before submit', async () => {
      const a = (await mine('teacher'))[0];
      const detail = (await get('teacher', `/v1/evaluation/allocations/${a.id}`).expect(200)).body;
      const [q1, q2] = detail.questions as { id: string; maxMarks: number }[];
      await put('teacher', `/v1/evaluation/allocations/${a.id}/marks`, { entries: [{ questionId: q1.id, marks: q1.maxMarks + 1 }] }).expect(400);
      await put('teacher', `/v1/evaluation/allocations/${a.id}/marks`, { entries: [{ questionId: q1.id, marks: 5, comment: 'partial' }] }).expect(200);
      await post('teacher', `/v1/evaluation/allocations/${a.id}/submit`).expect(409); // question 2 missing
      expect((await get('teacher', `/v1/evaluation/allocations/${a.id}`).expect(200)).body.entries).toHaveLength(1); // saved and resumable
      expect(q2.maxMarks).toBe(40);
    });

    it('first valuations come in; the second valuation goes to a different examiner who cannot see the first marks', async () => {
      const first: Record<string, number> = { R1: 45, R2: 22, R3: 20, R4: 45 };
      await post('principal', `${E()}/second-valuation`, { examinerIds: [t.teacher.id, t.teacher2.id] }).expect(409); // first valuations not all in
      for (const r of rolls) {
        const who = (await allocFor('teacher', r, 1)) ? 'teacher' : 'teacher2';
        const a = (await allocFor(who, r, 1))!;
        ids[`first_${r}`] = who;
        expect((await value(who, a.id, first[r])).body).toMatchObject({ total: first[r], needsThird: false });
        await post(who, `/v1/evaluation/allocations/${a.id}/submit`).expect(409);
        await put(who, `/v1/evaluation/allocations/${a.id}/marks`, { entries: [{ questionId: (await get(who, `/v1/evaluation/allocations/${a.id}`)).body.questions[0].id, marks: 1 }] }).expect(409);
      }
      await post('principal', `${E()}/finalise`).expect(409); // second valuation not set up
      const r = await post('principal', `${E()}/second-valuation`, { examinerIds: [t.teacher.id, t.teacher2.id] }).expect(200);
      expect(r.body.picked).toBe(4);
      await post('principal', `${E()}/second-valuation`, { examinerIds: [t.teacher.id, t.teacher2.id] }).expect(409);
      for (const roll of rolls) {
        const second = ids[`first_${roll}`] === 'teacher' ? 'teacher2' : 'teacher';
        const a = await allocFor(second, roll, 2);
        expect(a, `second valuation of ${roll} goes to the other examiner`).toBeTruthy();
        const detail = (await get(second, `/v1/evaluation/allocations/${a!.id}`).expect(200)).body;
        expect(detail.entries).toEqual([]); // the first examiner's marks are not shown
        expect(detail.total).toBeNull();
      }
    });

    it('a second valuation far from the first triggers a third valuation by a new examiner', async () => {
      const second: Record<string, number> = { R1: 45, R2: 22, R3: 40, R4: 45 };
      for (const roll of rolls) {
        const who = ids[`first_${roll}`] === 'teacher' ? 'teacher2' : 'teacher';
        const a = (await allocFor(who, roll, 2))!;
        const res = await value(who, a.id, second[roll]);
        expect(res.status).toBe(200);
        expect(res.body.needsThird).toBe(roll === 'R3'); // |20 - 40| > 5
      }
      await post('principal', `${E()}/finalise`).expect(409); // R3 still needs a valuation
      const alloc = await post('principal', `${E()}/allocate`, { examinerIds: [t.teacher.id, t.teacher2.id, t.principal.id] }).expect(200);
      expect(alloc.body).toEqual({ first: 0, third: 1 });
      const a = (await allocFor('principal', 'R3', 3))!;
      expect(a).toBeTruthy(); // neither earlier examiner could take it
      expect((await value('principal', a.id, 20)).status).toBe(200);
    });

    it('pushes the final marks into the exam marks with audit, and the admin view shows the totals', async () => {
      const ov = (await get('principal', E()).expect(200)).body;
      expect(ov.scripts.find((s: { rollNo: string }) => s.rollNo === 'R3')).toMatchObject({ thirdRequired: true, totals: { 1: 20, 2: 40, 3: 20 } });
      expect((await post('principal', `${E()}/finalise`).expect(200)).body.pushed).toBe(4);
      await post('principal', `${E()}/finalise`).expect(409);
      const m = await q<{ student_id: string; marks: number }>(`select student_id, marks::float as marks from marks where assessment_id = $1`, [ids.see]);
      const byStudent = new Map(m.map((x) => [x.student_id, x.marks]));
      expect([t.students[0].id, t.students[1].id, t.students[2].id, ids.D].map((i) => byStudent.get(i))).toEqual([45, 22, 20, 45]);
      const audited = await q<{ action: string }>(`select action from audit_log where tenant_id = $1 and action like 'evaluation.%'`, [t.tenantId]);
      expect(audited.filter((a) => a.action === 'evaluation.marks_pushed')).toHaveLength(4);
      expect(audited.map((a) => a.action)).toEqual(expect.arrayContaining(['evaluation.script_uploaded', 'evaluation.allocated', 'evaluation.second_valuation_set', 'evaluation.submitted']));
    });
  });

  describe('results depth', () => {
    const S = () => `/v1/exam-sessions/${ids.session}`;

    it('processes the results (fails before grace)', async () => {
      await post('principal', `/v1/assessments/${ids.see}/verify`).expect(200);
      expect((await post('principal', `${S()}/process`).expect(200)).body).toEqual({ students: 4, passed: 2, failed: 2 });
    });

    it('reports progression under the session rule', async () => {
      await get('principal', `${S()}/progression`).expect(409); // no rule yet
      await put('teacher', `${S()}/result-rules`, { graceMaxPerSubject: 2, graceMaxTotal: 2 }).expect(403);
      await put('principal', `${S()}/result-rules`, { graceMaxPerSubject: 1, graceMaxTotal: 2 }).expect(200);
      await put('principal', `${S()}/result-rules`, { graceMaxPerSubject: -1, graceMaxTotal: 2 }).expect(400);
      await put('principal', `${S()}/result-rules`, { graceMaxPerSubject: 2, graceMaxTotal: 1, progressionMinCredits: 4, progressionMaxBacklogs: 0 }).expect(200);
      const r = (await get('principal', `${S()}/progression`).expect(200)).body;
      expect(r).toMatchObject({ eligible: 2, held: 2 });
      const c = r.students.find((s: { rollNo: string }) => s.rollNo === 'R3');
      expect(c).toMatchObject({ eligible: false, creditsEarned: 0, backlogs: 1, reasons: ['credits', 'backlogs'] });
    });

    it('applies grace marks within the per-subject and total limits, with audit', async () => {
      // Total limit 1: student B needs 2 marks (22 -> 24), so nothing is awarded.
      expect((await post('principal', `${S()}/grace`).expect(200)).body).toMatchObject({ awards: [], students: 0 });
      await put('principal', `${S()}/result-rules`, { graceMaxPerSubject: 2, graceMaxTotal: 2, progressionMinCredits: 4, progressionMaxBacklogs: 0 }).expect(200);
      await post('teacher', `${S()}/grace`).expect(403);
      const dry = (await post('principal', `${S()}/grace`, { dryRun: true }).expect(200)).body;
      expect(dry).toMatchObject({ dryRun: true, students: 1 });
      expect((await get('principal', `${S()}/grace`).expect(200)).body).toEqual([]); // nothing saved by the dry run
      const done = (await post('principal', `${S()}/grace`).expect(200)).body;
      // B gets 2 marks; C (20 -> would need 4) is beyond the limit and stays failed.
      expect(done.awards).toEqual([{ studentId: t.students[1].id, subjectId: t.subject.id, marks: 2 }]);
      const list = (await get('principal', `${S()}/grace`).expect(200)).body;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ rollNo: 'R2', marks: 2 });
      const [row] = await q<{ moderated_marks: number }>(`select moderated_marks::float as moderated_marks from marks where assessment_id = $1 and student_id = $2`, [ids.see, t.students[1].id]);
      expect(row.moderated_marks).toBe(24);
      const res = (await get('principal', `${S()}/results`).expect(200)).body;
      expect(res.find((r: { rollNo: string }) => r.rollNo === 'R2').outcome).toBe('pass');
      expect(res.find((r: { rollNo: string }) => r.rollNo === 'R3').outcome).toBe('fail');
      expect(await q(`select 1 as id from audit_log where tenant_id = $1 and action = 'exam.grace_applied'`, [t.tenantId])).toHaveLength(1);
      // Re-running gives nothing more.
      expect((await post('principal', `${S()}/grace`).expect(200)).body.awards).toEqual([]);
      expect((await get('principal', `${S()}/progression`).expect(200)).body).toMatchObject({ eligible: 3, held: 1 });
    });

    it('ranks students: ties share a rank, the next rank is skipped, failures are unranked', async () => {
      const r = (await get('principal', `${S()}/ranks?subjectId=${t.subject.id}`).expect(200)).body;
      const rank = (roll: string) => r.students.find((s: { rollNo: string }) => s.rollNo === roll);
      expect([rank('R1').classRank, rank('R4').classRank, rank('R2').classRank, rank('R3').classRank]).toEqual([1, 1, 3, null]);
      expect(rank('R1').programmeRank).toBe(1);
      expect(rank('R3').passed).toBe(false);
      expect(r.subject.map((s: { rank: number }) => s.rank)).toEqual([1, 1, 3]);
      await get('teacher', `${S()}/ranks`).expect(403);
    });

    it('publishes, then no more grace; the failed subject becomes a backlog', async () => {
      await post('principal', `${S()}/publish`).expect(200);
      await post('principal', `${S()}/grace`).expect(409);
      const b = (await get('student', `/v1/results/students/${t.students[2].id}/backlogs`).expect(200)).body;
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ code: 'BCOM-3.1', sessionId: ids.session });
      expect((await get('parentA', `/v1/results/students/${t.students[0].id}/backlogs`).expect(200)).body).toEqual([]);
      await get('parentB', `/v1/results/students/${t.students[2].id}/backlogs`).expect(404);
    });
  });

  describe('exam controller depth', () => {
    const S = () => `/v1/exam-sessions/${ids.session}`;
    const duty = (staffId: string, roomId: string, startsAt: string, endsAt: string) => post('principal', `${S()}/duties`, { staffId, roomId, dutyDate: '2026-11-05', startsAt, endsAt });

    it('rosters invigilators per room and slot without double booking', async () => {
      const [r2] = await q<{ id: string }>(`insert into rooms (tenant_id, campus_id, name) values ($1,$2,'Hall 2') returning id`, [t.tenantId, t.campus.id]);
      await post('teacher', `${S()}/duties`, { staffId: t.teacher.id, roomId: t.room.id, dutyDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00' }).expect(403);
      await post('principal', `${S()}/duties`, { staffId: t.teacher.id, roomId: t.room.id, dutyDate: '2026-12-25', startsAt: '10:00', endsAt: '13:00' }).expect(400);
      ids.duty1 = (await duty(t.teacher.id, t.room.id, '10:00', '13:00').expect(201)).body.id;
      await duty(t.teacher.id, r2.id, '12:00', '14:00').expect(409); // overlaps the same person's first duty
      await duty(t.teacher.id, r2.id, '13:00', '15:00').expect(201); // back to back is fine
      ids.duty2 = (await duty(t.teacher2.id, t.room.id, '10:00', '13:00').expect(201)).body.id; // another person, same room and slot
      expect((await get('principal', `${S()}/duties`).expect(200)).body).toHaveLength(3);
      expect((await get('teacher', '/v1/invigilation/mine').expect(200)).body).toHaveLength(2);
      // Substitution is also checked for clashes.
      await post('principal', `${S()}/duties/${ids.duty2}/substitute`, { staffId: t.teacher.id }).expect(409);
      const sub = (await post('principal', `${S()}/duties/${ids.duty1}/substitute`, { staffId: t.principal.id }).expect(200)).body;
      expect(sub).toMatchObject({ staffId: t.principal.id, status: 'substituted', substitutedFrom: t.teacher.id });
      await http().delete(`${S()}/duties/${ids.duty1}`).set(au('principal')).expect(200);
      expect((await get('outsider', `${S()}/duties`).expect(200)).body).toEqual([]);
    });

    it('registers a failed student for a supplementary session, and only for failed subjects', async () => {
      const sup = (await post('principal', '/v1/exam-sessions', { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Sem 3 supplementary', kind: 'supplementary', startsOn: '2026-12-01', endsOn: '2026-12-10' }).expect(201)).body.id;
      const body = { studentId: t.students[2].id, subjectIds: [t.subject.id] };
      await post('principal', `${S()}/supplementary`, body).expect(409); // the regular session is not supplementary
      await post('parentA', `/v1/exam-sessions/${sup}/supplementary`, { studentId: t.students[0].id, subjectIds: [t.subject.id] }).expect(400); // passed
      await post('parentA', `/v1/exam-sessions/${sup}/supplementary`, body).expect(404); // not their child
      const reg = await post('student', `/v1/exam-sessions/${sup}/supplementary`, body).expect(201);
      expect(reg.body[0]).toMatchObject({ studentId: t.students[2].id, failedInSessionId: ids.session });
      await post('student', `/v1/exam-sessions/${sup}/supplementary`, body).expect(409);
      const list = (await get('principal', `/v1/exam-sessions/${sup}/supplementary`).expect(200)).body;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ rollNo: 'R3', code: 'BCOM-3.1' });
      await get('student', `/v1/exam-sessions/${sup}/supplementary`).expect(403);
      await http().delete(`/v1/exam-sessions/${sup}/supplementary/${list[0].id}`).set(au('principal')).expect(200);
      expect((await get('principal', `/v1/exam-sessions/${sup}/supplementary`).expect(200)).body).toEqual([]);
    });

    it('records a malpractice case and decides it once', async () => {
      const c = (await post('teacher', `${S()}/malpractice`, { studentId: t.students[2].id, paperId: ids.paper, roomId: t.room.id, description: 'Mobile phone found in the hall' }).expect(201)).body;
      await post('student', `${S()}/malpractice`, { studentId: t.students[2].id, description: 'x y z' }).expect(403);
      await get('teacher', `${S()}/malpractice`).expect(403);
      expect((await get('principal', `${S()}/malpractice`).expect(200)).body[0]).toMatchObject({ status: 'reported', rollNo: 'R3' });
      await post('teacher', `/v1/malpractice/${c.id}/decide`, { outcome: 'dismissed' }).expect(403);
      await post('principal', `/v1/malpractice/${c.id}/decide`, { outcome: 'penalised' }).expect(400); // a penalty is needed
      await post('principal', `/v1/malpractice/${c.id}/decide`, { outcome: 'penalised', penalty: 'Paper cancelled' }).expect(200);
      await post('principal', `/v1/malpractice/${c.id}/decide`, { outcome: 'dismissed' }).expect(409);
      expect((await get('principal', `${S()}/malpractice`).expect(200)).body[0]).toMatchObject({ status: 'penalised', penalty: 'Paper cancelled' });
    });
  });
});
