import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import { DbService } from '../src/db/db.service.js';
import * as s from '../src/db/schema.js';
import { acctFunds } from '../src/db/schema-fee-depth.js';
import { feeLateFees } from '../src/db/schema-depth.js';
import { messageTemplates } from '../src/db/schema-pathways.js';
import { DuesService } from '../src/fee-depth/dues.service.js';
import { FakeRazorpayApi } from '../src/fees/payment-provider.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Fees flagship, worked by hand on one class of three students (A, B, C) at Soundarya-like setup:
 * two fee accounts (the Trust, numbered SET/…; the College, the default, numbered SIMS/…), each with its own books
 * (fund) and bank ledger; the books on the accrual basis.
 *
 *   Fees per student: Tuition ₹40,000 (College, due 10 Oct), Development fee ₹10,000 (Trust, due 31 Oct),
 *   Uniform and books ₹5,600 incl. 12% GST (College, due 31 Oct)  →  ₹55,600 × 3 = ₹1,66,800 receivable.
 *
 * After every step the invariant holds: the Fees Receivable ledger (1100) equals what invoices still ask for.
 */
describe('fees flagship: fee accounts, accrual journals, payment links, UPI, bank matching, SSP, escalations, transfers', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const ok = (res: request.Response, status = 201) => {
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    return res.body;
  };
  const R = (rupees: number) => Math.round(rupees * 100);
  let A: string, B: string, C: string;
  const ids: Record<string, string> = {};

  /** The balance (debit − credit) of an account code, in all books or one fund. */
  const bal = async (code: string, fundId?: string) =>
    Number(
      (
        await owner.query(
          `select coalesce(sum(l.debit_paise - l.credit_paise), 0)::bigint as b from acct_voucher_lines l join acct_vouchers v on v.id = l.voucher_id join acct_accounts a on a.id = l.account_id where a.tenant_id = $1 and a.code = $2 and v.voided_at is null ${fundId ? 'and v.fund_id = $3' : ''}`,
          fundId ? [t.tenantId, code, fundId] : [t.tenantId, code],
        )
      ).rows[0].b,
    );
  const outstanding = async () => Number((await owner.query(`select coalesce(sum(amount_paise - paid_paise), 0)::bigint as o from fee_invoices where tenant_id = $1 and status = 'due'`, [t.tenantId])).rows[0].o);
  const invoiceOf = async (student: string, title: string) => (await owner.query('select id, amount_paise::int as amount, paid_paise::int as paid, status, fee_account_id as account from fee_invoices where tenant_id = $1 and student_id = $2 and title = $3 order by created_at', [t.tenantId, student, title])).rows[0];
  const balanced = async () => {
    const tb = ok(await get('acc', '/v1/fee-accounts/reports/trial-balance'), 200);
    expect(tb.totals.debitPaise).toBe(tb.totals.creditPaise);
  };
  const invariant = async (expected: number) => {
    expect(await outstanding()).toBe(expected);
    expect(await bal('1100')).toBe(expected);
    await balanced();
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    [A, B, C] = t.students.map((x) => x.id);
    const user = async (name: string, role: (typeof s.roleName.enumValues)[number], phone?: string) => {
      const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}-${t.slug}@x.in`, phone, passwordHash: await argon2.hash('pw') }).returning();
      await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
      return u;
    };
    const acc = await user('Asha Accounts', 'accountant');
    const admin = await user('Ada Admin', 'tenant_admin');
    await db.update(s.users).set({ phone: '+919845011111' }).where(eq(s.users.id, t.guardian.id));
    await db.update(s.users).set({ phone: '+919845022222', email: `mother-${t.slug}@x.in` }).where(eq(s.users.id, t.guardian2.id));
    await db.update(s.sections).set({ classTeacherId: t.teacher.id }).where(eq(s.sections.id, t.section.id));
    app = await createApp(clock, (m) => m.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'gateways', RAZORPAY_FAKE: 'true', PAY_LINK_BASE_URL: 'https://erp.zynetix.test/pay' })));
    tokens.acc = await login(t.slug, acc.email!);
    tokens.admin = await login(t.slug, admin.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, `mother-${t.slug}@x.in`);
    tokens.otherAcc = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('sets up two fee accounts with their own series, books, bank and UPI; only the head may', async () => {
    ok(await get('acc', '/v1/books/accounts'), 200); // the chart is made
    const [trustFund] = await db.insert(acctFunds).values({ tenantId: t.tenantId, code: 'TRUST', name: 'Trust books' }).returning();
    const [collegeFund] = await db.insert(acctFunds).values({ tenantId: t.tenantId, code: 'COLL', name: 'College books' }).returning();
    const [trustBank] = await db.insert(s.acctAccounts).values({ tenantId: t.tenantId, code: '1020', name: 'SBI Trust A/c', groupType: 'asset', isCashBank: true }).returning();
    const [collegeBank] = await db.insert(s.acctAccounts).values({ tenantId: t.tenantId, code: '1030', name: 'Canara College A/c', groupType: 'asset', isCashBank: true }).returning();
    Object.assign(ids, { trustFund: trustFund.id, collegeFund: collegeFund.id, trustBank: trustBank.id, collegeBank: collegeBank.id });
    const trustBody = { code: 'SET', name: 'Soundarya Educational Trust', kind: 'trust', fundId: trustFund.id, bankAccountId: trustBank.id, receiptPrefix: 'SET/{FY}/', upiVpa: 'soundaryatrust@sbi', upiPayeeName: 'Soundarya Educational Trust', pan: 'AAATS1234Q', reg80g: 'AAATS1234QF20214' };
    await post('acc', '/v1/records/fee-accounts', trustBody).expect(403);
    await post('teacher', '/v1/records/fee-accounts', trustBody).expect(403);
    await post('principal', '/v1/records/fee-accounts', { ...trustBody, upiVpa: 'not a vpa' }).expect(400);
    ids.trust = ok(await post('principal', '/v1/records/fee-accounts', trustBody)).id;
    ids.college = ok(await post('principal', '/v1/records/fee-accounts', { code: 'SIMS', name: 'Soundarya Institute of Management', kind: 'institution', fundId: collegeFund.id, bankAccountId: collegeBank.id, receiptPrefix: 'SIMS/{FY}/', upiVpa: 'sims.fees@canarabank', isDefault: true, gstin: '29AAATS1234Q1Z5' })).id;
    const list = ok(await get('acc', '/v1/records/fee-accounts'), 200);
    expect(list.rows.map((r: { code: string }) => r.code)).toEqual(['SET', 'SIMS']);
    expect(ok(await get('otherAcc', '/v1/records/fee-accounts'), 200).rows).toEqual([]);
    // Heads: Development fee belongs to the Trust; the rest to the default (College).
    await get('acc', '/v1/fee-setup/heads').expect(200);
    ok(await post('acc', '/v1/records/fee-heads', { code: 'DEV', name: 'Development fee', kind: 'other', accountCode: '4000', gstRate: 0, refundable: false, optional: false, linkedModule: 'none', feeAccountId: ids.trust }));
    await put('principal', '/v1/fee-accounts/settings', { basis: 'accrual' }).expect(200);
    await put('principal', '/v1/admin/payments/gateways', { provider: 'razorpay', keyId: 'rzp_test_FlagShip1234', keySecret: 'flagship-secret-1', webhookSecret: 'flagship-hook-1' }).expect(200);
  });

  it('books each fee as it is charged: receivable against income, GST apart, in the fee account’s books', async () => {
    for (const [title, rupees, dueOn] of [['Tuition', 40_000, '2026-10-10'], ['Development fee', 10_000, '2026-10-31'], ['Uniform and books', 5_600, '2026-10-31']] as const) {
      ok(await post('acc', '/v1/fees/invoices', { sectionId: t.section.id, title, amountPaise: R(rupees), dueOn }));
    }
    expect((await invoiceOf(A, 'Development fee')).account).toBe(ids.trust);
    expect((await invoiceOf(A, 'Tuition')).account).toBeNull(); // the default account (College)
    await invariant(R(166_800));
    expect(await bal('4000', ids.trustFund)).toBe(-R(30_000));
    expect(await bal('4000')).toBe(-R(150_000));
    expect(await bal('4100')).toBe(-R(15_000)); // uniform, taxable value
    expect(await bal('2200')).toBe(-R(1_800)); // GST payable, 12% inside ₹5,600 × 3
  });

  it('journalises a concession, a late fee and its waiver', async () => {
    const tuitionA = (await invoiceOf(A, 'Tuition')).id;
    const c = ok(await post('acc', '/v1/fee-accounts/concessions', { studentId: A, invoiceId: tuitionA, kind: 'merit', percent: 10, reason: 'University rank holder' }));
    ok(await post('principal', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve' }));
    expect(await bal('5400')).toBe(R(4_000));
    await invariant(R(162_800));
    // ₹250 the day after the grace on every overdue fee (Tuition, due 10 Oct, for all three).
    ok(await put('principal', '/v1/fees/late-fee-rule', { graceDays: 0, flatPaise: R(250) }), 200);
    expect(ok(await post('acc', '/v1/fees/late-fees/run'), 200)).toEqual({ assessed: 3, totalPaise: R(750) });
    await invariant(R(163_550));
    const [fineC] = await db.select().from(feeLateFees).where(eq(feeLateFees.invoiceId, (await invoiceOf(C, 'Tuition')).id));
    ok(await post('principal', `/v1/fees/late-fees/${fineC.id}/waive`, { reason: 'Hospitalised' }), 200);
    expect(await bal('5420')).toBe(R(250));
    await invariant(R(163_300));
  });

  it('one payment across two fee accounts makes one receipt per account, each in its own series', async () => {
    // A owes 36,000 + 250 + 10,000 + 5,600 = ₹51,850.
    const r = ok(await post('acc', '/v1/fee-collect/counter', { studentId: A, modes: [{ method: 'cash', amountPaise: R(20_000) }, { method: 'upi', amountPaise: R(31_850), reference: 'UPIA0001', terminalId: 'POS-01' }] }));
    const made = (r.receipts as { receiptNo: string; totalPaise: number }[]).map((x) => [x.receiptNo, x.totalPaise]).sort();
    expect(made).toEqual([['SET/2026-27/00001', R(10_000)], ['SIMS/2026-27/00001', R(41_850)]]);
    await invariant(R(111_450));
    // The trust's money is in the trust's books.
    expect(await bal('1100', ids.trustFund)).toBe(R(20_000));
    const pos = (await owner.query("select pos_terminal from fee_payments where tenant_id = $1 and method = 'upi'", [t.tenantId])).rows;
    expect(pos.every((x: { pos_terminal: string }) => x.pos_terminal === 'POS-01')).toBe(true);
  });

  it('a bounced cheque reverses the receipt and books the return charge', async () => {
    const r = ok(await post('acc', '/v1/fee-collect/counter', { studentId: B, modes: [{ method: 'cheque', amountPaise: R(40_250), chequeNo: '445566', bankName: 'Canara Bank', chequeDate: '2026-10-20' }] }));
    expect(r.receiptNo).toBe('SIMS/2026-27/00002');
    await invariant(R(71_200));
    const [chq] = (await owner.query('select id from fee_cheques where tenant_id = $1', [t.tenantId])).rows;
    ok(await post('acc', `/v1/fee-accounts/cheques/${chq.id}/deposit`, { on: '2026-10-20' }));
    ok(await post('acc', `/v1/fee-accounts/cheques/${chq.id}/bounce`, { on: '2026-10-20', reason: 'Funds insufficient', chargePaise: R(500) }));
    // 71,200 + 40,250 reopened + 500 charge.
    await invariant(R(111_950));
    expect(await bal('4100')).toBe(-R(15_000 + 750 + 500));
  });

  it('a withdrawal refund comes out of the trust’s bank and leaves the receivable square', async () => {
    const pay = (await owner.query("select p.id from fee_payments p join fee_invoices i on i.id = p.invoice_id where i.tenant_id = $1 and i.title = 'Development fee' and p.student_id = $2 and p.status = 'paid'", [t.tenantId, A])).rows[0];
    const rf = ok(await post('acc', '/v1/fee-accounts/refunds', { paymentId: pay.id, amountPaise: R(1_000), reason: 'Withdrew from the hostel block fund', closeDues: true }));
    ok(await post('principal', `/v1/fee-accounts/refunds/${rf.id}/decide`, { decision: 'approve' }));
    ok(await post('acc', `/v1/fee-accounts/refunds/${rf.id}/pay`, { mode: 'bank_transfer', reference: 'NEFT-R1' }));
    // The trust's bank took A's ₹10,000 by UPI and paid the ₹1,000 back.
    expect(await bal('1020')).toBe(R(9_000));
    expect(await bal('5200', ids.trustFund)).toBe(R(1_000));
    await invariant(R(111_950));
  });

  it('statements: income and expenditure per fee account, GST from receipts, Zoho Books journals', async () => {
    const coll = ok(await get('acc', `/v1/fee-accounts/reports/income-expenditure?fy=2026-27&account=${ids.college}`), 200);
    // College: tuition 1,20,000 + uniform 15,000 + fines 750 + cheque charge 500; less concession 4,000 and waiver 250.
    expect(coll.totals).toMatchObject({ incomePaise: R(136_250), expensePaise: R(4_250), surplusPaise: R(132_000) });
    const trust = ok(await get('acc', `/v1/fee-accounts/reports/income-expenditure?fy=2026-27&fund=${ids.trustFund}`), 200);
    expect(trust.totals).toMatchObject({ incomePaise: R(30_000), expensePaise: R(1_000), surplusPaise: R(29_000) });
    const tb = ok(await get('acc', `/v1/fee-accounts/reports/trial-balance?account=${ids.trust}`), 200);
    expect(tb.totals.debitPaise).toBe(tb.totals.creditPaise);
    const gst = ok(await get('acc', '/v1/fee-accounts/reports/gst?from=2026-10-01&to=2026-10-31'), 200);
    expect(gst.totals).toMatchObject({ taxablePaise: R(5_000), cgstPaise: R(300), sgstPaise: R(300) });
    await get('teacher', '/v1/books/zoho.csv?from=2026-04-01&to=2027-03-31').expect(403);
    const zoho = await get('acc', `/v1/books/zoho.csv?from=2026-04-01&to=2027-03-31&account=${ids.trust}`).expect(200);
    expect(zoho.headers['content-type']).toContain('text/csv');
    const lines = zoho.text.trim().split('\n');
    expect(lines[0]).toBe('Journal Date,Journal Number,Reference Number,Notes,Journal Type,Currency,Account,Description,Debit,Credit');
    const debits = lines.slice(1).reduce((x, l) => x + Number(l.split(',').at(-2) || 0), 0);
    const credits = lines.slice(1).reduce((x, l) => x + Number(l.split(',').at(-1) || 0), 0);
    expect(Math.round(debits * 100)).toBe(Math.round(credits * 100));
  });

  it('a payment link by SMS, WhatsApp and e-mail pays through the trust’s UPI QR or gateway, then closes; expired links refuse', async () => {
    const devC = (await invoiceOf(C, 'Development fee')).id;
    await post('teacher', '/v1/fees/payment-links', { invoiceId: devC }).expect(403);
    const link = ok(await post('acc', '/v1/fees/payment-links', { invoiceId: devC, channels: ['sms', 'whatsapp', 'email'] }));
    expect(link).toMatchObject({ number: 'PL-00001', amountPaise: R(10_000), status: 'active' });
    expect(link.url).toMatch(new RegExp(`^https://erp\\.zynetix\\.test/pay/${t.slug}/[A-Za-z0-9_-]{32}$`));
    expect(link.tokenHash).toBeUndefined();
    // No templates yet: the in-app notice goes, the others say why not.
    expect(link.sent.map((x: { ok: boolean }) => x.ok)).toEqual([false, false, false]);
    await db.insert(messageTemplates).values([
      { tenantId: t.tenantId, key: 'fee_payment_link', channel: 'sms', locale: 'en', subject: '', body: 'Pay {{amount}} for {{student}}: {{link}} by {{expires}}', dltTemplateId: '1107161234567890123', active: true },
      { tenantId: t.tenantId, key: 'fee_payment_link', channel: 'email', locale: 'en', subject: 'Fee payment link', body: 'Pay {{amount}} for {{student}}: {{link}}', active: true },
    ] as never);
    const again = ok(await post('acc', `/v1/fees/payment-links/${link.id}/resend`, { channels: ['sms', 'email'] }), 200);
    expect(again.sent.map((x: { ok: boolean }) => x.ok)).toEqual([true, true]);
    // The resend issued a new token, so the first URL no longer opens; read the token from the campaign.
    const camp = (await owner.query("select vars from message_campaigns where tenant_id = $1 and title like 'Payment link%' order by created_at desc limit 1", [t.tenantId])).rows[0];
    const token = String(camp.vars.link).split('/').at(-1)!;
    expect((await http().get(`/v1/public/pay/${t.slug}/${String(link.url).split('/').at(-1)}`).expect(200)).body.status).toBe('not_found');
    expect((await http().get(`/v1/public/pay/${other.slug}/${token}`).expect(200)).body.status).toBe('not_found');
    const page = (await http().get(`/v1/public/pay/${t.slug}/${token}`).expect(200)).body;
    expect(page).toMatchObject({ status: 'active', institution: 'Soundarya Educational Trust', studentFirstName: 'Student', amountPaise: R(10_000), onlinePayments: 'razorpay' });
    expect(page.upi.intent).toBe(`upi://pay?pa=soundaryatrust%40sbi&pn=Soundarya%20Educational%20Trust&mc=8220&tr=PL00001&tn=Development%20fee&am=10000.00&cu=INR`);
    expect(page.upi.qrSvg).toContain('<svg');
    const co = ok(await http().post(`/v1/public/pay/${t.slug}/${token}/checkout`).send({}));
    expect(co).toMatchObject({ provider: 'razorpay', amountPaise: R(10_000) });
    FakeRazorpayApi.payments.set(co.orderId, [{ id: 'pay_LINK0001', status: 'captured', amount: R(10_000) }]);
    const done = ok(await http().post(`/v1/public/pay/${t.slug}/${token}/payments/${co.paymentId}/refresh`), 200);
    expect(done).toEqual({ status: 'paid', receiptNo: 'SET/2026-27/00002' });
    expect((await http().get(`/v1/public/pay/${t.slug}/${token}`).expect(200)).body.status).toBe('paid');
    await http().post(`/v1/public/pay/${t.slug}/${token}/checkout`).send({}).expect(409);
    await invariant(R(101_950));
    // A link for B's uniform that runs out after a day.
    const short = ok(await post('acc', '/v1/fees/payment-links', { invoiceId: (await invoiceOf(B, 'Uniform and books')).id, validDays: 1 }));
    clock.at = new Date('2026-10-22T04:30:00Z');
    expect(ok(await get('acc', '/v1/fees/payment-links?status=expired'), 200).rows.map((r: { id: string }) => r.id)).toEqual([short.id]);
    clock.at = new Date('2026-10-20T04:30:00Z');
    const rep = ok(await get('acc', '/v1/fee-accounts/reports/payment-links?from=2026-10-01&to=2026-10-31'), 200);
    expect(rep.totals).toMatchObject({ links: 2, paidPaise: R(10_000) });
  });

  it('a family sees the amount-bound UPI QR of its own fee only', async () => {
    const tuitionA = (await invoiceOf(A, 'Tuition')).id;
    const tuitionB = (await invoiceOf(B, 'Tuition')).id;
    expect(ok(await get('parent', `/v1/fees/invoices/${tuitionA}/upi`), 200)).toEqual({}); // paid: nothing to pay
    const qr = ok(await get('parent2', `/v1/fees/invoices/${tuitionB}/upi`), 200);
    expect(qr).toMatchObject({ vpa: 'sims.fees@canarabank', amountPaise: R(40_250), feeAccount: 'Soundarya Institute of Management' });
    expect(qr.intent).toContain('am=40250.00');
    await get('parent', `/v1/fees/invoices/${tuitionB}/upi`).expect(404);
  });

  it('a bank statement receipts challans, NEFT reported in the app (by UTR) and credits quoting a fee reference', async () => {
    ok(await post('acc', '/v1/fees/fee-refs/generate', { prefix: 'SDY' }), 200);
    const uniformC = (await invoiceOf(C, 'Uniform and books')).id;
    const ch = ok(await post('acc', '/v1/fee-collect/challans', { studentId: C, invoiceIds: [uniformC], bankName: 'Canara Bank' }));
    const uniformB = (await invoiceOf(B, 'Uniform and books')).id;
    ok(await http().post(`/v1/parent/children/${B}/bank-transfers`).set(as('parent2')).field('invoiceId', uniformB).field('utr', 'HDFCN52026102012345').field('amountPaise', String(R(5_600))).field('transferDate', '2026-10-19'));
    const csv = ['Date,Narration,Ref No,Withdrawal,Deposit,Balance', `20/10/2026,CASH DEP ${ch.number} CANARA,,,5600.00,`, '20/10/2026,NEFT HDFCN52026102012345 FROM SMT B MOTHER,HDFCN52026102012345,,5600.00,', '20/10/2026,IMPS 630112345678 SDYR2 FEES,630112345678,,5600.00,', '20/10/2026,BANK CHARGES,,59.00,,'].join('\n');
    const st = ok(await post('acc', '/v1/accounts-depth/bank/statements', { accountId: ids.collegeBank, fileName: 'canara-oct.csv', csv }));
    expect(st).toMatchObject({ matched: 3 });
    const lines = (await owner.query('select match_kind, status from acct_bank_lines where tenant_id = $1 order by credit_paise desc, match_kind', [t.tenantId])).rows;
    expect(lines.filter((l: { status: string }) => l.status === 'matched').map((l: { match_kind: string }) => l.match_kind).sort()).toEqual(['challan', 'fee_ref', 'transfer']);
    expect((await owner.query('select status from bank_transfer_submissions where tenant_id = $1', [t.tenantId])).rows[0].status).toBe('verified');
    expect((await owner.query('select status from fee_challans where id = $1', [ch.id])).rows[0].status).toBe('paid');
    await invariant(R(101_950 - 16_800));
  });

  it('tracks a Karnataka SSP scholarship: verified, sanctioned from the portal file, received in parts; dues held meanwhile', async () => {
    ok(await post('acc', '/v1/records/fee-govt-scholarships', { rollForCreate: 'R3', scheme: 'Post-matric fee concession (SC/ST)', portal: 'ssp', applicationNo: 'SSP2026KA0012345', academicYear: '2026-27', appliedRupees: 40_000, expectedRupees: 40_000, category: 'SC', holdDues: true }));
    const g = (await owner.query('select id from fee_govt_scholarships where tenant_id = $1', [t.tenantId])).rows[0];
    // C's ₹40,000 tuition is overdue but the scholarship covers it: not a defaulter; B is (₹34,650 net).
    let def = ok(await get('acc', '/v1/fee-accounts/reports/defaulters?to=2026-10-20'), 200);
    expect(def.rows.map((r: { id: string; netPaise: number }) => [r.id, r.netPaise])).toEqual([[B, R(34_650)]]);
    expect(def.rows[0]).toMatchObject({ guardian: expect.any(String), phone: '+919845022222', email: `mother-${t.slug}@x.in` });
    expect(ok(await get('acc', `/v1/fee-collect/dues-check/${C}`), 200)).toMatchObject({ overduePaise: 0, scholarshipHeldPaise: R(40_000) });
    ok(await post('acc', `/v1/fee-collect/govt-scholarships/${g.id}/verify`, { on: '2026-10-20', portalStatus: 'Approved by HOI' }), 200);
    const file = ['Application No,Student Name,Status,Sanctioned Amount,Disbursed Amount,Disbursed Date', 'SSP2026KA0012345,Student C,Sanctioned by Department,"38,000.00",,', 'SSP2026KA9999999,Someone,Rejected,,,'].join('\n');
    const imp = ok(await post('acc', '/v1/fee-collect/govt-scholarships/import-status', { portal: 'ssp', csv: file }), 200);
    expect(imp).toMatchObject({ updated: 1, notFound: 1 });
    def = ok(await get('acc', '/v1/fee-accounts/reports/defaulters?to=2026-10-20'), 200);
    expect(def.rows.find((r: { id: string }) => r.id === C)).toMatchObject({ overduePaise: R(40_000), heldPaise: R(38_000), netPaise: R(2_000) });
    const first = ok(await post('acc', `/v1/fee-collect/govt-scholarships/${g.id}/receive`, { amountPaise: R(20_000), on: '2026-10-20', reference: 'DBT0001' }), 200);
    expect(first.receivedPaise).toBe(R(20_000));
    ok(await post('acc', `/v1/fee-collect/govt-scholarships/${g.id}/receive`, { amountPaise: R(18_000), on: '2026-10-20', reference: 'DBT0002' }), 200);
    await post('acc', `/v1/fee-collect/govt-scholarships/${g.id}/receive`, { amountPaise: R(1_000), on: '2026-10-20', reference: 'DBT0003' }).expect(409);
    const tr = ok(await get('acc', '/v1/fee-accounts/reports/scholarship-tracker?from=2026-04-01&to=2027-03-31'), 200);
    expect(tr.totals).toMatchObject({ expectedPaise: R(40_000), sanctionedPaise: R(38_000), receivedPaise: R(38_000), pendingPaise: 0 });
    await invariant(R(85_150 - 38_000));
  });

  it('reminders follow the schedule: before, on and after the due date, escalating to the class teacher and principal, once each', async () => {
    ok(await put('principal', '/v1/fee-accounts/settings', { reminders: { enabled: true }, escalations: [{ offsetDays: -3, audience: ['family'], channels: ['app'] }, { offsetDays: 0, audience: ['family'], channels: ['app', 'sms'] }, { offsetDays: 7, audience: ['family', 'class_teacher', 'principal'], channels: ['app', 'whatsapp'] }] }), 200);
    const run = () => app.get(DbService).withTenant(t.tenantId, (tx) => app.get(DuesService).remind(tx, t.tenantId, null));
    const first = await run();
    // B's tuition (10 days late) and C's tuition (₹2,000 left after the scholarship) reach the 7-day step; B's
    // cheque charge (due today) the on-the-day step. WhatsApp and the due-today SMS have no template: skipped.
    expect(first).toMatchObject({ students: 2, app: 3, escalated: 4 });
    expect(first.skipped.length).toBeGreaterThan(0);
    expect((await run()).app).toBe(0);
    const sent = ok(await get('acc', '/v1/fee-accounts/reports/reminders-sent?from=2026-10-01&to=2026-10-31'), 200);
    expect(sent.totals).toEqual({ sent: 7, escalated: 4 });
    const teacherNote = (await owner.query("select count(*)::int as n from notifications where user_id = $1 and dedupe_key like 'fee-escalation:%'", [t.teacher.id])).rows[0].n;
    expect(teacherNote).toBe(1);
  });

  it('moves a student to another programme mid-year: old fee kept for the share used, paid money counts on the new fee', async () => {
    const mk = async (name: string, rupees: number) => {
      const fs = ok(await post('acc', '/v1/fee-accounts/structures', { name, academicYear: '2026-27', items: [{ head: 'Tuition', amountPaise: R(rupees) }] }));
      ok(await post('acc', `/v1/fee-accounts/structures/${fs.id}/submit`));
      ok(await post('principal', `/v1/fee-accounts/structures/${fs.id}/decide`, { decision: 'approve', comment: 'ok' }));
      ok(await post('acc', `/v1/fee-accounts/structures/${fs.id}/publish`));
      return fs.id as string;
    };
    const bcom = await mk('BCom programme fee 2026-27', 30_000);
    const bba = await mk('BBA programme fee 2026-27', 50_000);
    ok(await post('acc', `/v1/fee-setup/structures/${bcom}/assign`, { studentIds: [A], dueOn: '2026-10-31' }), 200);
    ok(await post('acc', '/v1/fee-collect/counter', { studentId: A, modes: [{ method: 'cash', amountPaise: R(25_000) }] }));
    await post('teacher', `/v1/fee-setup/students/${A}/transfer`, { toStructureId: bba, effectiveOn: '2026-11-01', reason: 'Changed to BBA' }).expect(403);
    // The year runs Aug 2026 to May 2027 (10 months); moving on 1 Nov uses 3 of them: 30%.
    const pre = ok(await post('acc', `/v1/fee-setup/students/${A}/transfer`, { toStructureId: bba, effectiveOn: '2026-11-01', reason: 'Changed to BBA', preview: true }), 200);
    expect(pre).toMatchObject({ usedPercent: 30, keepPaise: R(9_000), oldAfterPaise: R(25_000), reduceOldPaise: R(5_000), newChargePaise: R(35_000), paidCountedOnNewPaise: R(16_000), totalPaise: R(44_000) });
    const before = await outstanding();
    const done = ok(await post('acc', `/v1/fee-setup/students/${A}/transfer`, { toStructureId: bba, effectiveOn: '2026-11-01', reason: 'Changed to BBA' }), 200);
    const newInv = (await owner.query('select amount_paise::int as a, paid_paise::int as p from fee_invoices where id = $1', [done.newInvoiceId])).rows[0];
    expect(newInv.a - newInv.p).toBe(R(19_000));
    // The BCom fee's ₹5,000 balance comes off (kept at what was paid) and the BBA fee asks ₹19,000.
    await invariant(before - R(5_000) + R(19_000));
    await post('acc', `/v1/fee-setup/students/${A}/transfer`, { toStructureId: bba, effectiveOn: '2026-11-01', reason: 'Again' }).expect(409);
    expect(ok(await get('acc', `/v1/fee-setup/students/${A}/transfers`), 200)).toHaveLength(1);
  });

  it('flags a duplicate payment, keeps it as advance when told, and journals the move', async () => {
    const devB = (await invoiceOf(B, 'Development fee')).id;
    ok(await post('acc', '/v1/fee-collect/counter', { studentId: B, modes: [{ method: 'upi', amountPaise: R(500), reference: 'UPIDUP77' }], allocations: [{ invoiceId: devB, headCode: 'DEV', amountPaise: R(500) }] }));
    ok(await post('acc', '/v1/fee-collect/counter', { studentId: B, modes: [{ method: 'upi', amountPaise: R(500), reference: 'UPIDUP77' }], allocations: [{ invoiceId: devB, headCode: 'DEV', amountPaise: R(500) }] }));
    await get('teacher', '/v1/fees/flags').expect(403);
    const flags = ok(await get('acc', '/v1/fees/flags?status=open'), 200);
    expect(flags.map((f: { flag: { reason: string; amountPaise: number } }) => [f.flag.reason, f.flag.amountPaise])).toEqual([['same_reference', R(500)]]);
    const before = await outstanding();
    ok(await post('acc', `/v1/fees/flags/${flags[0].flag.id}/resolve`, { resolution: 'kept_as_advance', note: 'Parent paid twice' }), 200);
    await post('acc', `/v1/fees/flags/${flags[0].flag.id}/resolve`, { resolution: 'not_duplicate' }).expect(409);
    expect(await outstanding()).toBe(before + R(500));
    expect(await bal('2300')).toBe(-R(500)); // advance fees held
    await invariant(before + R(500));
  });

  it('reports: mode-wise, ageing, gateway reconciliation, fee accounts, audit trail; another institution sees none of it', async () => {
    const mode = ok(await get('acc', '/v1/fee-accounts/reports/mode-wise?from=2026-10-01&to=2026-10-31'), 200);
    expect(mode.rows.map((r: { mode: string }) => r.mode).sort()).toEqual(['bank_transfer', 'cash', 'online', 'scholarship', 'upi'].sort());
    expect(mode.totals.amountPaise).toBe(mode.rows.reduce((x: number, r: { amountPaise: number }) => x + r.amountPaise, 0));
    const age = ok(await get('acc', '/v1/fee-accounts/reports/ageing?to=2026-10-20'), 200);
    expect(age.totals.balancePaise).toBe(await outstanding());
    const recon = ok(await get('acc', '/v1/fee-accounts/reports/gateway-recon?from=2026-10-01&to=2026-10-31'), 200);
    expect(recon.rows).toHaveLength(1);
    expect(recon.rows[0]).toMatchObject({ provider: 'razorpay', status: 'unsettled', feeAccount: 'Soundarya Educational Trust' });
    const accts = ok(await get('acc', '/v1/fee-accounts/reports/fee-account-summary?from=2026-10-01&to=2026-10-31'), 200);
    expect(accts.rows.map((r: { account: string }) => r.account)).toEqual(['SET Soundarya Educational Trust', 'SIMS Soundarya Institute of Management']);
    expect(accts.totals.outstandingPaise).toBe(await outstanding());
    const trail = ok(await get('acc', '/v1/fee-accounts/reports/audit-trail?from=2026-10-01&to=2026-12-31'), 200);
    const actions = new Set(trail.rows.map((r: { action: string }) => r.action));
    for (const a of ['fee_receipt.collected', 'fees.payment_link_created', 'fee_programme_transfer.transfer', 'fee_payment_flag.kept_as_advance', 'govt_scholarship.verified']) expect(actions).toContain(a);
    expect(ok(await get('otherAcc', '/v1/fee-accounts/reports/defaulters'), 200).rows).toEqual([]);
    expect(ok(await get('otherAcc', '/v1/fees/payment-links'), 200).rows).toEqual([]);
    expect(ok(await get('otherAcc', '/v1/fees/flags'), 200)).toEqual([]);
    await get('teacher', '/v1/fee-accounts/reports/defaulters').expect(403);
    const audit = await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'payments.gateway_saved')));
    expect(JSON.stringify(audit)).not.toContain('flagship-secret-1');
  });
});
