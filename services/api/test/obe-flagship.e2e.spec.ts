import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx, readXlsxSheets, writeWorkbook } from '../src/common/xlsx.js';
import { parseMarksSheet } from '../src/obe/question-sheet.js';
import { suggestCo } from '../src/obe/bloom.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('OBE question sheet and Bloom suggestions', () => {
  it('reads a filled marks sheet: roll numbers, question headers, blanks, absentees and errors', () => {
    const qs = [{ id: 'q1', no: '1', maxMarks: 5 }, { id: 'q2', no: '2a', maxMarks: 10 }];
    const st = [{ id: 's1', rollNo: 'R1', name: 'A' }, { id: 's2', rollNo: 'R2', name: 'B' }, { id: 's3', rollNo: 'R3', name: 'C' }];
    const r = parseMarksSheet([['Roll no', 'Name', 'Absent (Y/N)', 'Q1 (5)', 'Q2a (10)', 'Total'], ['R1', 'A', '', '4', '7.5', '11.5'], ['R2', 'B', 'Y', '3', '', ''], ['R3', 'C', '', '6', 'x', ''], ['R9', '', '', '1', '1', ''], ['R1', 'A', '', '1', '1', '']], qs, st);
    expect(r.entries).toEqual([{ studentId: 's1', absent: false, marks: { q1: 4, q2: 7.5 } }, { studentId: 's2', absent: true, marks: { q1: null, q2: null } }, { studentId: 's3', absent: false, marks: {} }]);
    expect(r.errors.map((e) => e.row)).toEqual([4, 4, 5, 6]);
    expect(r.errors[0].message).toContain('more than its 5 marks');
    expect(parseMarksSheet([['Name', 'Q1']], qs, st).errors[0].message).toContain('Roll no');
  });

  it('suggests measurable verbs of the claimed level', () => {
    const s = suggestCo('Understand the concepts of cost sheets', 'Understand');
    expect(s.level).toBe(2);
    expect(s.rewrites[0]).toBe('Explain the concepts of cost sheets');
    expect(s.verbs).toContain('describe');
    expect(suggestCo('Prepare a cost sheet', 'Apply').rewrites).toEqual([]);
  });
});

describe('OBE flagship: workflow, question-wise marks, apportioning, methods, surveys, batches, reports', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const base = () => `/v1/obe/programs/${t.program.id}`;
  const year = () => t.section.academicYearId;
  const q = async (text: string, params: unknown[] = []) => (await owner.query(text, params)).rows;
  const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
    const d: Buffer[] = [];
    res.on('data', (c: Buffer) => d.push(c));
    res.on('end', () => cb(null, Buffer.concat(d)));
  };
  const compute = async () => {
    await http().post(`${base()}/attainment/compute`).set(as('principal')).send({ academicYearId: year() }).expect(200);
    return (await http().get(`${base()}/attainment?academicYearId=${year()}`).set(as('principal')).expect(200)).body as { cos: { code: string; direct: number; indirect: number | null; combined: number; met: boolean; detail: { byKind: { kind: string; level: number; percentAttained: number }[]; items: { basis: string; label: string }[] } }[]; pos: { code: string; direct: number; indirect: number | null; combined: number; detail: { byCourse: unknown[] } }[] };
  };
  const user = async (email: string, roles: string[]) => {
    const [u] = await q(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, email.split('@')[0], email, await argon2.hash('pw')]);
    for (const r of roles) await q(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, $3)`, [t.tenantId, u.id, r]);
    tok[email.split('@')[0]] = await login(t.slug, email);
    return u.id as string;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.teacher2 = await login(t.slug, t.teacher2.email!);
    tok.principal = await login(t.slug, t.principal.email!);
    tok.student = await login(t.slug, t.studentUser.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    id.iqac = await user('iqac@flagship.in', ['quality_officer']);
    id.hod = await user('hod@flagship.in', ['teacher', 'hod']);
    id.coord = await user('coord@flagship.in', ['teacher']);
    const [dept] = await q(`insert into departments (tenant_id, name, head_user_id) values ($1, 'Commerce', $2) returning id`, [t.tenantId, id.hod]);
    id.dept = dept.id;
    await q(`update subjects set department_id = $1 where id = $2`, [id.dept, t.subject.id]);
    const [s2] = await q(`insert into subjects (tenant_id, program_id, term, code, name, department_id) values ($1, $2, 3, 'BCOM-3.2', 'Cost Accounting', $3) returning id`, [t.tenantId, t.program.id, id.dept]);
    id.s2 = s2.id;
    const [s3] = await q(`insert into subjects (tenant_id, program_id, term, code, name) values ($1, $2, 3, 'BCOM-3.3', 'Business Law') returning id`, [t.tenantId, t.program.id]);
    id.s3 = s3.id;
    for (const sub of [id.s2, id.s3]) await q(`insert into timetable_slots (tenant_id, academic_year_id, section_id, subject_id, teacher_id, room_id, day_of_week, starts_at, ends_at) values ($1, $2, $3, $4, $5, $6, 2, '11:00', '11:55')`, [t.tenantId, year(), t.section.id, sub, t.teacher.id, t.room.id]);
    const add = async (kind: string, code: string, statement: string) => (await http().post(`${base()}/outcomes`).set(as('principal')).send({ kind, code, statement }).expect(201)).body.id as string;
    id.po1 = await add('po', 'PO1', 'Apply accounting knowledge');
    id.po2 = await add('po', 'PO2', 'Analyse business data');
    id.pso1 = await add('pso', 'PSO1', 'Prepare company accounts');
  }, 90000);
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('sets frameworks, applies outcome presets and names OBE coordinators through the record kit', async () => {
    const [bba] = await q(`insert into programs (tenant_id, campus_id, name, level, term_count) values ($1, $2, 'MBA', 'pg', 4) returning id`, [t.tenantId, t.campus.id]);
    expect((await http().get('/v1/obe/presets').set(as('teacher')).expect(200)).body.map((p: { key: string }) => p.key)).toEqual(expect.arrayContaining(['nba_engineering', 'nba_engineering_2025', 'nba_management', 'nba_pharmacy', 'ugc_locf', 'pso_bcom']));
    await http().post(`/v1/obe/programs/${bba.id}/presets`).set(as('teacher')).send({ key: 'nba_management' }).expect(403);
    expect((await http().post(`/v1/obe/programs/${bba.id}/presets`).set(as('principal')).send({ key: 'nba_management' }).expect(200)).body).toEqual({ added: 5, kept: 0 });
    expect((await http().post(`/v1/obe/programs/${bba.id}/presets`).set(as('principal')).send({ key: 'nba_management' }).expect(200)).body).toEqual({ added: 0, kept: 5 });
    await http().put(`/v1/obe/programs/${bba.id}/framework`).set(as('iqac')).send({ framework: 'nba_management' }).expect(200);
    expect((await http().get(`/v1/obe/programs/${bba.id}/framework`).set(as('teacher')).expect(200)).body.framework).toBe('nba_management');
    expect((await http().get(`${base()}/framework`).set(as('teacher')).expect(200)).body.framework).toBe('naac');
    await http().put(`${base()}/framework`).set(as('principal')).send({ framework: 'nba_tier9' }).expect(400);

    await http().post('/v1/records/obe-assignments').set(as('principal')).send({ userId: id.coord, role: 'course_coordinator', programId: t.program.id }).expect(400);
    await http().post('/v1/records/obe-assignments').set(as('hod')).send({ userId: id.coord, role: 'coordinator', programId: t.program.id }).expect(403);
    await http().post('/v1/records/obe-assignments').set(as('principal')).send({ userId: id.coord, role: 'coordinator', programId: t.program.id }).expect(201);
    const me = (await http().get('/v1/obe/me').set(as('coord')).expect(200)).body;
    expect(me.coordinatorOf).toEqual([t.program.id]);
    expect((await http().get('/v1/records/obe-assignments').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('runs CO approval: teacher → head of department → OBE coordinator → IQAC, with returns, comments and locking', async () => {
    const sets = `/v1/obe/subjects/${t.subject.id}/co-sets`;
    id.set = (await http().post(sets).set(as('teacher')).send({}).expect(201)).body.id;
    const addCo = (code: string, statement: string, bloomLevel: string) => http().post(`/v1/obe/co-sets/${id.set}/outcomes`).set(as('teacher')).send({ code, statement, bloomLevel }).expect(201).then((r) => r.body.id as string);
    id.co1 = await addCo('CO1', 'Prepare the final accounts of companies', 'Apply');
    id.co2 = await addCo('CO2', 'Analyse financial statements using ratios', 'Analyse');
    id.co3 = await addCo('CO3', 'Understand the accounting standards', 'Understand');
    await http().put(`/v1/obe/co-sets/${id.set}/matrix`).set(as('teacher')).send({ cells: [{ coId: id.co1, outcomeId: id.po1, strength: 3, justification: 'Company accounts apply the core knowledge' }, { coId: id.co1, outcomeId: id.po2, strength: 1 }, { coId: id.co2, outcomeId: id.po1, strength: 2 }, { coId: id.co3, outcomeId: id.pso1, strength: 2 }] }).expect(200);
    const sug = (await http().post('/v1/obe/suggest-co').set(as('teacher')).send({ statement: 'Understand the accounting standards', bloomLevel: 'Understand' }).expect(200)).body;
    expect(sug.check.ok).toBe(false);
    expect(sug.rewrites[0]).toBe('Explain the accounting standards');
    expect((await http().get('/v1/obe/bloom').set(as('teacher')).expect(200)).body[2]).toMatchObject({ level: 3, name: 'Apply' });

    const sub1 = (await http().post(`/v1/obe/co-sets/${id.set}/submit`).set(as('teacher')).send({ comment: 'First version for the new syllabus' }).expect(200)).body;
    expect(sub1.reviewStage).toBe('hod');
    expect(sub1.warnings).toEqual(['CO3: check the action verb']);
    await http().post(`/v1/obe/co-sets/${id.set}/submit`).set(as('teacher')).send({}).expect(409);
    await http().put(`/v1/obe/course-outcomes/${id.co3}`).set(as('teacher')).send({ statement: 'Explain the accounting standards' }).expect(409); // locked while reviewed
    await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('teacher')).send({ decision: 'approve' }).expect(403);
    await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('coord')).send({ decision: 'approve' }).expect(403); // not this step
    expect((await http().get('/v1/obe/approvals').set(as('hod')).expect(200)).body.map((a: { id: string; verbIssues: number }) => [a.id, a.verbIssues])).toEqual([[id.set, 1]]);
    expect((await http().get('/v1/obe/approvals').set(as('coord')).expect(200)).body).toEqual([]);
    await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('hod')).send({ decision: 'return' }).expect(400);
    expect((await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('hod')).send({ decision: 'return', comment: 'CO3: use a measurable verb', coId: id.co3 }).expect(200)).body.reviewStage).toBe('returned');

    await http().put(`/v1/obe/course-outcomes/${id.co3}`).set(as('teacher')).send({ statement: 'Explain the accounting standards' }).expect(200);
    expect((await http().post(`/v1/obe/co-sets/${id.set}/submit`).set(as('teacher')).send({}).expect(200)).body).toEqual({ reviewStage: 'hod', warnings: [] });
    await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('hod')).send({ decision: 'comment', comment: 'Looks good' }).expect(200);
    expect((await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('hod')).send({ decision: 'approve' }).expect(200)).body.reviewStage).toBe('coordinator');
    expect((await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('coord')).send({ decision: 'approve' }).expect(200)).body.reviewStage).toBe('iqac');
    await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('hod')).send({ decision: 'approve' }).expect(403);
    expect((await http().get(`/v1/obe/co-sets/${id.set}/reviews`).set(as('iqac')).expect(200)).body.canDecide).toBe(true);
    expect((await http().post(`/v1/obe/co-sets/${id.set}/review`).set(as('iqac')).send({ decision: 'approve', comment: 'Approved by IQAC' }).expect(200)).body).toEqual({ reviewStage: 'approved', status: 'active' });
    const h = (await http().get(`/v1/obe/co-sets/${id.set}/reviews`).set(as('teacher')).expect(200)).body;
    expect(h.set).toMatchObject({ status: 'active', reviewStage: 'approved' });
    expect(h.history.map((x: { decision: string; stage: string }) => `${x.stage}:${x.decision}`)).toEqual(['hod:submitted', 'hod:returned', 'hod:submitted', 'hod:comment', 'hod:approved', 'coordinator:approved', 'iqac:approved', 'approved:activated']);
    expect(h.history[1]).toMatchObject({ co: 'CO3', comment: 'CO3: use a measurable verb' });
    const notes = await q(`select user_id from notifications where tenant_id = $1 and dedupe_key like 'obe-review:%'`, [t.tenantId]);
    expect(notes.map((n) => n.user_id).sort()).toEqual([id.coord, id.hod, id.iqac].sort());

    // A course whose department has no head goes straight to the coordinator.
    const s3 = (await http().post(`/v1/obe/subjects/${id.s3}/co-sets`).set(as('teacher')).send({}).expect(201)).body.id;
    await http().post(`/v1/obe/co-sets/${s3}/outcomes`).set(as('teacher')).send({ code: 'CO1', statement: 'Interpret the Indian Contract Act', bloomLevel: 'Understand' }).expect(201);
    expect((await http().post(`/v1/obe/co-sets/${s3}/submit`).set(as('teacher')).send({}).expect(200)).body.reviewStage).toBe('coordinator');

    // A leader can make a draft live directly (recorded): the second course.
    id.s2set = (await http().post(`/v1/obe/subjects/${id.s2}/co-sets`).set(as('teacher')).send({}).expect(201)).body.id;
    id.s2co1 = (await http().post(`/v1/obe/co-sets/${id.s2set}/outcomes`).set(as('teacher')).send({ code: 'CO1', statement: 'Compute the cost of a job', bloomLevel: 'Apply' }).expect(201)).body.id;
    await http().put(`/v1/obe/co-sets/${id.s2set}/matrix`).set(as('teacher')).send({ cells: [{ coId: id.s2co1, outcomeId: id.po1, strength: 1 }, { coId: id.s2co1, outcomeId: id.po2, strength: 3 }] }).expect(200);
    await http().post(`/v1/obe/co-sets/${id.s2set}/activate`).set(as('iqac')).expect(200);
  });

  it('sets a question paper tagged to COs and enters question-wise marks; totals follow', async () => {
    const mk = async (subjectId: string, title: string, kind: string, max: number) => (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId, title, kind, maxMarks: max, heldOn: '2026-10-20' }).expect(201)).body.id as string;
    id.ia = await mk(t.subject.id, 'Internal test 1', 'test', 20);
    id.see = await mk(t.subject.id, 'Semester end examination', 'exam', 50);
    const paper = `/v1/obe/assessments/${id.ia}/questions`;
    await http().get(paper).set(as('teacher2')).expect(403);
    await http().get(paper).set(as('student')).expect(403);
    await http().get(paper).set(as('outsider')).expect(404);
    await http().put(paper).set(as('teacher')).send({ questions: [{ no: '1', maxMarks: 5, cos: [{ coId: id.co1 }] }] }).expect(400); // adds up to 5 of 20
    await http().put(paper).set(as('teacher')).send({ questions: [{ no: '1', maxMarks: 20, cos: [{ coId: id.s2co1 }] }] }).expect(400); // another course's CO
    await http().put(paper).set(as('teacher')).send({ questions: [{ no: '1', maxMarks: 20, bloomLevel: 'Juggle' }] }).expect(400);
    const p = (await http().put(paper).set(as('teacher')).send({ questions: [
      { no: '1', part: 'Part A', maxMarks: 5, bloomLevel: 'Apply', cos: [{ coId: id.co1 }] },
      { no: '2', part: 'Part A', maxMarks: 5, bloomLevel: 'Analyse', cos: [{ coId: id.co2 }] },
      { no: '3', part: 'Part B', maxMarks: 10, bloomLevel: 'Understand', cos: [{ coId: id.co1 }, { coId: id.co3 }] },
    ] }).expect(200)).body;
    const qid = (no: string) => p.questions.find((x: { no: string }) => x.no === no).id as string;
    // CO weightage: CO1 = 5 + 10/2 = 10 marks (50%), CO2 = 5 (25%), CO3 = 5 (25%).
    expect(p.coMarks.map((c: { code: string; marks: number; share: number }) => [c.code, c.marks, c.share])).toEqual([['CO1', 10, 50], ['CO2', 5, 25], ['CO3', 5, 25]]);
    expect(p.bloom.filter((b: { marks: number }) => b.marks > 0).map((b: { name: string; marks: number }) => [b.name, b.marks])).toEqual([['Understand', 10], ['Apply', 5], ['Analyse', 5]]);
    const [r1, r2, r3] = t.students.map((s) => s.id);
    const marks = (sid: string, a: number, b: number, c: number) => ({ studentId: sid, marks: { [qid('1')]: a, [qid('2')]: b, [qid('3')]: c } });
    await http().put(`/v1/obe/assessments/${id.ia}/question-marks`).set(as('teacher')).send({ entries: [marks(r1, 6, 4, 8)] }).expect(400); // Q1 is out of 5
    await http().put(`/v1/obe/assessments/${id.ia}/question-marks`).set(as('teacher2')).send({ entries: [marks(r1, 5, 4, 8)] }).expect(403);
    const after = (await http().put(`/v1/obe/assessments/${id.ia}/question-marks`).set(as('teacher')).send({ entries: [marks(r1, 5, 4, 8), marks(r2, 3, 2, 6), marks(r3, 2, 4, 2)] }).expect(200)).body;
    expect(after.students.map((s: { rollNo: string; total: number }) => [s.rollNo, s.total])).toEqual([['R1', 17], ['R2', 11], ['R3', 8]]);
    expect((await q(`select marks::float from marks where assessment_id = $1 order by marks`, [id.ia])).map((r) => r.marks)).toEqual([8, 11, 17]);
    // The paper cannot be reshaped once marks are in, but its tags can change.
    await http().put(paper).set(as('teacher')).send({ questions: [{ no: '1', maxMarks: 20 }] }).expect(409);

    // The Excel sheet: download, fill, check (errors), upload.
    const sheet = await http().get(`/v1/obe/assessments/${id.ia}/question-marks.xlsx`).set(as('teacher')).buffer().parse(bin).expect(200);
    const rows = readXlsx(sheet.body as Buffer);
    expect(rows[0]).toEqual(['Roll no', 'Name', 'Absent (Y/N)', 'Q1 (5)', 'Q2 (5)', 'Q3 (10)', 'Total']);
    expect(rows[1].slice(0, 7)).toEqual(['R1', 'Student A', '', '5', '4', '8', '17']);
    const upload = (r: (string | number | null)[][], check = false) => http().post(`/v1/obe/assessments/${id.ia}/question-marks.xlsx${check ? '?check=true' : ''}`).set(as('teacher')).attach('file', writeWorkbook([{ name: 'Marks', header: true, rows: r }]), 'marks.xlsx');
    const bad = (await upload([rows[0], ['R2', 'Student B', '', 3, 7, 6, null]]).expect(200)).body;
    expect(bad).toMatchObject({ saved: false, errors: [{ row: 2, message: 'R2: 7 for Q2 is more than its 5 marks' }] });
    expect((await upload([rows[0], ['R2', 'Student B', '', 3, 3, 6, null]], true).expect(200)).body).toMatchObject({ saved: false, rows: 1, errors: [] });
    expect((await upload([rows[0], ['R2', 'Student B', '', 3, 3, 6, null]]).expect(200)).body).toMatchObject({ saved: true, rows: 1 });
    expect((await q(`select marks::float from marks where assessment_id = $1 and student_id = $2`, [id.ia, r2]))[0].marks).toBe(12);
    await upload([rows[0], ['R2', 'Student B', '', 3, 2, 6, null]]).expect(200); // back to the worked example

    // SEE: a blueprint (Q1 20 on CO1, Q2 20 on CO2, Q3 10 on CO3); R1 marked question-wise, R2 and R3 as totals only.
    const sp = (await http().put(`/v1/obe/assessments/${id.see}/questions`).set(as('teacher')).send({ questions: [{ no: '1', maxMarks: 20, cos: [{ coId: id.co1 }] }, { no: '2', maxMarks: 20, cos: [{ coId: id.co2 }] }, { no: '3', maxMarks: 10, cos: [{ coId: id.co3 }] }] }).expect(200)).body;
    expect(sp.coMarks.map((c: { share: number }) => c.share)).toEqual([40, 40, 20]);
    await http().put(`/v1/assessments/${id.see}/marks`).set(as('teacher')).send({ entries: [{ studentId: r2, marks: 30 }, { studentId: r3, marks: 20 }] }).expect(200);
    const sq = (no: string) => sp.questions.find((x: { no: string }) => x.no === no).id as string;
    await http().put(`/v1/obe/assessments/${id.see}/question-marks`).set(as('teacher')).send({ entries: [{ studentId: r1, marks: { [sq('1')]: 18, [sq('2')]: 10, [sq('3')]: 8 } }] }).expect(200);
    const list = (await http().get(`/v1/obe/subjects/${t.subject.id}/assessments?academicYearId=${year()}`).set(as('teacher')).expect(200)).body;
    expect(list.map((a: { title: string; evidence: string; basis: string; tagged: number; questions: number }) => [a.title, a.evidence, a.basis, a.tagged, a.questions])).toEqual([['Internal test 1', 'cie', 'questions', 3, 3], ['Semester end examination', 'see', 'questions', 3, 3]]);
  });

  it('computes attainment from question-wise marks and apportioned SEE totals, to hand-checked values', async () => {
    // Second course: an assignment mapped by share (CO1) plus an LMS quiz question tagged to CO1.
    const [r1, r2, r3] = t.students.map((s) => s.id);
    const asg = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: id.s2, title: 'Job costing assignment', kind: 'assignment', maxMarks: 10, heldOn: '2026-10-10' }).expect(201)).body.id;
    await http().put(`/v1/assessments/${asg}/marks`).set(as('teacher')).send({ entries: [{ studentId: r1, marks: 9 }, { studentId: r2, marks: 6 }, { studentId: r3, marks: 4 }] }).expect(200);
    await http().put(`/v1/obe/assessments/${asg}/cos`).set(as('teacher')).send({ maps: [{ coId: id.s2co1, share: 1 }] }).expect(200);
    const [quiz] = await q(`insert into lms_quizzes (tenant_id, section_id, subject_id, title, opens_at, closes_at, status, created_by) values ($1, $2, $3, 'Costing quiz', now() - interval '3 days', now() - interval '1 day', 'closed', $4) returning id`, [t.tenantId, t.section.id, id.s2, t.teacher.id]);
    const [qq] = await q(`insert into lms_quiz_questions (tenant_id, quiz_id, kind, text, marks, co_id) values ($1, $2, 'mcq', 'Which cost is fixed?', 2, $3) returning id`, [t.tenantId, quiz.id, id.s2co1]);
    for (const [sid, m] of [[r1, 2], [r2, 2]] as const) await q(`insert into lms_quiz_attempts (tenant_id, quiz_id, student_id, question_ids, results, score, max_score, due_at, submitted_at) values ($1, $2, $3, $4, $5, $6, 2, now(), now())`, [t.tenantId, quiz.id, sid, [qq.id], JSON.stringify({ [qq.id]: { correct: m > 0, marks: m } }), m]);

    const a = await compute();
    const co = (code: string) => a.cos.find((c) => c.code === code)!;
    // CO1  CIE: Q1 + Q3/2 of 10 -> R1 9 (90%), R2 6 (60%), R3 3 (30%): 2 of 3 at 60% -> 66.7% -> level 3.
    //      SEE: R1 18/20 (90%) question-wise; R2 30/50, R3 20/50 shared out by the blueprint -> 60%, 40%: 2 of 3 -> level 3.
    //      direct = (40*3 + 60*3)/100 = 3.
    // CO2  CIE: Q2 of 5 -> 80%, 40%, 80%: 2 of 3 -> 3.           SEE: 10/20 = 50%, 60%, 40% -> 1 of 3 -> 0.  direct (40*3)/100 = 1.2.
    // CO3  CIE: Q3/2 of 5 -> 80%, 60%, 20% -> level 3.          SEE: 8/10 = 80%, 60%, 40% -> level 3.  direct 3.
    expect(co('BCOM-3.1/CO1')).toMatchObject({ direct: 3, combined: 3, met: true });
    expect(co('BCOM-3.1/CO1').detail.byKind.map((k) => [k.kind, k.percentAttained, k.level])).toEqual([['external', 66.67, 3], ['internal', 66.67, 3]]);
    expect(co('BCOM-3.1/CO2')).toMatchObject({ direct: 1.2, combined: 1.2, met: false });
    expect(co('BCOM-3.1/CO3')).toMatchObject({ direct: 3, combined: 3 });
    expect(co('BCOM-3.1/CO1').detail.items.map((i) => i.basis)).toEqual(['questions', 'questions']);
    // Second course CO1: assignment + quiz pooled -> R1 11/12, R2 8/12, R3 4/10 -> 2 of 3 -> level 3.
    expect(co('BCOM-3.2/CO1')).toMatchObject({ direct: 3, combined: 3 });
    expect(co('BCOM-3.2/CO1').detail.items.map((i) => i.basis).sort()).toEqual(['lms', 'share']);
    // PO1, course-weighted: course 1 articulation (3+2)/2 = 2.5, attainment (3*3 + 2*1.2)/5 = 2.28; course 2 articulation 1,
    // attainment 3. PO1 = (2.5*2.28 + 1*3)/3.5 = 2.49. PO2: course 1 (1, 3), course 2 (3, 3) -> 3. PSO1: CO3 -> 3.
    const po = (code: string) => a.pos.find((x) => x.code === code)!;
    expect(po('PO1')).toMatchObject({ direct: 2.49, combined: 2.49 });
    expect(po('PO1').detail.byCourse).toEqual([{ courseId: t.subject.id, articulation: 2.5, attainment: 2.28, cos: 2 }, { courseId: id.s2, articulation: 1, attainment: 3, cos: 1 }]);
    expect(po('PO2')).toMatchObject({ direct: 3 });
    expect(po('PSO1')).toMatchObject({ direct: 3 });

    // The student's own view: CO1 for R3 is CIE 30% and SEE 40%, overall (40*30 + 60*40)/100 = 36%, not attained.
    const mine = (await http().get('/v1/obe/students/me/outcomes').set(as('student')).expect(200)).body;
    const c1 = mine.courses.find((c: { code: string }) => c.code === 'BCOM-3.1').cos[0];
    expect(c1).toMatchObject({ code: 'CO1', cie: 30, see: 40, overall: 36, attained: false, classLevel: 3 });
    await http().get(`/v1/obe/students/${r3}/outcomes`).set(as('principal')).expect(200);
    await http().get(`/v1/obe/students/${r1}/outcomes`).set(as('student')).expect(404);
  });

  it('switches methods and keeps policy history at programme and course level', async () => {
    const pol = (await http().get(`/v1/obe/policies?subjectId=${t.subject.id}&academicYearId=${year()}`).set(as('teacher')).expect(200)).body;
    expect(pol).toMatchObject({ scope: 'subject', history: [], effective: { source: { scope: 'default' } } });
    const cfg = pol.effective.config;
    await http().post('/v1/obe/policies').set(as('teacher')).send({ scope: 'subject', subjectId: t.subject.id, config: { ...cfg, coMethod: 'class_average' } }).expect(403);
    await http().post('/v1/obe/policies').set(as('hod')).send({ scope: 'program', programId: t.program.id, config: cfg }).expect(403);
    await http().post('/v1/obe/policies').set(as('hod')).send({ scope: 'subject', subjectId: t.subject.id, config: { ...cfg, evidenceWeights: { internal: 0 } } }).expect(400);
    await http().post('/v1/obe/policies').set(as('hod')).send({ scope: 'subject', subjectId: t.subject.id, note: 'Class average method for this course', config: { ...cfg, coMethod: 'class_average' } }).expect(201);
    let a = await compute();
    const co = (code: string) => a.cos.find((c) => c.code === code)!;
    // Class averages. CO1: CIE (90+60+30)/3 = 60 -> 3; SEE (90+60+40)/3 = 63.3 -> 3: direct 3.
    // CO2: CIE (80+40+80)/3 = 66.7 -> 3; SEE (50+60+40)/3 = 50 -> 2: (40*3 + 60*2)/100 = 2.4.  CO3: CIE 53.3 -> 2; SEE 60 -> 3: 2.6.
    expect([co('BCOM-3.1/CO1').direct, co('BCOM-3.1/CO2').direct, co('BCOM-3.1/CO3').direct]).toEqual([3, 2.4, 2.6]);
    expect(co('BCOM-3.2/CO1').direct).toBe(3); // the other course keeps the threshold method

    await http().post('/v1/obe/policies').set(as('iqac')).send({ scope: 'subject', subjectId: t.subject.id, config: { ...cfg, coMethod: 'percentage' } }).expect(201);
    a = await compute();
    // Percentage of students attaining, times 3. CO1: CIE 66.7% -> 2, SEE 66.7% -> 2: direct 2.
    // CO2: CIE 66.7% -> 2, SEE 33.3% -> 1: (40*2 + 60*1)/100 = 1.4.  CO3: 2 and 2: direct 2.
    expect([co('BCOM-3.1/CO1').direct, co('BCOM-3.1/CO2').direct, co('BCOM-3.1/CO3').direct]).toEqual([2, 1.4, 2]);

    // A version from next year does not change this year's calculation.
    const [next] = await q(`insert into academic_years (tenant_id, label, starts_on, ends_on, is_current) values ($1, '2027-28', '2027-08-01', '2028-05-31', false) returning id`, [t.tenantId]);
    await http().post('/v1/obe/policies').set(as('iqac')).send({ scope: 'subject', subjectId: t.subject.id, effectiveFromYearId: next.id, config: { ...cfg, coMethod: 'class_average' } }).expect(201);
    a = await compute();
    expect(co('BCOM-3.1/CO1').direct).toBe(2);
    const h = (await http().get(`/v1/obe/policies?subjectId=${t.subject.id}&academicYearId=${year()}`).set(as('teacher')).expect(200)).body;
    expect(h.history.map((x: { version: number; effectiveFrom: string | null }) => [x.version, x.effectiveFrom])).toEqual([[3, '2027-28'], [2, null], [1, null]]);
    expect(h.effective.source).toMatchObject({ scope: 'subject', version: 2 });
    await q(`delete from obe_policies where subject_id = $1`, [t.subject.id]);

    // The PO methods on the programme, against the threshold results (course 1: CO1 3, CO2 1.2, CO3 3; course 2 CO1 3).
    const prog = (await http().get(`${base()}/config`).set(as('teacher')).expect(200)).body;
    await http().put(`${base()}/config`).set(as('principal')).send({ ...prog, poMethod: 'co_weighted' }).expect(200);
    a = await compute();
    // All mapped COs: (3*3 + 2*1.2 + 1*3)/6 = 2.4.
    expect(a.pos.find((x) => x.code === 'PO1')!.direct).toBe(2.4);
    await http().put(`${base()}/config`).set(as('principal')).send({ ...prog, poMethod: 'course_average' }).expect(200);
    a = await compute();
    // Course averages: course 1 (3 + 1.2 + 3)/3 = 2.4, course 2 3. PO1 = (2.5*2.4 + 1*3)/3.5 = 2.57.
    expect(a.pos.find((x) => x.code === 'PO1')!.direct).toBe(2.57);
    await http().put(`${base()}/config`).set(as('principal')).send({ ...prog, poMethod: 'course_weighted' }).expect(200);
    const ph = (await http().get(`/v1/obe/policies?programId=${t.program.id}`).set(as('principal')).expect(200)).body.history;
    expect(ph.map((x: { config: { poMethod: string } }) => x.config.poMethod)).toEqual(['course_weighted', 'course_average', 'co_weighted']);
  });

  it('delivers course and programme exit surveys in the Student App, reminds, and uses them as indirect attainment', async () => {
    await http().post('/v1/obe/exit-surveys').set(as('teacher2')).send({ kind: 'course_exit', sectionId: t.section.id, subjectId: t.subject.id, closesAt: '2026-12-15' }).expect(403);
    const sv = (await http().post('/v1/obe/exit-surveys').set(as('teacher')).send({ kind: 'course_exit', sectionId: t.section.id, subjectId: t.subject.id, closesAt: '2026-12-15' }).expect(201)).body;
    expect(sv).toMatchObject({ questions: 3, students: 1 });
    const mine = (await http().get('/v1/surveys/mine').set(as('student')).expect(200)).body;
    const s = mine.find((x: { id: string }) => x.id === sv.id);
    expect(s.questions.map((x: { prompt: string }) => x.prompt)).toEqual(['CO1: I can prepare the final accounts of companies.', 'CO2: I can analyse financial statements using ratios.', 'CO3: I can explain the accounting standards.', 'What should be continued or changed?']);
    expect((await http().post(`/v1/obe/exit-surveys/${sv.id}/remind`).set(as('teacher')).expect(200)).body).toEqual({ reminded: 1 });
    // Five answers per CO: CO1 all 4 (-> 2.4), CO2 all 3 (-> 1.8), CO3 all 5 (-> 3).
    const qs = await q(`select id, co_id from survey_questions where survey_id = $1 and kind = 'rating'`, [sv.id]);
    const rating = (co: string) => (co === id.co1 ? 4 : co === id.co2 ? 3 : 5);
    for (const x of qs) await q(`insert into survey_answers (tenant_id, survey_id, question_id, rating) select $1, $2, $3, $4 from generate_series(1, 5)`, [t.tenantId, sv.id, x.id, rating(x.co_id)]);
    await q(`insert into survey_responses (tenant_id, survey_id, respondent_id) values ($1, $2, $3)`, [t.tenantId, sv.id, t.studentUser.id]);
    expect((await http().post(`/v1/obe/exit-surveys/${sv.id}/remind`).set(as('teacher')).expect(200)).body).toEqual({ reminded: 0 });

    const ps = (await http().post('/v1/obe/exit-surveys').set(as('coord')).send({ kind: 'programme_exit', sectionId: t.section.id, closesAt: '2026-12-15' }).expect(201)).body;
    expect(ps.questions).toBe(3);
    const [po1q] = await q(`select id from survey_questions where survey_id = $1 and outcome_id = $2`, [ps.id, id.po1]);
    await q(`insert into survey_answers (tenant_id, survey_id, question_id, rating) select $1, $2, $3, 3 from generate_series(1, 5)`, [t.tenantId, ps.id, po1q.id]);
    const list = (await http().get(`${base()}/exit-surveys?academicYearId=${year()}`).set(as('teacher')).expect(200)).body;
    expect(list.map((x: { kind: string; responses: number }) => [x.kind, x.responses]).sort()).toEqual([['course_exit', 1], ['programme_exit', 0]]);

    const a = await compute();
    const co = (code: string) => a.cos.find((c) => c.code === code)!;
    // Combined = 80% direct + 20% indirect: CO1 0.8*3 + 0.2*2.4 = 2.88; CO2 0.96 + 0.36 = 1.32; CO3 2.4 + 0.6 = 3.
    expect([co('BCOM-3.1/CO1'), co('BCOM-3.1/CO2'), co('BCOM-3.1/CO3')].map((c) => [c.indirect, c.combined])).toEqual([[2.4, 2.88], [1.8, 1.32], [3, 3]]);
    // PO1 direct: course 1 (3*2.88 + 2*1.32)/5 = 2.256 at 2.5, course 2 3 at 1 -> (5.64 + 3)/3.5 = 2.47; indirect 3/5*3 = 1.8;
    // combined 0.8*2.47 + 0.2*1.8 = 2.336 -> 2.34.
    expect(a.pos.find((x) => x.code === 'PO1')).toMatchObject({ direct: 2.47, indirect: 1.8, combined: 2.34 });
  });

  it('moves CO tags to a new approved version, computes batches, and fills the dashboard', async () => {
    const v2 = (await http().post(`/v1/obe/subjects/${t.subject.id}/co-sets`).set(as('teacher')).send({ note: 'Revised wording' }).expect(201)).body.id;
    await http().post(`/v1/obe/co-sets/${v2}/activate`).set(as('principal')).expect(200);
    const tags = await q(`select distinct cs.version from assessment_question_cos c join course_outcomes co on co.id = c.co_id join co_sets cs on cs.id = co.co_set_id where co.co_set_id in (select id from co_sets where subject_id = $1)`, [t.subject.id]);
    expect(tags.map((r) => r.version)).toEqual([2]);
    const a = await compute();
    expect(a.cos.find((c) => c.code === 'BCOM-3.1/CO1')!.combined).toBe(2.88);

    const [prev] = await q(`insert into academic_years (tenant_id, label, starts_on, ends_on, is_current) values ($1, '2025-26', '2025-08-01', '2026-05-31', false) returning id`, [t.tenantId]);
    const b = (await http().post(`${base()}/batches/compute`).set(as('principal')).send({ entryYearId: prev.id }).expect(200)).body;
    expect(b).toMatchObject({ batch: '2025-28', cos: 4, measured: 4 });
    expect(b.years).toEqual(['2025-26', '2026-27', '2027-28']);
    const bl = (await http().get(`${base()}/batches`).set(as('principal')).expect(200)).body;
    expect(bl.batches.map((x: { batch: string }) => x.batch)).toEqual(['2025-28']);
    expect(bl.outcomes.find((o: { code: string }) => o.code === 'PO1').values[0]).toMatchObject({ direct: 2.47, indirect: 1.8, combined: 2.34 });
    await http().get(`${base()}/batches`).set(as('teacher')).expect(403);

    const pam = (await http().get(`${base()}/articulation`).set(as('teacher')).expect(200)).body;
    const row = pam.rows.find((r: { code: string }) => r.code === 'BCOM-3.1');
    expect([row.values[id.po1], row.values[id.po2], row.values[id.pso1]]).toEqual([2.5, 1, 2]);
    expect(pam.average[id.po1]).toBe(1.75);

    const tree = (await http().get(`${base()}/attainment/tree?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    const t1 = tree.outcomes.find((o: { code: string }) => o.code === 'PO1');
    expect(t1.courses.map((c: { code: string; articulation: number; attainment: number }) => [c.code, c.articulation, c.attainment])).toEqual([['BCOM-3.1', 2.5, 2.26], ['BCOM-3.2', 1, 3]]);

    const d = (await http().get(`/v1/obe/dashboard?academicYearId=${year()}`).set(as('principal')).expect(200)).body;
    expect(d.counts).toMatchObject({ programs: 1, courses: 3, approvals: 1, noCos: 1 });
    expect(d.courses.find((c: { code: string }) => c.code === 'BCOM-3.1')).toMatchObject({ cos: 3, mapped: 3, assessments: 2, tagged: 2, questionPapers: 2, flags: [] });
    expect(d.weakCos.map((w: { code: string }) => w.code)).toEqual(['BCOM-3.1/CO2']);
    expect(d.heat.programs[0].outcomes.map((o: { code: string; value: number }) => [o.code, o.value])).toEqual([['PO1', 2.34], ['PO2', 2.97], ['PSO1', 3]]);
    expect(d.heat.courses.find((c: { code: string }) => c.code === 'BCOM-3.1').cos.map((x: { value: number }) => x.value)).toEqual([2.88, 1.32, 3]);
    const hodView = (await http().get(`/v1/obe/dashboard?academicYearId=${year()}`).set(as('hod')).expect(200)).body;
    expect(hodView.courses.map((c: { code: string }) => c.code).sort()).toEqual(['BCOM-3.1', 'BCOM-3.2']);
    expect((await http().get(`/v1/obe/dashboard?academicYearId=${year()}`).set(as('coord')).expect(200)).body.approvals).toHaveLength(1);
    expect((await http().get('/v1/obe/dashboard').set(as('outsider')).expect(200)).body.courses.map((c: { id: string }) => c.id)).not.toContain(t.subject.id);
  });

  it('exports the course file, attainment reports, NBA SAR and NAAC 2.6 as branded PDFs and Excel workbooks', async () => {
    await http().post('/v1/records/obe-gaps').set(as('hod')).send({ programId: t.program.id, kind: 'beyond_syllabus', title: 'Ind AS 115 revenue recognition', subjectId: t.subject.id, academicYearId: year(), outcomeCodes: 'PO1, PSO1', method: 'guest_lecture', heldOn: '2026-09-18', resourcePerson: 'CA Ramesh Iyer', beneficiaries: 3, status: 'done' }).expect(201);
    await http().post('/v1/records/obe-gaps').set(as('hod')).send({ programId: t.program.id, kind: 'gap', title: 'Tally ERP practice', academicYearId: year() }).expect(201);
    expect((await http().get(`/v1/records/obe-gaps?f.kind=gap`).set(as('principal')).expect(200)).body.total).toBe(1);
    await http().get('/v1/records/obe-gaps').set(as('teacher')).expect(403);

    const pdf = async (path: string) => {
      const r = await http().get(path).set(as('principal')).buffer().parse(bin).expect(200);
      expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      return r.body as Buffer;
    };
    const xlsx = async (path: string) => readXlsxSheets((await http().get(path).set(as('principal')).buffer().parse(bin).expect(200)).body as Buffer);
    await pdf(`/v1/obe/subjects/${t.subject.id}/course-file.pdf?academicYearId=${year()}`);
    const cf = await xlsx(`/v1/obe/subjects/${t.subject.id}/course-file.xlsx?academicYearId=${year()}`);
    expect(cf.map((s) => s.name)).toEqual(expect.arrayContaining(['COs', 'CAM', 'Assessments', 'Paper 1', 'Paper 2', 'CO weightage', 'Bloom spread', 'Student-wise', 'CO attainment', 'Gaps', 'Exit survey']));
    const att = cf.find((s) => s.name === 'CO attainment')!.rows;
    expect(att[1]).toEqual(['CO1', '3', '2', '66.67', '3', '3', '2', '66.67', '3', '3', '2.4', '2.88', '2', 'Yes']);
    const sw = cf.find((s) => s.name === 'Student-wise')!.rows;
    // R3: CO1 CIE 30%, SEE 40% -> (40*30 + 60*40)/100 = 36; CO2 80% and 40% -> 56; CO3 20% and 40% -> 32.
    expect(sw[3].slice(0, 5)).toEqual(['R3', 'Student C', '36', '56', '32']);
    await pdf(`/v1/obe/subjects/${t.subject.id}/attainment-report.pdf?academicYearId=${year()}`);
    await pdf(`${base()}/attainment-report.pdf?academicYearId=${year()}`);
    await pdf(`${base()}/batch-report.pdf`);
    await pdf(`${base()}/naac-2-6.pdf?academicYearId=${year()}`);
    await pdf(`${base()}/sar.pdf?academicYearId=${year()}`);
    const sar = await xlsx(`${base()}/sar.xlsx?academicYearId=${year()}`);
    expect(sar.find((s) => s.name === '2.1.2 Beyond syllabus')!.rows[1]).toEqual(['1', 'Ind AS 115 revenue recognition', 'BCOM-3.1 Corporate Accounting', 'guest lecture', '2026-09-18', 'CA Ramesh Iyer', '3', 'PO1, PSO1']);
    expect(sar.find((s) => s.name === '2.1.1 Gaps')!.rows).toHaveLength(2);
    expect(sar.find((s) => s.name === 'PO attainment')!.rows[1]).toEqual(['PO1', 'Apply accounting knowledge', '2.47', '1.8', '2.34', '2', 'Yes', '2']);
    expect(sar.find((s) => s.name === 'PAM')!.rows[1].slice(0, 5)).toEqual(['BCOM-3.1 Corporate Accounting', '3', '2.5', '1', '2']);
    const naac = await xlsx(`${base()}/naac-2-6.xlsx?academicYearId=${year()}`);
    expect(naac.map((s) => s.name)).toEqual(expect.arrayContaining(['Programme outcomes', 'COs', 'CO attainment', 'PO attainment', '2.6.3 Pass percentage']));
    await http().get(`${base()}/sar.pdf?academicYearId=${year()}`).set(as('teacher')).expect(403);
    await http().get(`/v1/obe/subjects/${t.subject.id}/course-file.pdf?academicYearId=${year()}`).set(as('teacher2')).expect(403);
    await http().get(`/v1/obe/subjects/${t.subject.id}/course-file.doc?academicYearId=${year()}`).set(as('principal')).expect(404);
    const issued = await q(`select count(*)::int as n from issued_documents where tenant_id = $1 and doc_type = 'report_cover'`, [t.tenantId]);
    expect(issued[0].n).toBeGreaterThanOrEqual(6);
  });
});
