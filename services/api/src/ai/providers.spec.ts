import { execFileSync } from 'node:child_process';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeGemini, FakePrimary, FakeSarvam } from '../../test/fake-ai-servers.js';
import { loadEnv } from '../config/env.js';
import { describeProvider, providerFromEnv } from './ai.service.js';
import { OpenAiCompatibleAsr, SarvamAsr, SpeechToText } from './asr.js';
import { AiBlockedError, AiUnavailableError, CircuitBreaker, type ChainLink, FallbackProvider, OpenAiCompatibleProvider, quotaSummary, runChain, SarvamProvider, withBackoff } from './providers.js';
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

describe('Google Gemini through its OpenAI-compatible endpoint', () => {
  const gemini = new FakeGemini();
  const flash = (options = {}) => new OpenAiCompatibleProvider(gemini.url, 'gemini-3.8-flash', FakeGemini.KEY, 5000, true, { reasoningEffort: 'low', ...options });
  const reply = JSON.stringify({ answer: 'ok', keyPoints: [], followUps: [] });
  const noWait = { retries: 2, baseMs: 1, maxWaitMs: 15_000 };

  beforeAll(() => gemini.start());
  afterAll(() => gemini.stop());
  beforeEach(() => {
    gemini.requests = [];
    gemini.failures = [];
    gemini.replies = [];
    gemini.noThinking = false;
    gemini.noTemperature = false;
  });

  it('sends the key as a Bearer token, JSON mode, low reasoning and room for the thinking tokens', async () => {
    gemini.replies.push(reply);
    const out = await flash().complete(ask, opts);
    expect(out).toMatchObject({ text: reply, finishReason: 'stop', promptTokens: 80, completionTokens: 60, model: 'gemini-3.8-flash' });
    expect(gemini.requests[0].body).toEqual({ model: 'gemini-3.8-flash', messages: ask, max_tokens: 100 + 1024, temperature: 0.5, response_format: { type: 'json_object' }, reasoning_effort: 'low' });
  });

  it('sends board pictures as data URLs', async () => {
    gemini.replies.push('{"text":"x = 2","math":["x = 2"]}');
    const image: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'read' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] }];
    await flash().complete(image, opts);
    expect(gemini.requests[0].body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } });
  });

  it('reports a wrong key plainly, without retrying', async () => {
    const bad = new OpenAiCompatibleProvider(gemini.url, 'gemini-3.8-flash', 'wrong', 5000);
    await expect(bad.complete(ask, opts)).rejects.toMatchObject({ retryable: false, status: 400, message: expect.stringContaining('API key not valid') });
  });

  it('leaves out temperature when the model refuses it, from then on (Claude)', async () => {
    gemini.noTemperature = true;
    gemini.replies.push(reply, reply);
    const p = flash();
    expect((await p.complete(ask, opts)).text).toBe(reply);
    await p.complete(ask, opts);
    expect(gemini.requests.map((r) => 'temperature' in r.body)).toEqual([true, false, false]);
  });

  it('never sends temperature to Anthropic', () => {
    const claude = new OpenAiCompatibleProvider('https://api.anthropic.com/v1', 'claude-sonnet-5-5', 'k', 5000);
    expect((claude as unknown as { dropped: Set<string> }).dropped.has('temperature')).toBe(true);
  });

  it('leaves out reasoning_effort for a model without thinking, from then on', async () => {
    gemini.noThinking = true;
    gemini.replies.push(reply, reply);
    const p = flash();
    expect((await p.complete(ask, opts)).text).toBe(reply);
    await p.complete(ask, opts);
    expect(gemini.requests.map((r) => 'reasoning_effort' in r.body)).toEqual([true, false, false]);
    expect(gemini.requests[1].body.max_tokens).toBe(100);
  });

  it('waits out the per-minute limit as Google asks (retryDelay), and an overloaded model with backoff', async () => {
    gemini.failures = [429, 503];
    gemini.replies.push(reply);
    const waits: number[] = [];
    const p = flash();
    const out = await withBackoff(() => p.complete(ask, opts), noWait, (e, ms) => waits.push(ms), async () => {});
    expect(out.text).toBe(reply);
    expect(waits[0]).toBe(1000); // Google's retryDelay "1s"
    expect(quotaSummary('[{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaValue":"5"}]},{"retryDelay":"37s"}]}}]')).toBe(
      'GenerateRequestsPerMinutePerProjectPerModel-FreeTier, limit 5, retry in 37s',
    );
    expect(waits).toHaveLength(2);
    expect(gemini.requests).toHaveLength(3);
  });

  it('gives up at once on the daily free-tier quota, and after the retries on a model that stays busy', async () => {
    gemini.failures = ['perDay'];
    const p = flash();
    const daily = await withBackoff(() => p.complete(ask, opts), noWait, undefined, async () => {}).catch((e) => e);
    expect(daily).toMatchObject({ status: 429, busy: true, retryAfterMs: Number.POSITIVE_INFINITY });
    // The log names the limit that was hit and gives Google's message, not its raw JSON.
    expect(daily.message).toBe('AI server returned 429 (GenerateRequestsPerDayPerProjectPerModel-FreeTier): You exceeded your current quota, please check your plan and billing details.');
    expect(gemini.requests).toHaveLength(1);

    gemini.failures = [503, 503, 503];
    const busy = await withBackoff(() => p.complete(ask, opts), noWait, undefined, async () => {}).catch((e) => e);
    expect(busy).toBeInstanceOf(AiUnavailableError);
    expect(busy.busy).toBe(true);
    expect(gemini.requests).toHaveLength(4);
  });

  it('passes on a reply cut off at the token limit, and treats a withheld answer as blocked', async () => {
    gemini.replies.push({ content: null, finish_reason: 'length' }, { content: '', finish_reason: 'content_filter' });
    expect(await flash().complete(ask, opts)).toMatchObject({ text: '', finishReason: 'length' });
    await expect(flash().complete(ask, opts)).rejects.toBeInstanceOf(AiBlockedError);
  });

  it('turns on low reasoning for Gemini addresses only', () => {
    const base = { DATABASE_URL: 'postgres://a@b/c', APP_DATABASE_URL: 'postgres://a@b/c', JWT_SECRET: 'x'.repeat(16), PAIRING_HMAC_SECRET: 'y'.repeat(8) };
    const env = loadEnv({ ...base, AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai', AI_MODEL: 'gemini-3.8-flash', AI_API_KEY: 'k' });
    expect([env.AI_RETRIES, env.AI_REASONING_EFFORT]).toEqual([2, undefined]);
    expect(providerFromEnv(env)).toMatchObject({ model: 'gemini-3.8-flash', reasoningEffort: 'low' });
    expect(providerFromEnv(loadEnv({ ...base, AI_BASE_URL: 'http://10.0.0.12:8000/v1' }))).toMatchObject({ reasoningEffort: undefined });
    expect(providerFromEnv(loadEnv({ ...base, AI_BASE_URL: 'http://10.0.0.12:8000/v1', AI_REASONING_EFFORT: 'none' }))).toMatchObject({ reasoningEffort: 'none' });
  });

  it('names the model the API loaded from .env in its start-up line', () => {
    const base = { DATABASE_URL: 'postgres://a@b/c', APP_DATABASE_URL: 'postgres://a@b/c', JWT_SECRET: 'x'.repeat(16), PAIRING_HMAC_SECRET: 'y'.repeat(8) };
    const gemini = loadEnv({ ...base, AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai', AI_MODEL: 'gemini-3.8-flash', AI_API_KEY: 'secret-key' });
    const line = describeProvider(gemini, providerFromEnv(gemini));
    expect(line).toBe('KINETIX AI: gemini-3.8-flash at generativelanguage.googleapis.com');
    expect(line).not.toContain('secret-key');
    const none = loadEnv(base);
    expect(describeProvider(none, providerFromEnv(none))).toMatch(/^KINETIX AI: labelled preview answers/);
  });

  it('tries the same server\'s other models when one is out of its daily allowance (AI_FALLBACK_MODELS)', async () => {
    const base = { DATABASE_URL: 'postgres://a@b/c', APP_DATABASE_URL: 'postgres://a@b/c', JWT_SECRET: 'x'.repeat(16), PAIRING_HMAC_SECRET: 'y'.repeat(8) };
    const env = loadEnv({ ...base, AI_BASE_URL: gemini.url, AI_MODEL: 'gemini-3.8-flash', AI_API_KEY: FakeGemini.KEY, AI_FALLBACK_MODELS: ' gemini-3.7-flash, gemini-flash-lite-latest,gemini-3.8-flash' });
    const p = providerFromEnv(env);
    expect(p.models).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-lite-latest']);
    expect(describeProvider(env, p)).toBe(`KINETIX AI: gemini-3.8-flash, then gemini-3.7-flash, then gemini-flash-lite-latest at ${new URL(gemini.url).host}`);
    gemini.failures = ['perDay'];
    gemini.replies.push(reply);
    const out = await p.complete(ask, opts);
    expect(out).toMatchObject({ text: reply, model: 'gemini-3.7-flash' });
    expect(gemini.requests.map((r) => r.body.model)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash']);
    expect(loadEnv(base).AI_FALLBACK_MODELS).toEqual([]);
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
