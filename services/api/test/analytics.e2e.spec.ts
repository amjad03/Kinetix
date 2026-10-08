import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LogMailer, Mailer } from '../src/analytics/mailer.js';
import { ReportsService } from '../src/analytics/reports.service.js';
import * as s from '../src/db/schema.js';
import { reportRuns, reportSchedules } from '../src/db/schema-foundation.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('analytics and reporting', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date());
  const mailer = new LogMailer();
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  const staff = async (tenantId: string, campusId: string, role: (typeof s.roleName.enumValues)[number]) => {
    const [u] = await db.insert(s.users).values({ tenantId, fullName: `${role} person`, email: `${role}${++n}-${Math.random().toString(36).slice(2, 6)}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId, userId: u.id, role, campusId });
    return u;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(Mailer).useValue(mailer));
    for (const role of ['accountant', 'hr_manager', 'hod'] as const) {
      const u = await staff(t.tenantId, t.campus.id, role);
      ids[role] = u.id;
      ids[`${role}Email`] = u.email!;
      tokens[role] = await login(t.slug, u.email!);
    }
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);

    // Attendance: A present twice, B absent once, C late.
    const mark = (studentId: string, status: 'present' | 'absent' | 'late', date = today) => ({ tenantId: t.tenantId, studentId, sectionId: t.section.id, date, status, markedBy: t.teacher.id, occurredAt: new Date() });
    await db.insert(s.attendanceRecords).values([mark(t.students[0].id, 'present'), mark(t.students[0].id, 'present', new Date(Date.now() - 86400_000).toISOString().slice(0, 10)), mark(t.students[1].id, 'absent'), mark(t.students[2].id, 'late')]);

    // Results: two pass, one fail in a published session.
    const [session] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: t.section.academicYearId, programId: t.program.id, term: 3, name: 'Sem 3 End Exam', startsOn: today, endsOn: today, status: 'published', publishedAt: new Date(), createdBy: t.principal.id }).returning();
    await db.insert(s.examResults).values(t.students.map((st, i) => ({ tenantId: t.tenantId, sessionId: session.id, studentId: st.id, sgpa: [8, 6, 3][i], cgpa: [8, 6, 3][i], creditsAttempted: 20, creditsEarned: i < 2 ? 20 : 10, creditPoints: 100, outcome: i < 2 ? 'pass' : 'fail' })));

    // Classroom: one lesson on the board with a poll, one answer, and one covered topic.
    const [bs] = await db.insert(s.boardSessions).values({ tenantId: t.tenantId, deviceId: t.device.id, teacherId: t.teacher.id, sectionId: t.section.id, subjectId: t.subject.id, startedAt: new Date(Date.now() - 3600_000), endedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) }).returning();
    await db.insert(s.polls).values({ tenantId: t.tenantId, boardSessionId: bs.id, sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, kind: 'mcq', question: 'Q?', options: ['A', 'B'], openedAt: new Date() });
    await db.insert(s.participationEvents).values({ tenantId: t.tenantId, studentId: t.students[0].id, boardSessionId: bs.id, outcome: 'correct', recordedBy: t.teacher.id, occurredAt: new Date() });
    const [topic] = await db.execute<{ id: string; course_id: string }>(sql`select t.id, ch.course_id from topics t join chapters ch on ch.id = t.chapter_id where t.tenant_id is null limit 1`).then((r) => r.rows);
    await db.update(s.subjects).set({ courseId: topic.course_id }).where(eq(s.subjects.id, t.subject.id));
    await db.insert(s.topicCoverage).values({ tenantId: t.tenantId, sectionId: t.section.id, topicId: topic.id, coveredOn: today, coveredBy: t.teacher.id });

    // Fees: one invoice due last week, half paid.
    await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, batchId: crypto.randomUUID(), title: 'Tuition', amountPaise: 40_000_00, paidPaise: 10_000_00, dueOn: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10), createdBy: t.principal.id });
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('KPIs and drill-downs', () => {
    it('computes institution KPIs across domains', async () => {
      // The figures come from the placements and research domains: an accepted 6 LPA offer, and a project with a 50,000 grant.
      const [company] = await db.insert(s.placementCompanies).values({ tenantId: t.tenantId, name: 'Acme' }).returning();
      const [drive] = await db.insert(s.placementDrives).values({ tenantId: t.tenantId, companyId: company.id, title: 'Campus drive', roleTitle: 'Analyst', ctcLpa: 6, status: 'completed' }).returning();
      const [reg] = await db.insert(s.driveRegistrations).values({ tenantId: t.tenantId, driveId: drive.id, studentId: t.students[0].id, status: 'selected', cgpaAt: 8, backlogsAt: 0 }).returning();
      await db.insert(s.placementOffers).values({ tenantId: t.tenantId, driveId: drive.id, registrationId: reg.id, studentId: t.students[0].id, roleTitle: 'Analyst', ctcLpa: 6, status: 'accepted', offeredOn: today });
      const [project] = await db.insert(s.researchProjects).values({ tenantId: t.tenantId, code: 'RP-1', title: 'On fees', piUserId: t.teacher.id, startsOn: today }).returning();
      await db.insert(s.researchGrants).values({ tenantId: t.tenantId, projectId: project.id, agency: 'UGC', sanctionedPaise: 50_000_00, startsOn: today, endsOn: today });
      const k = (await http().get('/v1/analytics/kpis').set(as('principal')).expect(200)).body;
      expect(k.enrolment).toMatchObject({ active: 3, total: 3 });
      expect(k.attendance).toEqual({ percent: 75, marks: 4 });
      expect(k.results).toMatchObject({ session: 'Sem 3 End Exam', students: 3, passPercent: 66.7 });
      expect(k.fees).toMatchObject({ billedPaise: 40_000_00, collectedPaise: 10_000_00, outstandingPaise: 30_000_00, overduePaise: 30_000_00 });
      expect(k.staff.teachers).toBe(2);
      expect(k.placement).toMatchObject({ offers: 1, students: 1, joined: 1, highestPackagePaise: 6_00_000_00 });
      expect(k.research).toMatchObject({ outputs: 1, grantsPaise: 50_000_00 });
    });

    it('honours scope filters and a date range', async () => {
      const b = (await http().get(`/v1/analytics/kpis?sectionId=${t.otherSection.id}`).set(as('principal')).expect(200)).body;
      expect(b.enrolment.active).toBe(0);
      expect(b.attendance.percent).toBeNull();
      const old = (await http().get('/v1/analytics/kpis?from=2020-01-01&to=2020-01-31').set(as('principal')).expect(200)).body;
      expect(old.attendance.marks).toBe(0);
      await http().get('/v1/analytics/kpis?from=2026-02-01&to=2026-01-01').set(as('principal')).expect(400);
      await http().get('/v1/analytics/kpis?sectionId=nope').set(as('principal')).expect(400);
    });

    it('drills down by campus, program and section', async () => {
      const bySection = (await http().get('/v1/analytics/drilldown?metric=enrolment&by=section').set(as('principal')).expect(200)).body.rows as { label: string; active: number }[];
      expect(bySection.find((r) => r.label === 'BCom Sem 3 A')?.active).toBe(3);
      expect(bySection.find((r) => r.label === 'BCom Sem 3 B')?.active).toBe(0);
      const byCampus = (await http().get('/v1/analytics/drilldown?metric=attendance&by=campus').set(as('principal')).expect(200)).body.rows;
      expect(byCampus).toHaveLength(1);
      expect(byCampus[0]).toMatchObject({ label: 'Main', marks: 4, present: 3, percent: 75 });
      const fees = (await http().get(`/v1/analytics/drilldown?metric=fees&by=program&campusId=${t.campus.id}`).set(as('accountant')).expect(200)).body.rows;
      expect(fees[0]).toMatchObject({ label: 'BCom', billed_paise: 40_000_00, outstanding_paise: 30_000_00 });
      const res = (await http().get('/v1/analytics/drilldown?metric=results&by=section').set(as('hod')).expect(200)).body.rows as { label: string; pass_percent: number }[];
      expect(res.find((r) => r.label === 'BCom Sem 3 A')?.pass_percent).toBe(66.7);
      await http().get('/v1/analytics/drilldown?metric=enrolment&by=galaxy').set(as('principal')).expect(400);
    });

    it('keeps each role to its own data', async () => {
      await http().get('/v1/analytics/kpis').set(as('teacher')).expect(403);
      await http().get('/v1/analytics/kpis').set(as('parent')).expect(403);
      await http().get('/v1/analytics/kpis').set(as('accountant')).expect(403);
      await http().get('/v1/analytics/drilldown?metric=enrolment&by=section').set(as('accountant')).expect(403);
      await http().get('/v1/analytics/drilldown?metric=fees&by=section').set(as('hod')).expect(403);
      await http().get('/v1/analytics/classroom').set(as('accountant')).expect(403);
      // Another institution sees none of it.
      const o = (await http().get('/v1/analytics/kpis').set(as('outsider')).expect(200)).body;
      expect(o.fees.billedPaise).toBe(0);
      expect(o.placement.offers).toBe(0);
      expect(o.research.outputs).toBe(0);
    });
  });

  describe('classroom analytics', () => {
    it('aggregates sessions, tool usage and syllabus coverage from the board', async () => {
      const c = (await http().get('/v1/analytics/classroom').set(as('hod')).expect(200)).body;
      expect(c.sessions).toMatchObject({ total: 1, teachers: 1, boards: 1 });
      expect(c.sessions.hours).toBeGreaterThan(0.9);
      expect(c.tools.find((x: { tool: string }) => x.tool === 'polls').uses).toBe(1);
      expect(c.tools.find((x: { tool: string }) => x.tool === 'participation').uses).toBe(1);
      expect(c.byDay).toEqual([{ day: expect.any(String), sessions: 1 }]);
      const cov = c.coverage.find((r: { label: string }) => r.label === 'BCom Sem 3 A');
      expect(cov.covered).toBe(1);
      expect(cov.topics).toBeGreaterThan(1);
      expect(cov.percent).toBeGreaterThan(0);
      expect(c.bySection.find((r: { label: string }) => r.label === 'BCom Sem 3 A').sessions).toBe(1);
    });
  });

  describe('report catalogue and export', () => {
    it('lists only the reports a role may run', async () => {
      const keys = async (who: string) => ((await http().get('/v1/analytics/reports').set(as(who)).expect(200)).body as { key: string }[]).map((r) => r.key);
      expect(await keys('principal')).toEqual(expect.arrayContaining(['kpi.summary', 'fees.summary', 'staff.headcount', 'classroom.usage']));
      expect(await keys('accountant')).toEqual(['fees.summary', 'fees.defaulters']);
      expect(await keys('hr_manager')).toEqual(['staff.headcount', 'research.outputs']);
      await http().get('/v1/analytics/reports').set(as('teacher')).expect(403);
      await http().post('/v1/analytics/reports/staff.headcount/run').set(as('accountant')).send({}).expect(403);
      await http().post('/v1/analytics/reports/nope/run').set(as('principal')).send({}).expect(404);
      await http().post('/v1/analytics/reports/kpi.summary/run').set(as('principal')).send({ params: { by: 'galaxy' } }).expect(400);
    });

    it('runs a report as JSON, CSV and PDF, and audits the export', async () => {
      const json = (await http().post('/v1/analytics/reports/fees.defaulters/run').set(as('accountant')).send({ params: {} }).expect(200)).body;
      expect(json.rows).toHaveLength(1);
      expect(json.rows[0]).toMatchObject({ student: 'Student A', title: 'Tuition', outstanding_paise: 30_000_00 });
      const csv = await http().post('/v1/analytics/reports/fees.defaulters/run').set(as('accountant')).send({ format: 'csv' }).buffer(true).parse(binary).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.headers['content-disposition']).toMatch(/fees-defaulters-\d{4}-\d{2}-\d{2}\.csv/);
      const text = (csv.body as Buffer).toString('utf8').replace(/^﻿/, '');
      expect(text.split('\r\n')[0]).toBe('Roll no,Student,Class,Fee,Due on,Outstanding');
      expect(text).toContain('Student A,BCom Sem 3 A,Tuition');
      expect(text).toContain(',300000.00'.replace('300000', '30000')); // rupees, not paise
      const pdf = await http().post('/v1/analytics/reports/kpi.summary/run').set(as('principal')).send({ format: 'pdf' }).buffer(true).parse(binary).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      const audited = await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'report.run')));
      expect(audited.length).toBe(3);
      const runs = (await http().get('/v1/analytics/runs').set(as('accountant')).expect(200)).body as { reportKey: string }[];
      expect(runs.every((r) => r.reportKey.startsWith('fees.'))).toBe(true);
    });

    it('runs every catalogue report without error', async () => {
      const cat = (await http().get('/v1/analytics/reports').set(as('principal')).expect(200)).body as { key: string }[];
      const hr = (await http().get('/v1/analytics/reports').set(as('hr_manager')).expect(200)).body as { key: string }[];
      for (const r of new Map([...cat, ...hr].map((x) => [x.key, x])).values()) {
        const who = cat.some((c) => c.key === r.key) ? 'principal' : 'hr_manager';
        const body = (await http().post(`/v1/analytics/reports/${r.key}/run`).set(as(who)).send({}).expect(200)).body;
        expect(body.columns.length, r.key).toBeGreaterThan(0);
      }
    });
  });

  describe('scheduled reports', () => {
    let scheduleId = '';
    const body = (over: object = {}) => ({ reportKey: 'fees.summary', params: { by: 'program' }, frequency: 'daily', format: 'csv', recipients: [ids.accountantEmail], ...over });

    it('validates recipients: active people of the institution who may see the report', async () => {
      await http().post('/v1/analytics/schedules').set(as('accountant')).send(body({ recipients: ['stranger@example.com'] })).expect(400);
      await http().post('/v1/analytics/schedules').set(as('accountant')).send(body({ recipients: [t.teacher.email] })).expect(400);
      await http().post('/v1/analytics/schedules').set(as('accountant')).send(body({ recipients: [other.principal.email] })).expect(400);
      await http().post('/v1/analytics/schedules').set(as('accountant')).send(body({ reportKey: 'staff.headcount' })).expect(403);
      await http().post('/v1/analytics/schedules').set(as('teacher')).send(body()).expect(403);
      await http().post('/v1/analytics/schedules').set(as('accountant')).send(body({ recipients: [] })).expect(400);
    });

    it('creates, lists, pauses and deletes schedules (owner or administrator only)', async () => {
      const created = (await http().post('/v1/analytics/schedules').set(as('accountant')).send(body({ recipients: [ids.accountantEmail.toUpperCase()] })).expect(201)).body;
      scheduleId = created.id;
      expect(created.recipients).toEqual([ids.accountantEmail]);
      expect(new Date(created.nextRunAt).getTime()).toBeGreaterThan(clock.now().getTime());
      expect((await http().get('/v1/analytics/schedules').set(as('accountant')).expect(200)).body).toHaveLength(1);
      expect((await http().get('/v1/analytics/schedules').set(as('principal')).expect(200)).body).toHaveLength(1);
      expect((await http().get('/v1/analytics/schedules').set(as('outsider')).expect(200)).body).toHaveLength(0);
      await http().patch(`/v1/analytics/schedules/${scheduleId}`).set(as('outsider')).send({ active: false }).expect(404);
      await http().patch(`/v1/analytics/schedules/${scheduleId}`).set(as('principal')).send({}).expect(400);
      const paused = (await http().patch(`/v1/analytics/schedules/${scheduleId}`).set(as('principal')).send({ active: false }).expect(200)).body;
      expect(paused.active).toBe(false);
      await http().patch(`/v1/analytics/schedules/${scheduleId}`).set(as('principal')).send({ active: true, format: 'pdf' }).expect(200);
    });

    it('emails the report when due, records the run, and moves to the next day', async () => {
      const reports = app.get(ReportsService);
      expect(await reports.runDue()).toBe(0);
      clock.at = new Date(Date.now() + 2 * 86400_000);
      expect(await reports.runDue()).toBe(1);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]).toMatchObject({ to: [ids.accountantEmail], subject: expect.stringContaining('Fees collected and outstanding') });
      expect(mailer.sent[0].attachments[0]).toMatchObject({ contentType: 'application/pdf', filename: expect.stringMatching(/\.pdf$/) });
      expect(mailer.sent[0].attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
      const [sch] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, scheduleId));
      expect(sch.lastRunAt).not.toBeNull();
      expect(sch.nextRunAt.getTime()).toBeGreaterThan(clock.now().getTime());
      expect(await reports.runDue()).toBe(0); // not again until tomorrow
      const runs = await db.select().from(reportRuns).where(eq(reportRuns.scheduleId, scheduleId));
      expect(runs).toMatchObject([{ status: 'ok', format: 'pdf', deliveredTo: [ids.accountantEmail] }]);
    });

    it('switches a schedule off when its creator loses access', async () => {
      const reports = app.get(ReportsService);
      await db.delete(s.userRoles).where(and(eq(s.userRoles.userId, ids.accountant), eq(s.userRoles.role, 'accountant')));
      clock.at = new Date(clock.at.getTime() + 2 * 86400_000);
      expect(await reports.runDue()).toBe(0);
      const [sch] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, scheduleId));
      expect(sch.active).toBe(false);
      const runs = await db.select().from(reportRuns).where(and(eq(reportRuns.scheduleId, scheduleId), eq(reportRuns.status, 'failed')));
      expect(runs).toHaveLength(1);
      expect(mailer.sent).toHaveLength(1);
      await http().delete(`/v1/analytics/schedules/${scheduleId}`).set(as('principal')).expect(204);
      await http().delete(`/v1/analytics/schedules/${scheduleId}`).set(as('principal')).expect(404);
    });
  });

  describe('accreditation packs', () => {
    it('aggregates NAAC, NIRF and AISHE data across domains', async () => {
      for (const fw of ['naac', 'nirf', 'aishe']) {
        const pack = (await http().get(`/v1/analytics/accreditation/${fw}`).set(as('principal')).expect(200)).body;
        expect(pack.framework).toBe(fw);
        expect(pack.tables.length).toBeGreaterThan(4);
        expect(pack.gaps.length).toBeGreaterThan(0);
        expect(pack.tables.find((x: { name: string }) => x.name === 'programs').rows).toMatchObject([{ program: 'BCom', sections: 2 }]);
      }
      const naac = (await http().get('/v1/analytics/accreditation/naac').set(as('principal')).expect(200)).body;
      const get = (name: string) => naac.tables.find((x: { name: string }) => x.name === name).rows;
      expect(get('enrolment_by_program')).toEqual([{ program: 'BCom', gender: 'Not recorded', students: 3 }]);
      expect(get('results')).toMatchObject([{ program: 'BCom', students: 3, passed: 2, pass_percent: 66.7 }]);
      expect(get('placement')).toMatchObject([{ program: 'BCom', offers: 1, students: 1 }]);
      expect(get('research')).toMatchObject([{ kind: 'project', outputs: 1, grants_paise: 50_000_00 }]);
      expect(get('student_teacher_ratio')[0]).toMatchObject({ students: 3, teaching_staff: 3 });
      expect(get('infrastructure').find((r: { resource: string }) => r.resource === 'Rooms').count).toBe(1);
      expect(get('syllabus_coverage').find((r: { class: string }) => r.class === 'BCom Sem 3 A').covered).toBe(1);
    });

    it('exports a ZIP of CSVs, audited, for administrators only', async () => {
      const z = await http().get('/v1/analytics/accreditation/nirf?format=zip').set(as('principal')).buffer(true).parse(binary).expect(200);
      expect(z.headers['content-type']).toBe('application/zip');
      const buf = z.body as Buffer;
      expect(buf.subarray(0, 2).toString()).toBe('PK');
      expect(buf.includes('programs.csv')).toBe(true);
      expect(buf.includes('README.txt')).toBe(true);
      expect(buf.includes('Not recorded in KINETIX')).toBe(true);
      await http().get('/v1/analytics/accreditation/naac').set(as('accountant')).expect(403);
      await http().get('/v1/analytics/accreditation/naac').set(as('teacher')).expect(403);
      await http().get('/v1/analytics/accreditation/ugc').set(as('principal')).expect(404);
      await http().get('/v1/analytics/accreditation/naac?format=xml').set(as('principal')).expect(400);
      expect((await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'report.accreditation_exported')))).length).toBeGreaterThanOrEqual(5);
      await http().put('/v1/admin/features/analytics.accreditation').set(as('principal')).send({ enabled: false }).expect(200);
      await http().get('/v1/analytics/accreditation/naac').set(as('principal')).expect(403);
      await http().get('/v1/analytics/kpis').set(as('principal')).expect(200);
    });
  });

  describe('global search', () => {
    const find = async (who: string, q: string, extra = '') => (await http().get(`/v1/search?q=${encodeURIComponent(q)}${extra}`).set(as(who)).expect(200)).body.hits as { type: string; id: string; title: string; url: string }[];

    it('finds students by name or roll number, scoped by role', async () => {
      const hits = await find('principal', 'Student A');
      expect(hits.filter((h) => h.type === 'students').map((h) => h.id)).toContain(t.students[0].id);
      expect(hits.find((h) => h.type === 'students')!.url).toBe(`/students/${t.students[0].id}`);
      expect((await find('principal', 'R2')).map((h) => h.id)).toContain(t.students[1].id);
      expect((await find('principal', 'Studnt B', '&types=students')).map((h) => h.id)).toContain(t.students[1].id); // typo: trigram
      // A teacher finds students of the classes they teach, and another teacher does not.
      expect((await find('teacher', 'Student A')).filter((h) => h.type === 'students').map((h) => h.id).sort()).toEqual(t.students.map((st) => st.id).sort());
      const t2 = await login(t.slug, t.teacher2.email!);
      tokens.teacher2 = t2;
      expect((await find('teacher2', 'Student A')).filter((h) => h.type === 'students')).toHaveLength(0);
      // Families and other institutions find none of this institution's students.
      expect((await find('parent', 'Student A')).filter((h) => h.type === 'students')).toHaveLength(0);
      const theirs = (await find('outsider', 'Student A')).filter((h) => h.type === 'students').map((h) => h.id);
      expect(theirs.some((id) => t.students.some((st) => st.id === id))).toBe(false);
    });

    it('finds staff only for HR and administrators', async () => {
      await db.insert(s.staffProfiles).values({ userId: t.teacher.id, tenantId: t.tenantId, employeeCode: 'EMP-777' });
      expect((await find('hr_manager', 'EMP-777')).map((h) => h.type)).toContain('staff');
      expect((await find('principal', 'teacher')).some((h) => h.type === 'staff')).toBe(true);
      expect((await find('teacher', 'EMP-777')).some((h) => h.type === 'staff')).toBe(false);
      expect((await find('accountant', 'EMP-777')).some((h) => h.type === 'staff')).toBe(false);
    });

    it('finds courses, topics and reports, and respects content licences', async () => {
      const [{ title }] = await db.select({ title: s.courses.title }).from(s.courses).limit(1);
      const word = title.split(' ')[0];
      const hits = await find('teacher', word, '&limit=20');
      expect(hits.some((h) => h.type === 'courses')).toBe(true);
      expect((await find('principal', 'attendance')).some((h) => h.type === 'reports')).toBe(true);
      expect((await find('teacher', 'attendance')).some((h) => h.type === 'reports')).toBe(false);
      expect((await find('accountant', 'overdue fees')).some((h) => h.id === 'fees.defaulters')).toBe(true);
    });

    it('finds vault documents by the rules of the vault', async () => {
      const pdf = Buffer.from('%PDF-1.4\nx\n%%EOF');
      await http().post(`/v1/documents/vault/student/${t.students[0].id}?title=Transfer%20certificate&category=tc&visibility=owner`).set(as('principal')).set('content-type', 'application/pdf').send(pdf).expect(201);
      await http().post(`/v1/documents/vault/student/${t.students[1].id}?title=Transfer%20letter&category=tc&visibility=staff`).set(as('principal')).set('content-type', 'application/pdf').send(pdf).expect(201);
      expect((await find('principal', 'Transfer', '&types=documents')).map((h) => h.title).sort()).toEqual(['Transfer certificate', 'Transfer letter']);
      expect((await find('parent', 'Transfer', '&types=documents')).map((h) => h.title)).toEqual(['Transfer certificate']);
      expect(await find('teacher', 'Transfer', '&types=documents')).toEqual([]);
      expect(await find('outsider', 'Transfer', '&types=documents')).toEqual([]);
    });

    it('validates the query and can be switched off', async () => {
      expect(await find('principal', 'a')).toEqual([]);
      await http().get('/v1/search?q=abc&types=planets').set(as('principal')).expect(400);
      await http().get('/v1/search?q=abc').expect(401);
      await http().put('/v1/admin/features/search.global').set(as('principal')).send({ enabled: false }).expect(200);
      await http().get('/v1/search?q=abc').set(as('principal')).expect(403);
    });
  });
});
