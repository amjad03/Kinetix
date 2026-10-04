var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RecordingsService_1;
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull, inArray } from 'drizzle-orm';
import { AiService } from '../ai/ai.service.js';
import { SpeechToText } from '../ai/asr.js';
import { localParts } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { attendanceRecords, recordings, sections, subjects, users } from '../db/schema.js';
import { JobsService } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
export const TRANSCRIBE = 'recording.transcribe';
export const SUMMARIZE = 'recording.summarize';
/** Longest transcript sent for a summary (about an hour of speech). */
const MAX_TRANSCRIPT_CHARS = 60_000;
/** Recording queries, sharing, and the after-class jobs: transcript, then summary. */
let RecordingsService = RecordingsService_1 = class RecordingsService {
    constructor(db, jobs, storage, asr, ai, notifications, timetable) {
        this.db = db;
        this.jobs = jobs;
        this.storage = storage;
        this.asr = asr;
        this.ai = ai;
        this.notifications = notifications;
        this.timetable = timetable;
        this.log = new Logger(RecordingsService_1.name);
    }
    onModuleInit() {
        this.jobs.register(TRANSCRIBE, (job) => this.transcribe(job));
        this.jobs.register(SUMMARIZE, (job) => this.summarize(job));
        this.jobs.register(`${TRANSCRIBE}:failed`, (job) => this.markFailed(job, 'transcript'));
        this.jobs.register(`${SUMMARIZE}:failed`, (job) => this.markFailed(job, 'summary'));
    }
    get canTranscribe() {
        return this.asr.configured;
    }
    /** Metadata for lists: no transcript. */
    summaries(tx) {
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
    sharedWith(sectionIds) {
        return and(inArray(recordings.sectionId, sectionIds), isNotNull(recordings.sharedAt), isNotNull(recordings.finishedAt));
    }
    /** Students marked absent for the recorded period. */
    async absentees(tx, rec) {
        if (!rec.timetableSlotId)
            return [];
        const date = localParts(rec.startedAt, await this.timetable.tenantTimezone(tx)).date;
        const rows = await tx
            .select({ studentId: attendanceRecords.studentId })
            .from(attendanceRecords)
            .where(and(eq(attendanceRecords.timetableSlotId, rec.timetableSlotId), eq(attendanceRecords.date, date), eq(attendanceRecords.status, 'absent')));
        return rows.map((r) => r.studentId);
    }
    async share(tx, rec) {
        if (rec.sharedAt)
            return;
        await tx.update(recordings).set({ sharedAt: new Date() }).where(eq(recordings.id, rec.id));
        const [s] = await this.summaries(tx).where(eq(recordings.id, rec.id));
        await this.notifications.recordingShared(tx, {
            id: rec.id,
            sectionId: rec.sectionId,
            title: rec.title,
            subjectName: s?.subjectName ?? null,
            absentStudentIds: await this.absentees(tx, rec),
        });
    }
    async transcribe(job) {
        const rec = await this.db.withTenant(job.tenantId, async (tx) => (await tx.select().from(recordings).where(eq(recordings.id, job.payload.recordingId)))[0]);
        if (!rec?.audioKey)
            return;
        const { stream } = await this.storage.get(rec.audioKey);
        const chunks = [];
        for await (const c of stream)
            chunks.push(c);
        const text = await this.asr.transcribe(Buffer.concat(chunks), rec.audioMime ?? 'audio/mp4', rec.language);
        await this.db.withTenant(job.tenantId, async (tx) => {
            await tx
                .update(recordings)
                .set({ transcript: text, transcriptState: 'done', summaryState: text.length >= 20 ? 'queued' : 'none', updatedAt: new Date() })
                .where(eq(recordings.id, rec.id));
            if (text.length >= 20)
                await this.jobs.enqueue(tx, job.tenantId, SUMMARIZE, { recordingId: rec.id });
        });
    }
    async summarize(job) {
        const rec = await this.db.withTenant(job.tenantId, async (tx) => (await tx.select().from(recordings).where(eq(recordings.id, job.payload.recordingId)))[0]);
        if (!rec?.transcript)
            return;
        const res = await this.ai.run({ tenantId: job.tenantId, userId: rec.ownerId, sectionId: rec.sectionId, subjectId: rec.subjectId }, 'summarize', { transcript: rec.transcript.slice(0, MAX_TRANSCRIPT_CHARS), language: rec.language });
        // A placeholder summary is not worth showing to families.
        const summary = res.meta.preview ? null : res.result;
        await this.db.withTenant(job.tenantId, (tx) => tx
            .update(recordings)
            .set({ summary, summaryState: summary ? 'done' : 'none', updatedAt: new Date() })
            .where(eq(recordings.id, rec.id)));
    }
    async markFailed(job, what) {
        this.log.warn(`Giving up on the ${what} for recording ${job.payload.recordingId}`);
        await this.db.withTenant(job.tenantId, (tx) => tx
            .update(recordings)
            .set(what === 'transcript' ? { transcriptState: 'failed' } : { summaryState: 'failed' })
            .where(eq(recordings.id, job.payload.recordingId)));
    }
};
RecordingsService = RecordingsService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DbService,
        JobsService,
        ObjectStorage,
        SpeechToText,
        AiService,
        NotificationsService,
        TimetableService])
], RecordingsService);
export { RecordingsService };
//# sourceMappingURL=recordings.service.js.map