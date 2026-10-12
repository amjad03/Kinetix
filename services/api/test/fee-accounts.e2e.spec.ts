import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('fees and accounts desk', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T06:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tok: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const R = (rupees: number) => rupees * 100;
  const invoice = async (studentId: string, amount: number, dueOn = '2026-09-30') => (await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Term 2 tuition', amountPaise: R(amount), dueOn, createdBy: t.principal.id }).returning())[0];
  const pay = async (invoiceId: string, amount: number, method: string, who = 'acc') => {
    const res = await post(who, `/v1/fees/invoices/${invoiceId}/payments`, { amountPaise: R(amount), method, reference: 'CHQ 104455' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { ...res.body, id: res.body.paymentId ?? res.body.id };
  };
  const inv = async (id: string) => (await owner.query('select amount_paise::int as amount, paid_paise::int as paid, status from fee_invoices where id = $1', [id])).rows[0];

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Rekha Accounts', email: 'rekha@fa.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role: 'accountant' });
    const [u2] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Arun Accounts', email: 'arun@fa.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u2.id, role: 'accountant' });
    app = await createApp(clock);
    tok.acc = await login(t.slug, 'rekha@fa.in');
    tok.acc2 = await login(t.slug, 'arun@fa.in');
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.parent = await login(t.slug, t.guardian.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
    ids.acc = u.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('only the accounts office sees the desk, and settings start with sensible defaults', async () => {
    await get('teacher', '/v1/fee-accounts/settings').expect(403);
    await get('parent', '/v1/fee-accounts/inbox').expect(403);
    const st = (await get('acc', '/v1/fee-accounts/settings').expect(200)).body;
    expect(st.series.receipt).toMatchObject({ prefix: 'RCPT/{FY}/', pad: 5 });
    expect(st.feeHeads.length).toBeGreaterThan(3);
    await http().put('/v1/fee-accounts/settings').set(as('acc')).send({ series: { receipt: { prefix: 'SIC/{FY}/', next: 1, pad: 4 } } }).expect(200);
    await http().put('/v1/fee-accounts/settings').set(as('acc')).send({ series: { refund: { prefix: 'R', next: 0, pad: 4 } } }).expect(400);
  });

  it('receipts take the configured series', async () => {
    const i = await invoice(t.students[0].id, 1000);
    const p = await pay(i.id, 400, 'cash');
    expect(p.receiptNo).toBe('SIC/2026-27/0001');
    ids.cashInvoice = i.id;
  });

  it('a fee structure goes draft → approval → publish; the requester cannot approve it', async () => {
    const fs = (await post('acc', '/v1/fee-accounts/structures', { name: 'BCom 2027-28', academicYear: '2027-28', items: [{ head: 'Tuition', amountPaise: R(38000) }, { head: 'Examination', amountPaise: R(3500) }] }).expect(201)).body;
    expect(fs.status).toBe('draft');
    await post('acc', `/v1/fee-accounts/structures/${fs.id}/publish`).expect(409);
    await post('acc', `/v1/fee-accounts/structures/${fs.id}/submit`).expect(201);
    await post('acc', `/v1/fee-accounts/structures/${fs.id}/decide`, { decision: 'approve' }).expect(403);
    await post('principal', `/v1/fee-accounts/structures/${fs.id}/decide`, { decision: 'reject' }).expect(400);
    await post('principal', `/v1/fee-accounts/structures/${fs.id}/decide`, { decision: 'approve', comment: 'ok' }).expect(201);
    const pub = (await post('acc', `/v1/fee-accounts/structures/${fs.id}/publish`).expect(201)).body;
    expect(pub).toMatchObject({ status: 'published', active: true });
    const rec = (await get('acc', `/v1/fee-accounts/records/structures/${fs.id}`).expect(200)).body;
    expect(rec.history.map((h: { action: string }) => h.action)).toEqual(['fee_structure.published', 'fee_structure.approved', 'fee_structure.submitted', 'fee_structure.created']);
  });

  it('an approved concession reduces the invoice and the family is told', async () => {
    const i = await invoice(t.students[0].id, 20000);
    const c = (await post('acc', '/v1/fee-accounts/concessions', { studentId: t.students[0].id, invoiceId: i.id, kind: 'sibling', percent: 10, reason: 'Second child here' }).expect(201)).body;
    expect(c).toMatchObject({ number: 'CON/2026-27/0001', amountPaise: R(2000), status: 'pending' });
    const inbox = (await get('principal', '/v1/fee-accounts/inbox').expect(200)).body;
    expect(inbox.counts.concessions).toBe(1);
    await post('acc', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve' }).expect(403);
    await post('principal', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve' }).expect(201);
    expect(await inv(i.id)).toMatchObject({ amount: R(18000), status: 'due' });
    const notes = (await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and dedupe_key = $2", [t.tenantId, `concession:${c.id}`])).rows[0].n;
    expect(notes).toBeGreaterThan(0);
    await post('principal', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve' }).expect(409);
  });

  it('a bounced cheque reopens the invoice, reverses the books and raises a charge', async () => {
    const i = await invoice(t.students[1].id, 5000);
    const p = await pay(i.id, 5000, 'cheque');
    expect((await inv(i.id)).status).toBe('paid');
    const chq = (await post('acc', '/v1/fee-accounts/cheques', { paymentId: p.id, chequeNo: '104455', bankName: 'Canara Bank', chequeDate: '2026-10-19' }).expect(201)).body;
    await post('acc', `/v1/fee-accounts/cheques/${chq.id}/clear`, { on: '2026-10-20' }).expect(409);
    await post('acc', `/v1/fee-accounts/cheques/${chq.id}/deposit`, { on: '2026-10-20' }).expect(201);
    await post('acc', `/v1/fee-accounts/cheques/${chq.id}/bounce`, { on: '2026-10-20' }).expect(400);
    const b = (await post('acc', `/v1/fee-accounts/cheques/${chq.id}/bounce`, { on: '2026-10-20', reason: 'Funds insufficient', chargePaise: R(500) }).expect(201)).body;
    expect(b.status).toBe('bounced');
    expect(await inv(i.id)).toMatchObject({ paid: 0, status: 'due' });
    expect((await owner.query("select count(*)::int as n from acct_vouchers where tenant_id = $1 and source_type = 'cheque_bounce'", [t.tenantId])).rows[0].n).toBe(1);
    expect((await inv(b.chargeInvoiceId)).amount).toBe(R(500));
    const reg = (await get('acc', '/v1/fee-accounts/reports/cheques?from=2026-10-01&to=2026-10-31').expect(200)).body;
    expect(reg.totals.bouncedPaise).toBe(R(5000));
  });

  it('a refund is requested, approved by the principal, then paid out with a voucher', async () => {
    const i = await invoice(t.students[2].id, 3000);
    const p = await pay(i.id, 3000, 'upi');
    await post('acc', '/v1/fee-accounts/refunds', { paymentId: p.id, amountPaise: R(4000), reason: 'Too much' }).expect(400);
    const r = (await post('acc', '/v1/fee-accounts/refunds', { paymentId: p.id, amountPaise: R(1000), reason: 'Dropped the elective' }).expect(201)).body;
    await post('acc', `/v1/fee-accounts/refunds/${r.id}/pay`, { mode: 'bank_transfer' }).expect(409);
    await post('acc', `/v1/fee-accounts/refunds/${r.id}/decide`, { decision: 'approve' }).expect(403);
    await post('principal', `/v1/fee-accounts/refunds/${r.id}/decide`, { decision: 'approve' }).expect(201);
    const paid = (await post('acc', `/v1/fee-accounts/refunds/${r.id}/pay`, { mode: 'bank_transfer', reference: 'NEFT 1' }).expect(201)).body;
    expect(paid.status).toBe('paid');
    expect(await inv(i.id)).toMatchObject({ paid: R(2000), status: 'due' });
    const reg = (await get('acc', '/v1/fee-accounts/reports/refunds?from=2026-10-01&to=2026-10-31').expect(200)).body;
    expect(reg.rows[0]).toMatchObject({ number: r.number, amountPaise: R(1000), mode: 'bank_transfer' });
    expect(await audited('refund.paid')).toBe(1);
  });

  it('a write-off needs the principal and lowers what is due', async () => {
    const i = await invoice(t.students[1].id, 800);
    const w = (await post('acc', '/v1/fee-accounts/write-offs', { invoiceId: i.id, amountPaise: R(800), reason: 'Family unreachable' }).expect(201)).body;
    await post('acc2', `/v1/fee-accounts/write-offs/${w.id}/decide`, { decision: 'approve' }).expect(403);
    await post('principal', `/v1/fee-accounts/write-offs/${w.id}/decide`, { decision: 'approve' }).expect(201);
    expect(await inv(i.id)).toMatchObject({ amount: 0, status: 'paid' });
  });

  it('vouchers post only after a second person approves; closed months are refused', async () => {
    const accts = (await get('acc', '/v1/books/accounts').expect(200)).body as { id: string; code: string }[];
    const a = (code: string) => accts.find((x) => x.code === code)!.id;
    const body = { type: 'payment', date: '2026-10-18', narration: 'Electricity bill', lines: [{ accountId: a('5100'), debitPaise: R(4620) }, { accountId: a('1010'), creditPaise: R(4620) }] };
    await post('acc', '/v1/fee-accounts/vouchers', { ...body, lines: [body.lines[0], { accountId: a('1010'), creditPaise: R(1) }] }).expect(400);
    const v = (await post('acc', '/v1/fee-accounts/vouchers', body).expect(201)).body;
    await post('acc', `/v1/fee-accounts/vouchers/${v.id}/decide`, { decision: 'approve' }).expect(403);
    const ok = (await post('acc2', `/v1/fee-accounts/vouchers/${v.id}/decide`, { decision: 'approve' }).expect(201)).body;
    expect(ok.voucherId).toBeTruthy();
    const rec = (await get('acc', `/v1/fee-accounts/records/vouchers/${ok.voucherId}`).expect(200)).body;
    expect(rec.record.amountPaise).toBe(R(4620));
    await post('acc', '/v1/fee-accounts/periods/2026-10/close').expect(400);
    await post('acc', '/v1/fee-accounts/periods/2026-09/close', { note: 'Reconciled' }).expect(201);
    await post('acc', '/v1/fee-accounts/vouchers', { ...body, date: '2026-09-28' }).expect(409);
  });

  it('a cashier closes the day against the cash receipts and someone else verifies it', async () => {
    // Counter receipts are stamped with the real time, so close the day they were taken on.
    const day = (await owner.query("select (paid_at at time zone 'Asia/Kolkata')::date::text as d from fee_payments where tenant_id = $1 and method = 'cash'", [t.tenantId])).rows[0].d as string;
    const exp = (await get('acc', `/v1/fee-accounts/closings/expected?date=${day}`).expect(200)).body;
    expect(exp).toMatchObject({ systemPaise: R(400), receiptCount: 1 });
    await post('acc', '/v1/fee-accounts/closings', { date: day, denominations: { 3: 1 } }).expect(400);
    const c = (await post('acc', '/v1/fee-accounts/closings', { date: day, denominations: { 200: 1, 100: 1, 50: 1 }, note: '' }).expect(201)).body;
    expect(c).toMatchObject({ systemPaise: R(400), countedPaise: R(350) });
    await post('acc', `/v1/fee-accounts/closings/${c.id}/decide`, { decision: 'approve' }).expect(403);
    await post('acc2', `/v1/fee-accounts/closings/${c.id}/decide`, { decision: 'approve' }).expect(400);
    await post('acc2', `/v1/fee-accounts/closings/${c.id}/decide`, { decision: 'approve', comment: 'Short ₹50, cashier paid in' }).expect(201);
  });

  it('reports add up and stay inside the tenant', async () => {
    const daily = (await get('acc', '/v1/fee-accounts/reports/daily-collection?from=2026-10-01&to=2026-10-31').expect(200)).body;
    expect(daily.totals.amountPaise).toBe(R(400 + 3000));
    const out = (await get('acc', '/v1/fee-accounts/reports/outstanding?to=2026-10-20').expect(200)).body;
    expect(out.rows.find((r: { id: string }) => r.id === t.students[0].id)).toMatchObject({ bucket: '0-30' });
    const tb = (await get('acc', '/v1/fee-accounts/reports/trial-balance').expect(200)).body;
    expect(tb.totals.debitPaise).toBe(tb.totals.creditPaise);
    const led = (await get('acc', `/v1/fee-accounts/reports/student-ledger?studentId=${t.students[0].id}`).expect(200)).body;
    expect(led.totals.balancePaise).toBe(R(1000 - 400 + 20000 - 2000));
    for (const key of ['head-collection', 'concessions', 'cash-book', 'bank-book', 'day-book', 'income-expenditure', 'balance-sheet', 'budget-vs-actual', 'gst', '80g']) await get('acc', `/v1/fee-accounts/reports/${key}`).expect(200);
    for (const e of ['structures', 'accounts', 'invoices', 'receipts', 'concessions', 'refunds', 'write-offs', 'vouchers', 'voucher-requests', 'ledgers', 'budgets', 'cheques', 'closings']) await get('acc', `/v1/fee-accounts/list/${e}`).expect(200);
    const invs = (await get('acc', '/v1/fee-accounts/list/invoices').expect(200)).body;
    expect(invs.every((i: { invoiceNo: string }) => /^INV\/2026-27\/\d{5}$/.test(i.invoiceNo))).toBe(true);
    expect((await get('outsider', '/v1/fee-accounts/list/concessions').expect(200)).body).toEqual([]);
    await get('outsider', `/v1/fee-accounts/records/invoices/${ids.cashInvoice}`).expect(404);
  });
});
