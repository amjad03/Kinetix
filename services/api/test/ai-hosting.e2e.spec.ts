import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { speechToTextFromEnv } from '../src/ai/ai.module.js';
import { LLM_PROVIDER, providerFromEnv } from '../src/ai/ai.service.js';
import { SpeechToText } from '../src/ai/asr.js';
import { loadEnv } from '../src/config/env.js';
import { DbService } from '../src/db/db.service.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { FakePrimary, FakeSarvam } from './fake-ai-servers.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/**
 * The local-first hosting setup end to end: a self-hosted model and speech server with Sarvam
 * AI as the pay-per-use fallback, the usage rows that record who served each call, and the
 * monthly transcription cap.
 */
describe('AI hosting: self-hosted first, Sarvam fallback', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  const primary = new FakePrimary();
  const sarvam = new FakeSarvam();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const drain = () => app.get(JobsService).drain();
  const lastUsage = async (task: string) =>
    (
      await owner.query(`select provider, model, outcome, audio_ms, est_cost_inr, detail from ai_usage where tenant_id = $1 and task = $2 order by created_at desc limit 1`, [
        t.tenantId,
        task,
      ])
    ).rows[0];

  const record = async (language: 'en' | 'hi' | 'kn', durationMs: number) => {
    const id = randomUUID();
    await http().put(`/v1/recordings/${id}`).set(auth('board')).send({ title: 'Photosynthesis', startedAt: clock.at.toISOString(), language }).expect(200);
    await http().put(`/v1/recordings/${id}/events`).set(auth('board')).send({ v: 1, canvas: { w: 1920, h: 1080 }, background: 'plain', events: [] }).expect(204);
    await http().put(`/v1/recordings/${id}/audio`).set(auth('board')).set('content-type', 'audio/mp4').send(Buffer.alloc(3000, 1)).expect(204);
    await http().post(`/v1/recordings/${id}/finish`).set(auth('board')).send({ durationMs, share: false }).expect(200);
    return id;
  };

  beforeAll(async () => {
    await primary.start();
    await sarvam.start();
    const env = loadEnv({
      ...process.env,
      AI_BASE_URL: primary.url,
      AI_MODEL: 'qwen-14b',
      AI_TIMEOUT_MS: '2000',
      AI_FALLBACK_PROVIDER: 'sarvam',
      AI_BREAKER_FAILURES: '100',
      ASR_BASE_URL: primary.url,
      ASR_FALLBACK_PROVIDER: 'sarvam',
      ASR_MONTHLY_HOURS: '2',
      SARVAM_API_KEY: FakeSarvam.KEY,
      SARVAM_BASE_URL: sarvam.origin,
      SARVAM_INR_PER_M_INPUT: '30',
      SARVAM_INR_PER_M_OUTPUT: '70',
      SARVAM_INR_PER_AUDIO_HOUR: '30',
    });
    t = await createTenant(owner);
    app = await createApp(clock, (b) =>
      b
        .overrideProvider(LLM_PROVIDER)
        .useValue(providerFromEnv(env))
        .overrideProvider(SpeechToText)
        .useFactory({ factory: (db: DbService) => speechToTextFromEnv(env, db), inject: [DbService] }),
    );
    tokens = { teacher: await login(t.teacher.email!) };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await primary.stop();
    await sarvam.stop();
    await owner.end();
  });

  beforeEach(() => {
    primary.mode = 'ok';
  });

  it('answers from the self-hosted model and records it as the provider', async () => {
    const res = await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'What is photosynthesis?' }).expect(200);
    expect(res.body.meta).toMatchObject({ provider: 'openai-compatible', model: 'qwen-14b', cached: false, preview: false });
    expect(await lastUsage('explain')).toMatchObject({ provider: 'openai-compatible', model: 'qwen-14b', outcome: 'ok', est_cost_inr: null });
  });

  it('falls back to Sarvam when the self-hosted model is down, and records provider and cost', async () => {
    primary.mode = 503;
    const res = await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'Why are leaves green?' }).expect(200);
    expect(res.body.meta).toMatchObject({ provider: 'sarvam', model: 'sarvam-105b', cached: false });
    expect(res.body.result.answer).toBe('Sarvam explains photosynthesis.');
    // 1M input tokens at ₹30 + 0.5M output at ₹70.
    expect(await lastUsage('explain')).toMatchObject({ provider: 'sarvam', model: 'sarvam-105b', outcome: 'ok', est_cost_inr: '65.0000' });

    // A Sarvam answer is cached like any other.
    const again = await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'Why are leaves green?' }).expect(200);
    expect(again.body.meta.cached).toBe(true);
  });

  it('does not fall back when the self-hosted model rejects the request (4xx)', async () => {
    primary.mode = 400;
    const before = sarvam.chat.length;
    await http().post('/v1/ai/explain').set(auth('teacher')).send({ question: 'What is chlorophyll?' }).expect(503);
    expect(sarvam.chat.length).toBe(before);
    expect(await lastUsage('explain')).toMatchObject({ outcome: 'unavailable' });
  });

  it('keeps reading the board unavailable when only the text-only fallback is up', async () => {
    primary.mode = 503;
    const before = sarvam.chat.length;
    await http().post('/v1/ai/read-board').set(auth('teacher')).send({ image: 'A'.repeat(200) }).expect(503);
    expect(sarvam.chat.length).toBe(before);
  });

  it('transcribes a long lesson with Sarvam batch when the speech server is down, in the recording language', async () => {
    primary.mode = 502;
    const id = await record('kn', 50 * 60_000);
    await drain();
    const job = sarvam.jobs.at(-1)!;
    expect(job.params).toMatchObject({ language_code: 'kn-IN', model: 'saaras:v3', mode: 'transcribe' });
    expect([...job.files.keys()]).toEqual(['part-000.m4a']);
    const [rec] = (await owner.query(`select transcript, transcript_state from recordings where id = $1`, [id])).rows;
    expect(rec).toMatchObject({ transcript_state: 'done', transcript: 'Part 0 (part-000.m4a, 3000 bytes).' });
    expect(await lastUsage('transcribe')).toMatchObject({ provider: 'sarvam', model: 'saaras:v3', outcome: 'ok', audio_ms: 50 * 60_000, est_cost_inr: '25.0000' });
  });

  it('uses the self-hosted speech server when it is up', async () => {
    const id = await record('hi', 40 * 60_000);
    await drain();
    expect(primary.asr.at(-1)).toMatchObject({ language: 'hi' });
    const [rec] = (await owner.query(`select transcript from recordings where id = $1`, [id])).rows;
    expect(rec.transcript).toBe('Transcript from the college GPU.');
    expect(await lastUsage('transcribe')).toMatchObject({ provider: 'openai-compatible', outcome: 'ok', audio_ms: 40 * 60_000, est_cost_inr: null });
  });

  it('stops transcribing at the monthly hours cap with ASR_MONTHLY_LIMIT', async () => {
    // 90 of 120 minutes used; 40 more would go over.
    const calls = primary.asr.length;
    const id = await record('en', 40 * 60_000);
    await drain();
    expect(primary.asr.length).toBe(calls);
    expect(await lastUsage('transcribe')).toMatchObject({ outcome: 'quota', audio_ms: 0 });
    expect((await lastUsage('transcribe')).detail).toMatch(/^ASR_MONTHLY_LIMIT/);
    const [job] = (await owner.query(`select last_error from jobs where payload->>'recordingId' = $1`, [id])).rows;
    expect(job.last_error).toMatch(/ASR_MONTHLY_LIMIT/);
  });
});
