import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DEFAULT_RETENTION_GRACE_DAYS } from '../calendar/calendar.controller.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { aiCache, jobs, notifications, recordings, sections, tenants, users } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { addDays } from '../teacher/teacher.service.js';

export const RETENTION = 'recording.retention';

/** The teacher is told this many days before a recording is deleted. */
export const WARN_DAYS = 7;

/**
 * The day a recording is deleted (YYYY-MM-DD), or null when it is kept: the day after its term
 * ends plus the institution's grace period. The term is the one of the recording's class's
 * program on the day it was recorded (a term made for the program before a general one).
 * Recordings the teacher keeps, and those without a class or a term, have none.
 */
export const recordingExpiresOn = sql<string | null>`(
  select (t.ends_on + coalesce((tn.settings->>'recordingRetentionGraceDays')::int, ${sql.raw(String(DEFAULT_RETENTION_GRACE_DAYS))}) + 1)::text
  from sections s
  join tenants tn on tn.id = s.tenant_id
  join academic_terms t on t.program_ids is null or s.program_id = any(t.program_ids)
  where s.id = ${recordings.sectionId} and not ${recordings.keep}
    and (${recordings.startedAt} at time zone tn.timezone)::date between t.starts_on and t.ends_on
  order by (t.program_ids is null), t.starts_on
  limit 1)`;

/** The id of the term a recording belongs to (null without a class or a term). */
const recordingTermId = sql<string | null>`(
  select t.id
  from sections s
  join tenants tn on tn.id = s.tenant_id
  join academic_terms t on t.program_ids is null or s.program_id = any(t.program_ids)
  where s.id = ${recordings.sectionId}
    and (${recordings.startedAt} at time zone tn.timezone)::date between t.starts_on and t.ends_on
  order by (t.program_ids is null), t.starts_on
  limit 1)`;

export interface SweepResult {
  warned: string[];
  deleted: string[];
}

/**
 * Recordings are kept until their semester ends, plus a grace period (owner decision; see
 * docs/product/lesson-recording.md). Once a day per institution: the teacher is told a week
 * before a recording goes, and expired recordings are deleted with their files, transcript and
 * summary. Recordings the teacher marked "keep", and those without a class or a term, stay.
 */
@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly log = new Logger(RetentionService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly storage: ObjectStorage,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(RETENTION, (job: Job) => this.sweep(job.tenantId).then(() => undefined));
  }

  /** Warns about recordings that expire within a week and deletes the expired ones. */
  async sweep(tenantId: string): Promise<SweepResult> {
    const due = await this.db.withTenant(tenantId, async (tx) => {
      const today = await this.today(tx);
      const rows = await tx
        .select({
          id: recordings.id,
          ownerId: recordings.ownerId,
          title: recordings.title,
          sectionName: sections.displayName,
          expiresOn: recordingExpiresOn,
          expiryNotifiedAt: recordings.expiryNotifiedAt,
        })
        .from(recordings)
        .leftJoin(sections, eq(sections.id, recordings.sectionId))
        .where(and(eq(recordings.keep, false), sql`${recordingExpiresOn} <= ${addDays(today, WARN_DAYS)}`));
      const warned: string[] = [];
      for (const r of rows) {
        if (r.expiresOn! <= today || r.expiryNotifiedAt) continue;
        await this.notifications.recordingExpiring(tx, { id: r.id, ownerId: r.ownerId, title: r.title, sectionName: r.sectionName, expiresOn: r.expiresOn! });
        await tx.update(recordings).set({ expiryNotifiedAt: this.clock.now() }).where(eq(recordings.id, r.id));
        warned.push(r.id);
      }
      return { warned, expired: rows.filter((r) => r.expiresOn! <= today).map((r) => r.id) };
    });
    const deleted: string[] = [];
    for (const id of due.expired) {
      if (await this.expire(tenantId, id)) deleted.push(id);
    }
    if (deleted.length) this.log.log(`Deleted ${deleted.length} expired recording(s) of tenant ${tenantId}`);
    return { warned: due.warned, deleted };
  }

  /** Deletes one expired recording: its files first, then the row and what points at it. */
  private async expire(tenantId: string, id: string): Promise<boolean> {
    const rec = await this.db.withTenant(tenantId, async (tx) => {
      const [r] = await tx.select({ rec: recordings, expiresOn: recordingExpiresOn, termId: recordingTermId }).from(recordings).where(eq(recordings.id, id));
      // Kept (or its term changed) since the sweep looked.
      if (!r || !r.expiresOn || r.expiresOn > (await this.today(tx))) return undefined;
      return r;
    });
    if (!rec) return false;
    // Files go first: if this fails the row stays, and tomorrow's run tries again.
    for (const key of [rec.rec.eventsKey, rec.rec.audioKey]) if (key) await this.storage.delete(key);
    await this.db.withTenant(tenantId, async (tx) => {
      const r = rec.rec;
      await tx.delete(recordings).where(eq(recordings.id, id));
      // Families and the teacher no longer see notifications about it.
      await tx.update(notifications).set({ retractedAt: this.clock.now() }).where(and(sql`${notifications.data}->>'recordingId' = ${id}`, isNull(notifications.retractedAt)));
      // Transcription or a summary may still be queued.
      await tx.delete(jobs).where(and(sql`${jobs.payload}->>'recordingId' = ${id}`, inArray(jobs.state, ['queued', 'failed'])));
      // The AI summary is cached by its input; drop it with the recording.
      if (r.summary) await tx.delete(aiCache).where(and(eq(aiCache.task, 'summarize'), sql`${aiCache.result} = ${JSON.stringify(r.summary)}::jsonb`));
      await audit(tx, {
        tenantId,
        actorType: 'system',
        action: 'recording.expired',
        subjectType: 'recording',
        subjectId: id,
        data: { title: r.title, ownerId: r.ownerId, sectionId: r.sectionId, startedAt: r.startedAt, termId: rec.termId, expiresOn: rec.expiresOn, bytes: r.eventsBytes + r.audioBytes },
      });
    });
    return true;
  }

  /**
   * For the principal: per class, how many recordings will be deleted in the next 30 days (and
   * how many are kept), and the recordings without a term, which are kept until a term covers them.
   */
  async overview(tx: Tx) {
    const today = await this.today(tx);
    const until = addDays(today, 30);
    const [t] = await tx.select({ settings: tenants.settings }).from(tenants);
    const classes = await tx
      .select({
        sectionId: recordings.sectionId,
        sectionName: sections.displayName,
        total: sql<number>`count(*)::int`,
        kept: sql<number>`(count(*) filter (where ${recordings.keep}))::int`,
        expiringSoon: sql<number>`(count(*) filter (where ${recordingExpiresOn} <= ${until}))::int`,
        nextExpiresOn: sql<string | null>`min(${recordingExpiresOn})`,
      })
      .from(recordings)
      .innerJoin(sections, eq(sections.id, recordings.sectionId))
      .groupBy(recordings.sectionId, sections.displayName)
      .orderBy(sections.displayName);
    const noTermWhere = and(eq(recordings.keep, false), sql`${recordingTermId} is null`);
    const [{ noTermCount }] = await tx.select({ noTermCount: sql<number>`count(*)::int` }).from(recordings).where(noTermWhere);
    const noTerm = await tx
      .select({ id: recordings.id, title: recordings.title, startedAt: recordings.startedAt, sectionName: sections.displayName, teacherName: users.fullName })
      .from(recordings)
      .innerJoin(users, eq(users.id, recordings.ownerId))
      .leftJoin(sections, eq(sections.id, recordings.sectionId))
      .where(noTermWhere)
      .orderBy(sql`${recordings.startedAt} desc`)
      .limit(50);
    return {
      today,
      graceDays: t?.settings.recordingRetentionGraceDays ?? DEFAULT_RETENTION_GRACE_DAYS,
      classes,
      noTerm: { count: noTermCount, recordings: noTerm },
    };
  }

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.timezone ?? 'Asia/Kolkata').date;
  }
}
