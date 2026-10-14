import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeWorkbook } from '../src/common/xlsx.js';
import { learnerLevel } from '../src/mentoring/mentoring-extra.controller.js';
import { routeAssignee } from '../src/welfare/welfare-rules.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

/**
 * Grievance, mentoring and welfare depth: routing by category (away from the person complained about), the
 * respondent never seeing the ticket, appeals to the next level, the register and NAAC report; anti-ragging
 * undertakings; disability accommodations for exams; mentor assignments through the kit; the private mentor
 * channel; parents' view of mentor remarks; slow and advanced learners by rule.
 */
describe('welfare depth', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const addUser = async (email: string, role: string) => {
    const { rows } = await owner.query(`insert into users (tenant_id, full_name, email, password_hash) select $1, $2, $3, password_hash from users where id = $4 returning id`, [t.tenantId, email.split('@')[0], email, t.principal.id]);
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, $3)`, [t.tenantId, rows[0].id, role]);
    return rows[0].id as string;
  };

  let officer: string;
  let officer2: string;
  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    officer = await addUser(`go1-${t.slug}@x.in`, 'grievance_officer');
    officer2 = await addUser(`go2-${t.slug}@x.in`, 'grievance_officer');
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.officer = await login(t.slug, `go1-${t.slug}@x.in`);
    tokens.officer2 = await login(t.slug, `go2-${t.slug}@x.in`);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('routes by category, away from the person complained about, who never sees the ticket', async () => {
    expect(routeAssignee({ assigneeUserId: 'a', backupUserId: 'b' }, 'r', 'a')).toBe('b');
    expect(routeAssignee({ assigneeUserId: 'a', backupUserId: 'r' }, 'r', 'a')).toBeNull();
    expect(routeAssignee(undefined, 'r', null)).toBeNull();

    await http().post('/v1/records/grievance-routes').set(as('officer')).send({ category: 'academic', assigneeUserId: officer }).expect(403);
    await http().post('/v1/records/grievance-routes').set(as('principal')).send({ category: 'ragging', assigneeUserId: officer }).expect(400);
    await http().post('/v1/records/grievance-routes').set(as('principal')).send({ category: 'academic', assigneeUserId: officer, backupUserId: officer2, slaHours: 72 }).expect(201);

    const plain = (await http().post('/v1/grievances').set(as('student')).send({ category: 'academic', subject: 'Marks not updated', description: 'My internal marks are missing.' }).expect(201)).body;
    expect(plain).toMatchObject({ status: 'assigned', assigneeUserId: officer });
    const against = (await http().post('/v1/grievances').set(as('student')).send({ category: 'academic', subject: 'Officer rude', description: 'The officer was rude at the desk.', againstUserId: officer }).expect(201)).body;
    expect(against).toMatchObject({ status: 'assigned', assigneeUserId: officer2, againstUserId: officer });
    await http().get(`/v1/grievances/${against.id}`).set(as('officer')).expect(404);
    expect((await http().get('/v1/grievances').set(as('officer')).expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(against.id);
    expect((await http().get('/v1/records/grievances').set(as('officer')).expect(200)).body.rows.map((x: { id: string }) => x.id)).not.toContain(against.id);
    await http().post(`/v1/grievances/${against.id}/assign`).set(as('officer2')).send({ assigneeUserId: officer }).expect(409);
    await http().post('/v1/grievances').set(as('student')).send({ category: 'academic', subject: 'x self', description: 'about a student account', againstUserId: t.guardian.id }).expect(400);

    // The SC/ST cell takes discrimination, confidentially.
    const sc = (await http().post('/v1/grievances').set(as('student')).send({ category: 'discrimination', subject: 'Caste remark', description: 'A remark was made in class.' }).expect(201)).body;
    expect(sc).toMatchObject({ committee: 'sc_st', severity: 'high' });
    await http().get(`/v1/grievances/${sc.id}`).set(as('officer')).expect(404);
  });

  it('lets the reporter appeal a resolution to the next level', async () => {
    const g = (await http().get('/v1/grievances/mine').set(as('student')).expect(200)).body.find((x: { subject: string }) => x.subject === 'Marks not updated');
    await http().post(`/v1/grievances/${g.id}/appeal`).set(as('student')).send({ reason: 'Nothing has changed yet at all.' }).expect(409); // not resolved
    await http().post(`/v1/grievances/${g.id}/resolve`).set(as('officer')).send({ resolution: 'Marks were entered.' }).expect(200);
    await http().post(`/v1/grievances/${g.id}/appeal`).set(as('officer')).send({ reason: 'Not mine to appeal at all.' }).expect(403);
    await http().post(`/v1/grievances/${g.id}/appeal`).set(as('student')).send({ reason: 'The marks are still wrong for unit two.' }).expect(200);
    await http().post(`/v1/grievances/${g.id}/appeal`).set(as('student')).send({ reason: 'The marks are still wrong for unit two.' }).expect(409);
    await http().post(`/v1/grievances/${g.id}/appeal-decision`).set(as('officer')).send({ decision: 'overturned', note: 'Reopen it' }).expect(403);
    const d = (await http().post(`/v1/grievances/${g.id}/appeal-decision`).set(as('principal')).send({ decision: 'overturned', note: 'Check unit two again' }).expect(200)).body;
    expect(d).toMatchObject({ appealStatus: 'overturned', status: 'reopened', escalationLevel: 2, assigneeUserId: t.principal.id });

    const reg = (await http().get('/v1/records/grievances?f.appeal=any').set(as('principal')).expect(200)).body;
    expect(reg.rows.map((r: { ticketNo: string }) => r.ticketNo)).toEqual([g.ticketNo]);
    await http().delete(`/v1/records/grievances/${g.id}`).set(as('principal')).expect(403);
    const csv = await http().get('/v1/records/grievances/export?format=csv').set(as('principal')).expect(200);
    expect(csv.text).toContain(g.ticketNo);
    expect(csv.text).not.toContain('Caste remark');
    const report = (await http().get('/v1/welfare/reports/grievances').set(as('principal')).expect(200)).body;
    expect(report).toMatchObject({ total: 3, byCategory: expect.arrayContaining([expect.objectContaining({ category: 'academic', received: 2, appeals: 1, overturned: 1 })]) });
    expect((await http().get('/v1/records/grievances').set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('collects anti-ragging undertakings by class, from the student and through the kit', async () => {
    const r = (await http().post('/v1/welfare/undertakings/request').set(as('principal')).send({ yearLabel: '2026-27' }).expect(200)).body;
    expect(r.requested).toBe(3);
    expect((await http().post('/v1/welfare/undertakings/request').set(as('principal')).send({ yearLabel: '2026-27' }).expect(200)).body.requested).toBe(0);
    await http().post('/v1/welfare/undertakings/mine').set(as('student')).send({ yearLabel: '2026-27', studentRef: 'AR-111', parentRef: 'AR-112' }).expect(200);
    const list = (await http().get('/v1/records/antiragging-undertakings?f.status=received').set(as('officer')).expect(200)).body;
    expect(list.rows).toEqual([expect.objectContaining({ rollNo: 'R3', studentRef: 'AR-111', status: 'received' })]);
    const pending = (await http().get('/v1/records/antiragging-undertakings?f.status=pending').set(as('officer')).expect(200)).body.rows;
    const res = (await http().post('/v1/records/antiragging-undertakings/bulk').set(as('officer')).send({ op: 'action', action: 'verify', target: { ids: [list.rows[0].id, pending[0].id] } }).expect(200)).body;
    expect(res).toMatchObject({ succeeded: 1, failed: 1 });
    const file = await writeWorkbook([{ name: 'Data', rows: [['Roll no', 'Class', 'Academic year', 'Student undertaking number', 'Parent undertaking number', 'Submitted on'], ['R1', '', '2026-27', 'AR-201', 'AR-202', '']] }]);
    const check = (await http().post('/v1/records/antiragging-undertakings/import?mode=upsert').set(as('officer')).attach('file', file, 'u.xlsx').expect(200)).body;
    await http().post(`/v1/records/antiragging-undertakings/import/${check.id}/commit`).set(as('officer')).send({}).expect(200);
    const sum = (await http().get('/v1/welfare/undertakings/summary?year=2026-27').set(as('officer')).expect(200)).body;
    expect(sum.classes.find((c: { className: string }) => c.className === 'BCom Sem 3 A')).toMatchObject({ students: 3, pending: 1, received: 1, verified: 1, missing: 0 });
  });

  it('keeps disability accommodations and feeds them to the exam office', async () => {
    await http().post('/v1/records/pwd-accommodations').set(as('teacher')).send({ studentId: t.students[0].id, disability: 'Low vision' }).expect(403);
    const a = (await http().post('/v1/records/pwd-accommodations').set(as('principal')).send({ studentId: t.students[0].id, disability: 'Low vision', percent: 45, scribe: true, extraMinutesPerHour: 20, validUntil: '2099-05-31' }).expect(201)).body;
    expect(a).toMatchObject({ studentName: 'Student A', scribe: true, extraMinutesPerHour: 20, status: 'active' });
    expect((await http().get('/v1/welfare/accommodations/exam-feed').set(as('principal')).expect(200)).body).toEqual([expect.objectContaining({ rollNo: 'R1', scribe: true, extraMinutesPerHour: 20 })]);
    await http().post('/v1/records/pwd-accommodations/bulk').set(as('principal')).send({ op: 'action', action: 'revoke', target: { ids: [a.id] } }).expect(200);
    expect((await http().get('/v1/welfare/accommodations/exam-feed').set(as('principal')).expect(200)).body).toEqual([]);
  });

  it('assigns mentors through the kit, runs the private channel and shows parents the remarks when allowed', async () => {
    const m = (await http().post('/v1/records/mentor-assignments').set(as('principal')).send({ studentId: t.students[2].id, mentorUserId: t.teacher.id }).expect(201)).body;
    await http().post('/v1/records/mentor-assignments').set(as('principal')).send({ studentId: t.students[2].id, mentorUserId: t.teacher2.id }).expect(409);
    const ch = (await http().get('/v1/mentoring/my-mentor').set(as('student')).expect(200)).body;
    expect(ch).toMatchObject({ assignmentId: m.id, unread: 0 });
    await http().post(`/v1/mentoring/assignments/${m.id}/messages`).set(as('student')).send({ body: 'Can we talk about my backlog?' }).expect(201);
    expect((await http().get('/v1/mentoring/channels').set(as('teacher')).expect(200)).body[0]).toMatchObject({ assignmentId: m.id, unread: 1 });
    expect((await http().get(`/v1/mentoring/assignments/${m.id}/messages`).set(as('teacher')).expect(200)).body).toHaveLength(1);
    await http().get(`/v1/mentoring/assignments/${m.id}/messages`).set(as('principal')).expect(404);
    expect((await owner.query(`select count(*)::int as n from audit_log where subject_id = $1 and action = 'mentor_assignment.message_sent' and data::text like '%backlog%'`, [m.id])).rows[0].n).toBe(0);

    // Change of mentor: the old assignment ends, a new one starts.
    await http().post(`/v1/records/mentor-assignments/${m.id}/move`).set(as('principal')).send({ to: t.teacher2.id, reason: 'Workload' }).expect(200);
    const cur = (await http().get('/v1/records/mentor-assignments?f.state=open').set(as('principal')).expect(200)).body.rows;
    expect(cur).toEqual([expect.objectContaining({ studentName: 'Student C', mentorUserId: t.teacher2.id })]);

    await owner.query(`insert into mentoring_sessions (tenant_id, student_id, mentor_user_id, held_on, summary, private_notes) values ($1, $2, $3, current_date, 'Discussed exam plan', 'family stress')`, [t.tenantId, t.students[0].id, t.teacher.id]);
    const fam = (await http().get(`/v1/mentoring/family/${t.students[0].id}`).set(as('parent')).expect(200)).body;
    expect(fam.sessions).toEqual([expect.objectContaining({ summary: 'Discussed exam plan' })]);
    expect(JSON.stringify(fam)).not.toContain('family stress');
    await http().get(`/v1/mentoring/family/${t.students[1].id}`).set(as('parent')).expect(404);
    await http().put('/v1/parent-visibility/mentoring').set(as('principal')).send({ visible: false }).expect(200);
    await http().get(`/v1/mentoring/family/${t.students[0].id}`).set(as('parent')).expect(403);
  });

  it('finds slow and advanced learners by the institution’s rules and opens plans in bulk', async () => {
    expect(learnerLevel({ slowBelowPct: 40, advancedFromPct: 75, minAssessments: 2, attendanceBelowPct: 0 }, { avgPct: 30, assessments: 2, attendancePct: 90 })).toBe('slow');
    expect(learnerLevel({ slowBelowPct: 40, advancedFromPct: 75, minAssessments: 2, attendanceBelowPct: 0 }, { avgPct: 80, assessments: 1, attendancePct: 90 })).toBe('not_enough');
    expect(learnerLevel({ slowBelowPct: 40, advancedFromPct: 75, minAssessments: 2, attendanceBelowPct: 75 }, { avgPct: 80, assessments: 3, attendancePct: 60 })).toBe('slow');

    for (const [i, title] of ['Test 1', 'Test 2'].entries()) {
      const { rows } = await owner.query(`insert into assessments (tenant_id, section_id, subject_id, title, kind, max_marks, held_on, published_at, created_by) values ($1, $2, $3, $4, 'test', 50, current_date - $5::int, now(), $6) returning id`, [t.tenantId, t.section.id, t.subject.id, title, i, t.teacher.id]);
      await owner.query(`insert into marks (tenant_id, assessment_id, student_id, marks) values ($1, $2, $3, 10), ($1, $2, $4, 45), ($1, $2, $5, 30)`, [t.tenantId, rows[0].id, t.students[0].id, t.students[1].id, t.students[2].id]);
    }
    await http().put('/v1/mentoring/learner-rules').set(as('principal')).send({ slowBelowPct: 80, advancedFromPct: 50, minAssessments: 2, attendanceBelowPct: 0 }).expect(400);
    await http().put('/v1/mentoring/learner-rules').set(as('principal')).send({ slowBelowPct: 40, advancedFromPct: 75, minAssessments: 2, attendanceBelowPct: 0 }).expect(200);
    const l = (await http().get(`/v1/mentoring/learners?sectionId=${t.section.id}`).set(as('teacher')).expect(200)).body;
    expect(l.students.map((s: { rollNo: string; level: string; avgPct: number }) => [s.rollNo, s.level, s.avgPct])).toEqual([['R1', 'slow', 20], ['R2', 'advanced', 90], ['R3', 'average', 60]]);
    const plans = (await http().post('/v1/mentoring/learners/plans').set(as('principal')).send({ studentIds: [t.students[0].id], goal: 'Lift marks above 40%', actions: ['Weekly practice set'], reviewOn: '2099-01-01' }).expect(200)).body;
    expect(plans).toEqual({ created: 1, skipped: [] });
    expect((await http().post('/v1/mentoring/learners/plans').set(as('principal')).send({ studentIds: [t.students[0].id], goal: 'Again', actions: ['x'], reviewOn: '2099-01-01' }).expect(200)).body.skipped[0].reason).toBe('Already has an open plan');
    expect((await http().get('/v1/mentoring/reports/outcomes').set(as('principal')).expect(200)).body).toMatchObject({ opened: 1, closed: 0 });
    expect((await http().get('/v1/mentoring/reports/mentors').set(as('principal')).expect(200)).body).toEqual([expect.objectContaining({ mentees: 1, openPlans: 0 })]);
  });
});
