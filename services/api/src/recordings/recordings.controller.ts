import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { canSeeClassItem, isInClass } from '../common/class-access.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, recordingShareLinks, recordings, tenants } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { bufferStream, ObjectStorage, TooLargeError } from '../storage/storage.service.js';
import { MAX_TRANSCRIBE_VIDEO_BYTES, RecordingsService, TRANSCRIBE } from './recordings.service.js';
import { RetentionService } from './retention.service.js';
import { DomainEvents, EventBus } from '../events/events.js';

const MAX_EVENTS_BYTES = 32 * 1024 * 1024;
/** About three hours of AAC at 64 kbit/s. */
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const AUDIO_TYPES = ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/mpeg'];

/** The lecture video is sent in chunks of at most this size, so a dropped connection costs one chunk. */
const MAX_VIDEO_CHUNK_BYTES = 16 * 1024 * 1024;
/** About four hours of 720p screen video. */
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_VIDEO_CHUNKS = Math.ceil(MAX_VIDEO_BYTES / (1024 * 1024));
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

const FinalizeVideoBody = z.object({
  chunks: z.number().int().min(1).max(MAX_VIDEO_CHUNKS),
  mime: z.enum(VIDEO_TYPES).default('video/mp4'),
});

/** A share link lasts two days unless the teacher picks otherwise (one hour to two weeks). */
const ShareLinkBody = z.object({ expiresInHours: z.number().int().min(1).max(24 * 14).default(48) });

const CreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  startedAt: z.iso.datetime(),
  language: z.enum(['en', 'hi', 'kn']).default('en'),
});

const KeepBody = z.object({ keep: z.boolean() });

const FinishBody = z.object({
  durationMs: z.number().int().min(0).max(6 * 3600_000),
  share: z.boolean().default(false),
});

type Viewer = UserPrincipal | BoardPrincipal;
type Recording = typeof recordings.$inferSelect;

/**
 * Lesson recordings. The board records the ink as a timed event log and the teacher's voice,
 * keeps both on disk while offline, and uploads them after class:
 * `PUT /:id` → `PUT /:id/events` → `PUT /:id/audio` (optional) → `POST /:id/finish`.
 * Every step can be retried. Students and families watch shared recordings in their apps.
 */
@Controller('v1/recordings')
export class RecordingsController {
  constructor(
    private readonly db: DbService,
    private readonly storage: ObjectStorage,
    private readonly jobs: JobsService,
    private readonly recs: RecordingsService,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Put(':id')
  @Auth('board')
  create(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CreateBody)) body: z.infer<typeof CreateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [existing] = await tx.select().from(recordings).where(eq(recordings.id, id));
      if (existing) {
        if (existing.ownerId !== p.teacherId) throw new ForbiddenException('This recording belongs to another teacher');
        if (!existing.finishedAt) await tx.update(recordings).set({ title: body.title, updatedAt: new Date() }).where(eq(recordings.id, id));
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

  /** The ink event log: `{"v": 2, "canvas": {...}, "events": [...]}` (version 1 from older boards). Sent as raw JSON. */
  @Put(':id/events')
  @HttpCode(204)
  @Auth('board')
  async events(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const rec = await this.ownedUnfinished(p, id);
    const buf = await readBody(req, MAX_EVENTS_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch {
      throw new BadRequestException('The event log is not valid JSON');
    }
    const ok = z.object({ v: z.union([z.literal(1), z.literal(2)]), events: z.array(z.unknown()) }).safeParse(parsed);
    if (!ok.success) throw new BadRequestException('The event log must have v = 1 or 2 and an events list');
    const key = `tenants/${p.tenantId}/recordings/${id}/events.json`;
    const bytes = await this.storage.put(key, bufferStream(buf), MAX_EVENTS_BYTES, 'application/json');
    await this.db.withTenant(p.tenantId, (tx) => tx.update(recordings).set({ eventsKey: key, eventsBytes: bytes, updatedAt: new Date() }).where(eq(recordings.id, rec.id)));
  }

  /** The teacher's voice, streamed straight to storage. */
  @Put(':id/audio')
  @HttpCode(204)
  @Auth('board')
  async audio(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!AUDIO_TYPES.includes(mime)) throw new BadRequestException(`Unsupported audio type "${mime}"`);
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_AUDIO_BYTES) throw new PayloadTooLargeException('This recording is too long to upload');
    const rec = await this.ownedUnfinished(p, id);
    const key = `tenants/${p.tenantId}/recordings/${id}/audio`;
    let bytes: number;
    try {
      bytes = await this.storage.put(key, req, MAX_AUDIO_BYTES, mime);
    } catch (e) {
      if (e instanceof TooLargeError) throw new PayloadTooLargeException('This recording is too long to upload');
      throw e;
    }
    await this.db.withTenant(p.tenantId, (tx) =>
      tx.update(recordings).set({ audioKey: key, audioMime: mime, audioBytes: bytes, updatedAt: new Date() }).where(eq(recordings.id, rec.id)),
    );
  }

  /**
   * One chunk of the lecture video (board view and microphone), numbered from 0. Chunks can be
   * sent again (a retry replaces the chunk) and in any order; `finalize` joins them.
   */
  @Put(':id/video/chunks/:index')
  @HttpCode(204)
  @Auth('board')
  async videoChunk(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('index') index: string, @Req() req: Request) {
    const n = Number(index);
    if (!/^\d{1,5}$/.test(index) || n >= MAX_VIDEO_CHUNKS) throw new BadRequestException('Bad chunk number');
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_VIDEO_CHUNK_BYTES) throw new PayloadTooLargeException(`A chunk can be at most ${MAX_VIDEO_CHUNK_BYTES} bytes`);
    const rec = await this.ownedUnfinished(p, id);
    if (rec.videoKey) throw new BadRequestException('The video is already assembled');
    try {
      await this.storage.put(chunkKey(p.tenantId, id, n), req, MAX_VIDEO_CHUNK_BYTES, 'application/octet-stream');
    } catch (e) {
      if (e instanceof TooLargeError) throw new PayloadTooLargeException(`A chunk can be at most ${MAX_VIDEO_CHUNK_BYTES} bytes`);
      throw e;
    }
  }

  /** Every chunk is uploaded: joins them into the recording's video. Safe to call again. */
  @Post(':id/video/finalize')
  @HttpCode(200)
  @Auth('board')
  async finalizeVideo(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FinalizeVideoBody)) body: z.infer<typeof FinalizeVideoBody>) {
    const rec = await this.db.withTenant(p.tenantId, (tx) => this.owned(tx, p.teacherId, id));
    if (rec.videoKey) return this.db.withTenant(p.tenantId, (tx) => this.view(tx, id));
    if (rec.finishedAt) throw new BadRequestException('This recording is already finished');
    const missing: number[] = [];
    let total = 0;
    for (let i = 0; i < body.chunks; i++) {
      const size = await this.storage.size(chunkKey(p.tenantId, id, i));
      if (size === null) missing.push(i);
      else total += size;
    }
    if (missing.length) throw new BadRequestException(`Video chunks missing: ${missing.slice(0, 20).join(', ')}`);
    if (total > MAX_VIDEO_BYTES) throw new PayloadTooLargeException('This video is too long to keep');
    const storage = this.storage;
    const tenantId = p.tenantId;
    async function* joined() {
      for (let i = 0; i < body.chunks; i++) {
        const { stream } = await storage.get(chunkKey(tenantId, id, i));
        for await (const c of stream) yield c as Buffer;
      }
    }
    const key = `tenants/${p.tenantId}/recordings/${id}/video`;
    const bytes = await this.storage.put(key, Readable.from(joined()), MAX_VIDEO_BYTES, body.mime);
    await this.db.withTenant(p.tenantId, (tx) =>
      tx.update(recordings).set({ videoKey: key, videoMime: body.mime, videoBytes: bytes, updatedAt: new Date() }).where(eq(recordings.id, id)),
    );
    for (let i = 0; i < body.chunks; i++) await this.storage.delete(chunkKey(p.tenantId, id, i)).catch(() => undefined);
    return this.db.withTenant(p.tenantId, (tx) => this.view(tx, id));
  }

  /** Everything is uploaded: the recording can be played, transcribed and shared. */
  @Post(':id/finish')
  @HttpCode(200)
  @Auth('board')
  finish(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FinishBody)) body: z.infer<typeof FinishBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rec = await this.owned(tx, p.teacherId, id);
      if (!rec.finishedAt) {
        if (!rec.eventsKey && !rec.videoKey) throw new BadRequestException('Upload the event log or the video before finishing');
        const sound = !!rec.audioKey || (!!rec.videoKey && rec.videoBytes <= MAX_TRANSCRIBE_VIDEO_BYTES);
        const transcribe = sound && this.recs.canTranscribe;
        await tx
          .update(recordings)
          .set({ durationMs: body.durationMs, finishedAt: new Date(), transcriptState: transcribe ? 'queued' : 'none', updatedAt: new Date() })
          .where(eq(recordings.id, id));
        if (transcribe) await this.jobs.enqueue(tx, p.tenantId, TRANSCRIBE, { recordingId: id });
        await this.bus.emit(tx, p.tenantId, { type: DomainEvents.LessonRecorded, aggregateType: 'recording', aggregateId: id, actorId: p.teacherId, payload: { sessionId: p.sessionId, durationMs: body.durationMs } });
      }
      if (body.share) await this.shareChecked(tx, { ...rec, finishedAt: rec.finishedAt ?? new Date() });
      return this.view(tx, id);
    });
  }

  @Post(':id/share')
  @HttpCode(200)
  @Auth(['board', 'user'])
  share(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rec = await this.owned(tx, p.kind === 'board' ? p.teacherId : p.userId, id);
      if (!rec.finishedAt) throw new BadRequestException('The recording is still uploading');
      await this.shareChecked(tx, rec);
      return this.view(tx, id);
    });
  }

  /**
   * The teacher keeps a recording past the end of its term (or lets it go again). Kept
   * recordings are never deleted automatically.
   */
  @Post(':id/keep')
  @HttpCode(200)
  @Auth(['board', 'user'])
  keep(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(KeepBody)) body: z.infer<typeof KeepBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rec = await this.owned(tx, p.kind === 'board' ? p.teacherId : p.userId, id);
      if (rec.keep !== body.keep) {
        await tx.update(recordings).set({ keep: body.keep, updatedAt: new Date() }).where(eq(recordings.id, id));
        await audit(tx, {
          tenantId: p.tenantId,
          actorType: p.kind === 'board' ? 'device' : 'user',
          actorId: p.kind === 'board' ? p.deviceId : p.userId,
          action: body.keep ? 'recording.kept' : 'recording.unkept',
          subjectType: 'recording',
          subjectId: id,
        });
      }
      return this.view(tx, id);
    });
  }

  /**
   * A link (shown as a QR code on the board) that plays the lecture video in any browser until
   * it expires. Only for a finished video the teacher has already shared with the class: the
   * link reaches the same audience the class recording does, so no new consent is needed.
   */
  @Post(':id/share-links')
  @HttpCode(201)
  @Auth(['board', 'user'])
  shareLink(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ShareLinkBody)) body: z.infer<typeof ShareLinkBody>, @Req() req: Request) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rec = await this.owned(tx, p.kind === 'board' ? p.teacherId : p.userId, id);
      if (!rec.finishedAt || !rec.videoKey) throw new BadRequestException('This recording has no finished video yet');
      if (!rec.sharedAt) throw new BadRequestException('Share the recording with the class before making a link');
      const token = randomBytes(16).toString('hex');
      const expiresAt = new Date(this.clock.now().getTime() + body.expiresInHours * 3600_000);
      await tx.insert(recordingShareLinks).values({ tenantId: p.tenantId, recordingId: id, tokenHash: hashToken(token), expiresAt, createdBy: p.kind === 'board' ? p.teacherId : p.userId });
      const [t] = await tx.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, p.tenantId));
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: p.kind === 'board' ? 'device' : 'user',
        actorId: p.kind === 'board' ? p.deviceId : p.userId,
        action: 'recording.link',
        subjectType: 'recording',
        subjectId: id,
      });
      const base = (this.env.API_PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      return { url: `${base}/v1/public/recordings/${t.slug}/${token}`, expiresAt };
    });
  }

  /** Stops every link to a recording at once. */
  @Delete(':id/share-links')
  @HttpCode(204)
  @Auth(['board', 'user'])
  async revokeLinks(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      await this.owned(tx, p.kind === 'board' ? p.teacherId : p.userId, id);
      await tx.update(recordingShareLinks).set({ revokedAt: this.clock.now() }).where(and(eq(recordingShareLinks.recordingId, id), isNull(recordingShareLinks.revokedAt)));
    });
  }

  /**
   * Without `sectionId`: the caller's own recordings (teacher or board). With it: recordings
   * shared with that class, for its students, their families and school leaders.
   */
  @Get()
  @Auth(['board', 'user'])
  list(@CurrentPrincipal() p: Viewer, @Query('sectionId') sectionId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (sectionId) {
        if (!z.uuid().safeParse(sectionId).success) throw new BadRequestException('Bad sectionId');
        const allowed =
          p.kind === 'user' && (p.roles.some((r) => ['principal', 'tenant_admin', 'teacher', 'hod'].includes(r)) || (await isInClass(tx, p.userId, sectionId)));
        if (!allowed) throw new NotFoundException('Class not found');
        return this.recs.summaries(tx).where(this.recs.sharedWith([sectionId])).orderBy(desc(recordings.startedAt)).limit(50);
      }
      const ownerId = p.kind === 'board' ? p.teacherId : p.userId;
      return this.recs.summaries(tx).where(eq(recordings.ownerId, ownerId)).orderBy(desc(recordings.startedAt)).limit(50);
    });
  }

  @Get(':id')
  @Auth(['board', 'user'])
  get(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.viewable(tx, p, id);
      return this.view(tx, id);
    });
  }

  @Get(':id/events')
  @Auth(['board', 'user'])
  @Header('content-type', 'application/json')
  @Header('cache-control', 'private, max-age=86400')
  async getEvents(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const rec = await this.db.withTenant(p.tenantId, (tx) => this.viewable(tx, p, id));
    if (!rec.eventsKey) throw new NotFoundException('No event log');
    const { stream, size } = await this.storage.get(rec.eventsKey);
    res.setHeader('content-length', size);
    stream.pipe(res);
  }

  /** The lecture video, with HTTP Range support so players can seek. */
  @Get(':id/video')
  @Auth(['board', 'user'])
  @Header('accept-ranges', 'bytes')
  @Header('cache-control', 'private, max-age=86400')
  async getVideo(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const rec = await this.db.withTenant(p.tenantId, (tx) => this.viewable(tx, p, id));
    if (!rec.videoKey) throw new NotFoundException('This recording has no video');
    await sendRanged(this.storage, req, res, rec.videoKey, rec.videoBytes, rec.videoMime ?? 'video/mp4');
  }

  /** Audio with HTTP Range support, so players can seek. */
  @Get(':id/audio')
  @Auth(['board', 'user'])
  @Header('accept-ranges', 'bytes')
  @Header('cache-control', 'private, max-age=86400')
  async getAudio(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const rec = await this.db.withTenant(p.tenantId, (tx) => this.viewable(tx, p, id));
    if (!rec.audioKey) throw new NotFoundException('This recording has no audio');
    await sendRanged(this.storage, req, res, rec.audioKey, rec.audioBytes, rec.audioMime ?? 'audio/mp4');
  }

  private async shareChecked(tx: Tx, rec: Recording) {
    if (!rec.sectionId) throw new ForbiddenException('This recording was not made with a class, so there is no one to share it with');
    await this.recs.share(tx, rec);
  }

  private async view(tx: Tx, id: string) {
    const [summary] = await this.recs.summaries(tx).where(eq(recordings.id, id));
    const [extra] = await tx.select({ transcript: recordings.transcript, summary: recordings.summary }).from(recordings).where(eq(recordings.id, id));
    return { ...summary, ...extra };
  }

  private async owned(tx: Tx, ownerId: string, id: string): Promise<Recording> {
    const [rec] = await tx.select().from(recordings).where(eq(recordings.id, id));
    if (!rec || rec.ownerId !== ownerId) throw new NotFoundException('Recording not found');
    return rec;
  }

  private ownedUnfinished(p: BoardPrincipal, id: string): Promise<Recording> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rec = await this.owned(tx, p.teacherId, id);
      if (rec.finishedAt) throw new BadRequestException('This recording is already finished');
      return rec;
    });
  }

  private async viewable(tx: Tx, p: Viewer, id: string): Promise<Recording> {
    const [rec] = await tx.select().from(recordings).where(eq(recordings.id, id));
    const ok = rec && (p.kind === 'board' ? rec.ownerId === p.teacherId : await canSeeClassItem(tx, p, rec));
    if (!ok) throw new NotFoundException('Recording not found');
    // Families see a recording only once it is complete.
    if (!rec.finishedAt && rec.ownerId !== (p.kind === 'board' ? p.teacherId : p.userId)) throw new NotFoundException('Recording not found');
    return rec;
  }
}

/** Recording retention for the principal and the administrator. */
@Controller('v1/admin/recordings')
export class RecordingsAdminController {
  constructor(
    private readonly db: DbService,
    private readonly retention: RetentionService,
  ) {}

  /** Per class: recordings deleted in the next 30 days; and the recordings without a term (kept). */
  @Get('retention')
  @Auth('user', STAFF_ADMIN_ROLES)
  overview(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.retention.overview(tx));
  }
}

/**
 * A shared lecture video for whoever holds the link (the QR code on the board): a small page
 * that plays it, its details, and the video itself with Range support. Expired or revoked links
 * answer 404 like unknown ones.
 */
@Controller('v1/public/recordings')
export class RecordingLinksController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly storage: ObjectStorage,
    private readonly recs: RecordingsService,
    private readonly clock: Clock,
  ) {}

  @Get(':slug/:token')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  @Header('content-security-policy', "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'")
  async page(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string) {
    const { rec } = await this.resolve(slug, token, ip);
    const title = escapeHtml(rec.title);
    const sub = escapeHtml([rec.subjectName, rec.sectionName, rec.teacherName].filter(Boolean).join(' · '));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Zynetix</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0f1115;color:#eef0f3}main{max-width:960px;margin:0 auto;padding:16px}video{width:100%;border-radius:12px;background:#000}h1{font-size:1.25rem;margin:12px 0 4px}p{margin:0;color:#a9b0bb}</style></head>
<body><main><video controls playsinline preload="metadata" src="${escapeHtml(token)}/video"></video><h1>${title}</h1><p>${sub}</p><p>Zynetix lesson recording</p></main></body></html>`;
  }

  @Get(':slug/:token/info')
  async info(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string) {
    const { rec, expiresAt } = await this.resolve(slug, token, ip);
    return { id: rec.id, title: rec.title, startedAt: rec.startedAt, durationMs: rec.durationMs, subjectName: rec.subjectName, sectionName: rec.sectionName, teacherName: rec.teacherName, expiresAt };
  }

  @Get(':slug/:token/video')
  @Header('accept-ranges', 'bytes')
  @Header('cache-control', 'private, max-age=3600')
  async video(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string, @Req() req: Request, @Res() res: Response) {
    const { video } = await this.resolve(slug, token, ip, 600);
    await sendRanged(this.storage, req, res, video.key, video.bytes, video.mime);
  }

  private async resolve(slug: string, token: string, ip: string, perMinute = 60) {
    await this.limiter.hit(`rec-link:${ip}`, perMinute, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) && /^[0-9a-f]{32}$/.test(token) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('This link has expired or does not exist');
    const found = await this.db.withTenant(tenant.id, async (tx) => {
      const [link] = await tx.select().from(recordingShareLinks).where(eq(recordingShareLinks.tokenHash, hashToken(token)));
      if (!link || link.revokedAt || link.expiresAt <= this.clock.now()) return undefined;
      const [row] = await tx.select().from(recordings).where(eq(recordings.id, link.recordingId));
      if (!row?.videoKey || !row.finishedAt || !row.sharedAt) return undefined;
      const [rec] = await this.recs.summaries(tx).where(eq(recordings.id, row.id));
      return { rec, expiresAt: link.expiresAt, video: { key: row.videoKey, bytes: row.videoBytes, mime: row.videoMime ?? 'video/mp4' } };
    });
    if (!found) throw new NotFoundException('This link has expired or does not exist');
    return found;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const chunkKey = (tenantId: string, id: string, n: number) => `tenants/${tenantId}/recordings/${id}/video-chunks/${String(n).padStart(5, '0')}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Streams a stored object, honouring a single `Range: bytes=` request (206 / 416). */
async function sendRanged(storage: ObjectStorage, req: Request, res: Response, key: string, size: number, mime: string): Promise<void> {
  res.setHeader('content-type', mime);
  res.setHeader('accept-ranges', 'bytes');
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
    const { stream } = await storage.get(key, { start, end });
    res.status(206).setHeader('content-range', `bytes ${start}-${end}/${size}`);
    res.setHeader('content-length', end - start + 1);
    stream.pipe(res);
    return;
  }
  const { stream } = await storage.get(key);
  res.setHeader('content-length', size);
  stream.pipe(res);
}

/** Reads a raw request body up to a limit. */
async function readBody(req: Request, max: number): Promise<Buffer> {
  // Sent as application/json, the global JSON parser has already read it (up to its own limit).
  if (req.readableEnded && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Buffer.from(JSON.stringify(req.body));
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new PayloadTooLargeException('Upload is too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}
