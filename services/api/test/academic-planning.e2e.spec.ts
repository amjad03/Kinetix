import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx, writeWorkbook } from '../src/common/xlsx.js';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * Academic planning: the course master on subjects, elective baskets and requisites (and what course registration
 * makes of them), credit transfers, faculty allocation with a mid-semester hand-over that keeps history, the teaching
 * load against norms, bell schedules, special classes, working days, regulations, lab batches and timetable clashes,
 * draft calendar entries, planning reports, permissions and tenant isolation.
 */
describe('academic planning', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const start = nextMondayIst('09:00');
  const clock = new FixedClock(start);
  const monday = new Date(start.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let subject2: string;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(as(who)).send(body);
  const patch = (who: string, url: string, body: object = {}) => http().patch(url).set(as(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(as(who)).send(body);
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [hod] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Hari Hod', email: `hod-plan-${t.slug}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: hod.id, role: 'hod' });
    const [sub2] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: t.program.id, term: 3, code: 'BCOM-3.8', name: 'Cost Accounting' }).returning();
    subject2 = sub2.id;
    app = await createApp(clock);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.hod = await login(t.slug, `hod-plan-${t.slug}@x.in`);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps the course master on subjects: credits, L-T-P-S, type and the marks split, with history and bulk edit', async () => {
    const meta = (await get('principal', '/v1/records/subjects/meta').expect(200)).body;
    expect(meta.fields.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(['courseType', 'credits', 'lectureHours', 'maxInternal', 'externalPassMarks']));
    await patch('principal', `/v1/records/subjects/${t.subject.id}`, { credits: 4, lectureHours: 3, tutorialHours: 1, courseType: 'core', maxInternal: 40, maxExternal: 60, externalPassMarks: 21 }).expect(200);
    await patch('principal', `/v1/records/subjects/${t.subject.id}`, { courseType: 'nonsense' }).expect(400);
    const row = (await get('principal', `/v1/records/subjects/${t.subject.id}`).expect(200)).body;
    expect(row).toMatchObject({ credits: 4, lectureHours: 3, tutorialHours: 1, maxInternal: 40, maxExternal: 60, externalPassMarks: 21 });
    const h = (await get('principal', `/v1/records/subjects/${t.subject.id}/history`).expect(200)).body;
    expect(h.items[0].changes).toEqual(expect.arrayContaining([{ field: 'credits', label: 'Credits', before: null, after: 4 }]));
    const bulk = (await post('principal', '/v1/records/subjects/bulk', { op: 'update', target: { ids: [t.subject.id, subject2] }, fields: { courseType: 'elective', credits: 3 } }).expect(200)).body;
    expect(bulk.succeeded).toBe(2);
    expect((await get('principal', '/v1/records/subjects?f.type=elective').expect(200)).body.total).toBe(2);
  });

  let basketId: string;
  it('keeps elective baskets with their courses, and prerequisites without cycles', async () => {
    await post('teacher', '/v1/records/elective-baskets', { programId: t.program.id, term: 3, name: 'Discipline elective I', kind: 'elective', minChoose: 1, maxChoose: 1 }).expect(403);
    await post('principal', '/v1/records/elective-baskets', { programId: t.program.id, term: 3, name: 'Bad', kind: 'elective', minChoose: 3, maxChoose: 1 }).expect(400);
    await post('principal', '/v1/records/elective-baskets', { programId: t.program.id, term: 9, name: 'Bad', kind: 'elective', minChoose: 1, maxChoose: 1 }).expect(400);
    const b = (await post('principal', '/v1/records/elective-baskets', { programId: t.program.id, term: 3, name: 'Discipline elective I', kind: 'elective', minChoose: 1, maxChoose: 1, maxCredits: 4 }).expect(201)).body;
    basketId = b.id;
    const m = (await get('teacher', `/v1/academic-planning/baskets/${b.id}/subjects`).expect(200)).body;
    expect(m.subjects.filter((x: { sameTerm: boolean }) => x.sameTerm).map((x: { code: string }) => x.code)).toEqual(['BCOM-3.1', 'BCOM-3.8']);
    await put('teacher', `/v1/academic-planning/baskets/${b.id}/subjects`, { subjectIds: [t.subject.id] }).expect(403);
    await put('principal', `/v1/academic-planning/baskets/${b.id}/subjects`, { subjectIds: [t.subject.id, subject2] }).expect(200);
    const listed = (await get('principal', '/v1/records/elective-baskets').expect(200)).body.rows[0];
    expect(listed).toMatchObject({ members: 'BCOM-3.1, BCOM-3.8', memberCount: 2, credits: 6 });
    const copy = (await post('principal', `/v1/records/elective-baskets/${b.id}/duplicate`).expect(201)).body;
    expect(copy.name).toBe('Discipline elective I (copy)');

    await post('principal', '/v1/records/course-requisites', { subjectId: subject2, requiresSubjectId: subject2, kind: 'prerequisite' }).expect(400);
    const req = (await post('principal', '/v1/records/course-requisites', { subjectId: subject2, requiresSubjectId: t.subject.id, kind: 'prerequisite' }).expect(201)).body;
    expect(req).toMatchObject({ code: 'BCOM-3.8', requiresCode: 'BCOM-3.1' });
    await post('principal', '/v1/records/course-requisites', { subjectId: t.subject.id, requiresSubjectId: subject2, kind: 'corequisite' }).expect(409); // a cycle
    await post('principal', '/v1/records/course-requisites', { subjectId: subject2, requiresSubjectId: t.subject.id, kind: 'corequisite' }).expect(409); // already there
    expect((await get('principal', `/v1/records/subjects/${subject2}`).expect(200)).body.requires).toBe('BCOM-3.1');
  });

  it('records credit transfers from ABC and MOOCs and approves them', async () => {
    const ct = (await post('principal', '/v1/records/credit-transfers', { studentId: t.students[0].id, source: 'nptel', courseTitle: 'Data Science for Engineers', provider: 'IIT Madras', externalRef: 'NPTEL24CS12S', credits: 3, grade: 'Elite', completedOn: '2026-10-01', mappedSubjectId: subject2 }).expect(201)).body;
    expect(ct).toMatchObject({ status: 'pending', mapped: 'BCOM-3.8 Cost Accounting', credits: 3 });
    await post('principal', '/v1/records/credit-transfers', { studentId: t.students[0].id, source: 'nptel', courseTitle: 'X', credits: 2.25 }).expect(400);
    const done = (await post('principal', '/v1/records/credit-transfers/bulk', { op: 'action', action: 'approve', target: { ids: [ct.id] }, params: {} }).expect(200)).body;
    expect(done.succeeded).toBe(1);
    await patch('principal', `/v1/records/credit-transfers/${ct.id}`, { credits: 4 }).expect(409);
    await http().delete(`/v1/records/credit-transfers/${ct.id}`).set(as('principal')).expect(403);
    const tpl = await http().get('/v1/records/credit-transfers/import/template').set(as('principal')).buffer(true).parse(binary).expect(200);
    expect(readXlsx(tpl.body as Buffer)[0]).toContain('Source *');
    const file = writeWorkbook([{ name: 'Data', rows: [['Roll number *', 'Source *', 'Course *', 'Credits *'], ['R2', 'swayam', 'Indian Knowledge Systems', '2'], ['R9', 'swayam', 'Lost', '2']] }]);
    const check = (await http().post('/v1/records/credit-transfers/import').set(as('principal')).attach('file', file, 'ct.xlsx').expect(200)).body;
    expect(check.totals).toMatchObject({ created: 1, error: 1 });
  });

  it('allocates faculty and hands a course over mid-semester, keeping the old periods and their attendance', async () => {
    await post('principal', '/v1/records/faculty-allocations', { sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, role: 'primary', hoursPerWeek: 4 }).expect(201);
    await post('principal', '/v1/records/faculty-allocations', { sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, role: 'primary', hoursPerWeek: 4 }).expect(409);
    const [far] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: t.program.id, term: 5, code: 'BCOM-5.1', name: 'Auditing' }).returning();
    await post('principal', '/v1/records/faculty-allocations', { sectionId: t.section.id, subjectId: far.id, teacherId: t.teacher.id, role: 'primary', hoursPerWeek: 4 }).expect(400);
    await post('hod', '/v1/records/faculty-allocations', { sectionId: t.section.id, subjectId: subject2, teacherId: t.teacher2.id, role: 'primary', hoursPerWeek: 3 }).expect(403); // not the HOD's department

    const load = (await get('principal', '/v1/academic-planning/workload').expect(200)).body;
    const mine = load.rows.find((r: { teacherId: string }) => r.teacherId === t.teacher.id);
    expect(mine).toMatchObject({ allocated: 4, periods: 1, norm: 16 });
    expect(mine.timetabled).toBeCloseTo(0.9, 1);

    // A mark on the old period stays with it after the hand-over.
    const lastMonday = addDays(monday, -7);
    await owner.query(`insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1, $2, $3, $4, $5, 'present', $6, now())`, [t.tenantId, t.students[0].id, t.section.id, lastMonday, t.slot.id, t.teacher.id]);
    const allocs = (await get('principal', `/v1/records/faculty-allocations?f.teacher=${t.teacher.id}`).expect(200)).body.rows;
    await post('principal', `/v1/records/faculty-allocations/${allocs[0].id}/move`, { to: t.teacher2.id, reason: 'Long leave' }).expect(200);
    const after = (await get('principal', `/v1/records/faculty-allocations?f.class=${t.section.id}&sort=from:asc`).expect(200)).body.rows.filter((r: { subjectId: string }) => r.subjectId === t.subject.id);
    expect(after.map((r: { teacherId: string; fromDate: string | null; toDate: string | null }) => [r.teacherId, r.fromDate, r.toDate])).toEqual(expect.arrayContaining([
      [t.teacher.id, null, addDays(monday, -1)],
      [t.teacher2.id, monday, null],
    ]));
    const slots = (await owner.query('select teacher_id, archived_at from timetable_slots where section_id = $1 and subject_id = $2 order by archived_at nulls last', [t.section.id, t.subject.id])).rows;
    expect(slots).toHaveLength(2);
    expect(slots[0].archived_at).not.toBeNull();
    expect(slots[1]).toMatchObject({ teacher_id: t.teacher2.id, archived_at: null });
    expect((await owner.query('select count(*)::int as n from attendance_records where timetable_slot_id = $1', [t.slot.id])).rows[0].n).toBe(1);
    const h = (await get('principal', `/v1/records/faculty-allocations/${allocs[0].id}/history`).expect(200)).body;
    expect(h.items[0]).toMatchObject({ action: 'faculty_allocation.handed_over' });
  });

  it('keeps bell schedules and gives a class its working days', async () => {
    await post('principal', '/v1/records/period-structures', { name: 'Regular day', days: 'Mon-Fri', periods: 'P1 09:00-09:55\nP2 09:30-10:00' }).expect(400);
    const ps = (await post('principal', '/v1/records/period-structures', { name: 'Regular day', days: 'Mon-Fri', periods: 'P1 09:00-09:55\nP2 09:55-10:50\nBreak 10:50-11:05 break\nP3 11:05-12:00', isDefault: true }).expect(201)).body;
    expect(ps).toMatchObject({ daysText: '1,2,3,4,5', classCount: 3, first: '09:00', last: '12:00', isDefault: true });
    expect((await get('teacher', `/v1/academic-planning/period-structure?sectionId=${t.section.id}`).expect(200)).body.periods).toHaveLength(4);
    const from = `${monday.slice(0, 7)}-01`;
    const wd = (await get('principal', `/v1/academic-planning/working-days?from=${from}&to=${addDays(from, 27)}&programId=${t.program.id}`).expect(200)).body;
    expect(wd.weekly).toEqual([1, 2, 3, 4, 5]);
    expect(wd.total).toBe(20);
    // A holiday takes a day off; a compensatory Saturday adds one.
    await post('principal', '/v1/admin/calendar', { kind: 'holiday', title: 'Local holiday', startsOn: addDays(from, 1), endsOn: addDays(from, 1), notify: false }).expect(201);
    const sat = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(from, n)).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6)!;
    await post('principal', '/v1/records/working-days', { date: sat, followsWeekday: 1 }).expect(201);
    await post('principal', '/v1/records/working-days', { date: sat, followsWeekday: 2 }).expect(409);
    const wd2 = (await get('principal', `/v1/academic-planning/working-days?from=${from}&to=${addDays(from, 27)}&programId=${t.program.id}`).expect(200)).body;
    const weekdayOfHoliday = new Date(`${addDays(from, 1)}T00:00:00Z`).getUTCDay();
    expect(wd2.total).toBe(20 + 1 - (weekdayOfHoliday >= 1 && weekdayOfHoliday <= 5 ? 1 : 0));
  });

  it('schedules special classes without clashes and cancels them', async () => {
    const thursday = addDays(monday, 3);
    // The class has the course's Monday period at 10:00 (now with the second teacher).
    await post('teacher2', '/v1/records/special-classes', { kind: 'extra', sectionId: t.section.id, subjectId: t.subject.id, date: monday, startsAt: '10:30', endsAt: '11:30' }).expect(409);
    await post('teacher2', '/v1/records/special-classes', { kind: 'extra', sectionId: t.section.id, subjectId: t.subject.id, date: thursday, startsAt: '12:00', endsAt: '11:00' }).expect(400);
    const sc = (await post('teacher2', '/v1/records/special-classes', { kind: 'remedial', sectionId: t.section.id, subjectId: t.subject.id, date: thursday, startsAt: '15:00', endsAt: '16:00', topic: 'Ratio analysis' }).expect(201)).body;
    expect(sc).toMatchObject({ status: 'scheduled', teacherId: t.teacher2.id });
    await post('teacher', '/v1/records/special-classes', { kind: 'extra', sectionId: t.section.id, subjectId: t.subject.id, date: thursday, startsAt: '15:30', endsAt: '16:30' }).expect(409); // the class is busy
    const dup = (await post('teacher2', `/v1/records/special-classes/${sc.id}/duplicate`).expect(201)).body;
    expect(dup.date).toBe(addDays(thursday, 7));
    // Another teacher does not even see it.
    await post('teacher', '/v1/records/special-classes/bulk', { op: 'action', action: 'cancel', target: { ids: [sc.id] }, params: { note: 'Fest' } }).expect(400);
    await post('teacher2', '/v1/records/special-classes/bulk', { op: 'action', action: 'cancel', target: { ids: [sc.id] }, params: { note: 'Fest' } }).expect(200).then((r) => expect(r.body.succeeded).toBe(1));
    expect((await get('teacher2', `/v1/records/special-classes/${sc.id}`).expect(200)).body.status).toBe('cancelled');
  });

  it('splits a class into lab batches; two batches may share a time, the whole class may not', async () => {
    await post('teacher', '/v1/academic-planning/batches/split', { sectionId: t.section.id, count: 2 }).expect(403);
    expect((await post('principal', '/v1/academic-planning/batches/split', { sectionId: t.section.id, count: 2 }).expect(200)).body).toEqual({ batches: 2, students: 3 });
    const b = (await get('teacher', `/v1/academic-planning/batches?sectionId=${t.section.id}`).expect(200)).body;
    expect(b.batches.map((x: { name: string; students: number }) => `${x.name}:${x.students}`)).toEqual(['B1:2', 'B2:1']);
    await put('principal', '/v1/academic-planning/batches', { sectionId: t.section.id, assignments: [{ studentId: t.students[1].id, batch: 'B2' }] }).expect(200);

    const slot = (day: number, batch: string | null, teacherId: string, roomId: string | null = null) => ({ sectionId: t.section.id, subjectId: subject2, teacherId, roomId, dayOfWeek: day, startsAt: '14:00', endsAt: '15:50', batch });
    await post('principal', '/v1/admin/timetable/slots', slot(3, 'B1', t.teacher.id)).expect(201);
    await post('principal', '/v1/admin/timetable/slots', slot(3, 'B2', t.teacher2.id)).expect(201);
    const clash = await post('principal', '/v1/admin/timetable/slots', slot(3, null, t.principal.id)).expect(409);
    expect(clash.body.code).toBe('TIMETABLE_CLASS_CLASH');
    // A combined class: the other section cannot have its own period at the same time.
    await post('principal', '/v1/admin/timetable/slots', { ...slot(4, null, t.teacher.id), combinedSectionIds: [t.otherSection.id] }).expect(201);
    const [subB] = await db.insert(s.subjects).values({ tenantId: t.tenantId, programId: t.program.id, term: 3, code: 'BCOM-3.9', name: 'Business Law' }).returning();
    const busy = await post('principal', '/v1/admin/timetable/slots', { sectionId: t.otherSection.id, subjectId: subB.id, teacherId: t.teacher2.id, dayOfWeek: 4, startsAt: '14:30', endsAt: '15:20' }).expect(409);
    expect(busy.body.code).toBe('TIMETABLE_CLASS_CLASH');
    const week = (await get('principal', `/v1/admin/timetable?sectionId=${t.otherSection.id}`).expect(200)).body;
    expect(week.some((x: { combinedSectionIds: string[] | null }) => x.combinedSectionIds?.includes(t.otherSection.id))).toBe(true);
    const room = (await get('principal', `/v1/admin/timetable?roomId=${t.room.id}`).expect(200)).body;
    expect(room.length).toBeGreaterThan(0);
  });

  it('keeps regulations as a list, and drafts calendar entries until they are published', async () => {
    const r = (await post('principal', '/v1/records/regulations', { name: 'R2024', year: 2024, authority: 'Board of Studies', effectiveFrom: '2024-06-01' }).expect(201)).body;
    expect(r).toMatchObject({ name: 'R2024', versions: 0 });
    await post('principal', '/v1/records/regulations', { name: 'r2024', year: 2024, authority: 'BoS', effectiveFrom: '2024-06-01' }).expect(409);

    const draft = (await post('principal', '/v1/admin/calendar', { kind: 'event', title: 'Sports day', startsOn: addDays(monday, 10), endsOn: addDays(monday, 10), draft: true }).expect(201)).body;
    expect(draft.published).toBe(false);
    const seen = async (who: string) => (await get(who, `/v1/calendar?from=${monday}&to=${addDays(monday, 20)}`).expect(200)).body.events.map((e: { id: string }) => e.id);
    expect(await seen('parent')).not.toContain(draft.id);
    expect(await seen('teacher')).toContain(draft.id);
    await post('teacher', '/v1/admin/calendar/publish', { ids: [draft.id] }).expect(403);
    expect((await post('principal', '/v1/admin/calendar/publish', { ids: [draft.id] }).expect(200)).body).toEqual({ changed: 1 });
    expect(await seen('parent')).toContain(draft.id);
  });

  it('answers the planning reports', async () => {
    for (const kind of ['room-utilisation', 'syllabus-department', 'hours-register', 'plan-deviation', 'substitute-load', 'marking-compliance', 'defaulter-trend', 'condonation-list', 'leave-register', 'detention-list']) {
      const r = (await get('principal', `/v1/academics/reports/${kind}?from=${addDays(monday, -14)}&to=${monday}`).expect(200)).body;
      expect(Array.isArray(r.rows), kind).toBe(true);
    }
    const hours = (await get('principal', `/v1/academics/reports/hours-register?sectionId=${t.section.id}&from=${addDays(monday, -14)}&to=${addDays(monday, -1)}`).expect(200)).body;
    expect(hours.rows.find((x: { code: string }) => x.code === 'BCOM-3.1')).toMatchObject({ perWeek: 1 });
    const pdf = await http().get('/v1/academics/reports/room-utilisation/export?format=pdf').set(as('principal')).buffer(true).parse(binary).expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('shows another institution none of it', async () => {
    for (const e of ['elective-baskets', 'course-requisites', 'credit-transfers', 'faculty-allocations', 'period-structures', 'special-classes', 'working-days', 'regulations']) {
      expect((await get('outsider', `/v1/records/${e}`).expect(200)).body.total, e).toBe(0);
    }
    await get('outsider', `/v1/academic-planning/baskets/${basketId}/subjects`).expect(404);
  });
});
