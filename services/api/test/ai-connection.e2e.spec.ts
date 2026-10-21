import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KEY_REJECTED } from '../src/ai/ai-connection.service.js';
import * as s from '../src/db/schema.js';
import { FakePrimary } from './fake-ai-servers.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/** An institution pastes its own Claude key in the Zynetix dashboard; its AI then uses it (Anthropic's OpenAI-compatible endpoint, faked). */
describe('AI connection (institution Claude key)', () => {
  const owner = ownerPool();
  const ownerDb = drizzle(owner, { schema: s });
  const clock = new FixedClock(nextMondayIst('10:30'));
  const anthropic = new FakePrimary();
  const KEY = 'sk-ant-api03-test-key-0123456789-WXYZ';
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const URL = '/v1/ai/admin/connection';

  beforeAll(async () => {
    await anthropic.start();
    process.env.ANTHROPIC_BASE_URL = anthropic.url;
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.otherTeacher = await login(other.slug, other.teacher.email!);
  });

  beforeEach(() => {
    anthropic.mode = 'ok';
    anthropic.chat = [];
    anthropic.auth = [];
  });

  afterAll(async () => {
    await http().delete(URL).set(as('principal'));
    delete process.env.ANTHROPIC_BASE_URL;
    await app.close();
    await anthropic.stop();
    await owner.end();
  });

  it('starts unconnected and is for the admin or principal only', async () => {
    const res = await http().get(URL).set(as('principal')).expect(200);
    expect(res.body).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', fallbackModel: 'claude-haiku-5-5', keySet: false, keyHint: null, source: 'none' });
    await http().get(URL).set(as('teacher')).expect(403);
    await http().put(URL).set(as('teacher')).send({ apiKey: KEY }).expect(403);
    await http().post(`${URL}/test`).set(as('teacher')).expect(403);
    await http().put(URL).set(as('principal')).send({ model: 'claude-opus-5-5' }).expect(400);
    await http().put(URL).set(as('principal')).send({ apiKey: KEY, model: 'gpt-4' }).expect(400);
  });

  it('saves the key encrypted, never returns it, and audits without it', async () => {
    const res = await http().put(URL).set(as('principal')).send({ apiKey: KEY }).expect(200);
    expect(res.body).toMatchObject({ keySet: true, keyHint: 'WXYZ', source: 'institution', model: 'claude-sonnet-5-5', fallbackModel: 'claude-haiku-5-5' });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    expect(JSON.stringify((await http().get(URL).set(as('principal')).expect(200)).body)).not.toContain(KEY);
    const [row] = await ownerDb.select().from(s.aiConnections).where(eq(s.aiConnections.tenantId, t.tenantId));
    expect(row.apiKeyEnc).toMatch(/^v1\./);
    expect(row.apiKeyEnc).not.toContain(KEY);
    expect(row.apiKeyLast4).toBe('WXYZ');
    const audit = await ownerDb.select().from(s.auditLog).where(eq(s.auditLog.tenantId, t.tenantId));
    const entry = audit.find((a) => a.action === 'ai.connection_updated');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry!.data)).not.toContain(KEY);
    // Changing only the model keeps the key.
    const model = await http().put(URL).set(as('principal')).send({ model: 'claude-opus-5-5' }).expect(200);
    expect(model.body).toMatchObject({ keySet: true, keyHint: 'WXYZ', model: 'claude-opus-5-5' });
  });

  it("answers the institution's AI requests with its key and model; other institutions keep the server's", async () => {
    const res = await http().post('/v1/ai/explain').set(as('teacher')).send({ question: 'What is photosynthesis?' }).expect(200);
    expect(res.body.meta).toMatchObject({ preview: false, model: 'claude-opus-5-5' });
    expect(anthropic.chat.at(-1)!.model).toBe('claude-opus-5-5');
    expect(anthropic.auth.at(-1)).toBe(`Bearer ${KEY}`);
    const [usage] = await ownerDb.select().from(s.aiUsage).where(eq(s.aiUsage.tenantId, t.tenantId));
    expect(usage).toMatchObject({ outcome: 'ok', model: 'claude-opus-5-5' });

    const before = anthropic.chat.length;
    const o = await http().post('/v1/ai/explain').set(as('otherTeacher')).send({ question: 'What is photosynthesis?' }).expect(200);
    expect(o.body.meta.preview).toBe(true);
    expect(anthropic.chat.length).toBe(before);
  });

  it('tests the connection with one tiny completion, and names a rejected key', async () => {
    const ok = await http().post(`${URL}/test`).set(as('principal')).expect(200);
    expect(ok.body).toMatchObject({ ok: true, model: 'claude-opus-5-5' });
    expect(typeof ok.body.latencyMs).toBe('number');
    expect(anthropic.chat).toHaveLength(1);
    anthropic.mode = 401;
    const bad = await http().post(`${URL}/test`).set(as('principal')).expect(200);
    expect(bad.body).toEqual({ ok: false, error: KEY_REJECTED });
  });

  it('removes the key: the institution is back on the server AI', async () => {
    const res = await http().delete(URL).set(as('principal')).expect(200);
    expect(res.body).toMatchObject({ keySet: false, source: 'none' });
    expect(await ownerDb.select().from(s.aiConnections).where(eq(s.aiConnections.tenantId, t.tenantId))).toHaveLength(0);
    const ai = await http().post('/v1/ai/explain').set(as('teacher')).send({ question: 'Why are leaves green?' }).expect(200);
    expect(ai.body.meta.preview).toBe(true);
    expect(anthropic.chat).toHaveLength(0);
    const test = await http().post(`${URL}/test`).set(as('principal')).expect(200);
    expect(test.body.ok).toBe(false);
  });
});
