import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceDeskService } from '../src/attendance-desk/desk.service.js';
import { readXlsx } from '../src/common/xlsx.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The attendance desk: period, day and special-class sheets; copying marks across periods; lab batches and combined
 * classes; leave and on duty with approval that writes (and revoking that undoes) the marks; compensatory working
 * days; unmarked hours and reminders; eligibility under a university profile (per subject, condonation floor, fee);
 * shortage alerts; the monthly register; a student's own view; kit lists with bulk decisions; tenant isolation.
 */
describe('attendance desk', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = nextMondayIst('12:30');
  const clock = new FixedClock(start);
  const monday = new Date(start.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const lastMonday = addDays(monday, -7);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let slot2: string;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const mark = (studentId: string, date: string, slotId: string) => owner.query('select status from attendance_records where student_id = $1 and date = $2 and timetable_slot_id = $3', [studentId, date, slotId]).then((r) => r.rows[0]?.status as string | undefined);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [hod] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Hema Hod', email: `hod-desk-${t.slug}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: hod.id, role: 'hod' });
    const [dept] = await db.insert(s.departments).values({ tenantId: t.tenantId, name: 'Commerce', headUserId: hod.id }).returning();
    await owner.query('update subjects set department_id = $1 where id = $2', [dept.id, t.subject.id]);
    // A second Monday period of the same class, right after the first.
    const [two] = await db.insert(s.timetableSlots).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, dayOfWeek: 1, startsAt: '11:00', endsAt: '11:55' }).returning();
    slot2 = two.id;
    app = await createApp(clock);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.hod = await login(t.slug, `hod-desk-${t.slug}@x.in`);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.parent2 = await login(t.slug, t.guardian2.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it("shows a class's day and a period's sheet, and copies marks to the next period", async () => {
    const day = (await get('teacher', `/v1/attendance-desk/day?sectionId=${t.section.id}&date=${monday}`).expect(200)).body;
    expect(day.periods.map((p: { slotId: string }) => p.slotId)).toEqual([t.slot.id, slot2]);
    expect(day).toMatchObject({ holiday: null, followsWeekday: null, strength: 3 });
    await get('teacher2', `/v1/attendance-desk/day?sectionId=${t.section.id}&date=${monday}`).expect(403);

    const sheet = (await get('teacher', `/v1/attendance-desk/sheet?slotId=${t.slot.id}&date=${monday}`).expect(200)).body;
    expect(sheet).toMatchObject({ kind: 'period', meets: true, locked: false, future: false, subject: { code: 'BCOM-3.1' } });
    expect(sheet.roster.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R1', 'R2', 'R3']);
    expect(sheet.others.map((o: { slotId: string }) => o.slotId)).toEqual([slot2]);
    // The subject's head of department may mark it; another teacher may not.
    await get('hod', `/v1/attendance-desk/sheet?slotId=${t.slot.id}&date=${monday}`).expect(200);
    await get('teacher2', `/v1/attendance-desk/sheet?slotId=${t.slot.id}&date=${monday}`).expect(403);

    await post('teacher', '/v1/attendance-desk/copy', { fromSlotId: t.slot.id, date: monday, toSlotIds: [slot2] }).expect(400); // nothing to copy yet
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: monday, records: t.students.map((x, i) => ({ studentId: x.id, status: i === 1 ? 'absent' : 'present' })) }).expect(201);
    const copied = (await post('teacher', '/v1/attendance-desk/copy', { fromSlotId: t.slot.id, date: monday, toSlotIds: [slot2] }).expect(200)).body;
    expect(copied.results).toEqual([{ slotId: slot2, copied: 3 }]);
    expect(await mark(t.students[1].id, monday, slot2)).toBe('absent');
  });

  it('marks a lab batch and a combined class with only their students', async () => {
    await owner.query(`insert into student_batches (tenant_id, section_id, student_id, batch) values ($1, $2, $3, 'B1'), ($1, $2, $4, 'B2'), ($1, $2, $5, 'B2')`, [t.tenantId, t.section.id, t.students[0].id, t.students[1].id, t.students[2].id]);
    const [lab] = await db.insert(s.timetableSlots).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, dayOfWeek: 1, startsAt: '14:00', endsAt: '15:50', batch: 'B2' }).returning();
    const sheet = (await get('teacher', `/v1/attendance-desk/sheet?slotId=${lab.id}&date=${lastMonday}`).expect(200)).body;
    expect(sheet.roster.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R2', 'R3']);
    // A classmate outside the batch is left alone; a stranger is refused.
    await post('teacher', '/v1/attendance', { slotId: lab.id, date: lastMonday, records: t.students.map((x) => ({ studentId: x.id, status: 'present' })) }).expect(201);
    expect(await mark(t.students[0].id, lastMonday, lab.id)).toBeUndefined();
    expect(await mark(t.students[2].id, lastMonday, lab.id)).toBe('present');

    const [stranger] = await db.insert(s.students).values({ tenantId: t.tenantId, sectionId: t.otherSection.id, rollNo: 'B1', fullName: 'Other Section Kid' }).returning();
    await post('teacher', '/v1/attendance', { slotId: lab.id, date: lastMonday, records: [{ studentId: stranger.id, status: 'present' }] }).expect(400);
    const [combined] = await db.insert(s.timetableSlots).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, dayOfWeek: 2, startsAt: '09:00', endsAt: '09:55', combinedSectionIds: [t.otherSection.id] }).returning();
    const tuesday = addDays(lastMonday, 1);
    const both = (await get('teacher', `/v1/attendance-desk/sheet?slotId=${combined.id}&date=${tuesday}`).expect(200)).body;
    expect(both.roster.map((r: { fullName: string }) => r.fullName)).toContain('Other Section Kid');
    await post('teacher', '/v1/attendance', { slotId: combined.id, date: tuesday, records: [{ studentId: stranger.id, status: 'absent' }] }).expect(201);
    expect((await owner.query('select section_id from attendance_records where student_id = $1', [stranger.id])).rows[0].section_id).toBe(t.otherSection.id);
    await owner.query('delete from attendance_records where student_id = $1', [stranger.id]);
    await owner.query('delete from students where id = $1', [stranger.id]);
    await owner.query('delete from attendance_records where timetable_slot_id = any($1)', [[lab.id, combined.id]]);
    await owner.query('delete from timetable_slots where id = any($1)', [[lab.id, combined.id]]);
  });

  it('records the day and a session register for a class', async () => {
    const recs = t.students.map((x, i) => ({ studentId: x.id, status: i === 2 ? 'absent' : 'present' }));
    const day = (await post('teacher', '/v1/attendance-desk/day', { sectionId: t.section.id, date: monday, records: recs }).expect(201)).body;
    expect(day.roster.find((r: { id: string }) => r.id === t.students[2].id).status).toBe('absent');
    const fn = (await post('teacher', '/v1/attendance-desk/day', { sectionId: t.section.id, date: monday, session: 'fn', records: recs }).expect(201)).body;
    expect(fn).toMatchObject({ kind: 'session', session: 'fn' });
    await post('teacher2', '/v1/attendance-desk/day', { sectionId: t.section.id, date: monday, records: recs }).expect(403);
    await post('teacher', '/v1/attendance-desk/day', { sectionId: t.section.id, date: addDays(monday, 2), records: recs }).expect(400); // future
    await owner.query('delete from attendance_records where section_id = $1 and timetable_slot_id is null', [t.section.id]);
    await owner.query('delete from attendance_session_marks where section_id = $1', [t.section.id]);
  });

  let odId: string;
  it('approves on duty and leave, which write the marks and stand against a later mark, and revokes them', async () => {
    // Staff record on duty for a student (the teacher may decide: the class is theirs).
    const od = (await http().post('/v1/attendance-desk/leaves').set(as('principal')).field('studentId', t.students[2].id).field('kind', 'on_duty').field('fromDate', lastMonday).field('toDate', lastMonday).field('reason', 'College fest team').field('activity', 'Inter-college fest').field('approve', 'true').expect(201)).body;
    odId = od.id;
    expect(od).toMatchObject({ status: 'approved', countsAs: 'present', appliedMarks: 2 });
    expect(await mark(t.students[2].id, lastMonday, t.slot.id)).toBe('present');
    // A teacher's absent mark later does not overwrite the approved on duty.
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: lastMonday, records: [{ studentId: t.students[2].id, status: 'absent' }] }).expect(201);
    expect(await mark(t.students[2].id, lastMonday, t.slot.id)).toBe('present');
    const sheet = (await get('teacher', `/v1/attendance-desk/sheet?slotId=${t.slot.id}&date=${lastMonday}`).expect(200)).body;
    expect(sheet.roster.find((r: { id: string }) => r.id === t.students[2].id).leave).toMatchObject({ kind: 'on_duty', countsAs: 'present' });

    // A parent applies for personal leave of the second period only; overlapping leave is refused.
    const lv = (await http().post('/v1/attendance-desk/leaves').set(as('parent')).field('kind', 'personal').field('fromDate', lastMonday).field('toDate', lastMonday).field('fromTime', '11:00').field('toTime', '12:00').field('reason', 'Family function').expect(201)).body;
    expect(lv).toMatchObject({ status: 'pending', studentId: t.students[0].id });
    await http().post('/v1/attendance-desk/leaves').set(as('parent')).field('kind', 'personal').field('fromDate', lastMonday).field('toDate', lastMonday).field('reason', 'Again').expect(409);
    await http().post('/v1/attendance-desk/leaves').set(as('parent')).field('studentId', t.students[1].id).field('kind', 'personal').field('fromDate', lastMonday).field('toDate', lastMonday).field('reason', 'Not my child').expect(404);
    await http().post('/v1/attendance-desk/leaves').set(as('parent')).field('kind', 'medical').field('fromDate', monday).field('toDate', monday).field('reason', 'Fever').expect(400); // certificate required
    expect((await get('parent', '/v1/attendance-desk/leaves/mine').expect(200)).body).toHaveLength(1);

    // Kit list: the teacher sees their class's leave; a bulk approval writes the period's mark (absent by default).
    const list = (await get('teacher', '/v1/records/attendance-leaves?f.status=pending').expect(200)).body;
    expect(list.rows.map((r: { id: string }) => r.id)).toEqual([lv.id]);
    await post('teacher2', `/v1/attendance-desk/leaves/${lv.id}/decision`, { approve: true }).expect(403);
    const bulk = (await post('teacher', '/v1/records/attendance-leaves/bulk', { op: 'action', action: 'approve', target: { ids: [lv.id] }, params: {} }).expect(200)).body;
    expect(bulk.succeeded).toBe(1);
    expect(await mark(t.students[0].id, lastMonday, slot2)).toBe('absent');
    expect(await mark(t.students[0].id, lastMonday, t.slot.id)).toBeUndefined();
    const fam = await owner.query(`select count(*)::int as n from notifications where dedupe_key = $1`, [`att-leave:${lv.id}`]);
    expect(fam.rows[0].n).toBeGreaterThan(0);

    // An approved leave is not deleted (it wrote marks) but can be revoked: its marks go back to absent.
    await http().delete(`/v1/records/attendance-leaves/${odId}`).set(as('principal')).expect(403);
    await post('principal', `/v1/attendance-desk/leaves/${odId}/revoke`, { note: 'Did not travel' }).expect(200);
    expect(await mark(t.students[2].id, lastMonday, t.slot.id)).toBe('absent');
    const history = (await get('principal', `/v1/records/attendance-leaves/${odId}/history`).expect(200)).body;
    expect(history.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['attendance_leave.created', 'attendance_leave.approved', 'attendance_leave.revoked']));
  });

  it('records on duty for a whole team in one go', async () => {
    const r = (await post('hod', '/v1/attendance-desk/leaves/on-duty', { studentIds: t.students.map((x) => x.id), fromDate: addDays(lastMonday, -7), toDate: addDays(lastMonday, -7), activity: 'NSS camp', reason: 'Special camp', approve: true }).expect(201)).body;
    expect(r.created).toBe(3);
    expect(await mark(t.students[1].id, addDays(lastMonday, -7), t.slot.id)).toBe('present');
  });

  it('a compensatory working day follows another weekday and its periods can be marked', async () => {
    const saturday = addDays(lastMonday, 5);
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: saturday, records: [{ studentId: t.students[0].id, status: 'present' }] }).expect(400);
    await post('principal', '/v1/records/working-days', { date: saturday, followsWeekday: 1, reason: 'In lieu of a holiday' }).expect(201);
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: saturday, records: [{ studentId: t.students[0].id, status: 'present' }] }).expect(201);
    const tt = (await get('teacher', `/v1/teacher/timetable?date=${saturday}`).expect(200)).body;
    expect(tt.periods.map((p: { slotId: string }) => p.slotId)).toContain(t.slot.id);
    const day = (await get('teacher', `/v1/attendance-desk/day?sectionId=${t.section.id}&date=${saturday}`).expect(200)).body;
    expect(day.followsWeekday).toBe(1);
  });

  it('lists unmarked periods for the head of department and reminds the teacher', async () => {
    const before = addDays(lastMonday, -14);
    const um = (await get('hod', `/v1/attendance-desk/unmarked?from=${before}&to=${before}`).expect(200)).body;
    expect(um.rows.map((r: { slotId: string }) => r.slotId).sort()).toEqual([t.slot.id, slot2].sort());
    expect(um.byTeacher).toEqual([expect.objectContaining({ teacherId: t.teacher.id, count: 2 })]);
    expect((await get('teacher2', `/v1/attendance-desk/unmarked?from=${before}&to=${before}`).expect(200)).body.rows).toHaveLength(0);
    await post('teacher', '/v1/attendance-desk/unmarked/remind', { items: [{ slotId: t.slot.id, date: before }] }).expect(403);
    expect((await post('hod', '/v1/attendance-desk/unmarked/remind', { items: [{ slotId: t.slot.id, date: before }] }).expect(200)).body).toEqual({ reminded: 1 });
    expect((await owner.query(`select count(*)::int as n from notifications where user_id = $1 and dedupe_key = $2`, [t.teacher.id, `unmarked:${t.slot.id}:${before}`])).rows[0].n).toBe(1);
    // Another institution sees only its own periods.
    expect((await get('outsider', `/v1/attendance-desk/unmarked?from=${before}&to=${before}`).expect(200)).body.rows.map((r: { slotId: string }) => r.slotId)).not.toContain(t.slot.id);
  });

  it("follows the university's per-subject rule, condonation floor and fee for eligibility", async () => {
    await owner.query('delete from attendance_records where section_id = $1', [t.section.id]);
    await owner.query("update attendance_leaves set status = 'cancelled' where student_id = any($1)", [t.students.map((x) => x.id)]);
    // Ten past Mondays: A attends 8, B 7, C all.
    const rows = [];
    for (let i = 1; i <= 10; i++) {
      const date = addDays(monday, -7 * i);
      rows.push(
        { tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, date, timetableSlotId: t.slot.id, status: (i <= 8 ? 'present' : 'absent') as 'present' | 'absent', markedBy: t.teacher.id, occurredAt: start },
        { tenantId: t.tenantId, studentId: t.students[1].id, sectionId: t.section.id, date, timetableSlotId: t.slot.id, status: (i <= 7 ? 'present' : 'absent') as 'present' | 'absent', markedBy: t.teacher.id, occurredAt: start },
        { tenantId: t.tenantId, studentId: t.students[2].id, sectionId: t.section.id, date, timetableSlotId: t.slot.id, status: 'present' as const, markedBy: t.teacher.id, occurredAt: start },
      );
    }
    await db.insert(s.attendanceRecords).values(rows);
    await put('principal', '/v1/affiliation', { profileCode: 'vtu', schemeCode: '2022' }).expect(200);
    const e = (await get('principal', `/v1/attendance/eligibility?sectionId=${t.section.id}`).expect(200)).body;
    expect(e).toMatchObject({ thresholdPct: 85, source: 'profile', basis: 'per_subject', condonableToPct: 75 });
    const by = (i: number) => e.students.find((x: { studentId: string }) => x.studentId === t.students[i].id);
    expect(by(0)).toMatchObject({ pct: 80, status: 'condonable', eligible: false });
    expect(by(1)).toMatchObject({ pct: 70, status: 'detained' });
    expect(by(2)).toMatchObject({ status: 'eligible', eligible: true });

    const det = (await get('principal', '/v1/attendance-desk/detention').expect(200)).body;
    expect(det.rows.map((r: { status: string; rollNo: string }) => `${r.rollNo}:${r.status}`).sort()).toEqual(['R1:condonable', 'R2:detained']);

    const ask = async (studentId: string) => (await http().post('/v1/attendance/condonations').set(as('teacher')).field('studentId', studentId).field('subjectId', t.subject.id).field('kind', 'other').field('reason', 'Represented the state in athletics').expect(201)).body;
    const b = await ask(t.students[1].id);
    const refused = await post('principal', `/v1/attendance/condonations/${b.id}/decision`, { decision: 'approved', points: 10, note: 'Considered' }).expect(409);
    expect(refused.body.message).toMatch(/below 75%/);
    const a = await ask(t.students[0].id);
    const listed = (await get('principal', '/v1/attendance/condonations?status=pending').expect(200)).body;
    expect(listed.find((x: { id: string }) => x.id === a.id).attendance).toMatchObject({ pct: 80, condonable: true });
    const ok = (await post('principal', `/v1/attendance/condonations/${a.id}/decision`, { decision: 'approved', points: 5, note: 'Sports quota', feePaise: 50000 }).expect(200)).body;
    expect(ok).toMatchObject({ feeStatus: 'due', feePaise: 50000 });
    expect((await get('principal', `/v1/attendance/eligibility?sectionId=${t.section.id}`).expect(200)).body.students.find((x: { studentId: string }) => x.studentId === t.students[0].id).status).toBe('condonable');
    await post('principal', `/v1/attendance/condonations/${a.id}/fee`, { action: 'paid' }).expect(400);
    await post('teacher', `/v1/attendance/condonations/${a.id}/fee`, { action: 'paid', receipt: 'R-1' }).expect(403);
    await post('principal', `/v1/attendance/condonations/${a.id}/fee`, { action: 'paid', receipt: 'RC/2026/0042' }).expect(200);
    const after = (await get('principal', `/v1/attendance/eligibility?sectionId=${t.section.id}`).expect(200)).body.students.find((x: { studentId: string }) => x.studentId === t.students[0].id);
    expect(after).toMatchObject({ status: 'eligible', effectivePct: 80 }); // the subject was condoned, not the whole
    expect(after.subjects[0]).toMatchObject({ pct: 80, condoned: 5, effective: 85, short: false });

    // The condonation list as a kit entity, with the fee in its export.
    const kit = (await get('principal', '/v1/records/attendance-condonations?f.fee=paid').expect(200)).body;
    expect(kit.rows.map((r: { id: string }) => r.id)).toEqual([a.id]);
  });

  it('sends shortage alerts once a level, and logs them', async () => {
    const first = (await post('principal', '/v1/attendance-desk/alerts/run', {}).expect(200)).body;
    expect(first.students).toBeGreaterThanOrEqual(1);
    expect((await owner.query(`select count(*)::int as n from notifications where user_id = $1 and dedupe_key like 'att-shortage:%'`, [t.guardian2.id])).rows[0].n).toBe(1);
    expect((await post('principal', '/v1/attendance-desk/alerts/run', {}).expect(200)).body.students).toBe(0);
    const log = (await get('principal', '/v1/attendance-desk/alerts').expect(200)).body;
    expect(log.find((x: { studentId: string; kind: string }) => x.studentId === t.students[1].id)).toMatchObject({ kind: 'shortage', level: 85, subject: 'Corporate Accounting' });
    await post('teacher', '/v1/attendance-desk/alerts/run', {}).expect(403);
  });

  it('gives the monthly register (JSON and Excel) and one student their own attendance', async () => {
    const month = lastMonday.slice(0, 7);
    const reg = (await get('teacher', `/v1/attendance-desk/register?sectionId=${t.section.id}&month=${month}`).expect(200)).body;
    expect(reg.days).toContain(lastMonday);
    expect(reg.students.find((x: { id: string }) => x.id === t.students[2].id).cells[lastMonday]).toBe('1/1');
    const xlsx = await http().get(`/v1/attendance-desk/register?sectionId=${t.section.id}&month=${month}&format=xlsx`).set(as('teacher')).buffer(true).parse(binary).expect(200);
    expect(readXlsx(xlsx.body as Buffer)[0].slice(0, 2)).toEqual(['Roll', 'Student']);
    await get('teacher2', `/v1/attendance-desk/register?sectionId=${t.section.id}&month=${month}`).expect(403);

    const mine = (await get('parent2', `/v1/attendance-desk/students/${t.students[1].id}`).expect(200)).body;
    expect(mine).toMatchObject({ student: { rollNo: 'R2' }, policy: { thresholdPct: 85, basis: 'per_subject' }, status: 'detained' });
    expect(mine.subjects[0]).toMatchObject({ code: 'BCOM-3.1', pct: 70 });
    expect(mine.days[0].marks[0]).toMatchObject({ subject: 'Corporate Accounting' });
    await get('parent', `/v1/attendance-desk/students/${t.students[1].id}`).expect(404);
    await get('outsider', `/v1/attendance-desk/students/${t.students[1].id}`).expect(404);
  });

  it('marks a special class and counts it towards the subject', async () => {
    const sc = (await post('teacher', '/v1/records/special-classes', { kind: 'extra', sectionId: t.section.id, subjectId: t.subject.id, date: lastMonday, startsAt: '16:00', endsAt: '16:55', topic: 'Revision' }).expect(201)).body;
    const sheet = (await get('teacher', `/v1/attendance-desk/sheet?specialId=${sc.id}`).expect(200)).body;
    expect(sheet).toMatchObject({ kind: 'special', status: 'scheduled' });
    await post('teacher2', `/v1/attendance-desk/special/${sc.id}`, { records: [{ studentId: t.students[1].id, status: 'present' }] }).expect(403);
    await post('teacher', `/v1/attendance-desk/special/${sc.id}`, { records: [{ studentId: t.students[1].id, status: 'present' }] }).expect(200);
    const me = (await get('principal', `/v1/attendance-desk/students/${t.students[1].id}`).expect(200)).body;
    expect(me.subjects[0]).toMatchObject({ held: 11, attended: 8 });
    const listed = (await get('teacher', '/v1/records/special-classes').expect(200)).body.rows;
    expect(listed[0]).toMatchObject({ status: 'held', marked: 1 });
  });

  it('keeps corrections as a kit list with bulk decisions, and the department dashboard', async () => {
    const c = (await post('teacher', '/v1/attendance/corrections', { slotId: t.slot.id, date: lastMonday, studentId: t.students[1].id, toStatus: 'late', reason: 'Arrived after roll call' }).expect(201)).body;
    expect((await get('teacher', '/v1/records/attendance-corrections').expect(200)).body.rows.map((r: { id: string }) => r.id)).toEqual([c.id]);
    expect((await get('teacher2', '/v1/records/attendance-corrections').expect(200)).body.total).toBe(0);
    await post('teacher', '/v1/records/attendance-corrections/bulk', { op: 'action', action: 'approve', target: { ids: [c.id] }, params: { note: 'Fine' } }).expect(403);
    const r = (await post('hod', '/v1/records/attendance-corrections/bulk', { op: 'action', action: 'approve', target: { ids: [c.id] }, params: { note: 'Verified' } }).expect(200)).body;
    expect(r.succeeded).toBe(1);
    expect(await mark(t.students[1].id, lastMonday, t.slot.id)).toBe('late');

    const dash = (await get('principal', `/v1/attendance-desk/dashboard?date=${lastMonday}`).expect(200)).body;
    expect(dash.departments.find((d: { department: string }) => d.department === 'Commerce')).toMatchObject({ periodsMarked: 1 });
    expect((await get('outsider', '/v1/records/attendance-corrections').expect(200)).body.total).toBe(0);
    expect((await get('outsider', '/v1/records/attendance-leaves').expect(200)).body.total).toBe(0);
  });

  it('the hourly job reminds teachers of unmarked periods and sends the evening digest', async () => {
    await put('principal', '/v1/academics/settings/attendance', { dailyDigest: true, unmarkedReminderMinutes: 30 }).expect(200);
    await post('teacher', '/v1/attendance', { slotId: t.slot.id, date: monday, records: [{ studentId: t.students[0].id, status: 'absent' }] }).expect(201);
    clock.at = new Date(start.getTime() + 6 * 3600_000); // 18:30
    const r = await app.get(AttendanceDeskService).runAlerts(t.tenantId);
    expect(r.digests).toBeGreaterThanOrEqual(1);
    expect((await owner.query(`select count(*)::int as n from notifications where dedupe_key = $1`, [`att-digest:${t.students[0].id}:${monday}`])).rows[0].n).toBeGreaterThan(0);
    expect((await owner.query(`select count(*)::int as n from notifications where user_id = $1 and dedupe_key = $2`, [t.teacher.id, `unmarked:${slot2}:${monday}`])).rows[0].n).toBe(1);
    clock.at = start;
  });
});
