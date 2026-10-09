import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('assessment tools: assessment types, rubrics, question types and metadata, reattempts, academic integrity', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let schemeId: string;
  let rubricId: string;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;
  const criteria = [
    { name: 'Method', levels: [{ label: 'Full', points: 4, descriptor: 'All steps shown' }, { label: 'Partial', points: 2 }, { label: 'None', points: 0 }] },
    { name: 'Accuracy', levels: [{ label: 'Full', points: 3 }, { label: 'None', points: 0 }] },
  ];

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens = { principal: await login(t.principal.email!), teacher: await login(t.teacher.email!), student: await login(t.studentUser.email!), parent: await login(t.guardian.email!) };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('accepts observation, diagnostic and skill components in an assessment scheme, with a limit on attempts', async () => {
    const scale = (await post('principal', '/v1/grade-scales', { name: 'BU NEP', preset: 'bu-nep', isDefault: true }).expect(201)).body.id;
    const body = {
      subjectId: t.subject.id,
      academicYearId: t.section.academicYearId,
      name: 'Practical accounting',
      credits: 4,
      maxAttempts: 2,
      gradeScaleId: scale,
      passRules: { minInternalPercent: null, minExternalPercent: null, minTotalPercent: 40 },
      components: [
        { code: 'OBS', name: 'Classroom observation', kind: 'observation', weight: 20 },
        { code: 'DIA', name: 'Diagnostic test', kind: 'diagnostic', weight: 30 },
        { code: 'SKL', name: 'Skill demonstration', kind: 'skill', weight: 50 },
      ],
    };
    await put('principal', '/v1/schemes', { ...body, components: [{ ...body.components[0], kind: 'telepathy' }, body.components[1], body.components[2]] }).expect(400);
    const saved = (await put('principal', '/v1/schemes', body).expect(200)).body;
    expect(saved.components.map((c: { kind: string }) => c.kind)).toEqual(['observation', 'diagnostic', 'skill']);
    schemeId = (await q('select id from assessment_schemes where tenant_id = $1', [t.tenantId]))[0].id;
    expect((await q('select max_attempts from assessment_schemes where id = $1', [schemeId]))[0].max_attempts).toBe(2);
  });

  it('keeps reusable rubrics, marks with them, and protects rubrics already used', async () => {
    await post('teacher', '/v1/assessment-tools/rubrics', { name: 'Bad', criteria: [{ name: 'One level', levels: [{ label: 'x', points: 1 }, { label: 'y', points: 1 }] }] }).expect(400);
    const r = (await post('teacher', '/v1/assessment-tools/rubrics', { name: 'Ledger practical', scope: 'practical', criteria }).expect(201)).body;
    rubricId = r.id;
    expect(r.maxPoints).toBe(7);
    await post('teacher', '/v1/assessment-tools/rubrics', { name: 'Ledger practical', criteria }).expect(409);
    await post('student', '/v1/assessment-tools/rubrics', { name: 'Mine', criteria }).expect(403);
    await put('teacher', `/v1/assessment-tools/rubrics/${rubricId}`, { name: 'Ledger practical', scope: 'practical', criteria: [...criteria, { name: 'Neatness', levels: [{ label: 'Neat', points: 1 }, { label: 'Untidy', points: 0 }] }] }).expect(200);
    await post('teacher', `/v1/assessment-tools/rubrics/${rubricId}/score`, { studentId: t.students[0].id, selections: [0] }).expect(400);
    const scored = (await post('teacher', `/v1/assessment-tools/rubrics/${rubricId}/score`, { studentId: t.students[0].id, selections: [1, 0, 0], contextKind: 'practical' }).expect(201)).body;
    expect(scored).toMatchObject({ total: 6, maxTotal: 8 });
    const history = (await get('teacher', `/v1/assessment-tools/rubrics/${rubricId}/scores?studentId=${t.students[0].id}`).expect(200)).body;
    expect(history).toHaveLength(1);
    await put('teacher', `/v1/assessment-tools/rubrics/${rubricId}`, { name: 'Ledger practical', criteria }).expect(409);
    await post('principal', `/v1/assessment-tools/rubrics/${rubricId}/archive`).expect(200);
    expect((await get('teacher', '/v1/assessment-tools/rubrics').expect(200)).body).toHaveLength(0);
    expect((await get('teacher', '/v1/assessment-tools/rubrics?all=true').expect(200)).body).toHaveLength(1);
    await post('teacher', `/v1/assessment-tools/rubrics/${rubricId}/score`, { studentId: t.students[0].id, selections: [0, 0, 0] }).expect(404);
  });

  it('stores question types, knowledge level, competency and skill tags, and refuses a malformed question', async () => {
    const rb = (await post('teacher', '/v1/assessment-tools/rubrics', { name: 'Viva rubric', scope: 'viva', criteria }).expect(201)).body;
    const base = { subjectId: t.subject.id, topic: 'Share capital', bloom: 'apply', difficulty: 'medium', marks: 5, text: 'Read the case and answer the questions that follow.', options: [], answer: '' };
    const matching = { ...base, type: 'matching', marks: 2, text: 'Match each term with its meaning.', kLevel: 'K2', competencyTags: ['Financial reporting'], skillTags: ['Analysis'], typeConfig: { pairs: [{ left: 'Debit', right: 'Left side' }, { left: 'Credit', right: 'Right side' }] } };
    await post('teacher', '/v1/question-bank/questions', { ...matching, typeConfig: { pairs: [{ left: 'Debit', right: 'Left side' }] } }).expect(400);
    const m = (await post('teacher', '/v1/question-bank/questions', matching).expect(201)).body;
    expect(m).toMatchObject({ type: 'matching', kLevel: 'K2', competencyTags: ['Financial reporting'], skillTags: ['Analysis'] });
    await post('teacher', '/v1/question-bank/questions', { ...matching, kLevel: 'K9' }).expect(400);
    const passage = 'Sunrise Ltd issued 10,000 shares of Rs 10 each at a premium of Rs 2 and received the full amount with applications.';
    const cs = { ...base, type: 'case_study', kLevel: 'K4', typeConfig: { passage, subQuestions: [{ text: 'Pass the journal entry', marks: 3 }, { text: 'State the premium', marks: 2 }] } };
    await post('teacher', '/v1/question-bank/questions', { ...cs, marks: 6 }).expect(400);
    await post('teacher', '/v1/question-bank/questions', cs).expect(201);
    await post('teacher', '/v1/question-bank/questions', { ...base, type: 'practical_rubric', marks: 8, topic: 'Ledger posting', text: 'Post the transactions to the ledger and balance the accounts.' }).expect(400);
    const pr = (await post('teacher', '/v1/question-bank/questions', { ...base, type: 'practical_rubric', marks: 8, topic: 'Ledger posting', text: 'Post the transactions to the ledger and balance the accounts.', typeConfig: { rubricId: rb.id } }).expect(201)).body;
    expect(pr.typeConfig.rubricId).toBe(rb.id);
  });

  it('limits reattempts to what the assessment allows and puts each request to a decision', async () => {
    const mine = () => post('student', '/v1/assessment-tools/reattempts', { schemeId, reason: 'I was in hospital during the exam week' });
    await post('student', '/v1/assessment-tools/reattempts', { schemeId, reason: 'x' }).expect(400);
    const first = (await mine().expect(201)).body;
    expect(first).toMatchObject({ attemptNo: 2, status: 'pending' });
    await mine().expect(409); // one is already waiting
    await post('teacher', `/v1/assessment-tools/reattempts/${first.id}/decide`, { decision: 'approved' }).expect(403);
    expect((await post('principal', `/v1/assessment-tools/reattempts/${first.id}/decide`, { decision: 'approved', note: 'Medical certificate seen' }).expect(200)).body.status).toBe('approved');
    await post('principal', `/v1/assessment-tools/reattempts/${first.id}/decide`, { decision: 'rejected' }).expect(409);
    const limit = await mine().expect(409);
    expect(limit.body.message).toContain('All 2 attempts');
    const own = (await get('student', '/v1/assessment-tools/reattempts').expect(200)).body;
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ status: 'approved', scheme: 'Practical accounting', subject: 'Corporate Accounting' });
    // Staff ask on behalf of another student; a rejected request frees the attempt.
    const other = (await post('teacher', '/v1/assessment-tools/reattempts', { studentId: t.students[0].id, schemeId, reason: 'Clash with a sports meet' }).expect(201)).body;
    await post('principal', `/v1/assessment-tools/reattempts/${other.id}/decide`, { decision: 'rejected' }).expect(200);
    expect((await post('teacher', '/v1/assessment-tools/reattempts', { studentId: t.students[0].id, schemeId, reason: 'Asking again with the proof' }).expect(201)).body.attemptNo).toBe(2);
    expect((await get('principal', '/v1/assessment-tools/reattempts?status=pending').expect(200)).body).toHaveLength(1);
    await get('parent', '/v1/assessment-tools/reattempts').expect(403);
  });

  it('collects integrity events from an exam screen, raises severity on repeats, and records the review', async () => {
    const report = (kind: string) => post('student', '/v1/assessment-tools/integrity/report', { contextKind: 'online_exam', contextId: schemeId, kind, details: { at: 'q4' } });
    const sev: string[] = [];
    for (let i = 0; i < 7; i++) sev.push((await report('tab_switch').expect(200)).body.severity);
    expect(sev[0]).toBe('low');
    expect(sev[6]).toBe('medium');
    await report('manual').expect(400);
    await post('teacher', '/v1/assessment-tools/integrity/report', {}).expect(403);
    const manual = (await post('teacher', '/v1/assessment-tools/integrity/flags', { studentId: t.students[1].id, contextKind: 'viva', severity: 'high', details: { note: 'Answers read from a phone' } }).expect(201)).body;
    const open = (await get('teacher', '/v1/assessment-tools/integrity/flags?status=open').expect(200)).body as { id: string; kind: string; fullName: string }[];
    expect(open).toHaveLength(8);
    await post('teacher', `/v1/assessment-tools/integrity/flags/${manual.id}/review`, { status: 'confirmed', note: 'Seen by invigilator' }).expect(403);
    await post('principal', `/v1/assessment-tools/integrity/flags/${manual.id}/review`, { status: 'confirmed', note: 'Seen by invigilator and a second examiner' }).expect(200);
    await post('principal', `/v1/assessment-tools/integrity/flags/${manual.id}/review`, { status: 'dismissed', note: 'Changed my mind' }).expect(409);
    const confirmed = (await get('teacher', `/v1/assessment-tools/integrity/flags?status=confirmed&studentId=${t.students[1].id}`).expect(200)).body;
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].reviewer).toBeTruthy();
  });

  it('compares submitted work and flags the pairs that overlap', async () => {
    const a = 'The accrual concept requires revenue to be recorded when earned and expenses when incurred regardless of cash movement in the period';
    const copy = 'Accrual concept requires revenue to be recorded when earned and expenses when incurred regardless of cash movement in the year';
    const own = 'Matching principle pairs costs with the income they helped to create so that profit is measured fairly in each period';
    const out = (await post('teacher', '/v1/assessment-tools/integrity/similarity', { contextKind: 'assignment', threshold: 0.5, items: [{ studentId: t.students[0].id, text: a }, { studentId: t.students[1].id, text: copy }, { studentId: t.students[2].id, text: own }] }).expect(200)).body;
    expect(out.checked).toBe(3);
    expect(out.pairs).toHaveLength(1);
    expect(out.pairs[0].score).toBeGreaterThan(0.6);
    const flags = (await get('teacher', '/v1/assessment-tools/integrity/flags?status=open').expect(200)).body as { kind: string; studentId: string }[];
    expect(flags.filter((f) => f.kind === 'plagiarism_match').map((f) => f.studentId).sort()).toEqual([t.students[0].id, t.students[1].id].sort());
  });
});
