import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service.js';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { evalAllocations, evalMarks, evalQuestions, homework, homeworkSubmissions } from '../db/schema.js';
import { gradeSuggestions } from '../db/schema-assist.js';

const EXAMINER: RoleName[] = [...TEACHING_ROLES, 'examiner'];
const SENIOR: RoleName[] = ['tenant_admin', 'principal', 'hod'];
const Rubric = z.array(z.object({ criterion: z.string().trim().min(2).max(300), marks: z.number().positive().max(100) })).min(1).max(10);
const EvalSuggestBody = z.object({ questionId: z.uuid(), question: z.string().trim().min(3).max(2000), answerText: z.string().trim().min(1).max(8000), rubric: Rubric.optional() });
const HomeworkSuggestBody = z.object({ question: z.string().trim().min(3).max(2000), maxMarks: z.number().positive().max(100), answerText: z.string().trim().max(8000).optional(), rubric: Rubric.optional() });
const DecisionBody = z.object({ action: z.enum(['accept', 'edit', 'reject']), marks: z.number().min(0).max(1000).optional() });

/**
 * AI marking drafts for descriptive answers in on-screen evaluation and homework. A draft is never final:
 * it becomes a mark only when the examiner accepts or edits it, and a rejected draft changes nothing.
 */
@Controller('v1/grading-assist')
export class GradingAssistController {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiService,
  ) {}

  private act = (p: UserPrincipal) => ({ tenantId: p.tenantId, actorType: 'user' as const, actorId: p.userId });

  /** A draft for one question of the caller's own valuation. The marks are not entered until the draft is accepted. */
  @Post('evaluation/:allocationId/suggest')
  @HttpCode(200)
  @Auth('user', EXAMINER)
  async suggestEval(@CurrentPrincipal() p: UserPrincipal, @Param('allocationId', ParseUUIDPipe) allocationId: string, @Body(new ZodBody(EvalSuggestBody)) b: z.infer<typeof EvalSuggestBody>) {
    const q = await this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.ownAllocation(tx, p, allocationId);
      const [question] = await tx.select().from(evalQuestions).where(eq(evalQuestions.id, b.questionId));
      if (!question) throw new NotFoundException('Question not found');
      void a;
      return question;
    });
    const rubric = b.rubric ?? [{ criterion: 'Overall answer', marks: q.maxMarks }];
    if (rubric.reduce((n, r) => n + r.marks, 0) > q.maxMarks + 1e-9) throw new BadRequestException('The rubric adds up to more than the marks of the question');
    const out = await this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'gradeAssist', { question: b.question, answerText: b.answerText, rubric, maxMarks: q.maxMarks, language: 'en' }, { fresh: true });
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(gradeSuggestions)
        .values({ tenantId: p.tenantId, kind: 'eval', allocationId, questionId: q.id, maxMarks: q.maxMarks, suggestedMarks: out.result.total, rationale: out.result.rationale, criteria: out.result.criteria.map((c, n) => ({ criterion: c.criterion, max: rubric[n]?.marks ?? 0, awarded: c.awarded, comment: c.comment })), preview: out.meta.preview, requestedBy: p.userId })
        .returning();
      await audit(tx, { ...this.act(p), action: 'grading.suggested.v1', subjectType: 'grade_suggestion', subjectId: row.id, data: { kind: 'eval', preview: out.meta.preview } });
      return row;
    });
  }

  /** A draft for a homework submission; the answer is the student's typed text unless the teacher passes a transcription. */
  @Post('homework/:homeworkId/:studentId/suggest')
  @HttpCode(200)
  @Auth('user', EXAMINER)
  async suggestHomework(@CurrentPrincipal() p: UserPrincipal, @Param('homeworkId', ParseUUIDPipe) homeworkId: string, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(HomeworkSuggestBody)) b: z.infer<typeof HomeworkSuggestBody>) {
    const text = await this.db.withTenant(p.tenantId, async (tx) => {
      const [hw] = await tx.select().from(homework).where(eq(homework.id, homeworkId));
      if (!hw) throw new NotFoundException('Homework not found');
      if (hw.createdBy !== p.userId && !p.roles.some((r) => SENIOR.includes(r))) throw new ForbiddenException('Only the teacher who set this homework can use marking help');
      const [sub] = await tx.select({ text: homeworkSubmissions.text }).from(homeworkSubmissions).where(and(eq(homeworkSubmissions.homeworkId, homeworkId), eq(homeworkSubmissions.studentId, studentId)));
      if (!sub) throw new NotFoundException('Submission not found');
      return (b.answerText?.trim() || sub.text).trim();
    });
    if (!text) throw new BadRequestException('This submission has no typed answer. Type what the student wrote, or mark it yourself.');
    const rubric = b.rubric ?? [{ criterion: 'Overall answer', marks: b.maxMarks }];
    if (rubric.reduce((n, r) => n + r.marks, 0) > b.maxMarks + 1e-9) throw new BadRequestException('The rubric adds up to more than the marks of the question');
    const out = await this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'gradeAssist', { question: b.question, answerText: text.slice(0, 8000), rubric, maxMarks: b.maxMarks, language: 'en' }, { fresh: true });
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(gradeSuggestions)
        .values({ tenantId: p.tenantId, kind: 'homework', homeworkId, studentId, maxMarks: b.maxMarks, suggestedMarks: out.result.total, rationale: out.result.rationale, criteria: out.result.criteria.map((c, n) => ({ criterion: c.criterion, max: rubric[n]?.marks ?? 0, awarded: c.awarded, comment: c.comment })), preview: out.meta.preview, requestedBy: p.userId })
        .returning();
      await audit(tx, { ...this.act(p), action: 'grading.suggested.v1', subjectType: 'grade_suggestion', subjectId: row.id, data: { kind: 'homework', preview: out.meta.preview } });
      return row;
    });
  }

  /** The caller's drafts for one valuation or one homework. */
  @Get('suggestions')
  @Auth('user', EXAMINER)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('allocationId') allocationId?: string, @Query('homeworkId') homeworkId?: string) {
    const by = z.uuid();
    return this.db.withTenant(p.tenantId, (tx) => {
      const where = [eq(gradeSuggestions.requestedBy, p.userId)];
      if (allocationId && by.safeParse(allocationId).success) where.push(eq(gradeSuggestions.allocationId, allocationId));
      if (homeworkId && by.safeParse(homeworkId).success) where.push(eq(gradeSuggestions.homeworkId, homeworkId));
      return tx.select().from(gradeSuggestions).where(and(...where)).orderBy(desc(gradeSuggestions.createdAt)).limit(200);
    });
  }

  /** Accept the draft as it is, edit the marks, or reject it. Only an accepted or edited evaluation draft enters the valuation, and only while it is open. */
  @Put('suggestions/:id/decision')
  @Auth('user', EXAMINER)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(gradeSuggestions).where(and(eq(gradeSuggestions.id, id), eq(gradeSuggestions.requestedBy, p.userId))).for('update');
      if (!s) throw new NotFoundException('Draft not found');
      if (s.status !== 'draft') throw new ConflictException('This draft was already decided');
      let final: number | null = null;
      if (b.action === 'accept') final = s.suggestedMarks;
      if (b.action === 'edit') {
        if (b.marks === undefined) throw new BadRequestException('Enter the marks you are giving');
        if (b.marks > s.maxMarks) throw new BadRequestException(`The marks cannot be more than ${s.maxMarks}`);
        final = b.marks;
      }
      if (final !== null && s.kind === 'eval') {
        const a = await this.ownAllocation(tx, p, s.allocationId!);
        void a;
        await tx
          .insert(evalMarks)
          .values({ tenantId: p.tenantId, allocationId: s.allocationId!, questionId: s.questionId!, marks: final, comment: null })
          .onConflictDoUpdate({ target: [evalMarks.allocationId, evalMarks.questionId], set: { marks: final } });
      }
      const [row] = await tx
        .update(gradeSuggestions)
        .set({ status: b.action === 'accept' ? 'accepted' : b.action === 'edit' ? 'edited' : 'rejected', finalMarks: final, decidedBy: p.userId, decidedAt: new Date() })
        .where(eq(gradeSuggestions.id, id))
        .returning();
      await audit(tx, { ...this.act(p), action: `grading.${row.status}.v1`, subjectType: 'grade_suggestion', subjectId: id, data: { suggested: s.suggestedMarks, final } });
      return row;
    });
  }

  /** The caller's own, still open valuation. */
  private async ownAllocation(tx: Tx, p: UserPrincipal, id: string) {
    const [a] = await tx.select().from(evalAllocations).where(and(eq(evalAllocations.id, id), eq(evalAllocations.examinerId, p.userId)));
    if (!a) throw new NotFoundException('Valuation not found');
    if (a.status === 'submitted') throw new ConflictException('This valuation is already submitted');
    return a;
  }
}
