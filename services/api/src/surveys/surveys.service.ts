import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, asc, count, eq, gte, inArray, isNotNull, lte, notInArray } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { guardians, students, surveyAnswers, surveyQuestions, surveyResponses, surveys, userRoles } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { UserPrincipal } from '../auth/principal.js';
import { summarize, type QuestionDef, type QuestionSummary, type Respondent } from './survey-rules.js';

export const SURVEY_AUTOCLOSE = 'surveys.autoclose';
export const SURVEY_SCHEDULE = 'surveys.schedule';
const DAY_MS = 86_400_000;

type Survey = typeof surveys.$inferSelect;

/** Audience lookups, closing, and the daily job that closes surveys whose window has ended. */
@Injectable()
export class SurveysService implements OnModuleInit {
  private readonly log = new Logger(SurveysService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(SURVEY_AUTOCLOSE, (job: Job) => this.closeExpired(job.tenantId).then(() => undefined));
    this.jobs.registerHourly(SURVEY_SCHEDULE, (job: Job) => this.runSchedule(job.tenantId).then(() => undefined));
  }

  now() {
    return this.clock.now();
  }

  /** What the survey rules need to know about the signed-in user. */
  async respondent(tx: Tx, p: UserPrincipal): Promise<Respondent> {
    const [s] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.userId, p.userId));
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(eq(guardians.userId, p.userId)).limit(1);
    return { roles: p.roles, studentSectionId: s?.sectionId ?? null, isStudent: !!s, isGuardian: !!g };
  }

  /** The users a survey is for. */
  async audienceUsers(tx: Tx, s: Pick<Survey, 'audience' | 'sectionId'>): Promise<string[]> {
    let ids: (string | null)[] = [];
    if (s.audience === 'students' || s.audience === 'section') {
      const rows = await tx
        .select({ id: students.userId })
        .from(students)
        .where(and(isNotNull(students.userId), s.audience === 'section' && s.sectionId ? eq(students.sectionId, s.sectionId) : undefined));
      ids = rows.map((r) => r.id);
    } else if (s.audience === 'guardians') {
      ids = (await tx.select({ id: guardians.userId }).from(guardians)).map((r) => r.id);
    } else {
      ids = (await tx.select({ id: userRoles.userId }).from(userRoles).where(notInArray(userRoles.role, ['student', 'guardian']))).map((r) => r.id);
    }
    return [...new Set(ids.filter((x): x is string => !!x))];
  }

  async notifyOpened(tx: Tx, s: Survey): Promise<void> {
    await this.notifications.notifyUsers(tx, await this.audienceUsers(tx, s), { kind: 'survey', text: { title: 'A survey needs your answer', body: s.title }, data: { surveyId: s.id }, dedupeKey: `survey:open:${s.id}` });
  }

  /** Closes an open survey, writes the audit entry and announces `surveys.closed`. */
  async close(tx: Tx, s: Survey, actor: { type: 'user' | 'system'; id?: string }): Promise<Survey> {
    const now = this.clock.now();
    const [row] = await tx.update(surveys).set({ status: 'closed', closedAt: now }).where(eq(surveys.id, s.id)).returning();
    const [{ n }] = await tx.select({ n: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, s.id));
    await audit(tx, { tenantId: s.tenantId, actorType: actor.type, actorId: actor.id, action: 'survey.closed', subjectType: 'survey', subjectId: s.id });
    await this.events.emit(tx, s.tenantId, { type: DomainEvents.SurveyClosed, aggregateType: 'survey', aggregateId: s.id, actorId: actor.id, payload: { title: s.title, audience: s.audience, anonymous: s.anonymous, responses: n } });
    if (row.autoPublish && row.repeatEveryDays && row.seriesKey) await this.nextCycle(tx, row);
    return row;
  }

  /** Closes open surveys whose closing time has passed. Returns their ids. */
  async closeExpired(tenantId: string): Promise<string[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const due = await tx.select().from(surveys).where(and(inArray(surveys.status, ['open']), lte(surveys.closesAt, this.clock.now())));
      for (const s of due) await this.close(tx, s, { type: 'system' });
      if (due.length) this.log.log(`Closed ${due.length} survey(s) for ${tenantId}`);
      return due.map((s) => s.id);
    });
  }

  /**
   * The next cycle of a repeating survey: a copy (questions and conditions included) that opens by itself
   * `repeatEveryDays` after this one closed, for as long as this one ran. Never makes two for the same slot.
   */
  async nextCycle(tx: Tx, s: Survey): Promise<string | null> {
    const now = this.clock.now();
    const step = s.repeatEveryDays! * DAY_MS;
    const length = s.opensAt && s.closesAt ? s.closesAt.getTime() - s.opensAt.getTime() : 7 * DAY_MS;
    let opens = (s.closesAt ?? now).getTime() + step;
    while (opens < now.getTime()) opens += step;
    const [dup] = await tx.select({ id: surveys.id }).from(surveys).where(and(eq(surveys.seriesKey, s.seriesKey!), eq(surveys.status, 'draft'), gte(surveys.opensAt, new Date((s.closesAt ?? now).getTime()))));
    if (dup) return null;
    const [next] = await tx
      .insert(surveys)
      .values({ tenantId: s.tenantId, title: s.title, description: s.description, audience: s.audience, sectionId: s.sectionId, anonymous: s.anonymous, opensAt: new Date(opens), closesAt: new Date(opens + length), autoPublish: true, repeatEveryDays: s.repeatEveryDays, seriesKey: s.seriesKey, createdBy: s.createdBy })
      .returning();
    const qs = await tx.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, s.id)).orderBy(asc(surveyQuestions.ord));
    const idMap = new Map<string, string>();
    for (const q of qs) {
      const [c] = await tx
        .insert(surveyQuestions)
        .values({ tenantId: s.tenantId, surveyId: next.id, ord: q.ord, kind: q.kind, prompt: q.prompt, options: q.options, required: q.required, coId: q.coId, showIf: q.showIf ? { ...q.showIf, questionId: idMap.get(q.showIf.questionId) ?? q.showIf.questionId } : null })
        .returning({ id: surveyQuestions.id });
      idMap.set(q.id, c.id);
    }
    await audit(tx, { tenantId: s.tenantId, actorType: 'system', action: 'survey.cycle_created', subjectType: 'survey', subjectId: next.id, data: { from: s.id } });
    return next.id;
  }

  /** Opens scheduled surveys whose opening time has come, then closes the ones that ended (which may queue their next cycle). */
  async runSchedule(tenantId: string): Promise<{ opened: string[]; closed: string[] }> {
    const closed = await this.closeExpired(tenantId);
    const opened = await this.db.withTenant(tenantId, async (tx) => {
      const now = this.clock.now();
      const due = await tx.select().from(surveys).where(and(eq(surveys.status, 'draft'), eq(surveys.autoPublish, true), lte(surveys.opensAt, now)));
      const ids: string[] = [];
      for (const s of due) {
        if (s.closesAt && s.closesAt <= now) continue;
        const [row] = await tx.update(surveys).set({ status: 'open' }).where(eq(surveys.id, s.id)).returning();
        await audit(tx, { tenantId, actorType: 'system', action: 'survey.opened', subjectType: 'survey', subjectId: s.id });
        await this.notifyOpened(tx, row);
        ids.push(s.id);
      }
      return ids;
    });
    return { opened, closed };
  }

  /** Each question across the cycles of a series, matched by its prompt. */
  async trend(tx: Tx, key: string, cycles: Survey[]) {
    const perCycle: { cycle: number; survey: Survey; responses: number; summary: QuestionSummary[] }[] = [];
    for (const [i, c] of cycles.entries()) {
      const qs = await tx.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, c.id)).orderBy(asc(surveyQuestions.ord));
      const answers = await tx.select().from(surveyAnswers).where(eq(surveyAnswers.surveyId, c.id));
      const [{ n }] = await tx.select({ n: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, c.id));
      perCycle.push({ cycle: i + 1, survey: c, responses: n, summary: summarize(qs as QuestionDef[], answers) });
    }
    const prompts = [...new Set(perCycle.flatMap((c) => c.summary.filter((q) => q.kind !== 'text').map((q) => q.prompt)))];
    const questions = prompts.map((prompt) => {
      const points = perCycle.flatMap((c) => {
        const q = c.summary.find((x) => x.prompt === prompt);
        return q ? [{ cycle: c.cycle, surveyId: c.survey.id, answered: q.answered, average: q.average ?? null, counts: q.counts ?? null }] : [];
      });
      const avgs = points.filter((x) => x.average !== null);
      const change = avgs.length >= 2 ? Math.round((avgs[avgs.length - 1].average! - avgs[avgs.length - 2].average!) * 100) / 100 : null;
      return { prompt, kind: perCycle.flatMap((c) => c.summary).find((x) => x.prompt === prompt)!.kind, points, change };
    });
    return { series: key, cycles: perCycle.map((c) => ({ cycle: c.cycle, surveyId: c.survey.id, title: c.survey.title, status: c.survey.status, opensAt: c.survey.opensAt, closedAt: c.survey.closedAt, responses: c.responses })), questions };
  }
}
