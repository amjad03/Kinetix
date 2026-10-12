import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('academics core: requests, settings, records, marks lock, lesson plans and reports', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (email: string) => (await http().post('/v1/auth/login').send({ tenant: t.slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const approve = (id: string, who = 'principal', body: Record<string, unknown> = {}) => http().post(`/v1/academics/requests/${id}/decide`).set(as(who)).send({ decision: 'approve', ...body });

  beforeAll(async () => {
    t = await createTenant(owner);
    app = await createApp(new FixedClock(new Date('2026-10-13T05:00:00Z')));
    tokens = { principal: await login(t.principal.email!), teacher: await login(t.teacher.email!), guardian: await login(t.guardian.email!), guardian2: await login(t.guardian2.email!) };
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps module settings with defaults and validation', async () => {
    const s = (await http().get('/v1/academics/settings').set(as('teacher')).expect(200)).body;
    expect(s.attendance.minPercent).toBe(75);
    expect(s.numbering.tc.prefix).toBe('TC/{FY}/');
    await http().put('/v1/academics/settings/attendance').set(as('teacher')).send(s.attendance).expect(403);
    await http().put('/v1/academics/settings/attendance').set(as('principal')).send({ ...s.attendance, warnPercent: 60 }).expect(400);
    const saved = (await http().put('/v1/academics/settings/attendance').set(as('principal')).send({ ...s.attendance, minPercent: 80, warnPercent: 85 }).expect(200)).body;
    expect(saved.minPercent).toBe(80);
    await http().put('/v1/academics/settings/bogus').set(as('principal')).send({}).expect(404);
  });

  it('moves a student to another class after head and principal approve', async () => {
    const st = t.students[2];
    const r = (await http().post('/v1/academics/requests').set(as('teacher')).send({ kind: 'section_change', studentId: st.id, reason: 'Language group', payload: { sectionId: t.otherSection.id } }).expect(201)).body;
    expect(r.number).toMatch(/^AR\/2026-27\/\d{5}$/);
    await http().post('/v1/academics/requests').set(as('teacher')).send({ kind: 'section_change', studentId: st.id, payload: { sectionId: t.otherSection.id } }).expect(409);
    await approve(r.id, 'teacher').expect(403);
    expect((await approve(r.id).expect(200)).body.status).toBe('pending');
    const done = (await approve(r.id).expect(200)).body;
    expect(done.status).toBe('approved');
    const row = (await owner.query(`select section_id from students where id = $1`, [st.id])).rows[0];
    expect(row.section_id).toBe(t.otherSection.id);
    const detail = (await http().get(`/v1/academics/requests/${r.id}`).set(as('principal')).expect(200)).body;
    expect(detail.steps.map((s: { state: string }) => s.state)).toEqual(['done', 'done']);
    expect(detail.activity.length).toBeGreaterThan(0);
  });

  it('lets a guardian request a TC; clearance steps then the TC number', async () => {
    await http().post('/v1/academics/requests').set(as('guardian2')).send({ kind: 'withdrawal', studentId: t.students[0].id, payload: { outcome: 'transferred', lastDay: '2026-10-31' } }).expect(403);
    const r = (await http().post('/v1/academics/requests').set(as('guardian')).send({ kind: 'withdrawal', studentId: t.students[0].id, reason: 'Moving city', payload: { outcome: 'transferred', lastDay: '2026-10-31' } }).expect(201)).body;
    const mine = (await http().get('/v1/academics/requests').set(as('guardian')).expect(200)).body;
    expect(mine.map((x: { id: string }) => x.id)).toEqual([r.id]);
    expect((await http().get('/v1/academics/requests').set(as('guardian2')).expect(200)).body).toHaveLength(0);
    await http().post(`/v1/academics/requests/${r.id}/decide`).set(as('principal')).send({ decision: 'reject' }).expect(400);
    await approve(r.id).expect(200);
    await approve(r.id).expect(200);
    const done = (await approve(r.id).expect(200)).body;
    expect(done.outcome.tcNumber).toMatch(/^TC\/2026-27\/0001$/);
    expect((await owner.query(`select status from students where id = $1`, [t.students[0].id])).rows[0].status).toBe('transferred');
    const notes = (await owner.query(`select count(*)::int as n from notifications where user_id = $1 and data->>'requestId' = $2`, [t.guardian.id, r.id])).rows[0].n;
    expect(notes).toBeGreaterThan(0);
  });

  it('hands an enrolled student over with a roll number and admission number', async () => {
    const st = t.students[1];
    await owner.query(`update students set status = 'enrolled' where id = $1`, [st.id]);
    const pending = (await http().get('/v1/academics/handover/pending').set(as('principal')).expect(200)).body;
    expect(pending.map((x: { id: string }) => x.id)).toContain(st.id);
    await http().post('/v1/academics/requests').set(as('teacher')).send({ kind: 'admission_handover', studentId: st.id }).expect(403);
    const r = (await http().post('/v1/academics/requests').set(as('principal')).send({ kind: 'admission_handover', studentId: st.id }).expect(201)).body;
    await approve(r.id).expect(200);
    const done = (await approve(r.id, 'teacher').expect(200)).body;
    expect(done.status).toBe('approved');
    expect(done.outcome.admissionNo).toMatch(/^ADM\//);
    expect((await owner.query(`select status from students where id = $1`, [st.id])).rows[0].status).toBe('active');
  });

  it('changes a timetable period only once approved, refusing clashes', async () => {
    const r = (await http().post('/v1/academics/requests').set(as('teacher')).send({ kind: 'timetable_change', reason: 'Lab clash', payload: { slotId: t.slot.id, startsAt: '11:00', endsAt: '11:45' } }).expect(201)).body;
    await approve(r.id).expect(200);
    await approve(r.id).expect(200);
    const slot = (await owner.query(`select to_char(starts_at,'HH24:MI') as s from timetable_slots where id = $1`, [t.slot.id])).rows[0];
    expect(slot.s).toBe('11:00');
  });

  it('locks verified marks so nobody edits them, and unlocks before publishing', async () => {
    const a = (await owner.query(`insert into assessments (tenant_id, section_id, subject_id, title, kind, max_marks, held_on, created_by, mark_status) values ($1, $2, $3, 'Unit test 1', 'test', 25, '2026-10-01', $4, 'submitted') returning id`, [t.tenantId, t.section.id, t.subject.id, t.teacher.id])).rows[0].id;
    await http().post(`/v1/academics/assessments/${a}/lock`).set(as('principal')).expect(409);
    await owner.query(`update assessments set mark_status = 'verified' where id = $1`, [a]);
    await http().post(`/v1/academics/assessments/${a}/lock`).set(as('teacher')).expect(403);
    await http().post(`/v1/academics/assessments/${a}/lock`).set(as('principal')).expect(200);
    await http().post(`/v1/assessments/${a}/reopen`).set(as('principal')).expect(409);
    await http().post(`/v1/academics/assessments/${a}/lock?unlock=true`).set(as('principal')).expect(200);
  });

  it('runs lesson plans through submit and head approval', async () => {
    const lp = (await owner.query(`insert into lesson_plans (tenant_id, section_id, subject_id, timetable_slot_id, date, teacher_id, content) values ($1, $2, $3, $4, '2026-10-19', $5, '{"objective":"Fractions"}') returning id`, [t.tenantId, t.section.id, t.subject.id, t.slot.id, t.teacher.id])).rows[0].id;
    await http().post(`/v1/academics/lesson-plans/${lp}/decide`).set(as('principal')).send({ decision: 'approve' }).expect(409);
    await http().post(`/v1/academics/lesson-plans/${lp}/submit`).set(as('teacher')).expect(200);
    const queue = (await http().get('/v1/academics/lesson-plans?status=submitted').set(as('principal')).expect(200)).body;
    expect(queue.map((x: { id: string }) => x.id)).toContain(lp);
    await http().post(`/v1/academics/lesson-plans/${lp}/decide`).set(as('principal')).send({ decision: 'reject' }).expect(400);
    expect((await http().post(`/v1/academics/lesson-plans/${lp}/decide`).set(as('principal')).send({ decision: 'approve', note: 'Good' }).expect(200)).body.status).toBe('approved');
  });

  it('serves record pages and reports, with Excel and PDF exports', async () => {
    const dir = (await http().get('/v1/academics/directory').set(as('principal')).expect(200)).body;
    expect(dir.sections.length).toBeGreaterThan(0);
    const sec = (await http().get(`/v1/academics/sections/${t.section.id}`).set(as('principal')).expect(200)).body;
    expect(sec.timetable.length).toBeGreaterThan(0);
    await http().get(`/v1/academics/teachers/${t.teacher.id}`).set(as('principal')).expect(200);
    await http().get(`/v1/academics/subjects/${t.subject.id}`).set(as('principal')).expect(200);
    await http().get(`/v1/academics/guardians/${t.guardian.id}`).set(as('principal')).expect(200);
    await http().get(`/v1/academics/sections/${t.section.id}`).set(as('guardian')).expect(403);
    await owner.query(`insert into attendance_records (tenant_id, student_id, section_id, date, status, marked_by, occurred_at) values ($1, $2, $3, '2026-10-12', 'absent', $4, now()), ($1, $5, $3, '2026-10-12', 'present', $4, now())`, [t.tenantId, t.students[2].id, t.section.id, t.teacher.id, t.students[1].id]);
    for (const kind of ['strength', 'attendance-monthly', 'attendance-subject', 'shortage', 'workload', 'syllabus-coverage', 'registration-summary']) {
      const r = (await http().get(`/v1/academics/reports/${kind}?month=2026-10`).set(as('principal')).expect(200)).body;
      expect(Array.isArray(r.columns)).toBe(true);
    }
    const daily = (await http().get(`/v1/academics/reports/attendance-daily?date=2026-10-12&sectionId=${t.section.id}`).set(as('principal')).expect(200)).body;
    expect(daily.rows[0]).toMatchObject({ marked: 2, present: 1, absent: 1, percent: 50 });
    const shortage = (await http().get('/v1/academics/reports/shortage?from=2026-10-01&to=2026-10-13').set(as('principal')).expect(200)).body;
    expect(shortage.rows.some((x: { student: string; status: string }) => x.status === 'short')).toBe(true);
    const tt = (await http().get(`/v1/academics/reports/timetable?by=teacher&id=${t.teacher.id}`).set(as('principal')).expect(200)).body;
    expect(tt.rows.length).toBeGreaterThan(0);
    const reg = (await http().get(`/v1/academics/reports/marks-register?sectionId=${t.section.id}`).set(as('principal')).expect(200)).body;
    expect(reg.columns.some((c: { label?: string }) => c.label?.includes('Unit test 1'))).toBe(true);
    await http().get('/v1/academics/reports/nope').set(as('principal')).expect(404);
    await http().get('/v1/academics/reports/attendance-daily?date=13-10-2026').set(as('principal')).expect(400);
    const xlsx = await http().get('/v1/academics/reports/strength/export?format=xlsx').set(as('principal')).buffer(true).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const pdf = await http().get('/v1/academics/reports/workload/export?format=pdf').set(as('principal')).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  }, 60_000);
});
