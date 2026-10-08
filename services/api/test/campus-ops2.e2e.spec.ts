import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import * as s from '../src/db/schema.js';
import { DemoPaymentProvider } from '../src/fees/payment-provider.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('campus operations depth: hostel, transport, canteen', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date()), (bld) => bld.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PAYMENTS_PROVIDER: 'demo' })));
    for (const role of ['transport_manager', 'driver', 'hostel_warden', 'canteen_manager'] as const) {
      const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: role, email: `${role}-${Math.random().toString(36).slice(2, 6)}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
      await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role, campusId: t.campus.id });
      ids[role] = u.id;
      tokens[role] = await login(u.email!);
    }
    tokens.principal = await login(t.principal.email!);
    tokens.teacher = await login(t.teacher.email!);
    tokens.parent = await login(t.guardian.email!);
    tokens.parent2 = await login(t.guardian2.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('hostel', () => {
    let beds: { bedId: string }[] = [];
    let allotmentId = '';

    it('keeps a waitlist, allots from it and transfers a resident between beds', async () => {
      const blk = (await http().post('/v1/hostel/blocks').set(as('hostel_warden')).send({ name: 'Block A' }).expect(201)).body;
      await http().post(`/v1/hostel/blocks/${blk.id}/rooms`).set(as('hostel_warden')).send({ number: '101', beds: 3 }).expect(201);
      beds = (await http().get('/v1/hostel/beds?free=true').set(as('hostel_warden')).expect(200)).body;
      const [s1, s2] = t.students;
      const w1 = (await http().post('/v1/hostel/waitlist').set(as('hostel_warden')).send({ studentId: s1.id, blockId: blk.id }).expect(201)).body;
      await http().post('/v1/hostel/waitlist').set(as('hostel_warden')).send({ studentId: s1.id }).expect(409);
      await http().post('/v1/hostel/waitlist').set(as('teacher')).send({ studentId: s2.id }).expect(403);
      await http().post('/v1/hostel/waitlist').set(as('hostel_warden')).send({ studentId: s2.id }).expect(201);
      expect((await http().get('/v1/hostel/waitlist').set(as('hostel_warden')).expect(200)).body.map((w: { position: number; block: string | null }) => [w.position, w.block])).toEqual([[1, 'Block A'], [2, null]]);
      const al = (await http().post(`/v1/hostel/waitlist/${w1.id}/allot`).set(as('hostel_warden')).send({ bedId: beds[0].bedId }).expect(201)).body;
      allotmentId = al.id;
      await http().post(`/v1/hostel/waitlist/${w1.id}/allot`).set(as('hostel_warden')).send({ bedId: beds[1].bedId }).expect(409);
      await http().post('/v1/hostel/waitlist').set(as('hostel_warden')).send({ studentId: s1.id }).expect(409); // has a bed now
      const w2 = (await http().get('/v1/hostel/waitlist').set(as('hostel_warden')).expect(200)).body[0];
      await http().post(`/v1/hostel/waitlist/${w2.id}/allot`).set(as('hostel_warden')).send({ bedId: beds[0].bedId }).expect(409); // taken
      await http().post(`/v1/hostel/waitlist/${w2.id}/cancel`).set(as('hostel_warden')).expect(200);
      expect((await http().get('/v1/hostel/waitlist').set(as('hostel_warden')).expect(200)).body).toHaveLength(0);

      await http().post(`/v1/hostel/allotments/${allotmentId}/transfer`).set(as('hostel_warden')).send({ bedId: beds[0].bedId, reason: 'Noisy' }).expect(400);
      const moved = (await http().post(`/v1/hostel/allotments/${allotmentId}/transfer`).set(as('hostel_warden')).send({ bedId: beds[2].bedId, reason: 'Closer to the warden' }).expect(201)).body;
      await http().post(`/v1/hostel/allotments/${allotmentId}/transfer`).set(as('hostel_warden')).send({ bedId: beds[1].bedId, reason: 'Again' }).expect(409); // old allotment is closed
      const now = (await http().get('/v1/hostel/beds').set(as('hostel_warden')).expect(200)).body as { bedId: string; studentId: string | null }[];
      expect(now.find((x) => x.studentId === s1.id)?.bedId).toBe(beds[2].bedId);
      expect(now.find((x) => x.bedId === beds[0].bedId)?.studentId).toBeNull();
      expect((await db.select().from(s.hostelTransfers)).map((x) => x.reason)).toEqual(['Closer to the warden']);
      allotmentId = moved.id;
    });

    it('takes the night roll call, alerts the family once on absence, and treats a student out on a pass as on leave', async () => {
      const [s1, s2] = t.students;
      await http().post('/v1/hostel/allotments').set(as('hostel_warden')).send({ studentId: s2.id, bedId: beds[0].bedId }).expect(201);
      await http().post('/v1/hostel/night-attendance').set(as('hostel_warden')).send({ marks: [{ studentId: t.students[2].id, status: 'present' }] }).expect(400); // not a resident
      await http().post('/v1/hostel/night-attendance').set(as('teacher')).send({ marks: [{ studentId: s1.id, status: 'present' }] }).expect(403);
      await http().post('/v1/hostel/night-attendance').set(as('hostel_warden')).send({ night: '2999-01-01', marks: [{ studentId: s1.id, status: 'present' }] }).expect(400);
      const roll = { marks: [{ studentId: s1.id, status: 'absent' }, { studentId: s2.id, status: 'present' }] };
      expect((await http().post('/v1/hostel/night-attendance').set(as('hostel_warden')).send(roll).expect(200)).body).toMatchObject({ marked: 2, absent: 1 });
      await http().post('/v1/hostel/night-attendance').set(as('hostel_warden')).send(roll).expect(200); // marking again: still one alert
      const alerts = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, t.guardian.id), eq(s.notifications.kind, 'hostel')));
      expect(alerts).toHaveLength(1);
      expect(alerts[0].data).toMatchObject({ studentId: s1.id, event: 'absent' });
      const sheet = (await http().get('/v1/hostel/night-attendance').set(as('hostel_warden')).expect(200)).body;
      expect(sheet).toMatchObject({ night: today, present: 1, absent: 1, leave: 0, unmarked: 0 });
      const mine = (await http().get(`/v1/hostel/students/${s1.id}`).set(as('parent')).expect(200)).body;
      expect(mine.nights).toEqual([{ night: today, status: 'absent' }]);
      await http().get(`/v1/hostel/students/${s1.id}`).set(as('parent2')).expect(404);
      // out on a pass: next night's absence becomes leave and no alert
      const pass = (await http().post('/v1/hostel/gate-passes').set(as('hostel_warden')).send({ studentId: s2.id, reason: 'Home', expectedBackAt: new Date(Date.now() + 86400_000).toISOString() }).expect(201)).body;
      await http().post(`/v1/hostel/gate-passes/${pass.id}/out`).set(as('hostel_warden')).expect(200);
      const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86400_000));
      await http().post('/v1/hostel/night-attendance').set(as('hostel_warden')).send({ night: yesterday, marks: [{ studentId: s2.id, status: 'absent' }] }).expect(200);
      const [row] = await db.select().from(s.hostelNightAttendance).where(and(eq(s.hostelNightAttendance.studentId, s2.id), eq(s.hostelNightAttendance.night, yesterday)));
      expect(row.status).toBe('leave');
      expect(await db.select().from(s.notifications).where(and(eq(s.notifications.userId, t.guardian2.id), eq(s.notifications.kind, 'hostel')))).toHaveLength(1); // only the gate-out notice
    });
  });

  describe('transport', () => {
    let vehicleId = '';
    let routeId = '';

    it('tracks fuel and expenses per vehicle with cost per km and mileage', async () => {
      vehicleId = (await http().post('/v1/transport/vehicles').set(as('transport_manager')).send({ regNo: 'KA05GP0001', capacity: 30 }).expect(201)).body.id;
      const fill = (spentOn: string, litres: number | undefined, amountPaise: number, odometerKm?: number, kind = 'fuel') => ({ vehicleId, kind, spentOn, litres, amountPaise, odometerKm });
      await http().post('/v1/transport/expenses').set(as('transport_manager')).send(fill('2026-09-01', undefined, 3000_00, 1000)).expect(400); // fuel needs litres
      await http().post('/v1/transport/expenses').set(as('teacher')).send(fill('2026-09-01', 30, 3000_00, 1000)).expect(403);
      await http().post('/v1/transport/expenses').set(as('transport_manager')).send(fill('2026-09-01', 30, 3000_00, 1000)).expect(201);
      await http().post('/v1/transport/expenses').set(as('transport_manager')).send(fill('2026-09-10', 40, 4000_00, 1400)).expect(201);
      await http().post('/v1/transport/expenses').set(as('transport_manager')).send(fill('2026-09-11', 10, 1000_00, 1300)).expect(400); // odometer backwards
      await http().post('/v1/transport/expenses').set(as('transport_manager')).send(fill('2026-09-12', undefined, 500_00, undefined, 'toll')).expect(201);
      const sum = (await http().get('/v1/transport/expenses/summary').set(as('transport_manager')).expect(200)).body;
      expect(sum).toEqual([{ vehicleId, regNo: 'KA05GP0001', totalPaise: 7500_00, fuelPaise: 7000_00, litres: 70, km: 400, costPerKmPaise: 1875, kmPerLitre: 10 }]);
      expect((await http().get(`/v1/transport/expenses?vehicleId=${vehicleId}`).set(as('transport_manager')).expect(200)).body).toHaveLength(3);
    });

    it('records incidents from the driver and the office, and resolves them', async () => {
      const d = (await http().post('/v1/transport/drivers').set(as('transport_manager')).send({ fullName: 'Ramesh', userId: ids.driver, licenseNo: 'DL9', licenseExpiresOn: '2030-01-01' }).expect(201)).body;
      routeId = (await http().post('/v1/transport/routes').set(as('transport_manager')).send({ name: 'GPS Route', vehicleId, driverId: d.id }).expect(201)).body.id;
      await http().post(`/v1/transport/routes/${routeId}/stops`).set(as('transport_manager')).send({ name: 'Market', lat: 12.97, lng: 77.59 }).expect(201);
      const trip = (await http().post('/v1/transport/trips').set(as('driver')).send({ routeId, direction: 'pickup' }).expect(201)).body;
      const inc = (await http().post('/v1/transport/incidents').set(as('driver')).send({ tripId: trip.id, kind: 'breakdown', severity: 'medium', description: 'Flat tyre near the market' }).expect(201)).body;
      expect(inc).toMatchObject({ vehicleId, status: 'open', severity: 'medium' });
      await http().post('/v1/transport/incidents').set(as('driver')).send({ kind: 'delay', description: 'Traffic jam' }).expect(400); // needs a vehicle or trip
      await http().post('/v1/transport/incidents').set(as('transport_manager')).send({ vehicleId, kind: 'accident', severity: 'high', description: 'Scratch in the depot' }).expect(201);
      await http().post('/v1/transport/incidents').set(as('teacher')).send({ vehicleId, kind: 'delay', description: 'x ok' }).expect(403);
      await http().get('/v1/transport/incidents').set(as('driver')).expect(403);
      expect((await http().get('/v1/transport/incidents?status=open').set(as('transport_manager')).expect(200)).body).toHaveLength(2);
      await http().post(`/v1/transport/incidents/${inc.id}/resolve`).set(as('transport_manager')).send({ resolution: 'Tyre changed' }).expect(200);
      await http().post(`/v1/transport/incidents/${inc.id}/resolve`).set(as('transport_manager')).send({ resolution: 'Again' }).expect(409);
      expect((await http().get('/v1/transport/incidents?status=open').set(as('transport_manager')).expect(200)).body).toHaveLength(1);
    });

    it('takes positions from a GPS vendor webhook with a per-source token', async () => {
      const src = (await http().post('/v1/transport/gps/sources').set(as('transport_manager')).send({ name: 'TrackCo' }).expect(201)).body;
      expect(src.token).toMatch(/^gps_/);
      expect((await http().get('/v1/transport/gps/sources').set(as('transport_manager')).expect(200)).body[0]).not.toHaveProperty('token');
      const post = (token: string | undefined, body: unknown, slug = t.slug) => {
        const r = http().post(`/v1/transport/gps/${slug}`);
        return (token ? r.set('x-gps-token', token) : r).send(body as object);
      };
      await post(undefined, { vehicle: 'KA05GP0001', lat: 12.9, lng: 77.5 }).expect(404);
      await post('gps_wrong', { vehicle: 'KA05GP0001', lat: 12.9, lng: 77.5 }).expect(401);
      expect((await post(src.token, { vehicle: 'ka05gp0001', lat: 12.9, lng: 77.5, speed: 25 }).expect(200)).body).toEqual({ accepted: 1 });
      expect((await post(src.token, { positions: [{ vehicle: 'UNKNOWN', lat: 1, lng: 1 }] }).expect(200)).body).toEqual({ accepted: 0 });
      const [trip] = await db.select().from(s.transportTrips).where(eq(s.transportTrips.routeId, routeId));
      expect(trip).toMatchObject({ lastLat: 12.9, lastLng: 77.5, lastSpeedKmh: 25, pings: 1 });
      await http().post(`/v1/transport/gps/sources/${src.id}/revoke`).set(as('transport_manager')).expect(200);
      await post(src.token, { vehicle: 'KA05GP0001', lat: 12.9, lng: 77.5 }).expect(401);
    });
  });

  describe('canteen', () => {
    it('marks meal attendance idempotently and shows the day count', async () => {
      const [s1, s2] = t.students;
      const body = { meal: 'lunch', studentIds: [s1.id, s2.id] };
      expect((await http().post('/v1/canteen/meal-attendance').set(as('canteen_manager')).send(body).expect(200)).body).toMatchObject({ date: today, marked: 2, alreadyMarked: 0 });
      expect((await http().post('/v1/canteen/meal-attendance').set(as('canteen_manager')).send({ ...body, studentIds: [s1.id] }).expect(200)).body).toMatchObject({ marked: 0, alreadyMarked: 1 });
      await http().post('/v1/canteen/meal-attendance').set(as('teacher')).send(body).expect(403);
      await http().post('/v1/canteen/meal-attendance').set(as('canteen_manager')).send({ ...body, date: '2999-01-01' }).expect(400);
      const day = (await http().get('/v1/canteen/meal-attendance').set(as('canteen_manager')).expect(200)).body;
      expect(day.meals.find((m: { meal: string }) => m.meal === 'lunch').count).toBe(2);
      expect(day.meals.find((m: { meal: string }) => m.meal === 'dinner').count).toBe(0);
      const fam = (await http().get(`/v1/canteen/students/${s1.id}`).set(as('parent')).expect(200)).body;
      expect(fam.meals).toEqual([{ date: today, meal: 'lunch' }]);
    });

    it('tops up the wallet online through the gateway: confirm and webhook credit once', async () => {
      const s1 = t.students[0];
      await http().post(`/v1/canteen/students/${s1.id}/topup-checkout`).set(as('parent2')).send({ amountPaise: 500_00 }).expect(404);
      await http().post(`/v1/canteen/students/${s1.id}/topup-checkout`).set(as('parent')).send({ amountPaise: 50 }).expect(400);
      const order = (await http().post(`/v1/canteen/students/${s1.id}/topup-checkout`).set(as('parent')).send({ amountPaise: 500_00 }).expect(201)).body;
      expect(order).toMatchObject({ provider: 'demo', amountPaise: 500_00, currency: 'INR', description: 'Canteen wallet' });
      const bal = async () => (await http().get(`/v1/canteen/students/${s1.id}`).set(as('parent')).expect(200)).body.balancePaise as number;
      expect(await bal()).toBe(0);
      const confirm = (sig: string, as_ = 'parent') => http().post(`/v1/canteen/topups/${order.topupId}/confirm`).set(as(as_)).send({ providerPaymentId: 'pay_w1', signature: sig });
      await confirm('bad').expect(403);
      await confirm(DemoPaymentProvider.sign(order.orderId, 'pay_w1'), 'parent2').expect(404);
      expect((await confirm(DemoPaymentProvider.sign(order.orderId, 'pay_w1')).expect(200)).body).toEqual({ balancePaise: 500_00, repeated: false });
      expect((await confirm(DemoPaymentProvider.sign(order.orderId, 'pay_w1')).expect(200)).body.repeated).toBe(true);
      // the webhook after the confirm adds nothing; a webhook alone credits a second top-up
      const hook = (orderId: string, amount: number) => {
        const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w2', order_id: orderId, amount, status: 'captured' } } } });
        return http().post(`/v1/fees/webhooks/razorpay/${t.slug}`).set('content-type', 'application/json').set('x-razorpay-signature', createHmac('sha256', DemoPaymentProvider.SECRET).update(raw).digest('hex')).send(raw);
      };
      await hook(order.orderId, 500_00).expect(200);
      expect(await bal()).toBe(500_00);
      const second = (await http().post(`/v1/canteen/students/${s1.id}/topup-checkout`).set(as('parent')).send({ amountPaise: 200_00 }).expect(201)).body;
      await hook(second.orderId, 100_00).expect(200); // wrong amount: ignored
      expect(await bal()).toBe(500_00);
      await hook(second.orderId, 200_00).expect(200);
      await hook(second.orderId, 200_00).expect(200);
      expect(await bal()).toBe(700_00);
      const txns = (await http().get(`/v1/canteen/students/${s1.id}`).set(as('parent')).expect(200)).body.txns;
      expect(txns.map((x: { deltaPaise: number }) => x.deltaPaise).sort()).toEqual([200_00, 500_00]);
    });
  });
});
