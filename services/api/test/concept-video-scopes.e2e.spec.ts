import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { YouTube } from '../src/platform/youtube.js';
import { createApp, createTenant, env, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/** YouTube answers oEmbed with the title the test sets. */
let oembedTitle = 'Title from YouTube';
const fakeFetch = (async (input: string | URL) => {
  if (!String(input).startsWith('https://www.youtube.com/oembed')) throw new TypeError('fetch failed');
  return new Response(JSON.stringify({ title: oembedTitle, author_name: 'Some channel' }), { headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const VID = (n: number) => `vid${String(n).padStart(8, '0')}`;
const link = (n: number) => `https://youtu.be/${VID(n)}`;

describe('concept video scopes: platform, institution, teacher', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 2 });
  const appDb = drizzle(appPool, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let topicId: string;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const listed = async (who: string, id = topicId) => (await http().get(`/v1/content/topics/${id}/videos`).set(auth(who)).expect(200)).body.videos as { youtubeVideoId: string; source: string; title: string }[];
  const ids = async (who: string) => (await listed(who)).map((v) => `${v.source}:${v.youtubeVideoId}`);
  const add = (who: string, body: Record<string, unknown>) => http().post(`/v1/content/topics/${topicId}/videos`).set(auth(who)).send(body);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    // A topic of a course the other specs leave alone (they share this database), so the platform video below is the only one.
    const [row] = await db
      .select({ id: s.topics.id })
      .from(s.topics)
      .innerJoin(s.chapters, eq(s.chapters.id, s.topics.chapterId))
      .innerJoin(s.courses, eq(s.courses.id, s.chapters.courseId))
      .where(sql`${s.courses.code} <> 'bcom-3-corporate-accounting' and ${s.topics.tenantId} is null`)
      .limit(1);
    topicId = row.id;
    // teacher2 takes class B, so classes A and B each have one teacher.
    await db.insert(s.timetableSlots).values({ tenantId: t.tenantId, academicYearId: t.slot.academicYearId, sectionId: t.otherSection.id, subjectId: t.subject.id, teacherId: t.teacher2.id, dayOfWeek: 2, startsAt: '10:00', endsAt: '10:55' });
    await db.insert(s.conceptVideos).values({ topicId, youtubeVideoId: VID(1), title: 'Platform video', position: 1 });
    app = await createApp(new FixedClock(nextMondayIst('10:30')), (b) => b.overrideProvider(YouTube).useValue(new YouTube(undefined, fakeFetch)));
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      student: await login(t.slug, t.studentUser.email!),
      otherPrincipal: await login(other.slug, other.principal.email!),
      otherTeacher: await login(other.slug, other.teacher.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
    await appPool.end();
  });

  it('lets only an admin add for the institution, and only a teacher for their classes', async () => {
    await add('teacher', { url: link(2), scope: 'institution' }).expect(403);
    await add('student', { url: link(2), scope: 'teacher' }).expect(403);
    await add('principal', { url: 'https://example.com/x', scope: 'institution' }).expect(400);
    oembedTitle = 'Institution explainer';
    const r = await add('principal', { url: link(2), scope: 'institution' }).expect(201);
    expect(r.body).toMatchObject({ source: 'institution', title: 'Institution explainer', channelTitle: 'Some channel', shareStatus: 'none' });
    await add('principal', { url: link(2), scope: 'institution' }).expect(409);
  });

  it('takes the title from oEmbed for a teacher, for their own classes only', async () => {
    oembedTitle = 'Teacher pick';
    await add('teacher', { url: link(3), scope: 'teacher', sectionIds: [t.otherSection.id] }).expect(403);
    const r = await add('teacher', { url: link(3), scope: 'teacher' }).expect(201);
    expect(r.body).toMatchObject({ source: 'teacher', title: 'Teacher pick', shareStatus: 'none', sectionIds: [t.section.id] });
  });

  it('merges platform, institution and teacher videos in that order, once each, with a source', async () => {
    // The same video in all three places shows once, from the earliest source.
    await add('teacher', { url: link(1), scope: 'teacher' }).expect(201);
    await add('principal', { url: link(1), scope: 'institution' }).expect(201);
    expect(await ids('student')).toEqual([`platform:${VID(1)}`, `institution:${VID(2)}`, `teacher:${VID(3)}`]);
    await http().get(`/v1/content/topics/${topicId}/videos/mine`).set(auth('teacher')).expect(200).expect((res) => expect(res.body).toHaveLength(2));
    // Remove the duplicates again.
    for (const who of ['teacher', 'principal']) {
      const mine = (await http().get(`/v1/content/topics/${topicId}/videos/mine`).set(auth(who))).body as { id: string; youtubeVideoId: string }[];
      for (const v of mine.filter((x) => x.youtubeVideoId === VID(1))) await http().delete(`/v1/content/videos/${v.id}`).set(auth(who)).expect(204);
    }
  });

  it("shows a teacher's video only to their classes, and an institution video to the whole institution", async () => {
    expect(await ids('teacher2')).toEqual([`platform:${VID(1)}`, `institution:${VID(2)}`]);
    expect(await ids('principal')).toEqual([`platform:${VID(1)}`, `institution:${VID(2)}`]);
    expect(await ids('teacher')).toContain(`teacher:${VID(3)}`);
  });

  it("keeps one institution's videos from another", async () => {
    expect(await ids('otherTeacher')).toEqual([`platform:${VID(1)}`]);
    const [mine] = (await http().get(`/v1/content/topics/${topicId}/videos/mine`).set(auth('principal'))).body as { id: string }[];
    await http().delete(`/v1/content/videos/${mine.id}`).set(auth('otherPrincipal')).expect(404);
    await http().patch(`/v1/content/videos/${mine.id}`).set(auth('otherPrincipal')).send({ title: 'x' }).expect(404);
    // In the database, with row-level security: the other tenant sees the platform row only and cannot write ours.
    const asTenant = <T>(tenantId: string, fn: (tx: typeof appDb) => Promise<T>) =>
      appDb.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        return fn(tx as unknown as typeof appDb);
      });
    const seen = await asTenant(other.tenantId, (tx) => tx.select({ scope: s.conceptVideos.scope }).from(s.conceptVideos));
    expect(new Set(seen.map((r) => r.scope))).toEqual(new Set(['platform']));
    const ours = await asTenant(t.tenantId, (tx) => tx.select({ scope: s.conceptVideos.scope }).from(s.conceptVideos));
    expect(ours.length).toBeGreaterThan(1);
    await expect(asTenant(other.tenantId, (tx) => tx.insert(s.conceptVideos).values({ topicId, youtubeVideoId: VID(9), title: 'x', position: 1, scope: 'teacher', tenantId: t.tenantId, createdBy: other.teacher.id }))).rejects.toThrow();
    await expect(asTenant(t.tenantId, (tx) => tx.insert(s.conceptVideos).values({ topicId, youtubeVideoId: VID(9), title: 'x', position: 1, scope: 'platform' }))).rejects.toThrow();
    expect(await asTenant(other.tenantId, (tx) => tx.delete(s.conceptVideos).where(eq(s.conceptVideos.scope, 'institution')).returning())).toEqual([]);
  });

  it('does not let the app change platform videos', async () => {
    const [p] = await db.select({ id: s.conceptVideos.id }).from(s.conceptVideos).where(eq(s.conceptVideos.scope, 'platform'));
    await http().delete(`/v1/content/videos/${p.id}`).set(auth('principal')).expect(404);
    await http().patch(`/v1/content/videos/${p.id}`).set(auth('principal')).send({ title: 'x' }).expect(404);
  });

  it('keeps teachers off each other’s videos, but lets an admin remove one', async () => {
    const [v] = (await http().get(`/v1/content/topics/${topicId}/videos/mine`).set(auth('teacher'))).body as { id: string }[];
    await http().patch(`/v1/content/videos/${v.id}`).set(auth('teacher2')).send({ title: 'mine now' }).expect(403);
    await http().post(`/v1/content/videos/${v.id}/share`).set(auth('teacher2')).expect(403);
    await http().patch(`/v1/content/videos/${v.id}`).set(auth('teacher')).send({ title: 'Renamed', language: 'hi' }).expect(200).expect((r) => expect(r.body).toMatchObject({ title: 'Renamed', language: 'hi' }));
    await http().patch(`/v1/content/videos/${v.id}`).set(auth('teacher')).send({ title: 'Teacher pick', language: 'en' }).expect(200);
  });

  it('orders each scope on its own', async () => {
    oembedTitle = 'Second institution video';
    const second = await add('principal', { url: link(4), scope: 'institution' }).expect(201);
    const first = (await http().get(`/v1/content/topics/${topicId}/videos/mine`).set(auth('principal'))).body.find((v: { source: string; id: string }) => v.source === 'institution').id as string;
    await http().put(`/v1/content/topics/${topicId}/videos/order`).set(auth('teacher')).send({ scope: 'institution', ids: [second.body.id, first] }).expect(403);
    await http().put(`/v1/content/topics/${topicId}/videos/order`).set(auth('principal')).send({ scope: 'institution', ids: [first] }).expect(400);
    await http().put(`/v1/content/topics/${topicId}/videos/order`).set(auth('principal')).send({ scope: 'institution', ids: [second.body.id, first] }).expect(200);
    expect(await ids('student')).toEqual([`platform:${VID(1)}`, `institution:${VID(4)}`, `institution:${VID(2)}`, `teacher:${VID(3)}`]);
    await http().delete(`/v1/content/videos/${second.body.id}`).set(auth('principal')).expect(204);
  });

  it('shares a teacher video institution-wide only after an admin approves it, and says why when it does not', async () => {
    const [v] = (await http().get(`/v1/content/topics/${topicId}/videos/mine`).set(auth('teacher'))).body as { id: string }[];
    await http().post(`/v1/content/videos/${v.id}/approve`).set(auth('principal')).expect(409); // not asked for yet
    await http().post(`/v1/content/videos/${v.id}/share`).set(auth('teacher')).expect(200).expect((r) => expect(r.body.shareStatus).toBe('pending'));
    await http().post(`/v1/content/videos/${v.id}/share`).set(auth('teacher')).expect(409);
    expect(await ids('teacher2')).not.toContain(`teacher:${VID(3)}`); // pending is still just for class A

    // Only the school's leaders see the queue and decide on it.
    await http().get('/v1/content/video-approvals').set(auth('teacher')).expect(403);
    await http().post(`/v1/content/videos/${v.id}/approve`).set(auth('teacher')).expect(403);
    await http().get('/v1/content/video-approvals').set(auth('otherPrincipal')).expect(200).expect((r) => expect(r.body).toEqual([]));
    await http().post(`/v1/content/videos/${v.id}/approve`).set(auth('otherPrincipal')).expect(404);
    const queue = (await http().get('/v1/content/video-approvals').set(auth('principal')).expect(200)).body;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: v.id, shareStatus: 'pending', createdByName: expect.any(String), topicTitle: expect.any(String), sections: [{ displayName: 'BCom Sem 3 A' }] });

    await http().post(`/v1/content/videos/${v.id}/reject`).set(auth('principal')).send({}).expect(400);
    await http().post(`/v1/content/videos/${v.id}/reject`).set(auth('principal')).send({ reason: 'Wrong chapter' }).expect(200).expect((r) => expect(r.body).toMatchObject({ shareStatus: 'rejected', reviewReason: 'Wrong chapter' }));
    expect(await ids('teacher2')).not.toContain(`teacher:${VID(3)}`);
    expect(await ids('teacher')).toContain(`teacher:${VID(3)}`); // still theirs and their class's
    await http().get('/v1/content/video-approvals').set(auth('principal')).expect((r) => expect(r.body).toEqual([]));
    await http().get('/v1/content/video-approvals?status=rejected').set(auth('principal')).expect((r) => expect(r.body[0].reviewReason).toBe('Wrong chapter'));

    await http().post(`/v1/content/videos/${v.id}/share`).set(auth('teacher')).expect(200).expect((r) => expect(r.body).toMatchObject({ shareStatus: 'pending', reviewReason: null }));
    await http().post(`/v1/content/videos/${v.id}/approve`).set(auth('principal')).expect(200).expect((r) => expect(r.body.shareStatus).toBe('approved'));
    expect(await ids('teacher2')).toEqual([`platform:${VID(1)}`, `institution:${VID(2)}`, `teacher:${VID(3)}`]);
    expect(await ids('otherTeacher')).toEqual([`platform:${VID(1)}`]); // never leaves the institution

    const counts = (await http().get(`/v1/content/video-counts?courseId=${(await db.select({ c: s.chapters.courseId }).from(s.topics).innerJoin(s.chapters, eq(s.chapters.id, s.topics.chapterId)).where(eq(s.topics.id, topicId)))[0].c}`).set(auth('principal')).expect(200)).body;
    expect(counts).toEqual([{ topicId, institution: 1, teacher: 1, pending: 0 }]);
    await http().delete(`/v1/content/videos/${v.id}`).set(auth('principal')).expect(204); // an admin can take it down
    expect(await ids('teacher2')).toEqual([`platform:${VID(1)}`, `institution:${VID(2)}`]);
  });
});
