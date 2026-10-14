import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx, writeWorkbook } from '../src/common/xlsx.js';
import { electedOf } from '../src/campus-life/life-depth.service.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * Campus life depth: the record kit on clubs, committees, events, units, achievements, outreach, claims and
 * elections; NSS hours against the target; club budgets and claims; event proposals, clashes, reports, external
 * registrations, refunds on cancellation and duty leave; student council elections with a secret ballot; NAAC registers.
 */
describe('campus life depth', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const today = () => clock.now().toISOString().slice(0, 10);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  let unitId: string;
  it('runs NSS units through the kit and logs hours against the target', async () => {
    const meta = (await http().get('/v1/records/activity-units/meta').set(as('teacher')).expect(200)).body;
    expect(meta.can).toMatchObject({ write: true, import: true, reorder: true, duplicate: true, create: true });
    await http().post('/v1/records/activity-units').set(as('teacher')).send({ kind: 'nss', name: '' }).expect(400);
    const u = (await http().post('/v1/records/activity-units').set(as('teacher')).send({ kind: 'nss', name: 'NSS Unit 1', coordinatorUserId: t.teacher.id, targetHours: 10 }).expect(201)).body;
    unitId = u.id;
    expect(u).toMatchObject({ name: 'NSS Unit 1', coordinatorName: expect.any(String), members: 0, hours: 0 });
    await http().post('/v1/records/activity-units').set(as('teacher')).send({ kind: 'sports', name: 'Cricket XI', sport: 'Cricket' }).expect(201);
    await http().post('/v1/records/activity-units').set(as('teacher')).send({ kind: 'nss', name: 'nss unit 1' }).expect(409);
    await http().get('/v1/records/activity-units').set(as('parent')).expect(403);
    expect((await http().get('/v1/records/activity-units?f.kind=sports').set(as('teacher')).expect(200)).body.rows.map((r: { name: string }) => r.name)).toEqual(['Cricket XI']);
    expect((await http().get('/v1/records/activity-units').set(as('outsider')).expect(200)).body.total).toBe(0);

    await http().post(`/v1/campus-life/units/${unitId}/members`).set(as('teacher')).send({ studentIds: [t.students[0].id, t.students[1].id], role: 'volunteer', enrolledOn: today() }).expect(201);
    const camp = (await http().post(`/v1/campus-life/units/${unitId}/activities`).set(as('teacher')).send({ title: 'Special camp', kind: 'camp', startsOn: today(), endsOn: today(), hours: 7 }).expect(201)).body;
    await http().put(`/v1/campus-life/unit-activities/${camp.id}/hours`).set(as('teacher')).send({ entries: [{ studentId: t.students[2].id, hours: 7 }] }).expect(400); // not a member
    await http().put(`/v1/campus-life/unit-activities/${camp.id}/hours`).set(as('teacher')).send({ entries: [{ studentId: t.students[0].id, hours: 7 }, { studentId: t.students[1].id, hours: 4 }] }).expect(200);
    const drive = (await http().post(`/v1/campus-life/units/${unitId}/activities`).set(as('teacher')).send({ title: 'Blood donation drive', startsOn: today(), endsOn: today(), hours: 3 }).expect(201)).body;
    await http().put(`/v1/campus-life/unit-activities/${drive.id}/hours`).set(as('teacher')).send({ entries: [{ studentId: t.students[0].id, hours: 3 }] }).expect(200);

    const detail = (await http().get(`/v1/campus-life/units/${unitId}`).set(as('teacher')).expect(200)).body;
    expect(detail.members.map((m: { rollNo: string; hours: number; targetMet: boolean }) => [m.rollNo, m.hours, m.targetMet])).toEqual([['R1', 10, true], ['R2', 4, false]]);
    const report = (await http().get('/v1/campus-life/reports/unit-hours?kind=nss').set(as('teacher')).expect(200)).body;
    expect(report.find((r: { rollNo: string }) => r.rollNo === 'R1')).toMatchObject({ hours: 10, camps: 1, complete: true });

    const list = (await http().get('/v1/records/activity-units?sort=hours:desc').set(as('teacher')).expect(200)).body;
    expect(list.rows[0]).toMatchObject({ name: 'NSS Unit 1', members: 2, hours: 14, activities: 2 });
    // Delete to the bin takes members and hours with it, and restore brings them back.
    const del = (await http().delete(`/v1/records/activity-units/${unitId}`).set(as('principal')).expect(200)).body;
    expect(del.rows).toBeGreaterThanOrEqual(6);
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200);
    expect((await http().get(`/v1/campus-life/units/${unitId}`).set(as('teacher')).expect(200)).body.members).toHaveLength(2);
  });

  it('keeps the achievements register with verification, import, export and the NAAC counts', async () => {
    const a = (await http().post('/v1/records/student-achievements').set(as('teacher')).send({ studentId: t.students[0].id, title: 'First prize, debate', category: 'cultural', level: 'university', position: 'winner', achievedOn: today(), awardRupees: 1500 }).expect(201)).body;
    expect(a).toMatchObject({ studentName: 'Student A', status: 'pending', awardRupees: 1500 });
    const verified = (await http().post('/v1/records/student-achievements/bulk').set(as('teacher')).send({ op: 'action', action: 'verify', target: { ids: [a.id] } }).expect(200)).body;
    expect(verified.succeeded).toBe(1);
    expect((await http().get(`/v1/records/student-achievements/${a.id}`).set(as('teacher')).expect(200)).body).toMatchObject({ status: 'verified', verifiedByName: expect.any(String) });

    const tpl = await http().get('/v1/records/student-achievements/import/template').set(as('teacher')).buffer(true).parse(binary).expect(200);
    expect((await readXlsx(tpl.body as Buffer))[0]).toEqual(expect.arrayContaining(['Roll no *', 'Achievement *', 'Level *']));
    const file = await writeWorkbook([{ name: 'Data', rows: [['Roll no', 'Class', 'Achievement', 'Category', 'Level', 'Position', 'Event', 'Organised by', 'Date', 'Team event'], ['R2', '', 'Gold, 100 m', 'sports', 'state', 'winner', 'State athletics meet', 'KSAA', today(), 'no'], ['R9', '', 'Nothing', 'sports', 'state', 'winner', '', '', today(), '']] }]);
    const check = (await http().post('/v1/records/student-achievements/import?mode=upsert').set(as('teacher')).attach('file', file, 'a.xlsx').expect(200)).body;
    expect(check.totals).toMatchObject({ rows: 2, error: 1 });
    await http().post(`/v1/records/student-achievements/import/${check.id}/commit`).set(as('teacher')).send({ skipErrors: true }).expect(200);

    const naac = (await http().get('/v1/campus-life/reports/naac').set(as('teacher')).expect(200)).body;
    expect(naac.m531.awards).toBe(2);
    const exp = await http().get('/v1/records/student-achievements/export?format=csv').set(as('teacher')).expect(200);
    expect(exp.text).toContain('Gold, 100 m');
  });

  it('records outreach for NAAC 3.4 and 7.1', async () => {
    await http().post('/v1/records/outreach-activities').set(as('teacher')).send({ title: 'Tree plantation', kind: 'sustainability', heldOn: today(), studentsCount: 40, beneficiaries: 200 }).expect(201);
    await http().post('/v1/records/outreach-activities').set(as('teacher')).send({ title: 'Village survey', kind: 'extension', heldOn: today(), studentsCount: 25, beneficiaries: 120, unitId }).expect(201);
    const naac = (await http().get('/v1/campus-life/reports/naac').set(as('teacher')).expect(200)).body;
    expect(naac).toMatchObject({ m343: { programmes: 1 }, m344: { students: 25, reached: 120 }, m711: { sustainability: 1, gender: 0 } });
    expect((await http().get(`/v1/records/outreach-activities?f.unit=${unitId}`).set(as('teacher')).expect(200)).body.total).toBe(1);
  });

  it('holds club claims to the budget, with a second person deciding', async () => {
    const club = (await http().post('/v1/records/clubs').set(as('teacher')).send({ name: 'Nature Club', category: 'service' }).expect(201)).body;
    const year = (await http().get('/v1/campus-life/club-budgets').set(as('teacher')).expect(200)).body.year as string;
    await http().put(`/v1/campus-life/clubs/${club.id}/budget`).set(as('teacher')).send({ yearLabel: year, amountPaise: 500000 }).expect(403);
    await http().put(`/v1/campus-life/clubs/${club.id}/budget`).set(as('principal')).send({ yearLabel: year, amountPaise: 500000 }).expect(200);
    const c1 = (await http().post('/v1/records/club-expense-claims').set(as('teacher')).send({ clubId: club.id, title: 'Saplings', amountRupees: 3000, spentOn: today() }).expect(201)).body;
    const c2 = (await http().post('/v1/records/club-expense-claims').set(as('teacher')).send({ clubId: club.id, title: 'Banner', amountRupees: 2500, spentOn: today() }).expect(201)).body;
    expect(c1).toMatchObject({ status: 'submitted', amountRupees: 3000, yearLabel: expect.stringMatching(/^\d{4}-\d{2}$/) });
    const r = (await http().post('/v1/records/club-expense-claims/bulk').set(as('principal')).send({ op: 'action', action: 'approve', target: { ids: [c1.id, c2.id] } }).expect(200)).body;
    expect(r).toMatchObject({ succeeded: 1, failed: 1 }); // the second goes over the ₹5,000 budget
    await http().post('/v1/records/club-expense-claims/bulk').set(as('teacher')).send({ op: 'action', action: 'approve', target: { ids: [c2.id] } }).expect(403);
    await http().post('/v1/records/club-expense-claims/bulk').set(as('principal')).send({ op: 'action', action: 'pay', params: { paymentRef: 'CHQ 1' }, target: { ids: [c1.id] } }).expect(200);
    await http().delete(`/v1/records/club-expense-claims/${c1.id}`).set(as('principal')).expect(403);
    const b = (await http().get(`/v1/campus-life/club-budgets?year=${year}`).set(as('teacher')).expect(200)).body.clubs.find((x: { club: string }) => x.club === 'Nature Club');
    expect(b).toMatchObject({ budgetPaise: 500000, approvedPaise: 300000, paidPaise: 300000, submittedPaise: 250000, remainingPaise: 200000 });
  });

  it('takes an event from proposal to report, with clashes, external registrations, refunds and duty leave', async () => {
    const starts = new Date(clock.now().getTime() + 2 * 86400_000);
    const ends = new Date(starts.getTime() + 6 * 3600_000);
    const ev = (await http().post('/v1/campus-life/events').set(as('teacher')).send({ title: 'Inter-college fest', eventType: 'fest', venue: 'Main hall', capacity: 3, startsAt: starts, endsAt: ends, feePaise: 10000 }).expect(201)).body;
    await http().patch(`/v1/records/campus-events/${ev.id}`).set(as('teacher')).send({ budgetRupees: 20000, externalRegistration: true }).expect(200);
    const day = starts.toISOString().slice(0, 10);
    await owner.query(`insert into calendar_events (tenant_id, kind, title, starts_on, ends_on, created_by) values ($1, 'exam', 'Internal test 1', $2, $2, $3)`, [t.tenantId, day, t.principal.id]);
    const proposed = (await http().post(`/v1/campus-life/events/${ev.id}/propose`).set(as('teacher')).expect(200)).body;
    expect(proposed.clashes.exams).toEqual([expect.objectContaining({ title: 'Internal test 1' })]);
    await http().post('/v1/records/campus-events/bulk').set(as('teacher')).send({ op: 'action', action: 'publish', target: { ids: [ev.id] } }).expect(200).expect((r) => expect(r.body.failed).toBe(1));
    await http().post(`/v1/campus-life/events/${ev.id}/approval`).set(as('principal')).send({ decision: 'reject' }).expect(400);
    await http().post(`/v1/campus-life/events/${ev.id}/approval`).set(as('principal')).send({ decision: 'approve', note: 'Move the test' }).expect(200);
    await http().post('/v1/records/campus-events/bulk').set(as('teacher')).send({ op: 'action', action: 'publish', target: { ids: [ev.id] } }).expect(200).expect((r) => expect(r.body.succeeded).toBe(1));

    const reg = (await http().post(`/v1/campus-life/events/${ev.id}/register`).set(as('parent')).send({}).expect(201)).body;
    await http().post(`/v1/campus-life/registrations/${reg.id}/payment`).set(as('teacher')).send({ paidPaise: 10000, paymentRef: 'R-101' }).expect(200);
    await http().post(`/v1/campus-life/events/${ev.id}/external`).set(as('teacher')).send({ fullName: 'Guest One', institution: 'Other College', paidPaise: 5000 }).expect(400); // no contact
    await http().post(`/v1/campus-life/events/${ev.id}/external`).set(as('teacher')).send({ fullName: 'Guest One', phone: '9800000001', institution: 'Other College', paidPaise: 5000 }).expect(400); // short of the fee
    const ext = (await http().post(`/v1/campus-life/events/${ev.id}/external`).set(as('teacher')).send({ fullName: 'Guest One', phone: '9800000001', institution: 'Other College', paidPaise: 10000, paymentRef: 'UPI-1' }).expect(201)).body;
    await http().post(`/v1/campus-life/events/${ev.id}/check-in-external`).set(as('teacher')).send({ token: ext.qrToken }).expect(200);
    await http().post(`/v1/campus-life/events/${ev.id}/check-in`).set(as('teacher')).send({ token: reg.qrToken }).expect(200);

    // Duty leave: the checked-in student is excused for the event's day.
    await owner.query(`insert into attendance_records (tenant_id, student_id, section_id, date, status, marked_by, occurred_at) values ($1, $2, $3, $4, 'absent', $5, now())`, [t.tenantId, t.students[0].id, t.section.id, day, t.teacher.id]);
    const duty = (await http().post(`/v1/campus-life/events/${ev.id}/duty-leave`).set(as('principal')).send({}).expect(200)).body;
    expect(duty.granted).toEqual([{ studentId: t.students[0].id, excused: 1 }]);
    expect((await owner.query(`select status from attendance_records where student_id = $1 and date = $2`, [t.students[0].id, day])).rows[0].status).toBe('excused');
    expect((await owner.query(`select status, reason from student_leave_requests where student_id = $1`, [t.students[0].id])).rows[0]).toMatchObject({ status: 'approved', reason: expect.stringContaining('Duty leave') });
    expect((await http().post(`/v1/campus-life/events/${ev.id}/duty-leave`).set(as('principal')).send({}).expect(200)).body.skipped).toBe(1);

    const row = (await http().get(`/v1/records/campus-events/${ev.id}`).set(as('teacher')).expect(200)).body;
    expect(row).toMatchObject({ registered: 1, external: 1, attended: 2, budgetRupees: 20000, approvalStatus: 'approved' });

    // Cancelled after paid registrations: both payers are owed a refund.
    const cancelled = (await http().post('/v1/records/campus-events/bulk').set(as('teacher')).send({ op: 'action', action: 'cancel', params: { reason: 'Rain' }, target: { ids: [ev.id] } }).expect(200)).body;
    expect(cancelled.rows[0]).toMatchObject({ ok: true, message: '2 refunds due' });
    const refunds = (await http().get(`/v1/campus-life/events/${ev.id}/refunds`).set(as('teacher')).expect(200)).body;
    expect(refunds.map((r: { kind: string; refundStatus: string }) => [r.kind, r.refundStatus]).sort()).toEqual([['external', 'due'], ['student', 'due']]);
    await http().post(`/v1/campus-life/refunds/student/${reg.id}`).set(as('principal')).send({ refundRef: 'NEFT-9' }).expect(200);
    await http().post(`/v1/campus-life/refunds/student/${reg.id}`).set(as('principal')).send({}).expect(409);
    const register = (await http().get('/v1/campus-life/reports/event-register').set(as('teacher')).expect(200)).body;
    expect(register.find((x: { id: string }) => x.id === ev.id)).toMatchObject({ status: 'cancelled', feesPaise: 20000, refundsDue: 1 });
  });

  it('writes the report after a held event', async () => {
    const starts = new Date(clock.now().getTime() - 3 * 3600_000);
    const ev = (await http().post('/v1/campus-life/events').set(as('teacher')).send({ title: 'Guest lecture', eventType: 'seminar', venue: 'Room 1', capacity: 50, startsAt: starts, endsAt: new Date(starts.getTime() + 3600_000), publish: true }).expect(201)).body;
    await http().put(`/v1/campus-life/events/${ev.id}/report`).set(as('teacher')).send({ report: 'Sixty students attended the lecture on GST.', spentPaise: 150000 }).expect(200);
    expect((await http().get('/v1/records/campus-events?f.report=done').set(as('teacher')).expect(200)).body.rows.map((r: { id: string }) => r.id)).toContain(ev.id);
  });

  it('runs a student council election with one secret ballot each', async () => {
    expect(electedOf([{ id: 'a', votes: 3 }, { id: 'b', votes: 3 }, { id: 'c', votes: 1 }], 1)).toEqual({ elected: [], tie: true });
    expect(electedOf([{ id: 'a', votes: 3 }, { id: 'b', votes: 2 }, { id: 'c', votes: 1 }], 2)).toEqual({ elected: ['a', 'b'], tie: false });

    const e = (await http().post('/v1/campus-life/elections').set(as('principal')).send({ title: 'Council 2026', votingStartsAt: new Date(clock.now().getTime() - 3600_000), votingEndsAt: new Date(clock.now().getTime() + 3600_000) }).expect(201)).body;
    await http().post('/v1/campus-life/elections').set(as('teacher')).send({ title: 'x', votingStartsAt: clock.now(), votingEndsAt: clock.now() }).expect(403);
    const post = (await http().post(`/v1/campus-life/elections/${e.id}/posts`).set(as('principal')).send({ title: 'President', seats: 1 }).expect(201)).body;
    await http().post(`/v1/campus-life/elections/${e.id}/open`).set(as('principal')).expect(409); // no candidate yet
    const ca = (await http().post(`/v1/campus-life/election-posts/${post.id}/candidates`).set(as('principal')).send({ studentId: t.students[0].id, manifesto: 'More clubs' }).expect(201)).body;
    await http().post(`/v1/campus-life/election-posts/${post.id}/candidates`).set(as('principal')).send({ studentId: t.students[1].id }).expect(201);
    await http().post(`/v1/campus-life/elections/${e.id}/open`).set(as('principal')).expect(200);

    const mine = (await http().get('/v1/campus-life/me/elections').set(as('student')).expect(200)).body;
    expect(mine[0]).toMatchObject({ title: 'Council 2026', canVote: true, voted: false });
    expect(mine[0].posts[0].candidates[0]).not.toHaveProperty('votes');
    await http().post(`/v1/campus-life/elections/${e.id}/vote`).set(as('student')).send({ choices: [{ postId: post.id, candidateIds: [ca.id, ca.id, 'x'] }] }).expect(400);
    await http().post(`/v1/campus-life/elections/${e.id}/vote`).set(as('student')).send({ choices: [{ postId: post.id, candidateIds: [ca.id] }] }).expect(200);
    await http().post(`/v1/campus-life/elections/${e.id}/vote`).set(as('student')).send({ choices: [{ postId: post.id, candidateIds: [ca.id] }] }).expect(409);
    // The ballot holds no voter; the voter list holds no choice.
    expect(Object.keys((await owner.query(`select * from election_ballots where election_id = $1`, [e.id])).rows[0])).not.toContain('student_id');

    const closed = (await http().post(`/v1/campus-life/elections/${e.id}/close`).set(as('principal')).expect(200)).body;
    expect(closed.ties).toEqual([]);
    const result = (await http().get(`/v1/campus-life/elections/${e.id}`).set(as('principal')).expect(200)).body;
    expect(result).toMatchObject({ voted: 1, electorate: 3 });
    expect(result.posts[0].candidates.find((c: { id: string }) => c.id === ca.id)).toMatchObject({ votes: 1, elected: true });
    await http().post(`/v1/campus-life/elections/${e.id}/publish`).set(as('principal')).expect(200);
    const list = (await http().get('/v1/records/elections').set(as('principal')).expect(200)).body;
    expect(list.rows[0]).toMatchObject({ title: 'Council 2026', status: 'published', voted: 1, candidates: 2 });
    expect((await http().get('/v1/records/elections').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('lists clubs and committees through the kit with history', async () => {
    const c = (await http().post('/v1/records/committees').set(as('principal')).send({ name: 'Anti-ragging committee', statutory: true }).expect(201)).body;
    await http().patch(`/v1/records/committees/${c.id}`).set(as('principal')).send({ description: 'Meets monthly' }).expect(200);
    const h = (await http().get(`/v1/records/committees/${c.id}/history`).set(as('principal')).expect(200)).body;
    expect(h.items[0]).toMatchObject({ action: 'committee.updated', changes: [{ field: 'description', before: '', after: 'Meets monthly' }] });
    await http().get('/v1/records/committees').set(as('teacher')).expect(403);
    const dup = (await http().post(`/v1/records/committees/${c.id}/duplicate`).set(as('principal')).expect(201)).body;
    expect(dup.name).toBe('Anti-ragging committee (copy)');
    expect((await http().get('/v1/records/clubs?q=nature').set(as('teacher')).expect(200)).body.rows[0]).toMatchObject({ name: 'Nature Club', members: 0 });
  });
});
