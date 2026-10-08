import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('procurement depth: RFQ, transfers, returns, fixed-asset GL', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const inv = '/v1/inventory';
  let storeA = '';
  let storeB = '';
  let itemId = '';
  let itemId2 = '';

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Keeper', email: `keeper-${Math.random().toString(36).slice(2, 6)}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role: 'store_keeper', campusId: t.campus.id });
    tokens.keeper = await login(u.email!);
    tokens.principal = await login(t.principal.email!);
    tokens.teacher = await login(t.teacher.email!);
    storeA = (await http().post(`${inv}/stores`).set(as('keeper')).send({ name: 'Main' }).expect(201)).body.id;
    storeB = (await http().post(`${inv}/stores`).set(as('keeper')).send({ name: 'Lab' }).expect(201)).body.id;
    itemId = (await http().post(`${inv}/items`).set(as('keeper')).send({ sku: 'A1', name: 'Paper' }).expect(201)).body.id;
    itemId2 = (await http().post(`${inv}/items`).set(as('keeper')).send({ sku: 'A2', name: 'Pens' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('compares quotes side by side and awards one into a purchase order', async () => {
    const reqId = (await http().post(`${inv}/requisitions`).set(as('teacher')).send({ reason: 'Supplies', lines: [{ itemId, qty: 10 }, { itemId: itemId2, qty: 5 }] }).expect(201)).body.id;
    await http().post(`${inv}/rfqs`).set(as('keeper')).send({ requisitionId: reqId }).expect(409); // not yet approved
    await http().post(`${inv}/requisitions/${reqId}/decision`).set(as('principal')).send({ approve: true }).expect(200);
    const rfq = (await http().post(`${inv}/rfqs`).set(as('keeper')).send({ requisitionId: reqId }).expect(201)).body;
    expect(rfq).toMatchObject({ number: 'RFQ-0001', status: 'open' });
    const v1 = (await http().post(`${inv}/vendors`).set(as('keeper')).send({ name: 'Cheap & Co' }).expect(201)).body.id;
    const v2 = (await http().post(`${inv}/vendors`).set(as('keeper')).send({ name: 'Quality Ltd' }).expect(201)).body.id;
    const quote = (vendorId: string, a: number, b: number) => ({ vendorId, deliveryDays: 3, lines: [{ itemId, unitPricePaise: a }, { itemId: itemId2, unitPricePaise: b }] });
    await http().post(`${inv}/rfqs/${rfq.id}/quotes`).set(as('keeper')).send({ vendorId: v1, lines: [{ itemId, unitPricePaise: 100 }] }).expect(400); // must price every line
    await http().post(`${inv}/rfqs/${rfq.id}/quotes`).set(as('keeper')).send(quote(v1, 100_00, 20_00)).expect(201);
    await http().post(`${inv}/rfqs/${rfq.id}/quotes`).set(as('keeper')).send(quote(v1, 1, 1)).expect(409);
    await http().post(`${inv}/rfqs/${rfq.id}/quotes`).set(as('keeper')).send(quote(v2, 90_00, 30_00)).expect(201);
    const cmp = (await http().get(`${inv}/rfqs/${rfq.id}`).set(as('keeper')).expect(200)).body;
    expect(cmp.quotes.map((q: { vendor: string; totalPaise: number; lowest: boolean }) => [q.vendor, q.totalPaise, q.lowest])).toEqual([['Quality Ltd', 1050_00, true], ['Cheap & Co', 1100_00, false]]);
    expect(cmp.quotes[0].prices.map((p: { best: boolean }) => p.best)).toEqual([true, false]);
    const award = { quoteId: cmp.quotes[0].id, storeId: storeA };
    await http().post(`${inv}/rfqs/${rfq.id}/award`).set(as('keeper')).send(award).expect(403);
    const po = (await http().post(`${inv}/rfqs/${rfq.id}/award`).set(as('principal')).send(award).expect(200)).body;
    expect(po).toMatchObject({ number: 'PO-0001', totalPaise: 1050_00 });
    await http().post(`${inv}/rfqs/${rfq.id}/award`).set(as('principal')).send(award).expect(409);
    await http().post(`${inv}/rfqs/${rfq.id}/quotes`).set(as('keeper')).send(quote(v2, 1, 1)).expect(409);
    const full = (await http().get(`${inv}/purchase-orders/${po.id}`).set(as('keeper')).expect(200)).body;
    expect(full.lines.map((l: { qty: number; unitPricePaise: number }) => [l.qty, l.unitPricePaise])).toEqual(expect.arrayContaining([[10, 90_00], [5, 30_00]]));
    // goods arrive, then 4 paper go back to the vendor
    const line = full.lines.find((l: { itemId: string }) => l.itemId === itemId);
    await http().post(`${inv}/purchase-orders/${po.id}/receipts`).set(as('keeper')).send({ idempotencyKey: 'grn-rfq-0001', lines: [{ poLineId: line.id, qty: 10 }] }).expect(201);
    await http().post(`${inv}/returns`).set(as('keeper')).send({ kind: 'vendor', itemId, qty: 11, reason: 'Damaged', poId: po.id }).expect(409);
    const r = (await http().post(`${inv}/returns`).set(as('keeper')).send({ kind: 'vendor', itemId, qty: 4, reason: 'Damaged', poId: po.id }).expect(201)).body;
    expect(r).toMatchObject({ number: 'RTN-0001', creditPaise: 4 * 90_00, vendorId: v2 });
    await http().post(`${inv}/returns`).set(as('keeper')).send({ kind: 'vendor', itemId, qty: 7, reason: 'Damaged', poId: po.id }).expect(409); // only 6 left to return
    const stock = (await http().get(`${inv}/stock?storeId=${storeA}`).set(as('keeper')).expect(200)).body;
    expect(stock.find((x: { itemId: string }) => x.itemId === itemId).qty).toBe(6);
  });

  it('transfers stock between stores and takes issued stock back', async () => {
    const tr = { fromStoreId: storeA, toStoreId: storeB, itemId, qty: 5 };
    await http().post(`${inv}/stock/transfers`).set(as('keeper')).send({ ...tr, toStoreId: storeA }).expect(400);
    await http().post(`${inv}/stock/transfers`).set(as('keeper')).send({ ...tr, qty: 50 }).expect(409);
    await http().post(`${inv}/stock/transfers`).set(as('teacher')).send(tr).expect(403);
    expect((await http().post(`${inv}/stock/transfers`).set(as('keeper')).send(tr).expect(201)).body.number).toBe('TRF-0001');
    const qty = async (store: string) => ((await http().get(`${inv}/stock?storeId=${store}`).set(as('keeper')).expect(200)).body as { itemId: string; qty: number }[]).find((x) => x.itemId === itemId)?.qty;
    expect([await qty(storeA), await qty(storeB)]).toEqual([1, 5]);
    expect((await http().get(`${inv}/stock/transfers`).set(as('keeper')).expect(200)).body).toHaveLength(1);
    await http().post(`${inv}/stock/issue`).set(as('keeper')).send({ storeId: storeB, itemId, qty: 3, issuedTo: 'Physics' }).expect(201);
    const back = { kind: 'issue', storeId: storeB, itemId, issuedTo: 'Physics', reason: 'Not needed' };
    await http().post(`${inv}/returns`).set(as('keeper')).send({ ...back, qty: 4 }).expect(409);
    await http().post(`${inv}/returns`).set(as('keeper')).send({ ...back, qty: 2 }).expect(201);
    expect(await qty(storeB)).toBe(4);
    await http().post(`${inv}/returns`).set(as('keeper')).send({ ...back, issuedTo: 'Chemistry', qty: 1 }).expect(409);
  });

  it('posts depreciation and a disposal as journals that the GL export carries', async () => {
    const a = (await http().post('/v1/assets').set(as('keeper')).send({ name: 'Projector', purchasedOn: '2024-06-01', costPaise: 100_000_00, usefulLifeYears: 5 }).expect(201)).body;
    await http().post('/v1/assets/gl/depreciation').set(as('keeper')).send({ fiscalYear: '2026' }).expect(400);
    expect((await http().post('/v1/assets/gl/depreciation').set(as('keeper')).send({ fiscalYear: '2024-25' }).expect(200)).body).toMatchObject({ posted: 1, totalPaise: 20_000_00 });
    expect((await http().post('/v1/assets/gl/depreciation').set(as('keeper')).send({ fiscalYear: '2024-25' }).expect(200)).body.posted).toBe(0); // rerun is a no-op
    await http().post('/v1/assets/gl/depreciation').set(as('keeper')).send({ fiscalYear: '2025-26' }).expect(200);
    await http().post(`/v1/assets/${a.id}/dispose`).set(as('keeper')).send({ disposedOn: '2026-05-10', disposalPaise: 50_000_00 }).expect(200);
    const csv = (await http().get('/v1/finance/gl.csv?from=2024-04-01&to=2027-03-31').set(as('principal')).expect(200)).text;
    expect(csv).toContain('Depreciation');
    const rows = csv.split('\n').filter((l) => l.includes(`DSP-${a.tag}`));
    expect(rows.map((l) => l.split(',').slice(3, 6).join(','))).toEqual(['Bank Account,50000.00,', 'Accumulated Depreciation,40000.00,', 'Loss on Sale of Assets,10000.00,', 'Fixed Assets,,100000.00']);
    expect(csv.split('\n').filter((l) => l.includes(`DEP-${a.tag}-`))).toHaveLength(4);
    const tally = (await http().get('/v1/finance/gl.xml?from=2024-04-01&to=2027-03-31').set(as('principal')).expect(200)).text;
    expect(tally).toContain('Accumulated Depreciation');
  });
});
