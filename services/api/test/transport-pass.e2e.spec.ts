import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../src/common/lht-kit.js';
import { cancelCredit } from '../src/transport/transport-rules.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * Transport production pass: fare slabs by distance, driver verification and the woman attendant, the school-bus
 * safety matrix, expiry reminders, boarding and alighting (conductor, bus pass QR) with the manifest, the delay and
 * not-boarded notices, the left-on-board check, SOS, the live board, the trip sheet, occupancy suggestions, stale GPS
 * fixes, cancellation credits on a billed month (unpaid and paid), permissions and another institution.
 * The clock is a Monday at 07:00 IST, so the 06:30 stop is late and the 07:40 one is not.
 */
describe('transport pass', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('07:00'));
  const today = new Date(clock.at.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const post = (who: string, path: string, body: object = {}) => http().post(path).set(as(who)).send(body);
  const get = (who: string, path: string) => http().get(path).set(as(who));
  const action = (who: string, entity: string, id: string, name: string, params?: object) => post(who, `/v1/records/${entity}/bulk`, { op: 'action', action: name, target: { ids: [id] }, ...(params && { params }) });
  const user = async (name: string, role: string, key: string) => {
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, name, `${key}-${t.slug}@x.in`, await argon2.hash('pw')]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, $3, $4)`, [t.tenantId, rows[0].id, role, t.campus.id]);
    return rows[0].id as string;
  };
  const notices = async (userId: string, like: string) => (await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and (title || ' ' || body) ilike $3`, [t.tenantId, userId, `%${like}%`])).rows[0].n as number;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    ids.manager = await user('Tara Transport', 'transport_manager', 'tm');
    ids.driverUser = await user('Dev Driver', 'teacher', 'drv');
    ids.conductorUser = await user('Cora Conductor', 'teacher', 'cond');
    tokens.tm = await login(t.slug, `tm-${t.slug}@x.in`);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('prices stops by distance from fare slabs and refuses overlapping slabs', async () => {
    await post('tm', '/v1/records/transport-fare-slabs', { fromKm: 0, toKm: 5, fee: 1200 }).expect(201);
    await post('tm', '/v1/records/transport-fare-slabs', { fromKm: 5, toKm: 10, fee: 1800 }).expect(201);
    expect((await post('tm', '/v1/records/transport-fare-slabs', { fromKm: 8, toKm: 12, fee: 2000 }).expect(400)).body.message).toContain('overlaps');
    await post('tm', '/v1/records/transport-fare-slabs', { fromKm: 4, toKm: 3, fee: 1 }).expect(400);
    const later = addDays(today, 200);
    const bus = (await post('tm', '/v1/records/transport-vehicles', { regNo: 'KA01TP0001', capacity: 40, status: 'active', insuranceExpiresOn: later, fitnessExpiresOn: later, pucExpiresOn: later, gpsDevice: 'TRK-1' }).expect(201)).body;
    const van = (await post('tm', '/v1/records/transport-vehicles', { regNo: 'KA01TP0002', capacity: 12, status: 'active', insuranceExpiresOn: addDays(today, 7) }).expect(201)).body;
    ids.bus = bus.id;
    ids.van = van.id;
    const driver = (await post('tm', '/v1/records/transport-drivers', { fullName: 'Dev Driver', role: 'driver', userId: ids.driverUser, licenseExpiresOn: later }).expect(201)).body;
    const conductor = (await post('tm', '/v1/records/transport-drivers', { fullName: 'Cora Conductor', role: 'conductor', userId: ids.conductorUser }).expect(201)).body;
    ids.driver = driver.id;
    ids.conductor = conductor.id;
    const route = (await post('tm', '/v1/records/transport-routes', { name: 'Route P', vehicleId: bus.id, driverId: driver.id, conductorId: conductor.id, fee: 2500 }).expect(201)).body;
    ids.route = route.id;
    expect(route).toMatchObject({ conductorName: 'Cora Conductor', attendantName: null });
    const s1 = (await post('tm', '/v1/records/transport-stops', { routeId: route.id, name: 'Lake', lat: 12.97, lng: 77.59, pickupTime: '06:30', distanceKm: 3 }).expect(201)).body;
    const s2 = (await post('tm', '/v1/records/transport-stops', { routeId: route.id, name: 'Temple', lat: 12.98, lng: 77.59, pickupTime: '07:40', distanceKm: 7 }).expect(201)).body;
    const s3 = (await post('tm', '/v1/records/transport-stops', { routeId: route.id, name: 'Campus', lat: 12.99, lng: 77.59, distanceKm: 12 }).expect(201)).body;
    expect([s1.effectiveFeeRupees, s2.effectiveFeeRupees, s3.effectiveFeeRupees]).toEqual([1200, 1800, 2500]); // beyond every slab: the route's fee
    Object.assign(ids, { s1: s1.id, s2: s2.id, s3: s3.id });
    await post('tm', '/v1/records/transport-fare-slabs', { fromKm: 10, toKm: 15, fee: 2400 }).expect(201);
    const dry = (await post('tm', '/v1/transport/fare-slabs/apply', { dryRun: true }).expect(200)).body;
    expect(dry).toMatchObject({ dryRun: true, updated: 1, unchanged: 2, changes: [{ stop: 'Campus', beforePaise: null, afterPaise: 240_000 }] });
    expect((await get('tm', `/v1/records/transport-stops/${s3.id}`).expect(200)).body.feeRupees).toBeNull();
    expect((await post('tm', '/v1/transport/fare-slabs/apply', {}).expect(200)).body.updated).toBe(1);
    expect((await get('tm', `/v1/records/transport-stops/${s3.id}`).expect(200)).body.feeRupees).toBe(2400);
    expect(JSON.stringify((await get("tm", `/v1/records/transport-stops/${s3.id}/history`).expect(200)).body)).toContain("transport_stop.fare_from_slab");
    // Seats from the 1st of the month: A and C at Lake, B at Temple.
    const from = `${month}-01`;
    for (const [roll, stop] of [['R1', s1.id], ['R2', s2.id], ['R3', s1.id]]) await post('tm', '/v1/records/transport-riders', { kind: 'student', student: roll, stopId: stop, startsOn: from }).expect(201);
  });

  it('keeps the safety matrix: checklist, papers, woman attendant, verified driver', async () => {
    const before = (await get('tm', '/v1/transport/safety').expect(200)).body;
    const bus = before.vehicles.find((v: { regNo: string }) => v.regNo === 'KA01TP0001');
    expect(bus.compliant).toBe(false);
    expect(bus.gaps).toEqual(expect.arrayContaining(['speedGovernor', 'cctvWorking', 'femaleAttendant', 'driverPoliceVerified', 'driverMedical', 'driverExperience', 'checkDue']));
    expect(bus.derived).toMatchObject({ papers: true, gpsTracker: true, conductor: true, driverLicence: true });
    // Fix every gap: a woman attendant, the driver's verification record, a full checklist.
    const att = (await post('tm', '/v1/records/transport-drivers', { fullName: 'Pushpa', role: 'attendant', gender: 'female' }).expect(201)).body;
    await http().patch(`/v1/records/transport-routes/${ids.route}`).set(as('tm')).send({ attendantId: att.id }).expect(200);
    await http().patch(`/v1/records/transport-drivers/${ids.driver}`).set(as('tm')).send({ policeVerifiedOn: addDays(today, -30), policeVerificationRef: 'PV/2026/118', medicalValidUntil: addDays(today, 300), licenceIssuedOn: addDays(today, -6 * 366 - 20), licenceClass: 'HMV' }).expect(200);
    expect((await get('tm', `/v1/records/transport-drivers/${ids.driver}`).expect(200)).body).toMatchObject({ verified: true, licenceYears: 6 });
    const all = { speedGovernor: true, gpsWorking: true, cctvWorking: true, firstAidBox: true, fireExtinguisher: true, emergencyExit: true, windowGrills: true, doorLocks: true, yellowPaint: true, schoolBusSign: true, schoolNamePhone: true, seatBelts: true, panicButton: true };
    await post('tm', '/v1/records/transport-safety-checks', { vehicleId: ids.bus, checkedOn: addDays(today, 1), ...all }).expect(400); // not in the future
    const check = (await post('tm', '/v1/records/transport-safety-checks', { vehicleId: ids.bus, checkedOn: today, ...all, note: 'All present' }).expect(201)).body;
    expect(check).toMatchObject({ passed: true, nextDueOn: addDays(today, 90), failed: '' });
    expect((await http().delete(`/v1/records/transport-safety-checks/${check.id}`).set(as('tm')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
    const after = (await get('tm', '/v1/transport/safety').expect(200)).body;
    expect(after.vehicles.find((v: { regNo: string }) => v.regNo === 'KA01TP0001')).toMatchObject({ compliant: true, gaps: [], attendant: { name: 'Pushpa', gender: 'female' } });
    // The van is on no route: only its own papers and checklist count.
    expect(after.vehicles.find((v: { regNo: string }) => v.regNo === 'KA01TP0002').gaps).not.toContain('femaleAttendant');
  });

  it('reminds the office of papers falling due, once per reminder day', async () => {
    const r = (await post('tm', '/v1/transport/expiry-reminders/run').expect(200)).body;
    expect(r.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'insurance', subject: 'KA01TP0002', daysLeft: 7 })]));
    const n = await notices(ids.manager, 'KA01TP0002: insurance due in 7 days');
    expect(n).toBe(1);
    await post('tm', '/v1/transport/expiry-reminders/run').expect(200);
    expect(await notices(ids.manager, 'KA01TP0002: insurance due in 7 days')).toBe(1);
  });

  it('runs a pick-up: delay notice, boarding by the conductor and the pass QR, the manifest, not-boarded alert, live board and trip sheet', async () => {
    tokens.drv = await login(t.slug, `drv-${t.slug}@x.in`);
    tokens.cond = await login(t.slug, `cond-${t.slug}@x.in`);
    const me = (await get('cond', '/v1/transport/me').expect(200)).body;
    expect(me.routes).toEqual([expect.objectContaining({ name: 'Route P', role: 'conductor' })]);
    await post('cond', '/v1/transport/trips', { routeId: ids.route, direction: 'pickup' }).expect(404); // only the driver starts a run
    const trip = (await post('drv', '/v1/transport/trips', { routeId: ids.route, direction: 'pickup', odometerKm: 1000 }).expect(201)).body;
    ids.trip = trip.id;
    expect(trip).toMatchObject({ vehicleId: ids.bus, startOdometerKm: 1000 });
    expect((await get('cond', '/v1/transport/me').expect(200)).body.trip.id).toBe(trip.id);

    // 1.1 km before Lake (06:30) at 07:00: the bus is late; families ahead and the office are told once.
    const ping = (await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.96, lng: 77.59, speedKmh: 30 }).expect(200)).body;
    expect(ping.lateMinutes).toBeGreaterThanOrEqual(32);
    expect(await notices(t.guardian.id, 'running about')).toBe(1);
    expect(await notices(ids.manager, 'running about')).toBe(1);
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.961, lng: 77.59, speedKmh: 30 }).expect(200);
    expect(await notices(t.guardian.id, 'running about')).toBe(1);

    // On the bus: A by the conductor, C by scanning the bus pass, A again is a duplicate.
    const a = (await post('cond', `/v1/transport/trips/${trip.id}/boardings`, { studentId: t.students[0].id, kind: 'board' }).expect(200)).body;
    expect(a).toMatchObject({ method: 'manual', duplicate: false, stopId: ids.s1 });
    expect(await notices(t.guardian.id, 'boarded the bus')).toBe(1);
    const seats = (await get('tm', `/v1/records/transport-riders?f.route=${ids.route}&f.status=riding`).expect(200)).body.rows;
    const seatC = seats.find((r: { rollNo: string }) => r.rollNo === 'R3');
    expect((await post('cond', `/v1/transport/trips/${trip.id}/boardings`, { code: `KXBUS:${seatC.id}:${t.students[2].id}`, kind: 'board' }).expect(200)).body).toMatchObject({ method: 'qr', duplicate: false });
    expect((await post('cond', `/v1/transport/trips/${trip.id}/boardings`, { studentId: t.students[0].id, kind: 'board' }).expect(200)).body.duplicate).toBe(true);
    await post('cond', `/v1/transport/trips/${trip.id}/boardings`, { code: 'KXLIB:nonsense-code', kind: 'board' }).expect(400);
    await post('cond', `/v1/transport/trips/${trip.id}/boardings`, { studentId: other.students[0].id, kind: 'board' }).expect(409);
    await post('cond', `/v1/transport/trips/${trip.id}/boardings`, { kind: 'board' }).expect(400);
    await post('teacher', `/v1/transport/trips/${trip.id}/boardings`, { studentId: t.students[0].id, kind: 'board' }).expect(403);

    // Lake, Temple, then the campus: B was never marked at Temple, so B's family hears once the bus moves on.
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.97, lng: 77.59, speedKmh: 20 }).expect(200);
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.98, lng: 77.59, speedKmh: 20 }).expect(200);
    expect(await notices(t.guardian2.id, 'did not board')).toBe(0);
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.99, lng: 77.59, speedKmh: 10 }).expect(200);
    expect(await notices(t.guardian2.id, 'did not board')).toBe(1);
    expect(await notices(t.guardian.id, 'did not board')).toBe(0);
    const man = (await get('cond', `/v1/transport/trips/${trip.id}/manifest`).expect(200)).body;
    expect(man.counts).toEqual({ riders: 3, boarded: 2, alighted: 0, onBoard: 2 });
    expect(man.riders.map((r: { name: string }) => r.name)).toEqual(['Student A', 'Student C', 'Student B']);

    const live = (await get('tm', '/v1/transport/live').expect(200)).body.trips;
    expect(live).toEqual([expect.objectContaining({ tripId: trip.id, regNo: 'KA01TP0001', riders: 3, boarded: 2, stopsReached: 3, stopsTotal: 3, sos: false, notBoarded: 1 })]);
    expect(live[0].lateMinutes).toBeGreaterThanOrEqual(32);
    // The family's view: today's boarding, the pass, the crew, the fee.
    const view = (await get('parent', `/v1/transport/students/${t.students[0].id}`).expect(200)).body;
    expect(view.today).toEqual([expect.objectContaining({ kind: 'board', method: 'manual', stopName: 'Lake' })]);
    expect(view).toMatchObject({ crew: { driver: 'Dev Driver', attendant: 'Pushpa' }, pass: { valid: true, pdf: `/v1/transport/passes/${t.students[0].id}.pdf` }, fee: { duePaise: 0 } });

    await post('drv', `/v1/transport/trips/${trip.id}/end`, { odometerKm: 990 }).expect(400);
    expect((await post('drv', `/v1/transport/trips/${trip.id}/end`, { odometerKm: 1032 }).expect(200)).body).toMatchObject({ endOdometerKm: 1032, leftOnBoard: 0 });
    expect((await get('tm', `/v1/records/transport-trips/${trip.id}`).expect(200)).body).toMatchObject({ regNo: 'KA01TP0001', km: 32, boarded: 2 });
    const sheet = (await get('tm', `/v1/ops-reports/transport.trip-sheet?from=${today}&to=${today}`).expect(200)).body.rows;
    expect(sheet[0]).toMatchObject({ route: 'Route P', km: 32, boarded: 2 });
    expect((await get('tm', '/v1/records/transport-boardings?f.day=${today}').expect(200)).body.total).toBe(2);
    await post('drv', '/v1/transport/trips', { routeId: ids.route, direction: 'drop', odometerKm: 900 }).expect(400); // odometer went back
  });

  it('flags a child never marked off a drop run, and raises an SOS', async () => {
    const drop = (await post('drv', '/v1/transport/trips', { routeId: ids.route, direction: 'drop', odometerKm: 1040 }).expect(201)).body;
    await post('cond', `/v1/transport/trips/${drop.id}/boardings`, { studentId: t.students[0].id, kind: 'board' }).expect(200);
    await post('cond', `/v1/transport/trips/${drop.id}/boardings`, { studentId: t.students[2].id, kind: 'board' }).expect(200);
    await post('cond', `/v1/transport/trips/${drop.id}/boardings`, { studentId: t.students[2].id, kind: 'alight' }).expect(200);
    await post('parent', `/v1/transport/trips/${drop.id}/sos`, {}).expect(403);
    const sos = (await post('drv', `/v1/transport/trips/${drop.id}/sos`, { lat: 12.975, lng: 77.59, note: 'Tyre burst' }).expect(200)).body;
    expect(sos).toMatchObject({ kind: 'sos', severity: 'high', repeated: false, vehicleId: ids.bus });
    expect((await post('drv', `/v1/transport/trips/${drop.id}/sos`, {}).expect(200)).body).toMatchObject({ id: sos.id, repeated: true });
    expect(await notices(ids.manager, 'SOS: Route P')).toBe(1);
    expect((await get('tm', '/v1/transport/live').expect(200)).body.trips[0]).toMatchObject({ tripId: drop.id, sos: true });
    expect((await get('tm', '/v1/records/transport-incidents?f.kind=sos').expect(200)).body.total).toBe(1);
    expect((await post('drv', `/v1/transport/trips/${drop.id}/end`, { odometerKm: 1070 }).expect(200)).body.leftOnBoard).toBe(1);
    expect(await notices(ids.manager, 'not marked off')).toBe(1);
    expect(await notices(ids.driverUser, 'not marked off')).toBe(1);
    await post('drv', `/v1/transport/trips/${drop.id}/sos`, {}).expect(409);
  });

  it('skips a GPS vendor fix older than the last one', async () => {
    const src = (await post('tm', '/v1/transport/gps/sources', { name: 'TrackCo' }).expect(201)).body;
    const trip = (await post('drv', '/v1/transport/trips', { routeId: ids.route, direction: 'pickup' }).expect(201)).body;
    const send = (body: object) => http().post(`/v1/transport/gps/${t.slug}`).set('x-gps-token', src.token).send(body);
    expect((await send({ vehicle: 'TRK-1', lat: 12.96, lng: 77.59, at: new Date(clock.at.getTime() - 60_000).toISOString() }).expect(200)).body).toEqual({ accepted: 1, stale: 0 });
    // A resend of an even older fix changes nothing.
    expect((await send({ vehicle: 'KA01TP0001', lat: 1, lng: 1, at: new Date(clock.at.getTime() - 120_000).toISOString() }).expect(200)).body).toEqual({ accepted: 0, stale: 1 });
    expect((await owner.query(`select last_lat, pings from transport_trips where id = $1`, [trip.id])).rows[0]).toMatchObject({ last_lat: '12.960000', pings: 1 });
    await post('drv', `/v1/transport/trips/${trip.id}/end`).expect(200);
  });

  it('suggests what to do about capacity against occupancy', async () => {
    const o = (await get('tm', '/v1/transport/optimisation').expect(200)).body;
    expect(o.routes).toEqual([expect.objectContaining({ name: 'Route P', riders: 3, capacity: 40, occupancyPct: 8, status: 'low' })]);
    expect(o.suggestions).toEqual([{ kind: 'low', routeId: ids.route, riders: 3, capacity: 40, vehicle: { id: ids.van, regNo: 'KA01TP0002', capacity: 12 } }]);
    expect(o.totals).toMatchObject({ seats: 40, riders: 3, idleVehicles: 1 });
    // Lake and Temple have riders; only the campus stop is unused.
    expect(o.emptyStops.map((x: { name: string }) => x.name)).toEqual(['Campus']);
    const occ = (await get('tm', '/v1/ops-reports/transport.occupancy').expect(200)).body.rows;
    expect(occ).toEqual([expect.objectContaining({ route: 'Route P', seats: 40, riders: 3, occupancy: 8, seatsLeft: 37 })]);
  });

  it('credits a cancelled seat in a billed month: off the unpaid fee, else as a refund due', async () => {
    expect((await post('tm', '/v1/transport/fees/month', { month }).expect(200)).body).toMatchObject({ studentsCharged: 3 });
    const fee = async (sid: string) => (await owner.query(`select amount_paise, paid_paise from fee_invoices where student_id = $1 and title = $2`, [sid, `Transport fee ${month}`])).rows[0];
    expect(Number((await fee(t.students[1].id)).amount_paise)).toBe(180_000);
    const credit = cancelCredit(month, 180_000, `${month}-01`, today);
    const seatB = (await get('tm', `/v1/records/transport-riders?f.route=${ids.route}&q=R2`).expect(200)).body.rows[0];
    const ended = (await action('tm', 'transport-riders', seatB.id, 'end', { on: today, reason: 'Family moved away' }).expect(200)).body.rows[0];
    expect(ended).toMatchObject({ ok: true, message: `₹${(credit / 100).toFixed(2)}` });
    expect(Number((await fee(t.students[1].id)).amount_paise)).toBe(180_000 - credit);
    expect(await notices(t.guardian2.id, 'Bus seat ended')).toBe(1);
    // C has paid the month: nothing is left to take off, so the days given up wait as a refund.
    await owner.query(`update fee_invoices set paid_paise = amount_paise, status = 'paid' where student_id = $1 and title = $2`, [t.students[2].id, `Transport fee ${month}`]);
    const c = (await post('tm', `/v1/transport/assignments/${t.students[2].id}/end`, { on: today }).expect(200)).body;
    const refund = cancelCredit(month, 120_000, `${month}-01`, today);
    expect(c).toMatchObject({ endedOn: today, creditedPaise: 0, refundDuePaise: refund });
    const adj = (await get('tm', '/v1/records/transport-fee-adjustments?sort=at:asc').expect(200)).body.rows;
    expect(adj.map((r: { rollNo: string; kind: string; amountRupees: number; refundDueRupees: number }) => [r.rollNo, r.kind, r.amountRupees, r.refundDueRupees])).toEqual([
      ['R2', 'cancel_credit', -credit / 100, 0],
      ['R3', 'cancel_credit', -refund / 100, refund / 100],
    ]);
    expect((await get('parent2', `/v1/transport/students/${t.students[1].id}/fee-adjustments`).expect(200)).body).toHaveLength(1);
    await get('parent', `/v1/transport/students/${t.students[1].id}/fee-adjustments`).expect(404);
    const dues = (await get('tm', '/v1/ops-reports/transport.collection').expect(200)).body.rows;
    expect(dues.reduce((s: number, r: { billed: number }) => s + Number(r.billed), 0)).toBe((120_000 + 180_000 - credit + 120_000) / 100);
  });

  it('keeps the office’s screens to the office and to this institution', async () => {
    for (const path of ['/v1/transport/live', '/v1/transport/optimisation', '/v1/transport/safety', '/v1/records/transport-boardings', '/v1/records/transport-fare-slabs', '/v1/records/transport-safety-checks']) await get('teacher', path).expect(403);
    await post('teacher', '/v1/transport/fare-slabs/apply', {}).expect(403);
    await post('parent', '/v1/transport/expiry-reminders/run').expect(403);
    expect((await get('outsider', '/v1/transport/live').expect(200)).body.trips).toEqual([]);
    expect((await get('outsider', '/v1/records/transport-boardings').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/records/transport-fee-adjustments').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/transport/safety').expect(200)).body.total).toBe(0);
    await get('outsider', `/v1/transport/trips/${ids.trip}/manifest`).expect(404);
    await get('outsider', `/v1/transport/students/${t.students[0].id}/fee-adjustments`).expect(404);
  });
});
