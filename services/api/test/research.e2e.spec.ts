import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('research and projects', () => {
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
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const R = (rupees: number) => rupees * 100;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [coord] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Rhea Research', email: 'rhea@rs.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: coord.id, role: 'research_coordinator' });
    app = await createApp(clock);
    tokens = {
      coord: await login(t.slug, coord.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    ids.teacher = t.teacher.id;
    ids.teacher2 = t.teacher2.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('proposals', () => {
    const body = { title: 'Microfinance and rural credit', abstract: 'A field study', ethicsRequired: true, fundingSoughtPaise: R(300_000) };

    it('is closed to students, and faculty see only their own proposals', async () => {
      await post('student', '/v1/research/proposals', body).expect(403);
      const p = (await post('teacher', '/v1/research/proposals', body).expect(201)).body;
      ids.proposal = p.id;
      expect(p).toMatchObject({ status: 'draft', ethicsStatus: 'pending', piUserId: ids.teacher, version: 0 });
      expect((await get('teacher2', '/v1/research/proposals').expect(200)).body).toHaveLength(0);
      expect((await get('teacher', '/v1/research/proposals').expect(200)).body).toHaveLength(1);
      expect((await get('coord', '/v1/research/proposals').expect(200)).body).toHaveLength(1);
      await post('teacher', '/v1/research/proposals', { ...body, title: '' }).expect(400);
    });

    it('edits only drafts, with version checks, and only by the investigator', async () => {
      await put('teacher2', `/v1/research/proposals/${ids.proposal}`, { ...body, expectedVersion: 0 }).expect(404);
      await put('teacher', `/v1/research/proposals/${ids.proposal}`, { ...body, title: 'Microfinance study', expectedVersion: 0 }).expect(200);
      await put('teacher', `/v1/research/proposals/${ids.proposal}`, { ...body, expectedVersion: 0 }).expect(409);
      await post('teacher', `/v1/research/proposals/${ids.proposal}/submit`).expect(200);
      await put('teacher', `/v1/research/proposals/${ids.proposal}`, { ...body, expectedVersion: 2 }).expect(409);
      await post('teacher', `/v1/research/proposals/${ids.proposal}/submit`).expect(409);
    });

    it('needs ethics clearance before approval, then creates the project in one step', async () => {
      await post('teacher', `/v1/research/proposals/${ids.proposal}/decision`, { decision: 'approved' }).expect(403);
      await post('coord', `/v1/research/proposals/${ids.proposal}/decision`, { decision: 'approved' }).expect(409);
      await post('coord', `/v1/research/proposals/${ids.proposal}/ethics`, { status: 'cleared' }).expect(400);
      await post('coord', `/v1/research/proposals/${ids.proposal}/ethics`, { status: 'cleared', ref: 'IEC/2026/14' }).expect(200);
      await post('coord', `/v1/research/proposals/${ids.proposal}/decision`, { decision: 'rejected' }).expect(400);
      const out = (await post('coord', `/v1/research/proposals/${ids.proposal}/decision`, { decision: 'approved', note: 'Good design' }).expect(200)).body;
      expect(out.status).toBe('approved');
      expect(out.project).toMatchObject({ code: 'PRJ-0001', startsOn: '2026-10-20', piUserId: ids.teacher, status: 'active' });
      ids.project = out.project.id;
      await post('coord', `/v1/research/proposals/${ids.proposal}/decision`, { decision: 'rejected', note: 'Too late' }).expect(409);
      expect(await audited('research.proposal_approved')).toBe(1);
    });
  });

  describe('projects, milestones and scholars', () => {
    it('shows a project to its investigator and members only', async () => {
      await get('teacher2', `/v1/research/projects/${ids.project}`).expect(404);
      expect((await get('teacher2', '/v1/research/projects').expect(200)).body).toHaveLength(0);
      await post('coord', `/v1/research/projects/${ids.project}/members`, { userId: ids.teacher2, role: 'co_supervisor' }).expect(201);
      await post('coord', `/v1/research/projects/${ids.project}/members`, { userId: ids.teacher2, role: 'member' }).expect(409);
      await post('coord', `/v1/research/projects/${ids.project}/members`, { userId: t.studentUser.id, role: 'member' }).expect(409); // not faculty
      await post('coord', `/v1/research/projects/${ids.project}/members`, { studentId: t.students[0].id, role: 'student' }).expect(201);
      const p = (await get('teacher2', `/v1/research/projects/${ids.project}`).expect(200)).body;
      expect(p.members).toHaveLength(3);
      await post('teacher2', `/v1/research/projects/${ids.project}/milestones`, { title: 'Survey', dueOn: '2026-12-01' }).expect(404); // members read, the investigator writes
    });

    it('tracks milestones with evidence, and completion needs an outcome', async () => {
      const m = (await post('teacher', `/v1/research/projects/${ids.project}/milestones`, { title: 'Survey done', dueOn: '2026-12-01' }).expect(201)).body;
      const done = (await post('teacher', `/v1/research/milestones/${m.id}/complete`, { evidenceRef: 'vault://survey.pdf' }).expect(200)).body;
      expect(done).toMatchObject({ completedOn: '2026-10-20', evidenceRef: 'vault://survey.pdf' });
      await post('teacher', `/v1/research/projects/${ids.project}/status`, { status: 'on_hold' }).expect(403);
      await post('coord', `/v1/research/projects/${ids.project}/status`, { status: 'completed' }).expect(400);
    });

    it('registers a direct industry project, and enrols and awards scholars in order', async () => {
      await post('coord', '/v1/research/projects', { title: 'Retail analytics', kind: 'industry', piUserId: ids.teacher2, sponsorOrg: 'Acme', startsOn: '2026-10-01' }).expect(201);
      expect((await get('coord', '/v1/research/projects?kind=industry').expect(200)).body[0]).toMatchObject({ code: 'PRJ-0002', sponsorOrg: 'Acme' });
      const sc = (await post('coord', '/v1/research/scholars', { fullName: 'Ravi Kumar', programme: 'phd', supervisorUserId: ids.teacher, enrolledOn: '2025-08-01', projectId: ids.project }).expect(201)).body;
      await post('coord', '/v1/research/scholars', { fullName: 'X', programme: 'phd', supervisorUserId: t.studentUser.id, enrolledOn: '2025-08-01' }).expect(409);
      await post('coord', `/v1/research/scholars/${sc.id}/status`, { status: 'awarded', thesisTitle: 'Rural credit' }).expect(409);
      await post('coord', `/v1/research/scholars/${sc.id}/status`, { status: 'thesis_submitted' }).expect(400);
      await post('coord', `/v1/research/scholars/${sc.id}/status`, { status: 'thesis_submitted', thesisTitle: 'Rural credit' }).expect(200);
      expect((await post('coord', `/v1/research/scholars/${sc.id}/status`, { status: 'awarded' }).expect(200)).body).toMatchObject({ status: 'awarded', completedOn: '2026-10-20' });
      expect((await get('teacher', '/v1/research/scholars').expect(200)).body).toHaveLength(1);
      expect((await get('teacher2', '/v1/research/scholars').expect(200)).body).toHaveLength(0);
    });
  });

  describe('publications, conferences and patents', () => {
    const pub = { title: 'Credit access in rural India', venue: 'Journal of Rural Studies', year: 2026, authors: [{ name: 'T. Teacher' }], indexedIn: ['scopus'] };

    it('validates and normalises DOIs, and refuses duplicates', async () => {
      await post('teacher', '/v1/research/publications', { ...pub, doi: 'not-a-doi' }).expect(400);
      await post('teacher', '/v1/research/publications', { ...pub, doi: '10.1000/xyz', issn: '12345678' }).expect(400);
      const a = (await post('teacher', '/v1/research/publications', { ...pub, doi: 'https://doi.org/10.1016/j.jrurstud.2026.01.001', issn: '0743-0167' }).expect(201)).body;
      expect(a.doi).toBe('10.1016/j.jrurstud.2026.01.001');
      await post('teacher2', '/v1/research/publications', { ...pub, title: 'Other', doi: '10.1016/J.JRURSTUD.2026.01.001' }).expect(409);
      await post('teacher2', '/v1/research/publications', { ...pub, title: 'A book chapter', kind: 'book_chapter', indexedIn: [] }).expect(201);
      expect((await get('teacher', `/v1/research/publications?year=2026&ownerUserId=${ids.teacher}`).expect(200)).body).toHaveLength(1);
      await post('student', '/v1/research/publications', pub).expect(403);
    });

    it('records conferences and patents with their own rules', async () => {
      await post('teacher', '/v1/research/conferences', { name: 'ICRC 2026', role: 'presented', heldOn: '2026-09-10' }).expect(400);
      await post('teacher', '/v1/research/conferences', { name: 'ICRC 2026', role: 'presented', level: 'international', heldOn: '2026-09-10', paperTitle: 'Credit access' }).expect(201);
      expect((await get('teacher2', '/v1/research/conferences').expect(200)).body).toHaveLength(0);
      await post('teacher', '/v1/research/patents', { title: 'Credit scoring method', inventors: [{ name: 'T. Teacher' }] }).expect(400);
      const pat = (await post('teacher', '/v1/research/patents', { title: 'Credit scoring method', inventors: [{ name: 'T. Teacher' }], applicationNo: '202641001234', filedOn: '2026-08-01' }).expect(201)).body;
      await post('teacher', `/v1/research/patents/${pat.id}/status`, { status: 'published' }).expect(403);
      await post('coord', `/v1/research/patents/${pat.id}/status`, { status: 'granted' }).expect(400);
      await post('coord', `/v1/research/patents/${pat.id}/status`, { status: 'granted', grantedOn: '2026-10-01' }).expect(200);
      await post('coord', `/v1/research/patents/${pat.id}/status`, { status: 'rejected' }).expect(409);
    });
  });

  describe('grants and expenses', () => {
    it('tracks the balance and refuses overspending, expenses outside the period, and outsiders', async () => {
      const g = { projectId: ids.project, agency: 'DST', scheme: 'SERB', sanctionRef: 'SB/2026/1', sanctionedPaise: R(100_000), startsOn: '2026-10-01', endsOn: '2027-09-30' };
      await post('teacher', '/v1/research/grants', g).expect(403);
      await post('coord', '/v1/research/grants', { ...g, endsOn: '2026-01-01' }).expect(400);
      const grant = (await post('coord', '/v1/research/grants', g).expect(201)).body;
      const e = (amountPaise: number, over: object = {}) => post('teacher', `/v1/research/grants/${grant.id}/expenses`, { head: 'Equipment', amountPaise, spentOn: '2026-10-15', ...over });
      expect((await e(R(60_000)).expect(201)).body).toMatchObject({ spentPaise: R(60_000), balancePaise: R(40_000), utilisationPercent: 60 });
      const over = await e(R(40_001)).expect(409);
      expect(over.body).toMatchObject({ code: 'GRANT_OVERSPEND', balancePaise: R(40_000) });
      await e(R(1_000), { spentOn: '2026-09-01' }).expect(409);
      await e(0).expect(400);
      await post('teacher2', `/v1/research/grants/${grant.id}/expenses`, { head: 'Travel', amountPaise: R(1), spentOn: '2026-10-15' }).expect(404);
      await e(R(40_000)).expect(201);
      const detail = (await get('teacher', `/v1/research/grants/${grant.id}`).expect(200)).body;
      expect(detail).toMatchObject({ balancePaise: 0, utilisationPercent: 100 });
      expect(detail.expenses).toHaveLength(2);
      await post('coord', `/v1/research/grants/${grant.id}/close`).expect(200);
      await e(R(1)).expect(409);
      await post('coord', `/v1/research/grants/${grant.id}/close`).expect(409);
      expect((await get('teacher', '/v1/research/grants').expect(200)).body[0]).toMatchObject({ status: 'closed', spentPaise: R(100_000) });
      await get('outsider', `/v1/research/grants/${grant.id}`).expect(404);
      expect(await audited('research.expense_recorded')).toBe(2);
    });
  });

  describe('NAAC criterion 3 KPIs', () => {
    it('summarises the range for research staff only', async () => {
      await get('teacher', '/v1/research/kpis').expect(403);
      await get('coord', '/v1/research/kpis?fromYear=2030&toYear=2026').expect(400);
      const k = (await get('coord', '/v1/research/kpis?fromYear=2022&toYear=2026').expect(200)).body;
      expect(k).toMatchObject({ fromYear: 2022, toYear: 2026, facultyCount: 3, publications: { total: 2, indexed: 1, booksAndChapters: 1 }, grants: { count: 1, totalSanctionedPaise: R(100_000) }, patents: { total: 1, granted: 1 }, scholarsAwarded: 1, conferencesPresented: 1 });
      expect(k.publications.perTeacher).toBeCloseTo(0.67, 2);
      expect(k.naac['3.4.2'].value).toBe(1);
      const theirs = (await get('outsider', '/v1/research/kpis').expect(200)).body;
      expect(theirs.publications.total).toBe(0);
      expect((await get('outsider', '/v1/research/projects').expect(200)).body).toHaveLength(0);
    });
  });
});
