import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('visual workflow builder and analytics cards', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);

  beforeAll(async () => {
    t = await createTenant(owner);
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Asha Accounts', email: 'asha@wfb.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role: 'accountant' });
    app = await createApp(clock);
    tokens = { principal: await login(t.slug, t.principal.email!), teacher: await login(t.slug, t.teacher.email!), accountant: await login(t.slug, 'asha@wfb.in') };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('creates, saves a draft, blocks publishing until valid, publishes, test-runs and runs a workflow', async () => {
    await post('teacher', '/v1/workflows/builder', { name: 'Fee concession' }).expect(403);
    const { id } = (await post('principal', '/v1/workflows/builder', { name: 'Fee concession', module: 'fees' }).expect(201)).body as { id: string };
    let d = (await get('principal', `/v1/workflows/builder/${id}`).expect(200)).body;
    expect(d.status).toBe('draft');
    expect(d.graph.nodes.length).toBeGreaterThan(0);

    // A condition with an approval missing its approver: saved as a draft, but publishing is refused.
    const graph = {
      trigger: { id: 'trigger', type: 'trigger', name: 'Concession requested', sources: ['parent_app'] },
      nodes: [
        {
          id: 'c1', type: 'condition', name: 'Big?', field: 'amount', op: '>', value: 25000,
          yes: [{ id: 'a1', type: 'approval', name: 'Principal', approver: { kind: 'role', role: 'principal' }, slaHours: 48 }],
          no: [{ id: 'a2', type: 'approval', name: 'Accounts', approver: null }],
        },
        { id: 'n1', type: 'notify', name: 'Tell them', channels: ['app'], template: 'decision', when: 'decided', to: 'requester' },
      ],
    };
    const saved = (await put('principal', `/v1/workflows/builder/${id}/draft`, { graph, expectedVersion: d.version }).expect(200)).body;
    expect(saved.issues).toEqual([{ nodeId: 'a2', code: 'approver_missing' }]);
    const refused = (await post('principal', `/v1/workflows/builder/${id}/publish`, { expectedVersion: saved.version }).expect(422)).body;
    expect(refused.issues[0].nodeId).toBe('a2');

    graph.nodes[0].no![0] = { id: 'a2', type: 'approval', name: 'Accounts', approver: { kind: 'role', role: 'accountant' } } as never;
    const fixed = (await put('principal', `/v1/workflows/builder/${id}/draft`, { graph, expectedVersion: saved.version }).expect(200)).body;
    expect(fixed.issues).toEqual([]);
    // A stale version is refused.
    await post('principal', `/v1/workflows/builder/${id}/publish`, { expectedVersion: saved.version }).expect(409);
    const pub = (await post('principal', `/v1/workflows/builder/${id}/publish`, { expectedVersion: fixed.version }).expect(200)).body;
    expect(pub.publishedVersion).toBe(1);
    d = (await get('principal', `/v1/workflows/builder/${id}`).expect(200)).body;
    expect(d).toMatchObject({ status: 'active', hasDraft: false, publishedVersion: 1 });

    // Test run: the path a big request takes, nothing is created.
    const test = (await post('principal', `/v1/workflows/builder/${id}/test`, { amount: 40000 }).expect(200)).body;
    expect(test.path.map((x: { nodeId: string }) => x.nodeId)).toEqual(['trigger', 'c1', 'a1', 'n1']);
    expect(test.path[1].branch).toBe('yes');

    // A real run follows the compiled branch: a small request goes to accounts and the notify rule fires on the decision.
    const req = (await post('teacher', '/v1/workflows/requests', { requestType: d.requestType, title: 'Sibling concession', amount: 5000 }).expect(201)).body;
    expect(req.steps.map((x: { name: string }) => x.name)).toEqual(['Accounts']);
    await post('accountant', `/v1/workflows/requests/${req.id}/decide`, { decision: 'approve' }).expect(200);
    const notes = (await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and data->>'requestId' = $2`, [t.tenantId, req.id])).rows[0].n;
    expect(notes).toBeGreaterThanOrEqual(1);

    const list = (await get('principal', '/v1/workflows/builder').expect(200)).body as { id: string; runs: number; module: string; status: string }[];
    expect(list.find((w) => w.id === id)).toMatchObject({ runs: 1, module: 'fees', status: 'active' });
    const runs = (await get('principal', `/v1/workflows/builder/runs?definitionId=${id}`).expect(200)).body;
    expect(runs[0]).toMatchObject({ status: 'approved', workflow: 'Fee concession' });

    // Pause, then discard a new draft back to the published version.
    await put('principal', `/v1/workflows/builder/${id}/draft`, { graph: { ...graph, nodes: [] } }).expect(200);
    expect((await get('principal', `/v1/workflows/builder/${id}`).expect(200)).body.hasDraft).toBe(true);
    await http().delete(`/v1/workflows/builder/${id}/draft`).set(auth('principal')).expect(200);
    const back = (await get('principal', `/v1/workflows/builder/${id}`).expect(200)).body;
    expect(back.hasDraft).toBe(false);
    expect(back.graph.nodes).toHaveLength(2);
    expect((await post('principal', `/v1/workflows/builder/${id}/active`, { active: false }).expect(200)).body.status).toBe('paused');
  });

  it('serves the analytics cards', async () => {
    const adm = (await get('principal', '/v1/admin/analytics/admissions').expect(200)).body;
    expect(adm.months).toHaveLength(8);
    const health = (await get('principal', '/v1/admin/analytics/health').expect(200)).body;
    expect(['department', 'class']).toContain(health.kind);
    const week = (await get('principal', '/v1/admin/analytics/attendance-week').expect(200)).body;
    expect(week.days).toHaveLength(6);
    await get('teacher', '/v1/admin/analytics/health').expect(403);
  });
});
