import type { INestApplication } from '@nestjs/common';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool, pairBoard } from './helpers.js';

/** Reads any response as bytes (supertest only buffers types it knows). */
const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
};

/** Google (Drive, Classroom, OAuth), Microsoft (Graph, OAuth) and Moodle (web services), faked on one local server. */
class FakeClouds {
  server!: Server;
  url = '';
  uploads: { path: string; contentType: string; body: Buffer }[] = [];
  materials: unknown[] = [];
  moodleCalls: Record<string, string>[] = [];
  tokenCalls: Record<string, string>[] = [];

  private body(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async start() {
    this.server = createServer(async (req, res) => {
      const u = new URL(req.url ?? '/', 'http://x');
      const p = u.pathname;
      const body = await this.body(req);
      const json = (v: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(v));
      };
      const bytes = (b: string, type: string) => {
        res.writeHead(200, { 'content-type': type });
        res.end(Buffer.from(b));
      };
      const authed = req.headers.authorization === 'Bearer access-1' || req.headers.authorization === 'Bearer access-2';
      if (p.endsWith('/token') && req.method === 'POST') {
        const f = Object.fromEntries(new URLSearchParams(body.toString()));
        this.tokenCalls.push(f);
        if (f.grant_type === 'authorization_code') return f.code === 'good' ? json({ access_token: 'access-1', refresh_token: `refresh-${p.startsWith('/m') ? 'ms' : 'g'}`, expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400);
        return f.refresh_token?.startsWith('refresh-') ? json({ access_token: 'access-2', expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400);
      }
      if (p.startsWith('/moodle/webservice/upload.php')) {
        this.uploads.push({ path: p, contentType: String(req.headers['content-type']), body });
        return json([{ itemid: 77, filename: 'notes.pdf' }]);
      }
      if (p === '/moodle/webservice/rest/server.php') {
        const f = Object.fromEntries(new URLSearchParams(body.toString()));
        this.moodleCalls.push(f);
        if (f.wstoken !== 'moodle-token') return json({ exception: 'moodle_exception', message: 'Invalid token' });
        if (f.wsfunction === 'core_webservice_get_site_info') return json({ sitename: 'College Moodle', username: 'zynetix', userid: 5 });
        if (f.wsfunction === 'core_enrol_get_users_courses') return json([{ id: 12, fullname: 'Corporate Accounting', shortname: 'CA' }]);
        if (f.wsfunction === 'mod_forum_get_forums_by_courses') return json([{ id: 3, type: 'general' }, { id: 4, type: 'news' }]);
        if (f.wsfunction === 'mod_forum_add_discussion') return json({ discussionid: 90, warnings: [] });
        return json({ exception: 'x', message: 'unknown function' });
      }
      if (!authed) return json({ error: { message: 'unauthenticated' } }, 401);
      // Google
      if (p === '/g/drive/v3/about') return json({ user: { emailAddress: 'teacher@college.in' } });
      if (p === '/g/drive/v3/files' && req.method === 'GET')
        return json({
          files: [
            { id: 'f1', name: 'Week 3', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'p1', name: 'Ledger.pdf', mimeType: 'application/pdf', size: '1200' },
            { id: 's1', name: 'Intro deck', mimeType: 'application/vnd.google-apps.presentation' },
            { id: 'v1', name: 'Demo.mp4', mimeType: 'video/mp4', size: '5000' },
            { id: 't1', name: 'notes.txt', mimeType: 'text/plain' },
          ],
        });
      if (p === '/g/drive/v3/files/p1' && u.searchParams.get('alt') === 'media') return bytes('%PDF-1.4 ledger', 'application/pdf');
      if (p === '/g/drive/v3/files/p1') return json({ id: 'p1', name: 'Ledger.pdf', mimeType: 'application/pdf', size: '15' });
      if (p === '/g/drive/v3/files/s1/export') return bytes(`PK deck as ${u.searchParams.get('mimeType')}`, 'application/octet-stream');
      if (p === '/g/drive/v3/files/s1') return json({ id: 's1', name: 'Intro deck', mimeType: 'application/vnd.google-apps.presentation' });
      if (p === '/g/upload/drive/v3/files' && req.method === 'POST') {
        this.uploads.push({ path: p, contentType: String(req.headers['content-type']), body });
        return json({ id: `up${this.uploads.length}`, name: 'Board.pdf', webViewLink: 'https://drive.example/up' });
      }
      if (p === '/g/classroom/v1/courses') return json({ courses: [{ id: 'c1', name: 'BCom Sem 3 A', section: 'A' }] });
      if (p === '/g/classroom/v1/courses/c1/courseWorkMaterials') {
        this.materials.push(JSON.parse(body.toString()));
        return json({ id: 'm1', alternateLink: 'https://classroom.example/m1' });
      }
      // Microsoft
      if (p === '/m/graph/v1.0/me') return json({ mail: 'teacher@college.in' });
      if (p === '/m/graph/v1.0/me/drive/root/children') return json({ value: [{ id: 'd1', name: 'Slides', folder: { childCount: 2 } }, { id: 'x1', name: 'Lesson.pptx', size: 900, file: { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } }, { id: 'z1', name: 'a.zip', file: { mimeType: 'application/zip' } }] });
      if (p.startsWith('/m/graph/v1.0/me/drive/root:/Zynetix/') && req.method === 'PUT') {
        this.uploads.push({ path: decodeURIComponent(p), contentType: String(req.headers['content-type']), body });
        return json({ id: 'o1', name: 'Board.pptx', webUrl: 'https://onedrive.example/o1' });
      }
      return json({ error: { message: `no route ${req.method} ${p}` } }, 404);
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`;
  }
}

// Board cloud drives and sharing (Zynetix W5): set up by the admin, connected by each teacher, used from the board.
describe('cloud drives, Google Classroom and Moodle', () => {
  const owner = ownerPool();
  const fake = new FakeClouds();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let board: string;
  let admin: string;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const asBoard = (r: request.Test) => r.set('authorization', `Bearer ${board}`);
  const connector = (type: string, name: string, config: Record<string, string>) => http().post('/v1/connectors').set('authorization', `Bearer ${admin}`).send({ type, name, config, enabled: true }).expect(201);
  /** The teacher scans the QR, signs in on their phone, and the provider sends them back with a code. */
  const signIn = async (provider: string) => {
    const { url } = (await asBoard(http().post(`/v1/cloud/${provider}/connect`)).expect(200)).body as { url: string };
    const state = new URL(url).searchParams.get('state')!;
    return { url, state, done: await http().get(`/v1/cloud/oauth/callback?code=good&state=${encodeURIComponent(state)}`) };
  };

  beforeAll(async () => {
    await fake.start();
    t = await createTenant(owner);
    app = await createApp(new FixedClock(nextMondayIst('10:30')));
    board = (await pairBoard(app, t, await login(t.teacher.email!))).boardToken;
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) select tenant_id, 'Admin', $2, password_hash from users where id = $1 returning id`, [t.teacher.id, `admin-${t.slug}@x.in`]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, 'tenant_admin', $3)`, [t.tenantId, rows[0].id, t.campus.id]);
    admin = await login(`admin-${t.slug}@x.in`);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
    fake.server.close();
  });

  it('says clearly when nothing is set up', async () => {
    expect((await asBoard(http().get('/v1/cloud')).expect(200)).body).toEqual({
      google: { configured: false, connected: false, account: null },
      microsoft: { configured: false, connected: false, account: null },
      classroom: { configured: false, connected: false, account: null },
      moodle: { configured: false },
    });
    expect((await asBoard(http().get('/v1/cloud/google/files')).expect(409)).body.code).toBe('CLOUD_NOT_CONFIGURED');
    expect((await asBoard(http().post('/v1/cloud/google/connect')).expect(409)).body.code).toBe('CLOUD_NOT_CONFIGURED');
    expect((await asBoard(http().get('/v1/share/moodle/courses')).expect(409)).body.code).toBe('MOODLE_NOT_CONFIGURED');
    await asBoard(http().get('/v1/cloud/dropbox/files')).expect(400);
    // The administrator sees the redirect URI to register with Google and Microsoft.
    expect((await http().get('/v1/cloud/setup').set('authorization', `Bearer ${admin}`).expect(200)).body.redirectUri).toMatch(/^http:\/\/.+\/v1\/cloud\/oauth\/callback$/);
  });

  it('Google Drive: the admin sets it up, the teacher connects by QR, then imports and saves files', async () => {
    const created = (await connector('cloud_google', 'Google', { clientId: 'gid', clientSecret: 'gsecret-123', apiBaseUrl: `${fake.url}/g` })).body;
    // The secret is never shown back.
    expect(JSON.stringify(created)).not.toContain('gsecret-123');
    expect((await http().post(`/v1/connectors/${created.id}/test`).set('authorization', `Bearer ${admin}`).expect(200)).body.status).toBe('ok');
    expect((await asBoard(http().get('/v1/cloud/google/files')).expect(409)).body.code).toBe('CLOUD_NOT_CONNECTED');

    const { url, state, done } = await signIn('google');
    expect(url.startsWith(`${fake.url}/g/o/oauth2/v2/auth?`)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('client_id')).toBe('gid');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('scope')).toContain('classroom.courseworkmaterials');
    expect(q.get('redirect_uri')).toMatch(/\/v1\/cloud\/oauth\/callback$/);
    expect(done.status).toBe(200);
    expect(done.text).toContain('Connected');
    expect(fake.tokenCalls.at(-1)).toMatchObject({ grant_type: 'authorization_code', client_secret: 'gsecret-123', code: 'good' });
    // The refresh token is stored encrypted.
    const { rows } = await owner.query(`select refresh_token_enc, account from cloud_accounts where tenant_id = $1 and provider = 'google'`, [t.tenantId]);
    expect(rows[0].account).toBe('teacher@college.in');
    expect(rows[0].refresh_token_enc).not.toContain('refresh-g');
    // A tampered state is refused.
    expect((await http().get(`/v1/cloud/oauth/callback?code=good&state=${encodeURIComponent(`${state}x`)}`)).status).toBe(400);

    expect((await asBoard(http().get('/v1/cloud')).expect(200)).body.google).toEqual({ configured: true, connected: true, account: 'teacher@college.in' });
    const files = (await asBoard(http().get('/v1/cloud/google/files')).expect(200)).body.files as { id: string; kind: string }[];
    expect(files.map((f) => [f.id, f.kind])).toEqual([
      ['f1', 'folder'],
      ['v1', 'video'],
      ['s1', 'pptx'],
      ['p1', 'pdf'],
    ]);
    const pdf = await asBoard(http().get('/v1/cloud/google/files/p1')).buffer(true).parse(binary).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.toString()).toBe('%PDF-1.4 ledger');
    const deck = await asBoard(http().get('/v1/cloud/google/files/s1')).buffer(true).parse(binary).expect(200);
    expect(deck.headers['content-disposition']).toContain('Intro%20deck.pptx');
    expect(deck.body.toString()).toContain('presentationml.presentation');

    const saved = (await asBoard(http().post('/v1/cloud/google/files?name=Board.pdf')).set('content-type', 'application/pdf').send(Buffer.from('%PDF board')).expect(201)).body;
    expect(saved).toMatchObject({ id: 'up1', webUrl: 'https://drive.example/up' });
    const up = fake.uploads.at(-1)!;
    expect(up.contentType).toContain('multipart/related');
    expect(up.body.toString()).toContain('"name":"Board.pdf"');
    expect(up.body.toString()).toContain('%PDF board');
  });

  it('posts notes to a Google Classroom course as material', async () => {
    expect((await asBoard(http().get('/v1/share/classroom/courses')).expect(200)).body.courses).toEqual([{ id: 'c1', name: 'BCom Sem 3 A', section: 'A' }]);
    const r = (await asBoard(http().post('/v1/share/classroom/courses/c1?title=Ledger%20notes&name=Ledger.pdf')).set('content-type', 'application/pdf').send(Buffer.from('%PDF notes')).expect(201)).body;
    expect(r).toMatchObject({ id: 'm1', link: 'https://classroom.example/m1' });
    expect(fake.materials.at(-1)).toEqual({ title: 'Ledger notes', materials: [{ driveFile: { driveFile: { id: r.fileId }, shareMode: 'VIEW' } }], state: 'PUBLISHED' });
  });

  it('posts notes to a Moodle course announcement with the file attached', async () => {
    await connector('lms_moodle', 'Moodle', { baseUrl: `${fake.url}/moodle`, token: 'moodle-token' });
    expect((await asBoard(http().get('/v1/cloud')).expect(200)).body.moodle).toEqual({ configured: true });
    expect((await asBoard(http().get('/v1/share/moodle/courses')).expect(200)).body.courses).toEqual([{ id: '12', name: 'Corporate Accounting', shortName: 'CA' }]);
    const r = (await asBoard(http().post('/v1/share/moodle/courses/12?title=Ledger%20notes&name=Ledger.pdf')).set('content-type', 'application/pdf').send(Buffer.from('%PDF notes')).expect(201)).body;
    expect(r).toEqual({ id: '90', link: `${fake.url}/moodle/mod/forum/discuss.php?d=90` });
    expect(fake.uploads.at(-1)!.body.toString()).toContain('filename="Ledger.pdf"');
    expect(fake.moodleCalls.at(-1)).toMatchObject({ wsfunction: 'mod_forum_add_discussion', forumid: '4', subject: 'Ledger notes', 'options[0][name]': 'attachmentsid', 'options[0][value]': '77' });
  });

  it('OneDrive: connect, browse and save board slides to the Zynetix folder; disconnect', async () => {
    await connector('cloud_microsoft', 'OneDrive', { clientId: 'mid', clientSecret: 'msecret-123', apiBaseUrl: `${fake.url}/m` });
    const { url, done } = await signIn('microsoft');
    expect(url.startsWith(`${fake.url}/m/login/common/oauth2/v2.0/authorize?`)).toBe(true);
    expect(new URL(url).searchParams.get('scope')).toContain('Files.ReadWrite');
    expect(done.status).toBe(200);
    const files = (await asBoard(http().get('/v1/cloud/microsoft/files')).expect(200)).body.files as { id: string; kind: string }[];
    expect(files.map((f) => [f.id, f.kind])).toEqual([
      ['d1', 'folder'],
      ['x1', 'pptx'],
    ]);
    const pptx = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const saved = (await asBoard(http().post('/v1/cloud/microsoft/files?name=Board.pptx')).set('content-type', pptx).send(Buffer.from('PK slides')).expect(201)).body;
    expect(saved).toEqual({ id: 'o1', name: 'Board.pptx', webUrl: 'https://onedrive.example/o1' });
    expect(fake.uploads.at(-1)).toMatchObject({ path: '/m/graph/v1.0/me/drive/root:/Zynetix/Board.pptx:/content', contentType: pptx });

    await asBoard(http().delete('/v1/cloud/microsoft')).expect(204);
    expect((await asBoard(http().get('/v1/cloud')).expect(200)).body.microsoft).toEqual({ configured: true, connected: false, account: null });
  });
});
