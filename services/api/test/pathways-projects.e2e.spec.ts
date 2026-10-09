import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { ksaSummary } from '../src/skills/skills.service.js';
import { scoreRubric, skillFit } from '../src/projects/projects.logic.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('project rules', () => {
  it('scores a rubric and rejects out-of-range scores', () => {
    expect(scoreRubric({ idea: 4, build: 5 }, 5)).toEqual({ total: 9, percent: 90 });
    expect(scoreRubric({ idea: 6 }, 5)).toBeNull();
    expect(scoreRubric({}, 5)).toBeNull();
  });
  it('matches skills loosely and reports the share covered', () => {
    expect(skillFit(['Excel', 'accounting', 'python'], ['MS Excel', 'Financial Accounting'])).toEqual({ matched: ['excel', 'accounting'], fit: 67 });
    expect(skillFit([], ['x'])).toEqual({ matched: [], fit: 0 });
  });
  it('summarises skills by KSA category', () => {
    expect(ksaSummary([{ category: 'knowledge', level: 4 }, { category: 'knowledge', level: 2 }, { category: 'leadership', level: null }])).toEqual([
      { category: 'knowledge', skills: 2, averageLevel: 3 },
      { category: 'leadership', skills: 1, averageLevel: null },
    ]);
  });
});

describe('project workspace, showcase, matching, portfolio and impact', () => {
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
  const del = (who: string, url: string) => http().delete(url).set(auth(who));
  const count = async (sql: string, args: unknown[]) => (await owner.query(sql, args)).rows[0].n as number;
  const P = '/v1/projects';

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    // A second student with a login, who is not on the project.
    const [peer] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Peer Student', email: 'peer@pw.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: peer.id, role: 'student' });
    await db.update(s.students).set({ userId: peer.id }).where(eq(s.students.id, t.students[1].id));
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      peer: await login(t.slug, 'peer@pw.in'),
      outsider: await login(other.slug, other.principal.email!),
    };
    ids.me = t.students[2].id;
    ids.peer = t.students[1].id;
    ids.project = (await post('principal', '/v1/research/projects', { title: 'Village accounts app', kind: 'capstone', piUserId: t.teacher.id, startsOn: '2026-09-01' }).expect(201)).body.id;
    await post('principal', `/v1/research/projects/${ids.project}/members`, { studentId: ids.me, role: 'student' }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('shows the workspace to the team and no one else', async () => {
    const w = (await get('student', `${P}/${ids.project}/workspace`).expect(200)).body;
    expect(w).toMatchObject({ myRole: 'member', project: { title: 'Village accounts app', pi: t.teacher.fullName } });
    expect(w.members.map((m: { name: string }) => m.name)).toContain('Student C');
    await get('teacher', `${P}/${ids.project}/workspace`).expect(200);
    await get('teacher2', `${P}/${ids.project}/workspace`).expect(404);
    await get('peer', `${P}/${ids.project}/workspace`).expect(404);
    await get('outsider', `${P}/${ids.project}/workspace`).expect(404);
    expect((await get('student', `${P}/mine`).expect(200)).body.map((x: { id: string }) => x.id)).toEqual([ids.project]);
    expect((await get('peer', `${P}/mine`).expect(200)).body).toEqual([]);
  });

  it('keeps files and links, serves a file to the team and refuses a link with no title', async () => {
    await post('student', `${P}/${ids.project}/files`, { url: 'https://example.org/repo', kind: 'link' }).expect(400);
    await post('student', `${P}/${ids.project}/files`, { title: 'Repo', url: 'https://example.org/repo', kind: 'link' }).expect(201);
    const pdf = Buffer.from('%PDF-1.4 plan').toString('base64');
    const f = (await post('student', `${P}/${ids.project}/files`, { file: { filename: 'plan.pdf', contentType: 'application/pdf', contentBase64: pdf } }).expect(201)).body;
    expect(f).toMatchObject({ title: 'plan.pdf', kind: 'file' });
    const down = await get('teacher', `${P}/files/${f.id}/download`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(down.status).toBe(200);
    expect(down.headers['content-type']).toContain('application/pdf');
    expect((down.body as Buffer).toString()).toBe('%PDF-1.4 plan');
    await get('peer', `${P}/files/${f.id}/download`).expect(404);
    await post('student', `${P}/${ids.project}/files`, { file: { filename: 'x.pdf', contentType: 'application/x-msdownload', contentBase64: pdf } }).expect(400);
    await post('student', `${P}/${ids.project}/files`, { file: { filename: 'fake.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('MZ this is not a pdf').toString('base64') } }).expect(400);
  });

  it('runs a discussion and tells the rest of the team', async () => {
    const c = (await post('student', `${P}/${ids.project}/comments`, { body: 'Which ledger format should we use?' }).expect(201)).body;
    await post('teacher', `${P}/${ids.project}/comments`, { body: 'Use the Tally export format.', parentId: c.id }).expect(201);
    await post('peer', `${P}/${ids.project}/comments`, { body: 'Hi' }).expect(404);
    const list = (await get('student', `${P}/${ids.project}/comments`).expect(200)).body;
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ parentId: c.id, author: t.teacher.fullName });
    expect(await count(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and title like 'New comment%'`, [t.tenantId, t.teacher.id])).toBe(1);
  });

  it('records mentor rubric reviews and keeps peer reviews anonymous and one per reviewer', async () => {
    await post('teacher', `${P}/${ids.project}/reviews`, { kind: 'mentor', rubric: { Idea: 6 }, maxPerCriterion: 5 }).expect(409);
    const r = (await post('teacher', `${P}/${ids.project}/reviews`, { kind: 'mentor', rubric: { Idea: 4, Build: 5, Presentation: 3 }, maxPerCriterion: 5, comment: 'Solid' }).expect(201)).body;
    expect(r).toMatchObject({ total: 12, percent: 80 });
    await post('student', `${P}/${ids.project}/reviews`, { kind: 'mentor', rubric: { Idea: 5 } }).expect(404);
    // A peer can review only a showcase project they are not on.
    await post('peer', `${P}/${ids.project}/reviews`, { kind: 'peer', rubric: { Idea: 4 } }).expect(404);
    await put('teacher', `${P}/${ids.project}/hub`, { showcase: true, summary: 'Bookkeeping for village shops', recruiting: true, lookingFor: ['Excel', 'accounting'], openings: 2 }).expect(200);
    await post('peer', `${P}/${ids.project}/reviews`, { kind: 'peer', rubric: { Idea: 4, Build: 4 }, comment: 'Nice' }).expect(201);
    await post('peer', `${P}/${ids.project}/reviews`, { kind: 'peer', rubric: { Idea: 4 } }).expect(409);
    const list = (await get('student', `${P}/${ids.project}/reviews`).expect(200)).body;
    expect(list).toHaveLength(2);
    expect(list.find((x: { kind: string }) => x.kind === 'peer').reviewer).toBe('A classmate');
  });

  it('lists showcase projects with their review average and finds recruiting ones by skill', async () => {
    const show = (await get('peer', `${P}/showcase`).expect(200)).body;
    expect(show).toHaveLength(1);
    expect(show[0]).toMatchObject({ title: 'Village accounts app', summary: 'Bookkeeping for village shops', reviewAverage: 80 });
    const found = (await get('peer', `${P}/discover?skill=excel`).expect(200)).body;
    expect(found.map((x: { id: string }) => x.id)).toEqual([ids.project]);
    expect((await get('peer', `${P}/discover?skill=welding`).expect(200)).body).toEqual([]);
  });

  it('matches students to the skills a project looks for, from their resume and passport', async () => {
    await put('peer', '/v1/careers/resume', { headline: 'BCom', skills: ['MS Excel'], interests: ['accounting'] }).expect(200);
    const m = (await get('teacher', `${P}/${ids.project}/matches`).expect(200)).body;
    expect(m[0]).toMatchObject({ studentId: ids.peer, fit: 50, matched: ['excel'] });
    expect(m.map((x: { studentId: string }) => x.studentId)).not.toContain(ids.me);
    await get('student', `${P}/${ids.project}/matches`).expect(403);
  });

  it('takes a join request, and the mentor accepts it', async () => {
    await post('student', `${P}/${ids.project}/join`, { message: 'x' }).expect(409);
    const jr = (await post('peer', `${P}/${ids.project}/join`, { message: 'I know Excel well' }).expect(201)).body;
    await post('peer', `${P}/${ids.project}/join`, {}).expect(409);
    const reqs = (await get('teacher', `${P}/${ids.project}/requests`).expect(200)).body;
    expect(reqs[0]).toMatchObject({ studentId: ids.peer, status: 'pending', message: 'I know Excel well' });
    await get('peer', `${P}/${ids.project}/workspace`).expect(404);
    await post('teacher', `${P}/requests/${jr.id}/decide`, { accept: true }).expect(200);
    await post('teacher', `${P}/requests/${jr.id}/decide`, { accept: true }).expect(409);
    expect((await get('peer', `${P}/${ids.project}/workspace`).expect(200)).body.myRole).toBe('member');
    expect((await get('teacher', `${P}/${ids.project}/workspace`).expect(200)).body.hub.openings).toBe(1);
  });

  it('schedules a viva, records its result once, and tells the team', async () => {
    const v = (await post('teacher', `${P}/${ids.project}/viva`, { scheduledAt: '2026-11-02T05:00:00Z', venue: 'Room 4', panel: [{ userId: t.teacher2.id, name: 'Teacher Two' }] }).expect(201)).body;
    await post('student', `${P}/${ids.project}/viva`, { scheduledAt: '2026-11-02T05:00:00Z', panel: [{ name: 'X' }] }).expect(403);
    expect(await count(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and title like 'Viva for%'`, [t.tenantId, t.studentUser.id])).toBe(1);
    await post('student', `${P}/viva/${v.id}/result`, { outcome: 'pass' }).expect(404);
    await post('teacher2', `${P}/viva/${v.id}/result`, { outcome: 'pass', score: 88, remarks: 'Well defended' }).expect(200);
    await post('teacher', `${P}/viva/${v.id}/result`, { outcome: 'pass' }).expect(409);
    expect((await get('student', `${P}/${ids.project}/workspace`).expect(200)).body.vivas[0]).toMatchObject({ status: 'held', outcome: 'pass' });
  });

  it('keeps a portfolio where only published items are shown to others', async () => {
    const a = (await post('student', `${P}/portfolio`, { title: 'Village accounts app', summary: 'Capstone', projectId: ids.project, kind: 'project' }).expect(201)).body;
    await post('student', `${P}/portfolio`, { title: 'Draft idea' }).expect(201);
    await post('peer', `${P}/portfolio/${a.id}/publish`, { published: true }).expect(404);
    await post('student', `${P}/portfolio/${a.id}/publish`, { published: true }).expect(200);
    const seenByPeer = (await get('peer', `${P}/portfolio/student/${ids.me}`).expect(200)).body;
    expect(seenByPeer.items.map((x: { title: string }) => x.title)).toEqual(['Village accounts app']);
    expect((await get('teacher', `${P}/portfolio/student/${ids.me}`).expect(200)).body.items).toHaveLength(2);
    expect((await get('student', `${P}/portfolio/mine`).expect(200)).body).toHaveLength(2);
    await del('student', `${P}/portfolio/${a.id}`).expect(204);
    await get('outsider', `${P}/portfolio/student/${ids.me}`).expect(404);
  });

  it('measures impact against the institution’s own framework', async () => {
    const fw = (await post('principal', '/v1/impact/frameworks', { code: 'cr', name: 'Community reach', indicators: [{ code: 'HH', name: 'Households served', unit: 'households' }, { code: 'TR', name: 'Trees planted', unit: 'trees' }] }).expect(201)).body;
    expect(fw.code).toBe('CR');
    await post('principal', '/v1/impact/frameworks', { code: 'CR', name: 'Dup', indicators: [{ code: 'A', name: 'a' }] }).expect(409);
    await post('teacher', '/v1/impact/frameworks', { code: 'XX', name: 'No', indicators: [{ code: 'A', name: 'a' }] }).expect(403);
    await post('teacher', '/v1/impact/records', { frameworkId: fw.id, indicatorCode: 'ZZ', subjectKind: 'project', quantity: 1, recordedOn: '2026-10-01' }).expect(409);
    await post('teacher', '/v1/impact/records', { frameworkId: fw.id, indicatorCode: 'HH', subjectKind: 'project', subjectRef: ids.project, quantity: 40, recordedOn: '2026-10-01' }).expect(201);
    await post('teacher', '/v1/impact/records', { frameworkId: fw.id, indicatorCode: 'HH', subjectKind: 'event', quantity: 25, recordedOn: '2026-10-05' }).expect(201);
    const d = (await get('teacher', `/v1/impact/frameworks/${fw.id}/dashboard`).expect(200)).body;
    const hh = d.indicators.find((i: { code: string }) => i.code === 'HH');
    expect(hh).toMatchObject({ total: 65, records: 2, bySource: { project: 40, event: 25 } });
    expect(d.indicators.find((i: { code: string }) => i.code === 'TR')).toMatchObject({ total: 0, records: 0 });
    await get('student', '/v1/impact/frameworks').expect(403);
  });

  it('groups the passport by knowledge, skill, attitude, leadership and communication', async () => {
    const lead = (await post('principal', '/v1/skills', { code: 'LEAD2', name: 'Leading teams', category: 'leadership' }).expect(201)).body;
    const know = (await post('principal', '/v1/skills', { code: 'LAW', name: 'Company law', category: 'knowledge' }).expect(201)).body;
    await post('teacher', `/v1/skills/${lead.id}/evidence`, { studentId: ids.me, level: 4, title: 'Led capstone team' }).expect(201);
    await post('teacher', `/v1/skills/${know.id}/evidence`, { studentId: ids.me, level: 2, title: 'Quiz' }).expect(201);
    const pass = (await get('student', '/v1/passport/me').expect(200)).body;
    expect(pass.ksa).toEqual(expect.arrayContaining([{ category: 'leadership', skills: 1, averageLevel: 4 }, { category: 'knowledge', skills: 1, averageLevel: 2 }]));
  });
});

