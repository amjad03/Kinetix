import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createHash, createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import * as s from '../src/db/schema.js';
import { feeAccounts, gatewayWebhookEvents } from '../src/db/schema-fee-flagship.js';
import { cashfreeSignature, ccDecrypt, ccEncrypt, easebuzzRequestHash, easebuzzResponseHash } from '../src/fees/gateways.js';
import { GatewayFlow } from '../src/fees/gateway-flow.service.js';
import { payuResponseHash, sha512 } from '../src/fees/payment-provider.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * The five gateways behind one adapter, each in its sandbox (test) mode. A local stand-in answers every gateway API
 * with the sample payloads of that gateway's integration documents and checks our credentials, hashes and
 * encryption exactly as the gateway would; webhooks are signed here the way each gateway signs them. Every flow:
 * save credentials (secrets never echoed) → test connection → checkout → webhook (bad signature refused, repeat
 * acknowledged once) → status poll of a pending payment → refund at the gateway → settlement fetched and matched.
 *
 * Figures: every fee is ₹15,000.00 (15_00_000 paise); refunds are ₹500.00; settlement fee ₹30.00 + ₹5.40 GST.
 */

interface Order {
  provider: string;
  amountPaise: number;
  paid: boolean;
  paymentId: string;
  fields?: Record<string, string>;
}

describe('payment gateways: Razorpay, PayU, Cashfree, Easebuzz and CCAvenue in sandbox', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const FEE = 15_000_00;

  // ---- The stand-in for the five gateways' sandboxes ------------------------------------------------------
  const CRED = {
    razorpay: { keyId: 'rzp_test_AbCdEf123456', keySecret: 'rzp-secret-key-0001', webhookSecret: 'rzp-webhook-0001' },
    payu: { keyId: 'gtKFFx', keySecret: 'payu-salt-0000001' },
    cashfree: { keyId: 'TEST1023456789abcdef', keySecret: 'cfsk_ma_test_secret_0001' },
    easebuzz: { keyId: 'EBZKEY1234', keySecret: 'ebz-salt-000000001', accessCode: 'accounts@soundarya.test' },
    ccavenue: { keyId: '2034567', keySecret: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', accessCode: 'AVJK12AB34CD56EF' },
  };
  const orders = new Map<string, Order>();
  const refunds: { provider: string; body: string }[] = [];
  let seq = 0;
  let base = '';
  let remote: Server;
  const reply = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
    res.statusCode = status;
    res.setHeader('content-type', type);
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const fields = (b: string) => Object.fromEntries(new URLSearchParams(b)) as Record<string, string>;
  const rs = (p: number) => (p / 100).toFixed(2);

  function route(req: IncomingMessage, body: string, res: ServerResponse) {
    const url = req.url ?? '';
    // Razorpay (https://razorpay.com/docs/api/orders): Basic auth with key id and secret.
    if (url.startsWith('/razorpay/')) {
      if (req.headers.authorization !== `Basic ${Buffer.from(`${CRED.razorpay.keyId}:${CRED.razorpay.keySecret}`).toString('base64')}`) return reply(res, 401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
      if (url === '/razorpay/v1/orders' && req.method === 'POST') {
        const b = JSON.parse(body) as { amount: number; receipt: string };
        const id = `order_RZP${String(++seq).padStart(10, '0')}`;
        orders.set(id, { provider: 'razorpay', amountPaise: b.amount, paid: false, paymentId: `pay_RZP${String(seq).padStart(10, '0')}` });
        return reply(res, 200, { id, entity: 'order', amount: b.amount, currency: 'INR', receipt: b.receipt, status: 'created' });
      }
      if (url.startsWith('/razorpay/v1/orders?count=1')) return reply(res, 200, { entity: 'collection', count: 0, items: [] });
      const op = /^\/razorpay\/v1\/orders\/([^/]+)\/payments$/.exec(url);
      if (op) {
        const o = orders.get(op[1]);
        return reply(res, 200, { entity: 'collection', count: o?.paid ? 1 : 0, items: o?.paid ? [{ id: o.paymentId, entity: 'payment', amount: o.amountPaise, status: 'captured', order_id: op[1] }] : [] });
      }
      const rf = /^\/razorpay\/v1\/payments\/([^/]+)\/refund$/.exec(url);
      if (rf) {
        refunds.push({ provider: 'razorpay', body });
        return reply(res, 200, { id: 'rfnd_RZP0000000001', entity: 'refund', amount: JSON.parse(body).amount, payment_id: rf[1], status: 'processed' });
      }
      if (url.startsWith('/razorpay/v1/settlements/recon/combined')) {
        const items = [...orders.entries()].filter(([, o]) => o.provider === 'razorpay' && o.paid).map(([id, o]) => ({ entity_id: o.paymentId, type: 'payment', order_id: id, amount: o.amountPaise, fee: 30_00, tax: 5_40, credit: o.amountPaise - 35_40, debit: 0, settlement_id: 'setl_RZP0001' }));
        return reply(res, 200, { entity: 'collection', count: items.length, items });
      }
    }
    // PayU (https://docs.payu.in, postservice.php): hash = sha512(key|command|var1|salt).
    if (url.startsWith('/payu/merchant/postservice.php')) {
      const f = fields(body);
      if (f.key !== CRED.payu.keyId || f.hash !== sha512(`${f.key}|${f.command}|${f.var1}|${CRED.payu.keySecret}`)) return reply(res, 200, { status: 0, msg: 'Invalid Hash.' });
      if (f.command === 'verify_payment') {
        const o = orders.get(f.var1);
        return reply(res, 200, { status: 1, msg: '1 out of 1 Transactions Fetched Successfully', transaction_details: o ? { [f.var1]: { mihpayid: o.paymentId, status: o.paid ? 'success' : 'pending', amt: rs(o.amountPaise), txnid: f.var1 } } : { [f.var1]: { status: 'Not Found' } } });
      }
      if (f.command === 'cancel_refund_transaction') {
        refunds.push({ provider: 'payu', body });
        return reply(res, 200, { status: 1, msg: 'Refund Request Queued', request_id: '7800456', mihpayid: f.var1 });
      }
      if (f.command === 'get_settlement_details') {
        const rows = [...orders.entries()].filter(([, o]) => o.provider === 'payu' && o.paid).map(([id, o]) => ({ mihpayid: o.paymentId, txnid: id, amount: rs(o.amountPaise), service_fee: '30.00', service_tax: '5.40', net_amount: rs(o.amountPaise - 35_40), type: 'Sale' }));
        return reply(res, 200, { status: 1, utr: 'PAYUUTR0001', Txn_details: rows });
      }
    }
    // Cashfree PG (x-api-version 2023-08-01).
    if (url.startsWith('/cashfree/pg/')) {
      if (req.headers['x-client-id'] !== CRED.cashfree.keyId || req.headers['x-client-secret'] !== CRED.cashfree.keySecret || req.headers['x-api-version'] !== '2023-08-01') return reply(res, 401, { message: 'authentication Failed', code: 'request_failed', type: 'authentication_error' });
      if (url === '/cashfree/pg/orders' && req.method === 'POST') {
        const b = JSON.parse(body) as { order_id: string; order_amount: number; customer_details: { customer_phone: string } };
        if (!/^\d{10}$/.test(b.customer_details.customer_phone)) return reply(res, 400, { message: 'customer_details.customer_phone : invalid value', code: 'customer_details.customer_phone_invalid' });
        orders.set(b.order_id, { provider: 'cashfree', amountPaise: Math.round(b.order_amount * 100), paid: false, paymentId: String(5114910 + ++seq) });
        return reply(res, 200, { cf_order_id: 2149460581 + seq, order_id: b.order_id, entity: 'order', order_currency: 'INR', order_amount: b.order_amount, order_status: 'ACTIVE', payment_session_id: `session_${'x'.repeat(20)}${seq}` });
      }
      if (url.startsWith('/cashfree/pg/orders/zynetix-ping-')) return reply(res, 404, { message: 'order not found', code: 'order_not_found', type: 'invalid_request_error' });
      const op = /^\/cashfree\/pg\/orders\/([^/]+)\/payments$/.exec(url);
      if (op) {
        const o = orders.get(op[1]);
        return reply(res, 200, o?.paid ? [{ cf_payment_id: Number(o.paymentId), order_id: op[1], payment_status: 'SUCCESS', payment_amount: o.amountPaise / 100, payment_currency: 'INR' }] : []);
      }
      const rf = /^\/cashfree\/pg\/orders\/([^/]+)\/refunds$/.exec(url);
      if (rf) {
        refunds.push({ provider: 'cashfree', body });
        return reply(res, 200, { cf_payment_id: orders.get(rf[1])?.paymentId, cf_refund_id: '15005', refund_id: JSON.parse(body).refund_id, order_id: rf[1], refund_amount: JSON.parse(body).refund_amount, refund_status: 'PENDING' });
      }
      if (url === '/cashfree/pg/settlement/recon') {
        const data = [...orders.entries()].filter(([, o]) => o.provider === 'cashfree' && o.paid).map(([id, o]) => ({ event_id: o.paymentId, event_type: 'PAYMENT', event_amount: o.amountPaise / 100, service_charge: 30, service_tax: 5.4, event_settlement_amount: (o.amountPaise - 35_40) / 100, order_id: id, settlement_utr: 'CFUTR0001', cf_settlement_id: 123456 }));
        return reply(res, 200, { cursor: null, limit: 200, data });
      }
    }
    // Easebuzz: initiateLink, Transaction API v2.1, Refund v2, Settlements.
    if (url.startsWith('/easebuzz/')) {
      const f = fields(body);
      if (f.key !== CRED.easebuzz.keyId) return reply(res, 200, { status: 0, error_desc: 'Invalid merchant key' });
      if (url === '/easebuzz/pay/payment/initiateLink') {
        if (f.hash !== easebuzzRequestHash(f.key, CRED.easebuzz.keySecret, f)) return reply(res, 200, { status: 0, error_desc: 'Invalid hash' });
        orders.set(f.txnid, { provider: 'easebuzz', amountPaise: Math.round(Number(f.amount) * 100), paid: false, paymentId: `E26${String(++seq).padStart(9, '0')}`, fields: f });
        return reply(res, 200, { status: 1, data: `ebzaccess${seq}` });
      }
      if (url === '/easebuzz/dashboard/transaction/v2.1/retrieve') {
        if (f.hash !== sha512(`${f.key}|${f.txnid}|${CRED.easebuzz.keySecret}`)) return reply(res, 200, { status: false, msg: 'Invalid hash' });
        const o = orders.get(f.txnid);
        return reply(res, 200, { status: true, msg: o ? [{ txnid: f.txnid, easepayid: o.paymentId, status: o.paid ? 'success' : 'initiated', amount: rs(o.amountPaise) }] : 'Transaction not found' });
      }
      if (url === '/easebuzz/dashboard/transaction/v2/refund') {
        if (f.hash !== sha512(`${f.key}|${f.merchant_refund_id}|${f.easebuzz_id}|${f.refund_amount}|${CRED.easebuzz.keySecret}`)) return reply(res, 200, { status: false, reason: 'Invalid hash' });
        refunds.push({ provider: 'easebuzz', body });
        return reply(res, 200, { status: true, refund_id: 'R2610200001', easebuzz_id: f.easebuzz_id, refund_amount: f.refund_amount, reason: 'Refund request accepted' });
      }
      if (url === '/easebuzz/dashboard/settlements/v1/retrieve') {
        if (f.hash !== sha512(`${f.key}|${f.merchant_email}|${f.payout_date}|${CRED.easebuzz.keySecret}`) || f.payout_date !== '20-10-2026') return reply(res, 200, { status: false, data: [] });
        const peb = [...orders.entries()].filter(([, o]) => o.provider === 'easebuzz' && o.paid).map(([id, o]) => ({ txnid: id, easebuzz_id: o.paymentId, amount: rs(o.amountPaise), service_charge: '30.00', service_tax: '5.40', settlement_amount: rs(o.amountPaise - 35_40) }));
        return reply(res, 200, { status: true, data: [{ payout_date: f.payout_date, bank_transaction_id: 'EBZUTR0001', payout_id: 'PO1', peb_transactions: peb, refund_transactions: [] }] });
      }
    }
    // CCAvenue API (/apis/servlet/DoWebTrans): enc_request is AES-128-CBC with the working key.
    if (url === '/ccavenue/api/apis/servlet/DoWebTrans') {
      const f = fields(body);
      if (f.access_code !== CRED.ccavenue.accessCode) return reply(res, 200, 'status=1&enc_response=Invalid Access Code&enc_error_code=51407', 'text/plain');
      let q: Record<string, unknown>;
      try {
        q = JSON.parse(ccDecrypt(CRED.ccavenue.keySecret, f.enc_request));
      } catch {
        return reply(res, 200, 'status=1&enc_response=Decryption failed&enc_error_code=51408', 'text/plain');
      }
      const answer = (o: unknown) => reply(res, 200, `status=0&enc_response=${ccEncrypt(CRED.ccavenue.keySecret, JSON.stringify(o))}&enc_error_code=`, 'text/plain');
      if (f.command === 'orderStatusTracker') {
        const o = orders.get(String(q.order_no));
        if (!o) return answer({ status: 1, error_desc: 'Order not found', error_code: '51419' });
        return answer({ status: 0, order_status: o.paid ? 'Shipped' : 'Initiated', reference_no: o.paymentId, order_amt: o.amountPaise / 100, order_no: q.order_no });
      }
      if (f.command === 'refundOrder') {
        refunds.push({ provider: 'ccavenue', body: JSON.stringify(q) });
        return answer({ Refund_Order_Result: { refund_status: 0, reason: '' } });
      }
      if (f.command === 'payoutSummary') return answer({ payout_summary_list: q.settlement_date === '20-10-2026' ? [{ pay_id: 'CCPAY1', utr_no: 'CCUTR0001', settlement_date: '20-10-2026' }] : [] });
      if (f.command === 'getSettlementDetails') {
        const list = [...orders.entries()].filter(([, o]) => o.provider === 'ccavenue' && o.paid).map(([id, o]) => ({ order_no: id, ccavenue_ref_no: o.paymentId, amount: rs(o.amountPaise), fees: '30.00', tax: '5.40', payable_amount: rs(o.amountPaise - 35_40), txn_type: 'Sale' }));
        return answer({ settlement_details_list: list });
      }
    }
    reply(res, 404, { message: 'not found' });
  }

  beforeAll(async () => {
    remote = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => route(req, Buffer.concat(chunks).toString('utf8'), res));
    });
    await new Promise<void>((r) => remote.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [acc] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Asha Accounts', email: `acc-gw-${t.slug}@x.in`, phone: '+919845012345', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: acc.id, role: 'accountant' });
    await db.update(s.users).set({ phone: '+919845098765' }).where(eq(s.users.id, t.guardian.id));
    app = await createApp(clock, (m) => m.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'gateways', RAZORPAY_FAKE: 'false', PAYU_FAKE: 'false', PAYMENT_GATEWAY_TEST_BASE: base, API_PUBLIC_URL: 'https://api.zynetix.test' })));
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.acc = await login(t.slug, acc.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    tokens.otherPrincipal = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await new Promise((r) => remote.close(r));
    await owner.end();
  });

  /** A fresh ₹15,000 fee for the first student (one invoice per class student; we pay student A's). */
  async function feeA(title: string): Promise<string> {
    await http().post('/v1/fees/invoices').set(as('acc')).send({ sectionId: t.section.id, title, amountPaise: FEE, dueOn: '2026-11-15' }).expect(201);
    const mine = (await http().get(`/v1/fees/students/${t.students[0].id}`).set(as('parent')).expect(200)).body.invoices as { id: string; title: string }[];
    return mine.find((i) => i.title === title)!.id;
  }
  const save = (body: Record<string, unknown>, who = 'principal') => http().put('/v1/admin/payments/gateways').set(as(who)).send(body);
  const checkout = async (invoiceId: string) => (await http().post(`/v1/fees/invoices/${invoiceId}/checkout`).set(as('parent')).send({}).expect(201)).body;
  /** The payer completes the payment at the gateway (hosted pages make no order call we would have seen). */
  const payAtGateway = (orderId: string, provider: string) => {
    const o = orders.get(orderId) ?? { provider, amountPaise: FEE, paid: false, paymentId: provider === 'payu' ? `4039937${String(++seq).padStart(11, '0')}` : `1100${String(++seq).padStart(8, '0')}` };
    o.paid = true;
    orders.set(orderId, o);
  };
  const payment = async (id: string) => (await db.select().from(s.feePayments).where(eq(s.feePayments.id, id)))[0];
  const events = async (provider: string) => (await db.select().from(gatewayWebhookEvents).where(eq(gatewayWebhookEvents.provider, provider))).filter((e) => e.tenantId === t.tenantId);

  /** The common tail: a pending payment polled paid, a refund at the gateway, the day's settlement matched. */
  async function pollRefundSettle(provider: string, title: string) {
    const inv = await feeA(title);
    const co = await checkout(inv);
    expect((await http().post(`/v1/fees/payments/${co.paymentId}/refresh`).set(as('parent')).expect(200)).body.status).toBe('pending');
    payAtGateway(co.orderId, provider);
    const done = (await http().post(`/v1/fees/payments/${co.paymentId}/refresh`).set(as('parent')).expect(200)).body;
    expect(done).toMatchObject({ status: 'paid', receipt: { amountPaise: FEE } });
    expect((await payment(co.paymentId)).providerPaymentId).toBe(orders.get(co.orderId)!.paymentId);
    // Another family cannot ask about it.
    await http().post(`/v1/fees/payments/${co.paymentId}/refresh`).set(as('parent2')).expect(404);
    const rf = (await http().post(`/v1/fees/settlements/payments/${co.paymentId}/gateway-refund`).set(as('acc')).send({ amountPaise: 500_00, reason: 'Excess paid' }).expect(201)).body;
    expect(rf.amountPaise).toBe(500_00);
    expect(refunds.at(-1)!.provider).toBe(provider);
    const fetched = (await http().post('/v1/fees/settlements/fetch').set(as('acc')).send({ day: '2026-10-20' }).expect(201)).body;
    expect(fetched).toMatchObject({ imported: true });
    expect(fetched.exceptions).toBe(0);
    expect(fetched.matched).toBeGreaterThanOrEqual(1);
    return co;
  }

  it('keeps each gateway’s credentials per institution and fee account, encrypted, admin only, never echoed', async () => {
    await save({ provider: 'cashfree', ...CRED.cashfree }, 'acc').expect(403);
    await save({ provider: 'cashfree', ...CRED.cashfree }, 'teacher').expect(403);
    await save({ provider: 'cashfree', keyId: CRED.cashfree.keyId }).expect(400); // the secret is needed the first time
    await save({ provider: 'ccavenue', keyId: 'abc', keySecret: CRED.ccavenue.keySecret, accessCode: CRED.ccavenue.accessCode }).expect(400); // a merchant id is digits
    const saved = (await save({ provider: 'razorpay', ...CRED.razorpay }).expect(200)).body;
    expect(saved).toMatchObject({ provider: 'razorpay', mode: 'test', keyId: CRED.razorpay.keyId, keySecretLast4: '0001', feeAccountId: null, webhookPath: `/v1/fees/webhooks/razorpay/${t.slug}` });
    expect(JSON.stringify(saved)).not.toContain(CRED.razorpay.keySecret);
    const [row] = await db.select().from(s.paymentGatewayAccounts).where(eq(s.paymentGatewayAccounts.tenantId, t.tenantId));
    expect(row.keySecretEnc).not.toContain(CRED.razorpay.keySecret);
    expect((await http().post('/v1/admin/payments/gateways/default/test').set(as('principal')).expect(200)).body).toMatchObject({ ok: true, provider: 'razorpay', mode: 'test' });
    // Another institution sees none of it.
    expect((await http().get('/v1/admin/payments/gateways').set(as('otherPrincipal')).expect(200)).body.accounts).toEqual([]);
    const audit = await db.select().from(s.auditLog).where(eq(s.auditLog.action, 'payments.gateway_saved'));
    expect(JSON.stringify(audit)).not.toContain(CRED.razorpay.keySecret);
  });

  it('Razorpay: checkout, signed webhook once, polling, refund and settlement', async () => {
    const inv = await feeA('Razorpay fee');
    const co = await checkout(inv);
    expect(co).toMatchObject({ provider: 'razorpay', keyId: CRED.razorpay.keyId, amountPaise: FEE, hosted: null });
    const o = orders.get(co.orderId)!;
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: o.paymentId, order_id: co.orderId, amount: FEE, status: 'captured' } } } });
    const sig = createHmac('sha256', CRED.razorpay.webhookSecret).update(body).digest('hex');
    const hook = (signature: string, slug = t.slug) => http().post(`/v1/fees/webhooks/razorpay/${slug}`).set('content-type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', 'evt_RZP0001').send(body);
    await hook('f'.repeat(64)).expect(401);
    // Signed for this institution but sent to another one's address: refused there.
    await hook(sig, other.slug).expect(401);
    expect((await hook(sig).expect(200)).body.outcome).toBe('credited');
    expect((await hook(sig).expect(200)).body.outcome).toBe('duplicate');
    expect((await payment(co.paymentId)).status).toBe('paid');
    expect(await events('razorpay')).toHaveLength(1);
    await pollRefundSettle('razorpay', 'Razorpay fee 2');
  });

  it('PayU: hosted checkout, reverse-hash webhook, verify_payment polling, refund and settlement', async () => {
    await save({ provider: 'payu', mode: 'test', ...CRED.payu }).expect(200);
    expect((await http().post('/v1/admin/payments/gateways/default/test').set(as('principal')).expect(200)).body).toMatchObject({ ok: true, provider: 'payu' });
    const inv = await feeA('PayU fee');
    const co = await checkout(inv);
    expect(co.hosted).toMatchObject({ url: `${base}/payu/_payment`, method: 'POST' });
    expect(co.hosted.fields.surl).toBe(`https://api.zynetix.test/v1/fees/gateway-return/payu/${t.slug}`);
    const f: Record<string, string> = { ...co.hosted.fields, status: 'success', mihpayid: '403993715531077182' };
    delete f.hash;
    f.hash = payuResponseHash(CRED.payu.keyId, CRED.payu.keySecret, f);
    orders.set(co.orderId, { provider: 'payu', amountPaise: FEE, paid: true, paymentId: f.mihpayid });
    await http().post(`/v1/fees/webhooks/payu/${t.slug}`).type('form').send(form({ ...f, amount: '1.00' })).expect(401);
    // The payer's browser comes back through the return page: checked like the webhook.
    const page = await http().post(`/v1/fees/gateway-return/payu/${t.slug}`).type('form').send(form(f)).expect(200);
    expect(page.text).toContain('Thank you');
    expect((await http().post(`/v1/fees/webhooks/payu/${t.slug}`).type('form').send(form(f)).expect(200)).body.outcome).toBe('duplicate');
    expect((await payment(co.paymentId)).status).toBe('paid');
    await pollRefundSettle('payu', 'PayU fee 2');
  });

  it('Cashfree: SDK session, x-webhook-signature, order payments polling, refund and settlement recon', async () => {
    await save({ provider: 'cashfree', mode: 'test', ...CRED.cashfree }).expect(200);
    expect((await http().post('/v1/admin/payments/gateways/default/test').set(as('principal')).expect(200)).body).toMatchObject({ ok: true, provider: 'cashfree' });
    const inv = await feeA('Cashfree fee');
    const co = await checkout(inv);
    expect(co).toMatchObject({ provider: 'cashfree', session: { environment: 'sandbox' } });
    expect(co.session.id).toMatch(/^session_/);
    const o = orders.get(co.orderId)!;
    const body = JSON.stringify({ data: { order: { order_id: co.orderId, order_amount: 15000, order_currency: 'INR' }, payment: { cf_payment_id: Number(o.paymentId), payment_status: 'SUCCESS', payment_amount: 15000, payment_currency: 'INR' } }, event_time: '2026-10-20T10:05:00+05:30', type: 'PAYMENT_SUCCESS_WEBHOOK' });
    const ts = '1792473300000';
    const hook = (sig: string) => http().post(`/v1/fees/webhooks/cashfree/${t.slug}`).set('content-type', 'application/json').set('x-webhook-timestamp', ts).set('x-webhook-signature', sig).send(body);
    await hook(cashfreeSignature('wrong-secret', ts, body)).expect(401);
    expect((await hook(cashfreeSignature(CRED.cashfree.keySecret, ts, body)).expect(200)).body.outcome).toBe('credited');
    expect((await hook(cashfreeSignature(CRED.cashfree.keySecret, ts, body)).expect(200)).body.outcome).toBe('duplicate');
    expect((await payment(co.paymentId)).status).toBe('paid');
    const co2 = await pollRefundSettle('cashfree', 'Cashfree fee 2');
    // Cashfree refunds name the order and our own refund id.
    expect(JSON.parse(refunds.at(-1)!.body)).toMatchObject({ refund_amount: 500 });
    expect(refunds.at(-1)!.body).toContain('rf_');
    expect(co2.provider).toBe('cashfree');
  });

  it('Easebuzz: initiateLink hosted page, reverse-hash webhook, Transaction API polling, refund and settlement', async () => {
    await save({ provider: 'easebuzz', mode: 'test', ...CRED.easebuzz }).expect(200);
    expect((await http().post('/v1/admin/payments/gateways/default/test').set(as('principal')).expect(200)).body).toMatchObject({ ok: true, provider: 'easebuzz' });
    const inv = await feeA('Easebuzz fee');
    const co = await checkout(inv);
    expect(co.hosted).toMatchObject({ method: 'GET' });
    expect(co.hosted.url).toMatch(new RegExp(`^${base}/easebuzz/pay/pay/ebzaccess\\d+$`));
    const o = orders.get(co.orderId)!;
    const f: Record<string, string> = { ...o.fields!, status: 'success', easepayid: o.paymentId };
    delete f.hash;
    f.hash = easebuzzResponseHash(CRED.easebuzz.keyId, CRED.easebuzz.keySecret, f);
    await http().post(`/v1/fees/webhooks/easebuzz/${t.slug}`).type('form').send(form({ ...f, hash: 'b'.repeat(128) })).expect(401);
    expect((await http().post(`/v1/fees/webhooks/easebuzz/${t.slug}`).type('form').send(form(f)).expect(200)).body.outcome).toBe('credited');
    expect((await http().post(`/v1/fees/webhooks/easebuzz/${t.slug}`).type('form').send(form(f)).expect(200)).body.outcome).toBe('duplicate');
    await pollRefundSettle('easebuzz', 'Easebuzz fee 2');
  });

  it('CCAvenue: encRequest checkout, encResp webhook, orderStatusTracker polling, refundOrder and payouts', async () => {
    await save({ provider: 'ccavenue', mode: 'test', ...CRED.ccavenue }).expect(200);
    expect((await http().post('/v1/admin/payments/gateways/default/test').set(as('principal')).expect(200)).body).toMatchObject({ ok: true, provider: 'ccavenue' });
    const inv = await feeA('CCAvenue fee');
    const co = await checkout(inv);
    expect(co.hosted).toMatchObject({ url: `${base}/ccavenue/secure/transaction/transaction.do?command=initiateTransaction`, method: 'POST', fields: { access_code: CRED.ccavenue.accessCode } });
    const sent = fields(ccDecrypt(CRED.ccavenue.keySecret, co.hosted.fields.encRequest));
    expect(sent).toMatchObject({ merchant_id: CRED.ccavenue.keyId, order_id: co.orderId, amount: '15000.00', currency: 'INR' });
    orders.set(co.orderId, { provider: 'ccavenue', amountPaise: FEE, paid: false, paymentId: '112233445566' });
    const enc = (s2: string) => ccEncrypt(CRED.ccavenue.keySecret, `order_id=${co.orderId}&tracking_id=112233445566&bank_ref_no=BR1&order_status=${s2}&amount=15000.00&currency=INR`);
    await http().post(`/v1/fees/webhooks/ccavenue/${t.slug}`).type('form').send(form({ encResp: ccEncrypt('0'.repeat(32), 'order_id=x') })).expect(401);
    expect((await http().post(`/v1/fees/webhooks/ccavenue/${t.slug}`).type('form').send(form({ encResp: enc('Success') })).expect(200)).body.outcome).toBe('credited');
    expect((await http().post(`/v1/fees/webhooks/ccavenue/${t.slug}`).type('form').send(form({ encResp: enc('Success') })).expect(200)).body.outcome).toBe('duplicate');
    orders.get(co.orderId)!.paid = true;
    await pollRefundSettle('ccavenue', 'CCAvenue fee 2');
    expect(JSON.parse(refunds.at(-1)!.body)).toMatchObject({ reference_no: expect.any(String), refund_amount: '500.00' });
  });

  it('a fee account collects through its own gateway; others stay on the default', async () => {
    const [trust] = await db.insert(feeAccounts).values({ tenantId: t.tenantId, code: 'SET', name: 'Soundarya Educational Trust', receiptPrefix: 'SET/{FY}/' }).returning();
    // The default is CCAvenue now; the trust takes Razorpay.
    expect((await save({ provider: 'razorpay', feeAccountId: trust.id, ...CRED.razorpay }).expect(200)).body).toMatchObject({ feeAccountId: trust.id, provider: 'razorpay' });
    const list = (await http().get('/v1/admin/payments/gateways').set(as('principal')).expect(200)).body.accounts as { provider: string; feeAccountId: string | null }[];
    expect(list.map((a) => [a.provider, a.feeAccountId])).toEqual([['ccavenue', null], ['razorpay', trust.id]]);
    const inv = await feeA('Trust development fee');
    await db.update(s.feeInvoices).set({ feeAccountId: trust.id }).where(eq(s.feeInvoices.id, inv));
    const co = await checkout(inv);
    expect(co.provider).toBe('razorpay');
    const o = orders.get(co.orderId)!;
    o.paid = true;
    const done = (await http().post(`/v1/fees/payments/${co.paymentId}/refresh`).set(as('parent')).expect(200)).body;
    // Numbered in the trust's own series.
    expect(done.receipt.receiptNo).toBe('SET/2026-27/00001');
    const other2 = await feeA('College fee');
    expect((await checkout(other2)).provider).toBe('ccavenue');
  });

  it('asks the gateway every hour about payments still pending and gives up on very old ones', async () => {
    const inv = await feeA('Polled fee');
    const co = await checkout(inv);
    // Not yet past the wait (15 minutes): left alone.
    const flow = app.get(GatewayFlow);
    expect(await flow.pollPending(t.tenantId)).toMatchObject({ checked: 0 });
    await db.update(s.feePayments).set({ createdAt: new Date(Date.now() - 20 * 60_000) }).where(eq(s.feePayments.id, co.paymentId));
    payAtGateway(co.orderId, co.provider);
    expect(await flow.pollPending(t.tenantId)).toMatchObject({ checked: 1, paid: 1 });
    expect((await payment(co.paymentId)).status).toBe('paid');
    const stale = await checkout(await feeA('Abandoned fee'));
    await db.update(s.feePayments).set({ createdAt: new Date(Date.now() - 80 * 3600_000) }).where(eq(s.feePayments.id, stale.paymentId));
    expect(await flow.pollPending(t.tenantId)).toMatchObject({ gaveUp: 1 });
    expect((await payment(stale.paymentId)).status).toBe('cancelled');
  });

  it('opens any checkout in a browser from a short-lived launch link, and takes the gateway back through the return page', async () => {
    // The default is CCAvenue (a hosted POST): the launch page auto-submits the encrypted request.
    const co = await checkout(await feeA('Launched fee'));
    expect(String(co.launchUrl).startsWith(`https://api.zynetix.test/v1/public/checkout/${t.slug}/${co.paymentId}?t=`)).toBe(true);
    const pageOk = await http().get(co.launchPath).expect(200);
    expect(pageOk.headers['content-type']).toContain('text/html');
    expect(pageOk.text).toContain('name="encRequest"');
    expect(pageOk.text).toContain('₹15,000.00');
    const [path, q] = String(co.launchPath).split('?t=');
    expect((await http().get(`${path}?t=${q.slice(0, -2)}xx`).expect(200)).text).toContain('expired');
    expect((await http().get(`/v1/public/checkout/${other.slug}/${co.paymentId}?t=${q}`).expect(200)).text).toContain('expired');
    // Razorpay's web checkout posts back its signature: checked with the trust's key secret.
    const [trust] = await db.select().from(feeAccounts).where(eq(feeAccounts.code, 'SET'));
    const inv = await feeA('Trust building fund');
    await db.update(s.feeInvoices).set({ feeAccountId: trust.id }).where(eq(s.feeInvoices.id, inv));
    const rz = await checkout(inv);
    expect((await http().get(rz.launchPath).expect(200)).text).toContain('checkout.razorpay.com');
    const sig = (pay: string) => createHmac('sha256', CRED.razorpay.keySecret).update(`${rz.orderId}|${pay}`).digest('hex');
    expect((await http().post(`/v1/fees/gateway-return/razorpay/${t.slug}`).type('form').send(form({ razorpay_order_id: rz.orderId, razorpay_payment_id: 'pay_WEB0001', razorpay_signature: 'f'.repeat(64) })).expect(200)).text).toContain('not completed');
    expect((await http().post(`/v1/fees/gateway-return/razorpay/${t.slug}`).type('form').send(form({ razorpay_order_id: rz.orderId, razorpay_payment_id: 'pay_WEB0001', razorpay_signature: sig('pay_WEB0001') })).expect(200)).text).toContain('Thank you');
    expect((await payment(rz.paymentId)).status).toBe('paid');
    // The family downloads the receipt as a PDF; another family cannot.
    const pdf = await http().get(`/v1/fee-collect/family/payments/${rz.paymentId}/receipt.pdf`).set(as('parent')).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    await http().get(`/v1/fee-collect/family/payments/${rz.paymentId}/receipt.pdf`).set(as('parent2')).expect(404);
  });

  it('the sandbox answers prove the requests: wrong credentials fail the connection test', async () => {
    await save({ provider: 'cashfree', mode: 'test', keyId: CRED.cashfree.keyId, keySecret: 'cfsk_ma_test_WRONG_0001' }).expect(200);
    expect((await http().post('/v1/admin/payments/gateways/default/test').set(as('principal')).expect(200)).body).toMatchObject({ ok: false, error: 'AUTHENTICATION_FAILED' });
    expect(createHash('md5').update(CRED.ccavenue.keySecret).digest().length).toBe(16);
  });
});
