import { readFileSync, writeFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/**
 * Live smoke of every board AI task against the real model in AI_BASE_URL / AI_MODEL / AI_API_KEY
 * (Google Gemini for demos). Skipped unless AI_LIVE_SMOKE=1, because each test uses the free
 * allowance. Run from services/api with the AI_* lines of .env in the environment:
 *   AI_LIVE_SMOKE=1 AI_LIVE_PNG=/path/to/handwritten-maths.png npx vitest run test/ai-live.e2e.spec.ts
 * AI_LIVE_OUT=<file> writes every result there, to read the answers themselves.
 */
const live = process.env.AI_LIVE_SMOKE === '1' && !!process.env.AI_BASE_URL;

describe.skipIf(!live)('KINETIX AI live smoke (real model)', { timeout: 180_000 }, () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const results: Record<string, unknown> = {};
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  /** Posts, keeps the result for AI_LIVE_OUT, and fails with the API's message on an error. */
  const ask = async (name: string, who: string, url: string, body: object) => {
    const res = await http().post(url).set('authorization', `Bearer ${tokens[who]}`).send(body);
    results[name] = { status: res.status, body: res.body };
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBeLessThan(300);
    if (res.body.meta) expect(res.body.meta.preview).toBe(false);
    return res.body;
  };
  /** Every string in a result, for checks that no LaTeX or markdown reached the board. */
  const texts = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(texts) : v && typeof v === 'object' ? Object.values(v).flatMap(texts) : []);
  const clean = (v: unknown) => {
    for (const s of texts(v)) {
      expect(s, s).not.toMatch(/\\(frac|sqrt|times|cdot|text)|\$|\*\*|^#+ /m);
    }
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    // A school class, as on the demo board.
    await owner.query(`update tenants set kind = 'school', name = 'Vidya Niketan School' where id = $1`, [t.tenantId]);
    await owner.query(`update sections set display_name = 'Class 8 A' where id = $1`, [t.section.id]);
    await owner.query(`update subjects set name = 'Science' where id = $1`, [t.subject.id]);
    app = await createApp(clock);
    tokens = { teacher: await login(t.teacher.email!), student: await login(t.studentUser.email!) };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
  }, 60_000);

  afterAll(async () => {
    if (process.env.AI_LIVE_OUT) writeFileSync(process.env.AI_LIVE_OUT, JSON.stringify(results, null, 2));
    socket?.disconnect();
    await app?.close();
    await owner.end();
  });

  it('explains a maths problem step by step', async () => {
    const r = await ask('explain', 'board', '/v1/ai/explain', { question: 'Solve 2x + 5 = 17', level: 'Class 8 CBSE Maths', fresh: true });
    expect(r.result.answer).toMatch(/x\s*=\s*6/);
    clean(r.result);
    expect(r.result.answer).not.toMatch(/^(hello|hi|dear|good (morning|afternoon))\b|Vidya Niketan|Class 8 A/i);
  });

  it('makes a quiz of every question type', async () => {
    const r = await ask('quiz', 'board', '/v1/ai/quiz', { topic: 'Photosynthesis', count: 4, types: ['mcq', 'trueFalse', 'fillBlank', 'shortAnswer'], level: 'Class 7 CBSE Science' });
    expect(r.result.questions).toHaveLength(4);
    clean(r.result);
  });

  it('makes a Hindi multiple-choice quiz', async () => {
    const r = await ask('quizHi', 'board', '/v1/ai/quiz', { topic: 'Fractions', count: 3, language: 'hi', level: 'Class 6 CBSE Maths' });
    expect(r.result.questions).toHaveLength(3);
    expect(r.result.questions[0].question).toMatch(/[ऀ-ॿ]/);
  });

  it('drafts homework and marks a submission against the rubric', async () => {
    const hw = await ask('homework', 'board', '/v1/ai/homework', { topic: "Ohm's law", count: 4, types: ['mcq', 'twoMark', 'fiveMark', 'diagram'], level: 'Class 10 CBSE Science' });
    expect(hw.result.questions.length).toBeGreaterThanOrEqual(4);
    clean(hw.result);

    const [row] = (await owner.query(`insert into homework (tenant_id, section_id, subject_id, created_by, title, due_on) values ($1, $2, $3, $4, 'Ohm''s law', '2026-10-25') returning id`, [t.tenantId, t.section.id, t.subject.id, t.teacher.id])).rows;
    await owner.query(`insert into homework_submissions (tenant_id, homework_id, student_id, text, submitted_by, submitted_at) values ($1, $2, $3, 'Ohm''s law says the current through a wire is proportional to the voltage, V = IR.', $4, now())`, [t.tenantId, row.id, t.students[0].id, t.studentUser.id]);
    const q = { question: "State Ohm's law and give one example.", maxMarks: 5, rubric: [{ criterion: 'Statement of the law', marks: 3 }, { criterion: 'An example', marks: 2 }] };
    const draft = await ask('mark', 'teacher', `/v1/grading-assist/homework/${row.id}/${t.students[0].id}/suggest`, q);
    expect(draft.preview).toBe(false);
    expect(draft.criteria.map((c: { criterion: string }) => c.criterion)).toEqual(['Statement of the law', 'An example']);
    expect(draft.criteria[1].awarded).toBeLessThanOrEqual(1); // no example was given
  });

  it('plans a lesson whose minutes add up', async () => {
    const r = await ask('lessonPlan', 'board', '/v1/ai/lesson-plan', { topic: 'Fractions on a number line', minutes: 40 });
    expect(r.result.steps.reduce((s: number, x: { minutes: number }) => s + x.minutes, 0)).toBe(40);
    clean(r.result);
    expect(texts(r.result).join(' ')).not.toMatch(/Vidya Niketan|chalk/i);
  });

  it('summarises the board and prepares a lecture', async () => {
    const boardText = 'Speed = distance / time\nVelocity is speed in a given direction\nv = u + at\nA car goes 100 m in 20 s: speed = 5 m/s';
    const sum = await ask('summary', 'board', '/v1/ai/board-summary', { topic: 'Motion', boardText, format: 'revision', level: 'Class 9 CBSE Science' });
    expect(sum.result.keyConcepts.length).toBeGreaterThan(0);
    clean(sum.result);
    const lec = await ask('lecture', 'board', '/v1/ai/lecture', { topic: 'Motion', minutes: 40, level: 'Class 9 CBSE Science' });
    expect(lec.result.outline.length).toBeGreaterThanOrEqual(2);
    clean(lec.result);
  });

  it('reads handwritten maths from a picture of the board', async () => {
    const png = process.env.AI_LIVE_PNG ? readFileSync(process.env.AI_LIVE_PNG).toString('base64') : undefined;
    if (!png) return;
    const r = await ask('readBoard', 'board', '/v1/ai/read-board', { image: png });
    expect(r.result.text).toMatch(/quadratic/i);
    expect(r.result.math.join(' ')).toMatch(/x\^\{?2\}?\s*-\s*5x\s*\+\s*6\s*=\s*0/);
    expect(r.result.math.join(' ')).toMatch(/\\frac\{?3\}?\{?4\}?|3\/4/);
  });

  it('tutors a student', async () => {
    const r = await ask('tutor', 'student', '/v1/ai/tutor/ask', { question: 'Why do we need chlorophyll for photosynthesis?' });
    expect(r.answer).toMatch(/light/i);
    clean(r);
  });

  it('makes flashcards (quick checks with answers) from a selection', async () => {
    const r = await ask('flashcards', 'board', '/v1/ai/select-ask', { action: 'quiz', content: 'Mitochondria are the powerhouse of the cell. Chloroplasts make food in plant cells. The nucleus controls the cell.', level: 'Class 8 CBSE Science' });
    expect(r.result.items.length).toBeGreaterThanOrEqual(3);
    // A card shows the question and its answer together.
    for (const item of r.result.items) expect(item).toMatch(/Answer:/);
    clean(r.result);
  });

  it('corrects grammar and translates a selection', async () => {
    const g = await ask('grammar', 'board', '/v1/ai/explain', { question: 'Correct the grammar of this sentence and explain the rule: "She don\'t like apples."', level: 'Class 6 CBSE English' });
    expect(g.result.answer).toMatch(/doesn['’]t|does not/i);
    clean(g.result);
    const tr = await ask('translate', 'board', '/v1/ai/select-ask', { action: 'translate', targetLanguage: 'kn', content: 'Plants make their own food.' });
    expect(tr.result.answer).toMatch(/[ಀ-೿]/);
  });
});
