import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Hostel production pass: room amenities, category points in allotment and the anti-ragging undertaking rule,
 * wardens limited to their blocks, the QR gate log with late-entry alerts and escalation, complaints from the
 * student app, the diet system mess bill (kitchen purchases brought in), the vacate settlement posted to the fee
 * ledger, damage shared by roommates, medical emergencies, the hostel's committees and mess inspections, the
 * defaulters and AISHE/NAAC reports, input checks, roles and another institution.
 */
describe('hostel pass', () => {
  const owner = ownerPool();
  // IST wall-clock times on today's date (the clock is fixed; database "today" stays the real day).
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const at = (hhmm: string) => new Date(`${today}T${hhmm}:00+05:30`);
  const clock = new FixedClock(at('12:00'));
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
  const staff = async (name: string, role: string) => {
    const email = `${name.toLowerCase()}-${t.slug}@x.in`;
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id`, [t.tenantId, name, email, await argon2.hash('pw')]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, $3, $4)`, [t.tenantId, rows[0].id, role, t.campus.id]);
    ids[name] = rows[0].id;
    tokens[name] = await login(t.slug, email);
  };
  const notes = async (userId: string, like: string) => (await owner.query(`select count(*)::int as n from notifications where tenant_id = $1 and user_id = $2 and title like $3`, [t.tenantId, userId, like])).rows[0].n as number;
  const s = (i: number) => t.students[i].id;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    await staff('Wanda', 'hostel_warden');
    await staff('Bela', 'hostel_warden');
    await staff('Anil', 'accountant');
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!); // R3
    tokens.parent = await login(t.slug, t.guardian.email!); // R1's
    tokens.parent2 = await login(t.slug, t.guardian2.email!); // R2's
    tokens.outsider = await login(other.slug, other.principal.email!);
    // One hostel, blocks A and B; A-101 and B-201 with two beds each.
    ids.hostel = (await post('Wanda', '/v1/records/hostels', { name: 'Kaveri Hostel', gender: 'mixed' }).expect(201)).body.id;
    ids.type = (await post('Wanda', '/v1/records/hostel-room-types', { name: 'Double', bedsPerRoom: 2, fee: 3000, amenities: 'Wi-Fi, geyser, wi-fi' }).expect(201)).body.id;
    ids.blkA = (await post('Wanda', '/v1/records/hostel-blocks', { name: 'A', hostelId: ids.hostel }).expect(201)).body.id;
    ids.blkB = (await post('Wanda', '/v1/records/hostel-blocks', { name: 'B', hostelId: ids.hostel }).expect(201)).body.id;
    ids.a101 = (await post('Wanda', '/v1/records/hostel-rooms', { blockId: ids.blkA, number: '101', roomTypeId: ids.type, beds: 2 }).expect(201)).body.id;
    ids.b201 = (await post('Wanda', '/v1/records/hostel-rooms', { blockId: ids.blkB, number: '201', roomTypeId: ids.type, beds: 2 }).expect(201)).body.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('lists amenities from the room type and the room, and filters by them', async () => {
    expect((await get('Wanda', `/v1/records/hostel-room-types/${ids.type}`).expect(200)).body.amenities).toBe('Wi-Fi, Geyser');
    await http().patch(`/v1/records/hostel-rooms/${ids.a101}`).set(as('Wanda')).send({ amenities: 'balcony' }).expect(200);
    expect((await get('Wanda', `/v1/records/hostel-rooms/${ids.a101}`).expect(200)).body).toMatchObject({ ownAmenities: 'Balcony', amenities: 'Balcony, Geyser, Wi-Fi' });
    expect((await get('Wanda', '/v1/records/hostel-rooms?f.amenity=balcony').expect(200)).body.total).toBe(1);
    expect((await get('Wanda', '/v1/records/hostel-rooms?f.amenity=geyser').expect(200)).body.total).toBe(2);
    await http().patch(`/v1/records/hostel-rooms/${ids.a101}`).set(as('Wanda')).send({ amenities: Array.from({ length: 21 }, (_, i) => `a${i}`).join(',') }).expect(400);
  });

  it('adds reserved-category points to the priority and can require the anti-ragging undertakings', async () => {
    // Same distance and merit: the SC applicant is 20 points ahead (the default category points).
    await post('Wanda', '/v1/records/hostel-applications', { student: 'R1', gender: 'male', distanceKm: 100, meritScore: 50, category: 'general' }).expect(201);
    await post('parent2', '/v1/hostel/applications/mine', { studentId: s(1), gender: 'female', distanceKm: 100, category: 'sc' }).expect(201);
    await http().patch(`/v1/records/hostel-applications/${(await get('Wanda', '/v1/records/hostel-applications?q=R2').expect(200)).body.rows[0].id}`).set(as('Wanda')).send({ meritScore: 50 }).expect(200);
    await post('Wanda', '/v1/records/hostel-applications', { student: 'R3', gender: 'male', category: 'nobody' }).expect(400);
    await post('Wanda', '/v1/hostel/applications/auto-allot', { hostelId: '00000000-0000-0000-0000-000000000000' }).expect(200); // re-ranks; nothing approved
    const apps = (await get('Wanda', '/v1/records/hostel-applications?sort=priority:desc').expect(200)).body.rows as { rollNo: string; priority: number }[];
    // 100 km → 10, merit 50, term 3 → 30; SC +20.
    expect(apps.map((a) => [a.rollNo, a.priority])).toEqual([['R2', 110], ['R1', 90]]);
    // The undertaking rule: no bed without the student's and the parent's undertakings.
    await http().put('/v1/module-settings/hostel').set(as('principal')).send({ rules: { allotNeedsUndertaking: true } }).expect(200);
    const beds = (await get('Wanda', `/v1/hostel/beds?blockId=${ids.blkA}`).expect(200)).body as { bedId: string; label: string }[];
    const bedsB = (await get('Wanda', `/v1/hostel/beds?blockId=${ids.blkB}`).expect(200)).body as { bedId: string }[];
    expect((await post('Wanda', '/v1/hostel/allotments', { studentId: s(0), bedId: beds[0].bedId, startsOn: '2026-10-01' }).expect(409)).body.message).toMatch(/anti-ragging/);
    await owner.query(`insert into antiragging_undertakings (tenant_id, student_id, year_label, student_ref, parent_ref, status) values ($1, $2, '2026-27', 'S-1', 'P-1', 'received')`, [t.tenantId, s(0)]);
    ids.resA = (await post('Wanda', '/v1/hostel/allotments', { studentId: s(0), bedId: beds[0].bedId, startsOn: '2026-10-01' }).expect(201)).body.id;
    await http().put('/v1/module-settings/hostel').set(as('principal')).send({ rules: { allotNeedsUndertaking: false } }).expect(200);
    ids.resC = (await post('Wanda', '/v1/hostel/allotments', { studentId: s(2), bedId: beds[1].bedId, startsOn: '2026-10-02' }).expect(201)).body.id;
    ids.resB = (await post('Wanda', '/v1/hostel/allotments', { studentId: s(1), bedId: bedsB[0].bedId, startsOn: '2026-10-01' }).expect(201)).body.id;
    const res = (await get('Wanda', '/v1/records/hostel-residents?f.undertaking=missing').expect(200)).body.rows as { rollNo: string }[];
    expect(res.map((r) => r.rollNo).sort()).toEqual(['R2', 'R3']);
  });

  it('limits a warden assigned to a block to that block', async () => {
    const st = (await post('Wanda', '/v1/records/hostel-staff', { hostelId: ids.hostel, userId: ids.Bela, role: 'warden', fromOn: '2026-01-01' }).expect(201)).body;
    await http().patch(`/v1/records/hostel-staff/${st.id}`).set(as('Wanda')).send({ blocks: 'C' }).expect(400);
    await http().patch(`/v1/records/hostel-staff/${st.id}`).set(as('Wanda')).send({ blocks: 'b' }).expect(200);
    expect((await get('Wanda', `/v1/records/hostel-staff/${st.id}`).expect(200)).body.blocks).toBe('B');
    // Bela sees block B only; Wanda (no assignment: the chief warden) and the principal see both.
    expect((await get('Bela', '/v1/records/hostel-residents').expect(200)).body.rows.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R2']);
    expect((await get('Wanda', '/v1/records/hostel-residents').expect(200)).body.total).toBe(3);
    expect((await get('principal', '/v1/records/hostel-residents').expect(200)).body.total).toBe(3);
    expect((await get('Bela', '/v1/hostel/beds').expect(200)).body).toHaveLength(2);
    expect((await get('Bela', '/v1/hostel/blocks').expect(200)).body.map((b: { name: string }) => b.name)).toEqual(['B']);
    expect((await get('Bela', '/v1/records/hostel-rooms').expect(200)).body.total).toBe(1);
    expect((await get('Bela', '/v1/hostel/night-attendance').expect(200)).body.residents).toHaveLength(1);
    await post('Bela', '/v1/hostel/night-attendance', { marks: [{ studentId: s(0), status: 'present' }] }).expect(403);
    await post('Bela', '/v1/hostel/gate-passes', { studentId: s(0), reason: 'Home', expectedBackAt: at('20:00').toISOString() }).expect(403);
    await get('Bela', `/v1/hostel/students/${s(0)}/gate-qr`).expect(403);
  });

  it('runs the gate on QR codes: local outings, out-passes, curfew, late entries told to the family and escalated', async () => {
    // The resident's own QR, stable for the stay; nobody else's family can see it.
    const qr = (await get('student', `/v1/hostel/students/${s(2)}/gate-qr`).expect(200)).body.code as string;
    expect(qr).toMatch(/^HG1:[A-Za-z0-9_-]{24}$/);
    expect((await get('student', `/v1/hostel/students/${s(2)}/gate-qr`).expect(200)).body.code).toBe(qr);
    await get('student', `/v1/hostel/students/${s(0)}/gate-qr`).expect(404);
    await get('parent', `/v1/hostel/students/${s(0)}/gate-qr`).expect(403);
    const qrA = (await get('Wanda', `/v1/hostel/students/${s(0)}/gate-qr`).expect(200)).body.code as string;
    await post('Wanda', '/v1/hostel/gate/scan', { code: 'HG1:short' }).expect(400);
    await post('Wanda', '/v1/hostel/gate/scan', { code: 'HG1:AAAAAAAAAAAAAAAAAAAAAAAA' }).expect(404);
    await post('outsider', '/v1/hostel/gate/scan', { code: qr }).expect(404);
    await post('teacher', '/v1/hostel/gate/scan', { code: qr }).expect(403);
    await post('Bela', '/v1/hostel/gate/scan', { code: qrA }).expect(403);
    // 6 pm: R3 steps out without a pass (a local outing), the next scan brings them in, on time.
    clock.at = at('18:00');
    expect((await post('Wanda', '/v1/hostel/gate/scan', { code: qr, gate: 'Main' }).expect(200)).body).toMatchObject({ direction: 'out', withPass: false, minutesLate: 0, rollNo: 'R3' });
    expect((await get('Wanda', '/v1/hostel/gate/out-now').expect(200)).body.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R3']);
    await post('Wanda', '/v1/hostel/gate/scan', { code: qr, direction: 'out' }).expect(409);
    clock.at = at('19:30');
    expect((await post('Wanda', '/v1/hostel/gate/scan', { code: qr }).expect(200)).body).toMatchObject({ direction: 'in', minutesLate: 0 });
    // After curfew (21:00) no one goes out without an out-pass.
    clock.at = at('22:30');
    expect((await post('Wanda', '/v1/hostel/gate/scan', { code: qr }).expect(409)).body.message).toMatch(/curfew/);
    // R1's family asks for a pass to 20:00; the warden approves; R1 goes out on it and comes back at 22:30.
    clock.at = at('17:00');
    const pass = (await post('parent', '/v1/hostel/gate-passes/requests', { studentId: s(0), reason: 'Dinner with uncle', destination: 'Jayanagar', expectedBackAt: at('20:00').toISOString() }).expect(201)).body;
    expect(pass.status).toBe('requested');
    await post('Bela', `/v1/hostel/gate-passes/${pass.id}/approve`).expect(403);
    await post('Wanda', `/v1/hostel/gate-passes/${pass.id}/approve`).expect(200);
    clock.at = at('17:30');
    expect((await post('Wanda', '/v1/hostel/gate/scan', { code: qrA }).expect(200)).body).toMatchObject({ direction: 'out', withPass: true });
    clock.at = at('22:30');
    const back = (await post('Wanda', '/v1/hostel/gate/scan', { code: qrA }).expect(200)).body;
    // 150 minutes after the pass's 20:00 (more than the 90 after curfew).
    expect(back).toMatchObject({ direction: 'in', withPass: true, minutesLate: 150 });
    expect((await get('Wanda', `/v1/hostel/gate-passes?status=returned`).expect(200)).body[0].pass.id).toBe(pass.id);
    expect(await notes(t.guardian.id, '%came back late')).toBe(1);
    const view = (await get('parent', `/v1/hostel/students/${s(0)}`).expect(200)).body;
    expect(view).toMatchObject({ outNow: false, gateLog: [{ direction: 'in', minutesLate: 150, withPass: true }, { direction: 'out', withPass: true }] });
    // Two more late comings-in by hand (no phone): the third in the window is escalated to the family and the register.
    for (const [o, i] of [['18:00', '21:30'], ['18:10', '21:45']]) {
      clock.at = at(o);
      await post('Wanda', '/v1/hostel/gate/manual', { studentId: s(0), direction: 'out', note: 'Phone left in room' }).expect(200);
      clock.at = at(i);
      await post('Wanda', '/v1/records/hostel-gate-log', { student: 'R1', direction: 'in', note: 'Phone left in room' }).expect(201);
    }
    await post('Wanda', '/v1/hostel/gate/manual', { studentId: s(0), direction: 'out', note: '' }).expect(400);
    const late = (await get('Wanda', '/v1/records/hostel-late-entries?q=R1').expect(200)).body.rows as { minutesLate: number; escalated: boolean }[];
    expect(late.map((l) => l.minutesLate).sort((a, b) => a - b)).toEqual([30, 45, 150]);
    expect(late.filter((l) => l.escalated)).toHaveLength(1);
    expect((await owner.query(`select count(*)::int as n from hostel_incidents where tenant_id = $1 and kind = 'late_entry'`, [t.tenantId])).rows[0].n).toBe(1);
    expect(await notes(t.guardian.id, '%came back late')).toBe(3);
    expect(await notes(t.guardian.id, '%late back to the hostel')).toBe(1);
    const log = (await get('Wanda', '/v1/records/hostel-gate-log?f.late=yes').expect(200)).body;
    expect(log.total).toBe(3);
    expect((await get('Wanda', '/v1/records/hostel-gate-log?f.method=manual').expect(200)).body.total).toBe(4);
    expect((await http().delete(`/v1/records/hostel-gate-log/${log.rows[0].id}`).set(as('Wanda')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
    expect((await get('Bela', '/v1/records/hostel-gate-log').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/records/hostel-gate-log').expect(200)).body.total).toBe(0);
    clock.at = at('12:00');
  });

  it('takes complaints from the student app about their own room', async () => {
    const c = (await post('student', '/v1/hostel/complaints', { studentId: s(2), category: 'maintenance', description: 'The fan in my room does not work' }).expect(201)).body;
    expect(c.roomId).toBe(ids.a101);
    await post('student', '/v1/hostel/complaints', { studentId: s(0), category: 'food', description: 'Not my child' }).expect(404);
    expect((await get('student', `/v1/hostel/complaints?studentId=${s(2)}`).expect(200)).body).toHaveLength(1);
    await get('student', '/v1/hostel/complaints?status=bogus').expect(400);
    // Bela (block B) does not see a block A complaint.
    expect((await get('Bela', '/v1/hostel/complaints').expect(200)).body).toHaveLength(0);
    expect((await get('Wanda', '/v1/hostel/complaints').expect(200)).body).toHaveLength(1);
    expect((await get('student', '/v1/hostel/mess/menu').expect(200)).body).toEqual([]);
  });

  it('bills the mess on the diet system: the month’s spending shared by diets eaten', async () => {
    const plan = (await post('Wanda', '/v1/records/mess-plans', { name: 'Diet mess', meals: 'breakfast, lunch, dinner', billing: 'diet', fee: 600 }).expect(201)).body;
    for (const i of [0, 1, 2]) await post('Wanda', '/v1/hostel/mess/subscriptions', { studentId: s(i), planId: plan.id, startsOn: '2026-10-01' }).expect(201);
    // R2 is away 11-15 October (5 days, approved).
    const lv = (await post('Wanda', '/v1/records/mess-leaves', { student: 'R2', fromOn: '2026-10-11', toOn: '2026-10-15', reason: 'Festival' }).expect(201)).body;
    await action('Wanda', 'mess-leaves', lv.id, 'approve').expect(200);
    // Spending: ₹20,000 provisions + ₹5,560 vegetables by hand, and a ₹2,000 kitchen purchase brought in from the stock log.
    await post('Wanda', '/v1/records/mess-expenses', { month: '2026-10', head: 'provisions', amount: 20000, spentOn: '2026-10-03' }).expect(201);
    await post('Wanda', '/v1/records/mess-expenses', { month: '2026-10', head: 'vegetables', amount: 5560, spentOn: '2026-10-20' }).expect(201);
    await post('Wanda', '/v1/records/mess-expenses', { month: '2026-10', head: 'milk', amount: 10, spentOn: '2026-11-02' }).expect(400);
    await post('principal', '/v1/canteen/ops/stock', { kind: 'purchase', loggedOn: '2026-10-05', itemName: 'Rice', quantity: 50, unit: 'kg', costPaise: 200000 }).expect(201);
    expect((await post('Wanda', '/v1/hostel/mess/expenses/import-stock', { month: '2026-10' }).expect(200)).body).toMatchObject({ added: 1, amountPaise: 200000 });
    expect((await post('Wanda', '/v1/hostel/mess/expenses/import-stock', { month: '2026-10' }).expect(200)).body).toMatchObject({ added: 0 });
    await post('teacher', '/v1/hostel/mess/expenses/import-stock', { month: '2026-10' }).expect(403);
    // 31 + 31 + 26 = 88 diets; ₹27,560 / 88 = ₹313.18 a diet (31,318 paise).
    const run = (await post('Wanda', '/v1/hostel/mess/bills/run', { month: '2026-10' }).expect(200)).body;
    expect(run).toMatchObject({ bills: 3, diets: 88, spentPaise: 2_756_000, dietRatePaise: 31_318 });
    const bills = (await get('Wanda', '/v1/records/mess-bills?f.month=2026-10&sort=name:asc').expect(200)).body.rows as Record<string, unknown>[];
    // R1: 31 × 313.18 + 600 = ₹10,308.58; R2: 26 × 313.18 + 600 = ₹8,742.68.
    expect(bills.map((b) => [b.rollNo, b.diets, b.leaveDays, b.dietRateRupees, b.establishmentRupees, b.netRupees])).toEqual([
      ['R1', 31, 0, 313.18, 600, 10308.58],
      ['R2', 26, 5, 313.18, 600, 8742.68],
      ['R3', 31, 0, 313.18, 600, 10308.58],
    ]);
    await post('Wanda', '/v1/hostel/mess/bills/charge', { month: '2026-10', dueOn: today }).expect(200);
    expect((await post('Wanda', '/v1/records/mess-expenses', { month: '2026-10', head: 'other', amount: 100, spentOn: '2026-10-30' }).expect(409)).body.message).toMatch(/already charged/);
  });

  it('posts the vacate settlement to the student’s fee ledger and pays it out', async () => {
    await post('Wanda', '/v1/records/hostel-deposits', { student: 'R2', amount: 5000, mode: 'cash', receiptNo: 'CD-7' }).expect(201);
    await action('Wanda', 'hostel-residents', ids.resB, 'vacate', { on: '2026-10-10', reason: 'Moving home' }).expect(200);
    const st = (await get('Wanda', '/v1/records/hostel-settlements?q=R2').expect(200)).body.rows[0];
    // 21 unused days of ₹3,000 in a 31-day month = ₹2,032.26, plus the ₹5,000 deposit.
    expect(st).toMatchObject({ daysUsed: 10, prorataRupees: 2032.26, depositRupees: 5000, netRupees: 7032.26, ledgerPostedAt: null });
    await action('teacher', 'hostel-settlements', st.id, 'post').expect(403);
    expect((await action('Anil', 'hostel-settlements', st.id, 'post').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: 'Credit ₹7032.26' });
    expect((await action('Anil', 'hostel-settlements', st.id, 'post').expect(200)).body.rows[0]).toMatchObject({ ok: false });
    const credit = async () => Number((await owner.query(`select coalesce(sum(amount_paise), 0)::bigint as n from student_credits where tenant_id = $1 and student_id = $2`, [t.tenantId, s(1)])).rows[0].n);
    expect(await credit()).toBe(703_226);
    await action('Wanda', 'hostel-settlements', st.id, 'paid', { reference: 'NEFT 42' }).expect(200);
    expect(await credit()).toBe(0);
    expect((await get('Wanda', `/v1/records/hostel-settlements/${st.id}`).expect(200)).body).toMatchObject({ status: 'paid', ledgerRef: expect.stringMatching(/^credit:/) });
  });

  it('charges damage to a room’s residents in equal shares', async () => {
    const fan = (await post('Wanda', '/v1/records/hostel-room-assets', { roomId: ids.a101, name: 'Ceiling fan', quantity: 1, condition: 'good' }).expect(201)).body;
    // ₹1,000.01 between R1 and R3: ₹500.00 and, to the later resident, ₹500.01.
    expect((await action('Wanda', 'hostel-room-assets', fan.id, 'chargeDamage', { amount: 1000.01 }).expect(200)).body.rows[0]).toMatchObject({ ok: true });
    const inv = (await owner.query(`select s.roll_no, i.amount_paise from fee_invoices i join students s on s.id = i.student_id where i.tenant_id = $1 and i.title like 'Hostel damage: Ceiling fan (A 101)%' order by s.roll_no`, [t.tenantId])).rows;
    expect(inv.map((r) => [r.roll_no, Number(r.amount_paise)])).toEqual([['R1', 50_000], ['R3', 50_001]]);
    expect((await get('Wanda', `/v1/records/hostel-room-assets/${fan.id}`).expect(200)).body.condition).toBe('damaged');
    expect((await action('Wanda', 'hostel-room-assets', fan.id, 'chargeDamage', { amount: 1000.01 }).expect(200)).body.rows[0]).toMatchObject({ ok: false });
    await action('Wanda', 'hostel-room-assets', fan.id, 'chargeDamage', { amount: 0 }).expect(400);
  });

  it('records a medical emergency: the family and every warden are told at once', async () => {
    const sb = (await post('Wanda', '/v1/records/hostel-sickbay', { student: 'R1', symptoms: 'High fever and fainted', severity: 'emergency', referredTo: 'Victoria Hospital', escort: 'Wanda' }).expect(201)).body;
    expect(sb).toMatchObject({ severity: 'emergency', referredTo: 'Victoria Hospital', escort: 'Wanda' });
    expect(sb.hospitalAt).not.toBeNull();
    for (const u of [t.guardian.id, ids.Wanda, ids.Bela]) expect(await notes(u, 'Medical emergency:%')).toBe(1);
    const routine = (await post('Wanda', '/v1/records/hostel-sickbay', { student: 'R3', symptoms: 'Cold' }).expect(201)).body;
    expect(routine.severity).toBe('routine');
    await action('Wanda', 'hostel-sickbay', routine.id, 'hospital', { hospital: 'St John’s', escort: 'Ravi' }).expect(200);
    expect((await get('Wanda', `/v1/records/hostel-sickbay/${routine.id}`).expect(200)).body).toMatchObject({ severity: 'urgent', referredTo: 'St John’s' });
    expect(await notes(t.studentUser.id, '%taken to hospital')).toBe(1);
    expect((await get('Wanda', '/v1/records/hostel-sickbay?f.severity=emergency').expect(200)).body.total).toBe(1);
  });

  it('keeps the anti-ragging and mess committees, inspections by members, and the compliance view', async () => {
    const ar = (await post('Wanda', '/v1/records/hostel-committees', { name: 'Hostel Anti-Ragging Committee', purpose: 'anti_ragging', constitutedOn: '2026-06-01', validUntil: '2027-05-31', helpline: '080-2345-6789' }).expect(201)).body;
    await post('Wanda', '/v1/records/hostel-committees', { name: 'Bad dates', purpose: 'discipline', constitutedOn: '2026-06-01', validUntil: '2026-01-01' }).expect(400);
    expect((await action('Wanda', 'hostel-committees', ar.id, 'addMember', { person: t.principal.email, role: 'chair' }).expect(200)).body.rows[0]).toMatchObject({ ok: true });
    expect((await action('Wanda', 'hostel-committees', ar.id, 'addMember', { person: t.principal.email }).expect(200)).body.rows[0]).toMatchObject({ ok: false });
    const mess = (await post('Wanda', '/v1/records/hostel-committees', { name: 'Mess Committee', purpose: 'mess', hostelId: ids.hostel, constitutedOn: '2026-07-01' }).expect(201)).body;
    await action('Wanda', 'hostel-committees', mess.id, 'addMember', { person: 'R3', role: 'member' }).expect(200);
    expect((await get('Wanda', `/v1/records/hostel-committees/${ar.id}`).expect(200)).body).toMatchObject({ members: 1, status: 'active' });
    // R3, on the mess committee, inspects today's lunch; a parent may not.
    const insp = (await post('student', '/v1/hostel/mess/inspections', { inspectedOn: today, meal: 'lunch', quality: 4, quantity: 3, hygiene: 2, remarks: 'Floor wet near the counter' }).expect(201)).body;
    await post('parent', '/v1/hostel/mess/inspections', { inspectedOn: today, meal: 'lunch', quality: 4, quantity: 3, hygiene: 2 }).expect(403);
    await post('student', '/v1/hostel/mess/inspections', { inspectedOn: today, meal: 'lunch', quality: 6, quantity: 3, hygiene: 2 }).expect(400);
    expect((await get('Wanda', '/v1/records/mess-inspections?f.poor=yes').expect(200)).body.rows[0]).toMatchObject({ average: 3, inspector: expect.stringContaining('student') });
    await action('Wanda', 'mess-inspections', insp.id, 'close', { actionTaken: 'Mats laid; cleaner on the lunch shift' }).expect(200);
    const c = (await get('Wanda', '/v1/hostel/compliance').expect(200)).body;
    // Residents now: R1 (undertaking received) and R3 (none).
    expect(c.antiRagging).toMatchObject({ committee: true, squad: false, residents: 2, received: 1, verified: 0, missing: 1, percent: 50 });
    expect(c.messCommittee).toMatchObject({ constituted: true, inspections30d: 1, openInspections: 0, average: { quality: 4, quantity: 3, hygiene: 2 } });
    expect((await get('student', '/v1/hostel/safety').expect(200)).body).toMatchObject({ nationalHelpline: '1800-180-5522', committees: [{ purpose: 'anti_ragging', helpline: '080-2345-6789' }, { purpose: 'mess' }] });
    await get('student', '/v1/hostel/compliance').expect(403);
  });

  it('reports the defaulters with ageing, and the AISHE and NAAC figures', async () => {
    const asOf = new Date(Date.parse(`${today}T00:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10);
    const d = (await get('Anil', `/v1/hostel/reports/defaulters?asOf=${asOf}`).expect(200)).body;
    // Mess ₹10,308.58 each for R1 and R3 with their damage shares; R2's ₹8,742.68 (vacated).
    expect(d).toMatchObject({ total: 3, balancePaise: 1_080_858 + 1_080_859 + 874_268 });
    expect(d.rows.map((r: { rollNo: string; balancePaise: number; resident: boolean }) => [r.rollNo, r.balancePaise, r.resident])).toEqual([['R3', 1_080_859, true], ['R1', 1_080_858, true], ['R2', 874_268, false]]);
    expect(d.rows[0].ageing).toEqual({ d30: 1_080_859, d60: 0, d90: 0, over90: 0 });
    expect((await get('Anil', `/v1/hostel/reports/defaulters?asOf=${today}`).expect(200)).body.total).toBe(0);
    expect((await get('Anil', `/v1/hostel/reports/defaulters?asOf=${asOf}&pageSize=1&page=2`).expect(200)).body.rows.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R1']);
    expect((await get('Bela', `/v1/hostel/reports/defaulters?asOf=${asOf}`).expect(200)).body.total).toBe(1); // R2 lived in block B
    await get('Anil', '/v1/hostel/reports/defaulters?asOf=tomorrow').expect(400);
    await get('student', '/v1/hostel/reports/defaulters').expect(403);
    const a = (await get('principal', '/v1/hostel/reports/aishe').expect(200)).body;
    expect(a.aishe.rows).toEqual([{ type: 'Co-ed', hostels: 1, capacity: 4, residing: 2, male: 1, female: 0, other: 1 }]);
    expect(a.naac).toMatchObject({ hostels: 1, blocks: 2, rooms: 2, beds: 4, residents: 2, occupancyPercent: 50, staff: { wardens: 1 }, mess: { plans: 1, diners: 2 }, antiRagging: { committee: true, squad: false, undertakingsPercent: 50 }, health: { sickbayVisits: 2, emergencies: 1 }, grievances: { complaints: 1, resolved: 0 }, discipline: { outPasses: 1, lateEntries: 3, incidents: 1 } });
    expect(a.naac.byCategory).toEqual([{ category: 'general', residents: 2 }]);
    await get('principal', '/v1/hostel/reports/aishe?year=2026').expect(400);
    await get('teacher', '/v1/hostel/reports/aishe').expect(403);
    expect((await get('outsider', '/v1/hostel/reports/aishe').expect(200)).body.naac.beds).toBe(0);
    expect((await get('outsider', `/v1/hostel/reports/defaulters?asOf=${asOf}`).expect(200)).body.total).toBe(0);
  });

  it('checks inputs on the old lists too', async () => {
    await get('Wanda', '/v1/hostel/gate-passes?status=bogus').expect(400);
    await get('Wanda', '/v1/hostel/night-attendance?night=yesterday').expect(400);
    await get('Wanda', '/v1/hostel/beds?blockId=not-a-uuid').expect(200);
  });
});
