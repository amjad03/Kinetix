import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('scheduling desk: term presets, calendar feeds and scopes, subject frequency, timetable generation, roll-ups, student punches, PUC classes', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  let yearId: string;
  let subject2: string;
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(clock);
    tokens = { principal: await login(t.principal.email!), teacher: await login(t.teacher.email!) };
    yearId = (await q('select id from academic_years where tenant_id = $1', [t.tenantId]))[0].id;
    subject2 = (await q("insert into subjects (tenant_id, program_id, term, code, name) values ($1,$2,3,'BCOM-3.2','Business Law') returning id", [t.tenantId, t.program.id]))[0].id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('creates the year\'s terms from a preset once, and refuses a preset that collides with them', async () => {
    const first = (await post('principal', '/v1/scheduling/term-presets', { academicYearId: yearId, preset: 'trimester' }).expect(200)).body;
    expect(first.created).toEqual(['Trimester 1', 'Trimester 2', 'Trimester 3']);
    const again = (await post('principal', '/v1/scheduling/term-presets', { academicYearId: yearId, preset: 'trimester' }).expect(200)).body;
    expect(again).toEqual({ created: [], skipped: ['Trimester 1', 'Trimester 2', 'Trimester 3'] });
    const terms = (await get('principal', '/v1/terms').expect(200)).body as { name: string }[];
    expect(terms.map((x) => x.name).sort()).toEqual(['Trimester 1', 'Trimester 2', 'Trimester 3']);
    await post('principal', '/v1/scheduling/term-presets', { academicYearId: yearId, preset: 'quarter' }).expect(400);
    await post('teacher', '/v1/scheduling/term-presets', { academicYearId: yearId, preset: 'annual' }).expect(403);
  });

  it('feeds admissions and exams to the calendar, updating rather than repeating', async () => {
    await owner.query("insert into exam_sessions (tenant_id, academic_year_id, program_id, term, name, starts_on, ends_on, status, published_at, created_by) values ($1,$3,$4,3,'Semester 3 exams','2026-12-01','2026-12-12','published','2026-12-30T05:00:00Z',$2)", [t.tenantId, t.principal.id, yearId, t.program.id]);
    await post('principal', '/v1/admissions/cycles', { programId: t.program.id, academicYearId: yearId, name: 'BCom 2027 intake', entryTerm: 3, seats: 10, opensOn: '2026-11-01', closesOn: '2026-12-15', applicationFeePaise: 0, formFields: [{ key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 }], documents: [], eligibility: {}, meritRules: [{ field: 'marks_12th', weight: 1 }] }).expect(201);
    expect((await post('principal', '/v1/scheduling/calendar/sync').expect(200)).body).toEqual({ synced: 2, admissions: 0, exams: 2 }); // the cycle is still a draft
    const cycle = (await q('select id from admission_cycles where tenant_id = $1', [t.tenantId]))[0].id;
    await post('principal', `/v1/admissions/cycles/${cycle}/status`, { status: 'open' }).expect(200);
    // Opening the cycle already put it on the calendar; the button only catches up what changed by other routes.
    const fed = (await get('principal', '/v1/calendar?from=2026-11-01&to=2026-12-31').expect(200)).body.events as { title: string; source: string | null }[];
    expect(fed.filter((e) => e.source === 'admissions').map((e) => e.title)).toEqual(['Admissions open: BCom 2027 intake']);
    const run = (await post('principal', '/v1/scheduling/calendar/sync').expect(200)).body;
    expect(run).toEqual({ synced: 3, admissions: 1, exams: 2 });
    await owner.query("update exam_sessions set ends_on = '2026-12-14' where tenant_id = $1", [t.tenantId]);
    await post('principal', '/v1/scheduling/calendar/sync').expect(200);
    const events = (await get('principal', '/v1/calendar?from=2026-11-01&to=2027-01-31').expect(200)).body.events as { title: string; endsOn: string; source: string | null; kind: string }[];
    expect(events.filter((e) => e.source)).toHaveLength(3);
    expect(events.find((e) => e.title === 'Semester 3 exams')).toMatchObject({ endsOn: '2026-12-14', kind: 'exam' });
    expect(events.map((e) => e.title)).toEqual(expect.arrayContaining(['Admissions open: BCom 2027 intake', 'Results published: Semester 3 exams']));
  });

  it('keeps calendars by campus and class alongside the institution calendar', async () => {
    const whole = (await post('principal', '/v1/admin/calendar', { kind: 'event', title: 'Founders day', startsOn: '2026-11-10', endsOn: '2026-11-10', notify: false }).expect(201)).body;
    const classOnly = (await post('principal', '/v1/admin/calendar', { kind: 'event', title: 'Sem 3 A industry visit', startsOn: '2026-11-11', endsOn: '2026-11-11', sectionIds: [t.section.id], notify: false }).expect(201)).body;
    const campusOnly = (await post('principal', '/v1/admin/calendar', { kind: 'holiday', title: 'Main campus maintenance', startsOn: '2026-11-12', endsOn: '2026-11-12', campusIds: [t.campus.id], notify: false }).expect(201)).body;
    const titles = async (qs: string) => ((await get('principal', `/v1/calendar?from=2026-11-10&to=2026-11-12${qs}`).expect(200)).body.events as { title: string; source: string | null }[]).filter((e) => !e.source).map((e) => e.title).sort();
    expect(await titles('')).toEqual(['Founders day', 'Main campus maintenance', 'Sem 3 A industry visit']);
    expect(await titles(`&sectionId=${t.section.id}`)).toEqual(['Founders day', 'Main campus maintenance', 'Sem 3 A industry visit']);
    expect(await titles(`&sectionId=${t.otherSection.id}`)).toEqual(['Founders day', 'Main campus maintenance']);
    expect(await titles(`&campusId=${t.campus.id}`)).toEqual(['Founders day', 'Main campus maintenance', 'Sem 3 A industry visit']);
    expect(await titles('&campusId=11111111-1111-4111-8111-111111111111')).toEqual(['Founders day', 'Sem 3 A industry visit']);
    // A guardian of a student in class A sees the class entry; the other class's family would not.
    const parent = await login(t.guardian.email!);
    const seen = ((await http().get('/v1/calendar?from=2026-11-10&to=2026-11-12').set({ authorization: `Bearer ${parent}` }).expect(200)).body.events as { title: string }[]).map((e) => e.title);
    expect(seen).toContain('Sem 3 A industry visit');
    void whole;
    void classOnly;
    void campusOnly;
  });

  it('holds a subject to its weekly and daily frequency in the timetable editor', async () => {
    await put('principal', `/v1/scheduling/frequency/${t.subject.id}`, { minPerWeek: 2, maxPerWeek: 3, maxPerDay: 1 }).expect(200);
    await put('principal', `/v1/scheduling/frequency/${t.subject.id}`, { minPerWeek: 4, maxPerWeek: 3, maxPerDay: 1 }).expect(400);
    const slot = (day: number, start: string, end: string) => post('principal', '/v1/admin/timetable/slots', { sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, dayOfWeek: day, startsAt: start, endsAt: end });
    const sameDay = await slot(1, '11:00', '11:45').expect(409);
    expect(sameDay.body.code).toBe('TIMETABLE_FREQUENCY');
    await slot(2, '10:00', '10:45').expect(201);
    await slot(3, '10:00', '10:45').expect(201);
    const over = await slot(4, '10:00', '10:45').expect(409);
    expect(over.body.message).toContain('limit is 3');
    const rows = (await get('principal', `/v1/scheduling/frequency?sectionId=${t.section.id}`).expect(200)).body as { name: string; periods: number; status: string | null }[];
    expect(rows.find((r) => r.name === 'Corporate Accounting')).toMatchObject({ periods: 3, status: 'ok' });
    expect(rows.find((r) => r.name === 'Business Law')).toMatchObject({ periods: 0, status: null });
  });

  it('proposes a clash-free week for a class and saves it on request', async () => {
    await put('principal', `/v1/scheduling/frequency/${subject2}`, { minPerWeek: 3, maxPerWeek: 5, maxPerDay: 1 }).expect(200);
    const body = {
      sectionId: t.otherSection.id,
      days: [1, 2, 3, 4, 5],
      periods: [{ startsAt: '10:00', endsAt: '10:45' }, { startsAt: '10:45', endsAt: '11:30' }],
      assignments: [{ subjectId: subject2, teacherId: t.teacher2.id }],
    };
    const dry = (await post('principal', '/v1/scheduling/timetable/generate', body).expect(200)).body;
    expect(dry.applied).toBe(false);
    expect(dry.unplaced).toEqual([]);
    // Accounting follows its teacher from the other class (2 a week by rule), Law is 3 a week.
    expect(dry.placements.filter((p: { subjectName: string }) => p.subjectName === 'Business Law')).toHaveLength(3);
    expect(dry.placements.filter((p: { subjectName: string }) => p.subjectName === 'Corporate Accounting')).toHaveLength(2);
    expect((await q('select count(*)::int as n from timetable_slots where section_id = $1', [t.otherSection.id]))[0].n).toBe(0);
    // The first teacher already teaches section A on Mon 10:00, Tue 10:00 and Wed 10:00: none of those cells are given to them.
    for (const p of dry.placements.filter((x: { teacherId: string }) => x.teacherId === t.teacher.id)) expect([`1|10:00`, `2|10:00`, `3|10:00`]).not.toContain(`${p.dayOfWeek}|${p.startsAt}`);
    const applied = (await post('principal', '/v1/scheduling/timetable/generate', { ...body, apply: true }).expect(200)).body;
    expect(applied.applied).toBe(true);
    expect((await q('select count(*)::int as n from timetable_slots where section_id = $1 and archived_at is null', [t.otherSection.id]))[0].n).toBe(5);
    // Running again with nothing to add places nothing; replace starts from scratch.
    const noop = (await post('principal', '/v1/scheduling/timetable/generate', { ...body, apply: true }).expect(200)).body;
    expect(noop.placed).toBe(0);
    const redo = (await post('principal', '/v1/scheduling/timetable/generate', { ...body, apply: true, replace: true }).expect(200)).body;
    expect(redo.placed).toBe(5);
    expect((await q('select count(*)::int as n from timetable_slots where section_id = $1 and archived_at is null', [t.otherSection.id]))[0].n).toBe(5);
  });

  it('rolls attendance up by subject, month and term', async () => {
    const slots = await q('select id, subject_id from timetable_slots where section_id = $1 and archived_at is null order by day_of_week limit 2', [t.section.id]);
    const rec = (student: string, date: string, slot: string, status: string) =>
      owner.query('insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1,$2,$3,$4,$5,$6,$7,now())', [t.tenantId, student, t.section.id, date, slot, status, t.teacher.id]);
    for (const [i, st] of ['present', 'present', 'late', 'absent'].entries()) await rec(t.students[i % 3].id, `2026-09-0${i + 1}`, slots[0].id, st);
    await rec(t.students[0].id, '2026-10-05', slots[1].id, 'present');
    const bySubject = (await get('principal', `/v1/scheduling/attendance/rollup?sectionId=${t.section.id}&by=subject`).expect(200)).body;
    expect(bySubject.groups[0]).toMatchObject({ label: 'Corporate Accounting', present: 3, late: 1, absent: 1, total: 5, pct: 80 });
    const byMonth = (await get('principal', `/v1/scheduling/attendance/rollup?sectionId=${t.section.id}&by=month`).expect(200)).body.groups as { key: string; total: number }[];
    expect(byMonth.map((g) => [g.key, g.total])).toEqual([['2026-09', 4], ['2026-10', 1]]);
    const byTerm = (await get('principal', `/v1/scheduling/attendance/rollup?sectionId=${t.section.id}&by=term`).expect(200)).body.groups as { key: string; total: number }[];
    expect(byTerm.map((g) => g.key)).toEqual(['Trimester 1']);
    expect(byTerm[0].total).toBe(5);
    await get('principal', `/v1/scheduling/attendance/rollup?sectionId=${t.section.id}&by=term&from=2026-10-01`).expect(200);
  });

  it('marks a student present or late from a biometric device export, leaving a teacher\'s mark alone', async () => {
    await put('principal', '/v1/scheduling/biometric/mappings', { mappings: [{ studentId: t.students[0].id, deviceUserId: 'DEV1' }, { studentId: t.students[1].id, deviceUserId: 'DEV2' }, { studentId: t.students[2].id, deviceUserId: 'DEV3' }] }).expect(200);
    await owner.query("insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1,$2,$3,'2026-10-19',null,'absent',$4,now())", [t.tenantId, t.students[2].id, t.section.id, t.teacher.id]);
    const csv = 'employee_code,date,in_time,out_time\nDEV1,2026-10-19,08:55,15:00\nDEV2,2026-10-19,09:45,15:00\nDEV3,2026-10-19,08:50,15:00\nDEV9,2026-10-19,08:00,\n';
    const out = (await post('principal', '/v1/scheduling/biometric/import', { csv, lateAfter: '09:30' }).expect(200)).body;
    expect(out).toMatchObject({ marked: 1, late: 1, alreadyMarked: 1, unknownDevices: ['DEV9'] });
    const rows = await q("select student_id, status from attendance_records where tenant_id = $1 and date = '2026-10-19' and timetable_slot_id is null", [t.tenantId]);
    expect(rows.find((r) => r.student_id === t.students[0].id)?.status).toBe('present');
    expect(rows.find((r) => r.student_id === t.students[1].id)?.status).toBe('late');
    expect(rows.find((r) => r.student_id === t.students[2].id)?.status).toBe('absent');
    const again = (await post('principal', '/v1/scheduling/biometric/import', { csv }).expect(200)).body;
    expect(again).toMatchObject({ marked: 0, late: 0, alreadyMarked: 3 });
    await post('principal', '/v1/scheduling/biometric/import', { csv: 'bad' }).expect(400);
    expect(((await get('principal', '/v1/scheduling/biometric/mappings').expect(200)).body as unknown[]).length).toBe(3);
  });

  it('builds a class for each stream combination and moves the enrolled students into it', async () => {
    const stream = (await q("insert into puc_streams (tenant_id, code, name) values ($1,'SCI','Science') returning id", [t.tenantId]))[0].id;
    const pcmb = (await q(`insert into puc_combinations (tenant_id, stream_id, code, name, subjects) values ($1,$2,'PCMB','Physics Chem Maths Bio','[{"name":"Physics","theoryMax":70,"practicalMax":30,"internalMax":0}]') returning id`, [t.tenantId, stream]))[0].id;
    const pcme = (await q(`insert into puc_combinations (tenant_id, stream_id, code, name, subjects) values ($1,$2,'PCME','Physics Chem Maths Electronics','[{"name":"Physics","theoryMax":70,"practicalMax":30,"internalMax":0}]') returning id`, [t.tenantId, stream]))[0].id;
    await owner.query('insert into puc_enrollments (tenant_id, student_id, academic_year_id, combination_id) values ($1,$2,$3,$4),($1,$5,$3,$4),($1,$6,$3,$7)', [t.tenantId, t.students[0].id, yearId, pcmb, t.students[1].id, t.students[2].id, pcme]);
    const run = (await post('principal', '/v1/scheduling/puc/sections', { academicYearId: yearId, programId: t.program.id, term: 3 }).expect(200)).body;
    expect(run.created.sort()).toEqual(['BCom 3 PCME', 'BCom 3 PCMB'].sort());
    expect(run.moved).toBe(3);
    const list = (await get('principal', `/v1/scheduling/puc/sections?academicYearId=${yearId}`).expect(200)).body as { code: string; students: number }[];
    expect(list.map((x) => [x.code, x.students])).toEqual([['PCMB', 2], ['PCME', 1]]);
    expect((await post('principal', '/v1/scheduling/puc/sections', { academicYearId: yearId, programId: t.program.id, term: 3 }).expect(200)).body).toEqual({ created: [], moved: 0 });
  });
});
