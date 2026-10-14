import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examPapers, examResultLines, examResults, examSessions, graceApplications, graceAwards, marks, students, subjects } from '../db/schema.js';
import { loadOfficeSettings } from '../exam-office/settings.js';
import { ExamsService } from '../exams/exams.service.js';
import { RecordRegistry, type KitCtx, type RecordEntity } from '../records/entity.js';
import { OptionalRef, Ref, uuidEq } from '../records/helpers.js';
import { assertInSession, auditCell, CELL, CELL_READ, loadSession, sessionOptions } from './common.js';
import { reviseResult } from './result-runs.js';
import { studentOptions } from './withholds.js';

export const GRACE_CATEGORIES = ['sports', 'arts', 'nss', 'ncc', 'cultural', 'other'] as const;
const categoryOptions = GRACE_CATEGORIES.map((c) => ({ value: c, label: { sports: 'Sports', arts: 'Arts', nss: 'NSS', ncc: 'NCC', cultural: 'Cultural', other: 'Other' }[c] }));

const ApplyBody = z.object({
  studentId: z.uuid(),
  subjectId: z.uuid().nullable().optional(),
  category: z.enum(GRACE_CATEGORIES),
  marksRequested: z.number().positive().max(50),
  evidence: z.string().trim().min(3).max(1000),
});
const DecideBody = z.object({ approve: z.boolean(), marksApproved: z.number().positive().max(50).optional(), note: z.string().trim().max(500).optional() });

/** Files an application (the student, their family or the office). */
export async function fileGrace(tx: Tx, p: UserPrincipal, sessionId: string, b: z.infer<typeof ApplyBody>): Promise<string> {
  const s = await loadSession(tx, sessionId);
  if (s.status === 'locked') throw new ConflictException('The results of this session are locked');
  await assertInSession(tx, sessionId, b.studentId);
  if (b.subjectId) {
    const [paper] = await tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.sessionId, sessionId), eq(examPapers.subjectId, b.subjectId))).limit(1);
    if (!paper) throw new BadRequestException('That subject has no paper in this session');
  }
  const [open] = await tx.select({ id: graceApplications.id }).from(graceApplications).where(and(eq(graceApplications.sessionId, sessionId), eq(graceApplications.studentId, b.studentId), eq(graceApplications.category, b.category), sql`${graceApplications.status} in ('requested', 'approved')`));
  if (open) throw new ConflictException('An application in this category is already open');
  const [row] = await tx.insert(graceApplications).values({ tenantId: p.tenantId, sessionId, studentId: b.studentId, subjectId: b.subjectId ?? null, category: b.category, marksRequested: b.marksRequested, evidence: b.evidence, createdBy: p.userId }).returning({ id: graceApplications.id });
  return row.id;
}

/**
 * Grace marks for sports, arts, NSS and NCC: applied for with evidence, approved by the exam office (within the
 * office's per-subject limit), then applied to the external marks of a subject, which re-grades the student. An
 * applied grace is locked: it cannot be edited or deleted.
 */
@Controller('v1')
export class GraceApplicationsController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  @Post('exam-sessions/:id/grace-applications')
  @Auth('user')
  apply(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, CELL);
      const appId = await fileGrace(tx, p, id, b);
      await auditCell(tx, p, 'grace_application.created', 'grace_application', appId, { after: { category: b.category, marksRequested: b.marksRequested } });
      const [row] = await tx.select().from(graceApplications).where(eq(graceApplications.id, appId));
      return row;
    });
  }

  /** A student's own applications (the student, family or staff). */
  @Get('students/:studentId/grace-applications')
  @Auth('user')
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL_READ);
      return tx
        .select({ id: graceApplications.id, session: examSessions.name, subject: subjects.name, category: graceApplications.category, marksRequested: graceApplications.marksRequested, marksApproved: graceApplications.marksApproved, status: graceApplications.status, decisionNote: graceApplications.decisionNote, createdAt: graceApplications.createdAt })
        .from(graceApplications)
        .innerJoin(examSessions, eq(examSessions.id, graceApplications.sessionId))
        .leftJoin(subjects, eq(subjects.id, graceApplications.subjectId))
        .where(eq(graceApplications.studentId, studentId))
        .orderBy(desc(graceApplications.createdAt));
    });
  }

  @Post('grace-applications/:id/decide')
  @HttpCode(200)
  @Auth('user', CELL)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (a.status !== 'requested') throw new ConflictException('This application is already decided');
      if (!b.approve && !b.note) throw new BadRequestException('Say why the application is not approved');
      const marksApproved = b.approve ? (b.marksApproved ?? a.marksRequested) : null;
      if (marksApproved !== null) {
        const limit = (await loadOfficeSettings(tx)).grace.maxPerSubject;
        if (marksApproved > limit) throw new BadRequestException(`At most ${limit} grace marks may be given in a subject`);
      }
      const status = b.approve ? 'approved' : 'rejected';
      const [row] = await tx.update(graceApplications).set({ status, marksApproved, decisionNote: b.note ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(graceApplications.id, id)).returning();
      await auditCell(tx, p, `grace_application.${status}`, 'grace_application', id, { before: { status: a.status, marksApproved: a.marksApproved }, after: { status, marksApproved }, data: { note: b.note ?? null } });
      return row;
    });
  }

  /** Adds the approved marks to the subject's external paper and re-grades the student; the application is locked. */
  @Post('grace-applications/:id/apply')
  @HttpCode(200)
  @Auth('user', CELL)
  applyMarks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (a.status !== 'approved') throw new ConflictException(a.status === 'applied' ? 'These grace marks are already applied' : 'Approve the application first');
      const s = await loadSession(tx, a.sessionId);
      if (s.status !== 'processed' && s.status !== 'published') throw new ConflictException(s.status === 'locked' ? 'The results are locked' : 'Process the results first');
      const subjectId = a.subjectId ?? (await this.weakestSubject(tx, a.sessionId, a.studentId));
      if (!subjectId) throw new ConflictException('The student has no result to add grace marks to');
      const [st] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, a.studentId));
      const papers = await tx.select().from(examPapers).where(and(eq(examPapers.sessionId, a.sessionId), eq(examPapers.subjectId, subjectId)));
      const paper = papers.find((x) => x.sectionId === st.sectionId) ?? papers[0];
      if (!paper?.assessmentId) throw new ConflictException('That subject has no exam paper with marks');
      const [m] = await tx.select().from(marks).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, a.studentId)));
      if (!m || m.absent || m.marks === null || m.code) throw new ConflictException('Grace marks are not given to an absentee or a cancelled paper');
      const base = m.moderatedMarks ?? m.marks;
      const add = Math.min(a.marksApproved ?? 0, paper.maxMarks - base);
      if (add <= 0) throw new ConflictException('The paper is already at its maximum');
      await tx.update(marks).set({ moderatedMarks: base + add, moderationNote: `Grace (${a.category}) +${add}` }).where(and(eq(marks.assessmentId, paper.assessmentId), eq(marks.studentId, a.studentId)));
      await tx
        .insert(graceAwards)
        .values({ tenantId: p.tenantId, sessionId: a.sessionId, studentId: a.studentId, subjectId, marks: add, appliedBy: p.userId })
        .onConflictDoUpdate({ target: [graceAwards.sessionId, graceAwards.studentId, graceAwards.subjectId], set: { marks: sql`${graceAwards.marks} + ${add}`, appliedBy: p.userId, appliedAt: new Date() } });
      if (s.status === 'published') await reviseResult(tx, this.exams, p.tenantId, p.userId, s, a.studentId, 'grace', `Grace marks (${a.category}) +${add}`);
      else {
        const [res] = await this.exams.compute(tx, s, a.studentId);
        if (res) await this.exams.store(tx, p.tenantId, s, [res]);
      }
      const [row] = await tx.update(graceApplications).set({ status: 'applied', subjectId, appliedAt: new Date() }).where(eq(graceApplications.id, id)).returning();
      await auditCell(tx, p, 'grace_application.applied', 'grace_application', id, { before: { status: 'approved' }, after: { status: 'applied' }, data: { subjectId, marks: add, from: base, to: base + add } });
      return row;
    });
  }

  private async load(tx: Tx, id: string) {
    const [a] = await tx.select().from(graceApplications).where(eq(graceApplications.id, id));
    if (!a) throw new NotFoundException('Application not found');
    return a;
  }

  /** The subject where grace helps most: a failed one with the highest percent, else the lowest. */
  private async weakestSubject(tx: Tx, sessionId: string, studentId: string): Promise<string | null> {
    const lines = await tx
      .select({ subjectId: examResultLines.subjectId, percent: examResultLines.percent, passed: examResultLines.passed })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .where(and(eq(examResults.sessionId, sessionId), eq(examResults.studentId, studentId)));
    const failed = lines.filter((l) => !l.passed).sort((a, b) => b.percent - a.percent);
    if (failed.length) return failed[0].subjectId;
    return lines.sort((a, b) => a.percent - b.percent)[0]?.subjectId ?? null;
  }
}

/** Grace applications as a record kit list. Only an application still waiting may be changed or deleted. */
export function graceEntity(): RecordEntity {
  const waiting = async (tx: Tx, id: string) => (await tx.select({ s: graceApplications.status }).from(graceApplications).where(eq(graceApplications.id, id)))[0]?.s === 'requested';
  /** A decided application is locked: its values change only while it waits. */
  const whileWaiting = (key: 'subjectId' | 'category' | 'marksRequested' | 'evidence') => async (ctx: KitCtx, id: string, value: unknown) => {
    if (!(await waiting(ctx.tx, id))) throw new ConflictException('A decided application cannot be changed');
    await ctx.tx.update(graceApplications).set({ [key]: value }).where(eq(graceApplications.id, id));
  };
  return {
    key: 'grace-applications',
    module: 'exams',
    table: graceApplications,
    subjectType: 'grace_application',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.rollNo ?? '')} ${String(r.studentName ?? '')}: ${String(r.category ?? '')}`.trim(),
    list: {
      select: { id: graceApplications.id, sessionId: graceApplications.sessionId, sessionName: examSessions.name, studentId: graceApplications.studentId, studentName: students.fullName, rollNo: students.rollNo, subjectId: graceApplications.subjectId, subjectName: subjects.name, category: graceApplications.category, marksRequested: graceApplications.marksRequested, marksApproved: graceApplications.marksApproved, evidence: graceApplications.evidence, status: graceApplications.status, decisionNote: graceApplications.decisionNote, createdAt: graceApplications.createdAt, appliedAt: graceApplications.appliedAt },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, graceApplications.sessionId)).innerJoin(students, eq(students.id, graceApplications.studentId)).leftJoin(subjects, eq(subjects.id, graceApplications.subjectId)),
      search: [students.fullName, students.rollNo, graceApplications.evidence],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(graceApplications.sessionId, v) },
        status: { label: 'Status', options: ['requested', 'approved', 'rejected', 'applied'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), where: (v) => (['requested', 'approved', 'rejected', 'applied'].includes(v) ? eq(graceApplications.status, v) : undefined) },
        category: { label: 'Category', options: categoryOptions, where: (v) => ((GRACE_CATEGORIES as readonly string[]).includes(v) ? eq(graceApplications.category, v) : undefined) },
      },
      sorts: { student: students.fullName, roll: students.rollNo, session: examSessions.name, created: graceApplications.createdAt, status: graceApplications.status, marks: graceApplications.marksRequested },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, column: graceApplications.sessionId, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx) },
      studentId: { label: 'Student', type: 'select', schema: Ref, column: graceApplications.studentId, required: true, edit: false, options: studentOptions },
      subjectId: { label: 'Subject', type: 'select', schema: OptionalRef, apply: whileWaiting('subjectId'), help: 'Leave empty to place the marks where they help most', options: async (ctx) => (await ctx.tx.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects).orderBy(subjects.code)).map((x) => ({ value: x.id, label: `${x.code} ${x.name}` })) },
      category: { label: 'Category', type: 'select', schema: z.enum(GRACE_CATEGORIES), apply: whileWaiting('category'), required: true, options: categoryOptions },
      marksRequested: { label: 'Marks asked for', type: 'number', schema: z.coerce.number().positive().max(50), apply: whileWaiting('marksRequested'), required: true },
      evidence: { label: 'Evidence', type: 'textarea', schema: z.string().trim().min(3).max(1000), apply: whileWaiting('evidence'), required: true, help: 'The certificate or event: what it is, its date and who issued it' },
    },
    create: async (ctx, v) => fileGrace(ctx.tx, ctx.p, String(v.sessionId), { studentId: String(v.studentId), subjectId: (v.subjectId as string | null) ?? null, category: v.category as (typeof GRACE_CATEGORIES)[number], marksRequested: Number(v.marksRequested), evidence: String(v.evidence) }),
    remove: { guard: async (ctx, id) => ((await waiting(ctx.tx, id)) ? null : 'Only an application still waiting for a decision can be deleted') },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'sessionName', header: 'Exam session' },
      { key: 'category', header: 'Category' },
      { key: 'subjectName', header: 'Subject' },
      { key: 'marksRequested', header: 'Asked' },
      { key: 'marksApproved', header: 'Approved' },
      { key: 'status', header: 'Status' },
      { key: 'evidence', header: 'Evidence' },
      { key: 'decisionNote', header: 'Decision note' },
    ],
  };
}

@Injectable()
export class GraceRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}
  onModuleInit(): void {
    this.registry.register(graceEntity());
  }
}
