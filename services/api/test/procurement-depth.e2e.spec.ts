import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { fiscalYearOf } from '../src/inventory/procurement.logic.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * Stores, procurement, assets and facilities depth: the record kit on every list, indents through the head of
 * department and the principal against the budget, purchase modes and approved vendors, order approval and
 * amendment, rejected goods and debit notes, payment vouchers, stock verification, the gate register, asset transfer
 * and condemnation, conflict-checked facility bookings and maintenance tickets with deadlines.
 */
describe('procurement, stores, assets and facilities depth', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date());
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const today = new Date().toISOString().slice(0, 10);
  const monday = nextMondayIst('09:00').toISOString().slice(0, 10);

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}-${Math.random().toString(36).slice(2, 6)}@inv.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role, campusId: t.campus.id });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    const keeper = await addUser('Store Keeper', 'store_keeper');
    const hod = await addUser('Science Head', 'hod');
    const accountant = await addUser('Accounts Officer', 'accountant');
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Science', headUserId: hod.id }).returning();
    ids.dept = dept.id;
    tokens.keeper = await login(t.slug, keeper.email!);
    tokens.hod = await login(t.slug, hod.email!);
    tokens.accountant = await login(t.slug, accountant.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps items, stores, categories and vendors on the record kit', async () => {
    ids.cat = (await post('keeper', '/v1/records/inv-categories', { name: 'Stationery', description: 'Paper, pens and files' }).expect(201)).body.id;
    await post('keeper', '/v1/records/inv-items', { sku: 'STN-1', name: 'A4 paper', category: 'Stationery', unit: 'bag' }).expect(400);
    const item = (await post('keeper', '/v1/records/inv-items', { sku: 'STN-1', name: 'A4 paper', category: 'Stationery', unit: 'ream', reorderLevel: 5, reorderQty: 20 }).expect(201)).body;
    ids.item = item.id;
    expect(item).toMatchObject({ onHand: 0, low: true, category: 'Stationery' });
    ids.store = (await post('keeper', '/v1/records/inv-stores', { name: 'Central store', kind: 'central' }).expect(201)).body.id;
    ids.lab = (await post('keeper', '/v1/records/inv-stores', { name: 'Physics lab store', kind: 'lab', departmentId: ids.dept }).expect(201)).body.id;
    await post('keeper', '/v1/records/inv-vendors', { name: 'Bad GSTIN', gstin: '1234' }).expect(400);
    ids.v1 = (await post('keeper', '/v1/records/inv-vendors', { name: 'Lakshmi Stationers', gstin: '29ABCDE1234F1Z5', contactPerson: 'Ravi', phone: '+919845012345' }).expect(201)).body.id;
    ids.v2 = (await post('keeper', '/v1/records/inv-vendors', { name: 'Cheap Paper Co' }).expect(201)).body.id;
    await put('keeper', `/v1/inventory/categories/${ids.cat}/vendors`, { vendorIds: [ids.v1] }).expect(200);
    expect((await get('keeper', '/v1/records/inv-categories').expect(200)).body.rows[0]).toMatchObject({ name: 'Stationery', items: 1, vendors: 1, vendorNames: 'Lakshmi Stationers' });

    // Search, filter and paging on the server; a teacher and another institution see nothing.
    expect((await get('keeper', '/v1/records/inv-items?f.stock=low').expect(200)).body.total).toBe(1);
    expect((await get('keeper', '/v1/records/inv-stores?f.kind=lab').expect(200)).body.rows[0]).toMatchObject({ name: 'Physics lab store', departmentName: 'Science' });
    await get('teacher', '/v1/records/inv-items').expect(403);
    expect((await get('outsider', '/v1/records/inv-items').expect(200)).body.total).toBe(0);

    // Duplicate gets a free code; import checks every row and commits the good ones.
    expect((await post('keeper', `/v1/records/inv-items/${ids.item}/duplicate`).expect(201)).body).toMatchObject({ sku: 'STN-1-COPY' });
    const csv = 'SKU,Item,Category,Unit,Reorder level\r\nSTN-2,Ball pens,Stationery,box,4\r\nSTN-3,,Stationery,box,1\r\nLAB-1,Beakers 250 ml,Lab glassware,nos,10\r\n';
    const check = (await http().post('/v1/records/inv-items/import').set(as('keeper')).attach('file', Buffer.from(csv), 'items.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ rows: 3, error: 1 });
    expect((await post('keeper', `/v1/records/inv-items/import/${check.id}/commit`, { skipErrors: true }).expect(200)).body.totals).toMatchObject({ created: 2 });
    expect((await get('keeper', '/v1/records/inv-categories?q=glassware').expect(200)).body.total).toBe(1);
    const exported = await get('keeper', '/v1/records/inv-items/export?format=csv&sort=sku:asc').expect(200);
    expect(exported.text).toContain('Beakers 250 ml');

    // Stock comes in; an item with stock movements cannot be deleted.
    await post('keeper', '/v1/inventory/stock/in', { storeId: ids.store, itemId: ids.item, qty: 30 }).expect(201);
    expect((await http().delete(`/v1/records/inv-items/${ids.item}`).set(as('keeper')).expect(409)).body).toMatchObject({ code: 'RECORD_IN_USE' });
    // History records each change field by field.
    await patch('keeper', `/v1/records/inv-items/${ids.item}`, { reorderLevel: 8 }).expect(200);
    const h = (await get('keeper', `/v1/records/inv-items/${ids.item}/history`).expect(200)).body.items[0];
    expect(h).toMatchObject({ action: 'inv_item.updated', changes: [{ field: 'reorderLevel', before: 5, after: 8 }] });
  });

  it('runs an indent through the head of department and the principal, against the budget', async () => {
    const fy = fiscalYearOf(today);
    await put('principal', '/v1/finance/budgets', { departmentId: ids.dept, fiscalYear: fy, amountPaise: 1000_00, note: '' }).expect(200);
    const r = (await post('teacher', '/v1/inventory/requisitions', { reason: 'Practical records', departmentId: ids.dept, lines: [{ itemId: ids.item, qty: 20, estUnitPaise: 100_00 }] }).expect(201)).body;
    ids.req = r.id;
    expect(r).toMatchObject({ step: 'hod', estimatedPaise: 2000_00, budgetStatus: 'exceeded', status: 'submitted' });
    await post('teacher2', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true }).expect(403);
    expect((await post('hod', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true }).expect(200)).body).toMatchObject({ status: 'submitted', step: 'principal' });
    await post('hod', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true }).expect(403);
    expect((await post('principal', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true }).expect(409)).body).toMatchObject({ code: 'BUDGET_EXCEEDED', availablePaise: 1000_00 });
    await post('principal', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true, budgetOverride: true }).expect(400);
    expect((await post('principal', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true, budgetOverride: true, note: 'Exam season need; revised budget pending' }).expect(200)).body).toMatchObject({ status: 'approved', budgetStatus: 'override', step: null });
    const detail = (await get('teacher', `/v1/inventory/requisitions/${r.id}`).expect(200)).body;
    expect(detail.approvals.map((a: { step: string; budgetOverride: boolean }) => [a.step, a.budgetOverride])).toEqual([['hod', false], ['principal', true]]);
    expect(detail).toMatchObject({ department: 'Science', canDecide: false, budget: { budgetPaise: 1000_00 } });
    // The list: the teacher sees their own indent, a colleague none, the HOD their department's.
    expect((await get('teacher', '/v1/records/inv-requisitions').expect(200)).body.total).toBe(1);
    expect((await get('teacher2', '/v1/records/inv-requisitions').expect(200)).body.total).toBe(0);
    expect((await get('hod', '/v1/records/inv-requisitions?f.status=approved').expect(200)).body.rows[0]).toMatchObject({ number: r.number, budgetStatus: 'override' });
  });

  it('orders through approved vendors, waits for approval, and receives with rejections and a debit note', async () => {
    await put('principal', '/v1/module-settings/procurement', { rules: { approvalAbovePaise: 1000_00 } }).expect(200);
    const po = { requisitionId: ids.req, storeId: ids.store, lines: [{ itemId: ids.item, qty: 20, unitPricePaise: 100_00 }] };
    expect((await post('keeper', '/v1/inventory/purchase-orders', { ...po, vendorId: ids.v2 }).expect(409)).body).toMatchObject({ code: 'VENDOR_NOT_APPROVED' });
    expect((await post('keeper', '/v1/inventory/purchase-orders', { ...po, vendorId: ids.v1, purchaseMode: 'gem' }).expect(409)).body.message).toBe('Give the GeM order or bid reference');
    const made = (await post('keeper', '/v1/inventory/purchase-orders', { ...po, vendorId: ids.v1, deliveryBy: monday }).expect(201)).body;
    ids.po = made.id;
    expect(made).toMatchObject({ status: 'pending_approval', approvalStatus: 'pending', purchaseMode: 'direct', departmentId: ids.dept });
    const lineId = (await get('keeper', `/v1/inventory/purchase-orders/${ids.po}`).expect(200)).body.lines[0].id;
    await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/receipts`, { idempotencyKey: 'grn-depth-01', lines: [{ poLineId: lineId, qty: 5 }] }).expect(409);
    await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/decision`, { approve: true }).expect(403);
    expect((await post('principal', `/v1/inventory/purchase-orders/${ids.po}/decision`, { approve: true }).expect(200)).body).toMatchObject({ status: 'issued', approvalStatus: 'approved' });

    // 20 arrive; 5 are refused at inspection: 15 go into stock and the 5 are debited to the vendor.
    await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/receipts`, { idempotencyKey: 'grn-depth-02', lines: [{ poLineId: lineId, qty: 15, rejectedQty: 5 }] }).expect(400);
    const grn = (await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/receipts`, { idempotencyKey: 'grn-depth-03', challanNo: 'DC-778', lines: [{ poLineId: lineId, qty: 15, rejectedQty: 5, rejectReason: 'Damp, wrinkled' }] }).expect(201)).body;
    expect(grn).toMatchObject({ number: 'GRN-0001', debitNote: { number: 'DN-0001', amountPaise: 500_00, status: 'open' } });
    expect((await get('keeper', `/v1/inventory/purchase-orders/${ids.po}`).expect(200)).body).toMatchObject({ status: 'partially_received', debitNotes: [{ number: 'DN-0001' }] });

    // The invoice matches what was received; paying sets off the open debit note under a voucher.
    const inv = (await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/invoices`, { invoiceNo: 'LS-2201', amountPaise: 1500_00, invoiceDate: today }).expect(201)).body;
    expect(inv.status).toBe('matched');
    const paid = (await post('accountant', `/v1/inventory/invoices/${inv.id}/paid`, { paymentMode: 'neft', paymentRef: 'UTR998877' }).expect(200)).body;
    expect(paid).toMatchObject({ status: 'paid', voucherNo: 'PV-0001', debitPaise: 500_00, netPaise: 1000_00, paymentMode: 'neft' });
    expect((await get('accountant', '/v1/inventory/debit-notes?status=adjusted').expect(200)).body).toHaveLength(1);

    // An amendment after approval goes back for approval; rejecting it restores the order.
    await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/amend`, { reason: 'Cut to what came', lines: [{ poLineId: lineId, itemId: ids.item, qty: 10, unitPricePaise: 100_00 }] }).expect(400);
    const amended = (await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/amend`, { reason: 'Close at the 15 delivered', lines: [{ poLineId: lineId, itemId: ids.item, qty: 15, unitPricePaise: 100_00 }] }).expect(200)).body;
    expect(amended).toMatchObject({ status: 'pending_approval', approvalStatus: 'pending', amendmentNo: 1, totalPaise: 1500_00 });
    await post('principal', `/v1/inventory/purchase-orders/${ids.po}/decision`, { approve: false }).expect(400);
    expect((await post('principal', `/v1/inventory/purchase-orders/${ids.po}/decision`, { approve: false, note: 'Vendor promised the balance' }).expect(200)).body).toMatchObject({ status: 'partially_received', amendmentNo: 0, totalPaise: 2000_00 });
    await post('keeper', `/v1/inventory/purchase-orders/${ids.po}/amend`, { reason: 'Vendor cannot supply the balance', lines: [{ poLineId: lineId, itemId: ids.item, qty: 15, unitPricePaise: 100_00 }] }).expect(200);
    expect((await post('principal', `/v1/inventory/purchase-orders/${ids.po}/decision`, { approve: true, note: 'Agreed' }).expect(200)).body).toMatchObject({ status: 'received', amendmentNo: 1 });
    await put('keeper', `/v1/inventory/purchase-orders/${ids.po}/committee`, { minutes: 'Committee approved the vendor at the quoted rate.', metOn: today, members: 'Principal; Bursar; HOD Science' }).expect(200);
    const full = (await get('accountant', `/v1/inventory/purchase-orders/${ids.po}`).expect(200)).body;
    expect(full).toMatchObject({ committeeMembers: 'Principal; Bursar; HOD Science', amendments: [{ amendmentNo: 1, reason: 'Vendor cannot supply the balance' }] });
    expect(full.approvals.map((a: { decision: string }) => a.decision)).toEqual(['approved', 'rejected', 'approved']);
    // The order list on the kit, with its mode and status.
    expect((await get('accountant', '/v1/records/inv-purchase-orders?f.status=received').expect(200)).body.rows[0]).toMatchObject({ number: made.number, vendorName: 'Lakshmi Stationers', amendmentNo: 1, committee: true });
  });

  it('rates, contracts and blacklists vendors, and holds direct purchases to the limit', async () => {
    await post('keeper', `/v1/inventory/vendors/${ids.v1}/ratings`, { poId: ids.po, quality: 5, delivery: 4, price: 4 }).expect(201);
    expect((await get('keeper', `/v1/inventory/vendors/${ids.v1}`).expect(200)).body).toMatchObject({ score: 4.3, categories: [{ name: 'Stationery' }] });
    const rc = (await post('keeper', '/v1/records/inv-rate-contracts', { vendorId: ids.v1, itemId: ids.item, ratePaise: '90', validFrom: today, validTo: '2099-03-31', reference: 'RC/2026/3' }).expect(201)).body;
    expect(rc).toMatchObject({ rate: 90, inForce: true });
    expect((await get('keeper', `/v1/inventory/rate-contracts/current?itemId=${ids.item}`).expect(200)).body).toEqual([expect.objectContaining({ vendor: 'Lakshmi Stationers', ratePaise: 90_00 })]);

    const raise = async (qty: number) => {
      const r = (await post('keeper', '/v1/inventory/requisitions', { reason: 'Stock', lines: [{ itemId: ids.item, qty }] }).expect(201)).body;
      await post('principal', `/v1/inventory/requisitions/${r.id}/decision`, { approve: true }).expect(200);
      return r.id as string;
    };
    const req = await raise(5);
    // The estimate came from the rate contract.
    expect((await get('keeper', `/v1/inventory/requisitions/${req}`).expect(200)).body.estimatedPaise).toBe(450_00);
    await post('keeper', '/v1/inventory/purchase-orders', { requisitionId: req, vendorId: ids.v1, storeId: ids.store, purchaseMode: 'rate_contract', lines: [{ itemId: ids.item, qty: 5, unitPricePaise: 95_00 }] }).expect(400);
    expect((await post('keeper', '/v1/inventory/purchase-orders', { requisitionId: req, vendorId: ids.v1, storeId: ids.store, purchaseMode: 'rate_contract', lines: [{ itemId: ids.item, qty: 5, unitPricePaise: 90_00 }] }).expect(201)).body).toMatchObject({ purchaseMode: 'rate_contract', status: 'issued' });

    const big = await raise(300);
    expect((await post('keeper', '/v1/inventory/purchase-orders', { requisitionId: big, vendorId: ids.v1, storeId: ids.store, lines: [{ itemId: ids.item, qty: 300, unitPricePaise: 100_00 }] }).expect(409)).body).toMatchObject({ code: 'PURCHASE_MODE' });

    await post('keeper', `/v1/inventory/vendors/${ids.v2}/blacklist`, { reason: 'Short supply twice' }).expect(403);
    await post('principal', `/v1/inventory/vendors/${ids.v2}/blacklist`, { reason: 'Short supply twice' }).expect(200);
    await put('keeper', `/v1/inventory/categories/${ids.cat}/vendors`, { vendorIds: [] }).expect(200);
    expect((await post('keeper', '/v1/inventory/purchase-orders', { requisitionId: big, vendorId: ids.v2, storeId: ids.store, purchaseMode: 'gem', gemRef: 'GEMC-1', lines: [{ itemId: ids.item, qty: 300, unitPricePaise: 100_00 }] }).expect(409)).body).toMatchObject({ code: 'VENDOR_BLACKLISTED' });
    expect((await get('keeper', '/v1/records/inv-vendors?f.state=blacklisted').expect(200)).body.total).toBe(1);
    const lift = (await post('principal', '/v1/records/inv-vendors/bulk', { op: 'action', action: 'reinstate', target: { ids: [ids.v2] } }).expect(200)).body;
    expect(lift).toMatchObject({ succeeded: 1 });
  });

  it('verifies a store against its book stock and adjusts the difference', async () => {
    const v = (await post('keeper', '/v1/inventory/verifications', { storeId: ids.store, note: 'Annual stock verification' }).expect(201)).body;
    await post('keeper', '/v1/inventory/verifications', { storeId: ids.store }).expect(409);
    const detail = (await get('keeper', `/v1/inventory/verifications/${v.id}`).expect(200)).body;
    const line = detail.lines.find((l: { itemId: string }) => l.itemId === ids.item);
    await post('keeper', `/v1/inventory/verifications/${v.id}/close`, { adjust: false }).expect(409); // not counted
    await put('keeper', `/v1/inventory/verifications/${v.id}/counts`, { counts: detail.lines.map((l: { itemId: string; bookQty: number }) => ({ itemId: l.itemId, countedQty: l.itemId === ids.item ? l.bookQty - 2 : l.bookQty, remark: l.itemId === ids.item ? 'Two reams spoilt' : '' })) }).expect(200);
    expect((await get('keeper', `/v1/inventory/verifications/${v.id}`).expect(200)).body.summary).toMatchObject({ short: 1, excess: 0 });
    await post('keeper', `/v1/inventory/verifications/${v.id}/close`, { adjust: true }).expect(400);
    expect((await post('principal', `/v1/inventory/verifications/${v.id}/close`, { adjust: true }).expect(200)).body).toMatchObject({ status: 'closed', adjusted: 1 });
    const stock = (await get('keeper', `/v1/inventory/stock?storeId=${ids.store}`).expect(200)).body.find((x: { itemId: string }) => x.itemId === ids.item);
    expect(stock.qty).toBe(line.bookQty - 2);
    expect((await get('keeper', '/v1/records/inv-verifications?f.status=closed').expect(200)).body.rows[0]).toMatchObject({ variance: 1 });
  });

  it('keeps the gate register, with returnable items followed until they come back', async () => {
    await post('keeper', '/v1/records/inv-gate-entries', { direction: 'out', kind: 'returnable', party: 'Sai Electronics', description: 'Projector for repair', qty: 1 }).expect(400);
    const g = (await post('keeper', '/v1/records/inv-gate-entries', { direction: 'out', kind: 'returnable', party: 'Sai Electronics', description: 'Projector for repair', qty: 1, expectedReturnOn: today, vehicleNo: 'KA01AB1234' }).expect(201)).body;
    expect(g).toMatchObject({ number: 'GE-0001', status: 'open' });
    const inward = (await post('keeper', '/v1/records/inv-gate-entries', { direction: 'in', kind: 'goods', party: 'Lakshmi Stationers', description: 'Paper delivery', qty: 20, poId: ids.po, documentNo: 'DC-778' }).expect(201)).body;
    expect(inward).toMatchObject({ status: 'closed', poNumber: expect.any(String) });
    expect((await post('keeper', '/v1/records/inv-gate-entries/bulk', { op: 'action', action: 'markReturned', target: { ids: [g.id, inward.id] } }).expect(200)).body).toMatchObject({ succeeded: 1, failed: 1 });
    expect((await get('keeper', `/v1/records/inv-gate-entries/${g.id}`).expect(200)).body).toMatchObject({ status: 'returned', returnedOn: today });
    // To the bin and back.
    const del = (await http().delete(`/v1/records/inv-gate-entries/${inward.id}`).set(as('keeper')).expect(200)).body;
    await post('keeper', `/v1/recycle-bin/${del.binId}/restore`).expect(200);
    expect((await get('keeper', `/v1/records/inv-gate-entries/${inward.id}`).expect(200)).body.description).toBe('Paper delivery');
  });

  it('registers, moves, condemns and writes off assets', async () => {
    const a = (await post('keeper', '/v1/records/assets', { name: 'Epson projector', category: 'AV equipment', purchasedOn: '2024-06-01', costPaise: '50000', salvagePaise: '2500', usefulLifeYears: 5, departmentId: ids.dept, vendorId: ids.v1, serialNo: 'EP-778', make: 'Epson' }).expect(201)).body;
    ids.asset = a.id;
    expect(a).toMatchObject({ tag: 'AST-0001', cost: 50000, departmentName: 'Science', vendorName: 'Lakshmi Stationers', status: 'active' });
    await post('keeper', `/v1/records/assets/${a.id}/move`, { to: t.room.id }).expect(400); // a reason is needed
    expect((await post('keeper', `/v1/records/assets/${a.id}/move`, { to: t.room.id, reason: 'Installed in Room 1' }).expect(200)).body).toMatchObject({ roomName: 'Room 1' });
    expect((await get('keeper', `/v1/assets/${a.id}`).expect(200)).body.transfers).toEqual([expect.objectContaining({ toRoomId: t.room.id, reason: 'Installed in Room 1' })]);

    const c = (await post('keeper', '/v1/records/asset-condemnations', { assetId: a.id, reason: 'Lamp and board burnt; repair costs more than a new one', condition: 'Not working' }).expect(201)).body;
    expect(c).toMatchObject({ status: 'proposed', assetTag: 'AST-0001' });
    await post('keeper', '/v1/records/asset-condemnations', { assetId: a.id, reason: 'Again' }).expect(409);
    await post('keeper', `/v1/assets/condemnations/${c.id}/write-off`, { disposalMode: 'scrap' }).expect(409);
    await post('keeper', `/v1/assets/condemnations/${c.id}/decision`, { approve: true }).expect(403);
    await post('principal', `/v1/assets/condemnations/${c.id}/decision`, { approve: true, note: 'Committee meeting 3' }).expect(200);
    expect((await post('keeper', `/v1/assets/condemnations/${c.id}/write-off`, { disposalMode: 'auction', realisedPaise: 1500_00 }).expect(200)).body).toMatchObject({ status: 'written_off', disposalMode: 'auction' });
    expect((await get('keeper', `/v1/records/assets/${a.id}`).expect(200)).body.status).toBe('disposed');
    expect((await http().delete(`/v1/records/assets/${a.id}`).set(as('keeper')).expect(403)).body.message).toMatch(/condemn and write it off/);
  });

  it('books halls without clashing with classes or other bookings, and approves them', async () => {
    await patch('principal', `/v1/records/rooms/${t.room.id}`, { bookable: true, capacity: 40, facilities: 'Projector' }).expect(200);
    await get('teacher', '/v1/records/rooms').expect(403);
    expect((await get('teacher', '/v1/facilities/rooms').expect(200)).body).toEqual([expect.objectContaining({ name: 'Room 1', bookable: true })]);
    const clash = (await post('teacher', '/v1/records/facility-bookings', { roomId: t.room.id, title: 'Guest lecture', onDate: monday, startsAt: '10:30', endsAt: '11:30' }).expect(409)).body;
    expect(clash).toMatchObject({ code: 'BOOKING_CONFLICT' });
    expect(clash.message).toMatch(/has a class then/);
    await post('teacher', '/v1/records/facility-bookings', { roomId: t.room.id, title: 'Too many', onDate: monday, startsAt: '12:00', endsAt: '13:00', attendees: 60 }).expect(400);
    const b = (await post('teacher', '/v1/records/facility-bookings', { roomId: t.room.id, title: 'Guest lecture', onDate: monday, startsAt: '12:00', endsAt: '13:00', attendees: 35 }).expect(201)).body;
    expect(b).toMatchObject({ status: 'pending', roomName: 'Room 1' });
    expect((await post('teacher2', '/v1/records/facility-bookings', { roomId: t.room.id, title: 'Club meet', onDate: monday, startsAt: '12:30', endsAt: '13:30' }).expect(409)).body.message).toMatch(/is booked then/);
    expect((await get('teacher2', '/v1/records/facility-bookings').expect(200)).body.total).toBe(0);
    expect((await post('teacher', '/v1/records/facility-bookings/bulk', { op: 'action', action: 'approve', target: { ids: [b.id] } }).expect(403)));
    expect((await post('principal', '/v1/records/facility-bookings/bulk', { op: 'action', action: 'approve', target: { ids: [b.id] } }).expect(200)).body).toMatchObject({ succeeded: 1 });
    const day = (await get('teacher', `/v1/facilities/rooms/${t.room.id}/day?date=${monday}`).expect(200)).body;
    expect(day.bookings.map((x: { status: string }) => x.status)).toEqual(['approved']);
    expect(day.classes).toHaveLength(1);
    await post('teacher', `/v1/facilities/bookings/${b.id}/cancel`, {}).expect(200);
    expect((await get('principal', `/v1/records/facility-bookings/${b.id}`).expect(200)).body.status).toBe('cancelled');
  });

  it('works maintenance tickets to their deadlines', async () => {
    const tk = (await post('teacher', '/v1/records/maintenance-tickets', { title: 'Fan not working', category: 'electrical', priority: 'urgent', roomId: t.room.id }).expect(201)).body;
    expect(tk).toMatchObject({ number: 'MT-0001', status: 'open', slaHours: 4, sla: 'on_track' });
    expect(new Date(tk.dueAt).getTime() - new Date(tk.createdAt).getTime()).toBe(4 * 3_600_000);
    await patch('teacher', `/v1/records/maintenance-tickets/${tk.id}`, { assigneeName: 'Me' }).expect(400);
    await post('teacher', `/v1/facilities/tickets/${tk.id}/status`, { status: 'assigned', assigneeName: 'Ramesh (electrician)' }).expect(403);
    await post('principal', `/v1/facilities/tickets/${tk.id}/status`, { status: 'assigned' }).expect(400);
    await post('principal', `/v1/facilities/tickets/${tk.id}/status`, { status: 'assigned', assigneeName: 'Ramesh (electrician)' }).expect(200);
    await post('principal', `/v1/facilities/tickets/${tk.id}/status`, { status: 'resolved' }).expect(400);
    expect((await post('principal', `/v1/facilities/tickets/${tk.id}/status`, { status: 'resolved', resolution: 'Capacitor replaced', costPaise: 350_00 }).expect(200)).body).toMatchObject({ status: 'resolved', resolution: 'Capacitor replaced' });
    expect((await post('teacher', `/v1/facilities/tickets/${tk.id}/feedback`, { rating: 4 }).expect(200)).body).toMatchObject({ status: 'closed', rating: 4 });
    expect((await get('principal', '/v1/facilities/tickets/summary').expect(200)).body).toMatchObject({ total: 1, open: 0, metPct: 100, avgRating: 4 });
    expect((await get('teacher2', '/v1/records/maintenance-tickets').expect(200)).body.total).toBe(0);
    const hist = (await get('principal', `/v1/facilities/tickets/${tk.id}`).expect(200)).body.history.map((h: { action: string }) => h.action);
    expect(hist).toEqual(expect.arrayContaining(['facilities.ticket_raised', 'facilities.ticket_assigned', 'facilities.ticket_resolved', 'facilities.ticket_closed']));
  });

  it('reports the registers and the NAAC infrastructure spend', async () => {
    const from = `${today.slice(0, 4)}-01-01`;
    const to = `${today.slice(0, 4)}-12-31`;
    const reg = (await get('principal', `/v1/ops-reports/procurement.register?from=${from}&to=${to}`).expect(200)).body.rows;
    expect(reg.find((r: { vendor: string; status: string }) => r.status === 'received')).toMatchObject({ vendor: 'Lakshmi Stationers', department: 'Science', paid: '1000.00' });
    const naac = (await get('principal', '/v1/ops-reports/assets.naacInfra?from=2024-04-01&to=2099-03-31').expect(200)).body.rows;
    expect(naac).toEqual(expect.arrayContaining([expect.objectContaining({ year: '2024-25', head: 'Capital: infrastructure and equipment', amount: '50000.00' })]));
    expect((await get('principal', `/v1/ops-reports/inventory.stockRegister?from=${from}&to=${to}`).expect(200)).body.rows.length).toBeGreaterThan(0);
    expect((await get('principal', `/v1/ops-reports/procurement.debitNotes?from=${from}&to=${to}`).expect(200)).body.rows[0]).toMatchObject({ number: 'DN-0001', status: 'adjusted' });
  });
});
