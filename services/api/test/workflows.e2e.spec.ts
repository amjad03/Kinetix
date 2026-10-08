import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { DbService } from '../src/db/db.service.js';
import { WorkflowsService } from '../src/workflows/workflows.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('workflow / e-governance engine', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(auth(who)).send(body);
  const events = async (type: string) => (await owner.query('select count(*)::int as n from domain_events where tenant_id = $1 and type = $2', [t.tenantId, type])).rows[0].n as number;
  const taskOf = async (requestId: string) => (await owner.query('select * from tasks where tenant_id = $1 and source_module = $2 and source_id = $3 order by created_at', [t.tenantId, 'workflows', requestId])).rows;
  const submit = async (who: string, requestType: string, over: object = {}) =>
    (await post(who, '/v1/workflows/requests', { requestType, title: `Request ${requestType}`, ...over }).expect(201)).body as { id: string; status: string; currentStep: number };
  const decide = (who: string, id: string, decision: string, comment = '') => post(who, `/v1/workflows/requests/${id}/decide`, { decision, comment });
  const inbox = async (who: string) => (await get(who, '/v1/workflows/requests/inbox').expect(200)).body as { id: string; stepName: string }[];

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@wf.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hod = await addUser('Hari Hod', 'hod');
    const accountant = await addUser('Asha Accounts', 'accountant');
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'W1', departmentId: dept.id });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: hod.id, employeeCode: 'W2', departmentId: dept.id });
    // A teacher in no department, to test the missing department head.
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher2.id, employeeCode: 'W3' });
    ids.hod = hod.id;
    ids.accountant = accountant.id;
    app = await createApp(clock);
    tokens = {
      hod: await login(t.slug, hod.email!),
      accountant: await login(t.slug, accountant.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('definitions', () => {
    it('only administrators write them, and the input is checked', async () => {
      const body = { requestType: 'purchase', name: 'Purchase approval', steps: [{ name: 'Head of department', approver: { kind: 'department_head' } }, { name: 'Accounts', approver: { kind: 'role', role: 'accountant' }, minAmount: 5000, slaHours: 24 }, { name: 'Principal', approver: { kind: 'role', role: 'principal' }, minAmount: 50000 }] };
      await post('teacher', '/v1/workflows/definitions', body).expect(403);
      await post('student', '/v1/workflows/definitions', body).expect(403);
      await post('principal', '/v1/workflows/definitions', { ...body, steps: [] }).expect(400);
      await post('principal', '/v1/workflows/definitions', { ...body, fields: [{ key: 'k', label: 'K', type: 'select' }] }).expect(400);
      await post('principal', '/v1/workflows/definitions', { ...body, steps: [{ name: 'Ghost', approver: { kind: 'user', userId: '00000000-0000-4000-8000-000000000000' } }] }).expect(404);
      const created = (await post('principal', '/v1/workflows/definitions', body).expect(201)).body;
      expect(created.version).toBe(0);
      await post('principal', '/v1/workflows/definitions', body).expect(409);

      await post('principal', '/v1/workflows/definitions', {
        requestType: 'leave',
        name: 'Leave request',
        fields: [{ key: 'days', label: 'Days', type: 'number', required: true }, { key: 'kind', label: 'Kind', type: 'select', required: true, options: ['casual', 'sick'] }, { key: 'from', label: 'From', type: 'date', required: true }, { key: 'note', label: 'Note', type: 'text' }],
        steps: [{ name: 'Head of department', approver: { kind: 'department_head' }, slaHours: 48 }],
      }).expect(201);
      await post('principal', '/v1/workflows/definitions', { requestType: 'inactive_one', name: 'Not in use', active: false, steps: [{ name: 'Principal', approver: { kind: 'role', role: 'principal' } }] }).expect(201);
      await post('principal', '/v1/workflows/definitions', { requestType: 'named', name: 'Named approver', steps: [{ name: 'Accounts desk', approver: { kind: 'user', userId: ids.accountant } }] }).expect(201);

      const stale = await patch('principal', `/v1/workflows/definitions/${created.id}`, { name: 'Purchase approval v2', expectedVersion: 5 });
      expect(stale.status).toBe(409);
      expect((await patch('principal', `/v1/workflows/definitions/${created.id}`, { name: 'Purchase approval v2', expectedVersion: 0 }).expect(200)).body.version).toBe(1);

      // Staff see only active routes; administrators see all.
      const staff = (await get('teacher', '/v1/workflows/definitions').expect(200)).body as { requestType: string }[];
      expect(staff.map((d) => d.requestType)).not.toContain('inactive_one');
      expect(((await get('principal', '/v1/workflows/definitions').expect(200)).body as unknown[]).length).toBe(staff.length + 1);
    });
  });

  describe('routing', () => {
    it('sends a small purchase to the head of department only, raising and closing a task', async () => {
      const r = await submit('teacher', 'purchase', { amount: 1000 });
      expect(r.status).toBe('pending');
      const tasks = await taskOf(r.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].assignee_id).toBe(ids.hod);
      expect(tasks[0].owner_id).toBe(t.teacher.id);
      expect(tasks[0].status).toBe('open');
      expect((await inbox('hod')).map((x) => x.id)).toContain(r.id);
      expect((await inbox('accountant')).map((x) => x.id)).not.toContain(r.id);
      expect((await inbox('teacher')).map((x) => x.id)).not.toContain(r.id);

      const before = await events('workflows.decided');
      const done = (await decide('hod', r.id, 'approve', 'Fine').expect(200)).body;
      expect(done.status).toBe('approved');
      expect((await taskOf(r.id))[0].status).toBe('done');
      expect(await events('workflows.decided')).toBe(before + 1);
      expect((await inbox('hod')).map((x) => x.id)).not.toContain(r.id);
      await decide('hod', r.id, 'approve').expect(409);
    });

    it('adds the accounts step above the threshold, found by role', async () => {
      const r = await submit('teacher', 'purchase', { amount: 20000 });
      expect(r.currentStep).toBe(0);
      await decide('accountant', r.id, 'approve').expect(403); // not their step yet
      await decide('hod', r.id, 'approve').expect(200);
      expect((await inbox('accountant')).map((x) => x.id)).toContain(r.id);
      const tasks = await taskOf(r.id);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].status).toBe('done');
      expect(tasks[1].assignee_id).toBe(ids.accountant);
      expect(tasks[1].status).toBe('open');
      expect(tasks[1].sla_hours).toBe(24);
      expect(tasks[1].due_at).not.toBeNull();
      expect((await decide('accountant', r.id, 'approve').expect(200)).body.status).toBe('approved');
      expect((await inbox('principal')).map((x) => x.id)).not.toContain(r.id);
    });

    it('goes on to the principal for a large amount', async () => {
      const r = await submit('teacher', 'purchase', { amount: 60000 });
      await decide('hod', r.id, 'approve').expect(200);
      await decide('accountant', r.id, 'approve').expect(200);
      expect((await inbox('principal')).map((x) => x.id)).toContain(r.id);
      await decide('hod', r.id, 'approve').expect(403);
      const final = (await decide('principal', r.id, 'approve', 'Go ahead').expect(200)).body;
      expect(final.status).toBe('approved');
      const detail = (await get('teacher', `/v1/workflows/requests/${r.id}`).expect(200)).body;
      expect(detail.timeline.map((a: { action: string }) => a.action)).toEqual(['submitted', 'approved', 'approved', 'approved']);
      expect(detail.timeline[3].comment).toBe('Go ahead');
      expect(detail.canDecide).toBe(false);
    });

    it('routes to a named user, and refuses a request when nobody can decide a step', async () => {
      const r = await submit('teacher', 'named');
      expect((await inbox('accountant')).map((x) => x.id)).toContain(r.id);
      await decide('accountant', r.id, 'approve').expect(200);
      // teacher2 has no department, so the head-of-department step cannot be resolved.
      const res = await post('teacher2', '/v1/workflows/requests', { requestType: 'purchase', title: 'No head', amount: 10 });
      expect(res.status).toBe(422);
      await post('teacher', '/v1/workflows/requests', { requestType: 'inactive_one', title: 'Closed route' }).expect(404);
      await post('teacher', '/v1/workflows/requests', { requestType: 'nothing_here', title: 'Unknown type' }).expect(404);
    });

    it('skips a step whose approver is the requester and approves when no step is left', async () => {
      const before = await events('workflows.decided');
      const r = await submit('hod', 'leave', { payload: { days: 1, kind: 'casual', from: '2026-11-02' } });
      expect(r.status).toBe('approved');
      expect(await events('workflows.decided')).toBe(before + 1);
      const detail = (await get('hod', `/v1/workflows/requests/${r.id}`).expect(200)).body;
      expect(detail.timeline.map((a: { action: string }) => a.action)).toEqual(['submitted', 'skipped']);
    });
  });

  describe('forms, return and resubmit', () => {
    it('validates the payload against the definition fields', async () => {
      const bad = await post('teacher', '/v1/workflows/requests', { requestType: 'leave', title: 'Leave', payload: { days: 'many', kind: 'holiday', from: '2026-02-30' } });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toContain('Days must be a number');
      expect(bad.body.message).toContain('Kind must be one of');
      expect(bad.body.message).toContain('From must be a date');
    });

    it('returns a request with a comment, lets the requester fix it and routes it again', async () => {
      const r = await submit('teacher', 'leave', { title: 'Two days of leave', payload: { days: '2', kind: 'sick', from: '2026-11-03', stray: 'dropped' } });
      expect((await get('teacher', `/v1/workflows/requests/${r.id}`).expect(200)).body.payload).toEqual({ days: 2, kind: 'sick', from: '2026-11-03' });
      await decide('hod', r.id, 'return').expect(422); // a return needs a reason
      const back = (await decide('hod', r.id, 'return', 'Attach the medical note').expect(200)).body;
      expect(back.status).toBe('returned');
      expect((await taskOf(r.id))[0].status).toBe('done');
      expect((await inbox('hod')).map((x) => x.id)).not.toContain(r.id);
      expect(((await get('teacher', '/v1/workflows/requests/mine').expect(200)).body as { id: string; status: string }[]).find((x) => x.id === r.id)?.status).toBe('returned');
      await post('hod', `/v1/workflows/requests/${r.id}/resubmit`, {}).expect(403); // only the requester
      await decide('hod', r.id, 'approve').expect(409); // nothing waiting
      const again = (await post('teacher', `/v1/workflows/requests/${r.id}/resubmit`, { payload: { days: 2, kind: 'sick', from: '2026-11-03', note: 'Note attached' } }).expect(200)).body;
      expect(again.status).toBe('pending');
      expect(again.currentStep).toBe(0);
      const tasks = await taskOf(r.id);
      expect(tasks).toHaveLength(2);
      expect(tasks[1].status).toBe('open');
      expect((await inbox('hod')).map((x) => x.id)).toContain(r.id);
      expect((await decide('hod', r.id, 'approve').expect(200)).body.status).toBe('approved');
      const detail = (await get('principal', `/v1/workflows/requests/${r.id}`).expect(200)).body;
      expect(detail.timeline.map((a: { action: string }) => a.action)).toEqual(['submitted', 'returned', 'resubmitted', 'approved']);
      expect(detail.timeline[1].comment).toBe('Attach the medical note');
      expect(detail.timeline[1].actorName).toBe('Hari Hod');
      expect(detail.definition.fields).toHaveLength(4);
    });

    it('rejects for good, with a comment, and tells the domain', async () => {
      const before = await events('workflows.decided');
      const r = await submit('teacher', 'leave', { payload: { days: 5, kind: 'casual', from: '2026-12-01' } });
      await decide('hod', r.id, 'reject').expect(422);
      const out = (await decide('hod', r.id, 'reject', 'Exams that week').expect(200)).body;
      expect(out.status).toBe('rejected');
      expect((await taskOf(r.id))[0].status).toBe('done');
      expect(await events('workflows.decided')).toBe(before + 1);
      const ev = await owner.query(`select payload from domain_events where tenant_id = $1 and type = 'workflows.decided' and aggregate_id = $2`, [t.tenantId, r.id]);
      expect(ev.rows[0].payload).toMatchObject({ status: 'rejected', requestType: 'leave', requesterId: t.teacher.id, comment: 'Exams that week' });
      await post('teacher', `/v1/workflows/requests/${r.id}/resubmit`, {}).expect(409);
      await post('teacher', `/v1/workflows/requests/${r.id}/cancel`, {}).expect(409);
    });

    it('lets the requester withdraw an open request and closes its task', async () => {
      const r = await submit('teacher', 'leave', { payload: { days: 1, kind: 'casual', from: '2026-12-10' } });
      await post('teacher2', `/v1/workflows/requests/${r.id}/cancel`, {}).expect(403);
      expect((await post('teacher', `/v1/workflows/requests/${r.id}/cancel`, { comment: 'Plans changed' }).expect(200)).body.status).toBe('cancelled');
      expect((await taskOf(r.id))[0].status).toBe('cancelled');
      expect((await inbox('hod')).map((x) => x.id)).not.toContain(r.id);
    });
  });

  describe('access control', () => {
    it('keeps requests to the people involved', async () => {
      const r = await submit('teacher', 'purchase', { amount: 100 });
      await get('teacher2', `/v1/workflows/requests/${r.id}`).expect(403);
      await get('student', `/v1/workflows/requests/${r.id}`).expect(403);
      await get('outsider', `/v1/workflows/requests/${r.id}`).expect(404);
      await get('hod', `/v1/workflows/requests/${r.id}`).expect(200);
      await get('principal', `/v1/workflows/requests/${r.id}`).expect(200);
      await decide('teacher2', r.id, 'approve').expect(403);
      await decide('teacher', r.id, 'approve').expect(403); // not your own request
      await decide('outsider', r.id, 'approve').expect(404);
      await get('teacher', '/v1/workflows/requests').expect(403);
      await get('student', '/v1/workflows/requests/mine').expect(403);
      await post('student', '/v1/workflows/requests', { requestType: 'purchase', title: 'Student try' }).expect(403);
      const all = (await get('principal', '/v1/workflows/requests?status=pending').expect(200)).body as { id: string }[];
      expect(all.map((x) => x.id)).toContain(r.id);
      expect(((await get('outsider', '/v1/workflows/requests').expect(200)).body as unknown[]).length).toBe(0);
    });

    it('lets another module start a request inside its own transaction', async () => {
      const svc = app.get(WorkflowsService);
      const dbs = app.get(DbService);
      const req = await dbs.withTenant(t.tenantId, (tx) => svc.start(tx, { tenantId: t.tenantId, requesterId: t.teacher.id, requestType: 'purchase', title: 'From a domain', amount: 10, sourceModule: 'inventory', sourceId: 'req-1' }));
      expect(req.status).toBe('pending');
      await decide('hod', req.id, 'approve').expect(200);
      const ev = await owner.query(`select payload from domain_events where tenant_id = $1 and type = 'workflows.decided' and aggregate_id = $2`, [t.tenantId, req.id]);
      expect(ev.rows[0].payload).toMatchObject({ status: 'approved', sourceModule: 'inventory', sourceId: 'req-1' });
    });
  });
});
