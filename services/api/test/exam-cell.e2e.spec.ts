import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * The exam cell (checklist sections 5 and 6): sessions as a record kit list, postponement with notices, the
 * invigilation roster and swaps, answer-book accounts, double-entry marks, dry run / freeze / rollback, malpractice
 * penalties and withheld results, grace applications, versioned changes after publication with the revaluation
 * change rule, unpublishing, duplicates, corrections and verification of documents, valuation camps, internal-marks
 * tools, supplementary and improvement registration, the registers, permissions and another institution's view.
 */
describe('exam cell', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const [A, B, C] = [0, 1, 2];
  let sessionId: string;
  let paperId: string;
  let seeId: string;
  let teacher3: string;
  const actions = async () => (await owner.query('select action from audit_log where tenant_id = $1', [t.tenantId])).rows.map((r) => r.action as string);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    const hash = await argon2.hash('pw');
    teacher3 = (await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Teacher Three', $2, $3) returning id`, [t.tenantId, `t3-${t.slug}@x.in`, hash])).rows[0].id;
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, 'teacher', $3)`, [t.tenantId, teacher3, t.campus.id]);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parentA = await login(t.slug, t.guardian.email!);
    tokens.parentB = await login(t.slug, t.guardian2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);

    // A scheme (IA 40 + SEE 60) and verified internal marks: A 32, B 20, C 40.
    const scaleId = (await http().post('/v1/grade-scales').set(as('principal')).send({ name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
    const scheme = (await http().put('/v1/schemes').set(as('principal')).send({ subjectId: t.subject.id, academicYearId: t.section.academicYearId, name: 'Theory', credits: 4, gradeScaleId: scaleId, passRules: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 }, components: [{ code: 'IA', name: 'Internal', kind: 'internal', weight: 40 }, { code: 'SEE', name: 'Semester end', kind: 'external', weight: 60 }] }).expect(200)).body;
    const ia = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Internal', kind: 'internal', maxMarks: 40, heldOn: '2026-10-20', componentId: scheme.components[0].id }).expect(201)).body.id;
    await http().put(`/v1/assessments/${ia}/marks`).set(as('teacher')).send({ entries: [32, 20, 40].map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
    await http().post(`/v1/assessments/${ia}/submit`).set(as('teacher')).expect(200);
    await http().post(`/v1/assessments/${ia}/verify`).set(as('principal')).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('lists, adds and guards exam sessions through the record kit', async () => {
    const body = { name: 'Sem 3 end exam Nov 2026', kind: 'regular', programId: t.program.id, academicYearId: t.section.academicYearId, term: 3, startsOn: '2026-11-02', endsOn: '2026-11-20' };
    await http().post('/v1/records/exam-sessions').set(as('teacher')).send(body).expect(403);
    await http().post('/v1/records/exam-sessions').set(as('principal')).send({ ...body, endsOn: '2026-10-01' }).expect(400);
    const s = (await http().post('/v1/records/exam-sessions').set(as('principal')).send(body).expect(201)).body;
    sessionId = s.id;
    expect(s).toMatchObject({ name: body.name, status: 'draft', programName: 'BCom', papers: 0 });
    const meta = (await http().get('/v1/records/exam-sessions/meta').set(as('principal')).expect(200)).body;
    expect(meta.can).toMatchObject({ write: true, duplicate: true });
    expect((await http().get('/v1/records/exam-sessions?f.kind=regular&sort=starts:desc').set(as('principal')).expect(200)).body.total).toBe(1);
    expect((await http().get('/v1/records/exam-sessions').set(as('outsider')).expect(200)).body.total).toBe(0);

    const paper = (await http().post(`/v1/exam-sessions/${sessionId}/papers`).set(as('principal')).send({ subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body;
    paperId = paper.id;
    seeId = paper.assessmentId;
    // The dates cannot shrink past a paper; a draft can be deleted, a scheduled one cannot.
    await http().patch(`/v1/records/exam-sessions/${sessionId}`).set(as('principal')).send({ endsOn: '2026-11-04' }).expect(409);
    const copy = (await http().post(`/v1/records/exam-sessions/${sessionId}/duplicate`).set(as('principal')).expect(201)).body;
    expect(copy).toMatchObject({ name: 'Sem 3 end exam Nov 2026 (copy)', status: 'draft' });
    await http().delete(`/v1/records/exam-sessions/${copy.id}`).set(as('principal')).expect(200);
    await http().post(`/v1/exam-sessions/${sessionId}/schedule`).set(as('principal')).expect(200);
    expect((await http().delete(`/v1/records/exam-sessions/${sessionId}`).set(as('principal')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
  });

  it('postpones a paper, tells the candidates, and keeps the notice on record', async () => {
    await http().post(`/v1/exam-sessions/${sessionId}/papers/${paperId}/reschedule`).set(as('teacher')).send({ examDate: '2026-11-06', startsAt: '10:00', endsAt: '13:00', reason: 'Bandh declared' }).expect(403);
    const r = (await http().post(`/v1/exam-sessions/${sessionId}/papers/${paperId}/reschedule`).set(as('principal')).send({ examDate: '2026-11-06', startsAt: '10:00', endsAt: '13:00', reason: 'Bandh declared on 5 November' }).expect(200)).body;
    expect(r).toMatchObject({ fromDate: '2026-11-05', toDate: '2026-11-06', notified: 3 });
    const told = (await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and dedupe_key = $2`, [t.tenantId, `exam-reschedule:${r.id}`])).rows[0].n;
    expect(told).toBeGreaterThanOrEqual(3); // students with logins and families
    const list = (await http().get('/v1/records/exam-reschedules').set(as('principal')).expect(200)).body;
    expect(list.rows[0]).toMatchObject({ code: 'BCOM-3.1', reason: 'Bandh declared on 5 November' });
    await http().delete(`/v1/records/exam-reschedules/${r.id}`).set(as('principal')).expect(403);
    expect(Array.isArray((await http().get(`/v1/exam-sessions/${sessionId}/clashes`).set(as('principal')).expect(200)).body)).toBe(true);
  });

  it('builds the invigilation roster from the seating and swaps a duty on approval', async () => {
    await http().post(`/v1/exam-sessions/${sessionId}/duties/auto`).set(as('principal')).send({}).expect(409); // nobody seated yet
    await http().post(`/v1/exam-sessions/${sessionId}/seating`).set(as('principal')).send({ halls: [{ roomId: t.room.id, capacity: 10 }] }).expect(200);
    const roster = (await http().post(`/v1/exam-sessions/${sessionId}/duties/auto`).set(as('principal')).send({}).expect(200)).body;
    expect(roster).toMatchObject({ duties: 2, chiefs: 1, short: [] });
    const duties = (await http().get(`/v1/records/invigilation-duties?f.session=${sessionId}`).set(as('principal')).expect(200)).body.rows;
    expect(duties.map((d: { role: string }) => d.role).sort()).toEqual(['chief', 'invigilator']);
    const inv = duties.find((d: { role: string }) => d.role === 'invigilator');
    const chief = duties.find((d: { role: string }) => d.role === 'chief').staffId;
    const free = [t.teacher.id, t.teacher2.id, teacher3].find((id) => id !== inv.staffId && id !== chief)!;
    await http().post(`/v1/invigilation/duties/${inv.id}/swap`).set(as('principal')).send({ swapWith: chief, reason: 'Unwell' }).expect(409); // the colleague is on duty then
    const sw = (await http().post(`/v1/invigilation/duties/${inv.id}/swap`).set(as('principal')).send({ swapWith: free, reason: 'Unwell' }).expect(201)).body;
    await http().post(`/v1/invigilation/swaps/${sw.id}/decide`).set(as('teacher')).send({ approve: true }).expect(403);
    await http().post(`/v1/invigilation/swaps/${sw.id}/decide`).set(as('principal')).send({ approve: false }).expect(400); // a refusal needs a reason
    await http().post(`/v1/invigilation/swaps/${sw.id}/decide`).set(as('principal')).send({ approve: true }).expect(200);
    // Only the person on duty (or the exam office) may ask to hand it over.
    await http().post(`/v1/invigilation/duties/${inv.id}/swap`).set(as(free === t.teacher.id ? 'teacher2' : 'teacher')).send({ swapWith: inv.staffId, reason: 'Not mine' }).expect(403);
    const after = (await http().get(`/v1/records/invigilation-duties/${inv.id}`).set(as('principal')).expect(200)).body;
    expect(after.status).toBe('substituted');
    expect((await http().get(`/v1/exam-sessions/${sessionId}/swaps`).set(as('principal')).expect(200)).body[0].status).toBe('approved');
  });

  let accountId: string;
  it('keeps a balanced answer-book account per hall', async () => {
    const a = (await http().post('/v1/records/answer-sheet-accounts').set(as('principal')).send({ sessionId, roomId: t.room.id, examDate: '2026-11-06', sitting: '10:00', received: 10, issued: 3, additional: 1, spoiled: 0, returned: 3, present: 3, absent: 0 }).expect(201)).body;
    accountId = a.id;
    expect((await http().post(`/v1/answer-sheet-accounts/${accountId}/submit`).set(as('principal')).expect(400)).body.message).toMatch(/must equal the books issued/);
    await http().patch(`/v1/records/answer-sheet-accounts/${accountId}`).set(as('principal')).send({ returned: 4 }).expect(200);
    await http().post(`/v1/answer-sheet-accounts/${accountId}/submit`).set(as('principal')).expect(200);
    await http().patch(`/v1/records/answer-sheet-accounts/${accountId}`).set(as('principal')).send({ returned: 5 }).expect(409);
  });

  it('takes marks by double entry: a second person, mismatches settled, then posted', async () => {
    await http().put(`/v1/exam-papers/${paperId}/double-entry/1`).set(as('teacher')).send({ entries: [45, 24, 23].map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
    await http().put(`/v1/exam-papers/${paperId}/double-entry/2`).set(as('teacher')).send({ entries: [{ studentId: t.students[A].id, marks: 45 }] }).expect(403);
    await http().put(`/v1/exam-papers/${paperId}/double-entry/2`).set(as('teacher2')).send({ entries: [45, 42, 23].map((marks, i) => ({ studentId: t.students[i].id, marks })) }).expect(200);
    const sheet = (await http().get(`/v1/exam-papers/${paperId}/double-entry`).set(as('principal')).expect(200)).body;
    expect(sheet.summary).toMatchObject({ candidates: 3, matched: 2, mismatch: 1 });
    expect((await http().post(`/v1/exam-papers/${paperId}/double-entry/post`).set(as('principal')).expect(409)).body.problems).toEqual(['R2 Student B']);
    await http().post(`/v1/exam-papers/${paperId}/double-entry/resolve`).set(as('principal')).send({ studentId: t.students[B].id, marks: 24, note: 'Checked the script: 24' }).expect(200);
    expect((await http().post(`/v1/exam-papers/${paperId}/double-entry/post`).set(as('principal')).expect(200)).body).toEqual({ posted: 3 });
    expect((await http().get(`/v1/exam-sessions/${sessionId}/double-entry/mismatches`).set(as('principal')).expect(200)).body).toHaveLength(1);
    await http().post(`/v1/assessments/${seeId}/submit`).set(as('teacher')).expect(200);
    await http().post(`/v1/assessments/${seeId}/verify`).set(as('principal')).expect(200);
  });

  it('dry-runs, processes, freezes and rolls back results', async () => {
    const dry = (await http().post(`/v1/exam-sessions/${sessionId}/dry-run`).set(as('principal')).expect(200)).body;
    expect(dry).toMatchObject({ problems: [], students: 3, passed: 2, failed: 1, changed: 3 });
    expect(dry.changes[0]).toMatchObject({ kind: 'new', rollNo: expect.any(String) });
    expect((await http().get(`/v1/exam-sessions/${sessionId}/results`).set(as('principal')).expect(200)).body).toEqual([]); // nothing saved
    await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(200);

    // Malpractice: the committee cancels B's paper and withholds the result.
    const mc = (await http().post('/v1/records/malpractice-cases').set(as('principal')).send({ sessionId, studentId: t.students[B].id, paperId, description: 'Notes found in the hall' }).expect(201)).body;
    await http().post(`/v1/malpractice/${mc.id}/decide`).set(as('principal')).send({ outcome: 'dismissed', withhold: true }).expect(400);
    expect((await http().post(`/v1/malpractice/${mc.id}/decide`).set(as('principal')).send({ outcome: 'penalised', penalty: 'Paper cancelled', action: 'cancel_paper', withhold: true }).expect(200)).body).toEqual({ status: 'penalised', papersCancelled: 1 });
    await http().delete(`/v1/records/malpractice-cases/${mc.id}`).set(as('principal')).expect(403);
    await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(200);
    const line = async (i: number) => (await http().get(`/v1/exam-sessions/${sessionId}/results`).set(as('principal')).expect(200)).body.find((r: { rollNo: string }) => r.rollNo === `R${i + 1}`);
    expect((await line(B)).lines[0]).toMatchObject({ grade: 'MP', passed: false });

    await http().post(`/v1/exam-sessions/${sessionId}/freeze`).set(as('principal')).expect(200);
    expect((await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(409)).body.message).toMatch(/frozen/);
    await http().post(`/v1/exam-sessions/${sessionId}/rollback`).set(as('principal')).send({ reason: 'Recheck the malpractice case' }).expect(409); // frozen
    await http().post(`/v1/exam-sessions/${sessionId}/unfreeze`).set(as('principal')).send({ reason: 'Recheck the malpractice case' }).expect(200);
    expect((await http().post(`/v1/exam-sessions/${sessionId}/rollback`).set(as('principal')).send({ reason: 'Recheck the malpractice case' }).expect(200)).body).toEqual({ restored: 3, status: 'processed' });
    expect((await line(B)).lines[0]).toMatchObject({ grade: 'P', passed: true }); // the processing before the penalty
    await http().post(`/v1/exam-sessions/${sessionId}/process`).set(as('principal')).expect(200);
    expect((await line(B)).lines[0].grade).toBe('MP');
    const runs = (await http().get(`/v1/exam-sessions/${sessionId}/runs`).set(as('principal')).expect(200)).body.map((r: { kind: string }) => r.kind);
    expect(runs).toEqual(expect.arrayContaining(['dry_run', 'process', 'freeze', 'unfreeze', 'rollback']));
  });

  it('takes a grace application for sports, approves and applies it, then locks it', async () => {
    // C: IA 40 + SEE 23 of 60 (38%, under the 40% external minimum) fails.
    const app_ = (await http().post(`/v1/exam-sessions/${sessionId}/grace-applications`).set(as('student')).send({ studentId: t.students[C].id, category: 'sports', marksRequested: 3, evidence: 'State athletics meet 2026, second place' }).expect(201)).body;
    await http().post(`/v1/exam-sessions/${sessionId}/grace-applications`).set(as('parentA')).send({ studentId: t.students[C].id, category: 'arts', marksRequested: 2, evidence: 'Not my child' }).expect(404);
    await http().post(`/v1/grace-applications/${app_.id}/apply`).set(as('principal')).expect(409); // not approved
    await http().post(`/v1/grace-applications/${app_.id}/decide`).set(as('principal')).send({ approve: true, marksApproved: 9 }).expect(400); // over the office limit
    await http().post(`/v1/grace-applications/${app_.id}/decide`).set(as('principal')).send({ approve: true, marksApproved: 3 }).expect(200);
    await http().post(`/v1/grace-applications/${app_.id}/apply`).set(as('principal')).expect(200);
    const c = (await http().get(`/v1/exam-sessions/${sessionId}/results`).set(as('principal')).expect(200)).body.find((r: { rollNo: string }) => r.rollNo === 'R3');
    expect(c.outcome).toBe('pass');
    await http().patch(`/v1/records/grace-applications/${app_.id}`).set(as('principal')).send({ evidence: 'changed after' }).expect(409);
    await http().delete(`/v1/records/grace-applications/${app_.id}`).set(as('principal')).expect(403);
    expect((await http().get(`/v1/students/${t.students[C].id}/grace-applications`).set(as('student')).expect(200)).body[0]).toMatchObject({ status: 'applied', marksApproved: 3 });
  });

  it('publishes with the withheld result shown as withheld, then releases it', async () => {
    await http().post(`/v1/exam-sessions/${sessionId}/freeze`).set(as('principal')).expect(200);
    await http().post(`/v1/exam-sessions/${sessionId}/publish`).set(as('principal')).expect(200);
    const b = (await http().get(`/v1/results/students/${t.students[B].id}`).set(as('parentB')).expect(200)).body;
    expect(b.terms[0]).toMatchObject({ withheld: true, withheldReason: 'malpractice', sgpa: null, lines: [] });
    await http().get(`/v1/results/students/${t.students[B].id}/marks-card.pdf?sessionId=${sessionId}`).set(as('parentB')).expect(403);
    const told = (await owner.query(`select title from notifications where tenant_id = $1 and user_id = $2 and dedupe_key = $3`, [t.tenantId, t.guardian2.id, `result:${sessionId}:${t.students[B].id}`])).rows;
    expect(told).toEqual([{ title: 'Result withheld' }]);
    const gazette = (await http().get(`/v1/exam-cell/reports/gazette?sessionId=${sessionId}`).set(as('principal')).expect(200)).body;
    expect(gazette.rows.find((r: { rollNo: string }) => r.rollNo === 'R2').result).toBe('WITHHELD');

    const held = (await http().get(`/v1/records/result-withholds?f.session=${sessionId}&f.status=held`).set(as('principal')).expect(200)).body.rows;
    expect(held).toHaveLength(1);
    await http().post(`/v1/result-withholds/${held[0].id}/release`).set(as('outsider')).send({ note: 'Inquiry closed' }).expect(404);
    await http().post(`/v1/result-withholds/${held[0].id}/release`).set(as('principal')).send({ note: 'Inquiry closed; penalty stands' }).expect(200);
    expect((await http().get(`/v1/results/students/${t.students[B].id}`).set(as('parentB')).expect(200)).body.terms[0]).toMatchObject({ withheld: false, outcome: 'fail' });
    await http().delete(`/v1/records/result-withholds/${held[0].id}`).set(as('principal')).expect(403);
  });

  it('changes a published result with a version, and applies the revaluation change rule', async () => {
    const ch = (await http().post(`/v1/exam-sessions/${sessionId}/results/${t.students[A].id}/change`).set(as('principal')).send({ subjectId: t.subject.id, marks: 50, absent: false, reason: 'Totalling error found by the board' }).expect(200)).body;
    expect(ch).toMatchObject({ version: 1, sgpa: 8.2 }); // IA 32 + SEE 50 = 82
    const revs = (await http().get(`/v1/exam-sessions/${sessionId}/results/${t.students[A].id}/revisions`).set(as('principal')).expect(200)).body;
    expect(revs[0]).toMatchObject({ version: 1, kind: 'grade_change' });
    expect(revs[0].before.sgpa).toBe(7.7);

    const cfg = (await http().get('/v1/exam-cell/settings').set(as('principal')).expect(200)).body;
    await http().put('/v1/exam-cell/settings').set(as('principal')).send({ ...cfg, attendanceSlabs: [{ minPercent: 90, percentOfMax: 50 }, { minPercent: 80, percentOfMax: 60 }] }).expect(400);
    await http().put('/v1/exam-cell/settings').set(as('teacher')).send({ ...cfg, revaluationThresholdPercent: 10 }).expect(403);
    await http().put('/v1/exam-cell/settings').set(as('principal')).send({ ...cfg, revaluationThresholdPercent: 10 }).expect(200);
    const r = (await http().post(`/v1/results/students/${t.students[A].id}/revaluations`).set(as('parentA')).send({ sessionId, subjectId: t.subject.id, reason: 'Expected more marks' }).expect(201)).body;
    await http().post(`/v1/fees/invoices/${r.feeInvoiceId}/payments`).set(as('principal')).send({ amountPaise: r.feePaise, method: 'cash' }).expect(201);
    await http().post(`/v1/revaluations/${r.id}/decide`).set(as('principal')).send({ accept: true }).expect(200);
    // 52 is 2 marks more: under 10% of 60, so the original 50 stands.
    expect((await http().post(`/v1/revaluations/${r.id}/complete`).set(as('principal')).send({ marks: 52 }).expect(200)).body).toMatchObject({ changed: false, difference: 2 });
    expect((await http().get(`/v1/results/students/${t.students[A].id}`).set(as('parentA')).expect(200)).body.terms[0].sgpa).toBe(8.2);
    const rev = (await http().get(`/v1/records/revaluations?f.session=${sessionId}`).set(as('principal')).expect(200)).body.rows[0];
    expect(rev.decisionNote).toMatch(/No change/);
  });

  it('unpublishes before the lock and publishes again', async () => {
    await http().post(`/v1/exam-sessions/${sessionId}/unpublish`).set(as('teacher')).send({ reason: 'Wrong publication' }).expect(403);
    expect((await http().post(`/v1/exam-sessions/${sessionId}/unpublish`).set(as('principal')).send({ reason: 'A list was published early' }).expect(200)).body.status).toBe('processed');
    expect((await http().get(`/v1/results/students/${t.students[A].id}`).set(as('parentA')).expect(200)).body.terms).toEqual([]);
    await http().post(`/v1/exam-sessions/${sessionId}/publish`).set(as('principal')).expect(200);
  });

  let docId: string;
  let dupSerial: string;
  it('issues a duplicate after an affidavit and the fee, and a correction marks copies for reissue', async () => {
    const d = (await http().post('/v1/records/academic-doc-requests').set(as('principal')).send({ studentId: t.students[A].id, kind: 'transcript', purpose: 'Higher studies' }).expect(201)).body;
    docId = d.id;
    await http().post(`/v1/academic-docs/requests/${docId}/decide`).set(as('principal')).send({ approve: true }).expect(200);
    await http().post(`/v1/academic-docs/requests/${docId}/issue`).set(as('principal')).expect(200);
    await http().delete(`/v1/records/academic-doc-requests/${docId}`).set(as('principal')).expect(403);
    const dup = (await http().post(`/v1/academic-docs/requests/${docId}/duplicate`).set(as('parentA')).send({ affidavitRef: 'Affidavit 1123/2026 before notary', reason: 'Lost while travelling' }).expect(201)).body;
    expect(dup).toMatchObject({ duplicate: true, originalId: docId, feePaise: 50_000 });
    await http().post(`/v1/academic-docs/requests/${dup.id}/decide`).set(as('principal')).send({ approve: true }).expect(200);
    expect((await http().post(`/v1/academic-docs/requests/${dup.id}/issue`).set(as('principal')).expect(409)).body.message).toMatch(/fee payment/);
    await http().post(`/v1/academic-docs/requests/${dup.id}/pay`).set(as('principal')).send({ paymentRef: 'RCPT-2026-77' }).expect(200);
    dupSerial = (await http().post(`/v1/academic-docs/requests/${dup.id}/issue`).set(as('principal')).expect(200)).body.serialNo;
    expect(dupSerial).toMatch(/-DUP$/);
    // The duplicate's PDF carries a DUPLICATE watermark (kept in the register for reprints); the original's does not.
    await http().get(`/v1/academic-docs/requests/${dup.id}/document.pdf`).set(as('principal')).expect(200);
    const mark = async (id: string) => (await owner.query("select payload -> 'doc' ->> 'watermark' as w from issued_documents where source_type = 'academic_doc' and source_id = $1", [id])).rows[0]?.w ?? null;
    expect(await mark(dup.id)).toBe('DUPLICATE');
    await http().get(`/v1/academic-docs/requests/${docId}/document.pdf`).set(as('principal')).expect(200);
    expect(await mark(docId)).toBeNull();
    expect((await http().get('/v1/records/academic-doc-requests?f.reissue=yes').set(as('principal')).expect(200)).body.rows.map((r: { id: string }) => r.id)).toEqual([docId]);

    const corr = (await http().post('/v1/records/record-corrections').set(as('principal')).send({ studentId: t.students[A].id, field: 'full_name', requestedValue: 'Student Alpha', reason: 'Spelt as in the SSLC marks card', documentRef: 'SSLC marks card 2021/123456' }).expect(201)).body;
    await http().post(`/v1/record-corrections/${corr.id}/apply`).set(as('principal')).expect(409);
    await http().post(`/v1/record-corrections/${corr.id}/decide`).set(as('principal')).send({ approve: false }).expect(400);
    await http().post(`/v1/record-corrections/${corr.id}/decide`).set(as('principal')).send({ approve: true }).expect(200);
    expect((await http().post(`/v1/record-corrections/${corr.id}/apply`).set(as('principal')).expect(200)).body).toMatchObject({ status: 'applied', reissued: 1 });
    expect((await owner.query('select full_name from students where id = $1', [t.students[A].id])).rows[0].full_name).toBe('Student Alpha');
    await http().post('/v1/records/record-corrections').set(as('principal')).send({ studentId: t.students[A].id, field: 'date_of_birth', requestedValue: '2006-05-14', reason: 'As in the birth certificate', documentRef: 'Birth certificate 45/2006' }).expect(409); // not held for an imported student
    const history = (await http().get(`/v1/records/students/${t.students[A].id}/history`).set(as('principal')).expect(200)).body.items.map((i: { action: string }) => i.action);
    expect(history).toContain('student.corrected');
  });

  it('answers verification requests from employers against the documents issued', async () => {
    const ask = (await http().post(`/v1/public/verification-requests/${t.slug}`).send({ requesterName: 'HR Desk', organisation: 'Acme Ltd', email: 'hr@acme.example', serialNo: dupSerial, candidateName: 'Student Alpha' }).expect(201)).body;
    expect(ask).toMatchObject({ status: 'received', feePaise: 100_000 });
    await http().post(`/v1/verification-requests/${ask.id}/check`).set(as('principal')).expect(409); // fee first
    await http().post(`/v1/verification-requests/${ask.id}/pay`).set(as('principal')).send({ paymentRef: 'UTR998877' }).expect(200);
    expect((await http().post(`/v1/verification-requests/${ask.id}/check`).set(as('principal')).expect(200)).body).toMatchObject({ status: 'verified' });
    const wrong = (await http().post('/v1/records/verification-requests').set(as('principal')).send({ requesterName: 'Admissions', organisation: 'Other University', email: 'adm@other.example', serialNo: dupSerial, candidateName: 'Someone Else' }).expect(201)).body;
    await http().post(`/v1/verification-requests/${wrong.id}/pay`).set(as('principal')).send({ paymentRef: 'UTR1' }).expect(200);
    expect((await http().post(`/v1/verification-requests/${wrong.id}/check`).set(as('principal')).expect(200)).body.outcome).toMatch(/different name/);
    await http().post(`/v1/public/verification-requests/no-such-place`).send({ requesterName: 'X Y', organisation: 'Z Co', email: 'z@z.example', serialNo: 'ABC', candidateName: 'Q R' }).expect(404);
    expect((await http().get('/v1/records/verification-requests').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('accepts credits earned elsewhere into the transcript and the CGPA, and imports them from a sheet', async () => {
    const issueTranscript = async () => {
      const d = (await http().post('/v1/records/academic-doc-requests').set(as('principal')).send({ studentId: t.students[A].id, kind: 'transcript', purpose: 'Transfer' }).expect(201)).body;
      await http().post(`/v1/academic-docs/requests/${d.id}/decide`).set(as('principal')).send({ approve: true }).expect(200);
      await http().post(`/v1/academic-docs/requests/${d.id}/issue`).set(as('principal')).expect(200);
      return d.id as string;
    };
    const before = await issueTranscript();
    const body = { studentId: t.students[A].id, source: 'institution', provider: 'St Joseph College, Mysuru', courseTitle: 'BC204 Financial Accounting', term: 2, credits: 4, grade: 'a', gradePoint: 9 };
    const act = (action: string, id: string, params: Record<string, string> = {}) => http().post('/v1/records/credit-transfers/bulk').set(as('principal')).send({ op: 'action', action, target: { ids: [id] }, params }).expect(200);
    await http().post('/v1/records/credit-transfers').set(as('teacher')).send(body).expect(403);
    expect((await http().post('/v1/records/credit-transfers').set(as('principal')).send({ ...body, mappedSubjectId: t.subject.id }).expect(409)).body.message).toMatch(/already passed/);
    await http().post('/v1/records/credit-transfers').set(as('principal')).send({ ...body, gradePoint: 11 }).expect(400);
    const ct = (await http().post('/v1/records/credit-transfers').set(as('principal')).send(body).expect(201)).body;
    expect((await http().get(`/v1/records/credit-transfers/${ct.id}`).set(as('principal')).expect(200)).body).toMatchObject({ grade: 'A', credits: 4, gradePoint: 9, mappedSubjectId: null, status: 'pending' });
    // A request awaiting a decision counts nowhere; approving it dates the transcript issued before.
    expect((await owner.query('select superseded_reason from academic_doc_requests where id = $1', [before])).rows[0].superseded_reason).toBeNull();
    expect((await act('approve', ct.id)).body.succeeded).toBe(1);
    expect((await owner.query('select superseded_reason from academic_doc_requests where id = $1', [before])).rows[0].superseded_reason).toBe('Transferred credits changed');

    const after = await issueTranscript();
    const snap = (await owner.query('select snapshot from academic_doc_requests where id = $1', [after])).rows[0].snapshot;
    expect(snap.terms[0]).toMatchObject({ label: 'Credits transferred from St Joseph College, Mysuru', creditsEarned: 4 });
    expect(snap.terms[0].lines[0]).toMatchObject({ subject: 'BC204 Financial Accounting', grade: 'A', gradePoint: 9, passed: true });
    expect(snap.cgpa).toBeGreaterThan(8.2); // 8.2 here, 9 brought in

    const sheet = 'Roll number,Source,Course,Offered by,Counts in term,Credits,Grade,Grade point\r\nR2,institution,GF101 English,Govt First Grade College,1,3,B,7\r\nR3,institution,GF102 Kannada,Govt First Grade College,1,3,B,11\r\nR9,institution,GF103 Hindi,Govt First Grade College,1,3,B,7\r\n';
    const check = (await http().post('/v1/records/credit-transfers/import').set(as('principal')).attach('file', Buffer.from(sheet), 'credits.csv').expect(200)).body;
    expect(check).toMatchObject({ status: 'validated', totals: { rows: 3, created: 1, error: 2 } });
    const done = (await http().post(`/v1/records/credit-transfers/import/${check.id}/commit`).set(as('principal')).send({ skipErrors: true }).expect(200)).body;
    expect(done).toMatchObject({ committed: true, totals: { created: 1, error: 2 } });
    const list = (await http().get('/v1/records/credit-transfers?f.institution=Govt%20First%20Grade%20College').set(as('principal')).expect(200)).body;
    expect(list.rows.map((r: { rollNo: string; courseTitle: string; status: string }) => `${r.rollNo} ${r.courseTitle} ${r.status}`)).toEqual(['R2 GF101 English pending']);
    expect((await http().get('/v1/records/credit-transfers').set(as('outsider')).expect(200)).body.total).toBe(0);

    // An approved credit is not deleted; revoking it takes it out of the CGPA and dates the transcript.
    await http().delete(`/v1/records/credit-transfers/${ct.id}`).set(as('principal')).expect(403);
    expect((await act('revoke', ct.id, { note: 'Equivalence order withdrawn' })).body.succeeded).toBe(1);
    expect((await owner.query('select superseded_at from academic_doc_requests where id = $1', [after])).rows[0].superseded_at).not.toBeNull();
    expect(await actions()).toEqual(expect.arrayContaining(['credit_transfer.created', 'credit_transfer.approved', 'credit_transfer.revoked']));
  });

  it('runs a valuation camp: bundles, issue, day counts, return, hand-over and close', async () => {
    const camp = (await http().post('/v1/records/valuation-camps').set(as('principal')).send({ name: 'Central valuation', sessionId, venue: 'Block A', startsOn: '2026-11-10', endsOn: '2026-11-12', chiefExaminerId: t.teacher2.id }).expect(201)).body;
    expect((await http().post(`/v1/valuation-camps/${camp.id}/pack`).set(as('principal')).send({ paperId, size: 2 }).expect(200)).body).toEqual({ bundles: 2, scripts: 3 });
    await http().post(`/v1/valuation-camps/${camp.id}/pack`).set(as('principal')).send({ paperId, size: 2 }).expect(409);
    const bundles = (await http().get(`/v1/records/valuation-bundles?f.camp=${camp.id}`).set(as('principal')).expect(200)).body.rows;
    expect(bundles.map((b: { scripts: number }) => b.scripts)).toEqual([2, 1]);
    await http().post(`/v1/valuation-bundles/${bundles[0].id}/issue`).set(as('principal')).send({ examinerId: t.teacher.id }).expect(200);
    await http().post(`/v1/valuation-bundles/${bundles[0].id}/count`).set(as('teacher')).send({ day: '2026-11-15', scripts: 1 }).expect(400); // outside the camp
    await http().post(`/v1/valuation-bundles/${bundles[0].id}/count`).set(as('teacher')).send({ day: '2026-11-10', scripts: 3 }).expect(400); // more than the bundle
    expect((await http().post(`/v1/valuation-bundles/${bundles[0].id}/count`).set(as('teacher')).send({ day: '2026-11-10', scripts: 2 }).expect(200)).body.status).toBe('valued');
    await http().post(`/v1/valuation-bundles/${bundles[0].id}/return`).set(as('principal')).expect(200);
    await http().post(`/v1/records/valuation-bundles/${bundles[1].id}/move`).set(as('principal')).send({ to: t.teacher2.id, reason: 'Examiner on leave' }).expect(200);
    expect((await http().get(`/v1/records/valuation-bundles/${bundles[1].id}`).set(as('principal')).expect(200)).body).toMatchObject({ status: 'issued', examinerId: t.teacher2.id });
    await http().delete(`/v1/records/valuation-bundles/${bundles[1].id}`).set(as('principal')).expect(403);
    expect((await http().post(`/v1/valuation-camps/${camp.id}/close`).set(as('principal')).expect(409)).body.message).toMatch(/1 bundles/);
    expect((await http().get(`/v1/valuation-camps/${camp.id}/daily`).set(as('principal')).expect(200)).body).toEqual([{ day: '2026-11-10', examiner: t.teacher.fullName, scripts: 2, bundles: 1 }]);
    expect((await http().get('/v1/valuation-bundles/mine').set(as('teacher')).expect(200)).body).toHaveLength(1);
  });

  it('exports internal marks in the university format and fills attendance marks from the slabs', async () => {
    const csv = await http().get(`/v1/exam-sessions/${sessionId}/internal-marks.csv`).set(as('principal')).expect(200);
    expect(csv.text.split('\n')[0]).toBe('Register No,Name,Subject Code,Subject,Internal Marks,Max Internal');
    expect(csv.text).toContain('R1,Student Alpha,BCOM-3.1,Corporate Accounting,32,40');
    const att = (await http().post('/v1/assessments').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Attendance', kind: 'internal', maxMarks: 5, heldOn: '2026-10-30' }).expect(201)).body.id;
    expect((await http().post(`/v1/assessments/${att}/attendance-marks`).set(as('teacher')).expect(200)).body).toMatchObject({ filled: 0, noAttendance: 3 });
    await http().post(`/v1/assessments/${seeId}/attendance-marks`).set(as('principal')).expect(409);
  });

  it('registers backlogs for a supplementary session and passed subjects for an improvement session', async () => {
    const base = { programId: t.program.id, academicYearId: t.section.academicYearId, term: 3, startsOn: '2027-01-10', endsOn: '2027-01-20' };
    const supp = (await http().post('/v1/records/exam-sessions').set(as('principal')).send({ ...base, name: 'Supplementary Jan 2027', kind: 'supplementary' }).expect(201)).body;
    await http().post(`/v1/exam-sessions/${supp.id}/supplementary`).set(as('principal')).send({ studentId: t.students[A].id, subjectIds: [t.subject.id] }).expect(400); // passed
    await http().post(`/v1/exam-sessions/${supp.id}/supplementary`).set(as('principal')).send({ studentId: t.students[B].id, subjectIds: [t.subject.id] }).expect(201);
    const imp = (await http().post('/v1/records/exam-sessions').set(as('principal')).send({ ...base, name: 'Improvement Jan 2027', kind: 'improvement' }).expect(201)).body;
    await http().post(`/v1/exam-sessions/${imp.id}/supplementary`).set(as('principal')).send({ studentId: t.students[A].id, subjectIds: [t.subject.id] }).expect(201);
    await http().post(`/v1/exam-sessions/${imp.id}/supplementary`).set(as('principal')).send({ studentId: t.students[B].id, subjectIds: [t.subject.id] }).expect(400); // not passed
    await http().put(`/v1/exam-sessions/${supp.id}/registration-window`).set(as('principal')).send({ opensOn: '2026-11-01', closesOn: '2026-11-10', lateUntil: '2026-11-05' }).expect(400);
    expect((await http().put(`/v1/exam-sessions/${supp.id}/registration-window`).set(as('principal')).send({ opensOn: '2026-10-20', closesOn: '2026-10-25', lateUntil: '2026-11-05' }).expect(200)).body.lateUntil).toBe('2026-11-05');
    expect((await http().get(`/v1/exam-sessions/${supp.id}/registration-window`).set(as('principal')).expect(200)).body.state).toBe('late');
  });

  it('produces the registers and analyses on screen and as CSV', async () => {
    const get = async (r: string, q = `?sessionId=${sessionId}`) => (await http().get(`/v1/exam-cell/reports/${r}${q}`).set(as('principal')).expect(200)).body;
    expect((await get('pass_by_course')).rows[0]).toMatchObject({ code: 'BCOM-3.1', appeared: 3, passed: 2 });
    expect((await get('ranks')).rows.map((r: { rank: unknown }) => r.rank)).toEqual([1, 2, '']);
    expect((await get('pass_by_teacher')).rows[0]).toMatchObject({ teacher: t.teacher.fullName, appeared: 3 });
    expect((await get('result_register')).rows).toHaveLength(3);
    expect((await get('analysis')).rows[0]).toMatchObject({ by: 'Gender', value: 'Not recorded', appeared: 3 });
    expect((await get('answer_sheets')).totals).toMatchObject({ issued: 3, returned: 4 });
    expect((await get('mismatches')).rows[0]).toMatchObject({ first: '24.00', second: '42.00', status: 'resolved' });
    expect((await get('withheld')).rows[0]).toMatchObject({ reason: 'malpractice', status: 'released' });
    expect((await get('remuneration', '')).rows.length).toBeGreaterThan(0);
    // The duplicate went out of date with the name correction: it waits to be reissued.
    // The first transcript (a duplicate replaced it) and the two out of date after the credit transfer.
    const pending = (await get('pending_certificates', '')).rows;
    expect(pending).toHaveLength(3);
    expect(pending.every((r: { document: string; rollNo: string; status: string }) => r.document === 'transcript' && r.rollNo === 'R1' && r.status === 'Reissue needed')).toBe(true);
    expect(pending.filter((r: { note: string }) => r.note === 'Transferred credits changed')).toHaveLength(2);
    expect((await get('gold_medals')).rows).toEqual([]); // nobody has finished the programme yet
    expect((await get('distinctions')).rows[0]).toMatchObject({ rollNo: 'R1', subjects: 'BCOM-3.1' });
    const csv = await http().get(`/v1/exam-cell/reports/gazette?sessionId=${sessionId}&format=csv`).set(as('principal')).expect(200);
    expect(csv.text).toContain('Roll no,Name,Class,BCOM-3.1,SGPA,CGPA,Result');
    await http().get('/v1/exam-cell/reports/gazette').set(as('principal')).expect(400);
    await http().get(`/v1/exam-cell/reports/gazette?sessionId=${sessionId}`).set(as('teacher')).expect(403);
    await http().get('/v1/exam-cell/reports/nope?sessionId=' + sessionId).set(as('principal')).expect(400);
  });

  it('imports past-exam questions through the kit and keeps them per subject', async () => {
    const q = (await http().post('/v1/records/past-exam-questions').set(as('principal')).send({ question: 'Explain the issue of shares at a premium.', exam: 'BU BCom Sem 3', year: 2024, marks: 10, subjectId: t.subject.id, unit: 'Unit 2', questionNo: '4(a)' }).expect(201)).body;
    expect(q).toMatchObject({ subjectCode: 'BCOM-3.1', year: 2024 });
    await http().post('/v1/records/past-exam-questions').set(as('teacher')).send({ question: 'x y z w q', exam: 'E', year: 2024 }).expect(403);
    expect((await http().get('/v1/records/past-exam-questions?f.year=2024').set(as('teacher')).expect(200)).body.total).toBe(1);
    expect((await http().get('/v1/past-exam-questions').set(as('teacher')).expect(200)).body).toHaveLength(1);
  });

  it('leaves an audit trail', async () => {
    expect(await actions()).toEqual(
      expect.arrayContaining([
        'exam_session.created',
        'exam.paper.rescheduled',
        'exam.roster.built',
        'invigilation.swap_approved',
        'answer_sheet_account.submitted',
        'exam.double_entry.posted',
        'exam.results.frozen',
        'exam.results.rolled_back',
        'exam.malpractice.penalised',
        'grace_application.applied',
        'result_withhold.released',
        'exam.result.changed',
        'exam.results.unpublished',
        'academic_doc.duplicate_requested',
        'record_correction.applied',
        'verification_request.verified',
        'valuation.packed',
        'exam_cell.settings_saved',
      ]),
    );
  });
});
