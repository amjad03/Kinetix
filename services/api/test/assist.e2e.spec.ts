import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { addMonths, daysUntil, probationEnd } from '../src/hr/probation-math.js';
import { issueWindows, newSigningKeyPair, rawPublicKey, signOfflineCode, verifyOfflineCode } from '../src/pairing/offline-code.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('probation, transfers, certificates, marking help and offline pairing', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
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
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@assist.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const hod = await addUser('Hari Hod', 'hod');
    const hod2 = await addUser('Hita Hod', 'hod');
    const newbie = await addUser('Nina New', 'teacher');
    app = await createApp(clock);
    tokens = {
      hr: await login(t.slug, hr.email!),
      hod: await login(t.slug, hod.email!),
      hod2: await login(t.slug, hod2.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      newbie: await login(t.slug, newbie.email!),
      principal: await login(t.slug, t.principal.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    Object.assign(ids, { hr: hr.id, hod: hod.id, newbie: newbie.id });
    const [commerce] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    const [science] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Science', headUserId: hod2.id }).returning();
    const [desig] = await db.insert(s.designations).values({ tenantId: t.tenantId, name: 'Assistant Professor' }).returning();
    const [senior] = await db.insert(s.designations).values({ tenantId: t.tenantId, name: 'Associate Professor' }).returning();
    Object.assign(ids, { commerce: commerce.id, science: science.id, desig: desig.id, senior: senior.id });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'E100', departmentId: commerce.id, designationId: desig.id, dateOfJoining: '2026-04-20', employmentType: 'probation' });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: newbie.id, employeeCode: 'E200', departmentId: science.id, dateOfJoining: '2026-10-01', employmentType: 'probation' });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('works out probation dates', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(probationEnd('2026-04-20')).toBe('2026-10-20');
    expect(daysUntil('2026-10-20', '2026-10-27')).toBe(7);
  });

  it('lists probationers who are due, to HR and the HoD of that department only', async () => {
    const hr = (await get('hr', '/v1/hr/probation').expect(200)).body;
    expect(hr.map((r: { employeeCode: string }) => r.employeeCode)).toEqual(['E100']);
    expect(hr[0]).toMatchObject({ dueOn: '2026-10-20', daysLeft: 0, due: true });
    expect((await get('hr', '/v1/hr/probation?all=1').expect(200)).body).toHaveLength(2);
    expect((await get('hod', '/v1/hr/probation').expect(200)).body).toHaveLength(1);
    expect((await get('hod2', '/v1/hr/probation').expect(200)).body).toEqual([]);
    await get('teacher', '/v1/hr/probation').expect(403);
    await get('outsider', '/v1/hr/probation').expect(200).then((r) => expect(r.body).toEqual([]));
  });

  it('takes the HoD recommendation, then the principal confirms or extends and the letter is a PDF', async () => {
    const u = `/v1/hr/probation/${t.teacher.id}`;
    await post('hod2', `${u}/recommend`, { recommendation: 'confirm' }).expect(403);
    await post('principal', `${u}/decide`, { decision: 'confirm' }).expect(409); // the HoD has not recommended yet
    await post('hod', `${u}/decide`, { decision: 'confirm' }).expect(403);
    const rec = (await post('hod', `${u}/recommend`, { recommendation: 'extend', remarks: 'Needs another term of mentoring.' }).expect(200)).body;
    expect(rec).toMatchObject({ status: 'recommended', recommendation: 'extend', dueOn: '2026-10-20' });

    const ext = (await post('principal', `${u}/decide`, { decision: 'extend', extendMonths: 3, remarks: 'Extended on the HoD advice.' }).expect(200)).body;
    expect(ext).toMatchObject({ status: 'extended', extendedUntil: '2027-01-20' });
    expect((await get('hr', '/v1/hr/probation').expect(200)).body).toEqual([]); // next review is not due for months
    const next = (await get('hr', '/v1/hr/probation?all=1').expect(200)).body.find((r: { userId: string }) => r.userId === t.teacher.id);
    expect(next).toMatchObject({ dueOn: '2027-01-20', review: { status: 'pending' } });

    const letter = await get('teacher', `/v1/hr/probation/reviews/${ext.id}/letter`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((letter.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await get('teacher2', `/v1/hr/probation/reviews/${ext.id}/letter`).expect(404);

    // Confirm the newcomer (no recommendation needed when the department head is the one who did not... here the HoD recommends first).
    await post('hod2', `/v1/hr/probation/${ids.newbie}/recommend`, { recommendation: 'confirm' }).expect(200);
    const ok = (await post('principal', `/v1/hr/probation/${ids.newbie}/decide`, { decision: 'confirm' }).expect(200)).body;
    expect(ok.status).toBe('confirmed');
    const [sp] = (await owner.query('select employment_type from staff_profiles where user_id = $1', [ids.newbie])).rows;
    expect(sp.employment_type).toBe('permanent');
    await post('principal', `/v1/hr/probation/${ids.newbie}/decide`, { decision: 'confirm' }).expect(409); // no longer on probation
    expect((await get('hr', `/v1/hr/probation/${ids.newbie}/history`).expect(200)).body).toHaveLength(1);
  });

  it('transfers staff on an effective date and keeps the history', async () => {
    const body = { userId: t.teacher.id, toDepartmentId: ids.science, toDesignationId: ids.senior, effectiveOn: '2026-11-15', reason: 'Cover for Science' };
    await post('teacher', '/v1/hr/transfers', body).expect(403);
    await post('hr', '/v1/hr/transfers', { ...body, toDepartmentId: undefined, toDesignationId: undefined }).expect(400);
    await post('hr', '/v1/hr/transfers', { ...body, toDepartmentId: ids.commerce, toDesignationId: ids.desig }).expect(400); // nothing changes
    const scheduled = (await post('hr', '/v1/hr/transfers', body).expect(201)).body;
    expect(scheduled).toMatchObject({ status: 'scheduled', fromDepartmentId: ids.commerce, toDepartmentId: ids.science, fromDesignationId: ids.desig });
    let [sp] = (await owner.query('select department_id from staff_profiles where user_id = $1', [t.teacher.id])).rows;
    expect(sp.department_id).toBe(ids.commerce);

    const imm = (await post('hr', '/v1/hr/transfers', { userId: ids.newbie, toDesignationId: ids.senior, effectiveOn: '2026-10-20', reason: 'Promoted' }).expect(201)).body;
    expect(imm.status).toBe('applied');
    const cancelMe = (await post('hr', '/v1/hr/transfers', { userId: ids.newbie, toDepartmentId: ids.commerce, effectiveOn: '2026-12-01' }).expect(201)).body;
    await post('hr', `/v1/hr/transfers/${cancelMe.id}/cancel`).expect(200);
    await post('hr', `/v1/hr/transfers/${cancelMe.id}/cancel`).expect(409);

    // The date comes: the move happens the next time the list is opened.
    clock.at = new Date('2026-11-15T05:00:00Z');
    const list = (await get('hr', `/v1/hr/transfers?userId=${t.teacher.id}`).expect(200)).body;
    expect(list[0]).toMatchObject({ status: 'applied', to: { department: 'Science', designation: 'Associate Professor' }, from: { department: 'Commerce' } });
    [sp] = (await owner.query('select department_id from staff_profiles where user_id = $1', [t.teacher.id])).rows;
    expect(sp.department_id).toBe(ids.science);
    const members = (await owner.query('select department_id from department_staff where user_id = $1', [t.teacher.id])).rows.map((r) => r.department_id);
    expect(members).toEqual([ids.science]);
    expect((await get('teacher', '/v1/hr/transfers').expect(200)).body).toHaveLength(1); // staff see their own history
    clock.at = new Date('2026-10-20T04:30:00Z');
  });

  it('attaches a training certificate: own record, PDF or image only, replaced on a new upload', async () => {
    const rec = (await post('teacher', '/v1/hr/training-records', { title: 'FDP on OBE', kind: 'fdp', startsOn: '2026-09-01', endsOn: '2026-09-03', hours: 18 }).expect(201)).body;
    const url = `/v1/hr/training-records/${rec.id}/certificate`;
    const up = (who: string, buf: Buffer, name = 'cert.pdf') => http().post(url).set(auth(who)).attach('file', buf, { filename: name, contentType: 'application/pdf' });
    await up('teacher2', pdf).expect(403);
    await up('teacher', Buffer.from('MZ not a document')).expect(400);
    await http().post(url).set(auth('teacher')).expect(400);
    const done = (await up('teacher', pdf).expect(201)).body;
    expect(done).toMatchObject({ certificateType: 'application/pdf', certificateName: 'cert.pdf' });
    const list = (await get('teacher', '/v1/hr/training-records').expect(200)).body;
    expect(list[0]).toMatchObject({ hasCertificate: true });
    expect(list[0].certificateKey).toBeUndefined();
    const dl = await get('hr', url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((dl.body as Buffer).equals(pdf)).toBe(true);
    await get('teacher2', url).expect(404);
    await up('hr', pdf, 'v2.pdf').expect(201);
    const [row] = (await owner.query('select certificate_name from training_records where id = $1', [rec.id])).rows;
    expect(row.certificate_name).toBe('v2.pdf');
  });

  it('keeps AI marking help a draft for homework: marks stay with the teacher', async () => {
    const [hw] = (await owner.query(`insert into homework (tenant_id, section_id, subject_id, created_by, title, due_on) values ($1, $2, $3, $4, 'Define goodwill', '2026-10-25') returning id`, [t.tenantId, t.section.id, t.subject.id, t.teacher.id])).rows;
    await owner.query(`insert into homework_submissions (tenant_id, homework_id, student_id, text, submitted_by, submitted_at) values ($1, $2, $3, 'Goodwill is the value of a good name.', $4, now())`, [t.tenantId, hw.id, t.students[0].id, t.studentUser.id]);
    const url = `/v1/grading-assist/homework/${hw.id}/${t.students[0].id}/suggest`;
    const q = { question: 'Define goodwill.', maxMarks: 5, rubric: [{ criterion: 'Definition', marks: 3 }, { criterion: 'Example', marks: 2 }] };
    await post('teacher2', url, q).expect(403);
    const empty = `/v1/grading-assist/homework/${hw.id}/${t.students[1].id}/suggest`;
    await post('teacher', empty, q).expect(404);
    const d = (await post('teacher', url, q).expect(200)).body;
    expect(d).toMatchObject({ kind: 'homework', preview: true, status: 'draft', maxMarks: 5 });
    expect(d.criteria.map((c: { criterion: string; max: number }) => [c.criterion, c.max])).toEqual([['Definition', 3], ['Example', 2]]);
    const done = (await put('teacher', `/v1/grading-assist/suggestions/${d.id}/decision`, { action: 'edit', marks: 4 }).expect(200)).body;
    expect(done).toMatchObject({ status: 'edited', finalMarks: 4 });
  });

  describe('offline board pairing', () => {
    let deviceToken: string;
    const dev = () => ({ authorization: `Bearer ${deviceToken}` });

    it('hands the Teacher App the public key and a board its signed codes', async () => {
      const key = (await get('teacher', '/v1/pairing/signing-key').expect(200)).body;
      expect(key).toMatchObject({ algorithm: 'Ed25519', tenantId: t.tenantId });
      expect(key.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(Buffer.from(key.publicKeyRaw, 'base64url')).toHaveLength(32);
      expect((await get('teacher2', '/v1/pairing/signing-key').expect(200)).body.keyId).toBe(key.keyId);
      expect((await get('outsider', '/v1/pairing/signing-key').expect(200)).body.keyId).not.toBe(key.keyId);
      const [stored] = (await owner.query('select private_key_enc from tenant_signing_keys where tenant_id = $1', [t.tenantId])).rows;
      expect(stored.private_key_enc).not.toContain('PRIVATE KEY');

      deviceToken = (await http().post('/v1/devices/enroll').send({ code: t.enrollmentCode, platform: 'android' }).expect(201)).body.deviceToken;
      await http().post('/v1/pairing/offline-codes').set(auth('teacher')).send({}).expect(403);
      await http().post('/v1/pairing/offline-codes').set(dev()).send({ hours: 100 }).expect(400);
      const issued = (await http().post('/v1/pairing/offline-codes').set(dev()).send({ hours: 3, windowMinutes: 60 }).expect(200)).body;
      expect(issued.codes).toHaveLength(3);
      expect(issued.keyId).toBe(key.keyId);

      // What the app does with no network: check a scanned code against the key it stored earlier.
      const nowSec = Math.floor(clock.now().getTime() / 1000);
      const first = issued.codes[0].token as string;
      const check = (token: string, at = nowSec, extra: object = {}) => verifyOfflineCode(key.publicKeyPem, token, { tenantId: t.tenantId, deviceId: t.device.id, now: at, ...extra });
      expect(check(first)).toMatchObject({ ok: true, payload: { t: t.tenantId, d: t.device.id } });
      expect(check(first, nowSec + 3 * 3600)).toEqual({ ok: false, reason: 'expired' });
      expect(check(issued.codes[2].token, nowSec)).toEqual({ ok: false, reason: 'not_yet_valid' });
      expect(check(issued.codes[2].token, nowSec + 2 * 3600 + 30)).toMatchObject({ ok: true });
      expect(check(first, nowSec, { tenantId: other.tenantId })).toEqual({ ok: false, reason: 'wrong_institution' });
      expect(check(first, nowSec, { deviceId: '00000000-0000-4000-8000-000000000000' })).toEqual({ ok: false, reason: 'wrong_board' });
      const [pre, body, sig] = first.split('.');
      const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), u: nowSec + 99999 })).toString('base64url');
      expect(check(`${pre}.${forged}.${sig}`)).toEqual({ ok: false, reason: 'bad_signature' });
      expect(check('garbage')).toEqual({ ok: false, reason: 'malformed' });
      // A code signed by some other key is refused.
      const stranger = newSigningKeyPair();
      expect(check(signOfflineCode(stranger.privateKeyPem, { v: 1, t: t.tenantId, d: t.device.id, k: 'x', n: 'n', f: nowSec, u: nowSec + 600 }))).toEqual({ ok: false, reason: 'bad_signature' });

      // The server runs the same check for apps that are online.
      expect((await post('teacher', '/v1/pairing/offline-verify', { token: first }).expect(200)).body).toMatchObject({ valid: true, keyCurrent: true, board: { id: t.device.id } });
      expect((await post('outsider', '/v1/pairing/offline-verify', { token: first }).expect(200)).body).toMatchObject({ valid: false });
    });

    it('rotating the key retires old codes; only an administrator may', async () => {
      const before = (await get('teacher', '/v1/pairing/signing-key').expect(200)).body;
      const issued = (await http().post('/v1/pairing/offline-codes').set(dev()).send({ hours: 1 }).expect(200)).body;
      await post('principal', '/v1/pairing/signing-key/rotate').expect(403);
      await post('teacher', '/v1/pairing/signing-key/rotate').expect(403);
      const [admin] = (await owner.query(`select u.email from users u join user_roles r on r.user_id = u.id where u.tenant_id = $1 and r.role = 'tenant_admin' limit 1`, [t.tenantId])).rows;
      if (admin) {
        tokens.admin = await login(t.slug, admin.email);
        const fresh = (await post('admin', '/v1/pairing/signing-key/rotate').expect(200)).body;
        expect(fresh.keyId).not.toBe(before.keyId);
        const nowSec = Math.floor(clock.now().getTime() / 1000);
        expect(verifyOfflineCode(fresh.publicKeyPem, issued.codes[0].token, { tenantId: t.tenantId, now: nowSec })).toEqual({ ok: false, reason: 'bad_signature' });
      }
    });

    it('builds windows that cover the requested hours', () => {
      const k = newSigningKeyPair();
      const w = issueWindows(k.privateKeyPem, { tenantId: 'T', deviceId: 'D', keyId: k.keyId }, 1000, 2, 30);
      expect(w).toHaveLength(4);
      expect(w[3].validUntil).toBe(1000 + 2 * 3600);
      expect(rawPublicKey(k.publicKeyPem)).toHaveLength(43);
    });
  });
});
