import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { DbService } from '../db/db.service.js';
import { AiConnections, KEY_REJECTED } from './ai-connection.service.js';
import { FallbackProvider, OpenAiCompatibleProvider, PreviewProvider } from './providers.js';

const env = { ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1', AI_TIMEOUT_MS: 5000, AI_BREAKER_FAILURES: 3, AI_BREAKER_COOLDOWN_S: 60, SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') } as unknown as Env;
const conn = { apiKey: 'sk-ant-unit-key-1234', model: 'claude-sonnet-5-5', fallbackModel: 'claude-haiku-5-5' };

/** A DbService stand-in whose tenant transaction returns the given stored connection row (or none). */
function fakeDb(rows: Record<string, unknown[]>): DbService {
  return { withTenant: (tenantId: string, fn: (tx: unknown) => unknown) => fn({ select: () => ({ from: () => Promise.resolve(rows[tenantId] ?? []) }) }) } as unknown as DbService;
}

describe('AiConnections', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the chosen model with the fallback model behind it, on Anthropic', () => {
    const c = new AiConnections(fakeDb({}), env);
    const chain = c.build(conn);
    expect(chain).toBeInstanceOf(FallbackProvider);
    expect(chain.models).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
    const single = c.build(conn, false);
    expect(single).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(single.model).toBe('claude-sonnet-5-5');
  });

  it('resolves the source: the institution with a key, else the server (or none)', async () => {
    const c = new AiConnections(fakeDb({}), env);
    const server = new OpenAiCompatibleProvider('http://x/v1', 'm', undefined, 1000);
    const row = { tenantId: 't1', apiKeyLast4: '1234', model: 'claude-opus-5-5', fallbackModel: null, updatedAt: new Date(), apiKeyEnc: 'v1.x.y.z' };
    const tx = (rows: unknown[]) => ({ select: () => ({ from: () => Promise.resolve(rows) }) }) as never;
    expect((await c.view(tx([row]), server)).source).toBe('institution');
    expect((await c.view(tx([]), server)).source).toBe('server');
    expect((await c.view(tx([]), new PreviewProvider())).source).toBe('none');
    expect(await c.forTenant('t2')).toBeNull();
  });

  it('tests with one tiny completion, and maps 401 to a plain message', async () => {
    const c = new AiConnections(fakeDb({}), env);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const ok = await c.test(c.build(conn, false));
    expect(ok).toMatchObject({ ok: true, model: 'claude-sonnet-5-5' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/chat/completions');
    expect(fetch.mock.calls[0][1].headers.authorization).toBe('Bearer sk-ant-unit-key-1234');
    expect(JSON.parse(fetch.mock.calls[0][1].body).max_tokens).toBe(16);

    fetch.mockResolvedValueOnce(new Response('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', { status: 401 }));
    expect(await c.test(c.build(conn, false))).toEqual({ ok: false, error: KEY_REJECTED });
  });
});
