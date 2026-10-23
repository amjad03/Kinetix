import type { INestApplication } from '@nestjs/common';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LLM_PROVIDER } from '../src/ai/ai.service.js';
import { OpenAiCompatibleProvider } from '../src/ai/providers.js';
import { FakePrimary } from './fake-ai-servers.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/** AI pen cloud fallback (recognize-sketch) and AI draw (SVG), against a fake vision model. */
describe('Zynetix AI pen: recognize-sketch and draw', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const model = new FakePrimary();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const usage = async (task: string) =>
    (await owner.query(`select outcome, prompt_tokens from ai_usage where tenant_id = $1 and task = $2 order by created_at`, [t.tenantId, task])).rows;
  const png = (fill: number) => Buffer.alloc(300, fill).toString('base64');

  beforeAll(async () => {
    await model.start();
    t = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(LLM_PROVIDER).useValue(new OpenAiCompatibleProvider(model.url, 'claude-vision', 'k', 5000)));
    tokens = { teacher: await login(t.teacher.email!), student: await login(t.studentUser.email!) };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await model.stop();
    await owner.end();
  });

  beforeEach(() => {
    model.mode = 'ok';
    model.chat.length = 0;
  });

  it('labels a sketch from the board, sending the PNG to the vision model, and logs ai_usage', async () => {
    model.reply = { labels: ['Heart', 'heart.', 'love'], text: '' };
    const res = await http().post('/v1/ai/recognize-sketch').set(auth('board')).send({ image: png(1), mode: 'sketch' }).expect(200);
    expect(res.body.result).toEqual({ labels: ['heart', 'love'] });
    const user = model.chat[0].messages[1].content as { type: string; image_url?: { url: string } }[];
    expect(user[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${png(1)}` } });
    expect(await usage('recognizeSketch')).toEqual([{ outcome: 'ok', prompt_tokens: 100 }]);
  });

  it('reads handwriting as text and LaTeX (the macOS/Windows OCR path)', async () => {
    model.reply = { labels: [], text: 'x² + 1', latex: '$x^2 + 1$' };
    const res = await http().post('/v1/ai/recognize-sketch').set(auth('teacher')).send({ image: png(2), mode: 'handwriting' }).expect(200);
    expect(res.body.result).toEqual({ labels: [], text: 'x² + 1', latex: 'x^2 + 1' });
  });

  it('is for staff only and checks the image', async () => {
    await http().post('/v1/ai/recognize-sketch').set(auth('student')).send({ image: png(3) }).expect(403);
    await http().post('/v1/ai/recognize-sketch').set(auth('board')).send({ image: 'not base64!' }).expect(400);
    await http().post('/v1/ai/draw').set(auth('student')).send({ prompt: 'a cell' }).expect(403);
    await http().post('/v1/ai/draw').set(auth('board')).send({}).expect(400);
    await http().post('/v1/ai/draw').set(auth('board')).send({ prompt: 'x'.repeat(501) }).expect(400);
  });

  it('draws a sanitised SVG from a prompt and a sketch', async () => {
    model.reply = {
      title: 'Plant cell',
      svg: '<svg viewBox="0 0 800 600" onload="steal()"><script>steal()</script><rect x="10" y="10" width="780" height="580" rx="40" fill="none" stroke="#000"/><text x="400" y="300">Nucleus</text></svg>',
    };
    const res = await http().post('/v1/ai/draw').set(auth('board')).send({ prompt: 'a plant cell', image: png(4) }).expect(200);
    expect(res.body.result.title).toBe('Plant cell');
    expect(res.body.result.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect x="10" y="10" width="780" height="580" rx="40" fill="none" stroke="#000"/><text x="400" y="300">Nucleus</text></svg>',
    );
    expect((model.chat[0].messages[1].content as { type: string }[]).map((c) => c.type)).toEqual(['text', 'image_url']);
  });

  it('asks again once for an unusable SVG, then refuses it as invalid', async () => {
    model.reply = { title: 'Broken', svg: '<div>this is not an svg at all</div>' };
    await http().post('/v1/ai/draw').set(auth('board')).send({ prompt: 'a broken thing' }).expect(502);
    expect(model.chat).toHaveLength(2);
    expect(JSON.stringify(model.chat[1].messages.at(-1))).toContain('The SVG cannot be used');
    expect((await usage('draw')).map((r) => r.outcome)).toEqual(['ok', 'invalid']);
  });
});
