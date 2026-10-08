import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, count, eq, inArray, isNotNull, lte, notInArray } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { guardians, students, surveyResponses, surveys, userRoles } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { UserPrincipal } from '../auth/principal.js';
import type { Respondent } from './survey-rules.js';

export const SURVEY_AUTOCLOSE = 'surveys.autoclose';

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
}
