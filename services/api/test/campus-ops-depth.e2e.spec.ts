import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPORTS } from '../src/campus-ops/catalog.js';
import { nextDueDay } from '../src/transport/transport.controller.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('campus operations depth: module settings, record views, reports, library stock verification', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-10-12T05:00:00Z')));
    tokens.principal = await login(t.principal.email!);
    tokens.teacher = await login(t.teacher.email!);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('saves module settings, validates them, and applies numbering series and library rules', async () => {
    const lib = (await http().get('/v1/module-settings/library').set(as('principal')).expect(200)).body;
    expect(lib).toMatchObject({ module: 'library', rules: { loanDays: 14, maxRenewals: 2 }, numbering: { LSC: { prefix: 'LSC-', pad: 4, next: 1 } } });
    await http().get('/v1/module-settings/library').set(as('teacher')).expect(403);
    await http().get('/v1/module-settings/nope').set(as('principal')).expect(404);
    await http().put('/v1/module-settings/library').set(as('principal')).send({ rules: { loanDays: 'ten' } }).expect(400);
    await http().put('/v1/module-settings/library').set(as('principal')).send({ rules: { madeUp: 1 } }).expect(400);
    const saved = (await http().put('/v1/module-settings/library').set(as('principal')).send({ rules: { loanDays: 7, maxBooksPerStudent: 1 } }).expect(200)).body;
    expect(saved.rules).toMatchObject({ loanDays: 7, maxBooksPerStudent: 1, finePaisePerDay: 200 });

    // Library rules: loan period and the per-student limit come from settings.
    const a = (await http().post('/v1/library/books').set(as('principal')).send({ title: 'Cost Accounting', copies: 3, barcode: 'LB-1' }).expect(201)).body;
    const loan = (await http().post('/v1/library/loans').set(as('principal')).send({ bookId: a.id, studentId: t.students[0].id }).expect(201)).body;
    expect(loan.dueOn).toBe('2026-10-19');
    await http().post('/v1/library/loans').set(as('principal')).send({ bookId: a.id, studentId: t.students[0].id }).expect(400);

    // Numbering: procurement series with a financial-year prefix, moved forward to 42.
    await http().put('/v1/module-settings/procurement').set(as('principal')).send({ numbering: { REQ: { prefix: 'IND/{FY}/', pad: 5, next: 42 } } }).expect(200);
    const item = (await http().post('/v1/inventory/items').set(as('principal')).send({ sku: 'P1', name: 'Paper' }).expect(201)).body;
    const req = (await http().post('/v1/inventory/requisitions').set(as('teacher')).send({ reason: 'Exams', lines: [{ itemId: item.id, qty: 5 }] }).expect(201)).body;
    expect(req.number).toBe('IND/2026-27/00042');
    await http().put('/v1/module-settings/procurement').set(as('principal')).send({ numbering: { REQ: { prefix: 'IND/', pad: 5, next: 3 } } }).expect(409);

    // Record view: the requisition with its lines and its audit history.
    const rec = (await http().get(`/v1/ops-records/requisition/${req.id}`).set(as('principal')).expect(200)).body;
    expect(rec).toMatchObject({ kind: 'requisition', module: 'procurement', title: 'IND/2026-27/00042', record: { status: 'submitted' } });
    expect(rec.related.find((r: { key: string }) => r.key === 'lines').count).toBe(1);
    await http().get(`/v1/ops-records/requisition/${req.id}`).set(as('teacher')).expect(403);
    await http().get(`/v1/ops-records/nope/${req.id}`).set(as('principal')).expect(404);
    const bookRec = (await http().get(`/v1/ops-records/book/${a.id}`).set(as('principal')).expect(200)).body;
    expect(bookRec.related.find((r: { key: string }) => r.key === 'loans').count).toBe(1);
  });

  it('runs every report and exports CSV, XLSX and PDF', async () => {
    const list = (await http().get('/v1/ops-reports').set(as('principal')).expect(200)).body;
    expect(list.length).toBe(Object.keys(REPORTS).length);
    for (const id of Object.keys(REPORTS)) {
      const r = await http().get(`/v1/ops-reports/${id}?from=2026-01-01&to=2026-12-31`).set(as('principal'));
      expect(r.status, `${id}: ${JSON.stringify(r.body)}`).toBe(200);
    }
    const circ = (await http().get('/v1/ops-reports/library.circulation?status=open').set(as('principal')).expect(200)).body;
    expect(circ.rows).toEqual([expect.objectContaining({ title: 'Cost Accounting', returnedOn: '' })]);
    expect((await http().get('/v1/ops-reports/library.circulation?format=csv').set(as('principal')).expect(200)).text).toContain('Cost Accounting');
    const x = await http().get('/v1/ops-reports/library.stock?format=xlsx').set(as('principal')).buffer(true).expect(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    const pdf = await http().get('/v1/ops-reports/procurement.orders?format=pdf').set(as('principal')).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    await http().get('/v1/ops-reports/library.stock?from=yesterday').set(as('principal')).expect(400);
    await http().get('/v1/ops-reports/library.stock').set(as('teacher')).expect(403);
  });

  it('enforces hostel, canteen, transport, stores and purchasing settings', async () => {
    const put = (m: string, body: object) => http().put(`/v1/module-settings/${m}`).set(as('principal')).send(body).expect(200);
    const post = (path: string, body: object, who = 'principal') => http().post(path).set(as(who)).send(body);
    tokens.student = await login(t.studentUser.email!);
    const s = t.students[2];

    // Hostel: longest leave, and requests approved without the warden when the rule is off.
    const blk = (await post('/v1/hostel/blocks', { name: 'Block A' }).expect(201)).body;
    await post(`/v1/hostel/blocks/${blk.id}/rooms`, { number: '101', beds: 2 }).expect(201);
    const beds = (await http().get('/v1/hostel/beds?free=true').set(as('principal')).expect(200)).body;
    await post('/v1/hostel/allotments', { studentId: s.id, bedId: beds[0].bedId }).expect(201);
    // Days after the app's fixed clock (not the real date, which moves on).
    const back = (days: number) => new Date(Date.parse('2026-10-12T05:00:00Z') + days * 86_400_000).toISOString();
    await post('/v1/hostel/gate-passes', { studentId: s.id, reason: 'Home', expectedBackAt: back(9) }).expect(400);
    expect((await post('/v1/hostel/gate-passes/requests', { studentId: s.id, reason: 'Home', expectedBackAt: back(2) }, 'student').expect(201)).body.status).toBe('requested');
    await put('hostel', { rules: { outpassNeedsApproval: false, maxLeaveDays: 10 } });
    expect((await post('/v1/hostel/gate-passes/requests', { studentId: s.id, reason: 'Wedding', expectedBackAt: back(8) }, 'student').expect(201)).body.status).toBe('approved');

    // Canteen: smallest top-up, daily spend limit, negative balance.
    const dosa = (await post('/v1/canteen/items', { name: 'Dosa', pricePaise: 4000 }).expect(201)).body;
    await put('canteen', { rules: { minTopupPaise: 10000, dailySpendLimitPaise: 6000 } });
    await post('/v1/canteen/wallet/topup', { studentId: s.id, amountPaise: 5000, idempotencyKey: 'topup-small-1' }).expect(400);
    await post('/v1/canteen/wallet/topup', { studentId: s.id, amountPaise: 10000, idempotencyKey: 'topup-ok-0001' }).expect(201);
    await post('/v1/canteen/orders', { studentId: s.id, idempotencyKey: 'order-one-001', items: [{ itemId: dosa.id, qty: 1 }] }).expect(201);
    await post('/v1/canteen/orders', { studentId: s.id, idempotencyKey: 'order-two-001', items: [{ itemId: dosa.id, qty: 1 }] }).expect(409); // ₹80 > ₹60 a day
    await put('canteen', { rules: { dailySpendLimitPaise: 0, allowNegativeBalance: true } });
    expect((await post('/v1/canteen/orders', { studentId: s.id, idempotencyKey: 'order-three-1', items: [{ itemId: dosa.id, qty: 4 }] }).expect(201)).body.balancePaise).toBe(-10000);

    // Transport: fee due day and the document warning window.
    await post('/v1/transport/vehicles', { regNo: 'KA01AB1234', capacity: 40, insuranceExpiresOn: '2026-11-25' }).expect(201);
    const listed = async () => (await http().get('/v1/transport/compliance').set(as('principal')).expect(200)).body.items.length as number;
    expect(await listed()).toBe(0);
    await put('transport', { rules: { docExpiryWarnDays: 60 } });
    expect(await listed()).toBe(1);
    await post('/v1/transport/fees', { title: 'Bus fee October' }).expect(201);
    expect(nextDueDay('2026-10-12', 10)).toBe('2026-11-10');
    expect(nextDueDay('2026-12-12', 31)).toBe('2026-12-28');

    // Stores: negative stock only when allowed.
    const store = (await post('/v1/inventory/stores', { name: 'Main' }).expect(201)).body;
    const ink = (await post('/v1/inventory/items', { sku: 'INK', name: 'Ink' }).expect(201)).body;
    await post('/v1/inventory/stock/out', { storeId: store.id, itemId: ink.id, qty: 2, note: 'Spilt' }).expect(409);
    await put('inventory', { rules: { allowNegativeStock: true } });
    await post('/v1/inventory/stock/out', { storeId: store.id, itemId: ink.id, qty: 2, note: 'Spilt' }).expect(201);

    // Purchasing: quotations needed above a value, and the invoice match tolerance.
    await put('procurement', { rules: { quotesRequiredAbovePaise: 1000, minQuotes: 2, invoiceTolerancePaise: 500 } });
    const req = (await post('/v1/inventory/requisitions', { reason: 'Ink', lines: [{ itemId: ink.id, qty: 10 }] }, 'teacher').expect(201)).body;
    await http().post(`/v1/inventory/requisitions/${req.id}/decision`).set(as('principal')).send({ approve: true }).expect(200);
    const rfq = (await post('/v1/inventory/rfqs', { requisitionId: req.id }).expect(201)).body;
    const v1 = (await post('/v1/inventory/vendors', { name: 'Ink House' }).expect(201)).body.id;
    const v2 = (await post('/v1/inventory/vendors', { name: 'Pen World' }).expect(201)).body.id;
    const q1 = (await post(`/v1/inventory/rfqs/${rfq.id}/quotes`, { vendorId: v1, lines: [{ itemId: ink.id, unitPricePaise: 1500 }] }).expect(201)).body;
    await post(`/v1/inventory/rfqs/${rfq.id}/award`, { quoteId: q1.id, storeId: store.id }).expect(409);
    await post(`/v1/inventory/rfqs/${rfq.id}/quotes`, { vendorId: v2, lines: [{ itemId: ink.id, unitPricePaise: 1700 }] }).expect(201);
    const po = (await http().post(`/v1/inventory/rfqs/${rfq.id}/award`).set(as('principal')).send({ quoteId: q1.id, storeId: store.id })).body;
    const full = (await http().get(`/v1/inventory/purchase-orders/${po.id}`).set(as('principal')).expect(200)).body;
    await post(`/v1/inventory/purchase-orders/${po.id}/receipts`, { idempotencyKey: 'grn-ink-0001', lines: full.lines.map((l: { id: string; qty: number }) => ({ poLineId: l.id, qty: l.qty })) }).expect(201);
    expect((await post(`/v1/inventory/purchase-orders/${po.id}/invoices`, { invoiceNo: 'INK-1', amountPaise: 15300 }).expect(201)).body.status).toBe('matched'); // ₹3 off, within ₹5
  });

  it('verifies library stock: scans copies and closes with the shortfall', async () => {
    const b = (await http().post('/v1/library/books').set(as('principal')).send({ title: 'Business Law', copies: 2, isbn: '9781234567897' }).expect(201)).body;
    const check = (await http().post('/v1/library/stock-checks').set(as('principal')).send({ note: 'Annual' }).expect(201)).body;
    expect(check).toMatchObject({ number: 'LSC-0001', status: 'open' });
    await http().post('/v1/library/stock-checks').set(as('principal')).send({}).expect(409);
    expect((await http().post(`/v1/library/stock-checks/${check.id}/scan`).set(as('principal')).send({ code: '9781234567897' }).expect(200)).body).toMatchObject({ found: 1, copies: 2 });
    await http().post(`/v1/library/stock-checks/${check.id}/scan`).set(as('principal')).send({ code: 'NOPE' }).expect(404);
    const closed = (await http().post(`/v1/library/stock-checks/${check.id}/close`).set(as('principal')).expect(200)).body;
    // Cost Accounting: 3 copies, 1 on loan, none scanned → 2 short. Business Law: 2 copies, 1 scanned → 1 short.
    expect(closed.summary).toMatchObject({ expected: 4, found: 1, missingTitles: 2 });
    expect(closed.summary.missing.find((m: { bookId: string }) => m.bookId === b.id)).toMatchObject({ short: 1 });
    await http().post(`/v1/library/stock-checks/${check.id}/scan`).set(as('principal')).send({ code: '9781234567897' }).expect(409);
    const rec = (await http().get(`/v1/ops-records/stock-check/${check.id}`).set(as('principal')).expect(200)).body;
    expect(rec.activity.map((a: { action: string }) => a.action)).toEqual(['library.stock_check.closed', 'library.stock_check.started']);
  });
});
