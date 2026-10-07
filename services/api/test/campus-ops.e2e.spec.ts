import type { INestApplication } from '@nestjs/common';
import { RealtimeEvents, type TransportPositionEvent } from '@kinetix/shared';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { io } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('transport, hostel, canteen, inventory and assets', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  let n = 0;
  const staff = async (tenantId: string, campusId: string, role: (typeof s.roleName.enumValues)[number]) => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: role, email: `${role}${++n}-${Math.random().toString(36).slice(2, 6)}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId });
    return u;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()));
    for (const role of ['transport_manager', 'driver', 'hostel_warden', 'canteen_manager', 'store_keeper'] as const) {
      const u = await staff(t.tenantId, t.campus.id, role);
      ids[role] = u.id;
      tokens[role] = await login(t.slug, u.email!);
    }
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('transport', () => {
    let routeId: string;
    let stop1: string;
    let stop2: string;
    let tripId: string;

    it('sets up a vehicle, a driver with a login, a route and two stops; guards roles and duplicates', async () => {
      const v = (await http().post('/v1/transport/vehicles').set(as('transport_manager')).send({ regNo: 'ka01ab1234', capacity: 1, insuranceExpiresOn: day(10) }).expect(201)).body;
      expect(v.regNo).toBe('KA01AB1234');
      await http().post('/v1/transport/vehicles').set(as('transport_manager')).send({ regNo: 'KA01AB1234', capacity: 30 }).expect(409);
      await http().post('/v1/transport/vehicles').set(as('teacher')).send({ regNo: 'KA02', capacity: 30 }).expect(403);
      await http().post('/v1/transport/vehicles').set(as('transport_manager')).send({ regNo: 'KA03', capacity: 0 }).expect(400);
      const d = (await http().post('/v1/transport/drivers').set(as('transport_manager')).send({ fullName: 'Ramesh', userId: ids.driver, licenseNo: 'DL1', licenseExpiresOn: day(-1) }).expect(201)).body;
      routeId = (await http().post('/v1/transport/routes').set(as('transport_manager')).send({ name: 'Route 1', vehicleId: v.id, driverId: d.id, monthlyFeePaise: 1_500_00 }).expect(201)).body.id;
      await http().post('/v1/transport/routes').set(as('transport_manager')).send({ name: 'Route 1' }).expect(409);
      stop1 = (await http().post(`/v1/transport/routes/${routeId}/stops`).set(as('transport_manager')).send({ name: 'Market', lat: 12.97, lng: 77.59, pickupTime: '07:30' }).expect(201)).body.id;
      stop2 = (await http().post(`/v1/transport/routes/${routeId}/stops`).set(as('transport_manager')).send({ name: 'Park', lat: 12.99, lng: 77.59 }).expect(201)).body.id;
      const c = (await http().get('/v1/transport/compliance').set(as('transport_manager')).expect(200)).body.items;
      expect(c.map((x: { kind: string }) => x.kind).sort()).toEqual(['insurance', 'licence']);
      expect(c.find((x: { kind: string }) => x.kind === 'licence').expired).toBe(true);
    });

    it('seats students, respects the vehicle capacity and charges the route fee once', async () => {
      const [a, b] = t.students;
      await http().post('/v1/transport/assignments').set(as('transport_manager')).send({ studentId: a.id, routeId, stopId: stop1 }).expect(201);
      await http().post('/v1/transport/assignments').set(as('transport_manager')).send({ studentId: b.id, routeId, stopId: stop2 }).expect(409);
      const fee = { title: 'Transport Oct', dueOn: day(10) };
      expect((await http().post('/v1/transport/fees').set(as('transport_manager')).send(fee).expect(201)).body).toEqual({ charged: 1, skipped: 0 });
      expect((await http().post('/v1/transport/fees').set(as('transport_manager')).send(fee).expect(201)).body).toEqual({ charged: 0, skipped: 1 });
      const inv = await db.select().from(s.feeInvoices).where(eq(s.feeInvoices.studentId, a.id));
      expect(inv).toHaveLength(1);
      expect(inv[0]).toMatchObject({ title: 'Transport Oct', amountPaise: 1_500_00 });
      const mine = (await http().get('/v1/fees/students/' + a.id).set(as('parent')).expect(200)).body;
      expect(JSON.stringify(mine)).toContain('Transport Oct');
    });

    it('runs a trip: GPS pings reach the family live, the stop gets an arrival notice, the log is kept', async () => {
      await http().post('/v1/transport/trips').set(as('transport_manager')).send({ routeId, direction: 'pickup' }).expect(403);
      tripId = (await http().post('/v1/transport/trips').set(as('driver')).send({ routeId, direction: 'pickup' }).expect(201)).body.id;
      const me = (await http().get('/v1/transport/me').set(as('driver')).expect(200)).body;
      expect(me.routes[0].stops).toHaveLength(2);
      expect(me.trip.id).toBe(tripId);

      const url = (await app.getUrl()).replace('[::1]', 'localhost');
      const sock = io(`${url}/realtime`, { auth: { token: tokens.parent }, transports: ['websocket'] });
      const stranger = io(`${url}/realtime`, { auth: { token: tokens.parent2 }, transports: ['websocket'] });
      await Promise.all([new Promise((r) => sock.once('ready', r)), new Promise((r) => stranger.once('ready', r))]);
      const got = new Promise<TransportPositionEvent>((r) => sock.once(RealtimeEvents.TransportPosition, r));
      let strangerHeard = false;
      stranger.on(RealtimeEvents.TransportPosition, () => (strangerHeard = true));

      // 1.1 km from the first stop, moving at 40 km/h: ETA 2 minutes.
      const far = await http().post(`/v1/transport/trips/${tripId}/position`).set(as('driver')).send({ lat: 12.96, lng: 77.59, speedKmh: 40 }).expect(200);
      expect(far.body.nextStop.name).toBe('Market');
      expect(far.body.etaMinutes).toBe(2);
      const ev = await got;
      expect(ev).toMatchObject({ tripId, routeId, nextStop: { name: 'Market' } });
      expect(strangerHeard).toBe(false);

      const kinds = async () => (await db.select().from(s.notifications).where(eq(s.notifications.kind, 'transport'))).length;
      expect(await kinds()).toBe(0);
      await http().post(`/v1/transport/trips/${tripId}/position`).set(as('driver')).send({ lat: 12.9675, lng: 77.59, speedKmh: 20 }).expect(200);
      const arriving = await kinds();
      expect(arriving).toBeGreaterThan(0);
      // Repeated pings near the stop do not repeat the notice.
      await http().post(`/v1/transport/trips/${tripId}/position`).set(as('driver')).send({ lat: 12.9692, lng: 77.59, speedKmh: 20 }).expect(200);
      expect(await kinds()).toBe(arriving);

      await http().post(`/v1/transport/trips/${tripId}/position`).set(as('driver')).send({ lat: 12.9701, lng: 77.59, speedKmh: 5 }).expect(200);
      const view = (await http().get(`/v1/transport/students/${t.students[0].id}`).set(as('parent')).expect(200)).body;
      expect(view).toMatchObject({ assigned: true, routeName: 'Route 1', stopName: 'Market' });
      expect(view.bus).toMatchObject({ tripId, stopsAway: 0 });
      expect(view.stops).toHaveLength(2);
      // Another family does not see this child's bus.
      await http().get(`/v1/transport/students/${t.students[0].id}`).set(as('parent2')).expect(404);

      await http().post(`/v1/transport/trips/${tripId}/position`).set(as('principal')).send({ lat: 1, lng: 1 }).expect(403);
      await http().post(`/v1/transport/trips/${tripId}/position`).set(as('driver')).send({ lat: 91, lng: 1 }).expect(400);
      await http().post(`/v1/transport/trips/${tripId}/end`).set(as('driver')).expect(200);
      await http().post(`/v1/transport/trips/${tripId}/position`).set(as('driver')).send({ lat: 12.97, lng: 77.59 }).expect(409);
      sock.close();
      stranger.close();

      const log = (await http().get(`/v1/transport/trips/${tripId}`).set(as('transport_manager')).expect(200)).body;
      expect(log.events.map((e: { kind: string }) => e.kind)).toEqual(['started', 'approaching', 'stop_reached', 'ended']);
      expect(log.pings).toBe(4);
      const audits = await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'transport.trip_ended')));
      expect(audits).toHaveLength(1);
    });

    it('is invisible to other institutions', async () => {
      await http().get(`/v1/transport/routes/${routeId}`).set(as('outsider')).expect(404);
      const cross = await login(other.slug, (await staff(other.tenantId, other.campus.id, 'transport_manager')).email!);
      await http().get(`/v1/transport/routes/${routeId}`).set({ authorization: `Bearer ${cross}` }).expect(404);
    });
  });

  describe('hostel', () => {
    let bedId: string;
    let allotmentId: string;
    let passId: string;

    it('builds rooms with beds, allots and vacates, refusing double allotment', async () => {
      const blk = (await http().post('/v1/hostel/blocks').set(as('hostel_warden')).send({ name: 'Block A', gender: 'boys' }).expect(201)).body;
      await http().post('/v1/hostel/blocks').set(as('hostel_warden')).send({ name: 'Block A' }).expect(409);
      await http().post(`/v1/hostel/blocks/${blk.id}/rooms`).set(as('hostel_warden')).send({ number: '101', beds: 2, monthlyFeePaise: 3_000_00 }).expect(201);
      const beds = (await http().get('/v1/hostel/beds?free=true').set(as('hostel_warden')).expect(200)).body;
      expect(beds).toHaveLength(2);
      bedId = beds[0].bedId;
      const a = (await http().post('/v1/hostel/allotments').set(as('hostel_warden')).send({ studentId: t.students[0].id, bedId }).expect(201)).body;
      allotmentId = a.id;
      await http().post('/v1/hostel/allotments').set(as('hostel_warden')).send({ studentId: t.students[1].id, bedId }).expect(409);
      await http().post('/v1/hostel/allotments').set(as('hostel_warden')).send({ studentId: t.students[0].id, bedId: beds[1].bedId }).expect(409);
      await http().post('/v1/hostel/allotments').set(as('teacher')).send({ studentId: t.students[1].id, bedId: beds[1].bedId }).expect(403);
      expect((await http().get('/v1/hostel/beds?free=true').set(as('hostel_warden')).expect(200)).body).toHaveLength(1);
      expect((await http().get('/v1/hostel/blocks').set(as('hostel_warden')).expect(200)).body[0]).toMatchObject({ beds: 2, occupied: 1 });
    });

    it('charges hostel and mess fees through the fees module', async () => {
      expect((await http().post('/v1/hostel/fees').set(as('hostel_warden')).send({ title: 'Hostel Oct', dueOn: day(5) }).expect(201)).body.charged).toBe(1);
      expect((await http().post('/v1/hostel/fees').set(as('hostel_warden')).send({ title: 'Hostel Oct', dueOn: day(5) }).expect(201)).body.charged).toBe(0);
      const plan = (await http().post('/v1/hostel/mess/plans').set(as('hostel_warden')).send({ name: 'Veg 3 meals', monthlyFeePaise: 2_400_00, meals: ['breakfast', 'lunch', 'dinner'] }).expect(201)).body;
      await http().post('/v1/hostel/mess/subscriptions').set(as('hostel_warden')).send({ studentId: t.students[1].id, planId: plan.id }).expect(400);
      await http().post('/v1/hostel/mess/subscriptions').set(as('hostel_warden')).send({ studentId: t.students[0].id, planId: plan.id }).expect(201);
      expect((await http().post('/v1/hostel/mess/fees').set(as('hostel_warden')).send({ title: 'Mess Oct', dueOn: day(5) }).expect(201)).body.charged).toBe(1);
      const titles = (await db.select().from(s.feeInvoices).where(eq(s.feeInvoices.studentId, t.students[0].id))).map((i) => i.title);
      expect(titles).toEqual(expect.arrayContaining(['Hostel Oct', 'Mess Oct']));
    });

    it('serves the weekly menu to everyone and lets only the warden edit it', async () => {
      await http().put('/v1/hostel/mess/menu').set(as('hostel_warden')).send({ dayOfWeek: 1, meal: 'lunch', items: 'Rice, dal' }).expect(200);
      await http().put('/v1/hostel/mess/menu').set(as('hostel_warden')).send({ dayOfWeek: 1, meal: 'lunch', items: 'Rice, sambar' }).expect(200);
      await http().put('/v1/hostel/mess/menu').set(as('parent')).send({ dayOfWeek: 1, meal: 'lunch', items: 'x' }).expect(403);
      expect((await http().get('/v1/hostel/mess/menu').set(as('parent')).expect(200)).body).toEqual([{ dayOfWeek: 1, meal: 'lunch', items: 'Rice, sambar' }]);
    });

    it('gate pass: out and in notify the family, order is enforced', async () => {
      const exp = new Date(Date.now() + 6 * 3600_000).toISOString();
      await http().post('/v1/hostel/gate-passes').set(as('hostel_warden')).send({ studentId: t.students[1].id, reason: 'Home', expectedBackAt: exp }).expect(400);
      await http().post('/v1/hostel/gate-passes').set(as('hostel_warden')).send({ studentId: t.students[0].id, reason: 'Home', expectedBackAt: new Date(Date.now() - 3600_000).toISOString() }).expect(400);
      passId = (await http().post('/v1/hostel/gate-passes').set(as('hostel_warden')).send({ studentId: t.students[0].id, reason: 'Weekend at home', destination: 'Mysuru', expectedBackAt: exp }).expect(201)).body.id;
      await http().post(`/v1/hostel/gate-passes/${passId}/in`).set(as('hostel_warden')).expect(409);
      await http().post(`/v1/hostel/gate-passes/${passId}/out`).set(as('hostel_warden')).expect(200);
      await http().post(`/v1/hostel/gate-passes/${passId}/out`).set(as('hostel_warden')).expect(409);
      await http().post(`/v1/hostel/allotments/${allotmentId}/vacate`).set(as('hostel_warden')).expect(409);
      expect((await http().get('/v1/hostel/gate-passes?status=out').set(as('hostel_warden')).expect(200)).body).toHaveLength(1);
      await http().post(`/v1/hostel/gate-passes/${passId}/in`).set(as('hostel_warden')).expect(200);
      const notes = await db.select().from(s.notifications).where(eq(s.notifications.kind, 'hostel'));
      expect(notes.length).toBeGreaterThanOrEqual(2);
      const mine = (await http().get('/v1/notifications').set(as('parent')).expect(200)).body;
      expect(JSON.stringify(mine)).toContain('hostel');
      const view = (await http().get(`/v1/hostel/students/${t.students[0].id}`).set(as('parent')).expect(200)).body;
      expect(view).toMatchObject({ resident: true, bed: { block: 'Block A', room: '101' } });
      expect(view.passes[0].status).toBe('returned');
      await http().get(`/v1/hostel/students/${t.students[0].id}`).set(as('parent2')).expect(404);
    });

    it('logs visitors, handles complaints and vacates', async () => {
      const v = (await http().post('/v1/hostel/visitors').set(as('hostel_warden')).send({ studentId: t.students[0].id, visitorName: 'Uncle', relation: 'uncle' }).expect(201)).body;
      expect((await http().get('/v1/hostel/visitors?inside=true').set(as('hostel_warden')).expect(200)).body).toHaveLength(1);
      await http().post(`/v1/hostel/visitors/${v.id}/out`).set(as('hostel_warden')).expect(200);
      await http().post(`/v1/hostel/visitors/${v.id}/out`).set(as('hostel_warden')).expect(409);
      const c = (await http().post('/v1/hostel/complaints').set(as('parent')).send({ studentId: t.students[0].id, category: 'maintenance', description: 'Fan not working' }).expect(201)).body;
      await http().post('/v1/hostel/complaints').set(as('parent2')).send({ studentId: t.students[0].id, category: 'food', description: 'Not mine' }).expect(404);
      expect((await http().get('/v1/hostel/complaints').set(as('parent')).expect(200)).body).toHaveLength(1);
      expect((await http().get('/v1/hostel/complaints').set(as('parent2')).expect(200)).body).toHaveLength(0);
      await http().post(`/v1/hostel/complaints/${c.id}/status`).set(as('hostel_warden')).send({ status: 'resolved' }).expect(400);
      await http().post(`/v1/hostel/complaints/${c.id}/status`).set(as('hostel_warden')).send({ status: 'resolved', resolution: 'Replaced' }).expect(200);
      await http().post(`/v1/hostel/complaints/${c.id}/status`).set(as('hostel_warden')).send({ status: 'in_progress' }).expect(409);
      await http().post(`/v1/hostel/allotments/${allotmentId}/vacate`).set(as('hostel_warden')).expect(200);
      expect((await http().get('/v1/hostel/beds?free=true').set(as('hostel_warden')).expect(200)).body).toHaveLength(2);
    });
  });

  describe('canteen', () => {
    it('wallet top-ups and orders are exact, idempotent and never overdraw', async () => {
      const item = (await http().post('/v1/canteen/items').set(as('canteen_manager')).send({ name: 'Samosa', pricePaise: 15_00 }).expect(201)).body;
      await http().post('/v1/canteen/items').set(as('canteen_manager')).send({ name: 'Samosa', pricePaise: 20_00 }).expect(409);
      const sid = t.students[0].id;
      await http().post('/v1/canteen/wallet/topup').set(as('parent')).send({ studentId: sid, amountPaise: 100_00, idempotencyKey: 'topup-0001' }).expect(403);
      await http().post('/v1/canteen/wallet/topup').set(as('canteen_manager')).send({ studentId: sid, amountPaise: 50_00, idempotencyKey: 'topup-0001' }).expect(201);
      const again = await http().post('/v1/canteen/wallet/topup').set(as('canteen_manager')).send({ studentId: sid, amountPaise: 50_00, idempotencyKey: 'topup-0001' }).expect(201);
      expect(again.body).toMatchObject({ repeated: true, balancePaise: 50_00 });
      const order = (await http().post('/v1/canteen/orders').set(as('canteen_manager')).send({ studentId: sid, idempotencyKey: 'order-0001', items: [{ itemId: item.id, qty: 2 }] }).expect(201)).body;
      expect(order).toMatchObject({ balancePaise: 20_00 });
      await http().post('/v1/canteen/orders').set(as('canteen_manager')).send({ studentId: sid, idempotencyKey: 'order-0002', items: [{ itemId: item.id, qty: 2 }] }).expect(409);
      await http().patch(`/v1/canteen/items/${item.id}`).set(as('canteen_manager')).send({ available: false }).expect(200);
      await http().post('/v1/canteen/orders').set(as('canteen_manager')).send({ studentId: sid, idempotencyKey: 'order-0003', items: [{ itemId: item.id, qty: 1 }] }).expect(400);
      const w = (await http().get(`/v1/canteen/students/${sid}`).set(as('parent')).expect(200)).body;
      expect(w.balancePaise).toBe(20_00);
      expect(w.txns).toHaveLength(2);
      await http().get(`/v1/canteen/students/${sid}`).set(as('parent2')).expect(404);
    });
  });

  describe('inventory and procurement', () => {
    let storeId: string;
    let itemId: string;
    let vendorId: string;
    let reqId: string;
    let poId: string;
    let lineId: string;

    it('keeps stock exact, never negative, and flags items at the reorder level', async () => {
      storeId = (await http().post('/v1/inventory/stores').set(as('store_keeper')).send({ name: 'Main store' }).expect(201)).body.id;
      itemId = (await http().post('/v1/inventory/items').set(as('store_keeper')).send({ sku: 'CH-01', name: 'Chalk box', reorderLevel: 10 }).expect(201)).body.id;
      await http().post('/v1/inventory/items').set(as('store_keeper')).send({ sku: 'CH-01', name: 'Dup' }).expect(409);
      await http().post('/v1/inventory/stock/in').set(as('store_keeper')).send({ storeId, itemId, qty: 12 }).expect(201);
      expect((await http().get('/v1/inventory/items?low=true').set(as('store_keeper')).expect(200)).body).toHaveLength(0);
      await http().post('/v1/inventory/stock/issue').set(as('store_keeper')).send({ storeId, itemId, qty: 5, issuedTo: 'Physics dept' }).expect(201);
      expect((await http().get('/v1/inventory/items?low=true').set(as('store_keeper')).expect(200)).body[0]).toMatchObject({ sku: 'CH-01', onHand: 7, low: true });
      await http().post('/v1/inventory/stock/issue').set(as('store_keeper')).send({ storeId, itemId, qty: 8, issuedTo: 'x' }).expect(409);
      await http().post('/v1/inventory/stock/out').set(as('store_keeper')).send({ storeId, itemId, qty: 1 }).expect(400);
      await http().post('/v1/inventory/stock/out').set(as('store_keeper')).send({ storeId, itemId, qty: 1, note: 'Damaged' }).expect(201);
      expect((await http().get('/v1/inventory/stock/moves?itemId=' + itemId).set(as('store_keeper')).expect(200)).body).toHaveLength(3);
      await http().post('/v1/inventory/stock/in').set(as('teacher')).send({ storeId, itemId, qty: 1 }).expect(403);
    });

    it('requisition, approval (not by the requester), PO, partial receipts, invoice match', async () => {
      vendorId = (await http().post('/v1/inventory/vendors').set(as('store_keeper')).send({ name: 'Stationers Ltd', gstin: '29ABCDE1234F1Z5' }).expect(201)).body.id;
      reqId = (await http().post('/v1/inventory/requisitions').set(as('teacher')).send({ reason: 'Term supplies', lines: [{ itemId, qty: 100 }] }).expect(201)).body.id;
      expect((await http().get('/v1/inventory/requisitions').set(as('teacher')).expect(200)).body).toHaveLength(1);
      const po = { requisitionId: reqId, vendorId, storeId, lines: [{ itemId, qty: 100, unitPricePaise: 20_00 }] };
      await http().post('/v1/inventory/purchase-orders').set(as('store_keeper')).send(po).expect(409);
      await http().post(`/v1/inventory/requisitions/${reqId}/decision`).set(as('teacher')).send({ approve: true }).expect(403);
      await http().post(`/v1/inventory/requisitions/${reqId}/decision`).set(as('principal')).send({ approve: true }).expect(200);
      await http().post(`/v1/inventory/requisitions/${reqId}/decision`).set(as('principal')).send({ approve: false }).expect(409);
      await http().post('/v1/inventory/purchase-orders').set(as('store_keeper')).send({ ...po, lines: [{ itemId, qty: 101, unitPricePaise: 20_00 }] }).expect(400);
      const made = (await http().post('/v1/inventory/purchase-orders').set(as('store_keeper')).send(po).expect(201)).body;
      poId = made.id;
      expect(made).toMatchObject({ number: 'PO-0001', totalPaise: 2000_00, status: 'issued' });
      lineId = (await http().get(`/v1/inventory/purchase-orders/${poId}`).set(as('store_keeper')).expect(200)).body.lines[0].id;
      await http().post(`/v1/inventory/purchase-orders/${poId}/invoices`).set(as('store_keeper')).send({ invoiceNo: 'INV-1', amountPaise: 2000_00 }).expect(409);

      const grn = { idempotencyKey: 'grn-key-0001', lines: [{ poLineId: lineId, qty: 60 }] };
      await http().post(`/v1/inventory/purchase-orders/${poId}/receipts`).set(as('store_keeper')).send(grn).expect(201);
      expect((await http().post(`/v1/inventory/purchase-orders/${poId}/receipts`).set(as('store_keeper')).send(grn).expect(201)).body.repeated).toBe(true);
      const stock = (await http().get('/v1/inventory/stock').set(as('store_keeper')).expect(200)).body;
      expect(stock[0].qty).toBe(6 + 60);
      await http().post(`/v1/inventory/purchase-orders/${poId}/receipts`).set(as('store_keeper')).send({ idempotencyKey: 'grn-key-0002', lines: [{ poLineId: lineId, qty: 41 }] }).expect(400);
      expect((await http().get(`/v1/inventory/purchase-orders/${poId}`).set(as('store_keeper')).expect(200)).body.status).toBe('partially_received');

      // Invoiced for the whole order but only 60 received: held as a mismatch.
      const bad = (await http().post(`/v1/inventory/purchase-orders/${poId}/invoices`).set(as('store_keeper')).send({ invoiceNo: 'INV-1', amountPaise: 2000_00 }).expect(201)).body;
      expect(bad).toMatchObject({ status: 'mismatch', expectedPaise: 1200_00 });
      await http().post(`/v1/inventory/invoices/${bad.id}/paid`).set(as('principal')).expect(409);
      await http().post(`/v1/inventory/invoices/${bad.id}/approve`).set(as('teacher')).expect(403);
      await http().post(`/v1/inventory/invoices/${bad.id}/approve`).set(as('principal')).expect(200);
      await http().post(`/v1/inventory/invoices/${bad.id}/paid`).set(as('principal')).expect(200);
      await http().post(`/v1/inventory/purchase-orders/${poId}/invoices`).set(as('store_keeper')).send({ invoiceNo: 'INV-1', amountPaise: 1200_00 }).expect(409);
      const good = (await http().post(`/v1/inventory/purchase-orders/${poId}/invoices`).set(as('store_keeper')).send({ invoiceNo: 'INV-2', amountPaise: 1200_00 }).expect(201)).body;
      expect(good.status).toBe('matched');

      await http().post(`/v1/inventory/purchase-orders/${poId}/receipts`).set(as('store_keeper')).send({ idempotencyKey: 'grn-key-0003', lines: [{ poLineId: lineId, qty: 40 }] }).expect(201);
      expect((await http().get(`/v1/inventory/purchase-orders/${poId}`).set(as('store_keeper')).expect(200)).body.status).toBe('received');
      const actions = (await db.select().from(s.auditLog).where(eq(s.auditLog.tenantId, t.tenantId))).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['inventory.requisition_approved', 'inventory.po_issued', 'inventory.goods_received', 'inventory.invoice_mismatch', 'inventory.invoice_approved']));
    });

    it('a requester cannot approve their own requisition', async () => {
      const r = (await http().post('/v1/inventory/requisitions').set(as('principal')).send({ lines: [{ itemId, qty: 1 }] }).expect(201)).body;
      await http().post(`/v1/inventory/requisitions/${r.id}/decision`).set(as('principal')).send({ approve: true }).expect(403);
    });
  });

  describe('assets', () => {
    it('registers with a QR tag, allocates once, services, depreciates and disposes', async () => {
      const body = { name: 'Projector', category: 'AV', purchasedOn: '2024-01-01', costPaise: 50_000_00, salvagePaise: 5_000_00, usefulLifeYears: 5 };
      await http().post('/v1/assets').set(as('store_keeper')).send({ ...body, salvagePaise: 60_000_00 }).expect(400);
      await http().post('/v1/assets').set(as('store_keeper')).send({ ...body, method: 'wdv' }).expect(400);
      const a = (await http().post('/v1/assets').set(as('store_keeper')).send(body).expect(201)).body;
      expect(a).toMatchObject({ tag: 'AST-0001', qr: 'kinetix://asset/AST-0001' });
      const w = (await http().post('/v1/assets').set(as('store_keeper')).send({ ...body, name: 'Laptop', method: 'wdv', wdvRatePct: 40 }).expect(201)).body;
      expect(w.tag).toBe('AST-0002');

      const d = (await http().get(`/v1/assets/by-tag/AST-0001`).set(as('store_keeper')).expect(200)).body;
      expect(d.depreciation.map((r: { depreciationPaise: number }) => r.depreciationPaise)).toEqual(Array(5).fill(9_000_00));
      expect(d.depreciation[4].bookValuePaise).toBe(5_000_00);
      const wd = (await http().get(`/v1/assets/${w.id}`).set(as('store_keeper')).expect(200)).body;
      expect(wd.depreciation[0]).toMatchObject({ depreciationPaise: 20_000_00, bookValuePaise: 30_000_00 });

      await http().post(`/v1/assets/${a.id}/allocate`).set(as('store_keeper')).send({ assignedTo: 'Room 4' }).expect(201);
      await http().post(`/v1/assets/${a.id}/allocate`).set(as('store_keeper')).send({ assignedTo: 'Room 5' }).expect(409);
      expect((await http().get('/v1/assets').set(as('store_keeper')).expect(200)).body.find((x: { id: string }) => x.id === a.id).assignedTo).toBe('Room 4');
      await http().post(`/v1/assets/${a.id}/return`).set(as('store_keeper')).expect(200);
      await http().post(`/v1/assets/${a.id}/return`).set(as('store_keeper')).expect(409);

      await http().post(`/v1/assets/${a.id}/maintenance`).set(as('store_keeper')).send({ kind: 'repair', doneOn: day(-2), costPaise: 1_200_00, nextDueOn: day(10), ongoing: true }).expect(201);
      expect((await http().get(`/v1/assets/${a.id}`).set(as('store_keeper')).expect(200)).body.status).toBe('in_maintenance');
      expect((await http().get('/v1/assets/maintenance-due').set(as('store_keeper')).expect(200)).body.map((x: { tag: string }) => x.tag)).toEqual(['AST-0001']);
      await http().post(`/v1/assets/${a.id}/maintenance`).set(as('store_keeper')).send({ kind: 'inspection', doneOn: day(0), nextDueOn: day(-3) }).expect(400);

      await http().post(`/v1/assets/${a.id}/dispose`).set(as('teacher')).send({ disposedOn: day(0) }).expect(403);
      await http().post(`/v1/assets/${a.id}/dispose`).set(as('store_keeper')).send({ disposedOn: day(0), disposalPaise: 2_000_00 }).expect(200);
      await http().post(`/v1/assets/${a.id}/dispose`).set(as('store_keeper')).send({ disposedOn: day(0) }).expect(409);
      await http().post(`/v1/assets/${a.id}/allocate`).set(as('store_keeper')).send({ assignedTo: 'x' }).expect(409);
      expect((await http().get('/v1/assets?status=disposed').set(as('store_keeper')).expect(200)).body).toHaveLength(1);
    });
  });
});
