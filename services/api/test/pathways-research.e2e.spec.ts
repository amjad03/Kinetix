import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { fromCrossref, DoiResolver } from '../src/research/doi.js';
import { canMoveThesis, hasCapacity, internalSimilarity, shingles } from '../src/research/thesis-rules.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const BASE =
  'The study examines how small village shops keep their books and why many abandon bookkeeping after the first year. We surveyed forty shopkeepers across six villages, recorded their daily sales and expenses for ninety days, and compared the records with bank deposits. Findings show that simple ledgers on a phone halve the missing entries and that training in two short sessions is enough to sustain the habit.';

describe('thesis rules', () => {
  it('moves one stage forward, or back to draft for revision', () => {
    expect(canMoveThesis('synopsis', 'draft')).toBe(true);
    expect(canMoveThesis('draft', 'examination')).toBe(false);
    expect(canMoveThesis('viva', 'draft')).toBe(true);
    expect(canMoveThesis('awarded', 'viva')).toBe(false);
    expect(canMoveThesis('draft', 'nonsense')).toBe(false);
  });

  it('measures how much of a thesis appears in others', () => {
    expect(shingles('a b c d e f', 5).size).toBe(2);
    const own = `${BASE} Our recommendations for training follow.`;
    const r = internalSimilarity(own, [{ id: 'x', title: 'Earlier thesis', text: BASE }, { id: 'y', title: 'Unrelated', text: 'Completely different words about astronomy and telescopes in the hills of the south region today' }]);
    expect(r.scorePercent).toBeGreaterThan(80);
    expect(r.matches[0]).toMatchObject({ thesisId: 'x' });
    expect(r.matches).toHaveLength(1);
    expect(internalSimilarity('too short', [])).toEqual({ scorePercent: 0, matches: [] });
  });

  it('limits supervisors to their cap', () => {
    expect(hasCapacity(7, 8)).toBe(true);
    expect(hasCapacity(8, 8)).toBe(false);
  });

  it('reads a Crossref work into a publication', () => {
    expect(fromCrossref({ title: ['A paper'], 'container-title': ['Journal of Things'], type: 'journal-article', ISSN: ['bad', '1234-5678'], author: [{ given: 'Asha', family: 'Rao' }, { name: 'Lab Group' }], issued: { 'date-parts': [[2024, 3]] } })).toEqual({
      title: 'A paper',
      venue: 'Journal of Things',
      year: 2024,
      kind: 'journal',
      issn: '1234-5678',
      authors: [{ name: 'Asha Rao' }, { name: 'Lab Group' }],
    });
    expect(fromCrossref({ title: ['No year'] })).toBeNull();
  });
});

describe('research: supervisors, thesis, viva, datasets, DOI import, research office', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const R = '/v1/research';
  const known: Record<string, unknown> = { '10.1000/abc': { title: 'Ledgers on phones', venue: 'Journal of Rural Finance', year: 2025, kind: 'journal', issn: '1234-5678', authors: [{ name: 'A. Teacher' }] } };
  let registryDown = false;

  beforeAll(async () => {
    t = await createTenant(owner);
    const [coord] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Rhea Research', email: 'rhea@rs.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: coord.id, role: 'research_coordinator' });
    app = await createApp(clock, (b) =>
      b.overrideProvider(DoiResolver).useValue({
        resolve: async (doi: string) => {
          if (registryDown) throw new Error('down');
          return (known[doi] as never) ?? null;
        },
      }),
    );
    tokens = {
      coord: await login(t.slug, coord.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
    };
    for (const [n, who] of [['one', 'Scholar One'], ['two', 'Scholar Two'], ['three', 'Scholar Three']] as const) {
      ids[n] = (await post('coord', `${R}/scholars`, { fullName: who, programme: 'phd', supervisorUserId: t.teacher.id, enrolledOn: '2026-07-01' }).expect(201)).body.id;
    }
    // Scholar Two is the student with a login, so they can read their own thesis.
    await owner.query('update research_scholars set student_id = $1 where id = $2', [t.students[2].id, ids.two]);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('allocates supervisors within their cap and keeps the history', async () => {
    const list = (await get('coord', `${R}/supervisors`).expect(200)).body;
    expect(list.find((x: { userId: string }) => x.userId === t.teacher.id)).toMatchObject({ load: 3, maxScholars: 8, available: 5 });
    await put('teacher', `${R}/supervisors/${t.teacher2.id}`, { maxScholars: 1 }).expect(403);
    await put('coord', `${R}/supervisors/${t.teacher2.id}`, { maxScholars: 1, areas: ['rural finance'] }).expect(200);
    await put('coord', `${R}/supervisors/${t.students[0].id}`, { maxScholars: 1 }).expect(409);
    await post('coord', `${R}/scholars/${ids.one}/allocate`, { supervisorUserId: t.teacher2.id, reason: 'Matches area' }).expect(200);
    const err = (await post('coord', `${R}/scholars/${ids.three}/allocate`, { supervisorUserId: t.teacher2.id }).expect(409)).body;
    expect(JSON.stringify(err)).toContain('already has 1');
    await post('coord', `${R}/scholars/${ids.one}/allocate`, { supervisorUserId: t.teacher2.id }).expect(409);
    await post('coord', `${R}/scholars/${ids.three}/allocate`, { supervisorUserId: t.teacher2.id, role: 'co_supervisor' }).expect(200);
    const hist = (await get('coord', `${R}/scholars/${ids.one}/allocations`).expect(200)).body;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ supervisor: t.teacher2.fullName, role: 'supervisor', endedOn: null });
    expect(await owner.query('select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and title = $3', [t.tenantId, t.teacher2.id, 'New research scholar']).then((r) => r.rows[0].n)).toBe(2);
  });

  it('takes a thesis from synopsis to award, with examiners, an originality check and a viva', async () => {
    // Scholar Two (supervisor: teacher) writes first; Scholar One (now with teacher2) copies much of it.
    const a = (await post('teacher', `${R}/scholars/${ids.two}/thesis`, { title: 'Bookkeeping habits of village shops', abstract: 'A field study' }).expect(201)).body;
    await post('teacher', `${R}/scholars/${ids.two}/thesis`, { title: 'again' }).expect(409);
    await post('teacher2', `${R}/scholars/${ids.two}/thesis`, { title: 'not mine' }).expect(404);
    await owner.query(`update thesis_records set content_text = $1 where id = $2`, [BASE, a.id]);
    const b = (await post('teacher2', `${R}/scholars/${ids.one}/thesis`, { title: 'Phone ledgers in rural retail' }).expect(201)).body;
    await put('teacher2', `${R}/theses/${b.id}`, { contentText: `${BASE} We also propose a two session training plan for every village panchayat office to adopt.` }).expect(200);
    await post('teacher2', `${R}/theses/${b.id}/stage`, { to: 'examination' }).expect(409);
    await post('teacher2', `${R}/theses/${b.id}/stage`, { to: 'draft' }).expect(200);
    await post('teacher', `${R}/theses/${b.id}/stage`, { to: 'submitted' }).expect(404);
    await post('teacher2', `${R}/theses/${b.id}/stage`, { to: 'submitted', note: 'Submitted to the office' }).expect(200);
    expect((await owner.query('select status from research_scholars where id = $1', [ids.one])).rows[0].status).toBe('thesis_submitted');
    await put('teacher2', `${R}/theses/${b.id}`, { title: 'Late edit' }).expect(409);
    // Examination needs examiners and a similarity check inside the limit (or the office's reasoned override).
    await post('coord', `${R}/theses/${b.id}/stage`, { to: 'examination' }).expect(409);
    await put('coord', `${R}/theses/${b.id}/examiners`, { examiners: [{ name: 'Prof. Iyer', affiliation: 'IIM Bangalore' }, { name: 'Dr. Menon', affiliation: 'Kerala University' }] }).expect(200);
    await post('coord', `${R}/theses/${b.id}/stage`, { to: 'examination' }).expect(409);
    const check = (await post('coord', `${R}/theses/${b.id}/similarity`).expect(200)).body;
    expect(check).toMatchObject({ engine: 'internal', withinLimit: false, limitPercent: 25 });
    expect(check.scorePercent).toBeGreaterThan(60);
    expect(check.matches[0].title).toBe('Bookkeeping habits of village shops');
    await post('coord', `${R}/theses/${b.id}/stage`, { to: 'examination' }).expect(409);
    await post('coord', `${R}/theses/${b.id}/stage`, { to: 'examination', overrideSimilarity: true }).expect(400);
    await post('coord', `${R}/theses/${b.id}/stage`, { to: 'examination', overrideSimilarity: true, note: 'Overlap is the shared study design chapter, cited' }).expect(200);
    // The open defence can be scheduled only at the viva stage.
    await post('coord', `${R}/theses/${b.id}/vivas`, { scheduledAt: '2026-12-01T05:00:00Z', panel: [{ name: 'Prof. Iyer', role: 'external' }] }).expect(409);
    await post('coord', `${R}/theses/${b.id}/stage`, { to: 'viva' }).expect(200);
    const v = (await post('coord', `${R}/theses/${b.id}/vivas`, { scheduledAt: '2026-12-01T05:00:00Z', venue: 'Seminar hall', panel: [{ name: 'Prof. Iyer', role: 'external' }, { name: 'Dr. Rao', role: 'supervisor' }] }).expect(201)).body;
    const done = (await post('coord', `${R}/thesis-vivas/${v.id}/result`, { outcome: 'passed', remarks: 'Defended well' }).expect(200)).body;
    expect(done).toMatchObject({ outcome: 'passed', thesisStage: 'awarded' });
    await post('coord', `${R}/thesis-vivas/${v.id}/result`, { outcome: 'passed' }).expect(409);
    expect((await owner.query('select status, completed_on from research_scholars where id = $1', [ids.one])).rows[0]).toMatchObject({ status: 'awarded' });
    const detail = (await get('teacher2', `${R}/theses/${b.id}`).expect(200)).body;
    expect(detail.events.map((e: { stage: string }) => e.stage)).toEqual(expect.arrayContaining(['synopsis', 'draft', 'submitted', 'examination', 'viva', 'awarded']));
    expect(detail.contentText).toBeUndefined();
    await get('teacher', `${R}/theses/${b.id}`).expect(404);
    // The scholar sees their own thesis in the student app.
    expect((await get('student', `${R}/theses/mine`).expect(200)).body).toMatchObject({ title: 'Bookkeeping habits of village shops', stage: 'synopsis' });
    expect((await get('coord', `${R}/theses`).expect(200)).body).toHaveLength(2);
    expect((await get('teacher', `${R}/theses`).expect(200)).body).toHaveLength(1);
  });

  it('sends a revise outcome back to draft', async () => {
    const c = (await post('coord', `${R}/scholars/${ids.three}/thesis`, { title: 'Credit use by shopkeepers' }).expect(201)).body;
    await put('coord', `${R}/theses/${c.id}`, { contentText: 'Fresh text about credit and how shopkeepers borrow from suppliers during the festival season in the plains. '.repeat(4) }).expect(200);
    for (const to of ['draft', 'submitted']) await post('coord', `${R}/theses/${c.id}/stage`, { to }).expect(200);
    await put('coord', `${R}/theses/${c.id}/examiners`, { examiners: [{ name: 'A', affiliation: 'X' }, { name: 'B', affiliation: 'Y' }] }).expect(200);
    expect((await post('coord', `${R}/theses/${c.id}/similarity`).expect(200)).body.withinLimit).toBe(true);
    for (const to of ['examination', 'viva']) await post('coord', `${R}/theses/${c.id}/stage`, { to }).expect(200);
    const v = (await post('coord', `${R}/theses/${c.id}/vivas`, { scheduledAt: '2026-12-05T05:00:00Z', panel: [{ name: 'A' }] }).expect(201)).body;
    expect((await post('coord', `${R}/thesis-vivas/${v.id}/result`, { outcome: 'revise' }).expect(200)).body.thesisStage).toBe('draft');
  });

  it('holds datasets with access rules and files', async () => {
    const open = (await post('teacher', `${R}/datasets`, { title: 'Village shop ledgers', description: 'Anonymised', access: 'open', keywords: ['bookkeeping'] }).expect(201)).body;
    const closed = (await post('teacher', `${R}/datasets`, { title: 'Interview recordings', access: 'restricted' }).expect(201)).body;
    const embargoed = (await post('teacher', `${R}/datasets`, { title: 'Pilot survey', access: 'embargoed', embargoUntil: '2027-01-01' }).expect(201)).body;
    await post('teacher', `${R}/datasets`, { title: 'No date', access: 'embargoed' }).expect(400);
    await post('teacher', `${R}/datasets`, { title: 'Bad DOI', doi: 'nope' }).expect(400);
    const csv = Buffer.from('shop,sales\nA,100\n').toString('base64');
    for (const d of [open, closed, embargoed]) await post('teacher', `${R}/datasets/${d.id}/files`, { filename: 'ledgers.csv', contentType: 'text/csv', contentBase64: csv }).expect(201);
    await post('teacher2', `${R}/datasets/${open.id}/files`, { filename: 'x.csv', contentType: 'text/csv', contentBase64: csv }).expect(404);
    const list = (await get('teacher2', `${R}/datasets`).expect(200)).body;
    expect(list.map((d: { title: string; canOpen: boolean }) => [d.title, d.canOpen]).sort()).toEqual([['Interview recordings', false], ['Pilot survey', false], ['Village shop ledgers', true]]);
    const dl = (id: string, who: string) =>
      get(who, `${R}/datasets/${id}/files/0/download`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect((await dl(open.id, 'teacher2')).status).toBe(200);
    expect(((await dl(open.id, 'teacher2')).body as Buffer).toString()).toContain('A,100');
    expect((await dl(closed.id, 'teacher2')).status).toBe(404);
    expect((await dl(closed.id, 'teacher')).status).toBe(200);
    expect((await dl(closed.id, 'coord')).status).toBe(200);
    expect((await dl(embargoed.id, 'teacher2')).status).toBe(404);
    clock.at = new Date('2027-01-02T04:30:00Z');
    expect((await dl(embargoed.id, 'teacher2')).status).toBe(200);
    clock.at = new Date('2026-10-20T04:30:00Z');
    await http().delete(`${R}/datasets/${closed.id}`).set(auth('teacher2')).expect(404);
    await http().delete(`${R}/datasets/${closed.id}`).set(auth('teacher')).expect(204);
  });

  it('imports a publication from its DOI', async () => {
    const p = (await post('teacher', `${R}/publications/import-doi`, { doi: 'https://doi.org/10.1000/abc' }).expect(201)).body;
    expect(p).toMatchObject({ title: 'Ledgers on phones', venue: 'Journal of Rural Finance', year: 2025, doi: '10.1000/abc', ownerUserId: t.teacher.id });
    await post('teacher', `${R}/publications/import-doi`, { doi: '10.1000/abc' }).expect(409);
    await post('teacher', `${R}/publications/import-doi`, { doi: '10.1000/unknown' }).expect(404);
    await post('teacher', `${R}/publications/import-doi`, { doi: 'not a doi at all' }).expect(400);
    registryDown = true;
    await post('teacher', `${R}/publications/import-doi`, { doi: '10.1000/other1' }).expect(502);
    registryDown = false;
    await post('student', `${R}/publications/import-doi`, { doi: '10.1000/abc' }).expect(403);
  });

  it('gives the research office one view across departments', async () => {
    const o = (await get('coord', `${R}/office/summary`).expect(200)).body;
    expect(o.totals).toMatchObject({ publications: 1, datasets: 2, scholars: 2 });
    expect(o.scholarsByStatus).toEqual(expect.arrayContaining([{ status: 'awarded', n: 1 }]));
    expect(o.thesesByStage).toEqual(expect.arrayContaining([{ stage: 'awarded', n: 1 }, { stage: 'draft', n: 1 }]));
    expect(o.publicationsByYear[0]).toEqual({ year: 2025, n: 1 });
    expect(o.supervisorLoad.length).toBeGreaterThan(0);
    await get('teacher', `${R}/office/summary`).expect(403);
  });
});
