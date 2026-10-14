import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx } from '../src/common/xlsx.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * Fees and accounts depth: fee heads and structures as record lists, assignment with optional heads and pro-rata,
 * re-assignment with a delta, the multi-mode counter with head allocation, receipt cancel and reissue, cheque
 * bounce of a whole receipt, advance credit, concession types and chains, slab fines and waivers, one-student
 * instalment plans, refunds for a withdrawal (and reverting one), challans, government scholarships, carry
 * forward, dues blocks, reminders, bank reconciliation, funds, budget control, reports and tenant isolation.
 */
describe('fees and accounts depth', () => {
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
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const R = (rupees: number) => rupees * 100;
  const inv = async (id: string) => (await owner.query('select amount_paise::int as amount, paid_paise::int as paid, status, carried_paise::int as carried from fee_invoices where id = $1', [id])).rows[0];
  const lines = async (id: string) => (await get('acc', `/v1/fee-setup/invoices/${id}/lines`).expect(200)).body as { headCode: string; netPaise: number; paidPaise: number; balancePaise: number }[];
  const ok = (res: request.Response, status = 201) => {
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    return res.body;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const mk = async (name: string, email: string, role: (typeof s.roleName.enumValues)[number]) => {
      const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email, passwordHash: await argon2.hash('pw') }).returning();
      await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
      return u;
    };
    const acc = await mk('Rekha Accounts', 'rekha@fd.in', 'accountant');
    await mk('Arun Accounts', 'arun@fd.in', 'accountant');
    await mk('Meera Admin', 'meera@fd.in', 'tenant_admin');
    ids.acc = acc.id;
    app = await createApp(clock);
    tok.acc = await login(t.slug, 'rekha@fd.in');
    tok.acc2 = await login(t.slug, 'arun@fd.in');
    tok.admin = await login(t.slug, 'meera@fd.in');
    tok.principal = await login(t.slug, t.principal.email!);
    tok.teacher = await login(t.slug, t.teacher.email!);
    tok.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('fee heads are a record list: seeded, added, ordered by priority, exported, and guarded when in use', async () => {
    await get('teacher', '/v1/records/fee-heads').expect(403);
    const heads = ok(await get('acc', '/v1/fee-setup/heads'), 200) as { code: string; sortOrder: number }[];
    expect(heads.map((h) => h.code)).toEqual(expect.arrayContaining(['TUI', 'EXM', 'LAB', 'TRN', 'FIN']));
    expect(heads.at(-1)!.code).toBe('FIN');
    const meta = ok(await get('acc', '/v1/records/fee-heads/meta'), 200);
    expect(meta.can).toMatchObject({ create: true, reorder: true, import: true, duplicate: true });
    const lib = ok(await post('acc', '/v1/records/fee-heads', { code: 'lib', name: 'Library', kind: 'library', accountCode: '4000', gstRate: 0, refundable: false, optional: true, linkedModule: 'opt_in' }));
    expect(lib).toMatchObject({ code: 'LIB', optional: true, linkedModule: 'opt_in' });
    ids.lib = lib.id;
    await post('acc', '/v1/records/fee-heads', { code: 'LIB', name: 'Again' }).expect(409);
    const hst = ok(await post('acc', '/v1/records/fee-heads', { code: 'UNF', name: 'Uniform', kind: 'uniform', gstRate: 12, sac: '999293', receiptPrefix: 'UNF/{FY}/' }));
    ids.unf = hst.id;
    const page = ok(await get('acc', '/v1/records/fee-heads?f.gst=taxable'), 200);
    expect(page.rows.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(['UNF']));
    const order = ok(await get('acc', '/v1/records/fee-heads?pageSize=50'), 200).rows.map((r: { id: string }) => r.id);
    ok(await post('acc', '/v1/records/fee-heads/reorder', { ids: [order.at(-1), ...order.slice(0, -1)] }), 200);
    ok(await post('acc', '/v1/records/fee-heads/reorder', { ids: order }), 200);
    const csv = await get('acc', '/v1/records/fee-heads/export?format=csv').expect(200);
    expect(csv.text).toContain('Library');
    const tpl = await get('acc', '/v1/records/fee-heads/import/template').buffer(true).parse(binary).expect(200);
    expect(readXlsx(tpl.body as Buffer)[0]).toEqual(expect.arrayContaining(['Code *', 'Name *']));
    const imp = ok(await http().post('/v1/records/fee-heads/import').set(as('acc')).attach('file', Buffer.from('Code,Name,Kind,Optional,Linked to\r\nBKS,Books,books,yes,opt_in\r\nXX!,Bad,other,no,none\r\n'), 'h.csv'), 200);
    expect(imp.totals).toMatchObject({ created: 1, error: 1 });
    ok(await post('acc', `/v1/records/fee-heads/import/${imp.id}/commit`, { skipErrors: true }), 200);
    await get('outsider', '/v1/records/fee-heads').expect(200).then((r) => expect(r.body.rows.some((x: { code: string }) => x.code === 'LIB')).toBe(false));
  });

  it('a structure by programme and quota assigns invoices with lines; optional heads only for those who opted in', async () => {
    const fs = ok(await post('acc', '/v1/records/fee-structures', { name: 'BCom Sem 3 2026-27 Govt', academicYear: '2026-27', programId: t.program.id, quota: 'government', dueInDays: 20 }));
    expect(fs).toMatchObject({ status: 'draft', quota: 'government' });
    ids.fs = fs.id;
    ok(await put('acc', `/v1/fee-setup/structures/${fs.id}/items`, { items: [{ code: 'TUI', amountPaise: R(30000) }, { code: 'EXM', amountPaise: R(2000) }, { code: 'LIB', amountPaise: R(1000) }] }), 200);
    await put('acc', `/v1/fee-setup/structures/${fs.id}/items`, { items: [{ code: 'NOPE', amountPaise: 1 }] }).expect(400);
    // Only students with the government quota match.
    for (const st of t.students) ok(await patch('acc', `/v1/records/fee-profiles/${st.id}`, { quota: 'government' }), 200);
    ok(await patch('acc', `/v1/records/fee-profiles/${t.students[0].id}`, { optedHeads: 'lib' }), 200);
    const bulk = ok(await post('acc', '/v1/records/fee-profiles/bulk', { op: 'update', target: { ids: [t.students[2].id] }, fields: { quota: 'management' } }), 200);
    expect(bulk).toMatchObject({ succeeded: 1 });
    await post('acc', `/v1/fee-setup/structures/${fs.id}/assign`, {}).expect(409);
    const sub = ok(await post('acc', '/v1/records/fee-structures/bulk', { op: 'action', action: 'submit', target: { ids: [fs.id] } }), 200);
    expect(sub.succeeded).toBe(1);
    ok(await post('principal', `/v1/fee-accounts/structures/${fs.id}/decide`, { decision: 'approve' }));
    ok(await post('acc', '/v1/records/fee-structures/bulk', { op: 'action', action: 'publish', target: { ids: [fs.id] } }), 200);
    const prev = ok(await get('acc', `/v1/fee-setup/structures/${fs.id}/preview`), 200) as { studentId: string; amountPaise: number }[];
    expect(prev.map((r) => r.amountPaise).sort()).toEqual([R(32000), R(33000)]);
    const done = ok(await post('acc', `/v1/fee-setup/structures/${fs.id}/assign`, { dueOn: '2026-11-10' }), 200);
    expect(done).toMatchObject({ assigned: 2 });
    const again = ok(await post('acc', `/v1/fee-setup/structures/${fs.id}/assign`, {}), 200);
    expect(again.assigned).toBe(0);
    const [i0] = (await owner.query('select id from fee_invoices where student_id = $1 and structure_id = $2', [t.students[0].id, fs.id])).rows;
    ids.inv0 = i0.id;
    expect((await lines(i0.id)).map((l) => l.headCode)).toEqual(['TUI', 'EXM', 'LIB']);
    const sheet = ok(await get('acc', `/v1/fee-setup/structures/${fs.id}/print`), 200);
    expect(sheet).toMatchObject({ compulsoryPaise: R(32000), optionalPaise: R(1000) });
    // A structure students have cannot be deleted; it is switched off instead.
    expect(ok(await http().delete(`/v1/records/fee-structures/${fs.id}`).set(as('acc')), 403).message).toMatch(/switch it off/);
  });

  it('a changed structure is re-assigned: only the difference is charged; a late joiner pays pro-rata', async () => {
    ok(await put('acc', `/v1/fee-setup/structures/${ids.fs}/items`, { items: [{ code: 'TUI', amountPaise: R(31000) }, { code: 'EXM', amountPaise: R(1500) }, { code: 'LIB', amountPaise: R(1000) }] }), 200);
    await post('acc', `/v1/fee-setup/structures/${ids.fs}/reassign`).expect(409);
    ok(await post('acc', '/v1/records/fee-structures/bulk', { op: 'action', action: 'submit', target: { ids: [ids.fs] } }), 200);
    ok(await post('principal', `/v1/fee-accounts/structures/${ids.fs}/decide`, { decision: 'approve' }));
    ok(await post('acc', '/v1/records/fee-structures/bulk', { op: 'action', action: 'publish', target: { ids: [ids.fs] } }), 200);
    const re = ok(await post('acc', `/v1/fee-setup/structures/${ids.fs}/reassign`), 200);
    expect(re).toMatchObject({ students: 2, changed: 2 });
    expect(re.rows.find((r: { studentId: string }) => r.studentId === t.students[0].id)).toMatchObject({ beforePaise: R(33000), afterPaise: R(33500), deltaPaise: R(500) });
    expect(await inv(ids.inv0)).toMatchObject({ amount: R(33500) });
    // A student who joins mid-year (December of an August–May year) is charged 6 of 10 months.
    await owner.query("update students set enrolled_on = '2026-12-05', status = 'active' where id = $1", [t.students[2].id]);
    ok(await patch('acc', `/v1/records/fee-profiles/${t.students[2].id}`, { quota: 'government' }), 200);
    const pre = ok(await get('acc', `/v1/fee-setup/structures/${ids.fs}/preview?prorata=1`), 200) as { studentId: string; prorataPercent: number; amountPaise: number }[];
    expect(pre.find((r) => r.studentId === t.students[2].id)).toMatchObject({ prorataPercent: 60, amountPaise: R(19500) });
    const late = ok(await post('acc', `/v1/fee-setup/structures/${ids.fs}/assign`, { studentIds: [t.students[2].id], prorata: true }), 200);
    expect(late.students[0]).toMatchObject({ prorataPercent: 60, amountPaise: R(19500) });
  });

  it('the counter takes cash and a cheque on one receipt, oldest fees first and heads by priority', async () => {
    const st = t.students[0].id;
    const old = (await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: st, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Term 1 tuition', amountPaise: R(5000), dueOn: '2026-09-01', createdBy: t.principal.id }).returning())[0];
    ids.old = old.id;
    const view = ok(await get('acc', `/v1/fee-collect/students/${st}`), 200);
    expect(view.invoices.map((i: { id: string }) => i.id)[0]).toBe(old.id);
    expect(view.duePaise).toBe(R(5000 + 33500));
    const preview = ok(await post('acc', '/v1/fee-collect/preview', { studentId: st, amountPaise: R(8000) }), 200);
    expect(preview.rows.map((r: { headCode: string; amountPaise: number }) => [r.headCode, r.amountPaise])).toEqual([
      ['TUI', R(5000)],
      ['TUI', R(3000)],
    ]);
    await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'cheque', amountPaise: R(3000) }] }).expect(400);
    const r = ok(await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'cheque', amountPaise: R(3000), chequeNo: '770011', bankName: 'Canara Bank', chequeDate: '2026-10-20' }, { method: 'cash', amountPaise: R(5000) }] }));
    expect(r).toMatchObject({ status: 'active', totalPaise: R(8000), inWords: 'Eight Thousand Rupees Only' });
    expect(r.receiptNo).toMatch(/^RCPT\/2026-27\/\d{5}$/);
    expect(r.payments).toHaveLength(2);
    // Cash went first: the old fee is paid in cash, the cheque pays tuition of the new one.
    expect(r.payments.map((p: { method: string; amountPaise: number }) => [p.method, p.amountPaise])).toEqual([
      ['cash', R(5000)],
      ['cheque', R(3000)],
    ]);
    expect(r.cheques).toHaveLength(1);
    ids.receipt1 = r.id;
    expect(await inv(old.id)).toMatchObject({ paid: R(5000), status: 'paid' });
    expect((await lines(ids.inv0)).find((l) => l.headCode === 'TUI')).toMatchObject({ paidPaise: R(3000) });
    const heads = ok(await get('acc', '/v1/fee-accounts/reports/head-collection?from=2020-01-01&to=2030-12-31'), 200);
    expect(heads.rows.find((x: { code: string }) => x.code === 'TUI').amountPaise).toBe(R(8000));
    const kit = ok(await get('acc', '/v1/records/fee-receipts?q=' + encodeURIComponent(r.receiptNo)), 200);
    expect(kit.rows[0]).toMatchObject({ modes: expect.stringContaining('cash'), totalPaise: R(8000) });
    expect(ok(await http().delete(`/v1/records/fee-receipts/${r.id}`).set(as('acc')), 403).message).toMatch(/never deleted/);
  });

  it('a manual split pays the chosen head; more than is due is kept as advance and can pay later fees', async () => {
    const st = t.students[0].id;
    await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'upi', amountPaise: R(500), reference: 'UPI1' }], allocations: [{ invoiceId: ids.inv0, headCode: 'LIB', amountPaise: R(2000) }] }).expect(400);
    const r = ok(await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'upi', amountPaise: R(1000), reference: 'UPI-5521' }], allocations: [{ invoiceId: ids.inv0, headCode: 'LIB', amountPaise: R(1000) }] }));
    expect(r.items).toEqual([expect.objectContaining({ headCode: 'LIB', amountPaise: R(1000) })]);
    const due = ok(await get('acc', `/v1/fee-collect/students/${st}`), 200).duePaise;
    await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'cash', amountPaise: due + R(700) }] }).expect(400);
    const big = ok(await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'cash', amountPaise: due + R(700) }], keepExcess: true }));
    expect(big.advancePaise).toBe(R(700));
    ids.bigReceipt = big.id;
    const after = ok(await get('acc', `/v1/fee-collect/students/${st}`), 200);
    expect(after).toMatchObject({ duePaise: 0, advancePaise: R(700) });
    // A new charge is paid from the advance on its own receipt.
    const fine = (await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: st, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'ID card replacement', amountPaise: R(300), dueOn: '2026-10-30', createdBy: t.principal.id }).returning())[0];
    const adv = ok(await post('acc', `/v1/fee-collect/students/${st}/from-advance`, {}), 200);
    expect(adv).toMatchObject({ totalPaise: R(300) });
    expect(await inv(fine.id)).toMatchObject({ status: 'paid' });
    expect(ok(await get('acc', `/v1/fee-collect/students/${st}`), 200).advancePaise).toBe(R(400));
    const ledger = ok(await get('acc', `/v1/fee-accounts/reports/student-ledger?studentId=${st}`), 200);
    expect(ledger.totals.balancePaise).toBe(-R(400));
  });

  it('a bounced cheque takes back its whole receipt and the books are reversed', async () => {
    const [chq] = (await owner.query('select id from fee_cheques where receipt_id = $1', [ids.receipt1])).rows;
    ok(await post('acc', `/v1/fee-accounts/cheques/${chq.id}/deposit`, { on: '2026-10-20' }));
    const before = (await owner.query("select count(*)::int as n from acct_vouchers where tenant_id = $1 and source_type = 'cheque_bounce'", [t.tenantId])).rows[0].n;
    ok(await post('acc', `/v1/fee-accounts/cheques/${chq.id}/bounce`, { on: '2026-10-21', reason: 'Funds insufficient', chargePaise: R(250) }));
    const rec = ok(await get('acc', `/v1/fee-collect/receipts/${ids.receipt1}`), 200);
    expect(rec.status).toBe('bounced');
    expect(await inv(ids.old)).toMatchObject({ paid: 0, status: 'due' });
    const after = (await owner.query("select count(*)::int as n from acct_vouchers where tenant_id = $1 and source_type = 'cheque_bounce'", [t.tenantId])).rows[0].n;
    expect(after - before).toBe(2);
    const tb = ok(await get('acc', '/v1/fee-accounts/reports/trial-balance'), 200);
    expect(tb.totals.debitPaise).toBe(tb.totals.creditPaise);
  });

  it('cancelling a receipt needs approval; it is reversed, kept, and can be reissued under a new number', async () => {
    const st = t.students[1].id;
    const [i1] = (await owner.query('select id from fee_invoices where student_id = $1 and structure_id = $2', [st, ids.fs])).rows;
    const r = ok(await post('acc', '/v1/fee-collect/counter', { studentId: st, modes: [{ method: 'card', amountPaise: R(4000), reference: 'POS 88812' }] }));
    await post('acc', `/v1/fee-collect/receipts/${r.id}/cancel`, { reason: 'x' }).expect(400);
    ok(await post('acc', `/v1/fee-collect/receipts/${r.id}/cancel`, { reason: 'Wrong student selected' }));
    await post('acc', `/v1/fee-collect/receipts/${r.id}/cancel`, { reason: 'Again please' }).expect(409);
    await post('acc', `/v1/fee-collect/receipts/${r.id}/cancel/decide`, { decision: 'approve' }).expect(403);
    const inbox = ok(await get('principal', '/v1/fee-accounts/inbox'), 200);
    expect(inbox.counts['receipt-cancels']).toBe(1);
    ok(await post('principal', `/v1/fee-collect/receipts/${r.id}/cancel/decide`, { decision: 'approve' }));
    expect(await inv(i1.id)).toMatchObject({ paid: 0, status: 'due' });
    const view = ok(await get('acc', `/v1/fee-collect/receipts/${r.id}`), 200);
    expect(view).toMatchObject({ status: 'cancelled', cancel: { reason: 'Wrong student selected' } });
    await post('acc', `/v1/fee-collect/receipts/${r.id}/reissue`, { modes: [{ method: 'cash', amountPaise: R(10) }] }).expect(400);
    const again = ok(await post('acc', `/v1/fee-collect/receipts/${r.id}/reissue`, { modes: [{ method: 'cash', amountPaise: R(4000) }] }));
    expect(again.reissueOf).toMatchObject({ id: r.id });
    expect(again.receiptNo).not.toBe(r.receiptNo);
    expect(await inv(i1.id)).toMatchObject({ paid: R(4000) });
    // The PDF comes from the documents' receipt generator; the second copy is a duplicate.
    const pdf1 = await get('acc', `/v1/fee-collect/receipts/${again.id}/pdf`).buffer(true).parse(binary).expect(200);
    expect((pdf1.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    ok(await post('acc', `/v1/fee-collect/receipts/${again.id}/print`), 200);
    expect((await owner.query("select count(*)::int as n from audit_log where action = 'fee_receipt.duplicate_printed' and subject_id = $1", [again.id])).rows[0].n).toBe(1);
  });

  it('concession types apply to their heads; a chain lets the accountant approve small ones and forwards the rest', async () => {
    ok(await put('acc', '/v1/fee-accounts/settings', { chains: { concession: [{ role: 'accountant', limitRupees: 1000 }, { role: 'principal', limitRupees: null }] } }), 200);
    await put('acc', '/v1/fee-accounts/settings', { chains: { refund: [{ role: 'principal', limitRupees: 100 }, { role: 'hod', limitRupees: 50 }, { role: 'tenant_admin', limitRupees: null }] } }).expect(400);
    const type = ok(await post('acc', '/v1/records/fee-concession-types', { name: 'Merit 10%', category: 'merit', mode: 'percent', percent: 10, headCodes: 'tui' }));
    expect(type.headCodes).toBe('TUI');
    const st = t.students[1].id;
    const [i1] = (await owner.query('select id from fee_invoices where student_id = $1 and structure_id = $2', [st, ids.fs])).rows;
    const c = ok(await post('acc', '/v1/fee-accounts/concessions', { studentId: st, invoiceId: i1.id, typeId: type.id, reason: 'University rank holder' }));
    expect(c).toMatchObject({ amountPaise: R(3100), headCodes: ['TUI'], kind: 'merit' });
    // Above the accountant's ₹1,000: their approval forwards it to the principal.
    const fwd = ok(await post('acc2', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve', comment: 'Checked marks card' }));
    expect(fwd).toMatchObject({ status: 'pending', level: 1 });
    await post('acc2', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve' }).expect(403);
    const done = ok(await post('principal', `/v1/fee-accounts/concessions/${c.id}/decide`, { decision: 'approve' }));
    expect(done).toMatchObject({ status: 'approved', appliedPaise: R(3100) });
    expect(done.trail.map((x: { decision: string }) => x.decision)).toEqual(['forward', 'approve']);
    expect((await lines(i1.id)).find((l) => l.headCode === 'TUI')!.netPaise).toBe(R(31000 - 3100));
    // A small one is final with the accountant.
    const small = ok(await post('acc', '/v1/fee-accounts/concessions', { studentId: st, invoiceId: i1.id, kind: 'sibling', amountPaise: R(500), headCodes: ['EXM'], reason: 'Sibling studying here' }));
    expect(ok(await post('acc2', `/v1/fee-accounts/concessions/${small.id}/decide`, { decision: 'approve' })).status).toBe('approved');
    const views = ok(await get('acc', '/v1/fee-accounts/reports/discounts?groupBy=head&from=2020-01-01&to=2030-12-31'), 200);
    expect(views.totals.appliedPaise).toBe(R(3600));
    expect(views.rows.map((r: { label: string }) => r.label).sort()).toEqual(['EXM', 'TUI']);
  });

  it('a slab fine is charged on its own head and a waiver goes up the waiver chain', async () => {
    ok(await put('principal', '/v1/fees/late-fee-rule', { mode: 'slab', graceDays: 5, slabs: [{ fromDay: 1, toDay: 10, paise: R(10), perDay: true }, { fromDay: 11, toDay: null, paise: R(200), perDay: false }], capPaise: R(1000) }), 200);
    await put('principal', '/v1/fees/late-fee-rule', { mode: 'slab', graceDays: 0, slabs: [{ fromDay: 1, toDay: 10, paise: 1, perDay: true }, { fromDay: 5, toDay: null, paise: 1, perDay: false }] }).expect(400);
    // Term 1 tuition fell due on 1 September; on 20 October it is 49 days late, 44 after grace: 10 × ₹10 + ₹200.
    ok(await post('acc', '/v1/fees/late-fees/run'), 200);
    expect(await inv(ids.old)).toMatchObject({ amount: R(5000 + 300) });
    expect((await lines(ids.old)).find((l) => l.headCode === 'FIN')).toMatchObject({ netPaise: R(300) });
    const [lf] = (await owner.query('select id from fee_late_fees where invoice_id = $1', [ids.old])).rows;
    const w = ok(await post('acc', '/v1/fee-setup/waivers', { lateFeeId: lf.id, amountPaise: R(200), reason: 'Bank holiday week' }));
    await post('acc', `/v1/fee-setup/waivers/${w.id}/decide`, { decision: 'approve' }).expect(403);
    ok(await post('principal', `/v1/fee-setup/waivers/${w.id}/decide`, { decision: 'approve' }));
    expect(await inv(ids.old)).toMatchObject({ amount: R(5100) });
    expect(ok(await get('acc', '/v1/records/fee-waivers?f.status=approved'), 200).total).toBe(1);
  });

  it('a one-student instalment plan applies once approved', async () => {
    const inv1 = (await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[1].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Hostel deposit', amountPaise: R(9000), dueOn: '2026-11-01', createdBy: t.principal.id }).returning())[0];
    await post('acc', '/v1/fee-setup/custom-plans', { invoiceId: inv1.id, reason: 'Farm income comes late', parts: [{ dueOn: '2026-11-01', amountPaise: R(4000) }, { dueOn: '2027-01-01', amountPaise: R(4000) }] }).expect(400);
    const plan = ok(await post('acc', '/v1/fee-setup/custom-plans', { invoiceId: inv1.id, reason: 'Farm income comes late', parts: [{ dueOn: '2026-11-15', amountPaise: R(3000) }, { dueOn: '2027-01-15', amountPaise: R(6000) }] }));
    ok(await post('principal', `/v1/fee-setup/custom-plans/${plan.id}/decide`, { decision: 'approve' }));
    const sched = ok(await get('acc', `/v1/fees/invoices/${inv1.id}/instalments`), 200);
    expect(sched.instalments.map((x: { dueOn: string; amountPaise: number }) => [x.dueOn, x.amountPaise])).toEqual([
      ['2026-11-15', R(3000)],
      ['2027-01-15', R(6000)],
    ]);
  });

  it('a withdrawal refund stops the charge, needs its chain, pays by NEFT and can be reverted', async () => {
    const st = t.students[1].id;
    const [pay] = (await owner.query("select id, amount_paise::int as amount, invoice_id from fee_payments where student_id = $1 and status = 'paid' order by created_at desc limit 1", [st])).rows;
    await post('acc', '/v1/fee-accounts/refunds', { paymentId: pay.id, amountPaise: R(1000), reason: 'Withdrew', payeeIfsc: 'BAD' }).expect(400);
    const r = ok(await post('acc', '/v1/fee-accounts/refunds', { paymentId: pay.id, amountPaise: R(1000), reason: 'Withdrew in the first week', closeDues: true, payeeName: 'Ramesh K', payeeAccount: '0412101012345', payeeIfsc: 'cnrb0000412' }));
    expect(r.payeeIfsc).toBe('CNRB0000412');
    ok(await post('principal', `/v1/fee-accounts/refunds/${r.id}/decide`, { decision: 'approve' }));
    const before = await inv(pay.invoice_id);
    ok(await post('acc', `/v1/fee-accounts/refunds/${r.id}/pay`, { mode: 'bank_transfer', reference: 'NEFT N2210' }));
    const after = await inv(pay.invoice_id);
    expect(after.paid).toBe(before.paid - R(1000));
    expect(after.amount).toBe(before.amount - R(1000));
    const rev = ok(await post('principal', `/v1/fee-accounts/refunds/${r.id}/revert`, { reason: 'NEFT returned: account closed' }));
    expect(rev.status).toBe('reverted');
    expect(await inv(pay.invoice_id)).toMatchObject({ paid: before.paid, amount: before.amount });
    const reg = ok(await get('acc', '/v1/fee-accounts/reports/refunds?from=2020-01-01&to=2030-12-31'), 200);
    expect(reg.totals.amountPaise).toBe(0);
  });

  it('a bank challan is receipted from the bank’s paid file', async () => {
    const st = t.students[2].id;
    const ch = ok(await post('acc', '/v1/fee-collect/challans', { studentId: st, bankName: 'Canara Bank', bankAccount: '0412101099999', validDays: 10 }));
    expect(ch.number).toMatch(/^CHL\/2026-27\/\d{5}$/);
    const print = ok(await get('acc', `/v1/fee-collect/challans/${ch.id}`), 200);
    expect(print.lines.length).toBeGreaterThan(0);
    const csv = `Challan No,Amount,Date,Bank Ref\r\n${ch.number},${ch.amountPaise / 100},21/10/2026,CNRB998877\r\nCHL/2026-27/99999,100,21/10/2026,X\r\n`;
    const rec = ok(await post('acc', '/v1/fee-collect/challans/reconcile', { csv }), 200);
    expect(rec).toMatchObject({ receipted: 1, failed: 1 });
    expect(ok(await get('acc', `/v1/records/fee-challans?q=${encodeURIComponent(ch.number)}`), 200).rows[0].status).toBe('paid');
    const again = ok(await post('acc', '/v1/fee-collect/challans/reconcile', { csv }), 200);
    expect(again.rows[0].message).toBe('Already paid');
  });

  it('a government scholarship is tracked from application to money received, which pays the dues', async () => {
    const st = t.students[1].id;
    const g = ok(await post('acc', '/v1/records/fee-govt-scholarships', { rollForCreate: 'R2', scheme: 'Post-matric scholarship', portal: 'state', applicationNo: 'KA2026PM0451', academicYear: '2026-27', appliedRupees: 25000, appliedOn: '2026-08-14' }));
    expect(g).toMatchObject({ status: 'applied', appliedPaise: R(25000) });
    await post('acc', '/v1/records/fee-govt-scholarships', { rollForCreate: 'R99', scheme: 'X', portal: 'state', applicationNo: 'Y', academicYear: '2026-27' }).expect(400);
    ok(await post('acc', `/v1/fee-collect/govt-scholarships/${g.id}/sanction`, { amountPaise: R(20000), on: '2026-10-01' }), 200);
    const due = ok(await get('acc', `/v1/fee-collect/students/${st}`), 200).duePaise;
    const got = ok(await post('acc', `/v1/fee-collect/govt-scholarships/${g.id}/receive`, { amountPaise: R(20000), on: '2026-10-20', reference: 'DBT 7781' }), 200);
    expect(got.status).toBe('received');
    const after = ok(await get('acc', `/v1/fee-collect/students/${st}`), 200);
    expect(after.duePaise).toBe(Math.max(0, due - R(20000)));
    expect(after.advancePaise).toBe(Math.max(0, R(20000) - due));
    const reg = ok(await get('acc', '/v1/fee-accounts/reports/scholarships?from=2020-01-01&to=2030-12-31'), 200);
    expect(reg.totals.receivedPaise).toBe(R(20000));
    expect(ok(await http().delete(`/v1/records/fee-govt-scholarships/${g.id}`).set(as('acc')), 403).message).toMatch(/stays on record/);
  });

  it('dues of a year are carried into the next as one arrears invoice; the ledger shows both sides', async () => {
    const st = t.students[0].id;
    const preview = ok(await get('acc', '/v1/fee-collect/carry-forward?fromYear=2026-27'), 200) as { studentId: string; balancePaise: number }[];
    const mine = preview.filter((r) => r.studentId === st);
    expect(mine.length).toBeGreaterThan(0);
    const owed = mine.reduce((a, r) => a + r.balancePaise, 0);
    const before = ok(await get('acc', `/v1/fee-accounts/reports/student-ledger?studentId=${st}`), 200).totals.balancePaise;
    const done = ok(await post('acc', '/v1/fee-collect/carry-forward', { fromYear: '2026-27', toYear: '2027-28', dueOn: '2027-06-30', studentIds: [st] }), 200);
    expect(done).toMatchObject({ students: 1, amountPaise: owed });
    const [arrears] = (await owner.query("select id, amount_paise::int as amount from fee_invoices where student_id = $1 and kind = 'arrears'", [st])).rows;
    expect(arrears.amount).toBe(owed);
    const after = ok(await get('acc', `/v1/fee-accounts/reports/student-ledger?studentId=${st}`), 200);
    expect(after.totals.balancePaise).toBe(before);
    expect(after.rows.some((r: { particulars: string }) => r.particulars === 'Carried forward to 2027-28')).toBe(true);
  });

  it('overdue dues hold back what the settings say, reminders go out on the schedule, and the summary reaches the principal', async () => {
    const st = t.students[0].id;
    expect(ok(await get('acc', `/v1/fee-collect/dues-check/${st}`), 200)).toMatchObject({ hallTicket: false, tc: false });
    ok(await put('acc', '/v1/fee-accounts/settings', { duesBlock: { hallTicket: true, tc: true, minRupees: 100 }, reminders: { enabled: true, daysBefore: [3], daysAfter: [1], channels: ['app', 'sms'], dailySummary: true } }), 200);
    await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[1].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Lab breakage', amountPaise: R(450), dueOn: '2026-10-10', createdBy: t.principal.id });
    expect(ok(await get('acc', `/v1/fee-collect/dues-check/${t.students[1].id}`), 200)).toMatchObject({ hallTicket: true, tc: true, results: false });
    const run = ok(await post('acc', '/v1/fee-collect/reminders/run'), 200);
    expect(run.app).toBeGreaterThan(0);
    expect(run.skipped).toEqual(['No active "fee_reminder" SMS template in Communication']);
    expect(ok(await get('acc', '/v1/fee-collect/reminders/runs'), 200)[0]).toMatchObject({ kind: 'manual' });
    const sum = ok(await post('acc', '/v1/fee-collect/summary/send'), 200);
    expect(sum.sentTo).toBeGreaterThan(0);
    expect((await owner.query("select count(*)::int as n from notifications where tenant_id = $1 and dedupe_key like 'fee-summary:%'", [t.tenantId])).rows[0].n).toBeGreaterThan(0);
  });

  it('a bank statement is imported, matched to the books, and the reconciliation explains the difference', async () => {
    const accts = ok(await get('acc', '/v1/accounts-depth/bank-accounts'), 200) as { id: string; code: string }[];
    const bank = accts.find((a) => a.code === '1010')!;
    ok(await patch('acc', `/v1/records/acct-ledgers/${bank.id}`, { bankName: 'Canara Bank', accountNo: '0412101012345', ifsc: 'CNRB0000412' }), 200);
    const vouchers = (await owner.query("select v.id, v.number, v.voucher_date::text as d, sum(l.debit_paise)::int as dr from acct_vouchers v join acct_voucher_lines l on l.voucher_id = v.id where l.account_id = $1 and v.voided_at is null group by v.id having sum(l.debit_paise) > 0 order by v.voucher_date limit 1", [bank.id])).rows;
    const v = vouchers[0];
    const day = v.d.split('-').reverse().join('/');
    const csv = `Account statement\r\nDate,Narration,Ref No,Withdrawal,Deposit,Balance\r\n${day},By clearing ${v.number},REF1,,${v.dr / 100},${v.dr / 100}\r\n${day},SMS charges,,59.00,,${v.dr / 100 - 59}\r\n`;
    const imp = ok(await post('acc', '/v1/accounts-depth/bank/statements', { accountId: bank.id, fileName: 'oct.csv', csv }));
    expect(imp).toMatchObject({ lines: 2, matched: 1 });
    const again = ok(await post('acc', '/v1/accounts-depth/bank/statements', { accountId: bank.id, fileName: 'oct.csv', csv }));
    expect(again).toMatchObject({ lines: 0, skipped: 2 });
    const open = ok(await get('acc', `/v1/accounts-depth/bank/lines?accountId=${bank.id}&status=unmatched`), 200);
    expect(open).toHaveLength(1);
    ok(await post('acc', `/v1/accounts-depth/bank/lines/${open[0].id}/ignore`, { note: 'Bank SMS charges; voucher to follow' }), 200);
    const brs = ok(await get('acc', `/v1/accounts-depth/bank/reconciliation?accountId=${bank.id}`), 200);
    expect(brs.bankOnly).toHaveLength(1);
    expect(brs.bankComputedPaise).toBe(brs.booksPaise - brs.depositsNotCredited.reduce((a: number, x: { amountPaise: number }) => a + x.amountPaise, 0) + brs.paymentsNotPresented.reduce((a: number, x: { amountPaise: number }) => a + x.amountPaise, 0) - R(59));
  });

  it('vouchers carry a fund and a department; a blocking budget refuses spending past it', async () => {
    const fund = ok(await post('acc', '/v1/records/acct-funds', { code: 'hostel', name: 'Hostel fund' }));
    expect(fund.code).toBe('HOSTEL');
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce' }).returning();
    ok(await post('acc', '/v1/records/acct-budgets', { departmentId: dept.id, fiscalYear: '2026-27', amountRupees: 1000, enforce: 'block' }));
    const accts = (await get('acc', '/v1/books/accounts').expect(200)).body as { id: string; code: string }[];
    const a = (code: string) => accts.find((x) => x.code === code)!.id;
    const body = { type: 'payment', date: '2026-10-18', narration: 'Seminar hall chairs', fundId: fund.id, departmentId: dept.id, lines: [{ accountId: a('5100'), debitPaise: R(800) }, { accountId: a('1010'), creditPaise: R(800) }] };
    const v1 = ok(await post('acc', '/v1/fee-accounts/vouchers', body));
    const posted = ok(await post('acc2', `/v1/fee-accounts/vouchers/${v1.id}/decide`, { decision: 'approve' }));
    expect((await owner.query('select fund_id, department_id from acct_vouchers where id = $1', [posted.voucherId])).rows[0]).toMatchObject({ fund_id: fund.id, department_id: dept.id });
    await post('acc', '/v1/fee-accounts/vouchers', body).expect(409);
    const budgets = ok(await get('acc', '/v1/records/acct-budgets'), 200);
    expect(budgets.rows[0]).toMatchObject({ usedPaise: R(800), utilisation: 80 });
    const tb = ok(await get('acc', `/v1/fee-accounts/reports/trial-balance?fund=${fund.id}`), 200);
    expect(tb.totals.debitPaise).toBe(R(800));
    const funds = ok(await get('acc', '/v1/fee-accounts/reports/fund-summary'), 200);
    expect(funds.rows.find((r: { id: string }) => r.id === fund.id)).toMatchObject({ expensePaise: R(800) });
    // Vouchers are voided, never deleted; a fund in use stays.
    expect(ok(await http().delete(`/v1/records/acct-vouchers/${posted.voucherId}`).set(as('acc')), 403).message).toMatch(/void/);
    expect(ok(await http().delete(`/v1/records/acct-funds/${fund.id}`).set(as('acc')), 403).message).toMatch(/switch it off/);
    const voided = ok(await post('acc', '/v1/records/acct-vouchers/bulk', { op: 'action', action: 'void', target: { ids: [posted.voucherId] } }), 200);
    expect(voided.succeeded).toBe(1);
  });

  it('an unpaid invoice goes to the recycle bin and comes back with its lines; reports stay inside the tenant', async () => {
    const x = (await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[2].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Field trip', amountPaise: R(600), dueOn: '2026-12-01', createdBy: t.principal.id }).returning())[0];
    await lines(x.id);
    const del = ok(await http().delete(`/v1/records/fee-invoices/${x.id}`).set(as('acc')), 200);
    expect(del.binId).toBeTruthy();
    ok(await post('acc', `/v1/recycle-bin/${del.binId}/restore`), 200);
    expect((await lines(x.id)).length).toBe(1);
    expect(ok(await http().delete(`/v1/records/fee-invoices/${ids.old}`).set(as('acc')), 403).message).toMatch(/Payments were recorded|Money has been received/);
    for (const key of ['cashier-collection', 'discounts', 'scholarships', 'receipt-register', 'challans', 'carry-forward', 'fund-summary']) ok(await get('acc', `/v1/fee-accounts/reports/${key}`), 200);
    for (const e of ['fee-heads', 'fee-structures', 'fee-concession-types', 'fee-instalment-plans', 'fee-profiles', 'fee-invoices', 'fee-receipts', 'fee-concessions', 'fee-refunds', 'fee-write-offs', 'fee-cheques', 'fee-closings', 'fee-govt-scholarships', 'fee-challans', 'fee-waivers', 'fee-custom-plans', 'acct-ledgers', 'acct-funds', 'acct-vouchers', 'acct-voucher-requests', 'acct-budgets']) {
      ok(await get('acc', `/v1/records/${e}/meta`), 200);
      ok(await get('acc', `/v1/records/${e}`), 200);
      const theirs = ok(await get('outsider', `/v1/records/${e}`), 200);
      expect(theirs.rows.filter((r: { id: string }) => r.id === ids.receipt1 || r.id === ids.fs)).toEqual([]);
    }
    await get('outsider', `/v1/fee-collect/receipts/${ids.receipt1}`).expect(404);
    await get('teacher', `/v1/fee-collect/students/${t.students[0].id}`).expect(403);
  });
});
