import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('question bank and question paper engine', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-11-02T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const cos: string[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const pdfOf = (who: string, url: string) =>
    get(who, url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@qb.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hod = await addUser('Hari Hod', 'hod');
    const [set] = await db.insert(s.coSets).values({ tenantId: t.tenantId, subjectId: t.subject.id, version: 1, status: 'active', createdBy: t.principal.id }).returning();
    for (const [i, code] of ['CO1', 'CO2', 'CO3'].entries()) {
      const [co] = await db.insert(s.courseOutcomes).values({ tenantId: t.tenantId, coSetId: set.id, code, statement: `Outcome ${code}`, ord: i }).returning();
      cos.push(co.id);
    }
    // A bank of approved questions: 16 of 2 marks and 8 of 5 marks, spread over Bloom levels, difficulty and outcomes.
    const bloom = ['remember', 'understand', 'apply', 'analyze'];
    const diff = ['easy', 'medium', 'hard'];
    const rows = Array.from({ length: 24 }, (_, i) => ({
      tenantId: t.tenantId,
      subjectId: t.subject.id,
      topic: `Topic ${i % 4}`,
      coId: cos[i % 3],
      bloom: bloom[i % 4],
      difficulty: diff[i % 3],
      marks: i < 16 ? 2 : 5,
      type: i < 16 ? 'short' : 'long',
      text: `Explain concept number ${i} of corporate accounting with the zebra${i} ledger treatment`,
      answer: `Answer ${i}`,
      status: 'approved',
      authorId: t.teacher.id,
    }));
    await db.insert(s.qbQuestions).values(rows);

    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      hod: await login(t.slug, hod.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    ids.hod = hod.id;
    ids.teacher = t.teacher.id;
    ids.teacher2 = t.teacher2.id;
    ids.principal = t.principal.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  const mcq = (over: object = {}) => ({
    subjectId: t.subject.id,
    topic: 'Debentures',
    unit: 'Unit 2',
    coId: cos[0],
    bloom: 'understand',
    difficulty: 'easy',
    marks: 1,
    type: 'mcq',
    text: 'Which account is credited when debentures are issued at a discount?',
    options: [{ text: 'Debenture account', correct: true }, { text: 'Cash account', correct: false }],
    answer: 'Debenture account',
    ...over,
  });

  it('moves a question draft to reviewed to approved, never by its own author, and versions every edit', async () => {
    await post('student', '/v1/question-bank/questions', mcq()).expect(403);
    await post('teacher', '/v1/question-bank/questions', mcq({ options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] })).expect(400);
    await post('teacher', '/v1/question-bank/questions', mcq({ coId: '00000000-0000-4000-8000-000000000000' })).expect(400);
    const q = (await post('teacher', '/v1/question-bank/questions', mcq()).expect(201)).body;
    expect(q).toMatchObject({ status: 'draft', version: 1, authorId: ids.teacher });
    ids.q = q.id;

    // Near-identical wording is refused unless the author insists.
    const dup = await post('teacher2', '/v1/question-bank/questions', mcq({ text: 'Which account is credited when debentures are issued at a discount ?' })).expect(409);
    expect(dup.body.code).toBe('QB_DUPLICATE');
    expect(dup.body.duplicates[0].id).toBe(q.id);

    await post('teacher', `/v1/question-bank/questions/${q.id}/review`).expect(403);
    await post('principal', `/v1/question-bank/questions/${q.id}/approve`).expect(409);
    const reviewed = (await post('teacher2', `/v1/question-bank/questions/${q.id}/review`).expect(200)).body;
    expect(reviewed).toMatchObject({ status: 'reviewed', reviewedBy: ids.teacher2 });
    await post('teacher2', `/v1/question-bank/questions/${q.id}/review`).expect(409);
    await post('teacher', `/v1/question-bank/questions/${q.id}/approve`).expect(403);
    // Teachers cannot approve; exam staff can, but the author cannot approve their own.
    await post('teacher2', `/v1/question-bank/questions/${q.id}/approve`).expect(403);
    const approved = (await post('principal', `/v1/question-bank/questions/${q.id}/approve`).expect(200)).body;
    expect(approved).toMatchObject({ status: 'approved', approvedBy: ids.principal });

    // Principal authors a question: they cannot approve it themselves.
    const own = (await post('principal', '/v1/question-bank/questions', mcq({ text: 'State the journal entry for forfeiture of shares issued at a premium', topic: 'Shares' })).expect(201)).body;
    await post('teacher2', `/v1/question-bank/questions/${own.id}/review`).expect(200);
    await post('principal', `/v1/question-bank/questions/${own.id}/approve`).expect(403);
    await post('hod', `/v1/question-bank/questions/${own.id}/approve`).expect(200);

    // An edit sends it back to draft, bumps the version and keeps the old wording.
    await http().patch(`/v1/question-bank/questions/${q.id}`).set(auth('teacher')).send({ ...mcq({ marks: 2 }), version: 7 }).expect(409);
    const edited = (await http().patch(`/v1/question-bank/questions/${q.id}`).set(auth('teacher')).send({ ...mcq({ marks: 2, difficulty: 'medium' }), version: 1 }).expect(200)).body;
    expect(edited).toMatchObject({ version: 2, status: 'draft', reviewedBy: null, approvedBy: null, marks: 2 });
    await http().patch(`/v1/question-bank/questions/${q.id}`).set(auth('teacher2')).send(mcq()).expect(403);
    const detail = (await get('teacher', `/v1/question-bank/questions/${q.id}`).expect(200)).body;
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]).toMatchObject({ version: 1 });
    expect(detail.versions[0].snapshot).toMatchObject({ marks: 1, status: 'approved' });
    expect(detail.coCode).toBe('CO1');
  });

  it('shows past-paper frequency and paper usage for a question', async () => {
    await db.insert(s.pastExamQuestions).values([
      { tenantId: t.tenantId, subjectId: t.subject.id, question: 'Explain concept number 3 of corporate accounting with the zebra3 ledger treatment', exam: 'Annual', year: 2023 },
      { tenantId: t.tenantId, subjectId: t.subject.id, question: 'Explain concept number 3 of corporate accounting with the zebra3 ledger treatment', exam: 'Annual', year: 2024 },
    ]);
    const list = (await get('teacher', `/v1/question-bank/questions?subjectId=${t.subject.id}&status=approved`).expect(200)).body as { text: string; important: boolean; examFrequency: { count: number } | null; usedCount: number }[];
    const hit = list.find((x) => x.text.includes('number 3 '));
    expect(hit).toMatchObject({ important: true, usedCount: 0 });
    expect(hit!.examFrequency!.count).toBe(2);
    expect(list.find((x) => x.text.includes('forfeiture'))!.examFrequency).toBeNull();
  });

  const blueprint = () => ({
    subjectId: t.subject.id,
    title: 'Internal test blueprint',
    totalMarks: 18,
    durationMinutes: 90,
    sections: [
      { name: 'Section A', count: 4, questionMarks: 2, type: 'short', bloom: { remember: 1, apply: 1 }, difficulty: { easy: 1, hard: 1 }, coverage: [cos[0], cos[1]] },
      { name: 'Section B', count: 2, questionMarks: 5, bloom: { analyze: 1 }, coverage: [cos[2]] },
    ],
  });

  it('rejects an inconsistent blueprint', async () => {
    await post('teacher', '/v1/question-bank/blueprints', { ...blueprint(), totalMarks: 20 }).expect(400);
    const bad = blueprint();
    bad.sections[0].bloom = { remember: 3, apply: 3 };
    await post('teacher', '/v1/question-bank/blueprints', bad).expect(400);
    await post('student', '/v1/question-bank/blueprints', blueprint()).expect(403);
    ids.bp = (await post('teacher', '/v1/question-bank/blueprints', blueprint()).expect(201)).body.id;
  });

  it('generates a paper that meets the blueprint counts, repeatably, avoiding recent papers', async () => {
    const p1 = (await post('teacher', '/v1/question-bank/papers', { blueprintId: ids.bp, title: 'Paper one', seed: 'alpha' }).expect(201)).body;
    const d1 = (await get('teacher', `/v1/question-bank/papers/${p1.id}`).expect(200)).body;
    expect(d1.totalMarks).toBe(18);
    expect(d1.items).toHaveLength(6);
    const a = d1.items.filter((i: { section: number }) => i.section === 0);
    const b = d1.items.filter((i: { section: number }) => i.section === 1);
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(2);
    const count = (rows: { snapshot: Record<string, unknown> }[], key: string, v: string) => rows.filter((r) => r.snapshot[key] === v).length;
    expect(count(a, 'bloom', 'remember')).toBe(1);
    expect(count(a, 'bloom', 'apply')).toBe(1);
    expect(count(a, 'difficulty', 'easy')).toBe(1);
    expect(count(a, 'difficulty', 'hard')).toBe(1);
    expect(new Set(a.map((r: { snapshot: { coId: string } }) => r.snapshot.coId))).toEqual(expect.objectContaining(new Set([cos[0], cos[1]])));
    expect(count(b, 'bloom', 'analyze')).toBe(1);
    expect(b.some((r: { snapshot: { coId: string } }) => r.snapshot.coId === cos[2])).toBe(true);
    expect(a.every((r: { marks: number }) => r.marks === 2)).toBe(true);
    expect(d1.repeats).toBe(0);
    expect(new Set(d1.items.map((i: { questionId: string }) => i.questionId)).size).toBe(6);

    // Same seed on a fresh subject history gives the same questions; the next paper avoids this one's.
    const p2 = (await post('teacher', '/v1/question-bank/papers', { blueprintId: ids.bp, title: 'Paper two', seed: 'alpha', avoidLast: 3 }).expect(201)).body;
    const d2 = (await get('teacher', `/v1/question-bank/papers/${p2.id}`).expect(200)).body;
    const first = new Set(d1.items.map((i: { questionId: string }) => i.questionId));
    expect(d2.repeats).toBe(0);
    expect(d2.items.some((i: { questionId: string }) => first.has(i.questionId))).toBe(false);
    const p3 = (await post('teacher', '/v1/question-bank/papers', { blueprintId: ids.bp, title: 'Paper three', seed: 'alpha', avoidLast: 0 }).expect(201)).body;
    const d3 = (await get('teacher', `/v1/question-bank/papers/${p3.id}`).expect(200)).body;
    expect(d3.items.map((i: { questionId: string }) => i.questionId)).toEqual(d1.items.map((i: { questionId: string }) => i.questionId));
    ids.p = p1.id;

    // A blueprint the bank cannot meet is refused with the reason.
    const hard = blueprint();
    hard.sections[1].bloom = { create: 1 } as never;
    const bp2 = (await post('teacher', '/v1/question-bank/blueprints', hard).expect(201)).body;
    const fail = await post('teacher', '/v1/question-bank/papers', { blueprintId: bp2.id, title: 'Impossible' }).expect(422);
    expect(fail.body.message).toContain('create');
    // The failed attempt left nothing behind.
    const papers = (await get('principal', '/v1/question-bank/papers').expect(200)).body as { title: string }[];
    expect(papers.map((x) => x.title)).not.toContain('Impossible');

    // Used questions now show their usage.
    const used = (await get('teacher', `/v1/question-bank/questions/${d1.items[0].questionId}`).expect(200)).body;
    expect(used.usedCount).toBeGreaterThanOrEqual(1);
  });

  it('runs scrutiny: the moderator approves or returns, and the setter cannot moderate', async () => {
    await post('teacher', `/v1/question-bank/papers/${ids.p}/submit`, { moderatorId: ids.teacher }).expect(400);
    await post('teacher', `/v1/question-bank/papers/${ids.p}/submit`, { moderatorId: t.studentUser.id }).expect(400);
    await post('teacher2', `/v1/question-bank/papers/${ids.p}/submit`, { moderatorId: ids.hod }).expect(404);
    await post('teacher', `/v1/question-bank/papers/${ids.p}/lock`).expect(403);
    await post('teacher', `/v1/question-bank/papers/${ids.p}/submit`, { moderatorId: ids.hod }).expect(200);
    // Frozen while with the moderator.
    await post('teacher', `/v1/question-bank/papers/${ids.p}/regenerate`).expect(409);
    await post('principal', `/v1/question-bank/papers/${ids.p}/scrutiny`, { decision: 'approve' }).expect(403);
    await post('hod', `/v1/question-bank/papers/${ids.p}/scrutiny`, { decision: 'return' }).expect(400);
    const returned = (await post('hod', `/v1/question-bank/papers/${ids.p}/scrutiny`, { decision: 'return', remarks: 'Section B is too easy' }).expect(200)).body;
    expect(returned).toMatchObject({ status: 'returned', remarks: 'Section B is too easy' });
    await post('hod', `/v1/question-bank/papers/${ids.p}/scrutiny`, { decision: 'approve' }).expect(409);
    await post('principal', `/v1/question-bank/papers/${ids.p}/lock`).expect(409);
    const again = (await post('teacher', `/v1/question-bank/papers/${ids.p}/regenerate`, { seed: 'beta' }).expect(200)).body;
    expect(again).toMatchObject({ status: 'draft', seed: 'beta', remarks: null });
    await post('teacher', `/v1/question-bank/papers/${ids.p}/submit`, { moderatorId: ids.hod }).expect(200);
    const ok = (await post('hod', `/v1/question-bank/papers/${ids.p}/scrutiny`, { decision: 'approve' }).expect(200)).body;
    expect(ok.status).toBe('approved');
    // Not printable until locked.
    await get('teacher', `/v1/question-bank/papers/${ids.p}/paper.pdf`).expect(409);
    const locked = (await post('principal', `/v1/question-bank/papers/${ids.p}/lock`).expect(200)).body;
    expect(locked).toMatchObject({ status: 'locked', lockedBy: ids.principal });
    expect(new Date(locked.lockedAt).toISOString()).toBe('2026-11-02T04:30:00.000Z');
    await post('teacher', `/v1/question-bank/papers/${ids.p}/regenerate`).expect(409);
  });

  it('prints the paper and a separate answer key, only for exam staff and the setter and moderator, and audits each download', async () => {
    const paper = await pdfOf('teacher', `/v1/question-bank/papers/${ids.p}/paper.pdf`).expect(200);
    expect(paper.headers['content-type']).toContain('application/pdf');
    expect(paper.headers['content-disposition']).toContain('question-paper-BCOM-3.1-Paper-one.pdf');
    const text = (paper.body as Buffer).toString('latin1');
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).toContain('Section A');
    expect(text).toContain('Maximum marks: 18');
    expect(text).not.toContain('Answer ');
    expect(text).not.toContain('ANSWER KEY');
    const key = (await pdfOf('hod', `/v1/question-bank/papers/${ids.p}/answer-key.pdf`).expect(200)).body as Buffer;
    const keyText = key.toString('latin1');
    expect(keyText).toContain('ANSWER KEY');
    expect(keyText).toContain('Answer: Answer ');
    await pdfOf('principal', `/v1/question-bank/papers/${ids.p}/paper.pdf`).expect(200);

    // Another teacher, a student and another institution cannot see the paper at all.
    await get('teacher2', `/v1/question-bank/papers/${ids.p}`).expect(404);
    await get('teacher2', `/v1/question-bank/papers/${ids.p}/paper.pdf`).expect(404);
    await get('teacher2', `/v1/question-bank/papers/${ids.p}/answer-key.pdf`).expect(404);
    await get('student', `/v1/question-bank/papers/${ids.p}/paper.pdf`).expect(403);
    await get('outsider', `/v1/question-bank/papers/${ids.p}`).expect(404);
    expect(((await get('teacher2', '/v1/question-bank/papers').expect(200)).body as unknown[]).length).toBe(0);
    expect(((await get('hod', '/v1/question-bank/papers').expect(200)).body as unknown[]).length).toBeGreaterThanOrEqual(3);

    const logs = await db.select().from(s.auditLog);
    const mine = logs.filter((l) => l.subjectId === ids.p);
    expect(mine.filter((l) => l.action === 'qb.paper.downloaded').map((l) => l.actorId).sort()).toEqual([ids.principal, ids.teacher].sort());
    expect(mine.filter((l) => l.action === 'qb.paper.key_downloaded').map((l) => l.actorId)).toEqual([ids.hod]);
    expect(mine.some((l) => l.action === 'qb.paper.locked')).toBe(true);
  });

  it('keeps a locked paper unchanged when a question is edited afterwards', async () => {
    const before = (await get('teacher', `/v1/question-bank/papers/${ids.p}`).expect(200)).body;
    const target = before.items[0];
    const q = (await get('teacher', `/v1/question-bank/questions/${target.questionId}`).expect(200)).body;
    await http().patch(`/v1/question-bank/questions/${q.id}`).set(auth('principal')).send({ topic: q.topic, bloom: q.bloom, difficulty: q.difficulty, marks: q.marks, type: q.type, text: `${q.text} (reworded in a quite different way altogether)`, options: [], answer: 'new' }).expect(200);
    const after = (await get('teacher', `/v1/question-bank/papers/${ids.p}`).expect(200)).body;
    expect(after.items[0].snapshot.text).toBe(target.snapshot.text);
  });
});
