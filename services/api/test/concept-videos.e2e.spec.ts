import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localParts } from '../src/common/time.js';
import { addPlatformAdmin, listPlatformAdmins, parseArgs, removePlatformAdmin, UsageError } from '../src/db/platform-admin.js';
import * as s from '../src/db/schema.js';
import { YouTube } from '../src/platform/youtube.js';
import { addDays } from '../src/teacher/teacher.service.js';
import { createApp, createTenant, env, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/** YouTube as the tests want it: answers from `routes` (empty = offline). */
const routes: [string, unknown][] = [];
const fakeFetch = (async (input: string | URL) => {
  const url = String(input);
  const hit = routes.find(([prefix]) => url.startsWith(prefix));
  if (!hit) throw new TypeError('fetch failed');
  return new Response(JSON.stringify(hit[1]), { headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
const youtube = new YouTube('test-key', fakeFetch);
const oembed = (title: string) => routes.splice(0, routes.length, ['https://www.youtube.com/oembed', { title, author_name: 'KINETIX' }]);

const VID = (n: number) => `vid${String(n).padStart(8, '0')}`;

describe('concept videos', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(nextMondayIst('10:30'));
  const monday = localParts(clock.at, 'Asia/Kolkata').date;
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let kinetix: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  let course: { id: string; chapters: { id: string; title: string; topics: { id: string; title: string; videos: number }[] }[] };
  const topic = (chapter: string) => course.chapters.find((c) => c.title === chapter)!.topics[0];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) =>
    (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    kinetix = await createTenant(owner); // KINETIX's own institution, where the platform team has accounts
    const [c] = await db.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.code, 'bcom-3-corporate-accounting'));
    await db.update(s.subjects).set({ courseId: c.id }).where(eq(s.subjects.id, t.subject.id));
    await addPlatformAdmin(db, kinetix.slug, kinetix.principal.email!, 'Curriculum team');
    app = await createApp(clock, (b) => b.overrideProvider(YouTube).useValue(youtube));
    tokens = {
      platform: await login(kinetix.slug, kinetix.principal.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      student: await login(t.slug, t.studentUser.email!),
      otherTeacher: await login(other.slug, other.teacher.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    tokens.device = paired.deviceToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('lets only the KINETIX platform team in', async () => {
    expect(parseArgs(['add', '--tenant', 'kinetix', '--login', 'a@kinetix.in', '--note=Videos'])).toEqual({ command: 'add', tenant: 'kinetix', login: 'a@kinetix.in', note: 'Videos' });
    expect(parseArgs(['list'])).toEqual({ command: 'list' });
    expect(() => parseArgs(['add', '--login', 'a@kinetix.in'])).toThrow(/--tenant/);
    expect(() => parseArgs(['promote'])).toThrow(UsageError);

    expect((await http().get('/v1/me').set(auth('platform')).expect(200)).body.platformAdmin).toBe(true);
    expect((await http().get('/v1/me').set(auth('principal')).expect(200)).body).not.toHaveProperty('platformAdmin');
    expect((await http().get('/v1/platform/me').set(auth('platform')).expect(200)).body).toEqual({ platformAdmin: true, playlistImport: true });
    // An institution's principal or administrator is not the platform team.
    const denied = await http().get('/v1/platform/library').set(auth('principal')).expect(403);
    expect(denied.body.code).toBe('NOT_PLATFORM_ADMIN');
    await http().get('/v1/platform/library').set(auth('board')).expect(403);
    await http().get('/v1/platform/library').expect(401);

    // Removing someone takes effect at once (no claim in their token).
    expect((await removePlatformAdmin(db, kinetix.slug, kinetix.principal.email!)).removed).toBe(true);
    await http().get('/v1/platform/library').set(auth('platform')).expect(403);
    await addPlatformAdmin(db, kinetix.slug, kinetix.principal.email!);
    expect((await listPlatformAdmins(db)).map((r) => r.email)).toContain(kinetix.principal.email);
    await expect(addPlatformAdmin(db, kinetix.slug, 'nobody@x.in')).rejects.toThrow(/No user/);

    // The app role cannot read the team, nor write platform videos (institutions write only their own, see concept-video-scopes).
    const appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 1 });
    const appDb = drizzle(appPool, { schema: s });
    const denies = async (fn: () => Promise<unknown>) => {
      const err = await fn().then(() => null, (e: Error & { cause?: Error }) => e);
      expect(err?.cause?.message ?? err?.message).toMatch(/permission denied/);
    };
    await denies(() => appDb.select().from(s.platformAdmins));
    await denies(() => appDb.insert(s.platformAdmins).values({ userId: t.teacher.id }));
    const [anyTopic] = await db.select({ id: s.topics.id }).from(s.topics).limit(1);
    await expect(appDb.insert(s.conceptVideos).values({ topicId: anyTopic.id, youtubeVideoId: VID(0), title: 'x', position: 1 })).rejects.toThrow();
    expect(await appDb.delete(s.conceptVideos).returning()).toEqual([]);
    expect(await appDb.select().from(s.conceptVideos).limit(1)).toBeDefined();
    await appPool.end();
  });

  it('browses the global library with video counts, never an institution’s own topics', async () => {
    const library = (await http().get('/v1/platform/library').set(auth('platform')).expect(200)).body;
    const bu = library.find((c: { code: string }) => c.code === 'bu-ug');
    const ca = bu.courses.find((c: { code: string }) => c.code === 'bcom-3-corporate-accounting');
    expect(ca).toMatchObject({ term: 3, language: 'en', topics: 4 });
    course = (await http().get(`/v1/platform/library/courses/${ca.id}`).set(auth('platform')).expect(200)).body;
    expect(course.chapters.map((c) => c.title)).toEqual(['Underwriting of Shares', 'Valuation of Goodwill', 'Valuation of Shares', 'Company Final Accounts']);
    expect(topic('Valuation of Goodwill')).toMatchObject({ title: 'Methods of valuing goodwill', videos: 0 });

    const own = await http().post(`/v1/content/chapters/${course.chapters[1].id}/topics`).set(auth('teacher')).send({ title: 'Goodwill: our past papers' }).expect(201);
    const again = (await http().get(`/v1/platform/library/courses/${ca.id}`).set(auth('platform')).expect(200)).body;
    expect(again.chapters[1].topics.map((x: { title: string }) => x.title)).toEqual(['Methods of valuing goodwill']);
    const found = (await http().get('/v1/platform/library/search?q=goodwill').set(auth('platform')).expect(200)).body;
    expect(found.map((x: { title: string }) => x.title)).toContain('Methods of valuing goodwill');
    expect(found.map((x: { title: string }) => x.title)).not.toContain('Goodwill: our past papers');
    await http().post(`/v1/platform/topics/${own.body.id}/videos`).set(auth('platform')).send({ url: `https://youtu.be/${VID(1)}` }).expect(404);
  });

  it('adds videos from any YouTube link, and reorders, edits and removes them', async () => {
    const goodwill = topic('Valuation of Goodwill').id;
    const add = (body: object) => http().post(`/v1/platform/topics/${goodwill}/videos`).set(auth('platform')).send(body);

    oembed('Valuing goodwill: average profit method');
    const a = (await add({ url: `https://www.youtube.com/watch?v=${VID(1)}&t=10s` }).expect(201)).body;
    expect(a).toMatchObject({ youtubeVideoId: VID(1), title: 'Valuing goodwill: average profit method', language: 'en', channelTitle: 'KINETIX', position: 1 });
    expect((await add({ url: `https://youtu.be/${VID(1)}` }).expect(409)).body.code).toBe('VIDEO_DUPLICATE');
    expect((await add({ url: 'https://vimeo.com/12345' }).expect(400)).body.code).toBe('VIDEO_BAD_LINK');

    // Offline (or a video YouTube won't describe): the title must be typed.
    routes.length = 0;
    expect((await add({ url: `https://www.youtube.com/shorts/${VID(2)}`, language: 'hi' }).expect(400)).body.code).toBe('VIDEO_TITLE_UNAVAILABLE');
    const b = (await add({ url: `https://www.youtube.com/shorts/${VID(2)}`, language: 'hi', title: 'साख का मूल्यांकन' }).expect(201)).body;
    const c = (await add({ url: `https://www.youtube.com/embed/${VID(3)}`, language: 'kn', title: 'ಸುನಾಮ ಮೌಲ್ಯಮಾಪನ' }).expect(201)).body;
    oembed('Super profit method');
    const d = (await add({ url: VID(4) }).expect(201)).body;
    expect([b.position, c.position, d.position]).toEqual([2, 3, 4]);

    const order = [d.id, c.id, b.id, a.id];
    const reordered = (await http().put(`/v1/platform/topics/${goodwill}/videos/order`).set(auth('platform')).send({ ids: order }).expect(200)).body;
    expect(reordered.map((v: { id: string }) => v.id)).toEqual(order);
    await http().put(`/v1/platform/topics/${goodwill}/videos/order`).set(auth('platform')).send({ ids: [d.id, c.id] }).expect(400);

    await http().patch(`/v1/platform/videos/${d.id}`).set(auth('platform')).send({ title: 'Super profit method of valuing goodwill' }).expect(200);
    await http().patch(`/v1/platform/videos/${d.id}`).set(auth('principal')).send({ title: 'x' }).expect(403);
    oembed('To be removed');
    const e = (await add({ url: `youtube.com/watch?v=${VID(5)}` }).expect(201)).body;
    await http().delete(`/v1/platform/videos/${e.id}`).set(auth('platform')).expect(204);
    await http().delete(`/v1/platform/videos/${e.id}`).set(auth('platform')).expect(404);

    const listed = (await http().get(`/v1/platform/topics/${goodwill}/videos`).set(auth('platform')).expect(200)).body;
    expect(listed.topic).toMatchObject({ title: 'Methods of valuing goodwill', chapter: { title: 'Valuation of Goodwill' } });
    expect(listed.videos.map((v: { title: string }) => v.title)).toEqual(['Super profit method of valuing goodwill', 'ಸುನಾಮ ಮೌಲ್ಯಮಾಪನ', 'साख का मूल्यांकन', 'Valuing goodwill: average profit method']);
    const { rows } = await owner.query(`select action from audit_log where tenant_id = $1 and action like 'platform.%'`, [kinetix.tenantId]);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['platform.concept_video.added', 'platform.concept_video.removed']));
  });

  it("serves a topic's videos to every institution, the class's language first", async () => {
    const goodwill = topic('Valuation of Goodwill').id;
    const forStudent = (await http().get(`/v1/content/topics/${goodwill}/videos`).set(auth('student')).expect(200)).body;
    expect(forStudent.language).toBe('en'); // the course's language
    expect(forStudent.videos.map((v: { language: string }) => v.language)).toEqual(['en', 'en', 'hi', 'kn']);
    expect(forStudent.videos[0]).toMatchObject({ title: 'Super profit method of valuing goodwill', youtubeVideoId: VID(4) });

    const inKannada = (await http().get(`/v1/content/topics/${goodwill}/videos?lang=kn`).set(auth('otherTeacher')).expect(200)).body;
    expect(inKannada.videos.map((v: { language: string }) => v.language)).toEqual(['kn', 'en', 'en', 'hi']);
    await http().get(`/v1/content/topics/${goodwill}/videos`).set(auth('board')).expect(200);
    await http().get(`/v1/content/topics/${goodwill}/videos?lang=fr`).set(auth('student')).expect(400);
    await http().get(`/v1/content/topics/00000000-0000-4000-8000-000000000000/videos`).set(auth('student')).expect(404);
  });

  it("suggests videos for the period's topic on the board: lesson plan, else year plan, else the next untaught topic", async () => {
    const underwriting = topic('Underwriting of Shares').id;
    const shares = topic('Valuation of Shares').id;
    oembed('Underwriting commission explained');
    await http().post(`/v1/platform/topics/${underwriting}/videos`).set(auth('platform')).send({ url: `https://youtu.be/${VID(6)}` }).expect(201);
    const now = async (who = 'board') => (await http().get('/v1/devices/me/concept-videos').set(auth(who)).expect(200)).body;

    // Nothing planned or taught yet: the first topic of the syllabus.
    let r = await now();
    expect(r.period).toMatchObject({ slotId: t.slot.id, date: monday, startsAt: '10:00:00', isNow: true, section: { displayName: 'BCom Sem 3 A' }, subject: { name: 'Corporate Accounting' } });
    expect(r).toMatchObject({ source: 'syllabus', language: 'en', topics: [{ id: underwriting }] });
    expect(r.videos).toEqual([expect.objectContaining({ youtubeVideoId: VID(6), topicTitle: 'Underwriting and underwriting commission' })]);

    // Once it is taught, the next one.
    await http().post('/v1/coverage').set(auth('board')).send({ topicId: underwriting }).expect(200);
    r = await now();
    expect(r).toMatchObject({ source: 'syllabus', topics: [{ title: 'Methods of valuing goodwill' }] });
    expect(r.videos).toHaveLength(4);

    // A year plan decides when there is one; a lesson plan for the period wins over both.
    await http().post('/v1/year-plans/generate').set(auth('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, startsOn: monday, endsOn: addDays(monday, 27) }).expect(200);
    expect((await now()).source).toBe('year_plan');
    const content = { objectives: ['Value shares'], steps: [], materials: [], assessment: '', homework: '' };
    await http().put('/v1/lesson-plans').set(auth('teacher')).send({ slotId: t.slot.id, date: monday, topicIds: [shares], content }).expect(200);
    r = await now();
    expect(r).toMatchObject({ source: 'lesson_plan', topics: [{ id: shares, title: 'Net assets, yield and fair value methods' }], videos: [] });

    // A board nobody is signed in to: its room's period. Before the period: the next one; after the last: nothing.
    expect((await now('device')).period).toMatchObject({ slotId: t.slot.id, isNow: true });
    const at = clock.at;
    try {
      clock.at = new Date(at.getTime() - 90 * 60_000); // 09:00
      expect((await now('device')).period).toMatchObject({ slotId: t.slot.id, isNow: false });
      clock.at = new Date(at.getTime() + 60 * 60_000); // 11:30
      expect(await now('device')).toEqual({ period: null, source: null, topics: [], language: 'en', videos: [] });
    } finally {
      clock.at = at;
    }
    await http().get('/v1/devices/me/concept-videos').set(auth('teacher')).expect(403);
  });

  it('imports a playlist into a chapter, guessing each video’s topic from its title', async () => {
    const goodwill = topic('Valuation of Goodwill');
    const chapterId = course.chapters[1].id;
    const url = 'https://www.youtube.com/playlist?list=PLkinetixGoodwill';
    routes.splice(
      0,
      routes.length,
      ['https://www.googleapis.com/youtube/v3/playlistItems', {
        items: [
          { snippet: { title: 'Super profit method of valuing goodwill', position: 0 }, contentDetails: { videoId: VID(4) } },
          { snippet: { title: 'Goodwill: capitalisation method', position: 1 }, contentDetails: { videoId: VID(7) } },
          { snippet: { title: 'Welcome to the KINETIX channel', position: 2 }, contentDetails: { videoId: VID(8) } },
        ],
      }],
      ['https://www.googleapis.com/youtube/v3/videos', { items: [{ id: VID(7), snippet: { title: 'Goodwill: capitalisation method' }, contentDetails: { duration: 'PT6M30S' } }] }],
    );
    const preview = (await http().post('/v1/platform/playlists/preview').set(auth('platform')).send({ url, chapterId }).expect(200)).body;
    expect(preview).toMatchObject({ playlistId: 'PLkinetixGoodwill', chapter: { title: 'Valuation of Goodwill' }, topics: [{ id: goodwill.id }] });
    expect(preview.videos).toEqual([
      expect.objectContaining({ youtubeVideoId: VID(4), suggestedTopicId: goodwill.id, alreadyOn: [goodwill.id] }),
      expect.objectContaining({ youtubeVideoId: VID(7), suggestedTopicId: goodwill.id, durationSeconds: 390, alreadyOn: [] }),
      expect.objectContaining({ youtubeVideoId: VID(8), suggestedTopicId: null }),
    ]);
    await http().post('/v1/platform/playlists/preview').set(auth('platform')).send({ url: 'https://youtu.be/abc', chapterId }).expect(400);

    const items = preview.videos.filter((v: { suggestedTopicId: string | null }) => v.suggestedTopicId).map((v: { youtubeVideoId: string; title: string; durationSeconds: number | null }) => ({ ...v, topicId: goodwill.id }));
    const body = { playlistId: preview.playlistId, chapterId, language: 'en', items: items.map(({ youtubeVideoId, title, durationSeconds, topicId }: Record<string, unknown>) => ({ youtubeVideoId, title, durationSeconds, topicId })) };
    expect((await http().post('/v1/platform/playlists/import').set(auth('platform')).send(body).expect(201)).body).toEqual({ added: 1, skipped: 1 });
    const wrongChapter = { ...body, items: [{ ...body.items[0], topicId: topic('Valuation of Shares').id }] };
    await http().post('/v1/platform/playlists/import').set(auth('platform')).send(wrongChapter).expect(400);
    const [row] = await db.select().from(s.conceptVideos).where(eq(s.conceptVideos.youtubeVideoId, VID(7)));
    expect(row).toMatchObject({ playlistId: 'PLkinetixGoodwill', durationSeconds: 390, position: 5 });

    // Without a YouTube Data API key the server says so.
    Object.assign(youtube, { apiKey: undefined });
    try {
      expect((await http().get('/v1/platform/me').set(auth('platform')).expect(200)).body.playlistImport).toBe(false);
      const res = await http().post('/v1/platform/playlists/preview').set(auth('platform')).send({ url, chapterId }).expect(503);
      expect(res.body.code).toBe('PLAYLIST_IMPORT_UNAVAILABLE');
    } finally {
      Object.assign(youtube, { apiKey: 'test-key' });
    }
    const counts = await owner.query('select count(*)::int as n from concept_videos where topic_id = $1', [goodwill.id]);
    expect(counts.rows[0].n).toBe(5);
  });
});
