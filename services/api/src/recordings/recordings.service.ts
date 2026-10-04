import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, eq, isNotNull, inArray } from 'drizzle-orm';
import { AiService } from '../ai/ai.service.js';
import { SpeechToText } from '../ai/asr.js';
import { localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceRecords, recordings, sections, subjects, users } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { TimetableService } from '../timetable/timetable.service.js';

export const TRANSCRIBE = 'recording.transcribe';
export const SUMMARIZE = 'recording.summarize';

/** Longest transcript sent for a summary (about an hour of speech). */
const MAX_TRANSCRIPT_CHARS = 60_000;

/** Recording queries, sharing, and the after-class jobs: transcript, then summary. */
@Injectable()
export class RecordingsService implements OnModuleInit {
  private readonly log = new Logger(RecordingsService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly storage: ObjectStorage,
    private readonly asr: SpeechToText,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    private readonly timetable: TimetableService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(TRANSCRIBE, (job) => this.transcribe(job));
    this.jobs.register(SUMMARIZE, (job) => this.summarize(job));
    this.jobs.register(`${TRANSCRIBE}:failed`, (job) => this.markFailed(job, 'transcript'));
    this.jobs.register(`${SUMMARIZE}:failed`, (job) => this.markFailed(job, 'summary'));
  }

  get canTranscribe(): boolean {
    return this.asr.configured;
  }

  /** Metadata for lists: no transcript. */
  summaries(tx: Tx) {
    return tx
      .select({
        id: recordings.id,
        title: recordings.title,
        startedAt: recordings.startedAt,
        durationMs: recordings.durationMs,
        hasAudio: isNotNull(recordings.audioKey).mapWith(Boolean),
        sectionId: recordings.sectionId,
        sectionName: sections.displayName,
        subjectName: subjects.name,
        teacherName: users.fullName,
        transcriptState: recordings.transcriptState,
        summaryState: recordings.summaryState,
        sharedAt: recordings.sharedAt,
        finishedAt: recordings.finishedAt,
      })
      .from(recordings)
      .innerJoin(users, eq(users.id, recordings.ownerId))
      .leftJoin(sections, eq(sections.id, recordings.sectionId))
      .leftJoin(subjects, eq(subjects.id, recordings.subjectId))
      .$dynamic();
  }

  /** Recordings that the class can watch. */
  sharedWith(sectionIds: string[]) {
    return and(inArray(recordings.sectionId, sectionIds), isNotNull(recordings.sharedAt), isNotNull(recordings.finishedAt));
  }

  /** Students marked absent for the recorded period. */
  async absentees(tx: Tx, rec: typeof recordings.$inferSelect): Promise<string[]> {
    if (!rec.timetableSlotId) return [];
    const date = localParts(rec.startedAt, await this.timetable.tenantTimezone(tx)).date;
    const rows = await tx
      .select({ studentId: attendanceRecords.studentId })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.timetableSlotId, rec.timetableSlotId), eq(attendanceRecords.date, date), eq(attendanceRecords.status, 'absent')));
    return rows.map((r) => r.studentId);
  }

  async share(tx: Tx, rec: typeof recordings.$inferSelect): Promise<void> {
    if (rec.sharedAt) return;
    await tx.update(recordings).set({ sharedAt: new Date() }).where(eq(recordings.id, rec.id));
    const [s] = await this.summaries(tx).where(eq(recordings.id, rec.id));
    await this.notifications.recordingShared(tx, {
      id: rec.id,
      sectionId: rec.sectionId!,
      title: rec.title,
      subjectName: s?.subjectName ?? null,
      absentStudentIds: await this.absentees(tx, rec),
    });
  }

  private async transcribe(job: Job): Promise<void> {
    const rec = await this.db.withTenant(job.tenantId, async (tx) => (await tx.select().from(recordings).where(eq(recordings.id, job.payload.recordingId)))[0]);
    if (!rec?.audioKey) return;
    const { stream } = await this.storage.get(rec.audioKey);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const text = await this.asr.transcribe(Buffer.concat(chunks), rec.audioMime ?? 'audio/mp4', rec.language);
    await this.db.withTenant(job.tenantId, async (tx) => {
      await tx
        .update(recordings)
        .set({ transcript: text, transcriptState: 'done', summaryState: text.length >= 20 ? 'queued' : 'none', updatedAt: new Date() })
        .where(eq(recordings.id, rec.id));
      if (text.length >= 20) await this.jobs.enqueue(tx, job.tenantId, SUMMARIZE, { recordingId: rec.id });
    });
  }

  private async summarize(job: Job): Promise<void> {
    const rec = await this.db.withTenant(job.tenantId, async (tx) => (await tx.select().from(recordings).where(eq(recordings.id, job.payload.recordingId)))[0]);
    if (!rec?.transcript) return;
    const res = await this.ai.run(
      { tenantId: job.tenantId, userId: rec.ownerId, sectionId: rec.sectionId, subjectId: rec.subjectId },
      'summarize',
      { transcript: rec.transcript.slice(0, MAX_TRANSCRIPT_CHARS), language: rec.language },
    );
    // A placeholder summary is not worth showing to families.
    const summary = res.meta.preview ? null : res.result;
    await this.db.withTenant(job.tenantId, (tx) =>
      tx
        .update(recordings)
        .set({ summary, summaryState: summary ? 'done' : 'none', updatedAt: new Date() })
        .where(eq(recordings.id, rec.id)),
    );
  }

  private async markFailed(job: Job, what: 'transcript' | 'summary'): Promise<void> {
    this.log.warn(`Giving up on the ${what} for recording ${job.payload.recordingId}`);
    await this.db.withTenant(job.tenantId, (tx) =>
      tx
        .update(recordings)
        .set(what === 'transcript' ? { transcriptState: 'failed' } : { summaryState: 'failed' })
        .where(eq(recordings.id, job.payload.recordingId)),
    );
  }
}
