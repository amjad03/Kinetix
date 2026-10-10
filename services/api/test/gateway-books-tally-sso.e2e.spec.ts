import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv, ENV } from '../src/config/env.js';
import * as s from '../src/db/schema.js';
import { fakeSettlements, payuResponseHash } from '../src/fees/payment-provider.js';
import { parseSettlementCsv } from '../src/fees/settlements.controller.js';
import { balanceSheet, incomeExpenditure, trialBalance } from '../src/books/books.logic.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/** Second gateway (PayU) + settlement reconciliation, accounting books, Tally live sync, OIDC SSO, online class attendance. */
describe('PayU, settlements, books, Tally, SSO and meeting attendance', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const servers: Server[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const dueOn = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  const listen = (srv: Server) => new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as { port: number }).port)));
  const PAYU = { provider: 'payu', keyId: 'gtKFFx', keySecret: 'payu-salt-secret-77' };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()), (m) => m.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'gateways', RAZORPAY_FAKE: 'true', PAYU_FAKE: 'true' })));
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.admin = tokens.principal;
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    const [ca] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Conn Admin', email: 'connadmin@x.in', passwordHash: (await import('argon2')).default.hash ? await (await import('argon2')).default.hash('pw') : '' }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: ca.id, role: 'tenant_admin' });
    tokens.connAdmin = await login(t.slug, 'connadmin@x.in');
    tokens.otherPrincipal = await login(other.slug, other.principal.email!);
    await http().post('/v1/fees/invoices').set(auth('principal')).send({ sectionId: t.section.id, title: 'Tuition', amountPaise: 20_000_00, dueOn }).expect(201);
  });

  afterAll(async () => {
    for (const x of servers) x.close();
    await app.close();
    await owner.end();
  });

  // ---- 1. PayU + settlement reconciliation ----------------------------------------------------------------

  describe('payment gateways', () => {
    it('the tenant chooses PayU; the salt is encrypted and never echoed', async () => {
      await http().put('/v1/admin/payments/gateway').set(auth('teacher')).send(PAYU).expect(403);
      await http().put('/v1/admin/payments/gateway').set(auth('principal')).send({ provider: 'payu', keyId: PAYU.keyId }).expect(400);
      const saved = await http().put('/v1/admin/payments/gateway').set(auth('principal')).send(PAYU).expect(200);
      expect(saved.body).toMatchObject({ gateway: 'payu', configured: true, keyId: PAYU.keyId, mode: 'test', payuWebhookPath: `/v1/fees/webhooks/payu/${t.slug}` });
      expect(JSON.stringify(saved.body)).not.toContain(PAYU.keySecret);
      const [row] = await db.select().from(s.paymentGatewayAccounts).where(eq(s.paymentGatewayAccounts.tenantId, t.tenantId));
      expect(row.provider).toBe('payu');
      expect(row.keySecretEnc).toMatch(/^v1\./);
      expect((await http().post('/v1/admin/payments/razorpay/test').set(auth('principal')).expect(200)).body).toMatchObject({ ok: true, keyId: PAYU.keyId });
    });

    let pay: { paymentId: string; orderId: string; hosted: { url: string; fields: Record<string, string> }; amountPaise: number };
    const mihpayid = 'payu_9001';
    const response = (o: { status?: string; amount?: string } = {}) => {
      const f: Record<string, string> = { status: o.status ?? 'success', txnid: pay.orderId, mihpayid, amount: o.amount ?? '20000.00', productinfo: pay.hosted.fields.productinfo, firstname: pay.hosted.fields.firstname, email: pay.hosted.fields.email, udf1: pay.hosted.fields.udf1, udf2: pay.hosted.fields.udf2, key: PAYU.keyId };
      f.hash = payuResponseHash(PAYU.keyId, PAYU.keySecret, f);
      return f;
    };

    it('checkout returns a hosted PayU form with a request hash; the response hash confirms the payment', async () => {
      const invoice = (await http().get(`/v1/fees/students/${t.students[0].id}`).set(auth('parent')).expect(200)).body.invoices[0];
      pay = (await http().post(`/v1/fees/invoices/${invoice.id}/checkout`).set(auth('parent')).send({ returnUrl: 'https://erp.example.in/pay/return' }).expect(201)).body;
      expect(pay.hosted.url).toBe('https://test.payu.in/_payment');
      expect(pay.hosted.fields).toMatchObject({ key: PAYU.keyId, txnid: pay.orderId, amount: '20000.00', surl: 'https://erp.example.in/pay/return' });
      expect(pay.hosted.fields.hash).toMatch(/^[0-9a-f]{128}$/);
      const bad = response();
      await http().post(`/v1/fees/payments/${pay.paymentId}/confirm`).set(auth('parent')).send({ providerPaymentId: mihpayid, signature: 'f'.repeat(128), fields: bad }).expect(403);
      await http().post(`/v1/fees/payments/${pay.paymentId}/confirm`).set(auth('parent')).send({ providerPaymentId: mihpayid, signature: bad.hash, fields: { ...bad, amount: '1.00' } }).expect(403);
      const ok = await http().post(`/v1/fees/payments/${pay.paymentId}/confirm`).set(auth('parent')).send({ providerPaymentId: mihpayid, signature: bad.hash, fields: bad }).expect(200);
      expect(ok.body.receiptNo).toMatch(/^RCPT\//);
    });

    it('the PayU webhook needs a valid hash and is idempotent', async () => {
      const f = response();
      const form = (x: Record<string, string>) => new URLSearchParams(x).toString();
      await http().post(`/v1/fees/webhooks/payu/${t.slug}`).type('form').send(form({ ...f, hash: 'a'.repeat(128) })).expect(401);
      await http().post(`/v1/fees/webhooks/payu/${t.slug}`).type('form').send(form(f)).expect(200);
      const rows = await db.select().from(s.feePayments).where(eq(s.feePayments.providerOrderId, pay.orderId));
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('paid');
    });

    it('imports a settlement file, matches by payment id, and queues the rest as exceptions', async () => {
      expect(parseSettlementCsv('payment_id,order_id,type,amount,fee,net\npayu_1,tx1,payment,10.50,0.25,10.25')[0]).toMatchObject({ amountPaise: 1050, feePaise: 25, netPaise: 1025 });
      const csv = [`payment_id,order_id,type,amount,fee,net`, `${mihpayid},${pay.orderId},payment,20000.00,400.00,19600.00`, `payu_unknown,txZ,payment,500.00,10.00,490.00`, `${mihpayid},${pay.orderId},refund,100.00,0,-100.00`].join('\n');
      await http().post('/v1/fees/settlements/import').set(auth('teacher')).send({ provider: 'payu', reference: 'UTR1', settlementDate: '2026-10-20', csv }).expect(403);
      const res = await http().post('/v1/fees/settlements/import').set(auth('principal')).send({ provider: 'payu', reference: 'UTR1', settlementDate: '2026-10-20', csv }).expect(201);
      expect(res.body).toMatchObject({ lines: 3, matched: 1, exceptions: 2 });
      await http().post('/v1/fees/settlements/import').set(auth('principal')).send({ provider: 'payu', reference: 'UTR1', settlementDate: '2026-10-20', csv }).expect(400);
      const ex = (await http().get('/v1/fees/settlements/exceptions').set(auth('principal')).expect(200)).body as { line: { id: string; exceptionReason: string } }[];
      expect(ex.map((e) => e.line.exceptionReason).sort()).toEqual(['refund_not_recorded', 'unknown_payment']);
      const unknown = ex.find((e) => e.line.exceptionReason === 'unknown_payment')!;
      await http().post(`/v1/fees/settlements/lines/${unknown.line.id}/resolve`).set(auth('principal')).send({ action: 'accept', note: 'Bank charge' }).expect(201);
      expect((await http().get('/v1/fees/settlements/exceptions').set(auth('principal')).expect(200)).body).toHaveLength(1);
      expect((await http().get('/v1/fees/settlements/unsettled?olderThanDays=0').set(auth('principal')).expect(200)).body).toHaveLength(0);
      // Another institution sees none of it.
      expect((await http().get('/v1/fees/settlements').set(auth('otherPrincipal')).expect(200)).body).toHaveLength(0);
    });

    it('refunds at the gateway, then records the refund; settlement can be fetched by API', async () => {
      const r = await http().post(`/v1/fees/settlements/payments/${pay.paymentId}/gateway-refund`).set(auth('principal')).send({ amountPaise: 100_00, reason: 'Duplicate fee' }).expect(201);
      expect(r.body.gatewayRefundId).toMatch(/^payu_rf_/);
      fakeSettlements.current = { reference: 'UTR2', settlementDate: '2026-10-21', lines: [{ kind: 'refund', providerPaymentId: mihpayid, providerOrderId: pay.orderId, amountPaise: 100_00, feePaise: 0, netPaise: -100_00 }] };
      const fetched = await http().post('/v1/fees/settlements/fetch').set(auth('principal')).send({ day: '2026-10-21' }).expect(201);
      expect(fetched.body).toMatchObject({ imported: true, matched: 1, exceptions: 0 });
      fakeSettlements.current = null;
    });

    it('a tenant can switch back to Razorpay', async () => {
      const view = await http().put('/v1/admin/payments/gateway').set(auth('principal')).send({ provider: 'razorpay', keyId: 'rzp_test_ZZZZzzzz1111', keySecret: 'rzp-key-secret-12', webhookSecret: 'rzp-webhook-sec-12' }).expect(200);
      expect(view.body).toMatchObject({ gateway: 'razorpay', mode: 'test' });
    });
  });

  // ---- 2. books --------------------------------------------------------------------------------------------

  describe('accounting books', () => {
    let accounts: Record<string, string>;
    it('seeds a chart, posts the fee receipt and refund by themselves', async () => {
      const list = (await http().get('/v1/books/accounts').set(auth('principal')).expect(200)).body as { id: string; code: string }[];
      accounts = Object.fromEntries(list.map((a) => [a.code, a.id]));
      expect(accounts['4000']).toBeDefined();
      await http().get('/v1/books/accounts').set(auth('teacher')).expect(403);
      const day = (await http().get(`/v1/books/daybook?from=2000-01-01&to=2099-12-31`).set(auth('principal')).expect(200)).body;
      const sources = day.vouchers.map((v: { sourceType: string }) => v.sourceType).sort();
      expect(sources).toEqual(['fee_payment', 'fee_refund']);
      const receipt = day.vouchers.find((v: { sourceType: string }) => v.sourceType === 'fee_payment');
      expect(receipt.voucherType).toBe('receipt');
      expect(receipt.lines.map((l: { code: string }) => l.code).sort()).toEqual(['1010', '4000']);
    });

    it('validates vouchers and keeps ledgers, trial balance, P&L and balance sheet in step', async () => {
      const post = (b: object) => http().post('/v1/books/vouchers').set(auth('principal')).send(b);
      const line = (code: string, d: number, c: number) => ({ accountId: accounts[code], debitPaise: d, creditPaise: c });
      await post({ type: 'receipt', date: '2026-10-22', lines: [line('1000', 500_00, 0), line('4100', 0, 400_00)] }).expect(400); // unbalanced
      await post({ type: 'journal', date: '2026-10-22', lines: [line('1000', 500_00, 0), line('4100', 0, 500_00)] }).expect(400); // journal touches cash
      await post({ type: 'receipt', date: '2026-10-22', lines: [line('1000', 500_00, 0), line('4100', 0, 500_00)], narration: 'Hall rent' }).expect(201);
      await post({ type: 'payment', date: '2026-10-23', lines: [line('5100', 120_00, 0), line('1000', 0, 120_00)], narration: 'Stationery' }).expect(201);
      await post({ type: 'contra', date: '2026-10-24', lines: [line('1010', 200_00, 0), line('1000', 0, 200_00)] }).expect(201);
      await post({ type: 'journal', date: '2026-10-25', lines: [line('5300', 50_00, 0), line('1200', 0, 50_00)], narration: 'Depreciation' }).expect(201);

      const tb = (await http().get('/v1/books/trial-balance?asOf=2026-12-31').set(auth('principal')).expect(200)).body;
      expect(tb.balanced).toBe(true);
      expect(tb.totalDebitPaise).toBe(tb.totalCreditPaise);
      const ie = (await http().get('/v1/books/income-expenditure?fy=2026-27').set(auth('principal')).expect(200)).body;
      // Fee income 20000 + other income 500 less refund 100, stationery 120 and depreciation 50.
      expect(ie.totalIncomePaise).toBe(20_500_00);
      expect(ie.totalExpensePaise).toBe(270_00);
      expect(ie.surplusPaise).toBe(20_230_00);
      const bs = (await http().get('/v1/books/balance-sheet?asOf=2026-12-31').set(auth('principal')).expect(200)).body;
      expect(bs.balanced).toBe(true);
      expect(bs.surplusPaise).toBe(20_230_00);
      const cash = (await http().get(`/v1/books/ledger/${accounts['1000']}`).set(auth('principal')).expect(200)).body;
      expect(cash.closingPaise).toBe(500_00 - 120_00 - 200_00);
      expect(cash.rows).toHaveLength(3);
      // Pure maths agrees.
      const m = [{ accountId: 'a', code: '1', name: 'Cash', groupType: 'asset' as const, openingPaise: 0, debitPaise: 100, creditPaise: 0 }, { accountId: 'b', code: '2', name: 'Fees', groupType: 'income' as const, openingPaise: 0, debitPaise: 0, creditPaise: 100 }];
      expect(trialBalance(m).balanced).toBe(true);
      expect(incomeExpenditure(m).surplusPaise).toBe(100);
      expect(balanceSheet(m).balanced).toBe(true);
    });

    it('opening balances must balance; a voided voucher drops out of the books', async () => {
      await http().put('/v1/books/opening').set(auth('principal')).send({ balances: [{ accountId: accounts['1010'], openingPaise: 1000_00 }] }).expect(400);
      await http().put('/v1/books/opening').set(auth('principal')).send({ balances: [{ accountId: accounts['1010'], openingPaise: 1000_00 }, { accountId: accounts['3000'], openingPaise: -1000_00 }] }).expect(200);
      const day = (await http().get('/v1/books/daybook?from=2026-10-23&to=2026-10-23').set(auth('principal')).expect(200)).body;
      await http().post(`/v1/books/vouchers/${day.vouchers[0].id}/void`).set(auth('principal')).expect(201);
      const ie = (await http().get('/v1/books/income-expenditure?fy=2026-27').set(auth('principal')).expect(200)).body;
      expect(ie.totalExpensePaise).toBe(150_00);
    });

    it('closes the financial year: surplus moves to reserves, the year locks, other tenants are untouched', async () => {
      const closed = (await http().post('/v1/books/years/2026-27/close').set(auth('principal')).expect(201)).body;
      expect(closed.surplusPaise).toBe(20_350_00);
      await http().post('/v1/books/years/2026-27/close').set(auth('principal')).expect(409);
      await http().post('/v1/books/vouchers').set(auth('principal')).send({ type: 'receipt', date: '2026-11-01', lines: [{ accountId: accounts['1000'], debitPaise: 100, creditPaise: 0 }, { accountId: accounts['4100'], debitPaise: 0, creditPaise: 100 }] }).expect(409);
      // The closed year still reports its income and expenditure, and the balance sheet still balances.
      expect((await http().get('/v1/books/income-expenditure?fy=2026-27').set(auth('principal')).expect(200)).body.surplusPaise).toBe(20_350_00);
      const bs = (await http().get('/v1/books/balance-sheet?asOf=2027-03-31').set(auth('principal')).expect(200)).body;
      expect(bs.balanced).toBe(true);
      expect(bs.surplusPaise).toBe(0);
      expect((await http().get('/v1/books/accounts').set(auth('otherPrincipal')).expect(200)).body.length).toBeGreaterThan(0);
      expect((await http().get('/v1/books/daybook?from=2000-01-01&to=2099-12-31').set(auth('otherPrincipal')).expect(200)).body.vouchers).toHaveLength(0);
    });
  });

  // ---- 3. Tally --------------------------------------------------------------------------------------------

  describe('Tally live sync', () => {
    const received: string[] = [];
    let mode: 'ok' | 'down' = 'ok';
    let port = 0;

    beforeAll(async () => {
      const srv = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          if (mode === 'down') {
            res.statusCode = 500;
            return res.end('boom');
          }
          received.push(body);
          // Like Tally: a repeat ledger is a line error that means "already there".
          if (body.includes('<LEDGER ') && received.filter((r) => r === body).length > 1) return res.end('<RESPONSE><LINEERROR>Ledger already exists</LINEERROR><ERRORS>1</ERRORS></RESPONSE>');
          res.end('<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>');
        });
      });
      servers.push(srv);
      port = await listen(srv);
    });

    it('settings, ledger mapping, push with a log, failure and retry', async () => {
      await http().put('/v1/tally/settings').set(auth('teacher')).send({ host: '127.0.0.1', port, company: 'Soundarya PU College' }).expect(403);
      await http().put('/v1/tally/settings').set(auth('principal')).send({ host: 'http://x', port, company: 'C' }).expect(400);
      mode = 'down';
      await http().put('/v1/tally/settings').set(auth('principal')).send({ host: '127.0.0.1', port, company: 'Soundarya PU College', enabled: true }).expect(200);
      const map = (await http().get('/v1/tally/mapping').set(auth('principal')).expect(200)).body as { accountId: string; code: string; tallyLedger: string; tallyParent: string }[];
      expect(map.find((m) => m.code === '1010')).toMatchObject({ tallyLedger: 'Bank Account', tallyParent: 'Bank Accounts' });
      const fee = map.find((m) => m.code === '4000')!;
      await http().put('/v1/tally/mapping').set(auth('principal')).send({ accountId: fee.accountId, tallyLedger: 'Tuition Fee Income', tallyParent: 'Direct Incomes' }).expect(200);

      const down = (await http().post('/v1/tally/sync').set(auth('principal')).expect(201)).body;
      expect(down.sent).toBe(0);
      expect(down.failed).toBeGreaterThan(0);
      const failed = (await http().get('/v1/tally/log?status=failed').set(auth('principal')).expect(200)).body;
      expect(failed.rows[0]).toMatchObject({ status: 'failed', attempts: 1 });
      expect(failed.rows[0].lastError).toMatch(/Tally answered 500/);

      mode = 'ok';
      const up = (await http().post('/v1/tally/sync').set(auth('principal')).expect(201)).body;
      expect(up.failed).toBe(0);
      expect(up.sent).toBe(down.failed);
      const log = (await http().get('/v1/tally/log').set(auth('principal')).expect(200)).body;
      expect(log.counts).toMatchObject({ pending: 0, failed: 0 });
      // Ledgers go before vouchers; amounts and names follow the mapping and Tally's sign rules.
      const firstVoucher = received.findIndex((x) => x.includes('<VOUCHER '));
      expect(received.slice(0, firstVoucher).every((x) => x.includes('<LEDGER '))).toBe(true);
      expect(received.some((x) => x.includes('<LEDGER NAME="Tuition Fee Income"') && x.includes('<PARENT>Direct Incomes</PARENT>'))).toBe(true);
      const receipt = received.find((x) => x.includes('VCHTYPE="Receipt"') && x.includes('Fee receipt'))!;
      expect(receipt).toContain('<LEDGERNAME>Tuition Fee Income</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>20000.00</AMOUNT>');
      expect(receipt).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-20000.00</AMOUNT>');
      expect(receipt).toContain('<SVCURRENTCOMPANY>Soundarya PU College</SVCURRENTCOMPANY>');
    });

    it('a new voucher is queued automatically; the offline XML file carries what is not yet in Tally', async () => {
      const accs = (await http().get('/v1/books/accounts').set(auth('principal')).expect(200)).body as { id: string; code: string }[];
      const id = (c: string) => accs.find((a) => a.code === c)!.id;
      // 2026-27 is closed, so post into the next year.
      await http().post('/v1/books/vouchers').set(auth('principal')).send({ type: 'payment', date: '2027-04-02', narration: 'Chalk & duster <new>', lines: [{ accountId: id('5100'), debitPaise: 75_00, creditPaise: 0 }, { accountId: id('1000'), debitPaise: 0, creditPaise: 75_00 }] }).expect(201);
      expect((await http().get('/v1/tally/log').set(auth('principal')).expect(200)).body.counts.pending).toBe(1);
      const file = await http().get('/v1/tally/export.xml').set(auth('principal')).expect(200);
      expect(file.text).toContain('Chalk &amp; duster &lt;new&gt;');
      expect(file.text).toContain('<SVCURRENTCOMPANY>Soundarya PU College</SVCURRENTCOMPANY>');
      expect((await http().post('/v1/tally/mark-imported').set(auth('principal')).expect(201)).body.marked).toBe(1);
      expect((await http().get('/v1/tally/log').set(auth('principal')).expect(200)).body.counts.pending).toBe(0);
      expect((await http().get('/v1/tally/settings').set(auth('otherPrincipal')).expect(200)).body).toEqual({});
    });
  });

  // ---- 4. SSO ----------------------------------------------------------------------------------------------

  describe('OIDC single sign-on', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
    let idp = '';
    let nextClaims: Record<string, unknown> = {};
    let lastToken: Record<string, string> = {};
    let providerId = '';
    const RETURN = 'kinetix://sso';

    const idToken = (claims: Record<string, unknown>) => {
      const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const head = part({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
      const body = part({ iss: idp, aud: 'client-123', exp: Math.floor(Date.now() / 1000) + 600, ...claims });
      return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')}`;
    };

    beforeAll(async () => {
      const srv = createServer((req, res) => {
        if (req.url?.startsWith('/jwks')) return res.setHeader('content-type', 'application/json').end(JSON.stringify({ keys: [jwk] }));
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          lastToken = Object.fromEntries(new URLSearchParams(body));
          res.setHeader('content-type', 'application/json').end(JSON.stringify({ id_token: idToken(nextClaims) }));
        });
      });
      servers.push(srv);
      idp = `http://127.0.0.1:${await listen(srv)}`;
    });

    const begin = async (email: string, nonceClaims: Record<string, unknown>) => {
      const start = await http().post('/v1/auth/sso/start').send({ email, redirectUri: RETURN }).expect(201);
      const url = new URL(start.body.authorizationUrl);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      nextClaims = { nonce: url.searchParams.get('nonce'), ...nonceClaims };
      const cb = await http().get('/v1/auth/sso/callback').query({ code: 'abc', state: url.searchParams.get('state') }).expect(302);
      return { url, location: new URL(cb.headers.location as string) };
    };

    it('the administrator configures a generic provider; domains belong to one institution', async () => {
      const body = { kind: 'generic', name: 'College Workspace', issuer: idp, authorizationEndpoint: `${idp}/auth`, tokenEndpoint: `${idp}/token`, jwksUri: `${idp}/jwks`, clientId: 'client-123', clientSecret: 'idp-client-secret', allowedDomains: ['college.example.in'], redirectAllowlist: [RETURN] };
      await http().post('/v1/admin/sso/providers').set(auth('teacher')).send(body).expect(403);
      const made = await http().post('/v1/admin/sso/providers').set(auth('admin')).send(body).expect(201);
      providerId = made.body.id;
      expect(JSON.stringify(made.body)).not.toContain('idp-client-secret');
      expect(made.body.hasSecret).toBe(true);
      await http().post('/v1/admin/sso/providers').set(auth('otherPrincipal')).send({ ...body, name: 'Dup' }).expect(409);
      // Presets need no endpoints.
      const g = await http().post('/v1/admin/sso/providers').set(auth('admin')).send({ kind: 'microsoft', name: 'Entra', directoryId: 'contoso-tenant', clientId: 'ms-client', clientSecret: 'ms-secret', allowedDomains: ['staff.example.in'], redirectAllowlist: [RETURN] }).expect(201);
      expect(g.body.authorizationEndpoint).toBe('https://login.microsoftonline.com/contoso-tenant/oauth2/v2.0/authorize');
      await http().delete(`/v1/admin/sso/providers/${g.body.id}`).set(auth('admin')).expect(200);
      expect((await http().get(`/v1/auth/sso/providers?tenant=${t.slug}`).expect(200)).body).toEqual([{ id: providerId, kind: 'generic', name: 'College Workspace' }]);
    });

    it('signs in with PKCE, links the existing user by verified email, and exchanges a single-use ticket', async () => {
      await db.update(s.users).set({ email: 'teacher@college.example.in' }).where(eq(s.users.id, t.teacher.id));
      const { location } = await begin('teacher@college.example.in', { sub: 'idp-user-1', email: 'Teacher@College.example.in', email_verified: true });
      expect(lastToken).toMatchObject({ grant_type: 'authorization_code', client_id: 'client-123', client_secret: 'idp-client-secret' });
      expect(lastToken.code_verifier.length).toBeGreaterThan(40);
      const ticket = location.searchParams.get('ticket')!;
      expect(location.href.startsWith('kinetix://sso')).toBe(true);
      expect(location.searchParams.get('tenant')).toBe(t.slug);
      const session = await http().post('/v1/auth/sso/exchange').send({ tenant: t.slug, ticket }).expect(201);
      expect(session.body.user.roles).toContain('teacher');
      await http().get('/v1/me').set({ authorization: `Bearer ${session.body.accessToken}` }).expect(200);
      await http().post('/v1/auth/sso/exchange').send({ tenant: t.slug, ticket }).expect(401);
      const [ident] = await db.select().from(s.ssoIdentities).where(eq(s.ssoIdentities.userId, t.teacher.id));
      expect(ident).toMatchObject({ subject: 'idp-user-1', providerId });
      // The second time the subject finds the user even if the address changed.
      const again = await begin('teacher@college.example.in', { sub: 'idp-user-1', email: 'teacher@college.example.in', email_verified: true });
      expect(again.location.searchParams.get('ticket')).toBeTruthy();
    });

    it('apps without a deep link: the system browser finishes and the app collects the session by polling with its own id', async () => {
      const pollId = randomUUID();
      const start = await http().post('/v1/auth/sso/start').send({ email: 'teacher@college.example.in', pollId }).expect(201);
      await http().post('/v1/auth/sso/exchange').send({ tenant: t.slug, ticket: pollId }).expect(401);
      const url = new URL(start.body.authorizationUrl);
      nextClaims = { nonce: url.searchParams.get('nonce'), sub: 'idp-user-1', email: 'teacher@college.example.in', email_verified: true };
      const page = await http().get('/v1/auth/sso/callback').query({ code: 'abc', state: url.searchParams.get('state') }).expect(200);
      expect(page.text).toContain('Signed in');
      const session = await http().post('/v1/auth/sso/exchange').send({ tenant: t.slug, ticket: pollId }).expect(201);
      expect(session.body.user.roles).toContain('teacher');
      await http().post('/v1/auth/sso/exchange').send({ tenant: t.slug, ticket: pollId }).expect(401);
    });

    it('refuses unknown people, wrong domains, unverified emails, bad nonces, bad return addresses and tampered state', async () => {
      expect((await begin('nobody@college.example.in', { sub: 'idp-x', email: 'nobody@college.example.in', email_verified: true })).location.searchParams.get('error')).toBe('no_account');
      expect((await begin('teacher@college.example.in', { sub: 'idp-y', email: 'teacher@other.com', email_verified: true })).location.searchParams.get('error')).toBe('domain');
      expect((await begin('teacher@college.example.in', { sub: 'idp-z', email: 'teacher@college.example.in', email_verified: false })).location.searchParams.get('error')).toBe('domain');
      expect((await begin('teacher@college.example.in', { sub: 'idp-n', nonce: 'wrong', email: 'teacher@college.example.in', email_verified: true })).location.searchParams.get('error')).toBe('failed');
      await http().post('/v1/auth/sso/start').send({ email: 'teacher@college.example.in', redirectUri: 'https://evil.example/steal' }).expect(400);
      await http().post('/v1/auth/sso/start').send({ email: 'someone@unknown.example' }).expect(400);
      await http().post('/v1/auth/sso/start').send({ email: 'someone@unknown.example', redirectUri: RETURN }).expect(404);
      await http().get('/v1/auth/sso/callback').query({ code: 'abc', state: 'v1.tampered' }).expect(400);
    });
  });

  // ---- 5. Online class meetings and attendance ---------------------------------------------------------------

  describe('online class meetings', () => {
    let api = '';
    let reportMode: 'full' = 'full';
    let meetingId = '';
    let startsAt: Date;
    const created: string[] = [];

    beforeAll(async () => {
      const srv = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          res.setHeader('content-type', 'application/json');
          if (req.url?.startsWith('/token')) return res.end(JSON.stringify({ access_token: 'tok' }));
          if (req.method === 'POST' && req.url?.includes('/events')) {
            created.push(body);
            return res.end(JSON.stringify({ id: 'evt1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }));
          }
          if (req.url?.includes('/conferenceRecords?')) return res.end(JSON.stringify({ conferenceRecords: [{ name: 'conferenceRecords/r1' }] }));
          if (req.url?.includes('/participants')) {
            const s0 = startsAt.toISOString();
            return res.end(JSON.stringify({ participants: [
              { signedinUser: { displayName: 'Student A' }, earliestStartTime: s0, latestEndTime: new Date(startsAt.getTime() + 50 * 60_000).toISOString() },
              { signedinUser: { displayName: 'student  b' }, earliestStartTime: new Date(startsAt.getTime() + 20 * 60_000).toISOString(), latestEndTime: new Date(startsAt.getTime() + 55 * 60_000).toISOString() },
              { signedinUser: { displayName: 'Parent Visitor' }, earliestStartTime: s0, latestEndTime: new Date(startsAt.getTime() + 10 * 60_000).toISOString() },
            ] }));
          }
          res.statusCode = 404;
          res.end('{}');
        });
      });
      servers.push(srv);
      api = `http://127.0.0.1:${await listen(srv)}`;
      void reportMode;
    });

    it('Google Meet: create a meeting from a timetable slot and pull the report into suggested attendance the teacher confirms', async () => {
      const conn = await http().post('/v1/connectors').set(auth('connAdmin')).send({ type: 'lms_video', name: 'Meet', enabled: true, config: { provider: 'meet', clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rt', apiBaseUrl: `${api}/calendar`, tokenUrl: `${api}/token`, meetApiUrl: `${api}/meet` } }).expect(201);
      expect((await http().post(`/v1/connectors/${conn.body.id}/test`).set(auth('connAdmin')).expect(200)).body.status).toBe('ok');
      // The next Monday in the slot's weekday.
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + ((8 - (d.getUTCDay() || 7)) % 7 || 7));
      const date = d.toISOString().slice(0, 10);
      const m = await http().post('/v1/connectors/video/meetings').set(auth('teacher')).send({ slotId: t.slot.id, date }).expect(201);
      meetingId = m.body.id;
      startsAt = new Date(m.body.startsAt);
      expect(m.body).toMatchObject({ provider: 'meet', joinUrl: 'https://meet.google.com/abc-defg-hij' });
      expect(JSON.parse(created[0]).conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');

      // Join links reach the teacher, the student of the section and their guardians; not other sections.
      const mine = (who: string) => http().get('/v1/connectors/video/mine').set(auth(who));
      expect((await mine('teacher').expect(200)).body[0]).toMatchObject({ id: meetingId, joinUrl: 'https://meet.google.com/abc-defg-hij' });
      expect((await mine('student').expect(200)).body[0]).toMatchObject({ id: meetingId, hostUrl: null });
      expect((await mine('parent').expect(200)).body).toHaveLength(1);
      expect((await mine('otherPrincipal').expect(200)).body).toHaveLength(0);

      const pulled = (await http().post(`/v1/connectors/video/meetings/${meetingId}/participants/pull`).set(auth('teacher')).expect(201)).body;
      const byName = Object.fromEntries(pulled.proposals.map((p: { name: string; status: string }) => [p.name, p.status]));
      expect(byName).toEqual({ 'Student A': 'present', 'Student B': 'late', 'Student C': 'absent' });
      expect(pulled.unmatched.map((u: { name: string }) => u.name)).toEqual(['Parent Visitor']);
      // Nothing is marked until the teacher confirms.
      expect(await db.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.timetableSlotId, t.slot.id))).toHaveLength(0);
      await http().post(`/v1/connectors/video/meetings/${meetingId}/participants/pull`).set(auth('student')).expect(403);
      const entries = pulled.proposals.map((p: { studentId: string; status: string; name: string }) => ({ studentId: p.studentId, status: p.name === 'Student C' ? 'excused' : p.status }));
      expect((await http().post(`/v1/connectors/video/meetings/${meetingId}/attendance/confirm`).set(auth('teacher')).send({ entries }).expect(201)).body.marked).toBe(3);
      const rows = await db.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.timetableSlotId, t.slot.id));
      expect(rows.map((r) => r.status).sort()).toEqual(['excused', 'late', 'present']);
      expect(rows.every((r) => r.markedBy === t.teacher.id)).toBe(true);
      // Another teacher cannot touch it.
      await http().get(`/v1/connectors/video/meetings/${meetingId}/attendance`).set(auth('otherPrincipal')).expect(404);
      void randomUUID;
    });
  });
});
