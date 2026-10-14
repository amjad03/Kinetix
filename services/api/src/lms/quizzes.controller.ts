import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Logger, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { CodeRunnerClient, RUN_LANGUAGES, type RunLanguage } from '../code/code-runner.client.js';
import { DbService, type Tx } from '../db/db.service.js';
import { calendarEvents, campusEvents, eventRegistrations, homework, homeworkSubmissions, lmsItems, qbQuestions, sections, students, subjects } from '../db/schema.js';
import { homeworkExtensions, lmsItemProgress, lmsQuizAttempts, lmsQuizQuestions, lmsQuizzes, type QuizResult } from '../db/schema-life.js';
import { gradeAnswer, itemAccess, itemStats } from './lms-access.js';
import { LMS_STAFF, LmsService } from './lms.service.js';

const QuizBody = z
  .object({
    sectionId: z.uuid(),
    subjectId: z.uuid(),
    title: z.string().trim().min(3).max(200),
    instructions: z.string().trim().max(4000).default(''),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    durationMin: z.number().int().min(1).max(600).default(30),
    maxAttempts: z.number().int().min(1).max(10).default(1),
    drawCount: z.number().int().min(1).max(500).nullable().default(null),
    shuffle: z.boolean().default(true),
  })
  .refine((b) => b.closesAt > b.opensAt, { message: 'The quiz must close after it opens', path: ['closesAt'] });
const QuizPatch = z.object({ title: z.string().trim().min(3).max(200).optional(), instructions: z.string().trim().max(4000).optional(), opensAt: z.coerce.date().optional(), closesAt: z.coerce.date().optional(), durationMin: z.number().int().min(1).max(600).optional(), maxAttempts: z.number().int().min(1).max(10).optional(), drawCount: z.number().int().min(1).max(500).nullable().optional(), shuffle: z.boolean().optional() });
const Option = z.object({ text: z.string().trim().min(1).max(500), correct: z.boolean() });
const QuestionBody = z
  .object({
    kind: z.enum(['mcq', 'multi', 'short', 'code']),
    text: z.string().trim().min(3).max(4000),
    options: z.array(Option).max(10).default([]),
    answer: z.string().trim().max(500).default(''),
    marks: z.number().positive().max(100).default(1),
    language: z.enum(RUN_LANGUAGES).optional(),
    tests: z.array(z.object({ stdin: z.string().max(4000), expected: z.string().max(4000) })).max(20).default([]),
  })
  .superRefine((b, ctx) => {
    if ((b.kind === 'mcq' || b.kind === 'multi') && (b.options.length < 2 || !b.options.some((o) => o.correct))) ctx.addIssue({ code: 'custom', message: 'Give at least two options and mark the right one', path: ['options'] });
    if (b.kind === 'mcq' && b.options.filter((o) => o.correct).length > 1) ctx.addIssue({ code: 'custom', message: 'A single-choice question has one right option', path: ['options'] });
    if (b.kind === 'short' && !b.answer) ctx.addIssue({ code: 'custom', message: 'Give the accepted answer (separate alternatives with |)', path: ['answer'] });
    if (b.kind === 'code' && (!b.language || !b.tests.length)) ctx.addIssue({ code: 'custom', message: 'A coding question needs a language and at least one test', path: ['tests'] });
  });
const BankBody = z.object({ questionIds: z.array(z.uuid()).min(1).max(200) });
const AnswersBody = z.object({ answers: z.record(z.uuid(), z.union([z.string().max(20000), z.array(z.number().int().min(0).max(20))])) });
const MarkBody = z.object({ questionId: z.uuid(), marks: z.number().min(0).max(100) });

type Quiz = typeof lmsQuizzes.$inferSelect;
type Question = typeof lmsQuizQuestions.$inferSelect;

/** Fisher-Yates on a copy. */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A question as the student sees it: no answers, no tests' expected output. */
const forStudent = (q: Question) => ({ id: q.id, kind: q.kind, text: q.text, options: q.options.map((o) => o.text), marks: q.marks, language: q.language, sampleTests: q.tests.slice(0, 1).map((t) => ({ stdin: t.stdin })) });

/**
 * Online quizzes for a class and subject: questions written here or copied from the question bank, a pool that
 * draws some questions per attempt, a time limit and attempts, auto-marking of choice and short answers, coding
 * questions run against tests on the code runner (or left for the teacher), and item analysis afterwards. Also the
 * student's calendar of deadlines and the progress on course items.
 */
@Controller('v1/lms')
export class QuizzesController {
  private readonly log = new Logger('Quizzes');
  constructor(
    private readonly db: DbService,
    private readonly lms: LmsService,
    private readonly runner: CodeRunnerClient,
    private readonly clock: Clock,
  ) {}

  // ---- teachers -------------------------------------------------------------------------------------

  private async quiz(tx: Tx, p: UserPrincipal, id: string, lock = false): Promise<Quiz> {
    const q = tx.select().from(lmsQuizzes).where(eq(lmsQuizzes.id, id));
    const [quiz] = await (lock ? q.for('update') : q);
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.lms.assertManage(tx, p, quiz);
    return quiz;
  }

  @Post('quizzes')
  @Auth('user', [...LMS_STAFF])
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(QuizBody)) b: z.infer<typeof QuizBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lms.assertManage(tx, p, b);
      const [row] = await tx.insert(lmsQuizzes).values({ tenantId: p.tenantId, ...b, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.created', subjectType: 'lms_quiz', subjectId: row.id, after: { title: row.title }, data: { label: row.title } });
      return row;
    });
  }

  /** Quizzes of a class (or every class the teacher manages), with question and attempt counts. */
  @Get('quizzes')
  @Auth('user', [...LMS_STAFF])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ q: lmsQuizzes, section: sections.displayName, subject: subjects.name, questions: sql<number>`(select count(*)::int from lms_quiz_questions x where x.quiz_id = ${lmsQuizzes.id})`, attempts: sql<number>`(select count(*)::int from lms_quiz_attempts a where a.quiz_id = ${lmsQuizzes.id} and a.submitted_at is not null)`, toMark: sql<number>`(select count(*)::int from lms_quiz_attempts a where a.quiz_id = ${lmsQuizzes.id} and a.needs_marking)` })
        .from(lmsQuizzes)
        .innerJoin(sections, eq(sections.id, lmsQuizzes.sectionId))
        .innerJoin(subjects, eq(subjects.id, lmsQuizzes.subjectId))
        .where(sectionId && /^[0-9a-f-]{36}$/i.test(sectionId) ? eq(lmsQuizzes.sectionId, sectionId) : undefined)
        .orderBy(desc(lmsQuizzes.opensAt))
        .limit(300);
      const out = [];
      for (const r of rows) if (await this.lms.canManage(tx, p, r.q)) out.push({ ...r.q, section: r.section, subject: r.subject, questions: r.questions, attempts: r.attempts, toMark: r.toMark });
      return out;
    });
  }

  @Get('quizzes/:id')
  @Auth('user', [...LMS_STAFF])
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id);
      const questions = await tx.select().from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id)).orderBy(asc(lmsQuizQuestions.position));
      return { ...quiz, questions };
    });
  }

  @Patch('quizzes/:id')
  @Auth('user', [...LMS_STAFF])
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuizPatch)) b: z.infer<typeof QuizPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id, true);
      if (quiz.status === 'closed') throw new ConflictException('A closed quiz cannot be changed');
      if ((b.opensAt ?? quiz.opensAt) >= (b.closesAt ?? quiz.closesAt)) throw new BadRequestException('The quiz must close after it opens');
      const [row] = await tx.update(lmsQuizzes).set(b).where(eq(lmsQuizzes.id, id)).returning();
      const keys = Object.keys(b) as (keyof typeof b)[];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.updated', subjectType: 'lms_quiz', subjectId: id, before: Object.fromEntries(keys.map((k) => [k, quiz[k]])), after: Object.fromEntries(keys.map((k) => [k, row[k]])) });
      return row;
    });
  }

  @Post('quizzes/:id/questions')
  @Auth('user', [...LMS_STAFF])
  addQuestion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuestionBody)) b: z.infer<typeof QuestionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id, true);
      if (quiz.status !== 'draft') throw new ConflictException('Questions are fixed once the quiz is published');
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id));
      const [row] = await tx.insert(lmsQuizQuestions).values({ tenantId: p.tenantId, quizId: id, position: n.n, kind: b.kind, text: b.text, options: b.kind === 'mcq' || b.kind === 'multi' ? b.options : [], answer: b.answer, marks: b.marks, language: b.kind === 'code' ? b.language : null, tests: b.kind === 'code' ? b.tests : [] }).returning();
      await auditUser(tx, p, 'lms_quiz.question_added', 'lms_quiz', id, { questionId: row.id, kind: b.kind });
      return row;
    });
  }

  /** Copies approved choice and short-answer questions from the question bank into the quiz's pool. */
  @Post('quizzes/:id/questions/from-bank')
  @Auth('user', [...LMS_STAFF])
  fromBank(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BankBody)) b: z.infer<typeof BankBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id, true);
      if (quiz.status !== 'draft') throw new ConflictException('Questions are fixed once the quiz is published');
      const bank = await tx.select().from(qbQuestions).where(and(inArray(qbQuestions.id, b.questionIds), eq(qbQuestions.subjectId, quiz.subjectId)));
      const usable = bank.filter((q) => (q.options.length >= 2 && q.options.some((o) => o.correct)) || q.answer.trim());
      if (!usable.length) throw new ConflictException('None of these questions has options with a right answer or a model answer');
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id));
      const already = new Set((await tx.select({ q: lmsQuizQuestions.qbQuestionId }).from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id))).map((r) => r.q));
      const fresh = usable.filter((q) => !already.has(q.id));
      if (fresh.length)
        await tx.insert(lmsQuizQuestions).values(
          fresh.map((q, i) => {
            const choice = q.options.length >= 2 && q.options.some((o) => o.correct);
            const multi = q.options.filter((o) => o.correct).length > 1;
            return { tenantId: p.tenantId, quizId: id, position: n.n + i, qbQuestionId: q.id, kind: (choice ? (multi ? 'multi' : 'mcq') : 'short') as 'mcq', text: q.text, options: choice ? q.options : [], answer: choice ? '' : q.answer, marks: q.marks };
          }),
        );
      await auditUser(tx, p, 'lms_quiz.questions_from_bank', 'lms_quiz', id, { added: fresh.length });
      return { added: fresh.length, skipped: b.questionIds.length - fresh.length };
    });
  }

  @Delete('quiz-questions/:questionId')
  @Auth('user', [...LMS_STAFF])
  dropQuestion(@CurrentPrincipal() p: UserPrincipal, @Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [q] = await tx.select().from(lmsQuizQuestions).where(eq(lmsQuizQuestions.id, questionId));
      if (!q) throw new NotFoundException('Question not found');
      const quiz = await this.quiz(tx, p, q.quizId, true);
      if (quiz.status !== 'draft') throw new ConflictException('Questions are fixed once the quiz is published');
      await tx.delete(lmsQuizQuestions).where(eq(lmsQuizQuestions.id, questionId));
      await auditUser(tx, p, 'lms_quiz.question_removed', 'lms_quiz', quiz.id, { questionId });
      return { ok: true };
    });
  }

  @Post('quizzes/:id/publish')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id, true);
      if (quiz.status !== 'draft') throw new ConflictException(`This quiz is already ${quiz.status}`);
      const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id));
      if (!n.n) throw new ConflictException('Add questions first');
      if (quiz.drawCount && quiz.drawCount > n.n) throw new ConflictException(`The pool has ${n.n} questions; it cannot draw ${quiz.drawCount}`);
      const [row] = await tx.update(lmsQuizzes).set({ status: 'published' }).where(eq(lmsQuizzes.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.published', subjectType: 'lms_quiz', subjectId: id, changes: { status: { before: 'draft', after: 'published' } } });
      return row;
    });
  }

  @Post('quizzes/:id/close')
  @Auth('user', [...LMS_STAFF])
  @HttpCode(200)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id, true);
      if (quiz.status !== 'published') throw new ConflictException('Only a published quiz can be closed');
      // Attempts still open are submitted as they stand.
      const open = await tx.select().from(lmsQuizAttempts).where(and(eq(lmsQuizAttempts.quizId, id), sql`${lmsQuizAttempts.submittedAt} is null`));
      for (const a of open) await this.finish(tx, a, this.clock.now());
      const [row] = await tx.update(lmsQuizzes).set({ status: 'closed' }).where(eq(lmsQuizzes.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.closed', subjectType: 'lms_quiz', subjectId: id, changes: { status: { before: 'published', after: 'closed' } }, data: { autoSubmitted: open.length } });
      return row;
    });
  }

  /** Every attempt with the student, score and what still needs marking. */
  @Get('quizzes/:id/attempts')
  @Auth('user', [...LMS_STAFF])
  attempts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.quiz(tx, p, id);
      return tx
        .select({ id: lmsQuizAttempts.id, studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, attemptNo: lmsQuizAttempts.attemptNo, startedAt: lmsQuizAttempts.startedAt, submittedAt: lmsQuizAttempts.submittedAt, score: lmsQuizAttempts.score, maxScore: lmsQuizAttempts.maxScore, needsMarking: lmsQuizAttempts.needsMarking, answers: lmsQuizAttempts.answers, results: lmsQuizAttempts.results, questionIds: lmsQuizAttempts.questionIds })
        .from(lmsQuizAttempts)
        .innerJoin(students, eq(students.id, lmsQuizAttempts.studentId))
        .where(eq(lmsQuizAttempts.quizId, id))
        .orderBy(asc(students.rollNo), asc(lmsQuizAttempts.attemptNo));
    });
  }

  /** The teacher marks a short or coding answer the machine could not. */
  @Put('quiz-attempts/:attemptId/mark')
  @Auth('user', [...LMS_STAFF])
  mark(@CurrentPrincipal() p: UserPrincipal, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Body(new ZodBody(MarkBody)) b: z.infer<typeof MarkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(lmsQuizAttempts).where(eq(lmsQuizAttempts.id, attemptId)).for('update');
      if (!a) throw new NotFoundException('Attempt not found');
      await this.quiz(tx, p, a.quizId);
      if (!a.submittedAt) throw new ConflictException('This attempt is still in progress');
      if (!a.questionIds.includes(b.questionId)) throw new BadRequestException('That question is not in this attempt');
      const [q] = await tx.select().from(lmsQuizQuestions).where(eq(lmsQuizQuestions.id, b.questionId));
      if (b.marks > q.marks) throw new BadRequestException(`At most ${q.marks} marks`);
      const results: Record<string, QuizResult> = { ...a.results, [b.questionId]: { correct: b.marks >= q.marks, marks: b.marks, note: 'Marked by the teacher' } };
      const score = Object.values(results).reduce((s, r) => s + r.marks, 0);
      const needsMarking = a.questionIds.some((qid) => results[qid]?.correct === null);
      const [row] = await tx.update(lmsQuizAttempts).set({ results, score, needsMarking }).where(eq(lmsQuizAttempts.id, attemptId)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.answer_marked', subjectType: 'lms_quiz', subjectId: a.quizId, before: { marks: a.results[b.questionId]?.marks ?? null }, after: { marks: b.marks }, data: { attemptId, questionId: b.questionId } });
      return row;
    });
  }

  /** Item analysis: per question, how many answered, difficulty and discrimination; and the score spread. */
  @Get('quizzes/:id/analysis')
  @Auth('user', [...LMS_STAFF])
  analysis(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const quiz = await this.quiz(tx, p, id);
      const questions = await tx.select().from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id)).orderBy(asc(lmsQuizQuestions.position));
      const done = await tx.select().from(lmsQuizAttempts).where(and(eq(lmsQuizAttempts.quizId, id), isNotNull(lmsQuizAttempts.submittedAt)));
      const items = questions.map((q) => {
        const scores = done.filter((a) => a.results[q.id] && a.results[q.id].correct !== null).map((a) => ({ total: Number(a.score ?? 0), correct: !!a.results[q.id].correct }));
        return { questionId: q.id, position: q.position, kind: q.kind, text: q.text, marks: q.marks, ...itemStats(scores) };
      });
      const pct = done.filter((a) => a.maxScore).map((a) => (Number(a.score ?? 0) / Number(a.maxScore)) * 100);
      const bands = [0, 20, 40, 60, 80].map((lo) => ({ from: lo, to: lo + 20, n: pct.filter((x) => x >= lo && (lo === 80 ? x <= 100 : x < lo + 20)).length }));
      return { quizId: id, title: quiz.title, attempts: done.length, averagePct: pct.length ? Math.round(pct.reduce((s, x) => s + x, 0) / pct.length) : null, bands, items };
    });
  }

  // ---- students -------------------------------------------------------------------------------------

  private async student(tx: Tx, p: UserPrincipal): Promise<{ id: string; sectionId: string }> {
    const [s] = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
    if (!s) throw new ForbiddenException('Only a student can take a quiz');
    return s;
  }

  /** Published quizzes of the student's class with their attempts. */
  @Get('my-quizzes')
  @Auth('user', ['student'])
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.student(tx, p);
      const rows = await tx.select({ q: lmsQuizzes, subject: subjects.name }).from(lmsQuizzes).innerJoin(subjects, eq(subjects.id, lmsQuizzes.subjectId)).where(and(eq(lmsQuizzes.sectionId, s.sectionId), ne(lmsQuizzes.status, 'draft'))).orderBy(desc(lmsQuizzes.opensAt));
      const tries = rows.length ? await tx.select().from(lmsQuizAttempts).where(and(eq(lmsQuizAttempts.studentId, s.id), inArray(lmsQuizAttempts.quizId, rows.map((r) => r.q.id)))) : [];
      const now = this.clock.now();
      return rows.map(({ q, subject }) => {
        const mineQ = tries.filter((t) => t.quizId === q.id);
        const open = mineQ.find((t) => !t.submittedAt && t.dueAt > now);
        return { id: q.id, title: q.title, subject, instructions: q.instructions, opensAt: q.opensAt, closesAt: q.closesAt, durationMin: q.durationMin, maxAttempts: q.maxAttempts, status: q.status, canStart: q.status === 'published' && now >= q.opensAt && now < q.closesAt && (!!open || mineQ.length < q.maxAttempts), openAttemptId: open?.id ?? null, attempts: mineQ.filter((t) => t.submittedAt).map((t) => ({ id: t.id, attemptNo: t.attemptNo, score: t.score, maxScore: t.maxScore, needsMarking: t.needsMarking, submittedAt: t.submittedAt })) };
      });
    });
  }

  /** Starts an attempt (or resumes the open one): the questions are drawn and shuffled now, the clock starts. */
  @Post('quizzes/:id/start')
  @Auth('user', ['student'])
  @HttpCode(200)
  start(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.student(tx, p);
      const [quiz] = await tx.select().from(lmsQuizzes).where(and(eq(lmsQuizzes.id, id), eq(lmsQuizzes.sectionId, s.sectionId))).for('update');
      if (!quiz || quiz.status === 'draft') throw new NotFoundException('Quiz not found');
      const now = this.clock.now();
      if (quiz.status !== 'published' || now < quiz.opensAt || now >= quiz.closesAt) throw new ConflictException('This quiz is not open');
      const mine = await tx.select().from(lmsQuizAttempts).where(and(eq(lmsQuizAttempts.quizId, id), eq(lmsQuizAttempts.studentId, s.id))).orderBy(desc(lmsQuizAttempts.attemptNo));
      let attempt = mine.find((a) => !a.submittedAt && a.dueAt > now);
      if (!attempt) {
        // An attempt left open past its time is submitted as it stands first.
        for (const a of mine.filter((x) => !x.submittedAt)) await this.finish(tx, a, a.dueAt);
        if (mine.length >= quiz.maxAttempts) throw new ConflictException('You have used all your attempts');
        const pool = await tx.select({ id: lmsQuizQuestions.id }).from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, id)).orderBy(asc(lmsQuizQuestions.position));
        const order = quiz.shuffle || quiz.drawCount ? shuffled(pool) : pool;
        const picked = (quiz.drawCount ? order.slice(0, quiz.drawCount) : order).map((q) => q.id);
        const dueAt = new Date(Math.min(now.getTime() + quiz.durationMin * 60_000, quiz.closesAt.getTime()));
        [attempt] = await tx.insert(lmsQuizAttempts).values({ tenantId: p.tenantId, quizId: id, studentId: s.id, attemptNo: (mine[0]?.attemptNo ?? 0) + 1, questionIds: picked, startedAt: now, dueAt }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.attempt_started', subjectType: 'lms_quiz', subjectId: id, data: { attemptId: attempt.id } });
      }
      const qs = await tx.select().from(lmsQuizQuestions).where(inArray(lmsQuizQuestions.id, attempt.questionIds.length ? attempt.questionIds : [id]));
      return { attemptId: attempt.id, title: quiz.title, instructions: quiz.instructions, dueAt: attempt.dueAt, answers: attempt.answers, questions: attempt.questionIds.map((qid) => qs.find((q) => q.id === qid)!).filter(Boolean).map(forStudent) };
    });
  }

  /** Saves answers as the student goes (until the time is up). */
  @Put('quiz-attempts/:attemptId/answers')
  @Auth('user', ['student'])
  save(@CurrentPrincipal() p: UserPrincipal, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Body(new ZodBody(AnswersBody)) b: z.infer<typeof AnswersBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.ownAttempt(tx, p, attemptId);
      if (a.submittedAt) throw new ConflictException('This attempt is already submitted');
      if (this.clock.now() >= a.dueAt) throw new ConflictException('Time is up');
      const answers = Object.fromEntries(Object.entries(b.answers).filter(([k]) => a.questionIds.includes(k)));
      await tx.update(lmsQuizAttempts).set({ answers: { ...a.answers, ...answers } }).where(eq(lmsQuizAttempts.id, attemptId));
      return { saved: Object.keys(answers).length };
    });
  }

  /** Submits the attempt and marks what can be marked; answers after the time limit are not taken. */
  @Post('quiz-attempts/:attemptId/submit')
  @Auth('user', ['student'])
  @HttpCode(200)
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Body(new ZodBody(AnswersBody.partial())) b: Partial<z.infer<typeof AnswersBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.ownAttempt(tx, p, attemptId);
      if (a.submittedAt) throw new ConflictException('This attempt is already submitted');
      const now = this.clock.now();
      const late = now >= a.dueAt;
      const answers = late ? a.answers : { ...a.answers, ...Object.fromEntries(Object.entries(b.answers ?? {}).filter(([k]) => a.questionIds.includes(k))) };
      const row = await this.finish(tx, { ...a, answers }, late ? a.dueAt : now);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'lms_quiz.attempt_submitted', subjectType: 'lms_quiz', subjectId: a.quizId, data: { attemptId, score: row.score, late } });
      return { attemptId, score: row.score, maxScore: row.maxScore, needsMarking: row.needsMarking, results: Object.fromEntries(Object.entries(row.results).map(([k, r]) => [k, { correct: r.correct, marks: r.marks }])) };
    });
  }

  private async ownAttempt(tx: Tx, p: UserPrincipal, attemptId: string) {
    const s = await this.student(tx, p);
    const [a] = await tx.select().from(lmsQuizAttempts).where(and(eq(lmsQuizAttempts.id, attemptId), eq(lmsQuizAttempts.studentId, s.id))).for('update');
    if (!a) throw new NotFoundException('Attempt not found');
    return a;
  }

  /** Marks an attempt: choice and short answers here, code against its tests on the runner (or left to the teacher). */
  private async finish(tx: Tx, a: typeof lmsQuizAttempts.$inferSelect, at: Date) {
    const qs = await tx.select().from(lmsQuizQuestions).where(inArray(lmsQuizQuestions.id, a.questionIds.length ? a.questionIds : [a.quizId]));
    const results: Record<string, QuizResult> = {};
    for (const q of qs) {
      const given = a.answers[q.id];
      const g = gradeAnswer(q, given);
      if (g) results[q.id] = g;
      else results[q.id] = await this.runCode(q, typeof given === 'string' ? given : '');
    }
    const score = Object.values(results).reduce((s, r) => s + r.marks, 0);
    const maxScore = qs.reduce((s, q) => s + Number(q.marks), 0);
    const [row] = await tx.update(lmsQuizAttempts).set({ answers: a.answers, results, score, maxScore, needsMarking: Object.values(results).some((r) => r.correct === null), submittedAt: at }).where(eq(lmsQuizAttempts.id, a.id)).returning();
    return row;
  }

  /** Runs a coding answer against every test; all must print the expected output. Without a runner, a teacher marks it. */
  private async runCode(q: Question, source: string): Promise<QuizResult> {
    if (!source.trim()) return { correct: false, marks: 0, note: 'No answer' };
    if (!q.language || !RUN_LANGUAGES.includes(q.language as RunLanguage)) return { correct: null, marks: 0, note: 'To be marked by the teacher' };
    try {
      let passed = 0;
      for (const t of q.tests) {
        const out = await this.runner.run({ language: q.language as RunLanguage, source, stdin: t.stdin });
        if (out.status === 'ok' && out.stdout.trim() === t.expected.trim()) passed++;
      }
      const marks = Math.round((Number(q.marks) * passed) / Math.max(1, q.tests.length) * 100) / 100;
      return { correct: passed === q.tests.length, marks, note: `${passed} of ${q.tests.length} tests passed` };
    } catch (e) {
      this.log.warn(`Code question ${q.id} not run: ${(e as Error).message}`);
      return { correct: null, marks: 0, note: 'To be marked by the teacher' };
    }
  }

  // ---- the student's calendar and course progress ---------------------------------------------------

  /** Deadlines for a student between two dates: homework (with their extension), quizzes closing, events, exams. */
  @Get('my-calendar')
  @Auth('user', ['student', 'guardian'])
  calendar(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const kids = await this.lms.familyStudents(tx, p);
      const s = kids.find((k) => !studentId || k.id === studentId);
      if (!s) throw new NotFoundException('Student not found');
      const today = this.clock.now().toISOString().slice(0, 10);
      const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
      const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : new Date(Date.parse(`${f}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
      const hw = await tx
        .select({ id: homework.id, title: homework.title, subject: subjects.name, dueOn: sql<string>`coalesce(${homeworkExtensions.dueOn}, ${homework.dueOn})::text`, extended: sql<boolean>`${homeworkExtensions.dueOn} is not null`, submitted: sql<boolean>`${homeworkSubmissions.studentId} is not null` })
        .from(homework)
        .innerJoin(subjects, eq(subjects.id, homework.subjectId))
        .leftJoin(homeworkExtensions, and(eq(homeworkExtensions.homeworkId, homework.id), eq(homeworkExtensions.studentId, s.id)))
        .leftJoin(homeworkSubmissions, and(eq(homeworkSubmissions.homeworkId, homework.id), eq(homeworkSubmissions.studentId, s.id)))
        .where(and(eq(homework.sectionId, s.sectionId), sql`coalesce(${homeworkExtensions.dueOn}, ${homework.dueOn}) between ${f}::date and ${t}::date`));
      const quizzes = await tx.select({ id: lmsQuizzes.id, title: lmsQuizzes.title, subject: subjects.name, closesAt: lmsQuizzes.closesAt }).from(lmsQuizzes).innerJoin(subjects, eq(subjects.id, lmsQuizzes.subjectId)).where(and(eq(lmsQuizzes.sectionId, s.sectionId), eq(lmsQuizzes.status, 'published'), sql`${lmsQuizzes.closesAt}::date between ${f}::date and ${t}::date`));
      const events = await tx.select({ id: campusEvents.id, title: campusEvents.title, startsAt: campusEvents.startsAt }).from(eventRegistrations).innerJoin(campusEvents, eq(campusEvents.id, eventRegistrations.eventId)).where(and(eq(eventRegistrations.studentId, s.id), eq(eventRegistrations.status, 'registered'), eq(campusEvents.status, 'published'), sql`${campusEvents.startsAt}::date between ${f}::date and ${t}::date`));
      const exams = await tx.select({ id: calendarEvents.id, title: calendarEvents.title, startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn }).from(calendarEvents).where(and(eq(calendarEvents.kind, 'exam'), lte(calendarEvents.startsOn, t), gte(calendarEvents.endsOn, f)));
      const items = [
        ...hw.map((h) => ({ kind: 'homework' as const, id: h.id, title: h.title, subject: h.subject, date: h.dueOn, done: h.submitted, extended: h.extended })),
        ...quizzes.map((q) => ({ kind: 'quiz' as const, id: q.id, title: q.title, subject: q.subject, date: q.closesAt.toISOString().slice(0, 10), at: q.closesAt })),
        ...events.map((e) => ({ kind: 'event' as const, id: e.id, title: e.title, date: e.startsAt.toISOString().slice(0, 10), at: e.startsAt })),
        ...exams.map((e) => ({ kind: 'exam' as const, id: e.id, title: e.title, date: e.startsOn, until: e.endsOn })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return { studentId: s.id, from: f, to: t, items };
    });
  }

  /** The student opened an item (counted), or finished it (which unlocks what depends on it). */
  @Post('items/:id/progress')
  @Auth('user', ['student'])
  @HttpCode(200)
  progress(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ completed: z.boolean().default(false) }))) b: { completed: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.student(tx, p);
      const [item] = await tx.select({ item: lmsItems, sectionId: sql<string>`(select c.section_id from lms_modules m join lms_courses c on c.id = m.course_id where m.id = ${lmsItems.moduleId})` }).from(lmsItems).where(eq(lmsItems.id, id));
      if (!item || item.sectionId !== s.sectionId) throw new NotFoundException('Not found');
      const done = new Set((await tx.select({ i: lmsItemProgress.itemId }).from(lmsItemProgress).where(and(eq(lmsItemProgress.studentId, s.id), isNotNull(lmsItemProgress.completedAt)))).map((r) => r.i));
      const access = itemAccess(item.item, s.id, this.clock.now(), done);
      if (!access.visible) throw new NotFoundException('Not found');
      if (access.locked) throw new ConflictException('Finish the item before this one first');
      const now = this.clock.now();
      const [row] = await tx
        .insert(lmsItemProgress)
        .values({ tenantId: p.tenantId, itemId: id, studentId: s.id, firstViewedAt: now, lastViewedAt: now, completedAt: b.completed ? now : null })
        .onConflictDoUpdate({ target: [lmsItemProgress.itemId, lmsItemProgress.studentId], set: { views: sql`${lmsItemProgress.views} + 1`, lastViewedAt: now, ...(b.completed ? { completedAt: sql`coalesce(${lmsItemProgress.completedAt}, ${now.toISOString()}::timestamptz)` } : {}) } })
        .returning();
      return row;
    });
  }
}
