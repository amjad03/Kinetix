import type { INestApplication } from '@nestjs/common';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LLM_PROVIDER } from '../src/ai/ai.service.js';
import { OpenAiCompatibleProvider } from '../src/ai/providers.js';
import { FakeGemini } from './fake-ai-servers.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/**
 * Every board AI feature through the API, answered by a stand-in for Google Gemini's
 * OpenAI-compatible endpoint (free tier): Gemini's request format, its error replies (429 with a
 * retryDelay, 503 "overloaded", the daily quota), cut-off and withheld replies, and answers
 * written the way Gemini writes them (LaTeX, markdown, nulls, numbers as text).
 */
describe('KINETIX AI on Google Gemini (OpenAI-compatible endpoint)', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const gemini = new FakeGemini();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const post = (who: string, url: string, body: object = {}) => http().post(url).set('authorization', `Bearer ${tokens[who]}`).send(body);
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const sent = (n = -1) => gemini.requests.at(n)!.body;

  beforeAll(async () => {
    await gemini.start();
    t = await createTenant(owner);
    app = await createApp(clock, (b) =>
      b.overrideProvider(LLM_PROVIDER).useValue(new OpenAiCompatibleProvider(gemini.url, 'gemini-2.5-flash', FakeGemini.KEY, 10_000, true, { reasoningEffort: 'low' })),
    );
    tokens = { teacher: await login(t.teacher.email!), student: await login(t.studentUser.email!) };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
  });

  beforeEach(() => {
    gemini.requests = [];
    gemini.replies = [];
    gemini.failures = [];
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await gemini.stop();
    await owner.end();
  });

  it('asks and explains on the board: Gemini request format, and maths as readable text', async () => {
    gemini.replies.push(JSON.stringify({ answer: '**Step 1:** Subtract 7: $3x = 15$\n*   Divide by 3: x = \\frac{15}{3}\nAnswer: $x = 5$', keyPoints: ['Do the same to *both* sides'], followUps: null }));
    const res = await post('board', '/v1/ai/explain', { question: 'Solve 3x + 7 = 22', level: 'Class 8 CBSE Maths' }).expect(200);
    expect(res.body.result).toEqual({ answer: 'Step 1: Subtract 7: 3x = 15\n• Divide by 3: x = 15/3\nAnswer: x = 5', keyPoints: ['Do the same to both sides'], followUps: [] });
    expect(res.body.meta).toMatchObject({ provider: 'openai-compatible', model: 'gemini-2.5-flash', preview: false, cached: false });
    expect(sent()).toMatchObject({ model: 'gemini-2.5-flash', response_format: { type: 'json_object' }, reasoning_effort: 'low', max_tokens: 1500 + 1024, temperature: 0.3 });
    expect(gemini.requests[0].headers.authorization).toBe(`Bearer ${FakeGemini.KEY}`);
    expect(sent().messages[0].content).toContain('Do not use LaTeX');
  });

  it('makes a quick quiz: answer letters, true/false and nulls are fixed without a second request', async () => {
    gemini.replies.push(
      JSON.stringify({
        questions: [
          { type: 'mcq', question: 'Which is the area of a square of side $a$?', options: ['$a^2$', '$2a$', '$4a$', '$a^3$'], answer: 'A', explanation: 'Side × side.', misconception: null },
          { type: 'trueFalse', question: 'Goodwill is a fictitious asset.', options: ['True', 'False'], answer: false, explanation: 'It is intangible.' },
          { type: 'fillBlank', question: 'H_2O is ____.', options: [], answer: 'water', explanation: 'Two hydrogen, one oxygen.' },
        ],
      }),
    );
    const res = await post('board', '/v1/ai/quiz', { topic: 'Mixed revision', count: 3, types: ['mcq', 'trueFalse', 'fillBlank'] }).expect(200);
    expect(gemini.requests).toHaveLength(1);
    const [mcq, tf, blank] = res.body.result.questions;
    expect(mcq).toMatchObject({ question: 'Which is the area of a square of side a?', options: ['a²', '2a', '4a', 'a³'], answer: 0 });
    expect(mcq.misconception).toBeUndefined();
    expect(tf.answer).toBe(1);
    expect(blank).toMatchObject({ question: 'H₂O is ____.', answerText: 'water' });
  });

  it('drafts homework (marks sent as text) and marks a submission with the rubric', async () => {
    gemini.replies.push(
      JSON.stringify({
        title: 'Homework: Motion',
        instructions: 'Answer in your notebook.',
        questions: [
          { type: 'twoMark', question: 'State the first equation of motion.', marks: '2 marks', answer: '$v = u + at$', rubric: '1 mark formula, 1 mark symbols', diagram: null },
          { type: 'fiveMark', question: 'Derive $s = ut + \\frac{1}{2}at^2$.', marks: 5, answer: 'Area under the v-t graph.', rubric: 'Steps' },
        ],
      }),
    );
    const hw = await post('board', '/v1/ai/homework', { topic: 'Equations of motion', count: 2, types: ['twoMark', 'fiveMark'] }).expect(200);
    expect(hw.body.result.questions.map((q: { marks: number }) => q.marks)).toEqual([2, 5]);
    expect(hw.body.result.questions[0].answer).toBe('v = u + at');
    expect(hw.body.result.questions[1].question).toBe('Derive s = ut + 1/2at².');

    const [row] = (await owner.query(`insert into homework (tenant_id, section_id, subject_id, created_by, title, due_on) values ($1, $2, $3, $4, 'Define goodwill', '2026-10-25') returning id`, [t.tenantId, t.section.id, t.subject.id, t.teacher.id])).rows;
    await owner.query(`insert into homework_submissions (tenant_id, homework_id, student_id, text, submitted_by, submitted_at) values ($1, $2, $3, 'Goodwill is the value of a good name, like a famous shop.', $4, now())`, [t.tenantId, row.id, t.students[0].id, t.studentUser.id]);
    gemini.replies.push(JSON.stringify({ criteria: [{ criterion: 'Definition', awarded: '3', comment: 'Correct definition.' }, { criterion: 'Example', awarded: 2.4, comment: null }], total: '5', rationale: '**Clear** answer.' }));
    const q = { question: 'Define goodwill.', maxMarks: 5, rubric: [{ criterion: 'Definition', marks: 3 }, { criterion: 'Example', marks: 2 }] };
    const draft = (await post('teacher', `/v1/grading-assist/homework/${row.id}/${t.students[0].id}/suggest`, q).expect(200)).body;
    expect(draft).toMatchObject({ kind: 'homework', preview: false, status: 'draft', suggestedMarks: 5, rationale: 'Clear answer.' });
    expect(draft.criteria.map((c: { awarded: number }) => c.awarded)).toEqual([3, 2]);
  });

  it('plans a lesson whose minutes (sent as "10 min") add up to the period', async () => {
    const step = (m: string, a: string) => ({ minutes: m, activity: a });
    gemini.replies.push(JSON.stringify({ objectives: ['Use $v = u + at$'], steps: [step('10 min', 'Recall'), step('25 min', 'Teach'), step('10', 'Practise')], materials: null, assessment: 'Exit ticket' }));
    const res = await post('board', '/v1/ai/lesson-plan', { topic: 'Equations of motion', minutes: 45 }).expect(200);
    expect(res.body.result.steps.map((s: { minutes: number }) => s.minutes)).toEqual([10, 25, 10]);
    expect(res.body.result.objectives).toEqual(['Use v = u + at']);
    expect(res.body.result.materials).toEqual([]);
  });

  it('reads handwriting (AI pen, Read board) from a picture, keeping the maths as LaTeX', async () => {
    const png = Buffer.alloc(300, 9).toString('base64');
    // Gemini sometimes leaves LaTeX backslashes unescaped inside the JSON (\frac reads as a form feed, \pm as no escape at all).
    gemini.replies.push('{"text": "x^2 + 5x + 6 = 0\\nroots: -2, -3", "math": ["x^2 + 5x + 6 = 0", "$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$"]}');
    const res = await post('board', '/v1/ai/read-board', { image: png }).expect(200);
    expect(res.body.result.text).toBe('x² + 5x + 6 = 0\nroots: -2, -3');
    expect(res.body.result.math).toEqual(['x^2 + 5x + 6 = 0', '\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}']);
    const parts = sent().messages[1].content;
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } });
    expect(sent()).toMatchObject({ temperature: 0.1 });
  });

  it('summarises the board, prepares a lecture and solves a selection, all as clean text', async () => {
    gemini.replies.push(JSON.stringify({ keyConcepts: ['Speed is distance over time'], definitions: [{ term: 'Velocity', meaning: 'Speed in a *given* direction' }], formulas: ['$v = \\frac{d}{t}$', 'v^2 = u^2 + 2as'], examples: [], importantPoints: [], questions: null }));
    const sum = await post('board', '/v1/ai/board-summary', { topic: 'Motion', format: 'revision' }).expect(200);
    expect(sum.body.result.formulas).toEqual(['v = d/t', 'v² = u² + 2as']);
    expect(sum.body.result.definitions[0].meaning).toBe('Speed in a given direction');

    gemini.replies.push(JSON.stringify({ outline: ['Recall', 'Define'], explanation: '## Motion\nAn object moves when its position changes.', examples: [], analogies: [], boardPlan: ['Title: **Motion**'], activities: [], recap: 'Done' }));
    const lec = await post('board', '/v1/ai/lecture', { topic: 'Motion', minutes: 40 }).expect(200);
    expect(lec.body.result).toMatchObject({ explanation: 'Motion\nAn object moves when its position changes.', boardPlan: ['Title: Motion'] });

    gemini.replies.push(JSON.stringify({ title: 'Solve', answer: 'x = 5', items: ['$3x + 7 = 22$', '$3x = 15$', '$x = 5$'] }));
    const solve = await post('board', '/v1/ai/select-ask', { action: 'solve', content: '3x + 7 = 22' }).expect(200);
    expect(solve.body.result.items).toEqual(['3x + 7 = 22', '3x = 15', 'x = 5']);
  });

  it('tutors a student with clean text', async () => {
    gemini.replies.push(JSON.stringify({ answer: 'Assets = Liabilities + Capital.\n*   Assets are what the business owns.', keyPoints: ['**Balance**'], nextSteps: ['Practise two entries'], followUps: null }));
    const res = await post('student', '/v1/ai/tutor/ask', { question: 'What is the accounting equation?' }).expect(200);
    expect(res.body).toMatchObject({ answer: 'Assets = Liabilities + Capital.\n• Assets are what the business owns.', keyPoints: ['Balance'], followUps: [] });
  });

  it('waits out a busy Gemini (429 retryDelay, then 503) and answers', async () => {
    gemini.failures = [429, 503];
    gemini.replies.push(JSON.stringify({ answer: 'Bengaluru is the capital of Karnataka.', keyPoints: [], followUps: [] }));
    const res = await post('board', '/v1/ai/explain', { question: 'What is the capital of Karnataka?' }).expect(200);
    expect(res.body.result.answer).toContain('Bengaluru');
    expect(gemini.requests).toHaveLength(3);
  });

  it('says "busy, try again" when Gemini stays overloaded or the day\'s free quota is used', async () => {
    gemini.failures = [503, 503, 503];
    const busy = await post('board', '/v1/ai/explain', { question: 'What is the longest river in India?' }).expect(503);
    expect(busy.body).toMatchObject({ code: 'AI_BUSY', message: 'KINETIX AI is busy right now. Try again in a minute.' });
    expect(gemini.requests).toHaveLength(3);

    gemini.requests = [];
    gemini.failures = ['perDay'];
    const daily = await post('board', '/v1/ai/explain', { question: 'Who wrote the Indian national anthem?' }).expect(503);
    expect(daily.body.code).toBe('AI_BUSY');
    expect(gemini.requests).toHaveLength(1); // no point waiting for tomorrow
  }, 30_000);

  it('asks again with more room when the reply is cut off, and refuses what Gemini withholds', async () => {
    gemini.replies.push({ content: '{"answer": "Photosynthesis is the process by which green', finish_reason: 'length' }, JSON.stringify({ answer: 'Plants make food from light.', keyPoints: [], followUps: [] }));
    const res = await post('board', '/v1/ai/explain', { question: 'What is photosynthesis?' }).expect(200);
    expect(res.body.result.answer).toBe('Plants make food from light.');
    expect(gemini.requests.map((r) => r.body.max_tokens)).toEqual([1500 + 1024, 3000 + 1024]);

    gemini.replies.push({ content: null, finish_reason: 'content_filter' });
    await post('board', '/v1/ai/explain', { question: 'Tell me something odd' }).expect(422);
  });
});
