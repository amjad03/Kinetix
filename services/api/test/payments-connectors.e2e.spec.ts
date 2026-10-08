import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

interface Call {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

describe('bank-transfer payments, sponsor billing and the Koha / Zoom / Teams / BI connectors', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@pay.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  // A local stand-in for Koha, Zoom and Microsoft Graph.
  let remote: Server;
  let base = '';
  let calls: Call[] = [];
  const reply = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  beforeAll(async () => {
    remote = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const url = req.url ?? '';
        calls.push({ method: req.method ?? '', url, headers: req.headers, body });
        const bearer = req.headers.authorization === 'Bearer tok-1';
        if (url === '/koha/api/v1/oauth/token') return body.includes('client_secret=good') ? reply(res, 200, { access_token: 'tok-1' }) : reply(res, 401, { error: 'invalid_client' });
        if (url.startsWith('/koha/api/v1/biblios?')) return bearer ? reply(res, 200, [{ biblio_id: 12, title: 'Corporate Accounting', author: 'R. Rao', isbn: '9780000000001', copyright_date: 2019 }]) : reply(res, 401, {});
        if (url.startsWith('/koha/api/v1/patrons?')) return reply(res, 200, url.includes('CARD1') ? [{ patron_id: 7 }] : []);
        if (url.startsWith('/koha/api/v1/checkouts?')) return reply(res, 200, [{ checkout_id: 3, item_id: 40, item: { biblio_id: 12 }, checkout_date: '2026-09-01T00:00:00+05:30', due_date: '2026-09-15T00:00:00+05:30', renewals_count: 1 }]);
        if (url.startsWith('/zoom/oauth/token')) return req.headers.authorization === `Basic ${Buffer.from('zid:good').toString('base64')}` && url.includes('account_id=acct1') ? reply(res, 200, { access_token: 'tok-1' }) : reply(res, 401, {});
        if (url === '/zoom/v2/users/me') return bearer ? reply(res, 200, { id: 'me' }) : reply(res, 401, {});
        if (url === '/zoom/v2/users/me/meetings') return bearer ? reply(res, 201, { id: 987654321, join_url: 'https://zoom.example/j/987654321', start_url: 'https://zoom.example/s/987654321' }) : reply(res, 401, {});
        if (url === '/teams/token') return body.includes('client_secret=good') && body.includes('graph.microsoft.com') ? reply(res, 200, { access_token: 'tok-1' }) : reply(res, 401, {});
        if (url === '/graph/users/org1/onlineMeetings') return bearer ? reply(res, 201, { id: 'meet-1', joinWebUrl: 'https://teams.example/l/meet-1' }) : reply(res, 401, {});
        reply(res, 404, {});
      });
    });
    await new Promise<void>((r) => remote.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;

    t = await createTenant(owner);
    const admin = await addUser('Ada Admin', 'tenant_admin');
    const accountant = await addUser('Asha Accounts', 'accountant');
    const librarian = await addUser('Lia Library', 'librarian');
    app = await createApp(clock);
    tokens = {
      admin: await login(t.slug, admin.email!),
      accountant: await login(t.slug, accountant.email!),
      librarian: await login(t.slug, librarian.email!),
      teacher: await login(t.slug, t.teacher.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
    };
    await post('accountant', '/v1/fees/invoices', { sectionId: t.section.id, title: 'Semester 3 tuition', amountPaise: 45_000_00, dueOn: '2026-11-15' }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await new Promise((r) => remote.close(r));
    await owner.end();
  });

  // ---------------------------------------------------------------------------------------------
  describe('bank transfers', () => {
    let invoiceId: string;
    let submissionId: string;
    const submit = (who: string, studentId: string, f: Record<string, string>, proof?: { data: Buffer; name: string }) => {
      const r = http().post(`/v1/parent/children/${studentId}/bank-transfers`).set(auth(who));
      for (const [k, v] of Object.entries(f)) r.field(k, v);
      if (proof) r.attach('proof', proof.data, proof.name);
      return r;
    };
    const fields = (o: Record<string, string> = {}) => ({ invoiceId, utr: 'UTIB26290001', amountPaise: '1000000', transferDate: '2026-10-18', ...o });
    const pdf = { data: Buffer.from('%PDF-1.4 transfer confirmation'), name: 'neft.pdf' };

    beforeAll(async () => {
      invoiceId = (await get('parent', `/v1/fees/students/${t.students[0].id}`).expect(200)).body.invoices[0].id;
    });

    it('takes a guardian submission with a proof, and checks who may send it', async () => {
      const bad = await submit('parent', t.students[0].id, fields(), { data: Buffer.from('just text'), name: 'x.txt' }).expect(400);
      expect(bad.body.message).toContain('PDF, JPEG or PNG');
      await submit('parent', t.students[0].id, fields({ amountPaise: '99999999' })).expect(400);
      await submit('parent', t.students[0].id, fields({ utr: '12' })).expect(400);
      await submit('parent2', t.students[0].id, fields()).expect(404);
      await submit('teacher', t.students[0].id, fields()).expect(403);

      const ok = await submit('parent', t.students[0].id, fields(), pdf).expect(201);
      expect(ok.body).toMatchObject({ status: 'pending', utr: 'UTIB26290001', amountPaise: 1000000, hasProof: true });
      submissionId = ok.body.id;
      expect((await submit('parent', t.students[0].id, fields({ utr: 'utib26290001' })).expect(400)).body.message).toContain('already been submitted');
      const mine = await get('parent', `/v1/parent/children/${t.students[0].id}/bank-transfers`).expect(200);
      expect(mine.body).toHaveLength(1);
      await get('parent2', `/v1/parent/children/${t.students[0].id}/bank-transfers`).expect(404);
    });

    it('queues it for the accountant, with the proof visible only to the accounts office and the sender', async () => {
      const q = await get('accountant', '/v1/fees/bank-transfers?status=pending').expect(200);
      expect(q.body).toHaveLength(1);
      expect(q.body[0]).toMatchObject({ id: submissionId, invoiceTitle: 'Semester 3 tuition', student: { fullName: 'Student A' }, className: 'BCom Sem 3 A', balancePaise: 4500000 });
      await get('teacher', '/v1/fees/bank-transfers').expect(403);
      await get('parent', '/v1/fees/bank-transfers').expect(403);
      const proof = await get('accountant', `/v1/fees/bank-transfers/${submissionId}/proof`).expect(200);
      expect(proof.headers['content-type']).toContain('application/pdf');
      await get('parent', `/v1/fees/bank-transfers/${submissionId}/proof`).expect(200);
      await get('parent2', `/v1/fees/bank-transfers/${submissionId}/proof`).expect(404);
    });

    it('verifying records the payment through the counter path: receipt, invoice credit, fee-paid event', async () => {
      await post('parent', `/v1/fees/bank-transfers/${submissionId}/verify`).expect(403);
      const v = await post('accountant', `/v1/fees/bank-transfers/${submissionId}/verify`).expect(200);
      expect(v.body).toMatchObject({ status: 'verified', receipt: { amountPaise: 1000000, method: 'bank_transfer', reference: 'UTIB26290001', invoice: { balancePaise: 3500000 } } });
      expect(v.body.receipt.receiptNo).toMatch(/^RCPT\/\d{4}-\d{2}\/\d{5}$/);
      const fees = (await get('parent', `/v1/fees/students/${t.students[0].id}`).expect(200)).body;
      expect(fees.invoices[0]).toMatchObject({ paidPaise: 1000000, status: 'due' });
      expect(fees.payments[0]).toMatchObject({ method: 'bank_transfer', receiptNo: v.body.receipt.receiptNo });
      const events = await owner.query("select count(*)::int as n from domain_events where tenant_id = $1 and type = 'fees.payment_received' and aggregate_id = $2", [t.tenantId, v.body.paymentId]);
      expect(events.rows[0].n).toBe(1);
      await post('accountant', `/v1/fees/bank-transfers/${submissionId}/verify`).expect(400);
    });

    it('rejecting keeps the invoice untouched, tells why, and frees the UTR to be sent again', async () => {
      const sub = await submit('parent', t.students[0].id, fields({ utr: 'UTIB26290002', amountPaise: '500000' })).expect(201);
      await post('accountant', `/v1/fees/bank-transfers/${sub.body.id}/reject`, {}).expect(400);
      const rej = await post('accountant', `/v1/fees/bank-transfers/${sub.body.id}/reject`, { note: 'No such credit in the bank statement' }).expect(200);
      expect(rej.body).toMatchObject({ status: 'rejected', reviewNote: 'No such credit in the bank statement' });
      expect((await get('parent', `/v1/fees/students/${t.students[0].id}`).expect(200)).body.invoices[0].paidPaise).toBe(1000000);
      await post('accountant', `/v1/fees/bank-transfers/${sub.body.id}/verify`).expect(400);
      await submit('parent', t.students[0].id, fields({ utr: 'UTIB26290002', amountPaise: '500000' })).expect(201);
      const all = await get('accountant', '/v1/fees/bank-transfers').expect(200);
      expect(all.body.map((x: { status: string }) => x.status)).toEqual(['pending', 'verified', 'rejected']);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('sponsor (PO) billing', () => {
    let sponsorId: string;
    let invoiceId: string;

    it('invoices a sponsor organisation for several students against a PO', async () => {
      await post('teacher', '/v1/fees/sponsors', { name: 'Acme Ltd' }).expect(403);
      sponsorId = (await post('accountant', '/v1/fees/sponsors', { name: 'Acme Ltd', contactEmail: 'ap@acme.example' }).expect(201)).body.id;
      await post('accountant', '/v1/fees/sponsors', { name: 'Acme Ltd' }).expect(400);
      const inv = await post('accountant', '/v1/fees/sponsor-invoices', {
        sponsorId,
        poNumber: 'PO-7781',
        title: 'Sponsored tuition, semester 3',
        dueOn: '2026-10-10',
        lines: [
          { studentId: t.students[0].id, description: 'Tuition', amountPaise: 20_000_00 },
          { studentId: t.students[1].id, description: 'Tuition', amountPaise: 20_000_00 },
        ],
      }).expect(201);
      expect(inv.body).toMatchObject({ amountPaise: 40_000_00, paidPaise: 0, status: 'open', poNumber: 'PO-7781' });
      expect(inv.body.invoiceNo).toMatch(/^SINV\/\d{4}-\d{2}\/0001$/);
      invoiceId = inv.body.id;
      await post('accountant', '/v1/fees/sponsor-invoices', { sponsorId, title: 'x', dueOn: '2026-10-10', lines: [{ studentId: t.students[0].id, description: 'd', amountPaise: 5 }] }).expect(400);
    });

    it('takes part payments, refuses overpaying, and reports what is outstanding and overdue', async () => {
      const first = await post('accountant', `/v1/fees/sponsor-invoices/${invoiceId}/payments`, { amountPaise: 15_000_00, method: 'bank_transfer', reference: 'NEFT-55', receivedOn: '2026-10-19' }).expect(201);
      expect(first.body.invoice).toMatchObject({ status: 'partial', paidPaise: 15_000_00, balancePaise: 25_000_00 });
      await post('accountant', `/v1/fees/sponsor-invoices/${invoiceId}/payments`, { amountPaise: 30_000_00, method: 'cheque', receivedOn: '2026-10-19' }).expect(400);
      const report = (await get('accountant', '/v1/fees/sponsor-invoices/outstanding').expect(200)).body;
      expect(report).toMatchObject({ billedPaise: 40_000_00, paidPaise: 15_000_00, outstandingPaise: 25_000_00, overduePaise: 25_000_00 });
      expect(report.sponsors[0]).toMatchObject({ sponsorName: 'Acme Ltd', invoices: 1, outstandingPaise: 25_000_00 });
      const listed = (await get('accountant', '/v1/fees/sponsor-invoices?status=partial').expect(200)).body;
      expect(listed[0]).toMatchObject({ id: invoiceId, sponsorName: 'Acme Ltd', overdue: true, balancePaise: 25_000_00 });
      await post('accountant', `/v1/fees/sponsor-invoices/${invoiceId}/cancel`).expect(400);

      const last = await post('accountant', `/v1/fees/sponsor-invoices/${invoiceId}/payments`, { amountPaise: 25_000_00, method: 'bank_transfer', reference: 'NEFT-61', receivedOn: '2026-10-20' }).expect(201);
      expect(last.body.invoice.status).toBe('paid');
      await post('accountant', `/v1/fees/sponsor-invoices/${invoiceId}/payments`, { amountPaise: 100, method: 'cash', receivedOn: '2026-10-20' }).expect(400);
      const detail = (await get('accountant', `/v1/fees/sponsor-invoices/${invoiceId}`).expect(200)).body;
      expect(detail.lines).toHaveLength(2);
      expect(detail.payments.map((p: { reference: string }) => p.reference)).toEqual(['NEFT-55', 'NEFT-61']);
      expect((await get('accountant', '/v1/fees/sponsor-invoices/outstanding').expect(200)).body).toMatchObject({ outstandingPaise: 0, overduePaise: 0 });
      await get('teacher', '/v1/fees/sponsor-invoices').expect(403);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Koha, Zoom, Teams and BI connectors', () => {
    const connector = async (type: string, name: string, config: object, enabled = true) => (await post('admin', '/v1/connectors', { type, name, enabled, config }).expect(201)).body.id as string;
    const test = (id: string) => post('admin', `/v1/connectors/${id}/test`).expect(200).then((r) => r.body as { status: string; message: string });
    let koha: string;
    let zoom: string;
    let teams: string;

    it('Koha: test-connection, catalogue search and a patron\'s loans', async () => {
      const bad = await connector('library_koha', 'Koha bad', { baseUrl: `${base}/koha`, clientId: 'kid', clientSecret: 'wrong' }, false);
      expect(await test(bad)).toMatchObject({ status: 'failed' });
      koha = await connector('library_koha', 'Koha', { baseUrl: `${base}/koha`, clientId: 'kid', clientSecret: 'good' });
      expect(await test(koha)).toEqual({ status: 'ok', message: 'Signed in to Koha' });
      const found = (await get('teacher', '/v1/connectors/library/search?q=accounting').expect(200)).body;
      expect(found.books).toEqual([{ biblioId: '12', title: 'Corporate Accounting', author: 'R. Rao', isbn: '9780000000001', publisher: null, year: '2019' }]);
      const search = calls.find((c) => c.url.startsWith('/koha/api/v1/biblios?'))!;
      expect(decodeURIComponent(search.url)).toContain('%accounting%');
      await get('teacher', '/v1/connectors/library/search?q=a').expect(400);
      const loans = (await get('librarian', '/v1/connectors/library/loans?cardNumber=CARD1').expect(200)).body;
      expect(loans).toMatchObject({ patronId: '7', loans: [{ checkoutId: '3', itemId: '40', biblioId: '12', renewals: 1, overdue: true }] });
      await get('librarian', '/v1/connectors/library/loans?cardNumber=NOPE').expect(400);
      await get('teacher', '/v1/connectors/library/loans?cardNumber=CARD1').expect(403);
    });

    it('Zoom and Teams: test-connection, and a meeting for a timetable slot', async () => {
      zoom = await connector('lms_video', 'Zoom', { provider: 'zoom', accountId: 'acct1', clientId: 'zid', clientSecret: 'good', apiBaseUrl: `${base}/zoom/v2`, tokenUrl: `${base}/zoom/oauth/token` });
      expect(await test(zoom)).toEqual({ status: 'ok', message: 'Signed in to Zoom' });
      const wrong = await connector('lms_video', 'Zoom wrong', { provider: 'zoom', accountId: 'acct1', clientId: 'zid', clientSecret: 'bad', apiBaseUrl: `${base}/zoom/v2`, tokenUrl: `${base}/zoom/oauth/token` }, false);
      expect((await test(wrong)).status).toBe('failed');
      teams = await connector('lms_video', 'Teams', { provider: 'teams', accountId: 'tenant1', clientId: 'tid', clientSecret: 'good', organizerId: 'org1', apiBaseUrl: `${base}/graph`, tokenUrl: `${base}/teams/token` });
      expect(await test(teams)).toEqual({ status: 'ok', message: 'Signed in to Microsoft Teams' });

      // 2026-10-26 is a Monday; the slot runs 10:00 to 10:55 IST.
      const m = await post('teacher', '/v1/connectors/video/meetings', { slotId: t.slot.id, date: '2026-10-26' }).expect(201);
      expect(m.body).toMatchObject({ provider: 'zoom', externalId: '987654321', joinUrl: 'https://zoom.example/j/987654321', durationMin: 55, slotId: t.slot.id });
      const sent = JSON.parse(calls.filter((c) => c.url === '/zoom/v2/users/me/meetings').at(-1)!.body);
      expect(sent).toMatchObject({ topic: 'BCom Sem 3 A online class', start_time: '2026-10-26T04:30:00Z', duration: 55 });
      await post('teacher', '/v1/connectors/video/meetings', { slotId: t.slot.id, date: '2026-10-27' }).expect(400);

      const tm = await post('teacher', '/v1/connectors/video/meetings', { connectorId: teams, topic: 'Revision session', startsAt: '2026-10-28T05:00:00Z', durationMin: 40 }).expect(201);
      expect(tm.body).toMatchObject({ provider: 'teams', externalId: 'meet-1', joinUrl: 'https://teams.example/l/meet-1' });
      const graph = JSON.parse(calls.filter((c) => c.url === '/graph/users/org1/onlineMeetings').at(-1)!.body);
      expect(graph).toMatchObject({ subject: 'Revision session', startDateTime: '2026-10-28T05:00:00.000Z', endDateTime: '2026-10-28T05:40:00.000Z' });
      const listed = (await get('teacher', `/v1/connectors/video/meetings?slotId=${t.slot.id}`).expect(200)).body;
      expect(listed).toHaveLength(1);
      await post('parent', '/v1/connectors/video/meetings', { topic: 'x', startsAt: '2026-10-28T05:00:00Z', durationMin: 40 }).expect(403);
    });

    it('BI export: test-connection and signed read-only CSV links for whitelisted datasets', async () => {
      await post('admin', '/v1/connectors', { type: 'bi_export', name: 'Short', enabled: true, config: { tool: 'powerbi', signingSecret: 'short' } }).expect(400);
      const bi = await connector('bi_export', 'Power BI', { tool: 'powerbi', signingSecret: 'bi-signing-secret-123', datasets: ['fee_invoices', 'sponsor_invoices'] });
      expect((await test(bi)).status).toBe('ok');
      await post('admin', `/v1/connectors/${bi}/bi-links`, { dataset: 'students' }).expect(400);
      await post('accountant', `/v1/connectors/${bi}/bi-links`, { dataset: 'fee_invoices' }).expect(403);

      const link = (await post('admin', `/v1/connectors/${bi}/bi-links`, { dataset: 'fee_invoices', ttlHours: 2 }).expect(201)).body as { url: string; expiresAt: string };
      const path = link.url.replace(/^https?:\/\/[^/]+/, '');
      const csv = await http().get(path).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      const lines = csv.text.trim().split('\r\n');
      expect(lines[0]).toBe('invoice_id,roll_no,student,class,title,amount_paise,paid_paise,due_on,status');
      expect(lines).toHaveLength(4);
      expect(csv.text).toContain('Student A,BCom Sem 3 A,Semester 3 tuition,4500000,1000000');

      // Tampering with the signature, the dataset or the expiry gives nothing.
      await http().get(path.replace(/sig=[0-9a-f]/, 'sig=0')).expect(404);
      await http().get(path.replace('/fee_invoices', '/sponsor_invoices')).expect(404);
      await http().get(path.replace(/exp=\d+/, 'exp=9999999999')).expect(404);
      await http().get(path.replace('/fee_invoices', '/audit_log')).expect(404);
      // Switching the connector off ends every link.
      await post('admin', `/v1/connectors/${bi}/disable`).expect(200);
      await http().get(path).expect(404);
    });

    it('keeps the stored secrets out of the registry view', async () => {
      const list = (await get('admin', '/v1/connectors').expect(200)).body as { id: string; secretsSet: string[]; config: Record<string, unknown> }[];
      const k = list.find((c) => c.id === koha)!;
      expect(k.secretsSet).toEqual(['clientSecret']);
      expect(JSON.stringify(list)).not.toContain('bi-signing-secret-123');
      expect(k.config).not.toHaveProperty('clientSecret');
    });
  });
});
