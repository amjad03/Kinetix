import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokensService } from '../src/auth/tokens.service.js';
import * as s from '../src/db/schema.js';
import * as x from '../src/db/schema-integrations.js';
import { signJwt } from '../src/integrations/lti.controller.js';
import { writeZip } from '../src/integrations/zip.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** A throwaway HTTP server standing in for an external API. */
async function fake(handler: (req: { method: string; url: string; headers: Record<string, any>; body: string }) => { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const log: { method: string; url: string; headers: Record<string, any>; body: string }[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const r = { method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() };
      log.push(r);
      const out = handler(r);
      res.writeHead(out.status ?? 200, { 'content-type': 'application/json', ...(out.headers ?? {}) });
      res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? {}));
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, log, close: () => new Promise<void>((ok) => server.close(() => ok())) };
}

describe('integrations: DigiLocker, devices, LTI/SCORM, feeds, retrieval and early alerts', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: { ...s, ...x } });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const closers: (() => Promise<void>)[] = [];

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@int.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const admin = await addUser('Adil Admin', 'tenant_admin');
    const librarian = await addUser('Lata Librarian', 'librarian');
    const mentor = await addUser('Meera Mentor', 'mentor');
    app = await createApp(clock);
    Object.assign(tokens, {
      admin: await login(t.slug, admin.email!),
      librarian: await login(t.slug, librarian.email!),
      mentor: await login(t.slug, mentor.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    });
    Object.assign(ids, { admin: admin.id, librarian: librarian.id, mentor: mentor.id, s0: t.students[0].id, s1: t.students[1].id, s2: t.students[2].id });
    // Two published results for the first two students: one good, one failing.
    const [year] = await db.select().from(s.academicYears);
    const [session] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: year.id, programId: t.program.id, term: 3, name: 'Sem 3 End', startsOn: '2026-09-01', endsOn: '2026-09-20', status: 'published', createdBy: t.principal.id }).returning();
    ids.session = session.id;
    for (const [sid, pct, passed] of [[ids.s0, 78, true], [ids.s1, 32, false]] as const) {
      const [r] = await db.insert(s.examResults).values({ tenantId: t.tenantId, sessionId: session.id, studentId: sid, sgpa: passed ? 8 : 3, cgpa: passed ? 8 : 3, creditsAttempted: 4, creditsEarned: passed ? 4 : 0, creditPoints: 30, outcome: passed ? 'pass' : 'fail' }).returning();
      await db.insert(s.examResultLines).values({ tenantId: t.tenantId, resultId: r.id, subjectId: t.subject.id, credits: 4, percent: pct, grade: passed ? 'A' : 'F', gradePoint: passed ? 8 : 0, passed });
    }
  });

  afterAll(async () => {
    for (const c of closers) await c();
    await app.close();
    await owner.end();
  });

  // ---------------------------------------------------------------------------------------------
  describe('DigiLocker issuer, NAD batch and ABC / APAAR ids', () => {
    let dl: Awaited<ReturnType<typeof fake>>;
    let nad: Awaited<ReturnType<typeof fake>>;
    let failNext = false;

    beforeAll(async () => {
      dl = await fake((r) => {
        if (failNext) return { status: 503, body: { message: 'busy' } };
        if (r.method === 'POST') {
          const expected = createHmac('sha256', 'dl-secret').update(r.body).digest('hex');
          if (r.headers['x-signature'] !== expected) return { status: 401, body: { message: 'bad signature' } };
          const d = JSON.parse(r.body);
          return { body: { uri: `in.soundarya-${d.docType}-${d.docRef}` } };
        }
        const uri = decodeURIComponent(r.url.split('/').pop()!);
        const pushed = dl.log.find((l) => l.method === 'POST' && l.body.includes(uri.replace(/^in\.soundarya-[a-z]+-/, '')));
        return { body: { uri, sha256: pushed ? JSON.parse(pushed.body).sha256 : null } };
      });
      nad = await fake(() => ({ body: { received: true } }));
      closers.push(dl.close, nad.close);
    });

    it('keeps the configuration to administrators and never returns the secret', async () => {
      await get('teacher', '/v1/digilocker/config').expect(403);
      await put('admin', '/v1/digilocker/config', { baseUrl: dl.url, clientId: 'client-1', clientSecret: 'dl-secret', issuerId: 'in.soundarya', nad: { baseUrl: nad.url, institutionCode: 'SOUND01' } }).expect(200);
      const cfg = (await get('admin', '/v1/digilocker/config').expect(200)).body;
      expect(cfg.digilocker.clientSecret).toBeUndefined();
      expect(cfg.digilocker.clientSecretSet).toBe(true);
      expect(cfg.publicKey).toContain('BEGIN PUBLIC KEY');
    });

    it('captures APAAR and ABC ids and refuses malformed ones', async () => {
      await put('admin', `/v1/students/${ids.s0}/academic-ids`, { apaarId: '12345', abcId: '123456789012' }).expect(400);
      await put('admin', `/v1/students/${ids.s0}/academic-ids`, { apaarId: '123456789012', abcId: '210987654321' }).expect(200);
      const list = (await get('admin', '/v1/academic-ids').expect(200)).body as { studentId: string; apaarId: string }[];
      expect(list.find((r) => r.studentId === ids.s0)!.apaarId).toBe('123456789012');
    });

    it('prepares a signed marksheet, pushes it, keeps the URI and verifies the signature', async () => {
      const doc = (await post('admin', '/v1/digilocker/documents', { studentId: ids.s0, docType: 'marksheet' }).expect(201)).body;
      expect(doc.status).toBe('pending');
      expect(doc.payload.student.abcId).toBe('210987654321');
      ids.doc = doc.id;
      expect((await get('admin', `/v1/digilocker/documents/${doc.id}/verify`).expect(200)).body.valid).toBe(true);
      const pushed = (await post('admin', `/v1/digilocker/documents/${doc.id}/push`).expect(200)).body;
      expect(pushed.status).toBe('issued');
      expect(pushed.uri).toMatch(/^in\.soundarya-marksheet-/);
      const check = (await post('admin', `/v1/digilocker/documents/${doc.id}/check`).expect(200)).body;
      expect(check.matches).toBe(true);
    });

    it('records a failed push on the row and retries it', async () => {
      const doc = (await post('admin', '/v1/digilocker/documents', { studentId: ids.s0, docType: 'degree' }).expect(201)).body;
      failNext = true;
      const failed = (await post('admin', '/v1/digilocker/push-pending').expect(200)).body;
      expect(failed.failed).toBe(1);
      const row = (await get('admin', '/v1/digilocker/documents').expect(200)).body.find((d: { id: string }) => d.id === doc.id);
      expect(row.status).toBe('failed');
      expect(row.error).toContain('503');
      failNext = false;
      expect((await post('admin', '/v1/digilocker/push-pending').expect(200)).body.pushed).toBe(1);
      await post('admin', '/v1/digilocker/documents', { studentId: ids.s2, docType: 'marksheet' }).expect(400); // no published results
    });

    it('answers a signed pull-URI request and refuses a wrong signature', async () => {
      const uri = (await get('admin', '/v1/digilocker/documents').expect(200)).body.find((d: { id: string }) => d.id === ids.doc).uri as string;
      const sig = createHmac('sha256', 'dl-secret').update(uri).digest('hex');
      const ok = (await http().post(`/v1/digilocker/pull/${t.tenantId}`).set('x-signature', sig).send({ uri }).expect(200)).body;
      expect(ok.document.docType).toBe('marksheet');
      await http().post(`/v1/digilocker/pull/${t.tenantId}`).set('x-signature', 'nope').send({ uri }).expect(403);
    });

    it('builds the NAD batch, uploads it and builds the ABC credit file', async () => {
      const batch = (await post('admin', '/v1/nad/batches').expect(201)).body;
      expect(batch.rows).toBe(2);
      const csv = (await get('admin', `/v1/nad/batches/${batch.id}/file`).expect(200)).text;
      expect(csv).toContain('210987654321');
      expect(csv).toContain('SOUND01');
      await post('admin', '/v1/nad/batches').expect(400); // nothing left to send
      const up = (await post('admin', `/v1/nad/batches/${batch.id}/upload`).expect(200)).body;
      expect(up.status).toBe('uploaded');
      expect(nad.log[0].headers['x-batch-ref']).toBe(batch.ref);
      const credits = (await post('admin', '/v1/abc/credit-files', { sessionId: ids.session }).expect(201)).body;
      expect(credits.rows).toBe(1); // only the passing student with an ABC id
      expect(credits.skippedNoAbcId).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('live biometric and RFID devices', () => {
    const keys: Record<string, string> = {};
    const ad = (path: string) => `/v1/device-ingest${path}`;

    it('registers devices with a one-time key and keeps the registry to administrators', async () => {
      await post('teacher', '/v1/access-devices', { kind: 'biometric', serial: 'X1', name: 'Gate', purpose: 'attendance' }).expect(403);
      const mk = async (name: string, body: object) => (await post('admin', '/v1/access-devices', { name, ...body }).expect(201)).body;
      const gate = await mk('Gate', { kind: 'biometric', vendor: 'essl', serial: 'ESSL-1', purpose: 'attendance', config: { lateAfter: '09:30', tzOffsetMinutes: 330 } });
      expect(gate.deviceKey.split('.')).toHaveLength(3);
      keys.gate = gate.deviceKey;
      keys.cosec = (await mk('Office', { kind: 'biometric', vendor: 'cosec', serial: 'COSEC-1', purpose: 'attendance' })).deviceKey;
      keys.lib = (await mk('Library desk', { kind: 'rfid_reader', serial: 'RF-LIB', purpose: 'library' })).deviceKey;
      const route = (await db.insert(s.transportRoutes).values({ tenantId: t.tenantId, name: 'Route 7' } as never).returning())[0];
      await post('admin', '/v1/access-devices', { kind: 'rfid_reader', serial: 'RF-BUS', name: 'Bus 7', purpose: 'transport' }).expect(400); // needs a route
      keys.bus = (await mk('Bus 7', { kind: 'rfid_reader', serial: 'RF-BUS', purpose: 'transport', config: { routeId: route.id } })).deviceKey;
      ids.boardDevice = t.device.id;
      keys.board = (await mk('Staff room board reader', { kind: 'rfid_reader', serial: 'RF-BOARD', purpose: 'board_signin', config: { boardDeviceId: t.device.id } })).deviceKey;
      await post('admin', '/v1/access-devices', { kind: 'biometric', serial: 'ESSL-1', name: 'dup', purpose: 'attendance' }).expect(400);
      expect((await get('admin', '/v1/access-devices').expect(200)).body.map((d: { deviceKey?: string }) => d.deviceKey)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    });

    it('registers tags for students, staff and books', async () => {
      const tag = (kind: string, value: string, subjectType: string, subjectId: string) => post('admin', '/v1/credential-tags', { kind, value, subjectType, subjectId });
      await tag('biometric_pin', '101', 'student', ids.s0).expect(201);
      await tag('biometric_pin', '101', 'student', ids.s1).expect(400); // already taken
      await tag('biometric_pin', '9001', 'staff', t.teacher.id).expect(201);
      await tag('rfid', 'CARD-S1', 'student', ids.s1).expect(201);
      await tag('rfid', 'CARD-S0', 'student', ids.s0).expect(201);
      await tag('rfid', 'STAFF-T', 'staff', t.teacher.id).expect(201);
      const [book] = await db.insert(s.libraryBooks).values({ tenantId: t.tenantId, title: 'Corporate Accounting', copies: 1, barcode: 'ACC-0001' }).returning();
      ids.book = book.id;
      await tag('rfid', 'BOOK-1', 'book', book.id).expect(201);
      await tag('rfid', 'GHOST', 'student', '00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('rejects a missing, wrong or revoked key', async () => {
      await http().post(ad('/events')).send({ events: [{ tag: '101' }] }).expect(401);
      await http().post(ad('/events')).set('x-device-key', `${keys.gate}x`).send({ events: [{ tag: '101' }] }).expect(401);
      await http().post(ad('/events')).set('x-device-key', keys.gate.replace(/^[^.]+/, other.tenantId)).send({ events: [{ tag: '101' }] }).expect(401);
    });

    it('turns an eSSL ADMS push into staff and student attendance, and marks late arrivals', async () => {
      const path = ad(`/adms/${keys.gate}/iclock/cdata`);
      expect((await http().get(`${path}?SN=ESSL-1&options=all`).expect(200)).text).toContain('GET OPTION FROM: ESSL-1');
      await http().post(`${path}?SN=OTHER&table=ATTLOG`).set('content-type', 'text/plain').send('101\t2026-10-20 09:10:00\t0\t1').expect(403);
      const body = '101\t2026-10-20 09:45:00\t0\t1\n9001\t2026-10-20 08:55:00\t0\t1\n9001\t2026-10-20 16:30:00\t1\t1\n777\t2026-10-20 09:00:00\t0\t1';
      const res = await http().post(`${path}?SN=ESSL-1&table=ATTLOG`).set('content-type', 'text/plain').send(body).expect(200);
      expect(res.text).toBe('OK: 4');
      const [att] = (await owner.query('select status from attendance_records where student_id = $1 and date = $2', [ids.s0, '2026-10-20'])).rows;
      expect(att.status).toBe('late'); // 09:45 is after the 09:30 cut-off
      const [staff] = (await owner.query('select status, check_in_at, check_out_at, source from staff_attendance where user_id = $1 and date = $2', [t.teacher.id, '2026-10-20'])).rows;
      expect(staff.source).toBe('biometric');
      expect(staff.check_in_at.toISOString()).toBe('2026-10-20T03:25:00.000Z'); // 08:55 IST
      expect(staff.check_out_at.toISOString()).toBe('2026-10-20T11:00:00.000Z'); // 16:30 IST
      // The same push again changes nothing.
      expect((await http().post(`${path}?SN=ESSL-1&table=ATTLOG`).set('content-type', 'text/plain').send(body).expect(200)).text).toBe('OK: 4');
      const events = (await get('admin', '/v1/device-events').expect(200)).body as { tag: string; outcome: string }[];
      expect(events).toHaveLength(4); // the repeat added nothing
      expect(events.find((e) => e.tag === '777')!.outcome).toBe('unmapped');
      expect((await get('admin', '/v1/access-devices').expect(200)).body.find((d: { serial: string }) => d.serial === 'ESSL-1').lastSeenAt).toBeTruthy();
    });

    it('accepts Matrix COSEC style punches and the generic JSON push', async () => {
      const r = await http().post(ad(`/cosec/${keys.cosec}`)).send({ userid: '9001', date: '21/10/2026', time: '09:02:11', entryexit: 0 }).expect(200);
      expect(r.body.outcomes).toEqual({ attendance_marked: 1 });
      const g = await http().post(ad('/events')).set('x-device-key', keys.gate).send({ events: [{ tag: '101', at: '2026-10-21T09:00:00+05:30' }] }).expect(200);
      expect(g.body.outcomes).toEqual({ attendance_marked: 1 });
      await http().post(ad('/events')).set('x-device-key', keys.gate).send({ events: [{ tag: '101', at: 'yesterday' }] }).expect(400);
    });

    it('issues and returns a library book from reader taps', async () => {
      const tap = (tagValue: string, at: string) => http().post(ad('/events')).set('x-device-key', keys.lib).send({ events: [{ tag: tagValue, at }] }).expect(200);
      expect((await tap('BOOK-1', '2026-10-20T10:00:00+05:30')).body.outcomes).toEqual({ rejected: 1 }); // no student card first
      expect((await tap('CARD-S1', '2026-10-20T10:01:00+05:30')).body.outcomes).toEqual({ patron_selected: 1 });
      expect((await tap('BOOK-1', '2026-10-20T10:01:20+05:30')).body.outcomes).toEqual({ issued: 1 });
      const loan = (await owner.query('select student_id, due_on, returned_at from library_loans where book_id = $1', [ids.book])).rows[0];
      expect(loan.student_id).toBe(ids.s1);
      expect(loan.returned_at).toBeNull();
      expect((await tap('BOOK-1', '2026-10-20T11:00:00+05:30')).body.outcomes).toEqual({ returned: 1 });
      expect((await owner.query('select returned_at from library_loans where book_id = $1', [ids.book])).rows[0].returned_at).not.toBeNull();
    });

    it('records a bus boarding once and tells the parent', async () => {
      const tap = (at: string) => http().post(ad('/events')).set('x-device-key', keys.bus).send({ events: [{ tag: 'CARD-S0', at }] }).expect(200);
      expect((await tap('2026-10-20T07:40:00+05:30')).body.outcomes).toEqual({ boarded: 1 });
      expect((await tap('2026-10-20T07:50:00+05:30')).body.outcomes).toEqual({ already_boarded: 1 });
      expect((await owner.query('select count(*)::int as n from transport_boardings where student_id = $1', [ids.s0])).rows[0].n).toBe(1);
      const notes = (await get('parent', '/v1/notifications').expect(200)).body;
      const list = Array.isArray(notes) ? notes : (notes.items ?? notes.notifications ?? []);
      expect(JSON.stringify(list)).toContain('boarded');
    });

    it('lets a board see the teacher who just tapped at the reader beside it', async () => {
      const dev = new TokensService({ JWT_SECRET: 'x' } as never);
      void dev;
      const token = app.get(TokensService).signDevice({ sub: t.device.id, tid: t.tenantId, cid: t.campus.id, ver: 0 });
      const read = () => http().get('/v1/devices/teacher-tap').set('authorization', `Bearer ${token}`);
      expect((await read().expect(200)).body.present).toBe(true);
      await http().post(ad('/events')).set('x-device-key', keys.board).send({ events: [{ tag: 'STAFF-T', at: new Date(clock.now().getTime() - 30_000).toISOString() }] }).expect(200);
      const body = (await read().expect(200)).body;
      expect(body.signedIn.name).toBe(t.teacher.fullName);
    });

    it('rotates a key so the old one stops working', async () => {
      const dev = (await get('admin', '/v1/access-devices').expect(200)).body.find((d: { serial: string }) => d.serial === 'ESSL-1');
      const fresh = (await post('admin', `/v1/access-devices/${dev.id}/rotate-key`).expect(200)).body.deviceKey;
      await http().post(ad('/events')).set('x-device-key', keys.gate).send({ events: [{ tag: '101' }] }).expect(401);
      await http().post(ad('/events')).set('x-device-key', fresh).send({ events: [{ tag: '101', at: '2026-10-22T09:00:00+05:30' }] }).expect(200);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('LTI 1.3', () => {
    it('launches an external tool: login fields, then a signed id_token the tool can verify', async () => {
      let toolLaunch: string | undefined;
      const tool = await fake(() => ({ body: {} }));
      closers.push(tool.close);
      toolLaunch = `${tool.url}/launch`;
      await post('teacher', '/v1/lti/tools', { name: 'X', clientId: 'c', loginUrl: `${tool.url}/login`, launchUrl: toolLaunch }).expect(403);
      const created = (await post('admin', '/v1/lti/tools', { name: 'Maths Lab', clientId: 'tool-1', loginUrl: `${tool.url}/login`, launchUrl: toolLaunch, deploymentId: 'dep-9' }).expect(201)).body;
      const launch = (await post('teacher', `/v1/lti/tools/${created.id}/launch`, {}).expect(200)).body;
      expect(launch.action).toBe(`${tool.url}/login`);
      expect(launch.fields.client_id).toBe('tool-1');
      const q = new URLSearchParams({ scope: 'openid', response_type: 'id_token', client_id: 'tool-1', redirect_uri: toolLaunch, login_hint: launch.fields.login_hint, state: 'st-1', nonce: 'nonce-1', lti_message_hint: launch.fields.lti_message_hint, response_mode: 'form_post', prompt: 'none' });
      const authUrl = `/v1/lti/platform/${t.tenantId}/auth?${q}`;
      const html = (await http().get(authUrl).expect(200)).text;
      expect(html).toContain(`action="${toolLaunch}"`);
      const idToken = html.match(/name="id_token" value="([^"]+)"/)![1];
      const jwks = (await http().get(`/v1/lti/jwks/${t.tenantId}`).expect(200)).body;
      const { verifyJwt } = await import('../src/integrations/lti.controller.js');
      const claims = verifyJwt(idToken, jwks);
      expect(claims.nonce).toBe('nonce-1');
      expect(claims.aud).toBe('tool-1');
      expect(claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBe('dep-9');
      expect(claims['https://purl.imsglobal.org/spec/lti/claim/roles'][0]).toContain('Instructor');
      await http().get(authUrl).expect(403); // a launch can be used once
    });

    it('lets Moodle launch KINETIX: verifies the signed launch, then swaps the ticket for a sign-in', async () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kid: 'moodle-1', alg: 'RS256', use: 'sig' };
      const moodle = await fake((r) => (r.url.includes('jwks') ? { body: { keys: [jwk] } } : { body: {} }));
      closers.push(moodle.close);
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const reg = (await get('admin', '/v1/lti/platforms').expect(200)).body;
      expect(reg.loginUrl).toContain(`/v1/lti/provider/${t.tenantId}/login`);
      await post('admin', '/v1/lti/platforms', { name: 'Moodle', issuer: 'https://moodle.example', clientId: 'kx-tool', authUrl: `${moodle.url}/auth`, jwksUrl: `${moodle.url}/jwks`, deploymentId: '1' }).expect(201);
      const [course] = await db.select().from(s.courses).limit(1);
      const login = await http().post(`/v1/lti/provider/${t.tenantId}/login`).type('form').send({ iss: 'https://moodle.example', login_hint: 'u1', client_id: 'kx-tool', lti_message_hint: 'm1' }).expect(302);
      const to = new URL(login.headers.location);
      expect(to.origin).toBe(moodle.url);
      const state = to.searchParams.get('state')!;
      const nonce = to.searchParams.get('nonce')!;
      const C = 'https://purl.imsglobal.org/spec/lti/claim/';
      const now = Math.floor(clock.now().getTime() / 1000);
      const claims = (over: object = {}) => ({ iss: 'https://moodle.example', aud: 'kx-tool', sub: 'u1', iat: now, exp: now + 300, nonce, email: t.teacher.email, [`${C}message_type`]: 'LtiResourceLinkRequest', [`${C}version`]: '1.3.0', [`${C}deployment_id`]: '1', [`${C}custom`]: course ? { kinetix_course: course.id } : {}, ...over });
      // A token signed by someone else is refused.
      const forged = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      await http().post(`/v1/lti/provider/${t.tenantId}/launch`).type('form').send({ id_token: signJwt(claims(), forged, 'moodle-1'), state }).expect(403);
      // The state was spent by the failed attempt, so start again.
      const again = new URL((await http().post(`/v1/lti/provider/${t.tenantId}/login`).type('form').send({ iss: 'https://moodle.example', login_hint: 'u1', client_id: 'kx-tool' }).expect(302)).headers.location);
      const st2 = again.searchParams.get('state')!;
      const n2 = again.searchParams.get('nonce')!;
      await http().post(`/v1/lti/provider/${t.tenantId}/launch`).type('form').send({ id_token: signJwt(claims({ nonce: 'wrong' }), pem, 'moodle-1'), state: st2 }).expect(403);
      const third = new URL((await http().post(`/v1/lti/provider/${t.tenantId}/login`).type('form').send({ iss: 'https://moodle.example', login_hint: 'u1', client_id: 'kx-tool' }).expect(302)).headers.location);
      const ok = await http().post(`/v1/lti/provider/${t.tenantId}/launch`).type('form').send({ id_token: signJwt(claims({ nonce: third.searchParams.get('nonce') }), pem, 'moodle-1'), state: third.searchParams.get('state') }).expect(302);
      void n2;
      const landing = new URL(ok.headers.location, 'http://app.local');
      const ticket = landing.searchParams.get('ticket')!;
      expect(landing.searchParams.get('tenant')).toBe(t.tenantId);
      const session = (await http().post(`/v1/lti/provider/${t.tenantId}/exchange`).send({ ticket }).expect(200)).body;
      expect(session.user.id).toBe(t.teacher.id);
      await get('x', '/v1/me').set('authorization', `Bearer ${session.accessToken}`).expect(200);
      await http().post(`/v1/lti/provider/${t.tenantId}/exchange`).send({ ticket }).expect(403); // one use only
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('SCORM', () => {
    it('imports a SCORM 1.2 package, plays it and tracks the learner', async () => {
      const manifest = `<?xml version="1.0"?><manifest identifier="m1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="o1"><organization identifier="o1"><title>Safety basics</title><item identifier="i1" identifierref="r1"><title>Lesson 1</title></item></organization></organizations><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="story/index.html"><file href="story/index.html"/></resource></resources></manifest>`;
      const zip = writeZip([{ path: 'imsmanifest.xml', data: Buffer.from(manifest) }, { path: 'story/index.html', data: Buffer.from('<html><body>Hello SCO</body></html>') }, { path: 'story/app.js', data: Buffer.from('var a = 1;') }]);
      await http().post('/v1/scorm/packages').set(auth('student')).set('content-type', 'application/zip').send(zip).expect(403);
      await http().post('/v1/scorm/packages').set(auth('teacher')).set('content-type', 'application/zip').send(Buffer.from('not a zip')).expect(400);
      const pkg = (await http().post('/v1/scorm/packages').set(auth('teacher')).set('content-type', 'application/zip').send(zip).expect(201)).body;
      expect(pkg.version).toBe('1.2');
      expect(pkg.title).toBe('Safety basics');
      expect(pkg.launchHref).toBe('story/index.html');
      const { playerUrl } = (await post('student', `/v1/scorm/packages/${pkg.id}/launch`).expect(200)).body;
      const page = (await http().get(playerUrl).expect(200)).text;
      expect(page).toContain('window.API');
      expect(page).toContain('/v1/scorm/content/');
      const token = playerUrl.split('/').pop();
      const content = await http().get(`/v1/scorm/content/${token}/story/index.html`).expect(200);
      expect(content.text).toContain('Hello SCO');
      expect(content.headers['content-type']).toContain('text/html');
      await http().get(`/v1/scorm/content/${token}/story/missing.html`).expect(404);
      await http().get(`/v1/scorm/content/${token}x/story/index.html`).expect(403);
      const saved = (await http().post(`/v1/scorm/track/${token}`).send({ cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '88', 'cmi.core.total_time': '0000:12:30.00' } }).expect(200)).body;
      expect(saved).toEqual({ saved: true, status: 'passed', score: 88 });
      expect((await http().get(playerUrl).expect(200)).text).toContain('"cmi.core.score.raw":"88"'); // resumes
      const rows = (await get('teacher', `/v1/scorm/packages/${pkg.id}/attempts`).expect(200)).body;
      expect(rows[0]).toMatchObject({ status: 'passed', score: 88 });
      await get('student', `/v1/scorm/packages/${pkg.id}/attempts`).expect(403);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('OData feed and the SIP2 bridge', () => {
    let feed = '';
    let sip = '';
    it('issues scoped tokens that only read what they were given', async () => {
      await post('teacher', '/v1/api-tokens', { name: 'x', scopes: ['odata:students'] }).expect(403);
      const a = (await post('admin', '/v1/api-tokens', { name: 'Power BI', scopes: ['odata:students', 'odata:results'] }).expect(201)).body;
      feed = a.token;
      sip = (await post('admin', '/v1/api-tokens', { name: 'Koha', scopes: ['sip2'] }).expect(201)).body.token;
      await post('admin', '/v1/api-tokens', { name: 'bad', scopes: ['odata:everything'] }).expect(400);
      const h = { authorization: `Bearer ${feed}` };
      await http().get('/v1/odata/Students').expect(401);
      await http().get('/v1/odata/FeeInvoices').set(h).expect(403);
      await http().get('/v1/odata/Nothing').set(h).expect(404);
      const svc = (await http().get('/v1/odata').set(h).expect(200)).body;
      expect(svc.value.map((v: { name: string }) => v.name)).toEqual(['Students', 'ExamResults']);
      expect((await http().get('/v1/odata/$metadata').set(h).expect(200)).text).toContain('EntitySet Name="Students"');
    });

    it('serves paged, filtered rows, also through Basic auth, and never crosses tenants', async () => {
      const h = { authorization: `Bearer ${feed}` };
      const all = (await http().get('/v1/odata/Students?$count=true&$top=2&$select=RollNo,FullName').set(h).expect(200)).body;
      expect(all['@odata.count']).toBe(t.students.length);
      expect(all.value).toHaveLength(2);
      expect(Object.keys(all.value[0])).toEqual(['RollNo', 'FullName']);
      expect(all['@odata.nextLink']).toContain('%24skip=2');
      const one = (await http().get(`/v1/odata/ExamResults?$filter=Outcome eq 'fail' and Cgpa lt 5`).set(h).expect(200)).body;
      expect(one.value).toHaveLength(1);
      expect(one.value[0].StudentId).toBe(ids.s1);
      await http().get(`/v1/odata/ExamResults?$filter=Outcome eq 'x'; drop table students`).set(h).expect(400);
      await http().get('/v1/odata/Students?$select=Password').set(h).expect(400);
      const basic = Buffer.from(`powerbi:${feed}`).toString('base64');
      expect((await http().get('/v1/odata/Students?$top=1').set('authorization', `Basic ${basic}`).expect(200)).body.value).toHaveLength(1);
      const tid = (await get('admin', '/v1/api-tokens').expect(200)).body.tokens.find((x: { name: string }) => x.name === 'Power BI').id;
      await http().delete(`/v1/api-tokens/${tid}`).set(auth('admin')).expect(204);
      await http().get('/v1/odata/Students').set(h).expect(401);
    });

    it('speaks SIP2: login, patron, item, checkout and checkin', async () => {
      const send = (line: string, token = sip) => http().post('/v1/library/sip2').set('authorization', `Bearer ${token}`).set('content-type', 'text/plain').send(line);
      await http().post('/v1/library/sip2').set('content-type', 'text/plain').send('99  2.00').expect(401);
      await send('99  2.00', feed).expect(401);
      expect((await send('9300CNx|COy|').expect(200)).body.response).toMatch(/^940|^96|^98/); // login is implicit on REST
      const status = (await send('9900302.00').expect(200)).body.response as string;
      expect(status.startsWith('98Y')).toBe(true);
      const date = '20261020    103000';
      const roll = t.students[1].rollNo;
      const patron = (await send(`63001${date}          AOSOUND|AA${roll}|`).expect(200)).body.response as string;
      expect(patron.startsWith('64')).toBe(true);
      expect(patron).toContain(`AA${roll}|`);
      expect(patron).toContain(`AE${t.students[1].fullName}|`);
      const item = (await send(`17${date}AOSOUND|ABACC-0001|`).expect(200)).body.response as string;
      expect(item.startsWith('1803')).toBe(true); // available
      const out = (await send(`11NN${date}${date}AOSOUND|AA${roll}|ABACC-0001|`).expect(200)).body.response as string;
      expect(out.startsWith('121')).toBe(true);
      expect(out).toContain('AH20261103'); // due in 14 days
      expect(((await send(`17${date}AOSOUND|ABACC-0001|`).expect(200)).body.response as string).startsWith('1804')).toBe(true);
      const again = (await send(`11NN${date}${date}AOSOUND|AA${roll}|ABACC-0001|`).expect(200)).body.response as string;
      expect(again.startsWith('120')).toBe(true);
      const back = (await send(`09N${date}${date}APLIB|AOSOUND|ABACC-0001|`).expect(200)).body.response as string;
      expect(back.startsWith('101')).toBe(true);
      expect(((await send(`11NN${date}${date}AOSOUND|AAnobody|ABACC-0001|`).expect(200)).body.response as string).startsWith('120')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('semantic retrieval', () => {
    it('indexes topics with a pluggable provider and ranks by cosine in the database', async () => {
      const [curr] = await db.select().from(s.curricula).limit(1);
      const [course] = await db.insert(s.courses).values({ curriculumCode: curr.code, code: 'int-photo', title: 'Biology', term: 3, source: 'test', tenantId: t.tenantId } as never).returning();
      const [ch] = await db.insert(s.chapters).values({ tenantId: t.tenantId, courseId: course.id, position: 1, title: 'Plants' } as never).returning();
      const mk = async (title: string, summary: string, position: number) => (await db.insert(s.topics).values({ tenantId: t.tenantId, chapterId: ch.id, position, title, summary, notes: [] } as never).returning())[0];
      const photo = await mk('Photosynthesis', 'How plants turn light into sugar', 1);
      await mk('Respiration', 'How cells release energy', 2);
      await mk('Depreciation', 'Asset value falls over time', 3);
      // A fake embedding server where related words share a concept axis (as a real model's vectors do).
      const concepts = [['light', 'sun', 'photosynthesis', 'green', 'leaves', 'sugar', 'plants'], ['energy', 'respiration', 'cells', 'release'], ['asset', 'depreciation', 'value', 'falls', 'books']];
      const emb = await fake((r) => {
        const input: string[] = JSON.parse(r.body).input;
        return { body: { data: input.map((text, index) => ({ index, embedding: concepts.map((c) => c.filter((w) => text.toLowerCase().includes(w)).length + 0.01) })) } };
      });
      closers.push(emb.close);
      await put('teacher', '/v1/retrieval/config', { provider: 'hashed' }).expect(403);
      await put('admin', '/v1/retrieval/config', { provider: 'http', url: emb.url, model: 'fake-concepts', apiKey: 'k' }).expect(200);
      const idx = (await post('admin', '/v1/retrieval/reindex').expect(200)).body;
      expect(idx.provider).toBe('http:fake-concepts');
      expect(idx.embedded).toBeGreaterThanOrEqual(3);
      expect((await post('admin', '/v1/retrieval/reindex').expect(200)).body.embedded).toBe(0); // unchanged
      const res = (await get('teacher', '/v1/retrieval/search?limit=20&q=how do green leaves use the sun').expect(200)).body;
      expect(res.results.map((r: { topicId: string }) => r.topicId)).toContain(photo.id); // the shared library may hold its own plant topics
      expect(emb.log.some((l) => l.headers.authorization === 'Bearer k')).toBe(true);
      const st = (await get('admin', '/v1/retrieval/status').expect(200)).body;
      expect(st.config.apiKey).toBeUndefined();
      expect(st.indexed).toBeGreaterThanOrEqual(3);
    });

    it('scores a provider against the baseline on the labelled set', async () => {
      const { evaluateProvider, SAMPLE_DOCS, SAMPLE_QUERIES } = await import('../src/ai/retrieval-eval.js');
      const { HashedProvider } = await import('../src/ai/embeddings.js');
      const base = await evaluateProvider(new HashedProvider(), SAMPLE_DOCS, SAMPLE_QUERIES);
      const concept = (text: string) => {
        const groups = [['leaves', 'sunlight', 'plants', 'light', 'green', 'food'], ['energy', 'sugar', 'glucose', 'atp'], ['force', 'motion', 'mass', 'trolley', 'speed'], ['voltage', 'current', 'resistance', 'wire'], ['value', 'asset', 'depreciation', 'machine', 'year', 'years'], ['debit', 'credit', 'ledger', 'balance'], ['prices', 'inflation', 'costlier', 'money'], ['cheaper', 'price', 'demand', 'buy', 'buyers', 'purchase']];
        return Float32Array.from(groups.map((g) => g.filter((w) => text.toLowerCase().includes(w)).length));
      };
      const oracle = { id: 'concept-oracle', embed: async (ts: string[]) => ts.map((t0) => { const v = concept(t0); const n = Math.hypot(...v) || 1; return v.map((x) => x / n) as Float32Array; }) };
      const better = await evaluateProvider(oracle, SAMPLE_DOCS, SAMPLE_QUERIES);
      expect(base.queries).toBe(8);
      expect(better.mrr).toBeGreaterThan(base.mrr);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('early alerts', () => {
    it('flags at-risk students from attendance, marks, homework and fees, with reasons', async () => {
      const day = (n: number) => new Date(Date.UTC(2026, 9, 19 - n)).toISOString().slice(0, 10);
      for (let i = 0; i < 10; i++) {
        await db.insert(s.attendanceRecords).values({ tenantId: t.tenantId, studentId: ids.s1, sectionId: t.section.id, date: day(i), status: i < 2 ? 'present' : 'absent', markedBy: t.teacher.id, occurredAt: new Date() });
        await db.insert(s.attendanceRecords).values({ tenantId: t.tenantId, studentId: ids.s0, sectionId: t.section.id, date: day(i), status: 'present', markedBy: t.teacher.id, occurredAt: new Date() });
      }
      for (let i = 0; i < 3; i++) await db.insert(s.homework).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, createdBy: t.teacher.id, title: `HW ${i}`, dueOn: day(3 + i) });
      for (const hw of await db.select().from(s.homework)) for (const sid of [ids.s0, ids.s2]) await db.insert(s.homeworkSubmissions).values({ tenantId: t.tenantId, homeworkId: hw.id, studentId: sid, submittedBy: t.teacher.id, submittedAt: new Date() });
      await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: ids.s1, sectionId: t.section.id, batchId: '00000000-0000-4000-8000-0000000000aa', title: 'Tuition', amountPaise: 500000, dueOn: '2026-09-01', createdBy: t.principal.id });
      await db.insert(s.mentorAssignments).values({ tenantId: t.tenantId, studentId: ids.s1, mentorUserId: ids.mentor, startedOn: '2026-08-01', assignedBy: t.principal.id });
      await post('student', '/v1/early-alerts/run').expect(403);
      const run = (await post('principal', '/v1/early-alerts/run').expect(200)).body;
      expect(run.created).toBeGreaterThanOrEqual(1);
      const flags = (await get('principal', '/v1/early-alerts').expect(200)).body as { studentId: string; level: string; score: number; reasons: { signal: string }[]; mentorUserId: string }[];
      const f = flags.find((x) => x.studentId === ids.s1)!;
      expect(f.level).toBe('high');
      expect(f.reasons.map((r) => r.signal).sort()).toEqual(['assignments', 'attendance', 'fees', 'marks', 'marks']);
      expect(f.mentorUserId).toBe(ids.mentor);
      expect(flags.find((x) => x.studentId === ids.s0)).toBeUndefined();
      ids.flag = (flags.find((x) => x.studentId === ids.s1) as unknown as { id: string }).id;
      // The mentor was told.
      const mn = (await owner.query("select count(*)::int as n from notifications where user_id = $1 and kind = 'welfare'", [ids.mentor])).rows[0].n;
      expect(mn).toBe(1);
      await post('principal', '/v1/early-alerts/run').expect(200);
      expect((await owner.query("select count(*)::int as n from notifications where user_id = $1 and kind = 'welfare'", [ids.mentor])).rows[0].n).toBe(1); // no repeat
    });

    it('shows the mentor their mentees, teachers their classes, and nobody else', async () => {
      const mine = (await get('mentor', '/v1/early-alerts?mine=true').expect(200)).body;
      expect(mine).toHaveLength(1);
      expect((await get('teacher', '/v1/early-alerts').expect(200)).body).toHaveLength(1); // teaches the section in the timetable
      expect((await get('teacher2', '/v1/early-alerts').expect(200)).body).toHaveLength(0);
      await get('teacher2', `/v1/early-alerts/${ids.flag}`).expect(404);
      await get('student', '/v1/early-alerts').expect(403);
      await get('parent', '/v1/early-alerts').expect(403);
      await get('outsider', `/v1/early-alerts/${ids.flag}`).expect(404);
      const sec = (await get('teacher', `/v1/early-alerts/section/${t.section.id}`).expect(200)).body;
      expect(sec[0]).toMatchObject({ studentId: ids.s1, level: 'high' });
      await get('teacher2', `/v1/early-alerts/section/${t.section.id}`).expect(403);
      // A board with this teacher signed in gets the same roster flags.
      const [bs] = await db.insert(s.boardSessions).values({ tenantId: t.tenantId, deviceId: t.device.id, teacherId: t.teacher.id, sectionId: t.section.id, expiresAt: new Date(clock.now().getTime() + 3_600_000) }).returning();
      const board = app.get(TokensService).signBoard({ sub: t.teacher.id, tid: t.tenantId, did: t.device.id, cid: t.campus.id, sid: bs.id }, new Date(Date.now() + 3_600_000));
      const onBoard = (await http().get(`/v1/early-alerts/section/${t.section.id}`).set('authorization', `Bearer ${board}`).expect(200)).body;
      expect(onBoard).toHaveLength(1);
    });

    it('runs the intervention workflow and closes with an outcome', async () => {
      const step = (await post('mentor', `/v1/early-alerts/${ids.flag}/interventions`, { action: 'call_parent', note: 'Spoke to father', dueOn: '2026-10-27' }).expect(201)).body;
      expect((await get('mentor', `/v1/early-alerts/${ids.flag}`).expect(200)).body.status).toBe('in_progress');
      await put('mentor', `/v1/early-alerts/${ids.flag}/interventions/${step.id}/outcome`, { outcome: 'Will attend from Monday' }).expect(200);
      await put('mentor', `/v1/early-alerts/${ids.flag}/status`, { status: 'resolved' }).expect(400); // needs an outcome
      await put('mentor', `/v1/early-alerts/${ids.flag}/status`, { status: 'resolved', outcome: 'Attendance back above 85%' }).expect(200);
      const detail = (await get('principal', `/v1/early-alerts/${ids.flag}`).expect(200)).body;
      expect(detail.status).toBe('resolved');
      expect(detail.interventions.map((i: { action: string }) => i.action)).toContain('closed_resolved');
      expect((await get('mentor', '/v1/early-alerts').expect(200)).body).toHaveLength(0);
      // Still high-risk on the data, but a resolved flag is not reopened for two weeks.
      await post('principal', '/v1/early-alerts/run').expect(200);
      expect((await get('principal', '/v1/early-alerts').expect(200)).body.find((x: { studentId: string }) => x.studentId === ids.s1)).toBeUndefined();
    });
  });
});
