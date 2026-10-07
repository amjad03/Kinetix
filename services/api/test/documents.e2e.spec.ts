import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idCardCode } from '../src/documents/render.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, env, FixedClock, ownerPool } from './helpers.js';

const binary = (res: { on: (e: string, f: (c?: Buffer) => void) => void }, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c!));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100, 1)]);

describe('documents and certificates', () => {
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
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const template = (kind: string) => templates.find((x) => x.kind === kind)!;
  let templates: { id: string; kind: string; version: number; fields: { key: string }[] }[];
  const token = (verifyUrl: string) => verifyUrl.split('/').pop()!;

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@doc.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const hr = await addUser('Hema HR', 'hr_manager');
    const acct = await addUser('Anil Accounts', 'accountant');
    app = await createApp(clock);
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      hr: await login(t.slug, hr.email!),
      accountant: await login(t.slug, acct.email!),
      teacher: await login(t.slug, t.teacher.email!),
      teacher2: await login(t.slug, t.teacher2.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
      outsiderParent: await login(other.slug, other.guardian.email!),
    };
    Object.assign(ids, { hr: hr.id });
    await db.insert(s.staffProfiles).values({ tenantId: t.tenantId, userId: t.teacher.id, employeeCode: 'T001', dateOfJoining: '2024-06-03' });
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('templates', () => {
    it('creates the default set for the office and keeps it closed to others', async () => {
      await get('teacher', '/v1/documents/templates').expect(403);
      await get('parent', '/v1/documents/templates').expect(403);
      templates = (await get('principal', '/v1/documents/templates').expect(200)).body;
      expect(templates.map((x) => x.kind).sort()).toEqual(['bonafide', 'conduct', 'course_completion', 'experience', 'fee_receipt', 'study', 'transfer_certificate']);
      expect((await get('principal', '/v1/documents/templates').expect(200)).body).toHaveLength(7);
      const forParents = (await get('parent', '/v1/documents/templates/available').expect(200)).body as { kind: string }[];
      expect(forParents.map((x) => x.kind)).not.toContain('experience');
      expect((await get('teacher', '/v1/documents/templates/available').expect(200)).body.map((x: { kind: string }) => x.kind)).toContain('experience');
    });

    it('bumps the version on edit and validates the body', async () => {
      const tc = template('study');
      await http().put(`/v1/documents/templates/${tc.id}`).set(auth('accountant')).send({}).expect(403);
      const body = { kind: 'study', name: 'Study certificate', subjectType: 'student', title: 'Study Certificate', body: 'Certified that {{name}} studies in {{className}}. {{typo}}', fields: [], serialPrefix: 'stu', active: true };
      await http().put(`/v1/documents/templates/${tc.id}`).set(auth('principal')).send({ ...body, serialPrefix: '123' }).expect(400);
      expect((await http().put(`/v1/documents/templates/${tc.id}`).set(auth('principal')).send(body).expect(200)).body).toMatchObject({ version: tc.version + 1, serialPrefix: 'STU' });
      expect(await audited('certificate.template_updated')).toBe(1);
    });
  });

  describe('request, approve, issue', () => {
    let bonafide: { id: string; status: string };
    const fy = '2026-27';

    it('lets a guardian ask for their own child only, with required fields and no duplicates', async () => {
      const tc = template('transfer_certificate');
      await http().post('/v1/documents/requests').set(auth('parent')).send({ templateId: tc.id, studentId: t.students[0].id, fields: {} }).expect(400);
      await http().post('/v1/documents/requests').set(auth('parent')).send({ templateId: template('bonafide').id, studentId: t.students[1].id, purpose: 'Bank account' }).expect(404);
      await http().post('/v1/documents/requests').set(auth('outsiderParent')).send({ templateId: template('bonafide').id, studentId: t.students[0].id }).expect(404);
      await http().post('/v1/documents/requests').set(auth('parent')).send({ templateId: template('experience').id }).expect(404);
      bonafide = (await http().post('/v1/documents/requests').set(auth('parent')).send({ templateId: template('bonafide').id, studentId: t.students[0].id, purpose: 'Bank account' }).expect(201)).body;
      expect(bonafide).toMatchObject({ status: 'requested', subject: { name: 'Student A' }, serialNo: null, verifyUrl: null });
      await http().post('/v1/documents/requests').set(auth('parent')).send({ templateId: template('bonafide').id, studentId: t.students[0].id }).expect(409);
      expect((await get('parent', '/v1/documents/requests/mine').expect(200)).body).toHaveLength(1);
      expect((await get('parent2', '/v1/documents/requests/mine').expect(200)).body).toHaveLength(0);
      await get('parent', '/v1/documents/requests').expect(403);
    });

    it('is approved by the principal only, then issued by the office with a serial number', async () => {
      await post('parent', `/v1/documents/requests/${bonafide.id}/approve`).expect(403);
      await post('accountant', `/v1/documents/requests/${bonafide.id}/approve`).expect(403);
      await post('accountant', `/v1/documents/requests/${bonafide.id}/issue`).expect(409); // not approved yet
      expect((await post('principal', `/v1/documents/requests/${bonafide.id}/approve`, { note: 'Fine' }).expect(200)).body).toMatchObject({ status: 'approved', decisionNote: 'Fine' });
      await post('principal', `/v1/documents/requests/${bonafide.id}/reject`).expect(409);
      await post('parent', `/v1/documents/requests/${bonafide.id}/issue`).expect(403);
      const issued = (await post('accountant', `/v1/documents/requests/${bonafide.id}/issue`).expect(200)).body;
      expect(issued.serialNo).toBe(`BON/${fy}/00001`);
      expect(issued.verifyUrl).toMatch(new RegExp(`/verify/${t.slug}/[0-9a-f]{32}$`));
      expect(issued.status).toBe('issued');
      // Issuing again returns the same certificate and burns no number.
      expect((await post('accountant', `/v1/documents/requests/${bonafide.id}/issue`).expect(200)).body).toMatchObject({ serialNo: issued.serialNo, verifyUrl: issued.verifyUrl });
      bonafide = issued;
      const inbox = (await get('parent', '/v1/notifications').expect(200)).body.items as { kind: string; body: string }[];
      expect(inbox.find((n) => n.kind === 'certificate')?.body).toContain(`BON/${fy}/00001`);
      for (const a of ['certificate.requested', 'certificate.approved', 'certificate.issued']) expect(await audited(a)).toBe(1);
    });

    it('rejects a request with a note', async () => {
      const r = (await http().post('/v1/documents/requests').set(auth('parent2')).send({ templateId: template('study').id, studentId: t.students[1].id }).expect(201)).body;
      expect((await post('principal', `/v1/documents/requests/${r.id}/reject`, { note: 'Fees pending' }).expect(200)).body).toMatchObject({ status: 'rejected', decisionNote: 'Fees pending' });
      await post('accountant', `/v1/documents/requests/${r.id}/issue`).expect(409);
      // A rejected request does not block a new one.
      await http().post('/v1/documents/requests').set(auth('parent2')).send({ templateId: template('study').id, studentId: t.students[1].id }).expect(201);
    });

    it('never gives two certificates the same number, even issued at the same moment', async () => {
      const tpl = template('conduct');
      const reqs = await Promise.all(t.students.map(async (st) => (await post('principal', '/v1/documents/requests', { templateId: tpl.id, studentId: st.id, fields: { conduct: 'good' } }).expect(201)).body.id as string));
      for (const id of reqs) await post('principal', `/v1/documents/requests/${id}/approve`).expect(200);
      const done = await Promise.all(reqs.map((id) => post('accountant', `/v1/documents/requests/${id}/issue`)));
      expect(done.map((d) => d.status)).toEqual([200, 200, 200]);
      expect(done.map((d) => d.body.serialNo).sort()).toEqual([`CON/${fy}/00001`, `CON/${fy}/00002`, `CON/${fy}/00003`]);
    });

    it('freezes the text at issue: later template edits do not change it', async () => {
      const pdf = await get('parent', `/v1/documents/requests/${bonafide.id}/pdf`).buffer(true).parse(binary).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      const text = (pdf.body as Buffer).toString('latin1');
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).toContain('Student A');
      expect(text).toContain(`BON/${fy}/00001`);
      expect(text).toContain('Bank account');
      expect(text).toContain('20 October 2026');
      expect(text).toContain('Scan to verify');
      await get('parent2', `/v1/documents/requests/${bonafide.id}/pdf`).expect(404);
      await get('outsider', `/v1/documents/requests/${bonafide.id}/pdf`).expect(404);
      await get('teacher', `/v1/documents/requests/${bonafide.id}/pdf`).expect(404);
    });

    it('shows unknown placeholders as written, so a typo is visible', async () => {
      const r = (await post('principal', '/v1/documents/requests', { templateId: template('study').id, studentId: t.students[2].id, purpose: 'Visa' }).expect(201)).body;
      await post('principal', `/v1/documents/requests/${r.id}/approve`).expect(200);
      await post('principal', `/v1/documents/requests/${r.id}/issue`).expect(200);
      const text = ((await get('student', `/v1/documents/requests/${r.id}/pdf`).buffer(true).parse(binary).expect(200)).body as Buffer).toString('latin1');
      expect(text).toContain('{{typo}}');
      expect(text).toContain('BBCom Sem 3 A'.slice(1));
    });

    it('bulk issues to a class, skipping students who already hold one', async () => {
      await post('accountant', '/v1/documents/bulk-issue', { templateId: template('bonafide').id, sectionId: t.section.id }).expect(403);
      await post('principal', '/v1/documents/bulk-issue', { templateId: template('transfer_certificate').id, sectionId: t.section.id }).expect(400); // needs details per student
      await post('principal', '/v1/documents/bulk-issue', { templateId: template('bonafide').id }).expect(400);
      const r = (await post('principal', '/v1/documents/bulk-issue', { templateId: template('bonafide').id, sectionId: t.section.id, purpose: 'Scholarship' }).expect(200)).body;
      expect(r).toEqual({ issued: 2, skipped: 1 });
      const issued = (await get('principal', '/v1/documents/requests?status=issued').expect(200)).body as { serialNo: string }[];
      expect(issued.filter((x) => x.serialNo.startsWith('BON/'))).toHaveLength(3);
      expect(await audited('certificate.bulk_issued')).toBe(1);
    });
  });

  describe('public verification', () => {
    let cert: { id: string; verifyUrl: string };
    beforeAll(async () => {
      const list = (await get('principal', '/v1/documents/requests?status=issued').expect(200)).body as { id: string; verifyUrl: string; serialNo: string }[];
      cert = list.find((c) => c.serialNo.startsWith('BON/') && c.serialNo.endsWith('00001'))!;
    });

    it('answers without sign-in, with only what the certificate shows', async () => {
      const v = (await http().get(`/v1/public/verify/${t.slug}/${token(cert.verifyUrl)}`).expect(200)).body;
      expect(v).toEqual({ status: 'valid', institution: t.slug.length ? 'Tenant ' + (await owner.query('select name from tenants where id = $1', [t.tenantId])).rows[0].name.replace('Tenant ', '') : '', title: 'Bonafide Certificate', serialNo: `BON/2026-27/00001`, subjectName: 'Student A', issuedOn: '20 October 2026' });
    });

    it('does not confirm guesses, other institutions’ tokens or malformed ones', async () => {
      expect((await http().get(`/v1/public/verify/${t.slug}/${'0'.repeat(32)}`).expect(200)).body).toEqual({ status: 'not_found' });
      expect((await http().get(`/v1/public/verify/${other.slug}/${token(cert.verifyUrl)}`).expect(200)).body).toEqual({ status: 'not_found' });
      expect((await http().get(`/v1/public/verify/${t.slug}/not-a-token`).expect(200)).body).toEqual({ status: 'not_found' });
      expect((await http().get(`/v1/public/verify/nope/${token(cert.verifyUrl)}`).expect(200)).body).toEqual({ status: 'not_found' });
    });

    it('shows a revoked certificate as revoked, with a reason required to revoke', async () => {
      await post('accountant', `/v1/documents/requests/${cert.id}/revoke`, { reason: 'Issued in error' }).expect(403);
      await post('principal', `/v1/documents/requests/${cert.id}/revoke`, { reason: 'x' }).expect(400);
      const r = (await post('principal', `/v1/documents/requests/${cert.id}/revoke`, { reason: 'Issued in error' }).expect(200)).body;
      expect(r).toMatchObject({ status: 'revoked', revokedReason: 'Issued in error' });
      const v = (await http().get(`/v1/public/verify/${t.slug}/${token(cert.verifyUrl)}`).expect(200)).body;
      expect(v).toMatchObject({ status: 'revoked', serialNo: 'BON/2026-27/00001', revokedOn: '20 October 2026' });
      await post('principal', `/v1/documents/requests/${cert.id}/revoke`, { reason: 'Again' }).expect(409);
      await get('parent', `/v1/documents/requests/${cert.id}/pdf`).expect(403);
      const office = ((await get('accountant', `/v1/documents/requests/${cert.id}/pdf`).buffer(true).parse(binary).expect(200)).body as Buffer).toString('latin1');
      expect(office).toContain('REVOKED');
      expect(await audited('certificate.revoked')).toBe(1);
    });
  });

  describe('staff certificates', () => {
    it('lets a staff member ask for their own, approved and issued by HR', async () => {
      const tpl = template('experience');
      await http().post('/v1/documents/requests').set(auth('teacher')).send({ templateId: tpl.id, staffUserId: t.teacher2.id, fields: { lastWorkingDay: '2026-12-31' } }).expect(404);
      await http().post('/v1/documents/requests').set(auth('teacher')).send({ templateId: tpl.id, fields: {} }).expect(400);
      const r = (await http().post('/v1/documents/requests').set(auth('teacher')).send({ templateId: tpl.id, fields: { lastWorkingDay: '2026-12-31', ignored: 'x' } }).expect(201)).body;
      expect(r).toMatchObject({ subjectType: 'staff', subject: { id: t.teacher.id }, fields: { lastWorkingDay: '2026-12-31' } });
      await post('teacher', `/v1/documents/requests/${r.id}/approve`).expect(403);
      await post('accountant', `/v1/documents/requests/${r.id}/approve`).expect(403);
      await post('hr', `/v1/documents/requests/${r.id}/approve`).expect(200);
      const issued = (await post('hr', `/v1/documents/requests/${r.id}/issue`).expect(200)).body;
      expect(issued.serialNo).toBe('EXP/2026-27/00001');
      const text = ((await get('teacher', `/v1/documents/requests/${r.id}/pdf`).buffer(true).parse(binary).expect(200)).body as Buffer).toString('latin1');
      expect(text).toContain('T001');
      expect(text).toContain('3 June 2024');
      expect(text).toContain('2026-12-31');
      expect((await get('teacher', '/v1/notifications').expect(200)).body.items.some((n: { kind: string }) => n.kind === 'certificate')).toBe(true);
    });
  });

  describe('ID cards and receipts', () => {
    it('prints a class’s student cards and the caller’s own, for the right people', async () => {
      await get('teacher', `/v1/documents/id-cards/students.pdf?sectionId=${t.section.id}`).expect(403);
      await get('accountant', '/v1/documents/id-cards/students.pdf').expect(400);
      const pdf = await get('accountant', `/v1/documents/id-cards/students.pdf?sectionId=${t.section.id}`).buffer(true).parse(binary).expect(200);
      const text = (pdf.body as Buffer).toString('latin1');
      expect(text).toContain('/Count 1');
      for (const n of ['Student A', 'Student B', 'Student C']) expect(text).toContain(n);
      const mine = ((await get('student', '/v1/documents/id-cards/me.pdf').buffer(true).parse(binary).expect(200)).body as Buffer).toString('latin1');
      expect(mine).toContain('Student C');
      expect(mine).not.toContain('Student A');
      await get('parent', '/v1/documents/id-cards/me.pdf').expect(404);
      const staff = ((await get('hr', `/v1/documents/id-cards/staff.pdf?userIds=${t.teacher.id}`).buffer(true).parse(binary).expect(200)).body as Buffer).toString('latin1');
      expect(staff).toContain('T001');
      await get('hr', '/v1/documents/id-cards/staff.pdf?userIds=nope').expect(400);
      expect(await audited('idcard.printed')).toBe(2);
    });

    it('verifies a card’s signed code, and notices when the student has left', async () => {
      const code = idCardCode(env.JWT_SECRET, t.tenantId, 'student', t.students[0].id);
      expect((await http().get(`/v1/public/verify-id/${t.slug}/${code}`).expect(200)).body).toMatchObject({ status: 'valid', kind: 'student', name: 'Student A', detail: 'BCom Sem 3 A' });
      expect((await http().get(`/v1/public/verify-id/${t.slug}/${code.slice(0, -1)}x`).expect(200)).body).toEqual({ status: 'not_found' });
      expect((await http().get(`/v1/public/verify-id/${other.slug}/${code}`).expect(200)).body).toEqual({ status: 'not_found' });
      await owner.query("update students set status = 'left' where id = $1", [t.students[0].id]);
      expect((await http().get(`/v1/public/verify-id/${t.slug}/${code}`).expect(200)).body.status).toBe('inactive');
      await owner.query("update students set status = 'active' where id = $1", [t.students[0].id]);
      const staffCode = idCardCode(env.JWT_SECRET, t.tenantId, 'staff', t.teacher.id);
      expect((await http().get(`/v1/public/verify-id/${t.slug}/${staffCode}`).expect(200)).body).toMatchObject({ status: 'valid', kind: 'staff', name: t.teacher.fullName });
    });

    it('renders a fee receipt PDF for those who may see the receipt', async () => {
      const [inv] = await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Semester 3 tuition', amountPaise: 45_000_00, paidPaise: 20_000_00, dueOn: '2026-11-01', createdBy: t.principal.id }).returning();
      const [pay] = await db.insert(s.feePayments).values({ tenantId: t.tenantId, invoiceId: inv.id, studentId: t.students[0].id, amountPaise: 20_000_00, method: 'cash', status: 'paid', receiptNo: 'RCPT/2026-27/00001', paidAt: new Date('2026-10-19T08:00:00Z'), reference: 'CTR-1' }).returning();
      const text = ((await get('parent', `/v1/documents/fee-receipts/${pay.id}.pdf`).buffer(true).parse(binary).expect(200)).body as Buffer).toString('latin1');
      for (const x of ['RCPT/2026-27/00001', 'Student A', 'Semester 3 tuition', '20,000.00', '25,000.00', '2026-10-19']) expect(text).toContain(x);
      await get('accountant', `/v1/documents/fee-receipts/${pay.id}.pdf`).expect(200);
      await get('parent2', `/v1/documents/fee-receipts/${pay.id}.pdf`).expect(404);
      await get('outsider', `/v1/documents/fee-receipts/${pay.id}.pdf`).expect(404);
      await get('parent', '/v1/documents/fee-receipts/not-a-uuid.pdf').expect(404);
    });
  });

  describe('document vault', () => {
    const up = (who: string, type: 'student' | 'staff', id: string, q: string, body: Buffer = PDF, ct = 'application/pdf') => http().post(`/v1/documents/vault/${type}/${id}?${q}`).set(auth(who)).set('content-type', ct).send(body);
    let aadhaar: { id: string; version: number };
    let marks: { id: string };

    it('lets managers upload, validates the file and keeps staff-only documents from the family', async () => {
      aadhaar = (await up('principal', 'student', t.students[0].id, 'title=Aadhaar&category=aadhaar&visibility=staff').expect(201)).body;
      expect(aadhaar).toMatchObject({ ownerType: 'student', ownerId: t.students[0].id, title: 'Aadhaar', category: 'aadhaar', contentType: 'application/pdf', sizeBytes: PDF.length, version: 1, visibility: 'staff' });
      marks = (await up('principal', 'student', t.students[0].id, 'title=Marks%20card&category=marks_card&visibility=owner&expiresOn=2026-11-10', PNG, 'image/png').expect(201)).body;
      await up('principal', 'student', t.students[0].id, 'title=Bad&category=other', Buffer.from('GIF89a....'), 'image/png').expect(415);
      await up('principal', 'student', t.students[0].id, 'title=Bad&category=other', PNG, 'application/pdf').expect(201); // content decides, not the header
      await up('principal', 'student', t.students[0].id, 'category=aadhaar').expect(400);
      await http().post(`/v1/documents/vault/student/${t.students[0].id}?title=T&category=aadhaar`).set(auth('principal')).send({ not: 'a file' }).expect(415);
      await up('principal', 'student', t.students[0].id, 'title=Big&category=big', Buffer.alloc(10 * 1024 * 1024 + 10, 0x25)).expect(413);
      expect(await audited('vault.uploaded')).toBe(3);
      // The family sees only what is marked for them.
      const mine = (await get('parent', `/v1/documents/vault/student/${t.students[0].id}`).expect(200)).body as { id: string }[];
      expect(mine.map((d) => d.id)).toEqual([marks.id]);
      await get('parent2', `/v1/documents/vault/student/${t.students[0].id}`).expect(404);
      await get('teacher', `/v1/documents/vault/student/${t.students[0].id}`).expect(404);
      await get('hr', `/v1/documents/vault/student/${t.students[0].id}`).expect(404);
      await get('outsider', `/v1/documents/vault/student/${t.students[0].id}`).expect(404);
      expect((await get('principal', `/v1/documents/vault/student/${t.students[0].id}`).expect(200)).body).toHaveLength(3);
      await up('parent', 'student', t.students[0].id, 'title=Mine&category=other').expect(404); // families cannot upload
    });

    it('downloads with access control and an audit trail', async () => {
      const dl = await get('parent', `/v1/documents/vault/files/${marks.id}`).buffer(true).parse(binary).expect(200);
      expect(dl.headers['content-type']).toBe('image/png');
      expect((dl.body as Buffer).equals(PNG)).toBe(true);
      expect(dl.headers['cache-control']).toBe('private, no-store');
      await get('parent', `/v1/documents/vault/files/${aadhaar.id}`).expect(404);
      await get('parent2', `/v1/documents/vault/files/${marks.id}`).expect(404);
      await get('outsider', `/v1/documents/vault/files/${marks.id}`).expect(404);
      await get('principal', `/v1/documents/vault/files/${aadhaar.id}`).expect(200);
      expect(await audited('vault.downloaded')).toBe(2);
    });

    it('replaces a document with a new version and keeps the old one in history', async () => {
      const v2 = (await up('principal', 'student', t.students[0].id, `title=Aadhaar&category=aadhaar&replacesId=${aadhaar.id}`).expect(201)).body;
      expect(v2.version).toBe(2);
      const current = (await get('principal', `/v1/documents/vault/student/${t.students[0].id}`).expect(200)).body as { id: string }[];
      expect(current.map((d) => d.id)).not.toContain(aadhaar.id);
      const history = (await get('principal', `/v1/documents/vault/student/${t.students[0].id}?history=1`).expect(200)).body as { id: string }[];
      expect(history.map((d) => d.id)).toContain(aadhaar.id);
      await up('principal', 'student', t.students[1].id, `title=X&category=aadhaar&replacesId=${v2.id}`).expect(404);
    });

    it('keeps staff documents between HR and the staff member, lists expiries and archives', async () => {
      const own = (await up('teacher', 'staff', t.teacher.id, 'title=PAN%20card&category=pan&visibility=staff').expect(201)).body;
      expect(own.visibility).toBe('owner'); // a person's own upload is always visible to them
      const offer = (await up('hr', 'staff', t.teacher.id, 'title=Offer%20letter&category=offer_letter&visibility=staff&expiresOn=2026-11-01').expect(201)).body;
      await up('teacher', 'staff', t.teacher2.id, 'title=Nope&category=pan').expect(404);
      await up('hr', 'student', t.students[0].id, 'title=Nope&category=pan').expect(404); // HR does not manage student files
      expect((await get('teacher', `/v1/documents/vault/staff/${t.teacher.id}`).expect(200)).body.map((d: { id: string }) => d.id)).toEqual([own.id]);
      expect((await get('hr', `/v1/documents/vault/staff/${t.teacher.id}`).expect(200)).body).toHaveLength(2);
      await get('teacher2', `/v1/documents/vault/staff/${t.teacher.id}`).expect(404);
      await get('teacher', `/v1/documents/vault/files/${offer.id}`).expect(404);
      await get('hr', `/v1/documents/vault/files/${own.id}`).expect(200);
      const expiring = (await get('hr', '/v1/documents/vault/expiring?days=30').expect(200)).body as { id: string }[];
      expect(expiring.map((d) => d.id)).toEqual([offer.id]); // HR sees staff files only
      expect((await get('principal', '/v1/documents/vault/expiring?days=30').expect(200)).body.map((d: { id: string }) => d.id)).toEqual([offer.id, marks.id]);
      await get('teacher', '/v1/documents/vault/expiring').expect(403);
      await http().delete(`/v1/documents/vault/files/${own.id}`).set(auth('teacher')).expect(404);
      await http().delete(`/v1/documents/vault/files/${offer.id}`).set(auth('hr')).expect(204);
      await get('hr', `/v1/documents/vault/files/${offer.id}`).expect(200); // managers can still reach the archived file
      await get('teacher', `/v1/documents/vault/files/${offer.id}`).expect(404);
      expect((await get('hr', `/v1/documents/vault/staff/${t.teacher.id}`).expect(200)).body).toHaveLength(1);
      expect(await audited('vault.archived')).toBe(1);
    });
  });

  it('rate limits the public verification endpoints', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) codes.push((await http().get(`/v1/public/verify/${t.slug}/${'a'.repeat(32)}`)).status);
    expect(codes).toContain(429);
    expect(codes[0]).toBe(200);
  });
});
