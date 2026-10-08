import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('finance: scholarships, refunds, budgets, GL export', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const fy = (() => { const n = new Date(); const y = n.getUTCMonth() >= 3 ? n.getUTCFullYear() : n.getUTCFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; })();
  let schemeId = '';
  let appId = '';
  let deptId = '';
  const invoices = async (who: string, i: number) => (await http().get(`/v1/fees/students/${t.students[i].id}`).set(as(who)).expect(200)).body.invoices as { id: string; amountPaise: number; paidPaise: number; status: string }[];

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    for (const [k, u] of Object.entries({ principal: t.principal, teacher: t.teacher, parent: t.guardian, parent2: t.guardian2 })) tokens[k] = await login(u.email!);
    const [a] = await db.insert(s.assessments).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, title: 'Exam', kind: 'exam', maxMarks: 100, heldOn: '2026-09-01', createdBy: t.teacher.id, publishedAt: new Date() }).returning();
    await db.insert(s.marks).values([80, 40].map((m, i) => ({ tenantId: t.tenantId, assessmentId: a.id, studentId: t.students[i].id, marks: m })));
    await http().post('/v1/fees/invoices').set(as('principal')).send({ sectionId: t.section.id, title: 'Tuition', amountPaise: 100_000_00, dueOn: '2026-12-01' }).expect(201);
    [deptId] = (await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce' }).returning()).map((d) => d.id);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('the accounts office defines schemes; families see only open ones', async () => {
    const body = { name: 'Merit 50', kind: 'percent', value: 50, minPercentage: 60, maxIncomePaise: 3_00_000_00 };
    await http().post('/v1/finance/scholarship-schemes').set(as('parent')).send(body).expect(403);
    await http().post('/v1/finance/scholarship-schemes').set(as('principal')).send({ ...body, value: 150 }).expect(400);
    schemeId = (await http().post('/v1/finance/scholarship-schemes').set(as('principal')).send(body).expect(201)).body.id;
    await http().post('/v1/finance/scholarship-schemes').set(as('principal')).send({ name: 'Closed', kind: 'fixed', value: 100000, active: false }).expect(201);
    expect((await http().get('/v1/finance/scholarship-schemes').set(as('parent')).expect(200)).body.map((x: { name: string }) => x.name)).toEqual(['Merit 50']);
    expect((await http().get('/v1/finance/scholarship-schemes').set(as('principal')).expect(200)).body).toHaveLength(2);
  });

  it('applying checks eligibility, the child and duplicates', async () => {
    const base = { schemeId, studentId: t.students[0].id };
    await http().post('/v1/finance/scholarships/apply').set(as('parent')).send(base).expect(400); // income needed
    await http().post('/v1/finance/scholarships/apply').set(as('parent')).send({ ...base, incomePaise: 9_00_000_00 }).expect(400); // too high
    await http().post('/v1/finance/scholarships/apply').set(as('parent2')).send({ ...base, incomePaise: 100 }).expect(404); // not their child
    await http().post('/v1/finance/scholarships/apply').set(as('parent2')).send({ schemeId, studentId: t.students[1].id, incomePaise: 100 }).expect(400); // 40% < 60%
    appId = (await http().post('/v1/finance/scholarships/apply').set(as('parent')).send({ ...base, incomePaise: 2_00_000_00 }).expect(201)).body.id;
    await http().post('/v1/finance/scholarships/apply').set(as('parent')).send({ ...base, incomePaise: 2_00_000_00 }).expect(409);
    expect((await http().get(`/v1/finance/scholarships?studentId=${t.students[0].id}`).set(as('parent')).expect(200)).body).toHaveLength(1);
    await http().get('/v1/finance/scholarships').set(as('parent')).expect(403);
  });

  it('approval takes the discount off the open fee, once, with an audit trail', async () => {
    await http().post(`/v1/finance/scholarships/${appId}/decide`).set(as('parent')).send({ approve: true }).expect(403);
    const done = (await http().post(`/v1/finance/scholarships/${appId}/decide`).set(as('principal')).send({ approve: true, note: 'Merit' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'approved', awardedPaise: 50_000_00 });
    expect(done.adjustments).toHaveLength(1);
    expect((await invoices('parent', 0))[0]).toMatchObject({ amountPaise: 50_000_00, status: 'due' });
    expect((await invoices('parent2', 1))[0].amountPaise).toBe(100_000_00); // others untouched
    await http().post(`/v1/finance/scholarships/${appId}/decide`).set(as('principal')).send({ approve: false }).expect(409);
    const log = await db.select().from(s.auditLog);
    expect(log.some((r) => r.action === 'scholarship.approved')).toBe(true);
  });

  it('refunds reopen the invoice and cannot exceed what was paid', async () => {
    const inv = (await invoices('parent', 0))[0];
    const pay = (await http().post(`/v1/fees/invoices/${inv.id}/payments`).set(as('principal')).send({ amountPaise: 50_000_00, method: 'cash' }).expect(201)).body;
    expect((await invoices('parent', 0))[0].status).toBe('paid');
    await http().post('/v1/finance/refunds').set(as('principal')).send({ paymentId: pay.paymentId ?? pay.id, amountPaise: 60_000_00, reason: 'Wrong amount' }).expect(400);
    await http().post('/v1/finance/refunds').set(as('principal')).send({ paymentId: pay.paymentId ?? pay.id, amountPaise: 10_000_00, reason: 'Duplicate charge' }).expect(201);
    expect((await invoices('parent', 0))[0]).toMatchObject({ paidPaise: 40_000_00, status: 'due' });
  });

  it('budgets show actuals from purchase orders and expenses, and the variance', async () => {
    const [store] = await db.insert(s.invStores).values({ tenantId: t.tenantId, name: 'Main' }).returning();
    const [vendor] = await db.insert(s.invVendors).values({ tenantId: t.tenantId, name: 'Books Ltd' }).returning();
    await db.insert(s.invPurchaseOrders).values({ tenantId: t.tenantId, number: 'PO-0001', vendorId: vendor.id, storeId: store.id, totalPaise: 20_000_00, departmentId: deptId, createdBy: t.principal.id });
    await http().put('/v1/finance/budgets').set(as('teacher')).send({ departmentId: deptId, fiscalYear: fy, amountPaise: 1 }).expect(403);
    await http().put('/v1/finance/budgets').set(as('principal')).send({ departmentId: deptId, fiscalYear: fy, amountPaise: 1_00_000_00 }).expect(200);
    await http().put('/v1/finance/budgets').set(as('principal')).send({ departmentId: deptId, fiscalYear: fy, amountPaise: 50_000_00 }).expect(200); // upsert
    await http().post('/v1/finance/expenses').set(as('principal')).send({ departmentId: deptId, spentOn: today, description: 'Seminar', amountPaise: 35_000_00 }).expect(201);
    const rep = (await http().get(`/v1/finance/budgets?fiscalYear=${fy}`).set(as('principal')).expect(200)).body;
    expect(rep.rows[0]).toMatchObject({ department: 'Commerce', budgetPaise: 50_000_00, purchaseOrdersPaise: 20_000_00, expensesPaise: 35_000_00, payrollPaise: 0, actualPaise: 55_000_00, varianceDeltaPaise: -5_000_00, utilisationPercent: 110 });
  });

  it('exports balanced journals as CSV and Tally XML for collections and refunds', async () => {
    const q = `from=${today}&to=${today}`;
    const gl = (await http().get(`/v1/finance/gl?${q}`).set(as('principal')).expect(200)).body.vouchers as { type: string; lines: { debitPaise: number; creditPaise: number }[] }[];
    expect(gl.map((v) => v.type).sort()).toEqual(['Payment', 'Receipt']);
    for (const v of gl) expect(v.lines.reduce((x, l) => x + l.debitPaise, 0)).toBe(v.lines.reduce((x, l) => x + l.creditPaise, 0));
    const csv = (await http().get(`/v1/finance/gl.csv?${q}`).set(as('principal')).expect(200)).text;
    expect(csv).toContain('Cash,50000.00,');
    expect(csv).toContain('Fee Income,,50000.00');
    expect(csv).toContain('Fee Refunds,10000.00,');
    const xml = (await http().get(`/v1/finance/gl.xml?${q}`).set(as('principal')).expect(200)).text;
    expect(xml).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create">');
    expect(xml).toContain('<AMOUNT>-50000.00</AMOUNT>');
    await http().get(`/v1/finance/gl.csv?from=${today}`).set(as('principal')).expect(400);
    await http().get(`/v1/finance/gl.csv?${q}`).set(as('parent')).expect(403);
  });
});
