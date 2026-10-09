import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { averageTotal, pairPeers } from '../src/homework/peer-review.logic.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('pairing rules', () => {
  it('gives every work two other reviewers and every student two works to review', () => {
    const pairs = pairPeers(['a', 'b', 'c', 'd']);
    expect(pairs).toHaveLength(8);
    expect(pairs.some((x) => x.authorId === x.reviewerId)).toBe(false);
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(pairs.filter((x) => x.authorId === id)).toHaveLength(2);
      expect(pairs.filter((x) => x.reviewerId === id)).toHaveLength(2);
    }
  });
  it('copes with small classes and averages the rubric totals', () => {
    expect(pairPeers(['a'])).toEqual([]);
    expect(pairPeers(['a', 'b'])).toHaveLength(2);
    expect(averageTotal([])).toBeNull();
    expect(averageTotal([{ clarity: 5, accuracy: 4, effort: 3 }, { clarity: 3, accuracy: 3, effort: 3 }])).toBe(10.5);
  });
});

describe('homework peer review', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  let hwId = '';
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    // Students A and B get their own logins too (C already has one).
    const mk = async (i: number) => {
      const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: `Peer ${i}`, email: `peer${i}-${t.slug}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
      await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role: 'student' });
      await db.update(s.students).set({ userId: u.id }).where(eq(s.students.id, t.students[i].id));
      return u;
    };
    const ua = await mk(0);
    const ub = await mk(1);
    const [hw] = await db.insert(s.homework).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, createdBy: t.teacher.id, title: 'Goodwill essay', dueOn: '2026-10-25' }).returning();
    hwId = hw.id;
    await db.insert(s.homeworkSubmissions).values(
      t.students.map((st, i) => ({ tenantId: t.tenantId, homeworkId: hw.id, studentId: st.id, text: `Answer ${i + 1}`, status: 'submitted' as const, submittedBy: t.teacher.id, submittedAt: new Date('2026-10-20T05:00:00Z') })),
    );
    app = await createApp(clock);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.a = await login(t.slug, ua.email!);
    tokens.b = await login(t.slug, ub.email!);
    tokens.c = await login(t.slug, t.studentUser.email!);
    tokens.otherTeacher = await login(other.slug, other.teacher.email!);
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('only staff who teach the class can assign reviewers', async () => {
    await http().post(`/v1/homework/${hwId}/peer-review/assign`).set(auth('a')).expect(403);
    await http().post(`/v1/homework/${hwId}/peer-review/assign`).set(auth('otherTeacher')).expect(404);
  });

  it('assigns two anonymous peers to each work, once', async () => {
    const r = await http().post(`/v1/homework/${hwId}/peer-review/assign`).set(auth('teacher')).expect(200);
    expect(r.body).toEqual({ assigned: 6, total: 6 });
    const again = await http().post(`/v1/homework/${hwId}/peer-review/assign`).set(auth('teacher')).expect(200);
    expect(again.body.assigned).toBe(0);
    const mine = (await get('a', `/v1/homework/${hwId}/peer-review/mine`).expect(200)).body;
    expect(mine).toHaveLength(2);
    expect(mine.map((m: { label: string }) => m.label)).toEqual(['A', 'B']);
    expect(JSON.stringify(mine)).not.toMatch(/Student|Peer/);
    expect(mine.every((m: { text: string; done: boolean }) => /^Answer \d$/.test(m.text) && !m.done)).toBe(true);
  });

  it('a reviewer scores with the rubric; the author sees it without a name', async () => {
    const mine = (await get('a', `/v1/homework/${hwId}/peer-review/mine`).expect(200)).body;
    await http().put(`/v1/homework/${hwId}/peer-review/${mine[0].id}`).set(auth('a')).send({ clarity: 6, accuracy: 4, effort: 4, comment: 'Good' }).expect(400);
    await http().put(`/v1/homework/${hwId}/peer-review/${mine[0].id}`).set(auth('a')).send({ clarity: 5, accuracy: 4, effort: 3, comment: 'Clear and tidy' }).expect(200);
    await http().put(`/v1/homework/${hwId}/peer-review/${mine[0].id}`).set(auth('b')).send({ clarity: 5, accuracy: 4, effort: 3, comment: 'Not mine' }).expect(404);
    const again = (await get('a', `/v1/homework/${hwId}/peer-review/mine`).expect(200)).body;
    expect(again[0].done).toBe(true);
    expect(again[0].comment).toBe('Clear and tidy');

    // Whoever wrote the reviewed work now sees the scores, anonymously.
    let seen = 0;
    for (const who of ['a', 'b', 'c']) {
      const rec = (await get(who, `/v1/homework/${hwId}/peer-review/received`).expect(200)).body;
      if (rec.reviews.length) {
        seen++;
        expect(rec.reviews[0]).toEqual({ rubric: { clarity: 5, accuracy: 4, effort: 3 }, total: 12, comment: 'Clear and tidy' });
        expect(rec.average).toBe(12);
        expect(rec.pending).toBe(1);
      }
    }
    expect(seen).toBe(1);
  });

  it('the teacher sees names, scores and averages', async () => {
    const all = (await get('teacher', `/v1/homework/${hwId}/peer-review`).expect(200)).body;
    expect(all.reviews).toHaveLength(6);
    const done = all.reviews.filter((r: { done: boolean }) => r.done);
    expect(done).toHaveLength(1);
    expect(done[0].author).toMatch(/Student|Peer/);
    expect(done[0].reviewer).toMatch(/Student|Peer/);
    expect(done[0].total).toBe(12);
    expect(all.authors).toHaveLength(3);
    expect(all.authors.filter((a: { average: number | null }) => a.average === 12)).toHaveLength(1);
    await get('b', `/v1/homework/${hwId}/peer-review`).expect(403);
  });
});
