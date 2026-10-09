import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { asc, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { toCsv } from '../common/pdf.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { coSets, courseOutcomes, sections, subjects, surveyAnswers, surveyQuestions, surveyResponses, surveys, users } from '../db/schema.js';
import { hasRole } from '../placements/placements.access.js';
import { SurveysService } from './surveys.service.js';
import { acceptsAnswers, checkAnswers, inAudience, questionProblem, showIfProblem, summarize, type QuestionDef } from './survey-rules.js';

/** Builds and reads surveys. Teachers see only their own; the rest see every survey. */
export const SURVEY_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher', 'quality_officer'];
const SEE_ALL: RoleName[] = ['tenant_admin', 'principal', 'hod', 'quality_officer'];
/** Anyone in an audience can answer. */
const ANYONE: RoleName[] = [...SURVEY_ROLES, 'student', 'guardian', 'librarian', 'accountant', 'transport_manager', 'driver', 'hostel_warden', 'canteen_manager', 'store_keeper', 'admissions_officer', 'hr_manager', 'placement_officer', 'research_coordinator', 'grievance_officer', 'counsellor', 'icc_member', 'exam_controller', 'examiner', 'alumni'];

const QuestionBody = z.object({
  kind: z.enum(['single', 'multiple', 'rating', 'text']),
  prompt: z.string().trim().min(3).max(300),
  options: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  required: z.boolean().default(true),
  coId: z.uuid().optional(),
  /** Show only when an earlier question (1 is the first) was answered this way. */
  showIf: z.object({ ord: z.number().int().min(1).max(40), op: z.enum(['eq', 'neq', 'gte', 'lte', 'includes']), value: z.union([z.string().max(120), z.number()]) }).optional(),
});
const CreateBody = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(2000).default(''),
    audience: z.enum(['students', 'section', 'staff', 'guardians']),
    sectionId: z.uuid().optional(),
    anonymous: z.boolean().default(false),
    opensAt: z.coerce.date().optional(),
    closesAt: z.coerce.date().optional(),
    /** Opens by itself at opensAt. */
    autoPublish: z.boolean().default(false),
    /** Starts the next cycle this many days after this one closes. */
    repeatEveryDays: z.number().int().min(1).max(366).optional(),
    /** Surveys with the same key are cycles of one series. */
    seriesKey: z.string().trim().min(2).max(60).optional(),
    questions: z.array(QuestionBody).min(1).max(40),
  })
  .refine((b) => b.audience !== 'section' || !!b.sectionId, { message: 'Choose the section', path: ['sectionId'] })
  .refine((b) => !b.opensAt || !b.closesAt || b.closesAt > b.opensAt, { message: 'The closing time must be after the opening time', path: ['closesAt'] })
  .refine((b) => !b.autoPublish || (!!b.opensAt && !!b.closesAt), { message: 'A survey that opens by itself needs an opening and a closing time', path: ['opensAt'] })
  .refine((b) => !b.repeatEveryDays || b.autoPublish, { message: 'A repeating survey must open by itself', path: ['repeatEveryDays'] });
const AnswerBody = z.object({
  answers: z.array(z.object({ questionId: z.uuid(), choices: z.array(z.string().max(120)).max(12).optional(), rating: z.number().optional(), text: z.string().max(3000).optional() })).max(40),
});

type Survey = typeof surveys.$inferSelect;

/** Survey builder, audience-based answering, per-question results and CSV export (PRD 53). */
@Controller('v1/surveys')
export class SurveysController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SurveysService,
  ) {}

  private async load(tx: Tx, p: UserPrincipal, id: string): Promise<Survey> {
    const [s] = await tx.select().from(surveys).where(eq(surveys.id, id));
    if (!s || (!hasRole(p, SEE_ALL) && s.createdBy !== p.userId)) throw new NotFoundException('Survey not found');
    return s;
  }

  private questionsOf(tx: Tx, surveyId: string) {
    return tx.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId)).orderBy(asc(surveyQuestions.ord));
  }

  @Post()
  @Auth('user', SURVEY_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      for (const q of b.questions) {
        const problem = questionProblem(q);
        if (problem) throw new BadRequestException(problem);
      }
      if (b.sectionId) {
        const [sec] = await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, b.sectionId));
        if (!sec) throw new NotFoundException('Section not found');
      }
      const coIds = [...new Set(b.questions.map((q) => q.coId).filter((x): x is string => !!x))];
      if (coIds.length) {
        const found = await tx.select({ id: courseOutcomes.id }).from(courseOutcomes).where(inArray(courseOutcomes.id, coIds));
        if (found.length !== coIds.length) throw new NotFoundException('Course outcome not found');
      }
      const [s] = await tx
        .insert(surveys)
        .values({ tenantId: p.tenantId, title: b.title, description: b.description, audience: b.audience, sectionId: b.audience === 'section' ? b.sectionId : null, anonymous: b.anonymous, opensAt: b.opensAt ?? null, closesAt: b.closesAt ?? null, autoPublish: b.autoPublish, repeatEveryDays: b.repeatEveryDays ?? null, seriesKey: b.seriesKey ?? (b.repeatEveryDays ? b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) : null), createdBy: p.userId })
        .returning();
      const qs = await tx
        .insert(surveyQuestions)
        .values(b.questions.map((q, i) => ({ tenantId: p.tenantId, surveyId: s.id, ord: i + 1, kind: q.kind, prompt: q.prompt, options: q.options, required: q.required, coId: q.coId ?? null })))
        .returning();
      // Conditions are written against question numbers; store them against the new question ids.
      qs.sort((a, c) => a.ord - c.ord);
      for (const [i, q] of b.questions.entries()) {
        if (!q.showIf) continue;
        const earlier = qs.filter((x) => x.ord < i + 1).sort((a, c) => a.ord - c.ord);
        const ref = earlier.find((x) => x.ord === q.showIf!.ord);
        const cond = ref ? { questionId: ref.id, op: q.showIf.op, value: q.showIf.value } : null;
        const problem = cond ? showIfProblem({ showIf: cond }, earlier as QuestionDef[]) : 'A condition must refer to an earlier question';
        if (!cond || problem) throw new BadRequestException(problem ?? 'A condition must refer to an earlier question');
        await tx.update(surveyQuestions).set({ showIf: cond }).where(eq(surveyQuestions.id, qs[i].id));
        qs[i].showIf = cond;
      }
      await auditUser(tx, p, 'survey.created', 'survey', s.id, { audience: b.audience, anonymous: b.anonymous });
      return { ...s, questions: qs.sort((a, c) => a.ord - c.ord) };
    });
  }

  /** The active course outcomes a rating question can be tied to, for the survey builder's picker. */
  @Get('outcomes')
  @Auth('user', SURVEY_ROLES)
  outcomes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: courseOutcomes.id, code: courseOutcomes.code, statement: courseOutcomes.statement, subjectCode: subjects.code, subjectName: subjects.name })
        .from(courseOutcomes)
        .innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId))
        .innerJoin(subjects, eq(subjects.id, coSets.subjectId))
        .where(eq(coSets.status, 'active'))
        .orderBy(asc(subjects.code), asc(courseOutcomes.ord)),
    );
  }

  @Get()
  @Auth('user', SURVEY_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(surveys).orderBy(desc(surveys.createdAt));
      const mine = hasRole(p, SEE_ALL) ? rows : rows.filter((s) => s.createdBy === p.userId);
      const counts = await tx.select({ surveyId: surveyResponses.surveyId, n: count() }).from(surveyResponses).groupBy(surveyResponses.surveyId);
      const byId = new Map(counts.map((c) => [c.surveyId, c.n]));
      return mine.map((s) => ({ ...s, responses: byId.get(s.id) ?? 0 }));
    });
  }

  /** Open surveys addressed to me that I can still answer, with their questions. */
  @Get('mine')
  @Auth('user', ANYONE)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const who = await this.svc.respondent(tx, p);
      const now = this.svc.now();
      const open = (await tx.select().from(surveys).where(eq(surveys.status, 'open'))).filter((s) => acceptsAnswers(s, now) && inAudience(s, who));
      if (open.length === 0) return [];
      const done = new Set((await tx.select({ id: surveyResponses.surveyId }).from(surveyResponses).where(eq(surveyResponses.respondentId, p.userId))).map((r) => r.id));
      const qs = await tx.select().from(surveyQuestions).where(inArray(surveyQuestions.surveyId, open.map((s) => s.id))).orderBy(asc(surveyQuestions.ord));
      return open.map((s) => {
        const answered = done.has(s.id);
        return {
          id: s.id,
          title: s.title,
          description: s.description,
          anonymous: s.anonymous,
          closesAt: s.closesAt,
          answered,
          questions: answered ? [] : qs.filter((q) => q.surveyId === s.id).map((q) => ({ id: q.id, ord: q.ord, kind: q.kind, prompt: q.prompt, options: q.options, required: q.required, showIf: q.showIf })),
        };
      });
    });
  }

  /** Recurring series of surveys, with how many cycles each has run. */
  @Get('series')
  @Auth('user', SURVEY_ROLES)
  series(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(surveys).where(isNotNull(surveys.seriesKey));
      const mine = hasRole(p, SEE_ALL) ? rows : rows.filter((s) => s.createdBy === p.userId);
      const keys = [...new Set(mine.map((s) => s.seriesKey!))];
      return keys.map((key) => {
        const cycles = mine.filter((s) => s.seriesKey === key);
        return { key, title: cycles[0].title, cycles: cycles.length, closed: cycles.filter((s) => s.status === 'closed').length, repeatEveryDays: cycles[0].repeatEveryDays };
      });
    });
  }

  /** Each question across the cycles of a series: the average rating (or option counts) per cycle, and the change since the last cycle. */
  @Get('series/:key/trend')
  @Auth('user', SURVEY_ROLES)
  trend(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cycles = (await tx.select().from(surveys).where(eq(surveys.seriesKey, key)).orderBy(asc(surveys.createdAt))).filter((s) => hasRole(p, SEE_ALL) || s.createdBy === p.userId);
      if (cycles.length === 0) throw new NotFoundException('Survey series not found');
      return this.svc.trend(tx, key, cycles);
    });
  }

  /** Runs the scheduler now: opens surveys whose time has come and closes the ones that have ended. */
  @Post('schedule/run')
  @Auth('user', ['tenant_admin', 'principal', 'quality_officer'])
  @HttpCode(200)
  runSchedule(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.runSchedule(p.tenantId);
  }

  @Get(':id')
  @Auth('user', SURVEY_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ ...(await this.load(tx, p, id)), questions: await this.questionsOf(tx, id) }));
  }

  /** Opens a draft for answers and tells its audience. */
  @Post(':id/publish')
  @Auth('user', SURVEY_ROLES)
  @HttpCode(200)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, p, id);
      if (s.status !== 'draft') throw new ConflictException('Only a draft survey can be opened');
      if (s.closesAt && s.closesAt <= this.svc.now()) throw new ConflictException('The closing time has already passed');
      const [row] = await tx.update(surveys).set({ status: 'open' }).where(eq(surveys.id, id)).returning();
      await auditUser(tx, p, 'survey.opened', 'survey', id);
      await this.svc.notifyOpened(tx, row);
      return row;
    });
  }

  @Post(':id/close')
  @Auth('user', SURVEY_ROLES)
  @HttpCode(200)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, p, id);
      if (s.status !== 'open') throw new ConflictException('Only an open survey can be closed');
      return this.svc.close(tx, s, { type: 'user', id: p.userId });
    });
  }

  /** Submits my answers. One response per person; a second attempt is refused. */
  @Post(':id/responses')
  @Auth('user', ANYONE)
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AnswerBody)) b: z.infer<typeof AnswerBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(surveys).where(eq(surveys.id, id));
      const who = await this.svc.respondent(tx, p);
      if (!s || !inAudience(s, who)) throw new NotFoundException('Survey not found');
      if (!acceptsAnswers(s, this.svc.now())) throw new ConflictException('This survey is not accepting answers');
      const questions = await this.questionsOf(tx, id);
      const checked = checkAnswers(questions as QuestionDef[], b.answers);
      if (!checked.ok) throw new BadRequestException(checked.error);
      const [resp] = await tx.insert(surveyResponses).values({ tenantId: p.tenantId, surveyId: id, respondentId: p.userId }).onConflictDoNothing().returning();
      if (!resp) throw new ConflictException('You have already answered this survey');
      if (checked.answers.length) {
        await tx.insert(surveyAnswers).values(checked.answers.map((a) => ({ tenantId: p.tenantId, surveyId: id, questionId: a.questionId, responseId: s.anonymous ? null : resp.id, choices: a.choices, rating: a.rating, text: a.text })));
      }
      // Anonymous surveys audit that someone answered, never what or who in the answers.
      await auditUser(tx, p, 'survey.answered', 'survey', id);
      return { surveyId: id, submittedAt: resp.submittedAt };
    });
  }

  /** Per-question counts, average ratings and text answers. Anonymous surveys carry no respondent names. */
  @Get(':id/results')
  @Auth('user', SURVEY_ROLES)
  results(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, p, id);
      const qs = await this.questionsOf(tx, id);
      const answers = await tx.select().from(surveyAnswers).where(eq(surveyAnswers.surveyId, id));
      const [{ n }] = await tx.select({ n: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, id));
      const sums = summarize(qs as QuestionDef[], answers);
      return {
        survey: { id: s.id, title: s.title, status: s.status, anonymous: s.anonymous, audience: s.audience },
        responses: n,
        questions: sums.map((x) => ({ ...x, coId: qs.find((q) => q.id === x.questionId)?.coId ?? null })),
      };
    });
  }

  /** One row per answer: Respondent (blank for anonymous surveys), Question, Answer. */
  @Get(':id/export.csv')
  @Auth('user', SURVEY_ROLES)
  async exportCsv(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const rows = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, p, id);
      const qs = await this.questionsOf(tx, id);
      const answers = await tx
        .select({ a: surveyAnswers, name: users.fullName })
        .from(surveyAnswers)
        .leftJoin(surveyResponses, eq(surveyResponses.id, surveyAnswers.responseId))
        .leftJoin(users, eq(users.id, surveyResponses.respondentId))
        .where(eq(surveyAnswers.surveyId, id));
      await auditUser(tx, p, 'survey.exported', 'survey', id);
      const out: unknown[][] = [['Respondent', 'Question', 'Answer']];
      for (const q of qs) {
        for (const r of answers.filter((x) => x.a.questionId === q.id)) {
          const answer = q.kind === 'rating' ? r.a.rating : q.kind === 'text' ? r.a.text : r.a.choices.join('; ');
          out.push([s.anonymous ? '' : (r.name ?? ''), q.prompt, answer]);
        }
      }
      return out;
    });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="survey-results.csv"');
    res.end(toCsv(rows));
  }
}
