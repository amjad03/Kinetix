import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { EventBus } from '../src/events/events.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * The stores, purchase and asset pass, with every figure worked by hand in the comments: GSTIN checks, an indent through
 * the head of department and the principal, three GST quotations ranked L1, an inter-state order (IGST), a receipt with
 * goods rejected at inspection, the three-way match, the purchase journal and payment voucher in the books, batches
 * issued earliest-expiry first at FIFO cost, weighted-average issues and transfers, an expired batch written off with
 * approval, durables registered as assets from the receipt, Companies Act and Income-tax Act depreciation, the
 * reports (stock summary, ledger, ageing, purchase register, MSME dues, labs, NAAC 4.1/4.4), and who may do what.
 */
describe('inventory, purchase and assets pass', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Noon in India on 3 November 2026.
  const clock = new FixedClock(new Date('2026-11-03T06:30:00Z'));
  const today = '2026-11-03';
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const inv = '/v1/inventory';

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}-${Math.random().toString(36).slice(2, 6)}@pass.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role, campusId: t.campus.id });
    return u;
  }
  /** The lines of a voucher in the books, as account code → [debit, credit]. */
  async function voucherLines(voucherId: string) {
    const rows = await db.select({ code: s.acctAccounts.code, dr: s.acctVoucherLines.debitPaise, cr: s.acctVoucherLines.creditPaise }).from(s.acctVoucherLines).innerJoin(s.acctAccounts, eq(s.acctAccounts.id, s.acctVoucherLines.accountId)).where(eq(s.acctVoucherLines.voucherId, voucherId));
    return Object.fromEntries(rows.map((r) => [r.code, [r.dr, r.cr]]));
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    const keeper = await addUser('Store Keeper', 'store_keeper');
    const hod = await addUser('Chemistry Head', 'hod');
    const accountant = await addUser('Accounts Officer', 'accountant');
    const iqac = await addUser('IQAC Coordinator', 'quality_officer');
    ids.keeperUser = keeper.id;
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Chemistry', headUserId: hod.id }).returning();
    ids.dept = dept.id;
    await db.insert(s.budgets).values({ tenantId: t.tenantId, departmentId: dept.id, fiscalYear: '2026-27', amountPaise: 1_00_000_00 });
    tokens.keeper = await login(t.slug, keeper.email!);
    tokens.hod = await login(t.slug, hod.email!);
    tokens.accountant = await login(t.slug, accountant.email!);
    tokens.iqac = await login(t.slug, iqac.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('checks GSTINs, PANs, HSN codes and GST rates on the masters', async () => {
    // 27AAPFU0939F1ZV is a real GSTIN; changing its last character breaks the check character.
    expect((await post('keeper', `${inv}/vendors`, { name: 'Typo Traders', gstin: '27AAPFU0939F1ZW' }).expect(400)).body.fieldErrors.gstin[0]).toMatch(/check character/);
    await post('keeper', `${inv}/vendors`, { name: 'Wrong PAN', gstin: '27AAPFU0939F1ZV', pan: 'AAPFU0939G' }).expect(400);
    await post('keeper', '/v1/records/inv-vendors', { name: 'Kit Typo', gstin: '29AABFS1234L1Z7' }).expect(400);
    ids.vA = (await post('keeper', `${inv}/vendors`, { name: 'Sri Lakshmi Stationers', gstin: '29AABFS1234L1Z4' }).expect(201)).body.id;
    const vb = (await post('keeper', `${inv}/vendors`, { name: 'Mumbai Paper Mills', gstin: '27AAPFU0939F1ZV', pan: 'AAPFU0939F', msmeCategory: 'micro', msmeUdyamNo: 'UDYAM-MH-19-0004567', paymentTermsDays: 60 }).expect(201)).body;
    expect(vb).toMatchObject({ stateCode: '27', gstRegistration: 'regular', msmeCategory: 'micro' });
    ids.vB = vb.id;
    ids.vC = (await post('keeper', `${inv}/vendors`, { name: 'Kaveri Supplies' }).expect(201)).body.id;
    expect((await get('keeper', `${inv}/vendors`).expect(200)).body.find((v: { id: string }) => v.id === ids.vC)).toMatchObject({ gstRegistration: 'unregistered', stateCode: null });

    await post('keeper', `${inv}/items`, { sku: 'BAD', name: 'Bad rate', gstRatePct: 7 }).expect(400);
    await post('keeper', `${inv}/items`, { sku: 'BAD', name: 'Bad HSN', hsnCode: '48' }).expect(400);
    ids.paper = (await post('keeper', `${inv}/items`, { sku: 'PAP-A4', name: 'A4 paper ream', category: 'Stationery', unit: 'ream', hsnCode: '4802', gstRatePct: 18, reorderLevel: 75 }).expect(201)).body.id;
    ids.acid = (await post('keeper', `${inv}/items`, { sku: 'CHM-HCL', name: 'Hydrochloric acid 500 ml', category: 'Lab chemicals', unit: 'bottle', hsnCode: '2806', gstRatePct: 18, itemType: 'chemical', batchTracked: true, valuation: 'fifo' }).expect(201)).body.id;
    ids.scope = (await post('keeper', `${inv}/items`, { sku: 'EQP-MIC', name: 'Compound microscope', category: 'Lab equipment', unit: 'nos', hsnCode: '9011', gstRatePct: 18, itemType: 'durable' }).expect(201)).body.id;
    const items = (await get('keeper', '/v1/records/inv-items?f.batch=yes').expect(200)).body;
    expect(items.rows.map((r: { sku: string }) => r.sku)).toEqual(['CHM-HCL']);

    ids.central = (await post('keeper', `${inv}/stores`, { name: 'Central store', kind: 'central' }).expect(201)).body.id;
    ids.lab = (await post('keeper', `${inv}/stores`, { name: 'Chemistry lab store', kind: 'lab', departmentId: ids.dept }).expect(201)).body.id;
    ids.mess = (await post('keeper', `${inv}/stores`, { name: 'Hostel mess store', kind: 'mess' }).expect(201)).body.id;
  });

  it('takes an indent through the head and the principal, compares GST quotations as L1, L2, L3 and orders the L1 with IGST', async () => {
    const req = (await post('teacher', `${inv}/requisitions`, { reason: 'Practical record sheets', departmentId: ids.dept, lines: [{ itemId: ids.paper, qty: 64, estUnitPaise: 250_00 }] }).expect(201)).body;
    expect(req).toMatchObject({ step: 'hod', estimatedPaise: 16_000_00, budgetStatus: 'within' });
    await post('principal', `${inv}/requisitions/${req.id}/decision`, { approve: true }).expect(200); // a principal may decide for the head
    const again = (await post('teacher', `${inv}/requisitions`, { reason: 'Second', departmentId: ids.dept, lines: [{ itemId: ids.paper, qty: 1, estUnitPaise: 250_00 }] }).expect(201)).body;
    await post('teacher', `${inv}/requisitions/${again.id}/decision`, { approve: true }).expect(403);
    expect((await post('principal', `${inv}/requisitions/${req.id}/decision`, { approve: true }).expect(200)).body.status).toBe('approved');
    // The requester is told.
    const told = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, t.teacher.id), eq(s.notifications.dedupeKey, `inv-indent-decided:${req.id}`)));
    expect(told[0]?.title).toMatch(/approved/);

    const rfq = (await post('keeper', `${inv}/rfqs`, { requisitionId: req.id }).expect(201)).body;
    // 64 reams. A (Karnataka) ₹250 + 18% = 16,000 + 2,880 = 18,880. B (Maharashtra) ₹245 + 18% IGST = 15,680 + 2,822.40 = 18,502.40. C (unregistered) ₹255, 0% = 16,320.
    await post('keeper', `${inv}/rfqs/${rfq.id}/quotes`, { vendorId: ids.vA, lines: [{ itemId: ids.paper, unitPricePaise: 250_00 }] }).expect(201);
    await post('keeper', `${inv}/rfqs/${rfq.id}/quotes`, { vendorId: ids.vB, lines: [{ itemId: ids.paper, unitPricePaise: 245_00 }] }).expect(201);
    await post('keeper', `${inv}/rfqs/${rfq.id}/quotes`, { vendorId: ids.vC, lines: [{ itemId: ids.paper, unitPricePaise: 255_00, gstRatePct: 0 }] }).expect(201);
    const cmp = (await get('keeper', `${inv}/rfqs/${rfq.id}`).expect(200)).body;
    expect(cmp.quotes.map((q: { vendor: string; rank: string; totalPaise: number; taxPaise: number }) => [q.vendor, q.rank, q.totalPaise, q.taxPaise])).toEqual([
      ['Kaveri Supplies', 'L1', 16_320_00, 0],
      ['Mumbai Paper Mills', 'L2', 18_502_40, 2_822_40],
      ['Sri Lakshmi Stationers', 'L3', 18_880_00, 2_880_00],
    ]);
    // The committee awards to the GST-registered L2 by placing the order with it directly at its quoted price.
    const po = (await post('keeper', `${inv}/purchase-orders`, { requisitionId: req.id, vendorId: ids.vB, storeId: ids.central, purchaseMode: 'quotation', lines: [{ itemId: ids.paper, qty: 64, unitPricePaise: 245_00 }] }).expect(201)).body;
    expect(po).toMatchObject({ interState: true, taxablePaise: 15_680_00, taxPaise: 2_822_40, totalPaise: 18_502_40, status: 'issued' });
    ids.po = po.id;
  });

  it('receives with goods rejected at inspection, matches the invoice three ways and posts the journal and the payment voucher', async () => {
    const po = (await get('keeper', `${inv}/purchase-orders/${ids.po}`).expect(200)).body;
    const line = po.lines[0];
    const grn = (await post('keeper', `${inv}/purchase-orders/${ids.po}/receipts`, { idempotencyKey: 'grn-paper-1', challanNo: 'MPM/889', inspectionNote: 'Four reams wet in transit', lines: [{ poLineId: line.id, qty: 60, rejectedQty: 4, rejectReason: 'Water damaged' }] }).expect(201)).body;
    expect(grn.inspectedBy).toBeTruthy();
    // The landed cost carries the GST (no input credit): 245 + 44.10 = 289.10 a ream; 4 rejected = 1,156.40.
    expect(grn.debitNote.amountPaise).toBe(1_156_40);
    const stock = (await get('keeper', `${inv}/stock?storeId=${ids.central}`).expect(200)).body[0];
    expect(stock).toMatchObject({ qty: 60, valuePaise: 17_346_00 });

    // Received 60 × 245 = 14,700 + IGST 2,646 = 17,346.
    await post('accountant', `${inv}/purchase-orders/${ids.po}/invoices`, { invoiceNo: 'MPM/26/1201', amountPaise: 17_400_00, invoiceDate: '2026-11-02' }).expect(201).then((r) => expect(r.body.status).toBe('mismatch'));
    const invoice = (await post('accountant', `${inv}/purchase-orders/${ids.po}/invoices`, { invoiceNo: 'MPM/26/1202', amountPaise: 17_346_00, invoiceDate: '2026-11-02' }).expect(201)).body;
    // A micro enterprise with 60 agreed days is still paid within 45: 2 Nov + 45 = 17 Dec.
    expect(invoice).toMatchObject({ status: 'matched', taxablePaise: 14_700_00, igstPaise: 2_646_00, cgstPaise: 0, dueOn: '2026-12-17' });
    expect(await voucherLines(invoice.journalVoucherId)).toEqual({ '1300': [17_346_00, 0], '2000': [0, 17_346_00] });
    const dues = (await get('accountant', `${inv}/reports/msme-dues`).expect(200)).body;
    expect(dues.lines.map((l: { invoiceNo: string }) => l.invoiceNo).sort()).toEqual(['MPM/26/1201', 'MPM/26/1202']);

    // Paid less the debit note: 17,346 − 1,156.40 = 16,189.60.
    const paid = (await post('accountant', `/v1/inventory/invoices/${invoice.id}/paid`, { paymentMode: 'neft', paymentRef: 'UTR998' }).expect(200)).body;
    expect(paid).toMatchObject({ status: 'paid', netPaise: 16_189_60, debitPaise: 1_156_40 });
    expect(await voucherLines(paid.paymentVoucherId)).toEqual({ '2000': [17_346_00, 0], '1010': [0, 16_189_60], '1300': [0, 1_156_40] });
    await post('accountant', `/v1/inventory/invoices/${invoice.id}/paid`, {}).expect(409); // never twice

    const reg = (await get('accountant', `${inv}/reports/purchase-register?from=2026-11-01&to=2026-11-30`).expect(200)).body;
    expect(reg.totals).toMatchObject({ igstPaise: 2_646_00 + reg.lines[0].igstPaise, cgstPaise: 0 });
    expect(reg.hsn).toEqual([{ hsn: '4802', gstRatePct: 18, qty: 60, taxablePaise: 14_700_00, taxPaise: 2_646_00 }]);
  });

  it('values issues at the weighted average, carries the value on a transfer and tells the store at the reorder level', async () => {
    // 40 more at ₹300: 100 reams worth 17,346 + 12,000 = 29,346.
    await post('keeper', `${inv}/stock/in`, { storeId: ids.central, itemId: ids.paper, qty: 40, unitCostPaise: 300_00, note: 'Donated by the alumni' }).expect(201);
    // 30 issued: 29,346 × 30 / 100 = 8,803.80. 100 → 70 passes the reorder level of 75.
    const slip = (await post('keeper', `${inv}/issue-slips`, { storeId: ids.central, departmentId: ids.dept, issuedTo: 'Chemistry department', receivedBy: 'Lab assistant', lines: [{ itemId: ids.paper, qty: 30 }] }).expect(201)).body;
    expect(slip).toMatchObject({ number: 'ISS-0001', valuePaise: 8_803_80 });
    // Left: 70 worth 20,542.20; 10 to the mess = 2,934.60.
    await post('keeper', `${inv}/stock/transfers`, { fromStoreId: ids.central, toStoreId: ids.mess, itemId: ids.paper, qty: 10 }).expect(201);
    const mess = (await get('keeper', `${inv}/stock?storeId=${ids.mess}`).expect(200)).body[0];
    expect(mess).toMatchObject({ qty: 10, valuePaise: 2_934_60 });
    await app.get(EventBus).drain();
    const alert = await db.select().from(s.notifications).where(eq(s.notifications.userId, ids.keeperUser));
    expect(alert.filter((n) => n.title.includes('reorder level'))).toHaveLength(1);

    const ledger = (await get('keeper', `${inv}/reports/ledger?itemId=${ids.paper}&storeId=${ids.central}`).expect(200)).body;
    expect(ledger.closing).toEqual({ qty: 60, valuePaise: 17_607_60 });
    expect(ledger.moves.map((m: { kind: string }) => m.kind)).toEqual(['grn', 'in', 'issue', 'transfer_out']);
    const summary = (await get('accountant', `${inv}/reports/stock-summary`).expect(200)).body;
    expect(summary.totalPaise).toBe(17_607_60 + 2_934_60);
  });

  it('issues batches earliest-expiry first at FIFO cost, refuses expired stock and writes it off with approval', async () => {
    await post('keeper', `${inv}/stock/in`, { storeId: ids.lab, itemId: ids.acid, qty: 10, unitCostPaise: 100_00 }).expect(400); // needs the batch
    await post('keeper', `${inv}/stock/in`, { storeId: ids.lab, itemId: ids.acid, qty: 10, unitCostPaise: 100_00, batchNo: 'A-26', expiryOn: '2027-05-31' }).expect(201);
    await post('keeper', `${inv}/stock/in`, { storeId: ids.lab, itemId: ids.acid, qty: 5, unitCostPaise: 130_00, batchNo: 'B-26', expiryOn: '2027-01-02' }).expect(201);
    await post('keeper', `${inv}/stock/in`, { storeId: ids.lab, itemId: ids.acid, qty: 4, unitCostPaise: 90_00, batchNo: 'C-25', expiryOn: '2026-10-31' }).expect(201);
    // 8 bottles: B-26 (Jan 2027) 5 × 130, then A-26 3 × 100 = 950; C-25 has expired and is skipped.
    const slip = (await post('keeper', `${inv}/issue-slips`, { storeId: ids.lab, departmentId: ids.dept, issuedTo: 'BSc practicals', lines: [{ itemId: ids.acid, qty: 8 }] }).expect(201)).body;
    expect(slip.valuePaise).toBe(950_00);
    expect(slip.lines[0].batches).toBe('B-26 × 5, A-26 × 3');
    // 7 good bottles are left; the 4 expired ones cannot be issued.
    expect((await post('keeper', `${inv}/stock/issue`, { storeId: ids.lab, itemId: ids.acid, qty: 8, issuedTo: 'BSc practicals' }).expect(409)).body).toMatchObject({ code: 'STOCK_SHORT', available: 7, expired: 4 });
    const expiring = (await get('keeper', `${inv}/batches?storeId=${ids.lab}&expiring=90`).expect(200)).body;
    expect(expiring.map((b: { batchNo: string; state: string; qtyLeft: number }) => [b.batchNo, b.state, b.qtyLeft])).toEqual([['C-25', 'expired', 4]]);

    // The store may not write off on its own while approval is on.
    expect((await post('keeper', `${inv}/stock/out`, { storeId: ids.lab, itemId: ids.acid, qty: 4, note: 'Expired', fromBatch: 'C-25' }).expect(409)).body.code).toBe('WRITE_OFF_NEEDS_APPROVAL');
    await post('keeper', `${inv}/write-offs`, { storeId: ids.lab, itemId: ids.acid, qty: 4, kind: 'expired', reason: 'Past expiry' }).expect(400); // which batch?
    const wo = (await post('keeper', `${inv}/write-offs`, { storeId: ids.lab, itemId: ids.acid, qty: 4, batchNo: 'C-25', kind: 'expired', reason: 'Past expiry on 31 Oct', disposalMode: 'destroy' }).expect(201)).body;
    expect(wo.status).toBe('proposed');
    await post('keeper', `${inv}/write-offs/${wo.id}/decision`, { approve: true }).expect(403);
    await post('principal', `${inv}/write-offs/${wo.id}/decision`, { approve: false }).expect(400); // a rejection needs a reason
    // 4 × 90 = 360 leaves the store.
    expect((await post('principal', `${inv}/write-offs/${wo.id}/decision`, { approve: true }).expect(200)).body).toMatchObject({ status: 'approved', valuePaise: 360_00 });
    const lab = (await get('keeper', `${inv}/stock?storeId=${ids.lab}`).expect(200)).body[0];
    // 7 left: A-26 7 × 100 = 700.
    expect(lab).toMatchObject({ qty: 7, valuePaise: 700_00 });
    const ageing = (await get('keeper', `${inv}/reports/ageing?storeId=${ids.lab}`).expect(200)).body;
    expect(ageing.lines[0].buckets['0-30']).toEqual({ qty: 7, valuePaise: 700_00 });
    expect((await get('keeper', `${inv}/reports/dead-stock?days=30`).expect(200)).body.lines).toEqual([]);
    // The month is not over: it can be previewed, not posted.
    const month = (await get('accountant', `${inv}/books/month?month=2026-11`).expect(200)).body;
    expect(month.lossesPaise).toBe(360_00);
    await post('accountant', `${inv}/books/month`, { month: '2026-11' }).expect(409);
  });

  it('registers durables received on an order as lab assets and capitalises the invoice', async () => {
    const req = (await post('hod', `${inv}/requisitions`, { reason: 'Microscopes for the BSc lab', departmentId: ids.dept, lines: [{ itemId: ids.scope, qty: 2, estUnitPaise: 9_000_00 }] }).expect(201)).body;
    await post('principal', `${inv}/requisitions/${req.id}/decision`, { approve: true }).expect(200);
    // 2 × 9,000 + 18% CGST and SGST = 18,000 + 3,240 = 21,240 (below the ₹25,000 direct purchase limit).
    const po = (await post('keeper', `${inv}/purchase-orders`, { requisitionId: req.id, vendorId: ids.vA, storeId: ids.lab, lines: [{ itemId: ids.scope, qty: 2, unitPricePaise: 9_000_00 }] }).expect(201)).body;
    expect(po).toMatchObject({ interState: false, taxPaise: 3_240_00, totalPaise: 21_240_00 });
    const line = (await get('keeper', `${inv}/purchase-orders/${po.id}`).expect(200)).body.lines[0];
    const grn = (await post('keeper', `${inv}/purchase-orders/${po.id}/receipts`, { idempotencyKey: 'grn-scope-1', lines: [{ poLineId: line.id, qty: 2 }] }).expect(201)).body;
    expect(grn.assetsRegistered).toHaveLength(2);
    expect((await post('keeper', `${inv}/purchase-orders/${po.id}/receipts`, { idempotencyKey: 'grn-scope-1', lines: [{ poLineId: line.id, qty: 2 }] }).expect(201)).body.repeated).toBe(true);
    expect((await get('keeper', `${inv}/stock?storeId=${ids.lab}`).expect(200)).body.some((x: { itemId: string }) => x.itemId === ids.scope)).toBe(false);
    const scopes = await db.select().from(s.assets).where(eq(s.assets.poId, po.id));
    // Each at 9,000 + 1,620 GST, in the lab register, depreciating from today.
    expect(scopes.map((a) => [a.costPaise, a.labEquipment, a.putToUseOn, a.itBlock])).toEqual([[10_620_00, true, today, 'plant'], [10_620_00, true, today, 'plant']]);
    const invoice = (await post('accountant', `${inv}/purchase-orders/${po.id}/invoices`, { invoiceNo: 'SLS/77', amountPaise: 21_240_00 }).expect(201)).body;
    expect(invoice).toMatchObject({ cgstPaise: 1_620_00, sgstPaise: 1_620_00 });
    expect(await voucherLines(invoice.journalVoucherId)).toEqual({ '1200': [21_240_00, 0], '2000': [0, 21_240_00] });

    const labs = (await get('iqac', '/v1/assets/reports/labs').expect(200)).body;
    expect(labs.totals).toMatchObject({ equipment: 2, costPaise: 21_240_00 });
  });

  it('depreciates under the Companies Act pro-rata, reports the Income-tax Act block and NAAC 4.1 and 4.4', async () => {
    // ₹1,00,000 lab equipment, residual 5,000, 5 years, put to use 1 Oct 2025: 19,000 × 182 / 365 = 9,473.97 in 2025-26.
    const a = (await post('keeper', '/v1/assets', { name: 'UV-Vis spectrophotometer', category: 'Lab equipment', purchasedOn: '2025-09-20', putToUseOn: '2025-10-01', costPaise: 1_00_000_00, salvagePaise: 5_000_00, usefulLifeYears: 5, labEquipment: true }).expect(201)).body;
    const posted = (await post('accountant', '/v1/assets/gl/depreciation', { fiscalYear: '2025-26' }).expect(200)).body;
    expect(posted).toMatchObject({ posted: 1, totalPaise: 9_473_97 });
    expect(await voucherLines(posted.voucherId)).toEqual({ '5300': [9_473_97, 0], '1210': [0, 9_473_97] });
    await db.insert(s.assetMaintenance).values({ tenantId: t.tenantId, assetId: a.id, kind: 'service', description: 'Lamp replaced', costPaise: 6_500_00, doneOn: '2026-06-10', createdBy: ids.keeperUser });

    const dep = (await get('accountant', '/v1/assets/reports/depreciation?fy=2025-26').expect(200)).body;
    expect(dep.companiesAct.assets).toEqual([expect.objectContaining({ tag: a.tag, days: 182, additionPaise: 1_00_000_00, depreciationPaise: 9_473_97, closingPaise: 90_526_03 })]);
    // Income-tax Act: plant at 15%, used 182 days (180 or more) in its first year: 15,000.
    expect(dep.incomeTaxAct.blocks).toEqual([expect.objectContaining({ block: 'plant', additionsFullPaise: 1_00_000_00, depreciationPaise: 15_000_00, closingPaise: 85_000_00 })]);

    const naac = (await get('iqac', '/v1/assets/reports/naac?fy=2026-27').expect(200)).body;
    expect(naac.years.map((y: { fiscalYear: string }) => y.fiscalYear)).toEqual(['2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
    const y25 = naac.years[3];
    const y26 = naac.years[4];
    expect(y25).toMatchObject({ augmentationPaise: 1_00_000_00, augmentationHeads: [{ head: 'Laboratory equipment', paise: 1_00_000_00 }] });
    // 2026-27: the two microscopes; the lamp service is academic maintenance.
    expect(y26).toMatchObject({ augmentationPaise: 21_240_00, maintenanceAcademicPaise: 6_500_00 });
  });

  it('keeps every endpoint to its roles and to its own institution', async () => {
    for (const url of [`${inv}/reports/stock-summary`, `${inv}/reports/purchase-register`, `${inv}/reports/ageing`, `${inv}/write-offs`, `${inv}/batches`, '/v1/assets/reports/depreciation', `${inv}/issue-slips`]) await get('teacher', url).expect(403);
    await get('hod', '/v1/assets/reports/naac').expect(200);
    await get('hod', `${inv}/reports/purchase-register`).expect(403);
    await post('accountant', `${inv}/write-offs`, { storeId: ids.lab, itemId: ids.acid, qty: 1, kind: 'damaged', reason: 'Broken' }).expect(403);
    await post('teacher', `${inv}/issue-slips`, { storeId: ids.lab, issuedTo: 'Me', lines: [{ itemId: ids.acid, qty: 1 }] }).expect(403);
    await post('keeper', `${inv}/issue-slips`, { storeId: ids.lab, issuedTo: 'Me', lines: [{ itemId: ids.acid, qty: 0 }] }).expect(400);
    await post('accountant', `${inv}/books/month`, { month: '2026-13' }).expect(400);
    // Another institution sees none of it.
    await get('outsider', `${inv}/purchase-orders/${ids.po}`).expect(404);
    expect((await get('outsider', `${inv}/reports/stock-summary`).expect(200)).body.lines).toEqual([]);
    expect((await get('outsider', `${inv}/issue-slips`).expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/records/inv-write-offs').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/assets/reports/labs').expect(200)).body.labs).toEqual([]);
  });
});
