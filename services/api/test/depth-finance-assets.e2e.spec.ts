import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const R = (rupees: number) => rupees * 100;

describe('fees and assets depth: instalments, late fees, advance credit, AMC, warranty, smartboards', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  // Tuesday 20 October 2026, 10:00 IST.
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const [A, B, C] = [0, 1, 2];
  const invoice = async (title: string, student: number) => (await owner.query('select * from fee_invoices where tenant_id = $1 and title = $2 and student_id = $3', [t.tenantId, title, t.students[student].id])).rows[0] as { id: string; amount_paise: string; paid_paise: string; status: string };

  async function addUser(name: string, role: (typeof s.roleName.enumValues)[number]) {
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: name, email: `${name.toLowerCase().replace(/ /g, '')}@fa.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role });
    return u;
  }

  beforeAll(async () => {
    t = await createTenant(owner);
    const acct = await addUser('Anil Accounts', 'accountant');
    const keeper = await addUser('Kiran Store', 'store_keeper');
    app = await createApp(clock);
    tokens = {
      accountant: await login(t.slug, acct.email!),
      keeper: await login(t.slug, keeper.email!),
      principal: await login(t.slug, t.principal.email!),
      teacher: await login(t.slug, t.teacher.email!),
      parentA: await login(t.slug, t.guardian.email!),
      parentB: await login(t.slug, t.guardian2.email!),
    };
    await post('principal', '/v1/fees/invoices', { sectionId: t.section.id, title: 'Tuition', amountPaise: R(45_000), dueOn: '2026-10-10' }).expect(201);
    await post('principal', '/v1/fees/invoices', { sectionId: t.section.id, title: 'Lab fee', amountPaise: R(30_000), dueOn: '2026-11-10' }).expect(201);
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('instalments', () => {
    let planId: string;
    it('defines a plan that adds up to 100% and falls due in order', async () => {
      const parts = [{ percent: 50, dueAfterDays: 0 }, { percent: 30, dueAfterDays: 30 }, { percent: 20, dueAfterDays: 60 }];
      await post('teacher', '/v1/fees/instalment-plans', { name: '50-30-20', parts }).expect(403);
      await post('accountant', '/v1/fees/instalment-plans', { name: 'Short', parts: [{ percent: 50, dueAfterDays: 0 }, { percent: 40, dueAfterDays: 30 }] }).expect(400);
      await post('accountant', '/v1/fees/instalment-plans', { name: 'Backwards', parts: [{ percent: 50, dueAfterDays: 30 }, { percent: 50, dueAfterDays: 10 }] }).expect(400);
      planId = (await post('accountant', '/v1/fees/instalment-plans', { name: '50-30-20', parts }).expect(201)).body.id;
      expect((await get('accountant', '/v1/fees/instalment-plans').expect(200)).body).toHaveLength(1);
    });

    it('splits an invoice into a schedule and follows what has been paid', async () => {
      const inv = await invoice('Lab fee', A);
      const sched = (await post('accountant', `/v1/fees/invoices/${inv.id}/instalments`, { planId }).expect(201)).body;
      expect(sched.instalments.map((i: { dueOn: string; amountPaise: number }) => [i.dueOn, i.amountPaise])).toEqual([['2026-11-10', R(15_000)], ['2026-12-10', R(9_000)], ['2027-01-09', R(6_000)]]);
      await post('accountant', `/v1/fees/invoices/${inv.id}/instalments`, { planId }).expect(409);
      await post('accountant', `/v1/fees/invoices/${inv.id}/payments`, { amountPaise: R(16_000), method: 'cash' }).expect(201);
      const after = (await get('parentA', `/v1/fees/invoices/${inv.id}/instalments`).expect(200)).body;
      expect(after.instalments.map((i: { status: string; paidPaise: number }) => [i.status, i.paidPaise])).toEqual([['paid', R(15_000)], ['partial', R(1_000)], ['due', 0]]);
      await get('parentB', `/v1/fees/invoices/${inv.id}/instalments`).expect(404);
      await post('accountant', `/v1/fees/invoices/${(await invoice('Lab fee', B)).id}/instalments`, { planId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      // Once something is paid, the invoice cannot be re-cut.
      await post('accountant', `/v1/fees/invoices/${inv.id}/instalments`, { planId }).expect(409);
    });
  });

  describe('late fees', () => {
    it('sets one rule, and only the principal or administrator may', async () => {
      const rule = { graceDays: 3, flatPaise: R(50), perDayPaise: R(10), capPaise: R(200) };
      await put('accountant', '/v1/fees/late-fee-rule', rule).expect(403);
      await put('principal', '/v1/fees/late-fee-rule', { ...rule, flatPaise: 0, perDayPaise: 0 }).expect(400);
      await put('principal', '/v1/fees/late-fee-rule', rule).expect(200);
      expect((await get('accountant', '/v1/fees/late-fee-rule').expect(200)).body).toMatchObject({ graceDays: 3, active: true });
    });

    it('adds the fine to overdue invoices once, then only the extra days', async () => {
      // Tuition fell due on the 10th: ten days overdue, seven past the grace, so Rs 50 + 7 x Rs 10.
      const first = (await post('accountant', '/v1/fees/late-fees/run').expect(200)).body;
      expect(first).toEqual({ assessed: 3, totalPaise: 3 * R(120) });
      expect(Number((await invoice('Tuition', A)).amount_paise)).toBe(R(45_000) + R(120));
      expect(Number((await invoice('Lab fee', A)).amount_paise)).toBe(R(30_000)); // not yet due
      expect((await post('accountant', '/v1/fees/late-fees/run').expect(200)).body).toEqual({ assessed: 0, totalPaise: 0 });

      // A pays in full, including the fine; the others go five days further.
      await post('accountant', `/v1/fees/invoices/${(await invoice('Tuition', A)).id}/payments`, { amountPaise: R(45_120), method: 'cash' }).expect(201);
      clock.at = new Date('2026-10-25T04:30:00Z');
      expect((await post('accountant', '/v1/fees/late-fees/run').expect(200)).body).toEqual({ assessed: 2, totalPaise: 2 * R(50) });
      expect(Number((await invoice('Tuition', B)).amount_paise)).toBe(R(45_000) + R(170));
      expect((await invoice('Tuition', A)).status).toBe('paid');
      const list = (await get('accountant', '/v1/fees/late-fees').expect(200)).body;
      expect(list).toHaveLength(3);
      expect(list.find((x: { rollNo: string }) => x.rollNo === 'R2')).toMatchObject({ daysLate: 12, appliedPaise: R(170), netPaise: R(170) });
    });

    it('waives a fine, with a reason, only for the principal', async () => {
      const row = (await get('accountant', '/v1/fees/late-fees').expect(200)).body.find((x: { rollNo: string }) => x.rollNo === 'R2');
      await post('accountant', `/v1/fees/late-fees/${row.id}/waive`, { reason: 'Hardship' }).expect(403);
      await post('principal', `/v1/fees/late-fees/${row.id}/waive`, { reason: 'x' }).expect(400);
      const waived = (await post('principal', `/v1/fees/late-fees/${row.id}/waive`, { amountPaise: R(70), reason: 'Bank holiday delay' }).expect(200)).body;
      expect(waived).toMatchObject({ waivedPaise: R(70), waiveReason: 'Bank holiday delay' });
      expect(Number((await invoice('Tuition', B)).amount_paise)).toBe(R(45_000) + R(100));
      clock.at = new Date('2026-10-20T04:30:00Z');
    });
  });

  describe('advance credit', () => {
    it('holds an advance for a student and settles an invoice from it', async () => {
      const b = t.students[B].id;
      await post('teacher', '/v1/fees/credits', { studentId: b, amountPaise: R(10_000) }).expect(403);
      expect((await post('accountant', '/v1/fees/credits', { studentId: b, amountPaise: R(10_000), note: 'Advance for the year' }).expect(201)).body.balancePaise).toBe(R(10_000));
      expect((await get('accountant', '/v1/fees/credits').expect(200)).body).toEqual([expect.objectContaining({ rollNo: 'R2', balancePaise: R(10_000) })]);
      const view = (await get('parentB', `/v1/fees/credits/students/${b}`).expect(200)).body;
      expect(view).toMatchObject({ balancePaise: R(10_000) });
      expect(view.ledger[0]).toMatchObject({ kind: 'advance', note: 'Advance for the year' });
      await get('parentA', `/v1/fees/credits/students/${b}`).expect(404);

      const lab = await invoice('Lab fee', B);
      const used = (await post('accountant', `/v1/fees/invoices/${lab.id}/apply-credit`).expect(200)).body;
      expect(used).toMatchObject({ appliedPaise: R(10_000), balancePaise: 0 });
      const after = await invoice('Lab fee', B);
      expect(Number(after.paid_paise)).toBe(R(10_000));
      expect(after.status).toBe('due');
      const pay = (await owner.query("select method, status, receipt_no from fee_payments where invoice_id = $1 and method = 'credit'", [lab.id])).rows[0];
      expect(pay).toMatchObject({ method: 'credit', status: 'paid' });
      expect(pay.receipt_no).toMatch(/^RCPT\//);
      await post('accountant', `/v1/fees/invoices/${lab.id}/apply-credit`).expect(409); // nothing left to use
    });

    it('refunds credit only up to what is held, and only by the principal', async () => {
      const b = t.students[B].id;
      await post('accountant', '/v1/fees/credits', { studentId: b, amountPaise: R(5_000) }).expect(201);
      await post('accountant', '/v1/fees/credits/refund', { studentId: b, amountPaise: R(1_000) }).expect(403);
      await post('principal', '/v1/fees/credits/refund', { studentId: b, amountPaise: R(6_000) }).expect(409);
      expect((await post('principal', '/v1/fees/credits/refund', { studentId: b, amountPaise: R(2_000), note: 'Withdrew from the lab course' }).expect(201)).body.balancePaise).toBe(R(3_000));
    });
  });

  describe('AMC, warranty and smartboards', () => {
    const ids: Record<string, string> = {};

    it('records AMC contracts and the service visits under them', async () => {
      ids.projector = (await post('keeper', '/v1/assets', { name: 'Projector', purchasedOn: '2024-06-01', costPaise: R(1_00_000), usefulLifeYears: 5 }).expect(201)).body.id;
      ids.printer = (await post('keeper', '/v1/assets', { name: 'Printer', purchasedOn: '2025-06-01', costPaise: R(20_000), usefulLifeYears: 5 }).expect(201)).body.id;
      ids.cabinet = (await post('keeper', '/v1/assets', { name: 'Cabinet', purchasedOn: '2025-06-01', costPaise: R(8_000), usefulLifeYears: 10 }).expect(201)).body.id;
      const body = { title: 'Projector AMC', assetId: ids.projector, vendorName: 'Bright Tech', covers: 'Lamp excluded', startsOn: '2026-04-01', endsOn: '2027-03-31', costPaise: R(8_000), visitsPerYear: 4, contact: '9800000000' };
      await post('teacher', '/v1/asset-ops/amc', body).expect(403);
      await post('keeper', '/v1/asset-ops/amc', { ...body, endsOn: '2026-01-01' }).expect(400);
      const amc = (await post('keeper', '/v1/asset-ops/amc', body).expect(201)).body;
      expect(amc.state).toBe('active');
      await post('keeper', '/v1/asset-ops/amc', { title: 'Printer AMC', assetId: ids.printer, startsOn: '2025-11-16', endsOn: '2026-11-15', visitsPerYear: 2 }).expect(201);
      const list = (await get('keeper', '/v1/asset-ops/amc').expect(200)).body;
      expect(list.map((c: { title: string; state: string }) => [c.title, c.state])).toEqual([['Printer AMC', 'expiring'], ['Projector AMC', 'active']]);

      expect((await post('keeper', `/v1/asset-ops/amc/${amc.id}/visit`, { note: 'Cleaned the lens' }).expect(200)).body.visitsDone).toBe(1);
      expect((await owner.query("select count(*)::int as n from asset_maintenance where asset_id = $1 and description like 'AMC visit%'", [ids.projector])).rows[0].n).toBe(1);
      await post('keeper', `/v1/asset-ops/amc/${amc.id}/cancel`).expect(200);
      await post('keeper', `/v1/asset-ops/amc/${amc.id}/visit`).expect(409);
    });

    it('shows what each asset is covered by and what is running out', async () => {
      await put('keeper', `/v1/asset-ops/assets/${ids.cabinet}/warranty`, { warrantyUntil: '2026-12-01', serialNo: 'CAB-77' }).expect(200);
      const cov = (await get('keeper', '/v1/asset-ops/coverage?days=60').expect(200)).body;
      const row = (name: string) => cov.assets.find((a: { name: string }) => a.name === name);
      expect(row('Cabinet')).toMatchObject({ cover: 'warranty', coverEndsOn: '2026-12-01', endingSoon: true, serialNo: 'CAB-77' });
      expect(row('Printer')).toMatchObject({ cover: 'amc', endingSoon: true });
      expect(row('Projector')).toMatchObject({ cover: 'none' }); // its contract was cancelled
      expect(cov.summary).toMatchObject({ amc: 1, warranty: 1, none: 1, endingSoon: 2 });
    });

    it('registers a smartboard as an asset in its room', async () => {
      const boards = (await get('keeper', '/v1/asset-ops/smartboards').expect(200)).body;
      expect(boards).toEqual([expect.objectContaining({ deviceId: t.device.id, room: 'Room 1', assetId: null })]);
      await post('keeper', `/v1/asset-ops/smartboards/${t.device.id}/link`, {}).expect(400);
      const asset = (await post('keeper', `/v1/asset-ops/smartboards/${t.device.id}/link`, { create: { costPaise: R(1_20_000), purchasedOn: '2026-06-01', usefulLifeYears: 6 } }).expect(201)).body;
      expect(asset).toMatchObject({ category: 'smartboard', roomId: t.room.id, deviceId: t.device.id });
      await post('keeper', `/v1/asset-ops/smartboards/${t.device.id}/link`, { create: { costPaise: R(1_00_000), purchasedOn: '2026-06-01', usefulLifeYears: 6 } }).expect(409);
      expect((await get('keeper', '/v1/asset-ops/smartboards').expect(200)).body[0]).toMatchObject({ assetId: asset.id, assetTag: asset.tag });
      await put('keeper', `/v1/asset-ops/assets/${ids.cabinet}/room`, { roomId: t.room.id }).expect(200);
      const inRoom = (await get('keeper', `/v1/asset-ops/rooms/${t.room.id}/assets`).expect(200)).body;
      expect(inRoom.map((a: { name: string }) => a.name).sort()).toEqual(['Cabinet', 'Room 1 Board']);
    });
  });
});
