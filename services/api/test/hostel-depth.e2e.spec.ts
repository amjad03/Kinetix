import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

/**
 * Hostel depth: hostels, room types, blocks and rooms as record lists; applications ranked and allotted by the rules
 * (gender and year), residents (allot, transfer, internship hold, vacate with settlement), deposits, requests from
 * families, out-passes with the family's approval, late entries with escalation, discipline fines, the sick bay,
 * the mess bill with leave rebates, the duty roster, room assets, the dashboard, no-dues, the bin and isolation.
 */
describe('hostel depth', () => {
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
  const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) values ($1, 'Wanda Warden', $2, $3) returning id`, [t.tenantId, `warden-${t.slug}@x.in`, await argon2.hash('pw')]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role, campus_id) values ($1, $2, 'hostel_warden', $3)`, [t.tenantId, rows[0].id, t.campus.id]);
    ids.warden = rows[0].id;
    tokens.warden = await login(t.slug, `warden-${t.slug}@x.in`);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('builds hostels, room types, blocks and rooms with beds; imports rooms; guards roles', async () => {
    const boys = (await post('warden', '/v1/records/hostels', { name: 'Boys Hostel', gender: 'boys', allowedTerms: '3, 5' }).expect(201)).body;
    expect(boys).toMatchObject({ gender: 'boys', allowedTerms: '3, 5' });
    const girls = (await post('warden', '/v1/records/hostels', { name: 'Girls Hostel', gender: 'girls' }).expect(201)).body;
    ids.boys = boys.id;
    ids.girls = girls.id;
    const triple = (await post('warden', '/v1/records/hostel-room-types', { name: 'Triple sharing', bedsPerRoom: 3, fee: 3100 }).expect(201)).body;
    ids.triple = triple.id;
    const blkA = (await post('warden', '/v1/records/hostel-blocks', { name: 'A', hostelId: boys.id, gender: 'mixed' }).expect(201)).body;
    const blkG = (await post('warden', '/v1/records/hostel-blocks', { name: 'A', hostelId: girls.id, gender: 'mixed' }).expect(201)).body; // same name, other hostel
    ids.blkA = blkA.id;
    await post('warden', '/v1/records/hostel-blocks', { name: 'A', hostelId: boys.id }).expect(409);
    const room = (await post('warden', '/v1/records/hostel-rooms', { blockId: blkA.id, number: '101', floor: 1, roomTypeId: triple.id, beds: 3 }).expect(201)).body;
    expect(room).toMatchObject({ beds: 3, free: 3, feeRupees: 3100, roomTypeName: 'Triple sharing', hostelName: 'Boys Hostel' });
    ids.room101 = room.id;
    await post('warden', '/v1/records/hostel-rooms', { blockId: blkG.id, number: 'G1', beds: 2, fee: 2500 }).expect(201);
    // Import: a second room in block A of the boys' hostel ("A" is ambiguous across hostels, so the row is refused).
    const csv = 'Block,Room number,Floor,Room type,Beds\r\nA,102,1,Triple sharing,\r\n';
    const check = (await http().post('/v1/records/hostel-rooms/import').set(as('warden')).attach('file', Buffer.from(csv), 'r.csv').expect(200)).body;
    expect(check.rows[0]).toMatchObject({ status: 'error', message: 'More than one block has this name' });
    await http().patch(`/v1/records/hostel-blocks/${blkG.id}`).set(as('warden')).send({ name: 'G' }).expect(200);
    const check2 = (await http().post('/v1/records/hostel-rooms/import').set(as('warden')).attach('file', Buffer.from(csv), 'r.csv').expect(200)).body;
    await post('warden', `/v1/records/hostel-rooms/import/${check2.id}/commit`, {}).expect(200);
    expect((await get('warden', '/v1/records/hostel-rooms?q=102').expect(200)).body.rows[0]).toMatchObject({ beds: 3, feeRupees: 3100 });
    await get('teacher', '/v1/records/hostel-rooms').expect(403);
    expect((await get('outsider', '/v1/records/hostels').expect(200)).body.total).toBe(0);
    // Bin: a room type goes and comes back; its rooms' link comes back too.
    const del = (await http().delete(`/v1/records/hostel-room-types/${triple.id}`).set(as('warden')).expect(200)).body;
    expect((await get('warden', `/v1/records/hostel-rooms/${room.id}`).expect(200)).body.roomTypeName).toBeNull();
    await post('warden', `/v1/recycle-bin/${del.binId}/restore`).expect(200);
    expect((await get('warden', `/v1/records/hostel-rooms/${room.id}`).expect(200)).body.roomTypeName).toBe('Triple sharing');
  });

  it('ranks applications and allots by the rules: gender, year, preference', async () => {
    // Student A (a boy) applies through the family; B (a girl) through the warden; C (a boy) far from home.
    await post('parent', '/v1/hostel/applications/mine', { studentId: t.students[1].id, gender: 'male' }).expect(404);
    const a = (await post('parent', '/v1/hostel/applications/mine', { studentId: t.students[0].id, gender: 'male', distanceKm: 40, hostelId: ids.boys }).expect(201)).body;
    expect(a).toMatchObject({ status: 'applied', number: 'HAP-0001' });
    await post('parent', '/v1/hostel/applications/mine', { studentId: t.students[0].id, gender: 'male' }).expect(409);
    const b = (await post('warden', '/v1/records/hostel-applications', { student: 'R2', gender: 'female', hostelId: ids.boys, distanceKm: 500 }).expect(201)).body;
    const c = (await post('warden', '/v1/records/hostel-applications', { student: 'R3', gender: 'male', distanceKm: 900, meritScore: 70 }).expect(201)).body;
    const ranked = (await get('warden', '/v1/records/hostel-applications?sort=priority:desc').expect(200)).body.rows;
    expect(ranked.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R3', 'R2', 'R1']);
    for (const x of [a, b, c]) await action('warden', 'hostel-applications', x.id, 'approve').expect(200);
    const run = (await post('warden', '/v1/hostel/applications/auto-allot', {}).expect(200)).body;
    // C and A get beds in the boys' hostel; B (a girl who asked for the boys' hostel) cannot be placed there.
    expect(run.placed.map((p: { number: string }) => p.number).sort()).toEqual([a.number, c.number].sort());
    expect(run.unplaced).toEqual([{ number: b.number, reason: 'This is a boys’ hostel' }]);
    expect((await get('warden', `/v1/records/hostel-applications/${b.id}`).expect(200)).body.status).toBe('waitlisted');
    // The year rule: the boys' hostel takes years 3 and 5 only.
    await http().patch(`/v1/records/hostels/${ids.boys}`).set(as('warden')).send({ allowedTerms: '5' }).expect(200);
    const freeBed = (await get('warden', '/v1/hostel/beds?free=true').expect(200)).body.find((x: { block: string }) => x.block === 'A');
    await post('warden', '/v1/records/hostel-residents', { student: 'R2', bedId: freeBed.bedId }).expect(409);
    await http().patch(`/v1/records/hostels/${ids.boys}`).set(as('warden')).send({ allowedTerms: '' }).expect(200);
    const residents = (await get('warden', '/v1/records/hostel-residents?f.status=resident').expect(200)).body.rows;
    expect(residents).toHaveLength(2);
    ids.resA = residents.find((r: { rollNo: string }) => r.rollNo === 'R1').id;
    ids.resC = residents.find((r: { rollNo: string }) => r.rollNo === 'R3').id;
  });

  it('takes deposits, holds a bed for an internship, transfers, and vacates mid-month with a settlement', async () => {
    const dep = (await post('warden', '/v1/records/hostel-deposits', { student: 'R1', mode: 'fee_invoice' }).expect(201)).body;
    expect(dep).toMatchObject({ amountRupees: 5000, status: 'held' });
    expect((await owner.query(`select amount_paise from fee_invoices where student_id = $1 and title like 'Hostel caution deposit%'`, [t.students[0].id])).rows.map((r) => Number(r.amount_paise))).toEqual([500000]);
    await post('warden', '/v1/records/hostel-deposits', { student: 'R1', amount: 100, mode: 'cash' }).expect(409);
    // Internship: the bed is held and the days count as mess leave.
    const from = today();
    const until = new Date(Date.parse(`${from}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    await action('warden', 'hostel-residents', ids.resC, 'internship', { from, until }).expect(200);
    expect((await get('warden', `/v1/records/hostel-residents/${ids.resC}`).expect(200)).body.internshipUntil).toBe(until);
    expect((await get('warden', '/v1/records/mess-leaves?f.status=approved').expect(200)).body.rows[0]).toMatchObject({ rollNo: 'R3', reason: 'Internship' });
    // Transfer A to another bed in the same room.
    const free = (await get('warden', '/v1/hostel/beds?free=true').expect(200)).body.find((x: { room: string }) => x.room === '101');
    await action('warden', 'hostel-residents', ids.resA, 'transfer', { bedId: free.bedId, reason: 'Window bed' }).expect(200);
    const nowA = (await get('warden', '/v1/records/hostel-residents?f.status=resident&q=R1').expect(200)).body.rows[0];
    expect(nowA.place).toContain(free.label);
    // The family asks to vacate; the warden approves with damages; the settlement keeps the unused fee and the deposit less damages.
    await post('parent', '/v1/hostel/requests/mine', { studentId: t.students[0].id, kind: 'vacate', reason: 'Moving home', effectiveOn: today() }).expect(201);
    await post('parent', '/v1/hostel/requests/mine', { studentId: t.students[0].id, kind: 'vacate', reason: 'Again', effectiveOn: today() }).expect(409);
    const req = (await get('warden', '/v1/records/hostel-requests?f.status=pending').expect(200)).body.rows[0];
    const ok = (await action('warden', 'hostel-requests', req.id, 'approve', { damages: 500 }).expect(200)).body.rows[0];
    expect(ok).toMatchObject({ ok: true, message: expect.stringMatching(/^Refund ₹/) });
    const st = (await get('warden', '/v1/records/hostel-settlements').expect(200)).body.rows[0];
    const day = Number(today().slice(8, 10));
    const dim = new Date(Date.UTC(Number(today().slice(0, 4)), Number(today().slice(5, 7)), 0)).getUTCDate();
    expect(st).toMatchObject({ rollNo: 'R1', daysUsed: day, depositRupees: 5000, damagesRupees: 500, status: 'pending' });
    expect(st.prorataRupees).toBeCloseTo(Math.round((310000 * (dim - day)) / dim) / 100, 2);
    await action('warden', 'hostel-settlements', st.id, 'paid', { reference: 'NEFT 991' }).expect(200);
    expect((await get('warden', `/v1/records/hostel-deposits/${dep.id}`).expect(200)).body).toMatchObject({ status: 'refunded', refundedRupees: 4500 });
    expect((await get('parent', `/v1/hostel/no-dues/${t.students[0].id}`).expect(200)).body).toMatchObject({ resident: false });
    // Deleting an allotment is refused (it is history).
    expect((await http().delete(`/v1/records/hostel-residents/${ids.resA}`).set(as('warden')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
  });

  it('needs the family’s approval for a student’s own out-pass when the setting says so', async () => {
    await http().put('/v1/module-settings/hostel').set(as('principal')).send({ rules: { outpassNeedsParentApproval: true } }).expect(200);
    const back = new Date(Date.now() + 6 * 3600_000).toISOString();
    // Student C has no guardian in the fixture: link guardian 2 to decide.
    await owner.query(`insert into guardians (tenant_id, user_id, student_id, relation) values ($1, $2, $3, 'mother')`, [t.tenantId, t.guardian2.id, t.students[2].id]);
    const pass = (await post('student', '/v1/hostel/gate-passes/requests', { studentId: t.students[2].id, reason: 'Doctor', expectedBackAt: back }).expect(201)).body;
    expect(pass).toMatchObject({ status: 'parent_pending', parentStatus: 'pending' });
    // The family is told at once (a push in the Parent App), with the pass to open.
    const told = (await get('parent2', '/v1/notifications').expect(200)).body.items.filter((n: { kind: string }) => n.kind === 'hostel');
    expect(told).toEqual([expect.objectContaining({ data: { studentId: t.students[2].id, passId: pass.id }, title: expect.stringContaining('asks to leave the hostel') })]);
    expect((await get('parent2', '/v1/hostel/gate-passes/for-family').expect(200)).body).toEqual([expect.objectContaining({ studentName: expect.any(String), pass: expect.objectContaining({ id: pass.id, studentId: t.students[2].id, reason: 'Doctor' }) })]);
    await post('parent', `/v1/hostel/gate-passes/${pass.id}/parent-approve`).expect(404);
    expect((await post('parent2', `/v1/hostel/gate-passes/${pass.id}/parent-approve`).expect(200)).body).toMatchObject({ status: 'requested', parentStatus: 'approved' });
    await action('warden', 'hostel-gate-passes', pass.id, 'approve').expect(200);
    await action('warden', 'hostel-gate-passes', pass.id, 'out').expect(200);
    expect((await get('warden', `/v1/records/hostel-gate-passes?f.status=out`).expect(200)).body.total).toBe(1);
    await action('warden', 'hostel-gate-passes', pass.id, 'in').expect(200);
    expect((await get('warden', `/v1/records/hostel-gate-passes/${pass.id}`).expect(200)).body.status).toBe('returned');
  });

  it('escalates repeated late entries, fines indiscipline through fees, and alerts the family from the sick bay', async () => {
    for (let i = 0; i < 3; i++) await post('warden', '/v1/records/hostel-late-entries', { student: 'R3', minutesLate: 20 + i, reason: 'Bus late' }).expect(201);
    const late = (await get('warden', '/v1/records/hostel-late-entries?sort=at:desc').expect(200)).body.rows;
    expect(late.filter((r: { escalated: boolean }) => r.escalated)).toEqual([expect.objectContaining({ recent: 3, minutesLate: 22 })]);
    const inc = (await get('warden', '/v1/records/hostel-incidents?f.kind=late_entry').expect(200)).body.rows;
    expect(inc).toHaveLength(1);
    expect(JSON.stringify((await get('parent2', '/v1/notifications').expect(200)).body)).toContain('late back to the hostel');
    const fine = (await post('warden', '/v1/records/hostel-incidents', { student: 'R3', occurredOn: today(), kind: 'damage', description: 'Broke a window', fine: 750 }).expect(201)).body;
    expect((await action('warden', 'hostel-incidents', fine.id, 'chargeFine').expect(200)).body.rows[0]).toMatchObject({ ok: true, message: expect.stringContaining('Hostel fine') });
    expect((await action('warden', 'hostel-incidents', fine.id, 'chargeFine').expect(200)).body.rows[0].ok).toBe(false);
    const sick = (await post('warden', '/v1/records/hostel-sickbay', { student: 'R3', symptoms: 'Fever 101F', treatment: 'Paracetamol' }).expect(201)).body;
    expect(sick).toMatchObject({ parentAlerted: true, healthVisitId: expect.any(String) });
    expect((await owner.query(`select complaint from health_visits where student_id = $1`, [t.students[2].id])).rows).toEqual([{ complaint: 'Fever 101F' }]);
    expect(JSON.stringify((await get('parent2', '/v1/notifications').expect(200)).body)).toContain('sick bay');
    // The notice names the stay, and the family's hostel page shows it until discharge.
    const sickNote = (await get('parent2', '/v1/notifications').expect(200)).body.items.find((n: { kind: string; data: Record<string, string> }) => n.kind === 'welfare' && n.data.sickbayId);
    expect(sickNote.data).toEqual({ studentId: t.students[2].id, sickbayId: sick.id });
    expect((await get('parent2', `/v1/hostel/students/${t.students[2].id}`).expect(200)).body.sickbay).toEqual([expect.objectContaining({ id: sick.id, symptoms: 'Fever 101F', treatment: 'Paracetamol', dischargedAt: null })]);
    await action('warden', 'hostel-sickbay', sick.id, 'discharge').expect(200);
    expect((await get('parent2', `/v1/hostel/students/${t.students[2].id}`).expect(200)).body.sickbay[0].dischargedAt).toEqual(expect.any(String));
    expect((await action('warden', 'hostel-sickbay', sick.id, 'discharge').expect(200)).body.rows[0].ok).toBe(false);
  });

  it('bills the mess by the day with leave rebates and charges the month to fees', async () => {
    const plan = (await post('warden', '/v1/records/mess-plans', { name: 'Veg per day', meals: 'breakfast, lunch, dinner', billing: 'per_day', fee: 0, perDay: 100, rebateMinDays: 3, rebate: 80 }).expect(201)).body;
    expect(plan).toMatchObject({ meals: 'breakfast, lunch, dinner', billing: 'per_day' });
    await post('warden', '/v1/records/mess-plans', { name: 'Bad', meals: 'brunch', billing: 'fixed', fee: 10 }).expect(400);
    const month = today().slice(0, 7);
    const first = `${month}-01`;
    await post('warden', '/v1/records/mess-subscriptions', { student: 'R3', planId: plan.id, startsOn: first }).expect(201);
    const run = (await post('warden', '/v1/hostel/mess/bills/run', { month }).expect(200)).body;
    expect(run.bills).toBe(1);
    const bill = (await get('warden', `/v1/records/mess-bills?f.month=${month}`).expect(200)).body.rows[0];
    const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
    const leaveDays = dim - Number(today().slice(8, 10)) + 1; // the internship hold from today runs past the month's end
    expect(bill).toMatchObject({ days: dim, rebateDays: leaveDays, grossRupees: dim * 100, rebateRupees: leaveDays * 80, netRupees: dim * 100 - leaveDays * 80, status: 'draft' });
    const charged = (await post('warden', '/v1/hostel/mess/bills/charge', { month }).expect(200)).body;
    expect(charged).toMatchObject({ charged: 1 });
    expect((await get('warden', `/v1/records/mess-bills/${bill.id}`).expect(200)).body.status).toBe('charged');
    expect((await post('warden', '/v1/hostel/mess/bills/run', { month }).expect(200)).body).toMatchObject({ bills: 0, alreadyCharged: 1 });
  });

  it('plans the duty roster, records room assets, and reports occupancy', async () => {
    await post('warden', '/v1/records/hostel-staff', { hostelId: ids.boys, userId: ids.warden, role: 'warden', fromOn: today() }).expect(201);
    const plan = (await post('warden', '/v1/hostel/duties/plan', { hostelId: ids.boys, from: today(), to: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), shift: 'night', userIds: [ids.warden, t.teacher.id] }).expect(200)).body;
    expect(plan).toMatchObject({ made: plan.days, skipped: 0 });
    expect((await post('warden', '/v1/hostel/duties/plan', { hostelId: ids.boys, from: today(), to: today(), shift: 'night', userIds: [ids.warden] }).expect(200)).body).toMatchObject({ made: 0, skipped: 1 });
    const asset = (await post('warden', '/v1/records/hostel-room-assets', { roomId: ids.room101, name: 'Cot', quantity: 3, condition: 'good' }).expect(201)).body;
    await post('warden', '/v1/records/hostel-room-assets/bulk', { op: 'update', target: { ids: [asset.id] }, fields: { condition: 'damaged' } }).expect(200);
    expect((await get('warden', `/v1/records/hostel-room-assets/${asset.id}`).expect(200)).body.condition).toBe('damaged');
    const occ = (await get('warden', '/v1/hostel/occupancy').expect(200)).body;
    expect(occ.totals).toMatchObject({ beds: 8, occupied: 1, held: 0 });
    expect(occ.dutyToday).toEqual([expect.objectContaining({ shift: 'night' })]);
    const vac = (await get('warden', '/v1/ops-reports/hostel.vacancy').expect(200)).body.rows;
    expect(vac.find((r: { room: string }) => r.room === '101')).toMatchObject({ free: 2 });
    const res = (await get('warden', '/v1/ops-reports/hostel.residents').expect(200)).body.rows;
    expect(res).toEqual([expect.objectContaining({ rollNo: 'R3' })]);
    await get('teacher', '/v1/hostel/occupancy').expect(403);
    expect((await http().delete(`/v1/records/hostel-rooms/${ids.room101}`).set(as('warden')).expect(403)).body.code).toBe('RECORD_DELETE_REFUSED');
  });
});
