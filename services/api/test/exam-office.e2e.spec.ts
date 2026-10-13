import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('exam office: session workflow, approvals, records, reports and settings', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(as(who));
  const act = (who: string, kind: string, id: string, action: string, body: object = {}) => http().post(`/v1/exam-office/records/${kind}/${id}/actions/${action}`).set(as(who)).send(body);
  const session = (who = 'controller') => get(who, `/v1/exam-office/records/session/${ids.session}`).expect(200).then((r) => r.body);

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [u] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Esha Controller', email: 'esha@xo.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: u.id, role: 'exam_controller' });
    const [h] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Hari Hod', email: 'hari@xo.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: h.id, role: 'hod' });
    ids.controller = u.id;
    app = await createApp(new FixedClock(new Date('2026-11-01T05:00:00Z')));
    tokens.controller = await login(t.slug, 'esha@xo.in');
    tokens.hod = await login(t.slug, 'hari@xo.in');
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.other = await login(other.slug, other.principal.email!);
  }, 120_000);
  afterAll(async () => {
    await app.close();
    await owner.end();
  }, 120_000);

  it('walks a session from setup to moderation with gates, a second-person timetable approval and notices', async () => {
    const body = { academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Sem 3 end exam', startsOn: '2026-11-02', endsOn: '2026-11-20' };
    ids.session = (await http().post('/v1/exam-sessions').set(as('principal')).send(body).expect(201)).body.id;
    let rec = await session();
    expect(rec.status.key).toBe('setup');
    expect(rec.actions.find((a: { key: string }) => a.key === 'complete').blocked).toMatch(/at least one paper/);
    await act('controller', 'session', ids.session, 'complete').expect(409);
    ids.paper = (await http().post(`/v1/exam-sessions/${ids.session}/papers`).set(as('principal')).send({ subjectId: t.subject.id, sectionId: t.section.id, examDate: '2026-11-05', startsAt: '10:00', endsAt: '13:00', maxMarks: 60 }).expect(201)).body.id;
    await act('teacher', 'session', ids.session, 'complete').expect(403);
    await act('controller', 'session', ids.session, 'complete', { comment: 'Papers set' }).expect(200);

    // Timetable: submitted by the controller, approved by someone else, then students are told.
    await act('controller', 'session', ids.session, 'submit_timetable').expect(200);
    rec = await session('principal');
    expect(rec.approval).toEqual({ key: 'timetable', canDecide: true });
    expect((await session('controller')).approval.canDecide).toBe(false);
    await act('controller', 'session', ids.session, 'approve').expect(403);
    await act('principal', 'session', ids.session, 'reject').expect(400); // a return needs a reason
    await act('principal', 'session', ids.session, 'reject', { comment: 'Clash with the sports meet' }).expect(200);
    expect((await session()).steps.find((x: { key: string }) => x.key === 'timetable').state).toBe('rejected');
    await act('controller', 'session', ids.session, 'submit_timetable').expect(200);
    await act('principal', 'session', ids.session, 'approve', { comment: 'Fine' }).expect(200);
    const [sess] = await db.select().from(s.examSessions).where(eq(s.examSessions.id, ids.session));
    expect(sess.status).toBe('scheduled');
    const notes = await db.select().from(s.notifications).where(and(eq(s.notifications.tenantId, t.tenantId), eq(s.notifications.kind, 'calendar')));
    expect(notes.length).toBeGreaterThan(0);

    // Registration needs a window and candidates.
    expect((await session()).status.key).toBe('registration');
    await act('controller', 'session', ids.session, 'complete').expect(409);
    await db.insert(s.examRegistrationWindows).values({ tenantId: t.tenantId, sessionId: ids.session, opensOn: '2026-10-01', closesOn: '2026-10-20', createdBy: t.principal.id });
    await db.insert(s.examRegistrations).values(t.students.map((st, i) => ({ tenantId: t.tenantId, sessionId: ids.session, studentId: st.id, status: (i === 2 ? 'ineligible' : 'registered') as 'registered' | 'ineligible', reasons: i === 2 ? ['Attendance 61% is below 75%'] : [] })));
    await act('controller', 'session', ids.session, 'complete').expect(200);

    // Exam fees: raised from the settings (minimum ₹500 for one paper), paid or waived per candidate.
    await act('controller', 'session', ids.session, 'complete').expect(409);
    const C = `${ids.session}_${t.students[2].id}`;
    await act('controller', 'registration', C, 'override').expect(400);
    await act('controller', 'registration', C, 'override', { comment: 'Medical certificate accepted' }).expect(200);
    expect((await act('controller', 'session', ids.session, 'raise_fees').expect(200)).body).toEqual({ raised: 3 });
    await act('controller', 'session', ids.session, 'raise_fees').expect(409);
    const dues = await db.select().from(s.examFeeDues).where(eq(s.examFeeDues.sessionId, ids.session));
    expect(dues.map((d) => d.amountPaise)).toEqual([50_000, 50_000, 50_000]);
    await act('controller', 'session', ids.session, 'complete').expect(409);
    const [A, B] = t.students.map((st) => `${ids.session}_${st.id}`);
    await act('controller', 'registration', A, 'fee_paid').expect(400);
    await act('controller', 'registration', A, 'fee_paid', { value: { receiptNo: 'EXF-001' } }).expect(200);
    await act('controller', 'registration', A, 'fee_paid', { value: { receiptNo: 'EXF-001' } }).expect(409);
    await act('controller', 'registration', B, 'fee_waive', { comment: 'SC/ST fee concession' }).expect(200);
    await act('controller', 'registration', C, 'fee_paid', { value: { receiptNo: 'EXF-002' } }).expect(200);
    const reg = (await get('controller', `/v1/exam-office/records/registration/${C}`).expect(200)).body;
    expect(reg).toMatchObject({ status: { key: 'registered' }, facts: expect.arrayContaining([{ key: 'fee', value: 'paid', format: 'status' }]) });
    expect(reg.activity.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['exam.fee.paid', 'exam.registration.overridden']));
    await act('controller', 'session', ids.session, 'complete').expect(200);

    // Hall tickets take the office's numbering series once settings are saved.
    const cfg = (await get('controller', '/v1/exam-office/settings').expect(200)).body;
    expect(cfg.configured).toBe(false);
    await http().put('/v1/exam-office/settings').set(as('hod')).send(cfg.settings).expect(403);
    await http().put('/v1/exam-office/settings').set(as('controller')).send({ ...cfg.settings, hallTicketSeries: { prefix: 'SDC/HT/', next: 101, pad: 4, suffix: '' } }).expect(200);
    await http().post(`/v1/exam-sessions/${ids.session}/hall-tickets`).set(as('principal')).send({}).expect(200);
    const tickets = await db.select().from(s.hallTickets).where(eq(s.hallTickets.sessionId, ids.session));
    expect(tickets.map((x) => x.ticketNo).sort()).toEqual(['SDC/HT/0101', 'SDC/HT/0102', 'SDC/HT/0103']);
    await act('controller', 'hall_ticket', B, 'block', { comment: 'Library dues' }).expect(200);
    const ht = (await get('controller', `/v1/exam-office/records/hall_ticket/${B}`).expect(200)).body;
    expect(ht).toMatchObject({ status: { key: 'blocked' }, documents: [] });
    await act('controller', 'hall_ticket', B, 'unblock', { comment: 'Dues cleared' }).expect(200);
    await act('controller', 'session', ids.session, 'complete').expect(200);

    // Conduct: attendance per paper; an absentee is marked absent in the marks book too.
    await act('controller', 'session', ids.session, 'complete').expect(409);
    await act('controller', 'paper', ids.paper, 'attendance', { value: { absent: [other.students[0].id] } }).expect(400);
    expect((await act('controller', 'paper', ids.paper, 'attendance', { value: { absent: [t.students[2].id] } }).expect(200)).body).toEqual({ present: 2, absent: 1, debarred: 0 });
    const paper = (await get('controller', `/v1/exam-office/records/paper/${ids.paper}`).expect(200)).body;
    expect(paper.facts.find((f: { key: string }) => f.key === 'present').value).toBe('2 / 3');
    await act('controller', 'session', ids.session, 'complete').expect(200); // conduct
    await act('controller', 'session', ids.session, 'complete').expect(200); // valuation: no scanned scripts

    // Moderation: within the limits, approved by a second person, then applied (capped at the maximum).
    const [p] = await db.select().from(s.examPapers).where(eq(s.examPapers.id, ids.paper));
    await db.insert(s.marks).values([{ tenantId: t.tenantId, assessmentId: p.assessmentId!, studentId: t.students[0].id, marks: 40 }, { tenantId: t.tenantId, assessmentId: p.assessmentId!, studentId: t.students[1].id, marks: 58 }]);
    await act('controller', 'paper', ids.paper, 'moderate', { comment: 'Hard paper', value: { kind: 'add', value: 9 } }).expect(400);
    await act('controller', 'paper', ids.paper, 'moderate', { comment: 'Question 4 was out of syllabus', value: { kind: 'add', value: 3 } }).expect(200);
    await act('controller', 'paper', ids.paper, 'moderate', { comment: 'Again', value: { kind: 'add', value: 2 } }).expect(409);
    await act('controller', 'session', ids.session, 'complete').expect(409);
    await act('controller', 'paper', ids.paper, 'approve').expect(403);
    await act('controller', 'paper', ids.paper, 'apply_moderation').expect(409);
    await act('principal', 'paper', ids.paper, 'approve', { comment: 'Agreed by the board' }).expect(200);
    expect((await act('controller', 'paper', ids.paper, 'apply_moderation').expect(200)).body).toMatchObject({ status: 'applied', applied: 2 });
    const ms = await db.select().from(s.marks).where(eq(s.marks.assessmentId, p.assessmentId!));
    expect(Object.fromEntries(ms.map((m) => [m.studentId, m.moderatedMarks]))).toEqual({ [t.students[0].id]: 43, [t.students[1].id]: 60, [t.students[2].id]: null });
    await act('controller', 'session', ids.session, 'complete').expect(200);

    rec = await session();
    expect(rec.status.key).toBe('result_approval');
    expect(rec.steps.filter((x: { state: string }) => x.state === 'done').map((x: { key: string }) => x.key)).toEqual(['setup', 'timetable', 'registration', 'fees', 'hall_tickets', 'conduct', 'valuation', 'moderation']);
    await act('controller', 'session', ids.session, 'complete').expect(409); // results not processed
    expect(rec.activity.length).toBeGreaterThan(5);
  }, 120_000);

  it('takes a question paper through scrutiny, approval, lock and a sealed release', async () => {
    const [qp] = await db.insert(s.extQuestionPapers).values({ tenantId: t.tenantId, sessionId: ids.session, subjectId: t.subject.id, title: 'Corporate Accounting: Paper I', content: 'Q1. Explain amalgamation. (10)' }).returning();
    await act('controller', 'question_paper', qp.id, 'lock', { value: { releaseAt: '2026-11-05T04:00:00Z' } }).expect(409);
    await act('controller', 'question_paper', qp.id, 'submit_qp').expect(200);
    await act('controller', 'question_paper', qp.id, 'reject').expect(400);
    await act('controller', 'question_paper', qp.id, 'reject', { comment: 'Add an internal choice' }).expect(200);
    await act('controller', 'question_paper', qp.id, 'submit_qp').expect(200);
    await act('principal', 'question_paper', qp.id, 'approve').expect(200);
    await act('controller', 'question_paper', qp.id, 'lock').expect(400);
    await act('controller', 'question_paper', qp.id, 'lock', { value: { releaseAt: '2099-11-05T04:00:00Z' } }).expect(200);
    let rec = (await get('controller', `/v1/exam-office/records/question_paper/${qp.id}`).expect(200)).body;
    expect(rec).toMatchObject({ status: { key: 'locked' }, facts: expect.arrayContaining([{ key: 'code', value: 'QP/26/001' }, { key: 'version', value: 2 }]) });
    expect(rec.overview.find((x: { key: string }) => x.key === 'content').value).toBe('sealed');
    await act('controller', 'question_paper', qp.id, 'release').expect(409); // sealed until its time
    await db.update(s.extQuestionPapers).set({ releaseAt: new Date(Date.now() - 60_000) }).where(eq(s.extQuestionPapers.id, qp.id));
    await act('controller', 'question_paper', qp.id, 'release').expect(200);
    rec = (await get('controller', `/v1/exam-office/records/question_paper/${qp.id}`).expect(200)).body;
    expect(rec.steps.every((x: { state: string }) => x.state === 'done')).toBe(true);
    expect(rec.overview.find((x: { key: string }) => x.key === 'content').value).toContain('amalgamation');
  }, 120_000);

  it('lists every record kind, serves the reports and keeps institutions apart', async () => {
    for (const kind of ['session', 'paper', 'registration', 'hall_ticket', 'question_paper', 'script', 'examiner', 'result', 'revaluation', 'certificate']) {
      const rows = (await get('hod', `/v1/exam-office/records/${kind}?sessionId=${ids.session}`).expect(200)).body;
      expect(Array.isArray(rows)).toBe(true);
    }
    await get('hod', '/v1/exam-office/records/nonsense').expect(400);
    await get('teacher', '/v1/exam-office/records/session').expect(403);
    const summary = (await get('hod', `/v1/exam-office/reports/registration_summary?sessionId=${ids.session}`).expect(200)).body;
    expect(summary.rows).toEqual([expect.objectContaining({ class: 'BCom Sem 3 A', registered: '3', fee_paid: '3', fee_due: '0' })]);
    const att = (await get('hod', `/v1/exam-office/reports/attendance?sessionId=${ids.session}`).expect(200)).body;
    expect(att.rows[0]).toMatchObject({ present: '2', absent: '1', absentees: 'R3' });
    for (const r of ['hall_tickets', 'seating_plan', 'invigilation', 'malpractice', 'valuation_status', 'tabulation', 'result_analysis', 'revaluation_outcomes', 'pass_fail']) await get('hod', `/v1/exam-office/reports/${r}?sessionId=${ids.session}`).expect(200);
    expect((await get('hod', `/v1/exam-office/reports/result_analysis?sessionId=${ids.session}&by=topper`).expect(200)).body.columns[0].key).toBe('rank');
    const ov = (await get('hod', '/v1/exam-office/overview').expect(200)).body;
    expect(ov.sessions[0]).toMatchObject({ id: ids.session, stage: 'result_approval', done: 8, total: 12 });
    await get('other', `/v1/exam-office/records/session/${ids.session}`).expect(404);
    await act('other', 'paper', ids.paper, 'attendance', { value: {} }).expect(404);
    expect((await get('other', '/v1/exam-office/overview').expect(200)).body.sessions).toEqual([]);
  }, 120_000);
});
