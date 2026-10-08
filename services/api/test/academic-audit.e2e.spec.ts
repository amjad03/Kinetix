import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { compliancePct } from '../src/academic-audit/academic-audit.controller.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('academic audit', () => {
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
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@aa.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hod = await addUser('Hari Hod', 'hod');
    const otherHod = await addUser('Omkar Hod', 'hod');
    const [commerce] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    const [languages] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Languages', headUserId: otherHod.id }).returning();
    app = await createApp(clock);
    tokens = {
      hod: await login(t.slug, hod.email!),
      otherHod: await login(t.slug, otherHod.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { commerce: commerce.id, languages: languages.id, teacher: t.teacher.id, teacher2: t.teacher2.id });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('counts a partial finding as half when computing compliance', () => {
    expect(compliancePct({ compliant: 2, partial: 2, nonCompliant: 0 })).toBe(75);
    expect(compliancePct({ compliant: 0, partial: 0, nonCompliant: 0 })).toBeNull();
  });

  it('offers each auditor the departments they may audit', async () => {
    expect((await get('principal', '/v1/academic-audit/options').expect(200)).body.departments).toHaveLength(2);
    const mine = (await get('hod', '/v1/academic-audit/options').expect(200)).body;
    expect(mine.departments).toEqual([{ id: ids.commerce, name: 'Commerce' }]);
    expect(mine.owners.map((o: { id: string }) => o.id)).toContain(ids.teacher);
    await get('teacher', '/v1/academic-audit/options').expect(403);
  });

  it('lets school leaders write templates with checklist items; heads of department only read them', async () => {
    const body = { name: 'Department quality audit', description: 'Yearly', items: [{ category: 'Teaching', text: 'Lesson plans are written and reviewed' }, { category: 'Teaching', text: 'Syllabus coverage is on schedule' }, { category: 'Records', text: 'Course files are complete' }] };
    await post('hod', '/v1/academic-audit/templates', body).expect(403);
    await post('principal', '/v1/academic-audit/templates', { ...body, items: [] }).expect(400);
    const tpl = (await post('principal', '/v1/academic-audit/templates', body).expect(201)).body;
    expect(tpl.items.map((i: { ord: number }) => i.ord)).toEqual([1, 2, 3]);
    ids.tpl = tpl.id;
    expect((await get('hod', '/v1/academic-audit/templates').expect(200)).body).toMatchObject([{ id: tpl.id, itemCount: 3, active: true }]);
    expect((await get('hod', `/v1/academic-audit/templates/${tpl.id}`).expect(200)).body.items).toHaveLength(3);
    await get('teacher', '/v1/academic-audit/templates').expect(403);
  });

  it('starts an audit only for a department the head runs, copying the checklist', async () => {
    await post('otherHod', '/v1/academic-audit/audits', { templateId: ids.tpl, departmentId: ids.commerce }).expect(403);
    await post('hod', '/v1/academic-audit/audits', { templateId: randomUUID(), departmentId: ids.commerce }).expect(404);
    const a = (await post('hod', '/v1/academic-audit/audits', { templateId: ids.tpl, departmentId: ids.commerce }).expect(201)).body;
    expect(a).toMatchObject({ status: 'in_progress', title: 'Department quality audit - Commerce', conductedOn: '2026-10-20' });
    ids.audit = a.id;
    const full = (await get('hod', `/v1/academic-audit/audits/${a.id}`).expect(200)).body;
    expect(full.results).toHaveLength(3);
    expect(full.results.every((r: { result: string }) => r.result === 'pending')).toBe(true);
    ids.r1 = full.results[0].id;
    ids.r2 = full.results[1].id;
    ids.r3 = full.results[2].id;
    await get('otherHod', `/v1/academic-audit/audits/${a.id}`).expect(404);
    expect((await get('otherHod', '/v1/academic-audit/audits').expect(200)).body).toEqual([]);
    expect((await get('principal', '/v1/academic-audit/audits').expect(200)).body).toHaveLength(1);
    await get('teacher', '/v1/academic-audit/audits').expect(403);
  });

  it('records findings, requires a remark when not compliant, and blocks completion until every gap is handled', async () => {
    const rec = (r: string, body: object) => put('hod', `/v1/academic-audit/audits/${ids.audit}/results/${r}`, body);
    await put('otherHod', `/v1/academic-audit/audits/${ids.audit}/results/${ids.r1}`, { result: 'compliant' }).expect(404);
    await rec(ids.r1, { result: 'compliant' }).expect(200);
    await rec(ids.r2, { result: 'partial' }).expect(409);
    await rec(ids.r2, { result: 'partial', remark: 'Two classes behind schedule' }).expect(200);
    await post('hod', `/v1/academic-audit/audits/${ids.audit}/complete`).expect(409);
    await rec(ids.r3, { result: 'non_compliant', remark: 'No course file for Sem 3' }).expect(200);
    const gap = (await post('hod', `/v1/academic-audit/audits/${ids.audit}/complete`).expect(409)).body;
    expect(JSON.stringify(gap)).toContain('no non-conformity');
  });

  it('follows a non-conformity through corrective action to closure with evidence', async () => {
    await post('hod', `/v1/academic-audit/audits/${ids.audit}/non-conformities`, { resultId: ids.r1, description: 'A compliant item cannot have one' }).expect(409);
    const nc = (await post('hod', `/v1/academic-audit/audits/${ids.audit}/non-conformities`, { resultId: ids.r3, description: 'Course file missing', severity: 'major', ownerUserId: ids.teacher, dueOn: '2026-11-05' }).expect(201)).body;
    expect(nc).toMatchObject({ status: 'open', severity: 'major', ownerUserId: ids.teacher, dueOn: '2026-11-05' });
    ids.nc = nc.id;
    expect((await post('hod', `/v1/academic-audit/audits/${ids.audit}/complete`).expect(200)).body.status).toBe('completed');
    await put('hod', `/v1/academic-audit/audits/${ids.audit}/results/${ids.r1}`, { result: 'partial', remark: 'changed my mind' }).expect(409);

    // The owner sees only what is assigned to them and cannot move the owner or due date.
    expect((await get('teacher', '/v1/academic-audit/non-conformities').expect(200)).body).toMatchObject([{ id: nc.id, department: 'Commerce', overdue: false }]);
    expect((await get('teacher2', '/v1/academic-audit/non-conformities').expect(200)).body).toEqual([]);
    expect((await get('otherHod', '/v1/academic-audit/non-conformities').expect(200)).body).toEqual([]);
    await put('teacher2', `/v1/academic-audit/non-conformities/${nc.id}`, { correctiveAction: 'x' }).expect(404);
    await put('teacher', `/v1/academic-audit/non-conformities/${nc.id}`, { dueOn: '2027-01-01' }).expect(403);
    await post('teacher', `/v1/academic-audit/non-conformities/${nc.id}/close`, { closureNote: 'Done and dusted' }).expect(409);
    const worked = (await put('teacher', `/v1/academic-audit/non-conformities/${nc.id}`, { correctiveAction: 'Compile the Sem 3 course file from the course-file module' }).expect(200)).body;
    expect(worked.status).toBe('in_progress');
    await post('teacher', `/v1/academic-audit/non-conformities/${nc.id}/close`, { closureNote: 'x' }).expect(400);
    const closed = (await post('teacher', `/v1/academic-audit/non-conformities/${nc.id}/close`, { closureNote: 'Course file v2 generated and reviewed by the HOD.' }).expect(200)).body;
    expect(closed).toMatchObject({ status: 'closed', closedBy: ids.teacher });
    await post('hod', `/v1/academic-audit/non-conformities/${nc.id}/close`, { closureNote: 'Again please' }).expect(409);
  });

  it('shows an overdue open non-conformity and summarises each department', async () => {
    await post('hod', `/v1/academic-audit/audits/${ids.audit}/non-conformities`, { description: 'Lesson plan review is irregular', ownerUserId: ids.teacher2, dueOn: '2026-10-10' }).expect(201);
    expect((await get('teacher2', '/v1/academic-audit/non-conformities').expect(200)).body[0]).toMatchObject({ overdue: true, ownerName: t.teacher2.fullName });
    const all = (await get('principal', '/v1/academic-audit/summary').expect(200)).body;
    expect(all.find((d: { department: string }) => d.department === 'Commerce')).toMatchObject({ audits: 1, completed: 1, compliant: 1, partial: 1, nonCompliant: 1, compliancePct: 50, ncOpen: 1, ncOverdue: 1, ncClosed: 1 });
    expect(all.find((d: { department: string }) => d.department === 'Languages')).toMatchObject({ audits: 0, compliancePct: null, ncOpen: 0 });
    expect((await get('hod', '/v1/academic-audit/summary').expect(200)).body.map((d: { department: string }) => d.department)).toEqual(['Commerce']);
    await get('student', '/v1/academic-audit/summary').expect(403);
    expect((await get('outsider', '/v1/academic-audit/summary').expect(200)).body).toEqual([]);
  });

  it('retires a template without touching audits made from it', async () => {
    await post('hod', `/v1/academic-audit/templates/${ids.tpl}/archive`).expect(403);
    await post('principal', `/v1/academic-audit/templates/${ids.tpl}/archive`).expect(200);
    await post('principal', '/v1/academic-audit/audits', { templateId: ids.tpl, departmentId: ids.languages }).expect(409);
    expect((await get('hod', `/v1/academic-audit/audits/${ids.audit}`).expect(200)).body.results).toHaveLength(3);
  });
});
