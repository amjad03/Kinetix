import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from '../src/common/secret-box.js';
import { ENV, loadEnv } from '../src/config/env.js';
import { rotateSecrets } from '../src/db/rotate-secrets.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, env, FixedClock, ownerPool } from './helpers.js';

const hmacHex = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');

// Each institution receives fees in its own Razorpay account. RAZORPAY_FAKE keeps Razorpay's API
// off the network; signatures are checked with each institution's own secrets.
describe('per-institution Razorpay accounts', () => {
  const owner = ownerPool();
  const ownerDb = drizzle(owner, { schema: s });
  let app: INestApplication;
  let a: Awaited<ReturnType<typeof createTenant>>;
  let b: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const dueOn = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  const A = { keyId: 'rzp_live_AAAAaaaa1111', keySecret: 'a-key-secret-9wXz', webhookSecret: 'a-webhook-secret-Q7' };
  const B = { keyId: 'rzp_test_BBBBbbbb2222', keySecret: 'b-key-secret-4kLm', webhookSecret: 'b-webhook-secret-R8' };
  const webhook = (path: string, body: object, secret: string) => {
    const raw = JSON.stringify(body);
    return http().post(path).set('content-type', 'application/json').set('x-razorpay-signature', hmacHex(secret, raw)).send(raw);
  };
  const captured = (orderId: string, amount: number, id = 'pay_a_1') => ({ event: 'payment.captured', payload: { payment: { entity: { id, order_id: orderId, amount, status: 'captured' } } } });
  const invoiceOf = async (who: string, studentId: string) => (await http().get(`/v1/fees/students/${studentId}`).set(auth(who)).expect(200)).body;

  beforeAll(async () => {
    a = await createTenant(owner);
    b = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()), (m) => m.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_FAKE: 'true' })));
    tokens = {
      principalA: await login(a.slug, a.principal.email!),
      teacherA: await login(a.slug, a.teacher.email!),
      parentA: await login(a.slug, a.guardian.email!),
      principalB: await login(b.slug, b.principal.email!),
      parentB: await login(b.slug, b.guardian.email!),
    };
    for (const [who, t] of [['principalA', a], ['principalB', b]] as const) {
      await http().post('/v1/fees/invoices').set(auth(who)).send({ sectionId: t.section.id, title: 'Semester 3 tuition', amountPaise: 30_000_00, dueOn }).expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('without keys there is no online payment (PAYMENTS_NOT_CONFIGURED); the counter still works', async () => {
    const view = await http().get('/v1/admin/payments/razorpay').set(auth('principalA')).expect(200);
    expect(view.body).toEqual({ provider: 'razorpay', gateway: null, payuWebhookPath: `/v1/fees/webhooks/payu/${a.slug}`, configured: false, keyId: null, mode: null, keySecretLast4: null, updatedAt: null, webhookPath: `/v1/fees/webhooks/razorpay/${a.slug}` });
    const fees = await invoiceOf('parentA', a.students[0].id);
    expect(fees.onlinePayments).toBeNull();
    const res = await http().post(`/v1/fees/invoices/${fees.invoices[0].id}/checkout`).set(auth('parentA')).send({}).expect(503);
    expect(res.body.code).toBe('PAYMENTS_NOT_CONFIGURED');
    expect((await http().post('/v1/admin/payments/razorpay/test').set(auth('principalA')).expect(200)).body).toEqual({ ok: false, error: 'PAYMENTS_NOT_CONFIGURED' });
    // Cash at the counter needs no gateway.
    const counter = await invoiceOf('principalA', a.students[2].id);
    await http().post(`/v1/fees/invoices/${counter.invoices[0].id}/payments`).set(auth('principalA')).send({ amountPaise: 30_000_00, method: 'upi', reference: 'UPI 1234' }).expect(201);
  });

  it('the principal saves the keys; secrets are encrypted, never echoed, and not in the audit log', async () => {
    await http().put('/v1/admin/payments/razorpay').set(auth('teacherA')).send(A).expect(403);
    const missing = await http().put('/v1/admin/payments/razorpay').set(auth('principalA')).send({ keyId: A.keyId, keySecret: A.keySecret }).expect(400);
    expect(missing.body.code).toBe('PAYMENTS_KEYS_REQUIRED');
    const bad = await http().put('/v1/admin/payments/razorpay').set(auth('principalA')).send({ ...A, keyId: 'pk_live_123' }).expect(400);
    expect(bad.body.code).toBe('PAYMENTS_BAD_KEY_ID');

    const saved = await http().put('/v1/admin/payments/razorpay').set(auth('principalA')).send(A).expect(200);
    expect(saved.body).toMatchObject({ provider: 'razorpay', configured: true, keyId: A.keyId, mode: 'live', keySecretLast4: '9wXz', updatedAt: expect.any(String) });
    const text = JSON.stringify(saved.body) + JSON.stringify((await http().get('/v1/admin/payments/razorpay').set(auth('principalA')).expect(200)).body);
    expect(text).not.toContain(A.keySecret);
    expect(text).not.toContain(A.webhookSecret);
    await http().put('/v1/admin/payments/razorpay').set(auth('principalB')).send(B).expect(200);

    const [row] = await ownerDb.select().from(s.paymentGatewayAccounts).where(eq(s.paymentGatewayAccounts.tenantId, a.tenantId));
    expect(row.keySecretEnc).toMatch(/^v1\./);
    expect(row.keySecretEnc + row.webhookSecretEnc).not.toContain('secret');
    const audit = await ownerDb.select().from(s.auditLog).where(eq(s.auditLog.tenantId, a.tenantId));
    const entry = audit.find((e) => e.action === 'payments.razorpay_updated');
    expect(entry?.data).toMatchObject({ keyId: A.keyId, mode: 'live', created: true, keySecretChanged: true, webhookSecretChanged: true });
    expect(JSON.stringify(audit)).not.toContain(A.keySecret);
    expect(JSON.stringify(audit)).not.toContain(A.webhookSecret);

    // A new key id needs its secret; leaving secrets out otherwise keeps them.
    const needs = await http().put('/v1/admin/payments/razorpay').set(auth('principalA')).send({ keyId: 'rzp_live_CCCCcccc3333' }).expect(400);
    expect(needs.body.code).toBe('PAYMENTS_KEY_SECRET_REQUIRED');
    await http().put('/v1/admin/payments/razorpay').set(auth('principalA')).send({ keyId: A.keyId }).expect(200);
  });

  it('tests the connection with the institution\'s own keys', async () => {
    expect((await http().post('/v1/admin/payments/razorpay/test').set(auth('principalA')).expect(200)).body).toEqual({ ok: true, keyId: A.keyId, mode: 'live' });
    await http().put('/v1/admin/payments/razorpay').set(auth('principalB')).send({ keyId: B.keyId, keySecret: 'wrong-secret-xyz' }).expect(200);
    expect((await http().post('/v1/admin/payments/razorpay/test').set(auth('principalB')).expect(200)).body).toMatchObject({ ok: false, error: 'AUTHENTICATION_FAILED' });
    await http().put('/v1/admin/payments/razorpay').set(auth('principalB')).send({ keyId: B.keyId, keySecret: B.keySecret }).expect(200);
  });

  it('checkout uses the institution\'s key id; payment and webhook are verified with its own secrets', async () => {
    const feesA = await invoiceOf('parentA', a.students[0].id);
    expect(feesA.onlinePayments).toBe('razorpay');
    const order = await http().post(`/v1/fees/invoices/${feesA.invoices[0].id}/checkout`).set(auth('parentA')).send({ amountPaise: 10_000_00 }).expect(201);
    expect(order.body).toMatchObject({ provider: 'razorpay', keyId: A.keyId, amountPaise: 10_000_00, orderId: expect.stringMatching(/^order_fake/) });
    const feesB = await invoiceOf('parentB', b.students[0].id);
    const orderB = await http().post(`/v1/fees/invoices/${feesB.invoices[0].id}/checkout`).set(auth('parentB')).send({}).expect(201);
    expect(orderB.body.keyId).toBe(B.keyId);

    // The checkout signature: A's key secret, not B's.
    const confirm = (sig: string) => http().post(`/v1/fees/payments/${order.body.paymentId}/confirm`).set(auth('parentA')).send({ providerPaymentId: 'pay_a_1', signature: sig });
    await confirm(hmacHex(B.keySecret, `${order.body.orderId}|pay_a_1`)).expect(403);
    await confirm(hmacHex(A.keySecret, `${order.body.orderId}|pay_a_1`)).expect(200);

    // Webhooks: per-institution URL, signed with that institution's webhook secret.
    const event = captured(orderB.body.orderId, 30_000_00, 'pay_b_1');
    await webhook(`/v1/fees/webhooks/razorpay/${b.slug}`, event, A.webhookSecret).expect(401);
    await webhook(`/v1/fees/webhooks/razorpay/${a.slug}`, event, A.webhookSecret).expect(200); // B's order is not A's: ignored
    expect((await invoiceOf('parentB', b.students[0].id)).duePaise).toBe(30_000_00);
    await webhook('/v1/fees/webhooks/razorpay/no-such-college', event, B.webhookSecret).expect(404);
    await webhook(`/v1/fees/webhooks/razorpay/${b.slug}`, event, B.webhookSecret).expect(200);
    expect((await invoiceOf('parentB', b.students[0].id)).duePaise).toBe(0);
    await webhook(`/v1/fees/webhooks/razorpay/${b.slug}`, event, B.webhookSecret).expect(200); // again: credited once
    expect((await invoiceOf('parentB', b.students[0].id)).payments).toHaveLength(1);

    // The old platform URL: the order names the institution, whose secret must have signed it.
    const order2 = await http().post(`/v1/fees/invoices/${feesA.invoices[0].id}/checkout`).set(auth('parentA')).send({ amountPaise: 5_000_00 }).expect(201);
    await webhook('/v1/fees/webhooks/razorpay', captured(order2.body.orderId, 5_000_00, 'pay_a_2'), B.webhookSecret).expect(401);
    await webhook('/v1/fees/webhooks/razorpay', captured(order2.body.orderId, 5_000_00, 'pay_a_2'), A.webhookSecret).expect(200);
    expect((await invoiceOf('parentA', a.students[0].id)).duePaise).toBe(15_000_00);
  });

  it('row-level security keeps each institution\'s account to itself', async () => {
    const appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 1 });
    const appDb = drizzle(appPool, { schema: s });
    try {
      const seen = await appDb.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${a.tenantId}, true)`);
        return tx.select({ tenantId: s.paymentGatewayAccounts.tenantId }).from(s.paymentGatewayAccounts);
      });
      expect(seen).toEqual([{ tenantId: a.tenantId }]);
      expect(await appDb.select().from(s.paymentGatewayAccounts)).toEqual([]);
      await expect(
        appDb.transaction(async (tx) => {
          await tx.execute(sql`select set_config('app.tenant_id', ${a.tenantId}, true)`);
          await tx.update(s.paymentGatewayAccounts).set({ keyId: 'rzp_live_hijack' }).where(eq(s.paymentGatewayAccounts.tenantId, b.tenantId));
          const [row] = await tx.select().from(s.paymentGatewayAccounts).where(eq(s.paymentGatewayAccounts.tenantId, b.tenantId));
          return row;
        }),
      ).resolves.toBeUndefined();
    } finally {
      await appPool.end();
    }
    const [bRow] = await ownerDb.select().from(s.paymentGatewayAccounts).where(eq(s.paymentGatewayAccounts.tenantId, b.tenantId));
    expect(bRow.keyId).toBe(B.keyId);
  });

  it('re-encrypts stored secrets when the master key is rotated', async () => {
    const oldKey = env.SECRETS_ENCRYPTION_KEY;
    const newKey = Buffer.alloc(32, 9).toString('base64');
    const box = SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: newKey, SECRETS_ENCRYPTION_KEY_VERSION: 2, SECRETS_ENCRYPTION_OLD_KEYS: `1:${oldKey}` })!;
    const before = await ownerDb.select().from(s.paymentGatewayAccounts);
    const r = await rotateSecrets(ownerDb, box);
    expect(r.rotated).toBe(before.length);
    expect((await rotateSecrets(ownerDb, box)).rotated).toBe(0);
    const [row] = await ownerDb.select().from(s.paymentGatewayAccounts).where(eq(s.paymentGatewayAccounts.tenantId, a.tenantId));
    expect(row.keySecretEnc).toMatch(/^v2\./);
    const newOnly = SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: newKey, SECRETS_ENCRYPTION_KEY_VERSION: 2 })!;
    expect(newOnly.decrypt(row.keySecretEnc, `${a.tenantId}:razorpay.key_secret`)).toBe(A.keySecret);
    // Rotate back so the running app (key version 1) still reads them.
    const back = SecretBox.fromEnv({ SECRETS_ENCRYPTION_KEY: oldKey, SECRETS_ENCRYPTION_OLD_KEYS: `2:${newKey}` })!;
    await rotateSecrets(ownerDb, back);
    expect((await http().post('/v1/admin/payments/razorpay/test').set(auth('principalA')).expect(200)).body.ok).toBe(true);
  });

  it('removing the account stops online payments', async () => {
    const view = await http().delete('/v1/admin/payments/razorpay').set(auth('principalA')).expect(200);
    expect(view.body.configured).toBe(false);
    expect((await invoiceOf('parentA', a.students[0].id)).onlinePayments).toBeNull();
  });
});
