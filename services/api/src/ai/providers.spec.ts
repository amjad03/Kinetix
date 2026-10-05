import { execFileSync } from 'node:child_process';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakePrimary, FakeSarvam } from '../../test/fake-ai-servers.js';
import { loadEnv } from '../config/env.js';
import { providerFromEnv } from './ai.service.js';
import { OpenAiCompatibleAsr, SarvamAsr, SpeechToText } from './asr.js';
import { AiUnavailableError, CircuitBreaker, type ChainLink, FallbackProvider, OpenAiCompatibleProvider, runChain, SarvamProvider } from './providers.js';
import type { ChatMessage } from './tasks.js';

const ask: ChatMessage[] = [{ role: 'user', content: 'Explain photosynthesis' }];
const opts = { maxTokens: 100, temperature: 0.5 };
const rates = { inputPerM: 30, outputPerM: 70 };

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('AI provider chain', () => {
  const primary = new FakePrimary();
  const sarvam = new FakeSarvam();
  let now = 0;
  let breaker: CircuitBreaker;
  let chain: FallbackProvider;

  beforeAll(async () => {
    await primary.start();
    await sarvam.start();
  });
  afterAll(async () => {
    await primary.stop();
    await sarvam.stop();
  });
  beforeEach(() => {
    primary.mode = 'ok';
    primary.chat = [];
    sarvam.chat = [];
    now = 0;
    breaker = new CircuitBreaker(2, 30_000, () => now);
    chain = new FallbackProvider([
      { provider: new OpenAiCompatibleProvider(primary.url, 'qwen-14b', undefined, 500), breaker },
      { provider: new SarvamProvider(FakeSarvam.KEY, 'sarvam-105b', rates, 5000, sarvam.origin), breaker: new CircuitBreaker(2, 30_000, () => now) },
    ]);
  });

  it('uses the self-hosted model when it answers', async () => {
    const out = await chain.complete(ask, opts);
    expect(out).toMatchObject({ provider: 'openai-compatible', model: 'qwen-14b', promptTokens: 100 });
    expect(out.costInr).toBeUndefined();
    expect(sarvam.chat).toHaveLength(0);
  });

  it.each([
    ['a 5xx', 503 as const],
    ['a 429', 429 as const],
    ['a timeout', 'hang' as const],
  ])('falls back to Sarvam on %s, with its auth header, model and a cost estimate', async (_, mode) => {
    primary.mode = mode;
    const out = await chain.complete(ask, opts);
    expect(out).toMatchObject({ provider: 'sarvam', model: 'sarvam-105b', text: JSON.stringify(sarvam.reply) });
    // 1M input tokens at ₹30 + 0.5M output tokens at ₹70.
    expect(out.costInr).toBeCloseTo(65);
    const call = sarvam.chat[0];
    expect(call.headers['api-subscription-key']).toBe(FakeSarvam.KEY);
    expect(call.headers.authorization).toBeUndefined();
    expect(call.body).toMatchObject({ model: 'sarvam-105b', messages: ask, response_format: { type: 'json_object' }, max_tokens: 200 });
  });

  it('falls back when the primary is not reachable at all', async () => {
    const down = new FallbackProvider([
      { provider: new OpenAiCompatibleProvider('http://127.0.0.1:9/v1', 'qwen-14b', undefined, 500), breaker },
      { provider: new SarvamProvider(FakeSarvam.KEY, 'sarvam-105b', rates, 5000, sarvam.origin), breaker: new CircuitBreaker(2, 30_000) },
    ]);
    expect((await down.complete(ask, opts)).provider).toBe('sarvam');
  });

  it('skips a failing primary for the cooldown, then tries it again', async () => {
    primary.mode = 500;
    await chain.complete(ask, opts);
    await chain.complete(ask, opts);
    expect(primary.chat).toHaveLength(2);
    expect(breaker.open).toBe(true);

    primary.mode = 'ok';
    expect((await chain.complete(ask, opts)).provider).toBe('sarvam');
    expect(primary.chat).toHaveLength(2); // not even asked

    now += 30_001;
    expect((await chain.complete(ask, opts)).provider).toBe('openai-compatible');
    expect(breaker.open).toBe(false);
  });

  it('does not retry a request the primary rejected (4xx)', async () => {
    primary.mode = 400;
    const err = await chain.complete(ask, opts).catch((e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err).toMatchObject({ retryable: false, status: 400 });
    expect(sarvam.chat).toHaveLength(0);
    expect(breaker.open).toBe(false);
  });

  it('sends board images only to a vision model', async () => {
    const image: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'read' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }];
    expect((await chain.complete(image, opts)).provider).toBe('openai-compatible');
    primary.mode = 503;
    await expect(chain.complete(image, opts)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(sarvam.chat).toHaveLength(0);
  });

  it('reports a wrong Sarvam key as a non-retryable error', async () => {
    const bad = new SarvamProvider('wrong', 'sarvam-105b', rates, 5000, sarvam.origin);
    await expect(bad.complete(ask, opts)).rejects.toMatchObject({ retryable: false, status: 403 });
  });

  it('builds the chain from the environment', () => {
    const base = { DATABASE_URL: 'postgres://a@b/c', APP_DATABASE_URL: 'postgres://a@b/c', JWT_SECRET: 'x'.repeat(16), PAIRING_HMAC_SECRET: 'y'.repeat(8) };
    expect(providerFromEnv(loadEnv(base)).name).toBe('preview');
    expect(providerFromEnv(loadEnv({ ...base, AI_BASE_URL: primary.url }))).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(providerFromEnv(loadEnv({ ...base, AI_FALLBACK_PROVIDER: 'sarvam', SARVAM_API_KEY: 'k' }))).toBeInstanceOf(SarvamProvider);
    const both = providerFromEnv(loadEnv({ ...base, AI_BASE_URL: primary.url, AI_FALLBACK_PROVIDER: 'sarvam', SARVAM_API_KEY: 'k' }));
    expect(both).toBeInstanceOf(FallbackProvider);
    expect(both.models).toEqual(['kinetix-llm', 'sarvam-105b']);
    expect(() => loadEnv({ ...base, ASR_FALLBACK_PROVIDER: 'sarvam' })).toThrow(/SARVAM_API_KEY/);
  });
});

describe('speech-to-text chain', () => {
  const primary = new FakePrimary();
  const sarvam = new FakeSarvam();
  const audio = Buffer.alloc(4000, 7);
  const sarvamAsr = (extra = {}) => new SarvamAsr({ baseUrl: sarvam.origin, apiKey: FakeSarvam.KEY, model: 'saaras:v3', inrPerHour: 30, pollMs: 5, ...extra });

  beforeAll(async () => {
    await primary.start();
    await sarvam.start();
  });
  afterAll(async () => {
    await primary.stop();
    await sarvam.stop();
  });

  it('falls back from the self-hosted server to Sarvam', async () => {
    primary.mode = 502;
    const links: ChainLink<SpeechToText>[] = [
      { provider: new OpenAiCompatibleAsr(primary.url, 'whisper', undefined), breaker: new CircuitBreaker(3, 1000) },
      { provider: sarvamAsr(), breaker: new CircuitBreaker(3, 1000) },
    ];
    const text = await runChain(links, (p) => p.transcribe(audio, 'audio/mp4', 'hi', { tenantId: 't', durationMs: 20_000 }), new Logger('test'), 'ASR');
    expect(primary.asr.at(-1)).toMatchObject({ language: 'hi', model: 'whisper' });
    expect(text).toBe('Short clip from Sarvam.');
    expect(sarvam.rest.at(-1)).toMatchObject({ language_code: 'hi-IN', model: 'saaras:v3', mode: 'transcribe', file: { size: audio.length, name: 'lesson.m4a' } });
    primary.mode = 'ok';
  });

  it('sends a lesson recording through the batch API', async () => {
    const text = await sarvamAsr().transcribe(audio, 'audio/mp4', 'kn', { tenantId: 't', durationMs: 45 * 60_000 });
    const job = sarvam.jobs.at(-1)!;
    expect(job.params).toEqual({ model: 'saaras:v3', mode: 'transcribe', language_code: 'kn-IN', with_timestamps: false });
    expect([...job.files.keys()]).toEqual(['part-000.m4a']);
    expect(job.files.get('part-000.m4a')!.length).toBe(audio.length);
    expect(job.polls).toBeGreaterThanOrEqual(2);
    expect(text).toBe(`Part 0 (part-000.m4a, ${audio.length} bytes).`);
    expect(sarvamAsr().costInr(45 * 60_000)).toBeCloseTo(22.5);
  });

  it.skipIf(!hasFfmpeg)('splits audio longer than one batch file allows with ffmpeg, and joins the parts in order', async () => {
    const wav = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ar', '16000', '-f', 'wav', 'pipe:1']);
    const text = await sarvamAsr({ restMaxSeconds: 0.5, batchMaxSeconds: 1, chunkSeconds: 1 }).transcribe(wav, 'audio/wav', 'en', { tenantId: 't', durationMs: 3000 });
    const job = sarvam.jobs.at(-1)!;
    expect([...job.files.keys()].sort()).toEqual(['part-000.wav', 'part-001.wav', 'part-002.wav']);
    expect(job.params.language_code).toBe('en-IN');
    expect(text.split('\n')).toEqual([...job.files.keys()].sort().map((n, i) => `Part ${i} (${n}, ${job.files.get(n)!.length} bytes).`));
  });
});
