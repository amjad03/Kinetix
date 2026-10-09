import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { integrityFlags, reattemptRequests, rubricScores, rubrics } from '../db/schema-g1.js';
import { assessmentSchemes, students, subjects, users } from '../db/schema.js';
import { integritySeverity, nextAttempt, rubricMax, rubricProblems, scoreRubric, similarPairs } from './assessment-logic.js';

const STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher', 'exam_controller'];
const LEADS: RoleName[] = ['tenant_admin', 'principal', 'hod', 'exam_controller'];
const Criteria = z
  .array(z.object({ name: z.string().trim().min(1).max(100), levels: z.array(z.object({ label: z.string().trim().min(1).max(60), points: z.number().min(0).max(100), descriptor: z.string().trim().max(300).default('') })).min(2).max(8) }))
  .min(1)
  .max(15);
const RubricBody = z.object({ name: z.string().trim().min(2).max(120), scope: z.enum(['general', 'practical', 'project', 'viva', 'activity', 'essay']).default('general'), criteria: Criteria });
const ScoreBody = z.object({ studentId: z.uuid(), selections: z.array(z.number().int().min(0).max(7)).min(1).max(15), contextKind: z.string().trim().max(40).default('general'), contextId: z.uuid().nullable().optional() });
const ReattemptBody = z.object({ studentId: z.uuid().optional(), schemeId: z.uuid(), reason: z.string().trim().min(5).max(500) });
const DecideBody = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() });
const KINDS = ['tab_switch', 'fullscreen_exit', 'copy_paste', 'network_loss', 'manual', 'plagiarism_match'] as const;
const ReportBody = z.object({ contextKind: z.string().trim().min(2).max(40), contextId: z.uuid().nullable().optional(), kind: z.enum(KINDS).exclude(['manual', 'plagiarism_match']), details: z.record(z.string().max(40), z.union([z.string().max(200), z.number()])).default({}) });
const ManualBody = z.object({ studentId: z.uuid(), contextKind: z.string().trim().min(2).max(40), contextId: z.uuid().nullable().optional(), kind: z.enum(KINDS).default('manual'), severity: z.enum(['low', 'medium', 'high']).default('medium'), details: z.record(z.string().max(40), z.union([z.string().max(300), z.number()])).default({}) });
const ReviewBody = z.object({ status: z.enum(['dismissed', 'confirmed']), note: z.string().trim().min(3).max(500) });
const SimilarityBody = z.object({ contextKind: z.string().trim().min(2).max(40).default('assignment'), contextId: z.uuid().nullable().optional(), threshold: z.number().min(0.2).max(1).default(0.5), items: z.array(z.object({ studentId: z.uuid(), text: z.string().max(60_000) })).min(2).max(300) });

/** Reusable rubrics, reattempt requests and academic-integrity flags. */
@Controller('v1/assessment-tools')
export class AssessmentToolsController {
  constructor(private readonly db: DbService) {}

  // ---- rubrics -----------------------------------------------------------------------------------------------------------------

  @Get('rubrics')
  @Auth('user', STAFF)
  rubricList(@CurrentPrincipal() p: UserPrincipal, @Query('all') all?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(rubrics).where(all === 'true' ? undefined : eq(rubrics.archived, false)).orderBy(asc(rubrics.name));
      return rows.map((r) => ({ ...r, maxPoints: rubricMax(r.criteria) }));
    });
  }

  @Post('rubrics')
  @Auth('user', STAFF)
  addRubric(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RubricBody)) b: z.infer<typeof RubricBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const problems = rubricProblems(b.criteria);
      if (problems.length) throw new BadRequestException(problems.join('. '));
      const [dup] = await tx.select({ id: rubrics.id }).from(rubrics).where(eq(rubrics.name, b.name));
      if (dup) throw new ConflictException('A rubric with that name already exists');
      const [row] = await tx.insert(rubrics).values({ tenantId: p.tenantId, ...b, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'assessment.rubric.created', 'rubric', row.id, { name: b.name });
      return { ...row, maxPoints: rubricMax(row.criteria) };
    });
  }

  @Put('rubrics/:id')
  @Auth('user', STAFF)
  saveRubric(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RubricBody)) b: z.infer<typeof RubricBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const problems = rubricProblems(b.criteria);
      if (problems.length) throw new BadRequestException(problems.join('. '));
      const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(rubricScores).where(eq(rubricScores.rubricId, id));
      if (used.n > 0) throw new ConflictException('This rubric has been used for marking. Archive it and make a new one so past marks stay true.');
      const [row] = await tx.update(rubrics).set(b).where(eq(rubrics.id, id)).returning();
      if (!row) throw new NotFoundException('Rubric not found');
      await auditUser(tx, p, 'assessment.rubric.updated', 'rubric', id);
      return { ...row, maxPoints: rubricMax(row.criteria) };
    });
  }

  @Post('rubrics/:id/archive')
  @Auth('user', LEADS)
  @HttpCode(200)
  archiveRubric(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(rubrics).set({ archived: true }).where(eq(rubrics.id, id)).returning({ id: rubrics.id });
      if (!row) throw new NotFoundException('Rubric not found');
      await auditUser(tx, p, 'assessment.rubric.archived', 'rubric', id);
      return { ok: true };
    });
  }

  /** Marks one student with a rubric: a level per criterion, totalled. */
  @Post('rubrics/:id/score')
  @Auth('user', STAFF)
  score(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScoreBody)) b: z.infer<typeof ScoreBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(rubrics).where(eq(rubrics.id, id));
      if (!r || r.archived) throw new NotFoundException('Rubric not found');
      const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId));
      if (!st) throw new NotFoundException('Student not found');
      let out: { total: number; max: number };
      try {
        out = scoreRubric(r.criteria, b.selections);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      const [row] = await tx.insert(rubricScores).values({ tenantId: p.tenantId, rubricId: id, studentId: b.studentId, contextKind: b.contextKind, contextId: b.contextId ?? null, selections: b.selections, total: out.total, maxTotal: out.max, scoredBy: p.userId }).returning();
      await auditUser(tx, p, 'assessment.rubric.scored', 'rubric', id, { studentId: b.studentId, total: out.total });
      return row;
    });
  }

  @Get('rubrics/:id/scores')
  @Auth('user', STAFF)
  scores(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: rubricScores.id, studentId: rubricScores.studentId, fullName: students.fullName, total: rubricScores.total, maxTotal: rubricScores.maxTotal, contextKind: rubricScores.contextKind, scoredAt: rubricScores.scoredAt })
        .from(rubricScores)
        .innerJoin(students, eq(students.id, rubricScores.studentId))
        .where(and(eq(rubricScores.rubricId, id), studentId ? eq(rubricScores.studentId, z.uuid().parse(studentId)) : undefined))
        .orderBy(desc(rubricScores.scoredAt))
        .limit(300),
    );
  }

  // ---- reattempts ---------------------------------------------------------------------------------------------------------------

  private async ownStudent(tx: Tx, p: UserPrincipal, studentId?: string) {
    if (p.roles.includes('student') && !p.roles.some((r) => STAFF.includes(r))) {
      const [me] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
      if (!me) throw new NotFoundException('Student not found');
      return me.id;
    }
    if (!studentId) throw new BadRequestException('Say which student');
    const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
    if (!st) throw new NotFoundException('Student not found');
    return st.id;
  }

  /** A student (or staff for them) asks for another attempt; refused when the assessment allows no more. */
  @Post('reattempts')
  @Auth('user', [...STAFF, 'student'])
  requestReattempt(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReattemptBody)) b: z.infer<typeof ReattemptBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const studentId = await this.ownStudent(tx, p, b.studentId);
      const [scheme] = await tx.select().from(assessmentSchemes).where(eq(assessmentSchemes.id, b.schemeId));
      if (!scheme) throw new NotFoundException('Assessment not found');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(reattemptRequests).where(and(eq(reattemptRequests.studentId, studentId), eq(reattemptRequests.schemeId, b.schemeId), ne(reattemptRequests.status, 'rejected')));
      const next = nextAttempt(1 + n, scheme.maxAttempts);
      if (!next.ok) throw new ConflictException(next.reason);
      const [pending] = await tx.select({ id: reattemptRequests.id }).from(reattemptRequests).where(and(eq(reattemptRequests.studentId, studentId), eq(reattemptRequests.schemeId, b.schemeId), eq(reattemptRequests.status, 'pending')));
      if (pending) throw new ConflictException('A request for this assessment is already waiting for a decision');
      const [row] = await tx.insert(reattemptRequests).values({ tenantId: p.tenantId, studentId, schemeId: b.schemeId, attemptNo: next.attemptNo, reason: b.reason }).returning();
      await auditUser(tx, p, 'assessment.reattempt.requested', 'reattempt_request', row.id, { schemeId: b.schemeId, attemptNo: next.attemptNo });
      return row;
    });
  }

  @Get('reattempts')
  @Auth('user', [...STAFF, 'student'])
  reattempts(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const staff = p.roles.some((r) => STAFF.includes(r));
      const mine = staff ? undefined : eq(reattemptRequests.studentId, await this.ownStudent(tx, p));
      const rows = await tx
        .select({ r: reattemptRequests, fullName: students.fullName, rollNo: students.rollNo, scheme: assessmentSchemes.name, subject: subjects.name })
        .from(reattemptRequests)
        .innerJoin(students, eq(students.id, reattemptRequests.studentId))
        .innerJoin(assessmentSchemes, eq(assessmentSchemes.id, reattemptRequests.schemeId))
        .innerJoin(subjects, eq(subjects.id, assessmentSchemes.subjectId))
        .where(and(mine, status && ['pending', 'approved', 'rejected'].includes(status) ? eq(reattemptRequests.status, status as 'pending') : undefined))
        .orderBy(desc(reattemptRequests.createdAt))
        .limit(300);
      return rows.map((x) => ({ ...x.r, fullName: x.fullName, rollNo: x.rollNo, scheme: x.scheme, subject: x.subject }));
    });
  }

  @Post('reattempts/:id/decide')
  @Auth('user', LEADS)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(reattemptRequests).where(eq(reattemptRequests.id, id)).for('update');
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new ConflictException('This request was already decided');
      const [row] = await tx.update(reattemptRequests).set({ status: b.decision, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.note ?? null }).where(eq(reattemptRequests.id, id)).returning();
      await auditUser(tx, p, `assessment.reattempt.${b.decision}`, 'reattempt_request', id, { studentId: r.studentId });
      return row;
    });
  }

  // ---- academic integrity -------------------------------------------------------------------------------------------------------

  /** The exam or assignment screen reports an event for the signed-in student (a tab switch, leaving full screen, a paste). */
  @Post('integrity/report')
  @Auth('user', ['student'])
  @HttpCode(200)
  report(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReportBody)) b: z.infer<typeof ReportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const studentId = await this.ownStudent(tx, p);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(integrityFlags).where(and(eq(integrityFlags.studentId, studentId), eq(integrityFlags.contextKind, b.contextKind), b.contextId ? eq(integrityFlags.contextId, b.contextId) : undefined));
      const [row] = await tx.insert(integrityFlags).values({ tenantId: p.tenantId, studentId, contextKind: b.contextKind, contextId: b.contextId ?? null, kind: b.kind, severity: integritySeverity(b.kind, n), details: b.details }).returning({ id: integrityFlags.id, severity: integrityFlags.severity });
      return row;
    });
  }

  @Post('integrity/flags')
  @Auth('user', STAFF)
  flag(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ManualBody)) b: z.infer<typeof ManualBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const studentId = await this.ownStudent(tx, p, b.studentId);
      const [row] = await tx.insert(integrityFlags).values({ tenantId: p.tenantId, ...b, studentId, contextId: b.contextId ?? null }).returning();
      await auditUser(tx, p, 'assessment.integrity.flagged', 'integrity_flag', row.id, { studentId, kind: b.kind });
      return row;
    });
  }

  @Get('integrity/flags')
  @Auth('user', STAFF)
  flags(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ f: integrityFlags, fullName: students.fullName, rollNo: students.rollNo, reviewer: users.fullName })
        .from(integrityFlags)
        .innerJoin(students, eq(students.id, integrityFlags.studentId))
        .leftJoin(users, eq(users.id, integrityFlags.reviewedBy))
        .where(and(status && ['open', 'dismissed', 'confirmed'].includes(status) ? eq(integrityFlags.status, status as 'open') : undefined, studentId ? eq(integrityFlags.studentId, z.uuid().parse(studentId)) : undefined))
        .orderBy(desc(integrityFlags.createdAt))
        .limit(300);
      return rows.map((x) => ({ ...x.f, fullName: x.fullName, rollNo: x.rollNo, reviewer: x.reviewer }));
    });
  }

  @Post('integrity/flags/:id/review')
  @Auth('user', LEADS)
  @HttpCode(200)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [f] = await tx.select().from(integrityFlags).where(eq(integrityFlags.id, id)).for('update');
      if (!f) throw new NotFoundException('Flag not found');
      if (f.status !== 'open') throw new ConflictException('This flag was already reviewed');
      const [row] = await tx.update(integrityFlags).set({ status: b.status, reviewedBy: p.userId, reviewedAt: new Date(), reviewNote: b.note }).where(eq(integrityFlags.id, id)).returning();
      await auditUser(tx, p, `assessment.integrity.${b.status}`, 'integrity_flag', id, { studentId: f.studentId });
      return row;
    });
  }

  /** Compares submitted texts pairwise and raises a flag for each pair that overlaps too much. */
  @Post('integrity/similarity')
  @Auth('user', STAFF)
  @HttpCode(200)
  similarity(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SimilarityBody)) b: z.infer<typeof SimilarityBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pairs = similarPairs(b.items, b.threshold);
      for (const pair of pairs) {
        for (const [who, other] of [[pair.a, pair.b], [pair.b, pair.a]] as const) {
          await tx.insert(integrityFlags).values({ tenantId: p.tenantId, studentId: who, contextKind: b.contextKind, contextId: b.contextId ?? null, kind: 'plagiarism_match', severity: pair.score >= 0.8 ? 'high' : 'medium', details: { with: other, score: pair.score } });
        }
      }
      await auditUser(tx, p, 'assessment.integrity.similarity', 'tenant', p.tenantId, { checked: b.items.length, pairs: pairs.length });
      return { checked: b.items.length, pairs };
    });
  }
}
