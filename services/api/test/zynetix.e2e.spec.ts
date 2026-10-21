import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiGate } from '../src/ai/gate.js';
import { addPlatformAdmin } from '../src/db/platform-admin.js';
import * as s from '../src/db/schema.js';
import { YouTube } from '../src/platform/youtube.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

const FIX = join(__dirname, 'fixtures', 'youtube');
const CH = 'UCabcdefghijklmnopqrstuv';
const feed = (titles: string[]) =>
  `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><title>Zynetix Learning</title>${titles
    .map((t, i) => `<entry><yt:videoId>ZYNVIDEO00${i}</yt:videoId><title>${t}</title><author><name>Zynetix Learning</name></author><published>2026-09-0${i + 1}T10:00:00+00:00</published></entry>`)
    .join('')}</feed>`;

/** YouTube without an API key, answering from fixtures (no network). */
const youtube = new YouTube(undefined, (async (input: string | URL) => {
  const url = String(input);
  if (url.startsWith('https://www.youtube.com/@ZynetixLearning')) return new Response(readFileSync(join(FIX, 'channel-page.html'), 'utf8'));
  if (url.startsWith(`https://www.youtube.com/feeds/videos.xml?channel_id=${CH}`)) {
    return new Response(feed(['Underwriting commission explained', 'Valuing goodwill: methods with examples', 'Campus tour vlog']));
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch);

describe('Zynetix board edition', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(nextMondayIst('10:30'));
  const gate = new AiGate(1, 0);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let kinetix: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let socket: Socket;
  let topicIds: string[];
  let courseId: string;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const login = async (slug: string, email: string, password = 'pw') => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password }).expect(201)).body.accessToken as string;
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);

  beforeAll(async () => {
    t = await createTenant(owner);
    kinetix = await createTenant(owner);
    const [c] = await db.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.code, 'bcom-3-corporate-accounting'));
    courseId = c.id;
    await db.update(s.subjects).set({ courseId }).where(eq(s.subjects.id, t.subject.id));
    topicIds = (
      await db
        .select({ id: s.topics.id })
        .from(s.topics)
        .innerJoin(s.chapters, eq(s.chapters.id, s.topics.chapterId))
        .where(and(eq(s.chapters.courseId, courseId), isNull(s.topics.tenantId)))
        .orderBy(s.chapters.position, s.topics.position)
    ).map((r) => r.id);
    await addPlatformAdmin(db, kinetix.slug, kinetix.principal.email!, 'Zynetix content team');
    app = await createApp(clock, (b) => b.overrideProvider(YouTube).useValue(youtube).overrideProvider(AiGate).useValue(gate));
    tokens = {
      platform: await login(kinetix.slug, kinetix.principal.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
    };
    const paired = await pairBoard(app, t, tokens.teacher);
    tokens.board = paired.boardToken;
    tokens.device = paired.deviceToken;
    socket = paired.socket;
  });

  afterAll(async () => {
    // The global library is shared by every test file: leave it as it was.
    await owner.query("delete from concept_videos where scope = 'platform' and youtube_video_id like 'ZYNVIDEO%'");
    await owner.query("delete from topic_materials where scope = 'platform'");
    socket.disconnect();
    await app.close();
    await owner.end();
  });

  it('platform admin creates a board-edition institution and switches editions', async () => {
    const created = await post('platform', '/v1/platform/tenants', {
      slug: `zyn-${Date.now().toString(36)}`,
      name: 'SDM College of Engineering',
      kind: 'college',
      edition: 'board',
      yearLabel: '2026-27',
      yearStart: '2026-08-01',
      yearEnd: '2027-06-30',
      adminName: 'Admin Office',
      adminEmail: `admin-${Date.now()}@sdmcet.zynetix.in`,
    }).expect(201);
    expect(created.body.tenant.edition).toBe('board');
    expect(created.body.admin.temporaryPassword).toBeTruthy();
    await login(created.body.tenant.slug, created.body.admin.email, created.body.admin.temporaryPassword);
    await post('platform', '/v1/platform/tenants', { ...created.body.tenant, yearLabel: 'x', yearStart: '2026-08-01', yearEnd: '2027-06-30', adminName: 'A', adminEmail: 'a@b.in' }).expect(409);
    await post('principal', '/v1/platform/tenants', {}).expect(403);
    const list = await get('platform', '/v1/platform/tenants').expect(200);
    expect(list.body.find((x: { id: string }) => x.id === created.body.tenant.id).edition).toBe('board');

    expect((await get('principal', '/v1/me').expect(200)).body.tenant.edition).toBe('full');
    await get('principal', '/v1/fees/invoices').expect(200);
    expect((await patch('platform', `/v1/platform/tenants/${t.tenantId}`, { edition: 'board' }).expect(200)).body.edition).toBe('board');
    expect((await get('principal', '/v1/me').expect(200)).body.tenant.edition).toBe('board');
    expect((await get('device', '/v1/devices/me/config').expect(200)).body.edition).toBe('board');
  });

  it('board edition refuses ERP modules and keeps the board modules open', async () => {
    for (const url of ['/v1/fees/invoices', '/v1/hostel/blocks', '/v1/hr/me', '/v1/admissions/cycles', '/v1/books/daybook']) {
      const r = await get('principal', url).expect(403);
      expect(r.body.code, url).toBe('EDITION_BOARD_ONLY');
    }
    expect((await http().get(`/v1/public/admissions/${t.slug}/landing/${t.tenantId}`).expect(403)).body.code).toBe('EDITION_BOARD_ONLY');
    await get('principal', '/v1/admin/staff').expect(200);
    await get('principal', `/v1/admin/timetable?sectionId=${t.section.id}`).expect(200);
    await get('teacher', '/v1/teacher/timetable').expect(200);
    await get('student', '/v1/content/courses').expect(200);
  });

  it('admin creates teacher accounts and their timetable in the board edition', async () => {
    const dept = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce' }).returning();
    const r = await post('principal', '/v1/admin/teachers', { fullName: 'Kavya Rao', email: 'Kavya.Commerce@sdmcet.zynetix.in', roles: ['teacher', 'hod'], departmentIds: [dept[0].id] }).expect(201);
    expect(r.body).toMatchObject({ fullName: 'Kavya Rao', email: 'kavya.commerce@sdmcet.zynetix.in', mustChangePassword: true, departments: [{ name: 'Commerce' }] });
    expect(r.body.roles.sort()).toEqual(['hod', 'teacher']);
    ids.newTeacher = r.body.id;
    await login(t.slug, 'kavya.commerce@sdmcet.zynetix.in', r.body.temporaryPassword);
    await post('principal', '/v1/admin/teachers', { fullName: 'Copy', email: 'kavya.commerce@sdmcet.zynetix.in' }).expect(409);
    await post('principal', '/v1/admin/teachers', { fullName: 'No contact' }).expect(400);
    await post('teacher', '/v1/admin/teachers', { fullName: 'X', email: 'x@y.in' }).expect(403);

    const slot = await post('principal', '/v1/admin/timetable/slots', { sectionId: t.otherSection.id, subjectId: t.subject.id, teacherId: ids.newTeacher, dayOfWeek: 2, startsAt: '09:00', endsAt: '09:55' }).expect(201);
    expect(slot.body.teacher?.id ?? slot.body.teacherId).toBe(ids.newTeacher);

    const off = await patch('principal', `/v1/admin/teachers/${ids.newTeacher}`, { active: false, roles: ['teacher'] }).expect(200);
    expect(off.body).toMatchObject({ status: 'disabled', roles: ['teacher'] });
    expect((await get('principal', '/v1/admin/teachers').expect(200)).body.some((x: { id: string }) => x.id === ids.newTeacher)).toBe(true);
  });

  it('topic materials: platform and institution, approval, audiences and one consolidated read', async () => {
    const [topic] = topicIds;
    expect((await get('teacher', '/v1/topics/animations').expect(200)).body.length).toBeGreaterThanOrEqual(19);
    const pdf = await post('platform', `/v1/platform/topics/${topic}/materials`, { kind: 'pdf', title: 'Underwriting notes', url: 'https://cdn.zynetix.in/underwriting.pdf' }).expect(201);
    await post('platform', `/v1/platform/topics/${topic}/materials`, { kind: 'animation', ref: 'circular-flow-of-income' }).expect(201);
    await post('platform', `/v1/platform/topics/${topic}/materials`, { kind: 'animation', ref: 'no-such-animation' }).expect(400);
    await post('platform', `/v1/platform/topics/${topic}/materials`, { kind: 'pdf', title: 'No link' }).expect(400);
    await post('principal', `/v1/platform/topics/${topic}/materials`, { kind: 'link', url: 'https://x.in', title: 'x' }).expect(403);
    expect((await get('platform', `/v1/platform/topics/${topic}/materials`).expect(200)).body).toHaveLength(2);
    await patch('platform', `/v1/platform/materials/${pdf.body.id}`, { title: 'Underwriting: notes' }).expect(200);

    const book = await post('principal', `/v1/topics/${topic}/materials`, { kind: 'book', title: 'Corporate Accounting', author: 'S. N. Maheshwari', bookChapter: 'Ch 4 Underwriting', pageFrom: 120, pageTo: 145 }).expect(201);
    expect(book.body).toMatchObject({ status: 'approved', source: 'institution', pageFrom: 120, pageTo: 145 });
    await post('principal', `/v1/topics/${topic}/materials`, { kind: 'book', title: 'Bad pages', pageFrom: 20, pageTo: 10 }).expect(400);
    const staffOnly = await post('principal', `/v1/topics/${topic}/materials`, { kind: 'syllabus', title: 'VTU scheme', url: 'https://vtu.ac.in/scheme.pdf', audience: ['teacher', 'board'] }).expect(201);
    const link = await post('teacher', `/v1/topics/${topic}/materials`, { kind: 'link', title: 'ICAI guidance note', url: 'https://icai.org/note' }).expect(201);
    expect(link.body.status).toBe('pending');
    await post('student', `/v1/topics/${topic}/materials`, { kind: 'link', title: 'x', url: 'https://x.in' }).expect(403);

    const titles = async (who: string) => {
      const r = (await get(who, `/v1/topics/${topic}/resources`).expect(200)).body;
      return { materials: r.materials.map((m: { title: string }) => m.title).sort(), animations: r.animations.map((a: { id: string }) => a.id), r };
    };
    const student = await titles('student');
    expect(student.materials).toEqual(['Corporate Accounting', 'Underwriting: notes']);
    expect(student.animations).toEqual(['circular-flow-of-income']);
    expect(student.r.topic).toMatchObject({ id: topic, course: { id: courseId } });
    expect(student.r).toHaveProperty('videos');
    expect((await titles('parent')).materials).toEqual(['Corporate Accounting', 'Underwriting: notes']);
    expect((await titles('teacher')).materials).toEqual(['Corporate Accounting', 'Underwriting: notes', 'VTU scheme']);
    expect((await titles('board')).materials).toEqual(['Corporate Accounting', 'Underwriting: notes', 'VTU scheme']);

    expect((await get('principal', '/v1/topic-materials/pending').expect(200)).body.map((m: { id: string }) => m.id)).toEqual([link.body.id]);
    await post('principal', `/v1/topic-materials/${link.body.id}/review`, { approve: false }).expect(400);
    await post('principal', `/v1/topic-materials/${link.body.id}/review`, { approve: true }).expect(200);
    expect((await titles('student')).materials).toContain('ICAI guidance note');
    await patch('teacher', `/v1/topic-materials/${book.body.id}`, { title: 'Mine now' }).expect(403);
    expect((await patch('teacher', `/v1/topic-materials/${link.body.id}`, { title: 'ICAI note' }).expect(200)).body.status).toBe('pending');
    expect((await get('teacher', `/v1/topics/${topic}/materials`).expect(200)).body.map((m: { title: string }) => m.title)).toContain('ICAI note');

    const order = [staffOnly.body.id, link.body.id, book.body.id];
    expect((await put('principal', `/v1/topics/${topic}/materials/order`, { ids: order }).expect(200)).body.map((m: { id: string }) => m.id)).toEqual(order);
    await put('principal', `/v1/topics/${topic}/materials/order`, { ids: [book.body.id] }).expect(400);
    await http().delete(`/v1/topic-materials/${staffOnly.body.id}`).set(as('principal')).expect(204);
    await http().delete(`/v1/platform/materials/${pdf.body.id}`).set(as('platform')).expect(204);
    await put('platform', `/v1/platform/topics/${topic}/materials/order`, { ids: (await get('platform', `/v1/platform/topics/${topic}/materials`)).body.map((m: { id: string }) => m.id) }).expect(200);

    const outline = (await get('student', `/v1/subjects/${t.subject.id}/outline`).expect(200)).body;
    expect(outline.subject.id).toBe(t.subject.id);
    const first = outline.course.chapters.flatMap((c: { topics: { id: string; counts: object }[] }) => c.topics).find((x: { id: string }) => x.id === topic);
    expect(first.counts).toMatchObject({ materials: 1, animations: 1 }); // the book; the teacher's edited link waits for approval again
  });

  it('imports a YouTube channel with suggested topic matches (platform and institution)', async () => {
    const pv = await post('platform', '/v1/platform/youtube/preview', { url: 'https://www.youtube.com/@ZynetixLearning', courseIds: [courseId] }).expect(200);
    expect(pv.body).toMatchObject({ source: { kind: 'channel', id: CH, title: 'Zynetix Learning' }, via: 'feed' });
    const [under, goodwill, vlog] = pv.body.videos;
    expect(under.suggestedTopicId).toBe(topicIds[0]);
    expect(goodwill.suggestedTopicId).toBe(topicIds[1]);
    expect(vlog.suggestedTopicId).toBeNull();
    await post('platform', '/v1/platform/youtube/preview', { url: 'https://example.com/x', courseIds: [courseId] }).expect(400);
    await post('principal', '/v1/platform/youtube/preview', { url: '@ZynetixLearning', courseIds: [courseId] }).expect(403);

    const items = [under, goodwill].map((v: { youtubeVideoId: string; title: string; suggestedTopicId: string }) => ({ youtubeVideoId: v.youtubeVideoId, title: v.title, topicId: v.suggestedTopicId }));
    expect((await post('platform', '/v1/platform/youtube/import', { language: 'en', items }).expect(201)).body).toEqual({ added: 2, skipped: 0 });
    expect((await post('platform', '/v1/platform/youtube/import', { language: 'en', items }).expect(201)).body).toEqual({ added: 0, skipped: 2 });
    const again = await post('platform', '/v1/platform/youtube/preview', { url: '@ZynetixLearning', courseIds: [courseId] }).expect(200);
    expect(again.body.videos[0].alreadyOn).toEqual([topicIds[0]]);

    const inst = await post('principal', '/v1/content/youtube/preview', { url: `https://www.youtube.com/channel/${CH}`, courseIds: [courseId] }).expect(200);
    expect(inst.body.videos[0].alreadyOn).toEqual([]);
    expect((await post('principal', '/v1/content/youtube/import', { language: 'en', items: [{ ...items[0], topicId: topicIds[2] }] }).expect(201)).body).toEqual({ added: 1, skipped: 0 });
    await post('teacher', '/v1/content/youtube/import', { language: 'en', items }).expect(403);
    const res = (await get('student', `/v1/topics/${topicIds[0]}/resources`).expect(200)).body;
    expect(res.videos.map((v: { youtubeVideoId: string }) => v.youtubeVideoId)).toContain(under.youtubeVideoId);
  });

  it('logs every AI answer with its outcome, records peak-load throttling and summarises it', async () => {
    const ask = await post('teacher', '/v1/ai/explain', { question: 'What is underwriting commission?', topicId: topicIds[0] }).expect(200);
    expect(ask.body.meta.preview).toBe(true);
    await post('board', '/v1/ai/explain', { question: 'Explain goodwill valuation' }).expect(200);
    const hold = (await gate.acquire())!;
    const busy = await post('teacher', '/v1/ai/explain', { question: 'Explain share forfeiture' }).expect(429);
    expect(busy.body.code).toBe('AI_THROTTLED');
    hold();

    const logs = (await get('principal', '/v1/ai/admin/logs?pageSize=2').expect(200)).body;
    expect(logs).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(logs.items[0]).toMatchObject({ status: 'throttled', kind: 'explain', user: { id: t.teacher.id } });
    expect(logs.items[0].reason).toMatch(/Busy/);
    const served = (await get('principal', `/v1/ai/admin/logs?status=served&topicId=${topicIds[0]}`).expect(200)).body;
    expect(served.items).toHaveLength(1);
    expect(served.items[0]).toMatchObject({ topic: { id: topicIds[0] }, status: 'served', tokensIn: 0, tokensOut: 0 });
    const fromBoard = (await get('principal', `/v1/ai/admin/logs?deviceId=${t.device.id}`).expect(200)).body;
    expect(fromBoard.items[0].device).toMatchObject({ id: t.device.id, name: 'Room 1 Board' });
    await get('principal', '/v1/ai/admin/logs?status=bogus').expect(400);
    await get('teacher', '/v1/ai/admin/logs').expect(403);

    const sum = (await get('principal', '/v1/ai/admin/logs/summary?bucket=hour').expect(200)).body;
    expect(sum.totals).toMatchObject({ requests: 3, served: 2, throttled: 1, rejected: 0, error: 0 });
    expect(sum.peakHour.requests).toBe(3);
    expect(sum.buckets).toHaveLength(1);
    expect(sum.byKind[0]).toMatchObject({ kind: 'explain', requests: 3 });
    expect(sum.reasons[0]).toMatchObject({ status: 'throttled', n: 1 });
    expect(sum.capacity).toEqual({ running: 0, waiting: 0, max: 1 });
    await get('principal', '/v1/ai/admin/logs/summary?bucket=week').expect(400);
  });

  it('records edge and board compute from health reports and reports it over time', async () => {
    const base = { os: 'android', appVersion: '2.4.0', kiosk: 'on' };
    await http().post('/v1/devices/me/health').set(as('device')).send({ ...base, deviceKind: 'edge', cpuPct: 40, gpuPct: 70, npuPct: 55, ramPct: 60, cpuTempC: 61, gpuTempC: 72, storageFreeMb: 25_000, storageTotalMb: 100_000, aiInferences: 30, aiInferenceMs: 9000 }).expect(204);
    await http().post('/v1/devices/me/health').set(as('device')).send({ ...base, deviceKind: 'edge', cpuPct: 80, gpuPct: 90, ramPct: 70, cpuTempC: 75, aiInferences: 10, aiInferenceMs: 1000 }).expect(204);
    await http().post('/v1/devices/me/health').set(as('device')).send({ ...base, cpuPct: 101 }).expect(400);

    const status = (await get('principal', '/v1/devices/compute').expect(200)).body;
    const d = status.devices.find((x: { id: string }) => x.id === t.device.id);
    expect(d).toMatchObject({ kind: 'edge', online: true, appVersion: '2.4.0', cpuPct: 80, gpuPct: 90, ramPct: 70, cpuTempC: 75, ai24h: { inferences: 40, inferenceMs: 10_000, avgMs: 250 } });
    const day = clock.now().toISOString().slice(0, 10);
    const usage = (await get('principal', `/v1/devices/compute/usage?from=${day}&to=${day}&bucket=hour&deviceId=${t.device.id}`).expect(200)).body;
    expect(usage.rows).toHaveLength(1);
    expect(usage.rows[0]).toMatchObject({ samples: 2, cpuAvg: 60, cpuMax: 80, gpuMax: 90, npuAvg: 55, diskMax: 75, cpuTempMax: 75, aiInferences: 40, aiAvgMs: 250 });
    expect(usage.totals).toEqual({ aiInferences: 40, aiInferenceMs: 10_000 });
    await get('principal', '/v1/devices/compute/usage?bucket=month').expect(400);
    await get('teacher', '/v1/devices/compute').expect(403);
  });

  it('switching back to the full edition reopens the ERP modules', async () => {
    await patch('platform', `/v1/platform/tenants/${t.tenantId}`, { edition: 'full' }).expect(200);
    await get('principal', '/v1/fees/invoices').expect(200);
    await patch('platform', `/v1/platform/tenants/${t.tenantId}`, { edition: 'bogus' }).expect(400);
  });
});
