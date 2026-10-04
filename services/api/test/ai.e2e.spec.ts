import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LLM_PROVIDER } from '../src/ai/ai.service.js';
import { OpenAiCompatibleProvider } from '../src/ai/providers.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/**
 * A stand-in for an India-hosted vLLM server: records requests and replies with whatever the
 * test queues (falling back to a fixed valid quiz).
 */
class FakeModelServer {
  readonly requests: { messages: { role: string; content: string }[]; response_format?: unknown; model: string }[] = [];
  readonly replies: (string | number)[] = [];
  private server!: Server;
  url = '';

  async start() {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        this.requests.push(JSON.parse(body));
        const next = this.replies.shift() ?? JSON.stringify(quiz(3));
        if (typeof next === 'number') {
          res.writeHead(next).end('{}');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ choices: [{ message: { content: next } }], usage: { prompt_tokens: 120, completion_tokens: 80 } }),
        );
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v1`;
  }

  stop() {
    return new Promise((r) => this.server.close(r));
  }
}

const quiz = (n: number) => ({
  questions: Array.from({ length: n }, (_, i) => ({
    question: `Which account records goodwill? (${i + 1})`,
    options: ['Goodwill account', 'Cash account', 'Capital account', 'Sales account'],
    answer: 0,
    explanation: 'Goodwill is an intangible asset recorded in its own account.',
  })),
});

describe('KINETIX AI gateway', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const model = new FakeModelServer();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    await model.start();
    t = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(LLM_PROVIDER).useValue(new OpenAiCompatibleProvider(model.url, 'test-model', 'k', 5000)));
    tokens = {
      teacher: await login(t.teacher.email!),
      principal: await login(t.principal.email!),
      student: await login(t.studentUser.email!),
      parent: await login(t.guardian.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
  });

  beforeEach(() => {
    model.requests.length = 0;
    model.replies.length = 0;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await model.stop();
    await owner.end();
  });

  it('generates a quiz on the board, grounded in the open class', async () => {
    model.replies.push(JSON.stringify(quiz(3)));
    const res = await http().post('/v1/ai/quiz').set(auth('board')).send({ topic: 'Goodwill', count: 3 }).expect(200);
    expect(res.body.result.questions).toHaveLength(3);
    expect(res.body.meta).toMatchObject({ provider: 'openai-compatible', model: 'test-model', cached: false, preview: false });

    const sent = model.requests[0];
    expect(sent.model).toBe('test-model');
    expect(sent.response_format).toEqual({ type: 'json_object' });
    const system = sent.messages[0].content;
    expect(system).toContain(`Institution: Tenant`);
    expect(system).toContain('Class: BCom Sem 3 A.');
    expect(system).toContain('Subject: Corporate Accounting.');
    expect(system).toContain('Students are adults'); // a college, not a school
    expect(sent.messages[1].content).toContain('Write 3 multiple-choice questions (medium) on: Goodwill');
  });

  it('answers the same request from the cache, and regenerates on request', async () => {
    const body = { topic: 'Partnership deed', count: 2 };
    model.replies.push(JSON.stringify(quiz(2)));
    await http().post('/v1/ai/quiz').set(auth('board')).send(body).expect(200);
    const again = await http().post('/v1/ai/quiz').set(auth('board')).send(body).expect(200);
    expect(again.body.meta.cached).toBe(true);
    expect(model.requests).toHaveLength(1);

    model.replies.push(JSON.stringify(quiz(2)));
    const fresh = await http().post('/v1/ai/quiz').set(auth('board')).send({ ...body, fresh: true }).expect(200);
    expect(fresh.body.meta.cached).toBe(false);
    expect(model.requests).toHaveLength(2);
  });

  it('asks the model to fix an invalid reply once, then gives up', async () => {
    const bad = quiz(2);
    bad.questions[0].options = ['A', 'A', 'B', 'C']; // duplicate options
    model.replies.push('```json\n' + JSON.stringify(bad) + '\n```', JSON.stringify(quiz(2)));
    const ok = await http().post('/v1/ai/quiz').set(auth('teacher')).send({ topic: 'Shares', count: 2 }).expect(200);
    expect(ok.body.result.questions[0].options[0]).toBe('Goodwill account');
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].messages.at(-1)!.content).toContain('The four options must differ');

    model.replies.push('not json', '{"questions": []}');
    await http().post('/v1/ai/quiz').set(auth('teacher')).send({ topic: 'Debentures', count: 2 }).expect(502);
  });

  it('checks lesson plans add up to the period', async () => {
    const plan = (mins: number[]) => JSON.stringify({ objectives: ['Know X'], steps: mins.map((m) => ({ minutes: m, activity: 'Do' })), materials: [], assessment: 'Quiz' });
    model.replies.push(plan([10, 10]), plan([15, 30, 10]));
    const res = await http().post('/v1/ai/lesson-plan').set(auth('teacher')).send({ topic: 'Final accounts', minutes: 55 }).expect(200);
    expect(res.body.result.steps).toHaveLength(3);
    expect(model.requests[1].messages.at(-1)!.content).toContain('add up to 20, not 55');
  });

  it('explains in Kannada for a student, and keeps homework and quizzes for staff', async () => {
    model.replies.push(JSON.stringify({ answer: 'ಸದ್ಭಾವನೆ ಒಂದು ಅಮೂರ್ತ ಆಸ್ತಿ.', keyPoints: ['ಅಮೂರ್ತ ಆಸ್ತಿ'], followUps: [] }));
    const res = await http().post('/v1/ai/explain').set(auth('student')).send({ question: 'What is goodwill?', language: 'kn' }).expect(200);
    expect(res.body.result.answer).toContain('ಸದ್ಭಾವನೆ');
    expect(model.requests[0].messages[0].content).toContain('Write in Kannada (use the native script).');

    await http().post('/v1/ai/quiz').set(auth('student')).send({ topic: 'Goodwill' }).expect(403);
    await http().post('/v1/ai/homework').set(auth('parent')).send({ topic: 'Goodwill' }).expect(403);
    await http().post('/v1/ai/explain').set(auth('parent')).send({ question: 'What is goodwill?' }).expect(403);
  });

  it('refuses unsafe requests without calling the model, and filters unsafe replies', async () => {
    await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'how to make a bomb at home' }).expect(422);
    expect(model.requests).toHaveLength(0);

    model.replies.push(JSON.stringify({ answer: 'Here is some pornography.', keyPoints: [], followUps: [] }));
    await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'Something odd' }).expect(422);
  });

  it('sends accepted homework from the board to the open class', async () => {
    const dueOn = new Date(clock.at.getTime() + 3 * 86400_000).toISOString().slice(0, 10);
    const hw = await http().post('/v1/homework/from-board').set(auth('board')).send({ title: 'Goodwill problems', instructions: '1. Value goodwill…', dueOn }).expect(201);
    expect(hw.body).toMatchObject({ title: 'Goodwill problems', section: { id: t.section.id }, subject: { name: 'Corporate Accounting' } });
    expect(hw.body.boardSessionId).toBeTruthy();
    const inbox = await http().get('/v1/notifications').set(auth('parent')).expect(200);
    expect(inbox.body.items.some((n: { kind: string; data: { homeworkId: string } }) => n.kind === 'homework' && n.data.homeworkId === hw.body.id)).toBe(true);
    await http().post('/v1/homework/from-board').set(auth('teacher')).send({ title: 'X', dueOn }).expect(403);
  });

  it('reports an unreachable model server as unavailable, and meters everything', async () => {
    model.replies.push(500);
    await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'What is a debenture?' }).expect(503);

    const usage = await http().get('/v1/ai/usage').set(auth('principal')).expect(200);
    const count = (task: string, outcome: string) =>
      usage.body.rows.find((r: { task: string; outcome: string }) => r.task === task && r.outcome === outcome)?.requests ?? 0;
    expect(count('quiz', 'ok')).toBeGreaterThanOrEqual(3);
    expect(count('quiz', 'cached')).toBe(1);
    expect(count('explain', 'blocked')).toBe(2);
    expect(count('explain', 'unavailable')).toBe(1);
    await http().get('/v1/ai/usage').set(auth('teacher')).expect(403);
  });
});

describe('KINETIX AI without a model server', () => {
  const owner = ownerPool();
  let app: INestApplication;

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('returns labelled previews of the right shape', async () => {
    const t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    const token = (await request(app.getHttpServer()).post('/v1/auth/login').send({ tenant: t.slug, login: t.teacher.email, password: 'pw' }).expect(201)).body.accessToken;
    const res = await request(app.getHttpServer()).post('/v1/ai/quiz').set('authorization', `Bearer ${token}`).send({ topic: 'Goodwill', count: 4 }).expect(200);
    expect(res.body.meta).toMatchObject({ provider: 'preview', preview: true });
    expect(res.body.result.questions).toHaveLength(4);
    const plan = await request(app.getHttpServer()).post('/v1/ai/lesson-plan').set('authorization', `Bearer ${token}`).send({ topic: 'Goodwill', minutes: 40 }).expect(200);
    expect(plan.body.result.steps.reduce((s: number, x: { minutes: number }) => s + x.minutes, 0)).toBe(40);
  });
});
