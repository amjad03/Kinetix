import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DemoPaymentProvider, PaymentProvider } from '../src/fees/payment-provider.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('fees and payments', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const dueOn = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  const fy = (() => {
    const d = new Date(Date.now() + 5.5 * 3600_000);
    const start = d.getUTCMonth() + 1 >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  })();
  const fees = async (who: string, studentId: string) => (await http().get(`/v1/fees/students/${studentId}`).set(auth(who)).expect(200)).body;
  const webhook = (body: object, secret = DemoPaymentProvider.SECRET) => {
    const raw = JSON.stringify(body);
    return http()
      .post('/v1/fees/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', createHmac('sha256', secret).update(raw).digest('hex'))
      .send(raw);
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()), (b) => b.overrideProvider(PaymentProvider).useValue(new DemoPaymentProvider()));
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      parent: await login(t.slug, t.guardian.email!),
      parent2: await login(t.slug, t.guardian2.email!),
      student: await login(t.slug, t.studentUser.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    await http().post('/v1/fees/invoices').set(auth('principal')).send({ sectionId: t.section.id, title: 'Semester 3 tuition', amountPaise: 45_000_00, dueOn }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('issues a fee to every student of the class and tells their families', async () => {
    const inbox = await http().get('/v1/notifications').set(auth('parent')).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ kind: 'fee', title: 'Fee due: Semester 3 tuition' });
    expect(inbox.body.items[0].body).toContain('₹45,000 due by');
    const mine = await fees('parent', t.students[0].id);
    expect(mine).toMatchObject({ duePaise: 45_000_00, onlinePayments: 'demo', payments: [] });
    expect(mine.invoices).toHaveLength(1);

    await http().get(`/v1/fees/students/${t.students[1].id}`).set(auth('parent')).expect(404);
    await http().get(`/v1/fees/students/${t.students[0].id}`).set(auth('outsider')).expect(404);
    await http().post('/v1/fees/invoices').set(auth('teacher')).send({ sectionId: t.section.id, title: 'x', amountPaise: 100, dueOn }).expect(403);
    const list = await http().get(`/v1/fees/invoices?sectionId=${t.section.id}`).set(auth('principal')).expect(200);
    expect(list.body).toHaveLength(3);
  });

  it('takes an online payment, verified by the gateway signature, with a numbered receipt', async () => {
    const invoiceId = (await fees('parent', t.students[0].id)).invoices[0].id;
    const order = await http().post(`/v1/fees/invoices/${invoiceId}/checkout`).set(auth('parent')).send({}).expect(201);
    expect(order.body).toMatchObject({ provider: 'demo', amountPaise: 45_000_00, currency: 'INR', description: 'Semester 3 tuition', prefill: { email: t.guardian.email } });

    const confirm = (signature: string) =>
      http().post(`/v1/fees/payments/${order.body.paymentId}/confirm`).set(auth('parent')).send({ providerPaymentId: 'pay_demo_1', signature });
    await confirm('forged').expect(403);
    const receipt = await confirm(DemoPaymentProvider.sign(order.body.orderId, 'pay_demo_1')).expect(200);
    expect(receipt.body).toMatchObject({ receiptNo: `RCPT/${fy}/00001`, amountPaise: 45_000_00, method: 'online', reference: 'pay_demo_1', student: { fullName: 'Student A' }, className: 'BCom Sem 3 A', invoice: { balancePaise: 0 } });

    // Confirming twice, or the webhook arriving too, never credits twice.
    await confirm(DemoPaymentProvider.sign(order.body.orderId, 'pay_demo_1')).expect(200);
    await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_demo_1', order_id: order.body.orderId, amount: 45_000_00, status: 'captured' } } } }).expect(200);
    const after = await fees('parent', t.students[0].id);
    expect(after).toMatchObject({ duePaise: 0, invoices: [{ status: 'paid', paidPaise: 45_000_00 }] });
    expect(after.payments).toHaveLength(1);
    await http().post(`/v1/fees/invoices/${invoiceId}/checkout`).set(auth('parent')).send({}).expect(400); // already paid

    const inbox = await http().get('/v1/notifications').set(auth('parent')).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ kind: 'fee', title: 'Payment received: ₹45,000', body: `Semester 3 tuition for Student A. Receipt RCPT/${fy}/00001.` });
    await http().get(`/v1/fees/payments/${order.body.paymentId}/receipt`).set(auth('parent2')).expect(404);
  });

  it('credits a part payment from the webhook when the app never confirmed', async () => {
    const invoiceId = (await fees('parent2', t.students[1].id)).invoices[0].id;
    const order = await http().post(`/v1/fees/invoices/${invoiceId}/checkout`).set(auth('parent2')).send({ amountPaise: 20_000_00 }).expect(201);
    const event = (amount: number) => ({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_demo_2', order_id: order.body.orderId, amount, status: 'captured' } } } });

    await webhook(event(20_000_00), 'wrong-secret').expect(401);
    await webhook(event(1_00)).expect(200); // amount mismatch: ignored
    expect((await fees('parent2', t.students[1].id)).duePaise).toBe(45_000_00);
    await webhook(event(20_000_00)).expect(200);
    const after = await fees('parent2', t.students[1].id);
    expect(after).toMatchObject({ duePaise: 25_000_00, invoices: [{ status: 'due', paidPaise: 20_000_00 }] });
    expect(after.payments[0]).toMatchObject({ receiptNo: `RCPT/${fy}/00002`, title: 'Semester 3 tuition', reference: 'pay_demo_2' });
    expect(after.invoices[0].batchId).toEqual(expect.any(String));
    // A later payment does not change what the earlier receipt says was left.
    const rest = await http().post(`/v1/fees/invoices/${invoiceId}/payments`).set(auth('principal')).send({ amountPaise: 25_000_00, method: 'cash' }).expect(201);
    expect(rest.body.invoice.balancePaise).toBe(0);
    const first = await http().get(`/v1/fees/payments/${order.body.paymentId}/receipt`).set(auth('parent2')).expect(200);
    expect(first.body.invoice.balancePaise).toBe(25_000_00);
    await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'x', order_id: 'order_from_elsewhere', amount: 1, status: 'captured' } } } }).expect(200);
  });

  it('records counter payments, refuses overpayment, and sums up for the accounts office', async () => {
    const studentC = t.students[2].id;
    const invoiceId = (await fees('principal', studentC)).invoices[0].id;
    await http().post(`/v1/fees/invoices/${invoiceId}/payments`).set(auth('principal')).send({ amountPaise: 50_000_00, method: 'cash' }).expect(400);
    const receipt = await http().post(`/v1/fees/invoices/${invoiceId}/payments`).set(auth('principal')).send({ amountPaise: 45_000_00, method: 'cheque', reference: 'CHQ 004512' }).expect(201);
    expect(receipt.body).toMatchObject({ paymentId: expect.any(String), receiptNo: `RCPT/${fy}/00004`, method: 'cheque', reference: 'CHQ 004512' });
    // The student sees their own fees and receipt.
    expect((await fees('student', studentC)).duePaise).toBe(0);
    await http().post(`/v1/fees/invoices/${invoiceId}/cancel`).set(auth('principal')).expect(400);

    const summary = await http().get('/v1/fees/summary').set(auth('principal')).expect(200);
    expect(summary.body).toMatchObject({ billedPaise: 135_000_00, collectedPaise: 135_000_00, outstandingPaise: 0, openInvoices: 0, overdueInvoices: 0, overduePaise: 0 });
    expect((await http().get('/v1/fees/summary').set(auth('outsider')).expect(200)).body.billedPaise).toBe(0);
  });

  it('cancels an unpaid fee', async () => {
    const batch = await http().post('/v1/fees/invoices').set(auth('principal')).send({ sectionId: t.section.id, title: 'Library fine', amountPaise: 50_00, dueOn }).expect(201);
    expect(batch.body.invoices).toBe(3);
    const fine = (await fees('parent', t.students[0].id)).invoices.find((i: { title: string }) => i.title === 'Library fine');
    await http().post(`/v1/fees/invoices/${fine.id}/cancel`).set(auth('principal')).expect(200);
    expect((await fees('parent', t.students[0].id)).invoices.map((i: { title: string }) => i.title)).not.toContain('Library fine');
  });
});
