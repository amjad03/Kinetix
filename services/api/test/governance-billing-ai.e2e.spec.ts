import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { judge } from '../src/ai/ai-admin.controller.js';
import { embed, cosine } from '../src/ai/embed.js';
import { computeInvoice, periodEnd, PLANS } from '../src/billing/billing.logic.js';
import { breachDeadline, canMoveIncident, retentionDue, ruleInForce } from '../src/governance/governance.logic.js';
import { containment, shingles, words } from '../src/integrity/similarity.js';
import { classOf, parseQuestion } from '../src/search/nl-search.js';
import * as s from '../src/db/schema.js';
import { domainEvents } from '../src/db/schema-foundation.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('pure rules', () => {
  it('picks the approved rule version in force on a date', () => {
    const v = [
      { version: 1, status: 'approved', effectiveFrom: '2026-04-01', effectiveTo: '2026-09-30' },
      { version: 2, status: 'approved', effectiveFrom: '2026-10-01', effectiveTo: null },
      { version: 3, status: 'draft', effectiveFrom: '2026-10-01', effectiveTo: null },
    ];
    expect(ruleInForce(v, '2026-05-01')?.version).toBe(1);
    expect(ruleInForce(v, '2026-10-20')?.version).toBe(2);
    expect(ruleInForce(v, '2026-01-01')).toBeNull();
  });
  it('tracks the 72-hour breach clock and incident closing rules', () => {
    const t = new Date('2026-10-20T04:00:00Z');
    expect(breachDeadline(t, true)?.toISOString()).toBe('2026-10-23T04:00:00.000Z');
    expect(breachDeadline(t, false)).toBeNull();
    expect(canMoveIncident('mitigated', 'closed', { severity: 'sev1', rootCause: null, correctiveActions: null }).ok).toBe(false);
    expect(canMoveIncident('mitigated', 'closed', { severity: 'sev3', rootCause: null, correctiveActions: null }).ok).toBe(true);
    expect(retentionDue({ createdAt: new Date('2020-01-01'), legalHold: false, archivedAt: null }, 60, new Date('2026-10-20'))).toBe(true);
    expect(retentionDue({ createdAt: new Date('2020-01-01'), legalHold: true, archivedAt: null }, 60, new Date('2026-10-20'))).toBe(false);
  });
  it('prices a plan with a minimum, overage and GST split by state', () => {
    const plan = PLANS.find((p) => p.code === 'standard')!;
    const same = computeInvoice(plan, 'month', { students: 150, staff: 20, boards: 2, aiCalls: 15_250, storageMb: 1000 }, '29');
    expect(same.lines[0].quantity).toBe(200);
    expect(same.lines[0].amountPaise).toBe(200 * 5000);
    expect(same.lines).toHaveLength(2);
    expect(same.taxBreakdown.cgstPaise + same.taxBreakdown.sgstPaise).toBe(same.taxPaise);
    expect(same.taxBreakdown.igstPaise).toBe(0);
    const other = computeInvoice(plan, 'year', { students: 300, staff: 20, boards: 2, aiCalls: 0, storageMb: 0 }, '27');
    expect(other.lines[0].quantity).toBe(3000);
    expect(other.taxBreakdown.igstPaise).toBe(other.taxPaise);
    expect(periodEnd('2026-01-31', 'month')).toBe('2026-02-27');
    expect(periodEnd('2026-10-20', 'year')).toBe('2027-10-19');
  });
  it('finds copied text and ignores unrelated answers', () => {
    const a = words('The accounting equation states that assets equal liabilities plus capital and every transaction keeps this equation balanced at all times in the books');
    const b = words('Every business keeps books where the accounting equation states that assets equal liabilities plus capital and every transaction keeps this equation balanced at all times so errors show');
    const c = words('Photosynthesis is how green plants make food from sunlight water and carbon dioxide inside the chloroplasts of their leaves during the day');
    expect(containment(shingles(a), shingles(b))).toBeGreaterThan(0.6);
    expect(containment(shingles(a), shingles(c))).toBe(0);
  });
  it('reads plain-words questions and judges eval answers', () => {
    expect(parseQuestion('students absent today in class 8A')).toEqual({ kind: 'absent_today', className: '8A' });
    expect(parseQuestion('which students have attendance below 75%')).toMatchObject({ kind: 'low_attendance', belowPct: 75 });
    expect(parseQuestion('fees overdue for class 10 B')).toMatchObject({ kind: 'fees_overdue', className: '10B' });
    expect(parseQuestion('library timings').kind).toBe('search');
    expect(classOf('section 9-b')).toBe('9B');
    expect(judge('Photosynthesis makes food', { mustInclude: ['photosynthesis'], mustNotInclude: ['guess'], maxChars: 100 })).toEqual([]);
    expect(judge('x'.repeat(30), { mustInclude: ['food'], mustNotInclude: [], maxChars: 10 })).toHaveLength(2);
  });
  it('ranks near spellings with the local embedding', () => {
    expect(cosine(embed('photosynthesise'), embed('photosynthesis'))).toBeGreaterThan(0.6);
    expect(cosine(embed('photosynthesise'), embed('trial balance'))).toBeLessThan(0.3);
  });
});

describe('governance, billing, AI and integrity', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  let admin: typeof s.users.$inferSelect;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    [admin] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Admin', email: `admin-${t.slug}@x.in`, passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: admin.id, role: 'tenant_admin' });
    app = await createApp(clock);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.admin = await login(t.slug, admin.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.guardian = await login(t.slug, t.guardian.email!);
    tokens.otherPrincipal = await login(other.slug, other.principal.email!);
  });
  afterAll(async () => {
    // The tasks raised above queue notification jobs; run them so a later test file does not count them.
    await app?.get(JobsService).drain();
    await app?.close();
    await owner.end();
  });

  it('versions, reviews and approves a rule with two people; the next version takes over', async () => {
    const body = { domain: 'grading', key: 'pass-mark', title: 'Pass mark 40%', params: { passPercent: 40 }, effectiveFrom: '2026-10-01' };
    const v1 = (await post('principal', '/v1/governance/rules', body).expect(201)).body;
    expect(v1.version).toBe(1);
    await post('principal', `/v1/governance/rules/${v1.id}/move`, { to: 'in_review' }).expect(200);
    await post('principal', `/v1/governance/rules/${v1.id}/approve`).expect(403); // the author cannot approve
    await post('admin', `/v1/governance/rules/${v1.id}/approve`).expect(200);
    expect((await get('teacher', '/v1/governance/rules/resolve?domain=grading&key=pass-mark').expect(200)).body.params.passPercent).toBe(40);
    const v2 = (await post('principal', '/v1/governance/rules', { ...body, title: 'Pass mark 35%', params: { passPercent: 35 }, effectiveFrom: '2026-11-01' }).expect(201)).body;
    expect(v2.version).toBe(2);
    await put('principal', `/v1/governance/rules/${v2.id}`, { params: { passPercent: 33 } }).expect(200);
    await post('principal', `/v1/governance/rules/${v2.id}/move`, { to: 'in_review' }).expect(200);
    await post('admin', `/v1/governance/rules/${v2.id}/approve`).expect(200);
    expect((await get('teacher', '/v1/governance/rules/resolve?domain=grading&key=pass-mark&on=2026-10-25').expect(200)).body.version).toBe(1);
    expect((await get('teacher', '/v1/governance/rules/resolve?domain=grading&key=pass-mark&on=2026-11-02').expect(200)).body.params.passPercent).toBe(33);
    const hist = (await get('principal', '/v1/governance/rules/history?domain=grading&key=pass-mark').expect(200)).body;
    expect(hist.map((h: { version: number }) => h.version)).toEqual([2, 1]);
    expect(hist[1].effectiveTo).toBe('2026-10-31');
    await get('teacher', '/v1/governance/rules').expect(403);
    // The attendance threshold the whole ERP uses now comes from the approved rule.
    const shortage = () => get('teacher', `/v1/attendance/shortage?sectionId=${t.section.id}`);
    expect((await shortage().expect(200)).body.thresholdPct).toBe(75);
    const att = (await post('principal', '/v1/governance/rules', { domain: 'attendance', key: 'exam-eligibility', title: 'At least 60 percent', params: { thresholdPercent: 60 }, effectiveFrom: '2026-10-01' }).expect(201)).body;
    await post('principal', `/v1/governance/rules/${att.id}/move`, { to: 'in_review' }).expect(200);
    await post('admin', `/v1/governance/rules/${att.id}/approve`).expect(200);
    expect((await shortage().expect(200)).body.thresholdPct).toBe(60);
    const edits = await db.select().from(s.auditLog).where(and(eq(s.auditLog.tenantId, t.tenantId), eq(s.auditLog.action, 'rule.edited')));
    expect((edits[0].data as { changes: Record<string, unknown> }).changes).toHaveProperty('params');
  });

  it('runs an incident with its breach clock, a task and closing rules', async () => {
    const inc = (await post('teacher', '/v1/governance/incidents', { title: 'Marks sheet shared by mistake', severity: 'sev2', category: 'data_breach', personalDataInvolved: true, impact: '40 students' }).expect(201)).body;
    expect(new Date(inc.regulatorDeadline).getTime() - new Date(inc.detectedAt).getTime()).toBe(72 * 3600_000);
    const tasks = await db.select().from(s.tasks).where(and(eq(s.tasks.tenantId, t.tenantId), eq(s.tasks.sourceModule, 'incidents')));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].slaHours).toBeLessThanOrEqual(4);
    await post('principal', `/v1/governance/incidents/${inc.id}/updates`, { body: 'Looking into it', status: 'investigating' }).expect(201);
    await post('principal', `/v1/governance/incidents/${inc.id}/updates`, { body: 'Closing', status: 'closed' }).expect(400);
    await put('principal', `/v1/governance/incidents/${inc.id}`, { rootCause: 'Wrong share link', correctiveActions: 'Share links expire in a day', regulatorNotified: true }).expect(200);
    await post('principal', `/v1/governance/incidents/${inc.id}/updates`, { body: 'Closing', status: 'closed' }).expect(201);
    const one = (await get('principal', `/v1/governance/incidents/${inc.id}`).expect(200)).body;
    expect(one.status).toBe('closed');
    expect(one.timeline.map((x: { kind: string }) => x.kind)).toContain('notification');
    await get('teacher', '/v1/governance/incidents').expect(403);
    expect((await get('otherPrincipal', '/v1/governance/incidents').expect(200)).body).toHaveLength(0);
  });

  it('archives files past their category retention unless on legal hold, and lists versions', async () => {
    const old = new Date('2019-01-01T00:00:00Z');
    const mk = async (title: string, extra: Partial<typeof s.vaultDocuments.$inferInsert> = {}) =>
      (await db.insert(s.vaultDocuments).values({ tenantId: t.tenantId, ownerType: 'student', studentId: t.students[0].id, title, category: 'fee_receipt', contentType: 'application/pdf', sizeBytes: 10, storageKey: `k-${randomUUID()}`, uploadedBy: t.principal.id, createdAt: old, ...extra }).returning())[0];
    const a = await mk('Receipt 2019');
    const held = await mk('Receipt held');
    const v2 = await mk('Receipt 2019 v2', { version: 2, replacesId: a.id, createdAt: new Date() });
    await put('principal', '/v1/governance/retention/fee_receipt', { retainMonths: 60, note: 'Seven years is the legal minimum for tax records; five here' }).expect(200);
    await post('principal', `/v1/governance/documents/${held.id}/hold`, { hold: true }).expect(200);
    const due = (await get('principal', '/v1/governance/retention/due').expect(200)).body;
    expect(due.map((d: { id: string }) => d.id).sort()).toEqual([a.id].sort());
    expect((await post('principal', '/v1/governance/retention/run').expect(200)).body.archived).toBe(1);
    const [row] = await db.select().from(s.vaultDocuments).where(eq(s.vaultDocuments.id, a.id));
    expect(row.archivedAt).not.toBeNull();
    const chain = (await get('principal', `/v1/governance/documents/${v2.id}/versions`).expect(200)).body;
    expect(chain.map((c: { version: number }) => c.version)).toEqual([1, 2]);
  });

  it('holds a processed result until a second person approves it', async () => {
    const [session] = await db.insert(s.examSessions).values({ tenantId: t.tenantId, academicYearId: (await db.select().from(s.academicYears).where(eq(s.academicYears.tenantId, t.tenantId)))[0].id, programId: t.program.id, term: 3, name: 'Term 3 exam', startsOn: '2026-12-01', endsOn: '2026-12-10', status: 'processed', createdBy: t.principal.id }).returning();
    await put('principal', `/v1/exam-sessions/${session.id}/approval-required`, { required: true }).expect(200);
    await post('principal', `/v1/exam-sessions/${session.id}/publish`).expect(409);
    await post('principal', `/v1/exam-sessions/${session.id}/request-approval`).expect(200);
    await post('principal', `/v1/exam-sessions/${session.id}/approve`).expect(403);
    await post('principal', `/v1/exam-sessions/${session.id}/publish`).expect(409);
    await post('admin', `/v1/exam-sessions/${session.id}/return`, { note: 'Recheck the BCom Sem 3 B marks' }).expect(200);
    await post('principal', `/v1/exam-sessions/${session.id}/request-approval`).expect(200);
    await post('admin', `/v1/exam-sessions/${session.id}/approve`, { note: 'Checked' }).expect(200);
    await post('principal', `/v1/exam-sessions/${session.id}/publish`).expect(200);
    const task = await db.select().from(s.tasks).where(and(eq(s.tasks.tenantId, t.tenantId), eq(s.tasks.sourceModule, 'exam_results')));
    expect(task.length).toBeGreaterThanOrEqual(1);
  });

  it('subscribes, meters usage, renews with a GST invoice and takes payment', async () => {
    expect((await get('principal', '/v1/billing/plans').expect(200)).body).toHaveLength(3);
    await get('teacher', '/v1/billing/plans').expect(403);
    const sub = (await post('principal', '/v1/billing/subscription', { planCode: 'standard', interval: 'month', billingStateCode: '29' }).expect(200)).body;
    expect(sub.currentPeriodStart).toBe('2026-10-20');
    expect(sub.currentPeriodEnd).toBe('2026-11-19');
    const view = (await get('principal', '/v1/billing/subscription').expect(200)).body;
    expect(view.usage.students).toBe(3);
    expect(view.estimate.totalPaise).toBe(Math.round(200 * 5000 * 1.18));
    expect((await post('principal', '/v1/billing/renew').expect(200)).body.renewed).toBe(false);
    clock.at = new Date('2026-11-25T04:30:00Z');
    const r = (await post('principal', '/v1/billing/renew').expect(200)).body;
    expect(r.renewed).toBe(true);
    expect(r.invoice).toMatch(/^KX\/2026-27\/0001$/);
    const [inv] = (await get('principal', '/v1/billing/invoices').expect(200)).body;
    expect(inv.taxBreakdown.cgstPaise).toBe(inv.taxBreakdown.sgstPaise);
    expect(inv.periodStart).toBe('2026-10-20');
    expect((await get('principal', '/v1/billing/subscription').expect(200)).body.subscription.currentPeriodStart).toBe('2026-11-20');
    await post('principal', `/v1/billing/invoices/${inv.id}/pay`, { reference: 'UTR123456' }).expect(200);
    await post('principal', `/v1/billing/invoices/${inv.id}/pay`, { reference: 'UTR123456' }).expect(400);
    expect((await get('otherPrincipal', '/v1/billing/invoices').expect(200)).body).toHaveLength(0);
    expect((await get('principal', '/v1/billing/usage').expect(200)).body.length).toBeGreaterThanOrEqual(1);
    clock.at = new Date('2026-10-20T04:30:00Z');
  });

  it('tutors a student across turns with the record in context, and logs every AI action', async () => {
    const first = (await post('student', '/v1/ai/tutor/ask', { question: 'What is the accounting equation?' }).expect(200)).body;
    expect(first.threadId).toBeTruthy();
    expect(first.actionId).toBeTruthy();
    const second = (await post('student', '/v1/ai/tutor/ask', { threadId: first.threadId, question: 'Can you give an example?' }).expect(200)).body;
    expect(second.threadId).toBe(first.threadId);
    const thread = (await get('student', `/v1/ai/tutor/threads/${first.threadId}`).expect(200)).body;
    expect(thread.messages.map((m: { role: string }) => m.role)).toEqual(['student', 'tutor', 'student', 'tutor']);
    await get('guardian', `/v1/ai/tutor/threads/${first.threadId}`).expect(403);
    await post('guardian', `/v1/ai/parent/children/${t.students[0].id}/insight`).expect(200);
    await post('guardian', `/v1/ai/parent/children/${t.students[2].id}/insight`).expect(404);
    await put('student', `/v1/ai/actions/${first.actionId}/decision`, { decision: 'accepted' }).expect(200);
    await put('teacher', `/v1/ai/actions/${first.actionId}/decision`, { decision: 'rejected' }).expect(404);
    const actions = (await get('principal', '/v1/ai/admin/actions?surface=tutor').expect(200)).body;
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.find((a: { id: string }) => a.id === first.actionId).decision).toBe('accepted');
    await get('teacher', '/v1/ai/admin/actions').expect(403);
    await post('principal', '/v1/ai/insights/quality', {}).expect(200);
    await post('principal', '/v1/ai/insights/careers', {}).expect(200);
    await post('principal', '/v1/ai/insights/research', {}).expect(200);
    await post('student', '/v1/ai/insights/research', {}).expect(403);
  });

  it('runs the evaluation harness over saved cases', async () => {
    await post('principal', '/v1/ai/admin/evals/cases', { name: 'Photosynthesis explained', task: 'explain', input: { question: 'What is photosynthesis?' }, mustInclude: ['photosynthesis'], mustNotInclude: ['definitely wrong'], maxChars: 4000 }).expect(201);
    await post('principal', '/v1/ai/admin/evals/cases', { name: 'Bad input', task: 'explain', input: { nope: 1 } }).expect(400);
    const run = (await post('principal', '/v1/ai/admin/evals/run').expect(200)).body;
    expect(run.passed).toBe(1);
    expect(run.failed).toBe(0);
    expect((await get('principal', '/v1/ai/admin/evals/runs').expect(200)).body).toHaveLength(1);
  });

  it('flags copied homework answers for the teacher to review', async () => {
    const [hw] = await db.insert(s.homework).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, createdBy: t.teacher.id, title: 'Accounting equation essay', dueOn: '2026-10-25' }).returning();
    const base = 'The accounting equation states that assets equal liabilities plus capital and every transaction keeps this equation balanced at all times in the books of the business';
    const texts = [base, `${base} so errors show up quickly`, 'Photosynthesis is how green plants make food from sunlight water and carbon dioxide inside the chloroplasts of their leaves during the day time'];
    await db.insert(s.homeworkSubmissions).values(t.students.map((st, i) => ({ tenantId: t.tenantId, homeworkId: hw.id, studentId: st.id, text: texts[i], status: 'submitted' as const, submittedBy: t.teacher.id, submittedAt: new Date('2026-10-20T04:00:00Z') })));
    const res = (await post('teacher', `/v1/integrity/homework/${hw.id}/check`, { threshold: 0.6 }).expect(200)).body;
    expect(res.flagged).toBe(1);
    const rep = (await get('teacher', `/v1/integrity/homework/${hw.id}`).expect(200)).body;
    expect(rep.matches[0].similarity).toBeGreaterThan(0.6);
    expect(rep.matches[0].sharedPhrase).toContain('accounting equation');
    await put('teacher', `/v1/integrity/matches/${rep.matches[0].id}`, { reviewed: 'dismissed' }).expect(200);
    const tasks = await db.select().from(s.tasks).where(and(eq(s.tasks.tenantId, t.tenantId), eq(s.tasks.sourceModule, 'integrity')));
    expect(tasks).toHaveLength(1);
    await get('student', `/v1/integrity/homework/${hw.id}`).expect(403);
  });

  it('re-measures an intervention plan against its baseline and sets a review task', async () => {
    await db.insert(s.mentorAssignments).values({ tenantId: t.tenantId, studentId: t.students[0].id, mentorUserId: t.teacher.id, startedOn: '2026-10-01', assignedBy: t.principal.id });
    const plan = (await post('teacher', '/v1/mentoring/plans', { studentId: t.students[0].id, goal: 'Bring accounting up', actions: ['Extra practice'], reviewOn: '2026-11-15' }).expect(201)).body;
    expect(plan.baseline).toMatchObject({ avgPct: null });
    await post('teacher', `/v1/mentoring/plans/${plan.id}/remedial`, { kind: 'topic', title: 'Trial balance basics' }).expect(200);
    const [a] = await db.insert(s.assessments).values({ tenantId: t.tenantId, sectionId: t.section.id, subjectId: t.subject.id, title: 'Unit test', kind: 'internal', maxMarks: 20, heldOn: '2026-10-18', publishedAt: new Date(), createdBy: t.teacher.id }).returning();
    await db.insert(s.marks).values({ tenantId: t.tenantId, assessmentId: a.id, studentId: t.students[0].id, marks: 15 });
    const done = (await post('teacher', `/v1/mentoring/plans/${plan.id}/remeasure`).expect(200)).body;
    expect(done.remeasure.avgPct).toBe(75);
    expect(done.remeasure.verdict).toBe('no_data'); // the baseline had no marks to compare with
    expect((await db.select().from(s.tasks).where(and(eq(s.tasks.tenantId, t.tenantId), eq(s.tasks.sourceModule, 'mentoring')))).length).toBe(1);
    const events = await db.select().from(domainEvents).where(and(eq(domainEvents.tenantId, t.tenantId), eq(domainEvents.type, 'mentoring.intervention_created')));
    expect(events).toHaveLength(1);
  });

  it('promotes a placed student to an alumni profile when the offer is accepted', async () => {
    const [company] = await db.insert(s.placementCompanies).values({ tenantId: t.tenantId, name: 'Acme Audit LLP' }).returning();
    const [drive] = await db.insert(s.placementDrives).values({ tenantId: t.tenantId, companyId: company.id, title: 'Campus drive', roleTitle: 'Audit trainee' }).returning();
    const [reg] = await db.insert(s.driveRegistrations).values({ tenantId: t.tenantId, driveId: drive.id, studentId: t.students[2].id, cgpaAt: 8, backlogsAt: 0, status: 'selected' }).returning();
    const [offer] = await db.insert(s.placementOffers).values({ tenantId: t.tenantId, driveId: drive.id, registrationId: reg.id, studentId: t.students[2].id, roleTitle: 'Audit trainee', offeredOn: '2026-10-20' }).returning();
    await post('student', `/v1/placements/offers/${offer.id}/respond`, { response: 'accepted' }).expect(200);
    const [alum] = await db.select().from(s.alumniProfiles).where(eq(s.alumniProfiles.studentId, t.students[2].id));
    expect(alum).toMatchObject({ employer: 'Acme Audit LLP', designation: 'Audit trainee', directoryVisible: false, graduationYear: 2027 });
  });

  it('searches events, fees and messages, and answers plain-words questions', async () => {
    await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, batchId: randomUUID(), title: 'Tuition term 3', amountPaise: 500000, dueOn: '2026-09-30', createdBy: t.principal.id });
    await db.insert(s.attendanceRecords).values({ tenantId: t.tenantId, studentId: t.students[1].id, sectionId: t.section.id, date: '2026-10-20', status: 'absent', markedBy: t.teacher.id, occurredAt: new Date('2026-10-20T04:00:00Z') });
    await db.insert(s.campusEvents).values({ tenantId: t.tenantId, title: 'Annual Sports Day', capacity: 100, startsAt: new Date(Date.now() + 5 * 86400_000), endsAt: new Date(Date.now() + 6 * 86400_000), createdBy: t.principal.id });
    const hits = (await get('principal', '/v1/search?q=Tuition&types=fees,events').expect(200)).body.hits;
    expect(hits.some((h: { type: string }) => h.type === 'fees')).toBe(true);
    expect((await get('principal', '/v1/search?q=Sports&types=events').expect(200)).body.hits.length).toBeGreaterThanOrEqual(1);
    await get('teacher', '/v1/search?q=Tuition&types=fees').expect(200).then((r) => expect(r.body.hits).toHaveLength(0));
    const overdue = (await get('principal', '/v1/search/ask?q=' + encodeURIComponent('fees overdue')).expect(200)).body;
    expect(overdue.intent).toBe('fees_overdue');
    expect(overdue.rows[0]).toMatchObject({ student: 'Student A', balance_rupees: 5000 });
    const absent = (await get('principal', '/v1/search/ask?q=' + encodeURIComponent('students absent today')).expect(200)).body;
    expect(absent.intent).toBe('absent_today');
    expect((await get('teacher', '/v1/search/ask?q=' + encodeURIComponent('fees overdue')).expect(200)).body.note).toMatch(/cannot see/);
  });
});
