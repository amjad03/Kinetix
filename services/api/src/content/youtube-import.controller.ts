import { BadRequestException, Body, Controller, HttpCode, Inject, NotFoundException, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, max, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chapters, conceptVideos, courses, topics } from '../db/schema.js';
import { topicMatch } from '../platform/matching.js';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { ChannelNotFoundError, PlaylistNotFoundError, PlaylistsUnavailableError, YouTube, type SourceVideos } from '../platform/youtube.js';

const ADMINS: RoleName[] = [...STAFF_ADMIN_ROLES, 'tenant_admin'];
const PreviewBody = z.object({ url: z.string().trim().min(1).max(500), courseIds: z.array(z.uuid()).min(1).max(20) });
const ImportBody = z.object({
  language: z.enum(['en', 'hi', 'kn']),
  /** The playlist the videos came from, when it was a playlist (kept on each video). */
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/).optional(),
  items: z
    .array(z.object({ youtubeVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), title: z.string().trim().min(1).max(200), topicId: z.uuid() }))
    .min(1)
    .max(500),
});
type Db = Tx | DbService['system'];

/** The topics of the chosen courses that may receive videos, in syllabus order. */
async function courseTopics(db: Db, courseIds: string[], globalOnly: boolean) {
  return db
    .select({ id: topics.id, title: topics.title, summary: topics.summary, chapter: { id: chapters.id, title: chapters.title }, course: { id: courses.id, title: courses.title } })
    .from(topics)
    .innerJoin(chapters, eq(chapters.id, topics.chapterId))
    .innerJoin(courses, eq(courses.id, chapters.courseId))
    .where(and(inArray(courses.id, courseIds), globalOnly ? isNull(topics.tenantId) : undefined))
    .orderBy(asc(courses.title), asc(chapters.position), asc(topics.position));
}

async function fetchSource(youtube: YouTube, url: string): Promise<SourceVideos> {
  let src: SourceVideos | null;
  try {
    src = await youtube.sourceVideos(url);
  } catch (e) {
    if (e instanceof PlaylistsUnavailableError) throw new ServiceUnavailableException(e.message);
    if (e instanceof PlaylistNotFoundError || e instanceof ChannelNotFoundError) throw new NotFoundException(e.message);
    throw new ServiceUnavailableException("Couldn't reach YouTube. Try again in a minute.");
  }
  if (!src) throw new BadRequestException('That is not a YouTube channel or playlist link');
  return src;
}

/** A channel's or playlist's videos, each with the topic its title matches best and the topics it is already on. */
async function preview(db: Db, youtube: YouTube, b: z.infer<typeof PreviewBody>, globalOnly: boolean, scope: SQL) {
  const tps = await courseTopics(db, b.courseIds, globalOnly);
  if (tps.length === 0) throw new NotFoundException('Those courses have no topics yet');
  const src = await fetchSource(youtube, b.url);
  const ids = src.videos.map((v) => v.videoId);
  const existing = ids.length
    ? await db.select({ youtubeVideoId: conceptVideos.youtubeVideoId, topicId: conceptVideos.topicId }).from(conceptVideos).where(and(scope, inArray(conceptVideos.youtubeVideoId, ids)))
    : [];
  return {
    source: src.source,
    via: src.via,
    topics: tps.map(({ summary: _s, ...t }) => t),
    videos: src.videos.map((v) => {
      const m = topicMatch(v.title, tps);
      return {
        youtubeVideoId: v.videoId,
        title: v.title,
        position: v.position,
        publishedAt: v.publishedAt ?? null,
        suggestedTopicId: m?.id ?? null,
        score: m?.score ?? 0,
        alreadyOn: existing.filter((x) => x.youtubeVideoId === v.videoId).map((x) => x.topicId),
      };
    }),
  };
}

/** Adds the confirmed videos to their topics; a video already on its topic (same scope) is skipped. */
async function importInto(tx: Tx | DbService['system'], b: z.infer<typeof ImportBody>, allowed: Set<string>, row: { scope: 'platform' | 'institution'; tenantId: string | null; createdBy: string }) {
  if (b.items.some((i) => !allowed.has(i.topicId))) throw new BadRequestException('Some topics are not in the library');
  let added = 0;
  let skipped = 0;
  for (const i of b.items) {
    const own = row.scope === 'platform' ? eq(conceptVideos.scope, 'platform') : and(eq(conceptVideos.scope, 'institution'), eq(conceptVideos.tenantId, row.tenantId!));
    const [dup] = await tx.select({ id: conceptVideos.id }).from(conceptVideos).where(and(own, eq(conceptVideos.topicId, i.topicId), eq(conceptVideos.youtubeVideoId, i.youtubeVideoId)));
    if (dup) {
      skipped++;
      continue;
    }
    const [{ last }] = await tx.select({ last: max(conceptVideos.position) }).from(conceptVideos).where(and(own, eq(conceptVideos.topicId, i.topicId)));
    await tx.insert(conceptVideos).values({
      topicId: i.topicId,
      youtubeVideoId: i.youtubeVideoId,
      title: i.title,
      language: b.language,
      playlistId: b.playlistId ?? null,
      position: (last ?? 0) + 1,
      createdBy: row.createdBy,
      scope: row.scope,
      tenantId: row.tenantId,
    });
    added++;
  }
  return { added, skipped };
}

/**
 * YouTube channel import for the global library (the KINETIX/Zynetix channel): paste a channel
 * link, @handle, id or a playlist link, check the suggested topic for each video, then import the
 * confirmed mapping in one go. Lists every upload with YOUTUBE_API_KEY, else the public feed's
 * latest 15. Owner role, like the rest of the platform area.
 */
@Controller('v1/platform/youtube')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class PlatformYoutubeController {
  constructor(
    private readonly db: DbService,
    @Inject(YouTube) private readonly youtube: YouTube,
  ) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>) {
    return preview(this.db.system, this.youtube, b, true, eq(conceptVideos.scope, 'platform'));
  }

  @Post('import')
  async import(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    const r = await this.db.system.transaction(async (tx) => {
      const ids = [...new Set(b.items.map((i) => i.topicId))];
      const allowed = new Set((await tx.select({ id: topics.id }).from(topics).where(and(inArray(topics.id, ids), isNull(topics.tenantId)))).map((t) => t.id));
      return importInto(tx, b, allowed, { scope: 'platform', tenantId: null, createdBy: p.userId });
    });
    await this.db.withTenant(p.tenantId, (tx) =>
      audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.concept_video.channel_imported', subjectType: 'concept_video', data: { ...r, playlistId: b.playlistId ?? null } }),
    );
    return r;
  }
}

/** The same channel import for an institution's own videos (scope `institution`), by its principal or administrator. */
@Controller('v1/content/youtube')
export class InstitutionYoutubeController {
  constructor(
    private readonly db: DbService,
    @Inject(YouTube) private readonly youtube: YouTube,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @Auth('user', ADMINS)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>) {
    return this.db.withTenant(p.tenantId, (tx) => preview(tx, this.youtube, b, false, and(eq(conceptVideos.scope, 'institution'), eq(conceptVideos.tenantId, p.tenantId))!));
  }

  @Post('import')
  @Auth('user', ADMINS)
  import(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ids = [...new Set(b.items.map((i) => i.topicId))];
      const allowed = new Set((await tx.select({ id: topics.id }).from(topics).where(inArray(topics.id, ids))).map((t) => t.id));
      const r = await importInto(tx, b, allowed, { scope: 'institution', tenantId: p.tenantId, createdBy: p.userId });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'concept_video.institution.channel_imported', subjectType: 'concept_video', data: { ...r, playlistId: b.playlistId ?? null } });
      return r;
    });
  }
}
