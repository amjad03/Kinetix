var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, PayloadTooLargeException, Post, Put, Query, Req, Res, } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { audit } from '../common/audit.js';
import { canSeeClassItem, isInClass } from '../common/class-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, recordings } from '../db/schema.js';
import { JobsService } from '../jobs/jobs.service.js';
import { bufferStream, ObjectStorage, TooLargeError } from '../storage/storage.service.js';
import { RecordingsService, TRANSCRIBE } from './recordings.service.js';
const MAX_EVENTS_BYTES = 32 * 1024 * 1024;
/** About three hours of AAC at 64 kbit/s. */
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const AUDIO_TYPES = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/mpeg'];
const CreateBody = z.object({
    title: z.string().trim().min(1).max(120),
    startedAt: z.iso.datetime(),
    language: z.enum(['en', 'hi', 'kn']).default('en'),
});
const FinishBody = z.object({
    durationMs: z.number().int().min(0).max(6 * 3600_000),
    share: z.boolean().default(false),
});
/**
 * Lesson recordings. The board records the ink as a timed event log and the teacher's voice,
 * keeps both on disk while offline, and uploads them after class:
 * `PUT /:id` → `PUT /:id/events` → `PUT /:id/audio` (optional) → `POST /:id/finish`.
 * Every step can be retried. Students and families watch shared recordings in their apps.
 */
let RecordingsController = class RecordingsController {
    constructor(db, storage, jobs, recs) {
        this.db = db;
        this.storage = storage;
        this.jobs = jobs;
        this.recs = recs;
    }
    create(p, id, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const [existing] = await tx.select().from(recordings).where(eq(recordings.id, id));
            if (existing) {
                if (existing.ownerId !== p.teacherId)
                    throw new ForbiddenException('This recording belongs to another teacher');
                if (!existing.finishedAt)
                    await tx.update(recordings).set({ title: body.title, updatedAt: new Date() }).where(eq(recordings.id, id));
                return this.view(tx, id);
            }
            const [session] = await tx.select().from(boardSessions).where(eq(boardSessions.id, p.sessionId));
            await tx.insert(recordings).values({
                id,
                tenantId: p.tenantId,
                ownerId: p.teacherId,
                deviceId: p.deviceId,
                boardSessionId: p.sessionId,
                timetableSlotId: session?.timetableSlotId ?? null,
                sectionId: session?.sectionId ?? null,
                subjectId: session?.subjectId ?? null,
                title: body.title,
                language: body.language,
                startedAt: new Date(body.startedAt),
            });
            await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'recording.create', subjectType: 'recording', subjectId: id });
            return this.view(tx, id);
        });
    }
    /** The ink event log: `{"v": 1, "canvas": {...}, "events": [...]}`. Sent as raw JSON. */
    async events(p, id, req) {
        const rec = await this.ownedUnfinished(p, id);
        const buf = await readBody(req, MAX_EVENTS_BYTES);
        let parsed;
        try {
            parsed = JSON.parse(buf.toString('utf8'));
        }
        catch {
            throw new BadRequestException('The event log is not valid JSON');
        }
        const ok = z.object({ v: z.literal(1), events: z.array(z.unknown()) }).safeParse(parsed);
        if (!ok.success)
            throw new BadRequestException('The event log must have v = 1 and an events list');
        const key = `tenants/${p.tenantId}/recordings/${id}/events.json`;
        const bytes = await this.storage.put(key, bufferStream(buf), MAX_EVENTS_BYTES, 'application/json');
        await this.db.withTenant(p.tenantId, (tx) => tx.update(recordings).set({ eventsKey: key, eventsBytes: bytes, updatedAt: new Date() }).where(eq(recordings.id, rec.id)));
    }
    /** The teacher's voice, streamed straight to storage. */
    async audio(p, id, req) {
        const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!AUDIO_TYPES.includes(mime))
            throw new BadRequestException(`Unsupported audio type "${mime}"`);
        const declared = Number(req.headers['content-length'] ?? 0);
        if (declared > MAX_AUDIO_BYTES)
            throw new PayloadTooLargeException('This recording is too long to upload');
        const rec = await this.ownedUnfinished(p, id);
        const key = `tenants/${p.tenantId}/recordings/${id}/audio`;
        let bytes;
        try {
            bytes = await this.storage.put(key, req, MAX_AUDIO_BYTES, mime);
        }
        catch (e) {
            if (e instanceof TooLargeError)
                throw new PayloadTooLargeException('This recording is too long to upload');
            throw e;
        }
        await this.db.withTenant(p.tenantId, (tx) => tx.update(recordings).set({ audioKey: key, audioMime: mime, audioBytes: bytes, updatedAt: new Date() }).where(eq(recordings.id, rec.id)));
    }
    /** Everything is uploaded: the recording can be played, transcribed and shared. */
    finish(p, id, body) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const rec = await this.owned(tx, p.teacherId, id);
            if (!rec.finishedAt) {
                if (!rec.eventsKey)
                    throw new BadRequestException('Upload the event log before finishing');
                const transcribe = !!rec.audioKey && this.recs.canTranscribe;
                await tx
                    .update(recordings)
                    .set({ durationMs: body.durationMs, finishedAt: new Date(), transcriptState: transcribe ? 'queued' : 'none', updatedAt: new Date() })
                    .where(eq(recordings.id, id));
                if (transcribe)
                    await this.jobs.enqueue(tx, p.tenantId, TRANSCRIBE, { recordingId: id });
            }
            if (body.share)
                await this.shareChecked(tx, { ...rec, finishedAt: rec.finishedAt ?? new Date() });
            return this.view(tx, id);
        });
    }
    share(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const rec = await this.owned(tx, p.kind === 'board' ? p.teacherId : p.userId, id);
            if (!rec.finishedAt)
                throw new BadRequestException('The recording is still uploading');
            await this.shareChecked(tx, rec);
            return this.view(tx, id);
        });
    }
    /**
     * Without `sectionId`: the caller's own recordings (teacher or board). With it: recordings
     * shared with that class, for its students, their families and school leaders.
     */
    list(p, sectionId) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            if (sectionId) {
                if (!z.uuid().safeParse(sectionId).success)
                    throw new BadRequestException('Bad sectionId');
                const allowed = p.kind === 'user' && (p.roles.some((r) => ['principal', 'tenant_admin', 'teacher', 'hod'].includes(r)) || (await isInClass(tx, p.userId, sectionId)));
                if (!allowed)
                    throw new NotFoundException('Class not found');
                return this.recs.summaries(tx).where(this.recs.sharedWith([sectionId])).orderBy(desc(recordings.startedAt)).limit(50);
            }
            const ownerId = p.kind === 'board' ? p.teacherId : p.userId;
            return this.recs.summaries(tx).where(eq(recordings.ownerId, ownerId)).orderBy(desc(recordings.startedAt)).limit(50);
        });
    }
    get(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            await this.viewable(tx, p, id);
            return this.view(tx, id);
        });
    }
    async getEvents(p, id, res) {
        const rec = await this.db.withTenant(p.tenantId, (tx) => this.viewable(tx, p, id));
        if (!rec.eventsKey)
            throw new NotFoundException('No event log');
        const { stream, size } = await this.storage.get(rec.eventsKey);
        res.setHeader('content-length', size);
        stream.pipe(res);
    }
    /** Audio with HTTP Range support, so players can seek. */
    async getAudio(p, id, req, res) {
        const rec = await this.db.withTenant(p.tenantId, (tx) => this.viewable(tx, p, id));
        if (!rec.audioKey)
            throw new NotFoundException('This recording has no audio');
        const size = rec.audioBytes;
        res.setHeader('content-type', rec.audioMime ?? 'audio/mp4');
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (range && (range[1] || range[2])) {
            let start = range[1] ? Number(range[1]) : size - Number(range[2]);
            let end = range[1] && range[2] ? Number(range[2]) : size - 1;
            start = Math.max(0, start);
            end = Math.min(end, size - 1);
            if (start > end || start >= size) {
                res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).setHeader('content-range', `bytes */${size}`).end();
                return;
            }
            const { stream } = await this.storage.get(rec.audioKey, { start, end });
            res.status(206).setHeader('content-range', `bytes ${start}-${end}/${size}`);
            res.setHeader('content-length', end - start + 1);
            stream.pipe(res);
            return;
        }
        const { stream } = await this.storage.get(rec.audioKey);
        res.setHeader('content-length', size);
        stream.pipe(res);
    }
    async shareChecked(tx, rec) {
        if (!rec.sectionId)
            throw new ForbiddenException('This recording was not made with a class, so there is no one to share it with');
        await this.recs.share(tx, rec);
    }
    async view(tx, id) {
        const [summary] = await this.recs.summaries(tx).where(eq(recordings.id, id));
        const [extra] = await tx.select({ transcript: recordings.transcript, summary: recordings.summary }).from(recordings).where(eq(recordings.id, id));
        return { ...summary, ...extra };
    }
    async owned(tx, ownerId, id) {
        const [rec] = await tx.select().from(recordings).where(eq(recordings.id, id));
        if (!rec || rec.ownerId !== ownerId)
            throw new NotFoundException('Recording not found');
        return rec;
    }
    ownedUnfinished(p, id) {
        return this.db.withTenant(p.tenantId, async (tx) => {
            const rec = await this.owned(tx, p.teacherId, id);
            if (rec.finishedAt)
                throw new BadRequestException('This recording is already finished');
            return rec;
        });
    }
    async viewable(tx, p, id) {
        const [rec] = await tx.select().from(recordings).where(eq(recordings.id, id));
        const ok = rec && (p.kind === 'board' ? rec.ownerId === p.teacherId : await canSeeClassItem(tx, p, rec));
        if (!ok)
            throw new NotFoundException('Recording not found');
        // Families see a recording only once it is complete.
        if (!rec.finishedAt && rec.ownerId !== (p.kind === 'board' ? p.teacherId : p.userId))
            throw new NotFoundException('Recording not found');
        return rec;
    }
};
__decorate([
    Put(':id'),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(CreateBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], RecordingsController.prototype, "create", null);
__decorate([
    Put(':id/events'),
    HttpCode(204),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], RecordingsController.prototype, "events", null);
__decorate([
    Put(':id/audio'),
    HttpCode(204),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], RecordingsController.prototype, "audio", null);
__decorate([
    Post(':id/finish'),
    HttpCode(200),
    Auth('board'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Body(new ZodBody(FinishBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], RecordingsController.prototype, "finish", null);
__decorate([
    Post(':id/share'),
    HttpCode(200),
    Auth(['board', 'user']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RecordingsController.prototype, "share", null);
__decorate([
    Get(),
    Auth(['board', 'user']),
    __param(0, CurrentPrincipal()),
    __param(1, Query('sectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RecordingsController.prototype, "list", null);
__decorate([
    Get(':id'),
    Auth(['board', 'user']),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RecordingsController.prototype, "get", null);
__decorate([
    Get(':id/events'),
    Auth(['board', 'user']),
    Header('content-type', 'application/json'),
    Header('cache-control', 'private, max-age=86400'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], RecordingsController.prototype, "getEvents", null);
__decorate([
    Get(':id/audio'),
    Auth(['board', 'user']),
    Header('accept-ranges', 'bytes'),
    Header('cache-control', 'private, max-age=86400'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id', ParseUUIDPipe)),
    __param(2, Req()),
    __param(3, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], RecordingsController.prototype, "getAudio", null);
RecordingsController = __decorate([
    Controller('v1/recordings'),
    __metadata("design:paramtypes", [DbService,
        ObjectStorage,
        JobsService,
        RecordingsService])
], RecordingsController);
export { RecordingsController };
/** Reads a raw request body up to a limit. */
async function readBody(req, max) {
    // Sent as application/json, the global JSON parser has already read it (up to its own limit).
    if (req.readableEnded && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body))
        return Buffer.from(JSON.stringify(req.body));
    const chunks = [];
    let n = 0;
    for await (const c of req) {
        n += c.length;
        if (n > max)
            throw new PayloadTooLargeException('Upload is too large');
        chunks.push(c);
    }
    return Buffer.concat(chunks);
}
//# sourceMappingURL=recordings.controller.js.map