import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Transport depth: vehicles, drivers, routes and stops as record lists (import, reorder), riders (students and staff)
 * with capacity checks, moving a rider with the fee difference, families' change requests, the monthly fee pro rata
 * (staff through payroll), maintenance, incidents and insurance claims, temporary route changes with family notices,
 * the hand-over at the stop (one-time code, photo), driver duty with spare drivers, GPS alerts, bus passes, the
 * expiry calendar, the dashboard, no-dues, permissions and isolation.
 */
describe('transport depth', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date());
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
  const day = (n: number) => new Date(Date.now() + 5.5 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
  const user = async (name: string, role: string) => {
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, name, `${role}-${t.slug}@x.in`, await argon2.hash('pw')]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, $3, $4)`, [t.tenantId, rows[0].id, role, t.campus.id]);
    return rows[0].id as string;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    ids.manager = await user('Tara Transport', 'transport_manager');
    ids.driverUser = await user('Dev Driver', 'teacher');
    tokens.tm = await login(t.slug, `transport_manager-${t.slug}@x.in`);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('keeps vehicles (imported), drivers with logins and spares, routes and stops in running order', async () => {
    const csv = 'Registration number,Make and model,Seats,Fuel,Insurance until,Permit until\r\nka01ab1234,Tata 40,2,diesel,2027-03-31,' + day(10) + '\r\nKA01AB9999,Force 12,12,cng,,\r\n';
    const check = (await http().post('/v1/records/transport-vehicles/import').set(as('tm')).attach('file', Buffer.from(csv), 'v.csv').expect(200)).body;
    expect(check.totals).toMatchObject({ created: 2, error: 0 });
    await post('tm', `/v1/records/transport-vehicles/import/${check.id}/commit`, {}).expect(200);
    const vs = (await get('tm', '/v1/records/transport-vehicles?sort=regNo:asc').expect(200)).body.rows;
    expect(vs.map((v: { regNo: string }) => v.regNo)).toEqual(['KA01AB1234', 'KA01AB9999']);
    ids.bus = vs[0].id;
    ids.van = vs[1].id;
    expect((await get('tm', '/v1/records/transport-vehicles?f.expiring=soon').expect(200)).body.total).toBe(1);
    const d = (await post('tm', '/v1/records/transport-drivers', { fullName: 'Dev Driver', role: 'driver', licenseExpiresOn: day(5), userId: ids.driverUser }).expect(201)).body;
    ids.driver = d.id;
    expect((await owner.query(`select role from user_roles where user_id = $1 order by role`, [ids.driverUser])).rows.map((r) => String(r.role)).sort()).toEqual(['driver', 'teacher']);
    const spare = (await post('tm', '/v1/records/transport-drivers', { fullName: 'Sam Spare', role: 'driver', isSpare: true }).expect(201)).body;
    ids.spare = spare.id;
    const route = (await post('tm', '/v1/records/transport-routes', { name: 'Route 1', vehicleId: ids.bus, driverId: ids.driver, fee: 3100 }).expect(201)).body;
    ids.route = route.id;
    const route2 = (await post('tm', '/v1/records/transport-routes', { name: 'Route 2', vehicleId: ids.van, fee: 4650 }).expect(201)).body;
    ids.route2 = route2.id;
    const s1 = (await post('tm', '/v1/records/transport-stops', { routeId: route.id, name: 'Market', lat: 12.97, lng: 77.59, pickupTime: '07:10' }).expect(201)).body;
    const s2 = (await post('tm', '/v1/records/transport-stops', { routeId: route.id, name: 'Temple', lat: 12.98, lng: 77.59, pickupTime: '07:20', fee: 3410 }).expect(201)).body;
    await post('tm', '/v1/records/transport-stops', { routeId: route.id, name: 'Bad', lat: 91, lng: 0 }).expect(400);
    ids.s1 = s1.id;
    ids.s2 = s2.id;
    expect(s2).toMatchObject({ effectiveFeeRupees: 3410, feeRupees: 3410 });
    // Reorder: Temple first; the driver's route follows the new order.
    await post('tm', '/v1/records/transport-stops/reorder', { ids: [s2.id, s1.id] }).expect(200);
    const order = (await get('tm', `/v1/records/transport-stops?f.route=${route.id}&pageSize=50`).expect(200)).body.rows.map((s: { name: string }) => s.name);
    expect(order).toEqual(['Temple', 'Market']);
    // Stops by import on route 2.
    const stopsCsv = 'Route,Stop,Latitude,Longitude,Pick-up time\r\nRoute 2,Lake,12.95,77.60,07:30\r\nRoute 9,Nowhere,1,1,\r\n';
    const sc = (await http().post('/v1/records/transport-stops/import').set(as('tm')).attach('file', Buffer.from(stopsCsv), 's.csv').expect(200)).body;
    expect(sc.rows.map((r: { status: string }) => r.status)).toEqual(['created', 'error']);
    await post('tm', `/v1/records/transport-stops/import/${sc.id}/commit`, { skipErrors: true }).expect(200);
    ids.lake = (await get('tm', `/v1/records/transport-stops?f.route=${route2.id}`).expect(200)).body.rows[0].id;
    await get('teacher', '/v1/records/transport-routes').expect(403);
    expect((await get('outsider', '/v1/records/transport-vehicles').expect(200)).body.total).toBe(0);
  });

  it('seats students and staff within the vehicle’s seats, moves a rider with the fee difference, and runs the month', async () => {
    const start = `${day(0).slice(0, 7)}-01`;
    await post('tm', '/v1/records/transport-riders', { kind: 'student', student: 'R1', stopId: ids.s1, startsOn: start }).expect(201);
    await post('tm', '/v1/records/transport-riders', { kind: 'staff', staffUserId: t.teacher.id, stopId: ids.s2, startsOn: start }).expect(201);
    await post('tm', '/v1/records/transport-riders', { kind: 'student', student: 'R2', stopId: ids.s1 }).expect(409); // two seats
    await post('tm', '/v1/records/transport-riders', { kind: 'student', student: 'R1', stopId: ids.lake }).expect(409); // already has a seat
    const riders = (await get('tm', `/v1/records/transport-riders?f.route=${ids.route}&f.status=riding`).expect(200)).body.rows;
    expect(riders.map((r: { feeRupees: number }) => r.feeRupees).sort()).toEqual([3100, 3410]);
    expect(riders.find((r: { feeRupees: number }) => r.feeRupees === 3100).name).toBe('Student A');
    const seatA = riders.find((r: { name: string }) => r.name === 'Student A');
    // Move A to Route 2 (₹4,650) from today: the rest of the month's difference is charged.
    const moved = (await post('tm', `/v1/records/transport-riders/${seatA.id}/move`, { to: ids.lake, reason: 'Family moved' }).expect(200)).body;
    expect(moved).toBeDefined();
    const delta = (await owner.query(`select amount_paise from fee_invoices where student_id = $1 and title like 'Transport fee change%'`, [t.students[0].id])).rows;
    const dim = new Date(Date.UTC(Number(day(0).slice(0, 4)), Number(day(0).slice(5, 7)), 0)).getUTCDate();
    const left = dim - Number(day(0).slice(8, 10)) + 1;
    expect(delta.map((r) => Number(r.amount_paise))).toEqual([Math.round((155_000 * left) / dim)]);
    // The month's run: A pays both seats pro rata (together a full month at each rate), staff get a payroll recovery.
    const month = day(0).slice(0, 7);
    const run = (await post('tm', '/v1/transport/fees/month', { month }).expect(200)).body;
    expect(run).toMatchObject({ studentsCharged: 1, staffRecoveries: 1 });
    const used = dim - left;
    const expectA = Math.round((310_000 * used) / dim) + Math.round((465_000 * left) / dim);
    expect((await owner.query(`select amount_paise from fee_invoices where student_id = $1 and title = $2`, [t.students[0].id, `Transport fee ${month}`])).rows.map((r) => Number(r.amount_paise))).toEqual([expectA]);
    expect((await owner.query(`select kind, amount_paise, status from payroll_adjustments where user_id = $1`, [t.teacher.id])).rows.map((r) => [r.kind, Number(r.amount_paise), r.status])).toEqual([['recovery', 341_000, 'pending']]);
    expect((await post('tm', '/v1/transport/fees/month', { month }).expect(200)).body).toMatchObject({ studentsCharged: 0, staffRecoveries: 0 });
  });

  it('takes a family’s change request and approves it; ends seats', async () => {
    await post('parent2', '/v1/transport/change-requests/mine', { studentId: t.students[0].id, toStopId: ids.s1, effectiveOn: day(1), reason: 'x y z' }).expect(404);
    const routes = (await get('parent', '/v1/transport/routes-public').expect(200)).body;
    expect(routes.find((r: { name: string }) => r.name === 'Route 1').stops.map((s: { name: string; feePaise: number }) => [s.name, s.feePaise])).toEqual([
      ['Temple', 341_000],
      ['Market', 310_000],
    ]);
    const req = (await post('parent', '/v1/transport/change-requests/mine', { studentId: t.students[0].id, toStopId: ids.s1, effectiveOn: day(1), reason: 'Back to the old house' }).expect(201)).body;
    await post('parent', '/v1/transport/change-requests/mine', { studentId: t.students[0].id, toStopId: ids.s1, effectiveOn: day(1), reason: 'Again please' }).expect(409);
    expect((await action('tm', 'transport-change-requests', req.id, 'approve').expect(200)).body.rows[0].ok).toBe(true);
    const now = (await get('parent', `/v1/transport/students/${t.students[0].id}`).expect(200)).body;
    expect(now).toMatchObject({ assigned: true, stopName: 'Market' });
  });

  it('keeps the maintenance schedule, incidents with insurance claims, and tells families of a temporary change', async () => {
    const m = (await post('tm', '/v1/records/transport-maintenance', { vehicleId: ids.bus, kind: 'service', dueOn: day(-2), vendor: 'City Motors' }).expect(201)).body;
    expect(m.overdue).toBe(true);
    await action('tm', 'transport-maintenance', m.id, 'done', { cost: 4200, odometerKm: 120000 }).expect(200);
    expect((await get('tm', `/v1/records/transport-expenses?f.vehicle=${ids.bus}`).expect(200)).body.rows[0]).toMatchObject({ kind: 'repair', amountRupees: 4200, odometerKm: 120000 });
    await post('tm', '/v1/records/transport-expenses', { vehicleId: ids.bus, kind: 'fuel', spentOn: day(0), amount: 3000, odometerKm: 119000, litres: 30 }).expect(400); // odometer went back
    await post('tm', '/v1/records/transport-expenses', { vehicleId: ids.bus, kind: 'fuel', spentOn: day(0), amount: 3000 }).expect(400); // no litres
    const inc = (await post('tm', '/v1/records/transport-incidents', { vehicleId: ids.bus, kind: 'accident', severity: 'medium', occurredOn: day(0), description: 'Rear bumper hit at the signal' }).expect(201)).body;
    await action('tm', 'transport-incidents', inc.id, 'settleClaim', { amount: 1000 }).expect(200).then((r) => expect(r.body.rows[0].ok).toBe(false));
    await action('tm', 'transport-incidents', inc.id, 'fileClaim', { insurer: 'New India', claimNo: 'CL-1', amount: 25000 }).expect(200);
    await action('tm', 'transport-incidents', inc.id, 'settleClaim', { amount: 20000 }).expect(200);
    expect((await get('tm', `/v1/records/transport-incidents/${inc.id}`).expect(200)).body).toMatchObject({ claimStatus: 'settled', claimRupees: 25000, settledRupees: 20000 });
    // The bus breaks down tomorrow: the van runs the route, and the families are told.
    const o = (await post('tm', '/v1/records/transport-overrides', { routeId: ids.route, kind: 'vehicle', fromOn: day(1), untilOn: day(1), substituteVehicleId: ids.van, reason: 'Bus in the workshop' }).expect(201)).body;
    await post('tm', '/v1/records/transport-overrides', { routeId: ids.route, kind: 'vehicle', fromOn: day(1), untilOn: day(1), reason: 'No vehicle given' }).expect(400);
    expect((await action('tm', 'transport-overrides', o.id, 'notify').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: '2' }); // A's family and the staff rider
    expect(JSON.stringify((await get('parent', '/v1/notifications').expect(200)).body)).toContain('KA01AB9999');
  });

  it('hands a child over with a one-time code or an authorised person’s photo', async () => {
    const person = (await post('tm', '/v1/records/transport-pickup-persons', { student: 'R1', name: 'Grandpa Rao', relation: 'grandfather', phone: '9800000001' }).expect(201)).body;
    tokens.driver = await login(t.slug, `transport_manager-${t.slug}@x.in`);
    const sent = (await post('tm', '/v1/transport/handovers/otp', { studentId: t.students[0].id }).expect(201)).body;
    expect(sent.persons).toEqual([expect.objectContaining({ name: 'Grandpa Rao' })]);
    const notes = (await get('parent', '/v1/notifications').expect(200)).body;
    const code = /(\d{6})/.exec(JSON.stringify(notes).match(/Code to receive[^"]*/)![0])![1];
    // The Parent App shows the code large at the stop: it comes in the notice's data too, with when it stops working.
    const notice = notes.items.find((n: { data: Record<string, string> }) => n.data.handoverId === sent.handoverId);
    expect(notice.data).toEqual({ studentId: t.students[0].id, handoverId: sent.handoverId, otp: code, expiresAt: new Date(sent.expiresAt).toISOString() });
    const wrong = (await post('tm', `/v1/transport/handovers/${sent.handoverId}/verify`, { otp: code === '000000' ? '111111' : '000000' }).expect(200)).body;
    expect(wrong).toMatchObject({ ok: false, status: 'pending', attemptsLeft: 4 });
    expect((await post('tm', `/v1/transport/handovers/${sent.handoverId}/verify`, { otp: code }).expect(200)).body).toMatchObject({ ok: true, status: 'done' });
    await post('tm', `/v1/transport/handovers/${sent.handoverId}/verify`, { otp: code }).expect(409);
    await post('tm', '/v1/transport/handovers/otp', { studentId: t.students[2].id }).expect(201); // C has their own login
    const cUser = (await owner.query(`select user_id from students where id = $1`, [t.students[2].id])).rows[0].user_id;
    await owner.query(`update students set user_id = null where id = $1`, [t.students[2].id]);
    await post('tm', '/v1/transport/handovers/otp', { studentId: t.students[2].id }).expect(409); // no family app
    await owner.query(`update students set user_id = $2 where id = $1`, [t.students[2].id, cUser]);
    await post('tm', '/v1/transport/handovers/photo', { studentId: t.students[1].id, personId: person.id }).expect(403); // not B's person
    await post('tm', '/v1/transport/handovers/photo', { studentId: t.students[0].id, personId: person.id }).expect(201);
    expect((await get('tm', '/v1/records/transport-handovers?f.status=done').expect(200)).body.total).toBe(2);
    expect((await get('parent', `/v1/transport/students/${t.students[0].id}/pickup-persons`).expect(200)).body).toHaveLength(1);
    await get('parent2', `/v1/transport/students/${t.students[0].id}/pickup-persons`).expect(404);
  });

  it('opens the duty sheet and covers an absent driver from the spare pool', async () => {
    expect((await post('tm', '/v1/transport/duty/today').expect(200)).body).toMatchObject({ made: 1 });
    const duty = (await get('tm', '/v1/records/transport-duty?f.day=today').expect(200)).body.rows[0];
    const r = (await action('tm', 'transport-duty', duty.id, 'absent').expect(200)).body.rows[0];
    expect(r).toMatchObject({ ok: true, message: 'Sam Spare' });
    expect((await get('tm', `/v1/records/transport-overrides?f.route=${ids.route}&f.kind=driver`).expect(200)).body.total).toBe(1);
    expect((await get('tm', '/v1/records/transport-duty?f.uncovered=yes').expect(200)).body.total).toBe(0);
  });

  it('raises over-speed and route-deviation alerts from GPS and lets the office acknowledge them', async () => {
    const driverToken = await login(t.slug, `transport_manager-${t.slug}@x.in`);
    void driverToken;
    await owner.query(`update users set email = $2 where id = $1`, [ids.driverUser, `driver-${t.slug}@x.in`]);
    await owner.query(`update users set password_hash = (select password_hash from users where id = $2) where id = $1`, [ids.driverUser, ids.manager]);
    tokens.drv = await login(t.slug, `driver-${t.slug}@x.in`);
    const trip = (await post('drv', '/v1/transport/trips', { routeId: ids.route, direction: 'pickup' }).expect(201)).body;
    // First stop reached (Temple), then 80 km/h and 1.5 km off the line to Market.
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.98, lng: 77.59, speedKmh: 20 }).expect(200);
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.975, lng: 77.604, speedKmh: 80 }).expect(200);
    await post('drv', `/v1/transport/trips/${trip.id}/position`, { lat: 12.975, lng: 77.604, speedKmh: 81 }).expect(200); // same minute: no repeat
    const alerts = (await get('tm', '/v1/records/transport-alerts').expect(200)).body.rows;
    expect(alerts.map((a: { kind: string }) => a.kind).sort()).toEqual(['deviation', 'overspeed']);
    expect(JSON.stringify((await get('tm', '/v1/notifications').expect(200)).body)).toContain('over-speeding');
    const over = alerts.find((a: { kind: string }) => a.kind === 'overspeed');
    await action('tm', 'transport-alerts', over.id, 'acknowledge').expect(200);
    expect((await get('tm', '/v1/records/transport-alerts?f.open=no').expect(200)).body.total).toBe(1);
    expect((await get('tm', '/v1/ops-reports/transport.alerts').expect(200)).body.rows).toHaveLength(2);
    await post('drv', `/v1/transport/trips/${trip.id}/end`).expect(200);
  });

  it('prints bus passes, lists the calendar and dashboard, and answers no-dues', async () => {
    const pdf = await get('parent', `/v1/transport/passes/${t.students[0].id}.pdf`).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    await get('parent2', `/v1/transport/passes/${t.students[0].id}.pdf`).expect(404);
    await get('tm', `/v1/transport/passes/route/${ids.route}.pdf`).buffer(true).expect(200);
    const cal = (await get('tm', '/v1/transport/calendar?days=30').expect(200)).body.items;
    expect(cal.map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(['licence', 'permit']));
    const dash = (await get('tm', '/v1/transport/dashboard').expect(200)).body;
    expect(dash).toMatchObject({ routes: 2, studentRiders: 1, staffRiders: 1, claimsOpen: 0, alertsOpen: 1 });
    expect((await get('parent', `/v1/transport/no-dues/${t.students[0].id}`).expect(200)).body).toMatchObject({ seat: true, clear: false });
    const stops = (await get('tm', '/v1/ops-reports/transport.stop-list').expect(200)).body.rows;
    expect(stops.map((r: { stop: string }) => r.stop)).toEqual(['Temple', 'Market']);
    expect((await get('tm', '/v1/ops-reports/transport.fee-dues').expect(200)).body.rows.length).toBeGreaterThan(0);
    await get('teacher', '/v1/transport/dashboard').expect(403);
    // Seats are history: delete is refused; the seat ends instead.
    const seat = (await get('tm', '/v1/records/transport-riders?f.kind=staff').expect(200)).body.rows[0];
    expect((await http().delete(`/v1/records/transport-riders/${seat.id}`).set(as('tm')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
    await action('tm', 'transport-riders', seat.id, 'end').expect(200);
    expect((await get('tm', '/v1/records/transport-riders?f.kind=staff&f.status=riding').expect(200)).body.total).toBe(0);
  });
});
