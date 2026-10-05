import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { ConceptVideo, Language, PlatformCourseTree, PlatformLibraryCurriculum, PlaylistPreview } from '@kinetix/shared';
import { and, asc, eq, ilike, inArray, isNull, max, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chapters, conceptVideos, courses, curricula, topics } from '../db/schema.js';
import { bestTopicFor } from './matching.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { parsePlaylistId, parseYouTubeId, PlaylistNotFoundError, PlaylistsUnavailableError, YouTube } from './youtube.js';

const Lang = z.enum(['en', 'hi', 'kn']);
const Title = z.string().trim().min(1).max(200);

const AddBody = z.object({ url: z.string().trim().min(1).max(500), language: Lang.optional(), title: Title.optional() });
const EditBody = z.object({ title: Title.optional(), language: Lang.optional() }).refine((b) => b.title !== undefined || b.language !== undefined, 'Nothing to change');
const OrderBody = z.object({ ids: z.array(z.uuid()).min(1).max(100) });
const PreviewBody = z.object({ url: z.string().trim().min(1).max(500), chapterId: z.uuid() });
const ImportBody = z.object({
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/),
  chapterId: z.uuid(),
  language: Lang,
  items: z
    .array(z.object({ youtubeVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), title: Title, topicId: z.uuid(), durationSeconds: z.number().int().positive().nullable().optional() }))
    .min(1)
    .max(200),
});

const VIDEO = {
  id: conceptVideos.id,
  topicId: conceptVideos.topicId,
  youtubeVideoId: conceptVideos.youtubeVideoId,
  title: conceptVideos.title,
  language: conceptVideos.language,
  durationSeconds: conceptVideos.durationSeconds,
  channelTitle: conceptVideos.channelTitle,
  position: conceptVideos.position,
};

/**
 * The KINETIX platform team's area: concept videos on the global library, shared by every
 * institution. Only people in platform_admins get in (PlatformAdminGuard); institutions' own
 * chapters and topics are never shown here. Writes use the owner role, because the app role may
 * only read concept_videos (migration 0034).
 */
@Controller('v1/platform')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly db: DbService,
    @Inject(YouTube) private readonly youtube: YouTube,
  ) {}

  /** For the ERP: whether to show the Platform area, and whether playlist import is possible. */
  @Get('me')
  me() {
    return { platformAdmin: true, playlistImport: this.youtube.canListPlaylists };
  }

  /** Every curriculum and course, with how many of its topics have videos. */
  @Get('library')
  async library(): Promise<PlatformLibraryCurriculum[]> {
    const db = this.db.system;
    const [cs, rows] = await Promise.all([
      db.select().from(curricula).orderBy(asc(curricula.name)),
      db
        .select({
          id: courses.id,
          curriculumCode: courses.curriculumCode,
          code: courses.code,
          title: courses.title,
          term: courses.term,
          language: courses.language,
          topics: sql<number>`count(distinct ${topics.id})::int`,
          topicsWithVideos: sql<number>`count(distinct ${conceptVideos.topicId})::int`,
          videos: sql<number>`count(${conceptVideos.id})::int`,
        })
        .from(courses)
        .leftJoin(chapters, and(eq(chapters.courseId, courses.id), isNull(chapters.tenantId)))
        .leftJoin(topics, and(eq(topics.chapterId, chapters.id), isNull(topics.tenantId)))
        .leftJoin(conceptVideos, eq(conceptVideos.topicId, topics.id))
        .groupBy(courses.id)
        .orderBy(asc(courses.term), asc(courses.title)),
    ]);
    return cs.map((c) => ({ ...c, courses: rows.filter((r) => r.curriculumCode === c.code).map(({ curriculumCode: _c, ...r }) => r) }));
  }

  /** A course's global chapters and topics with each topic's number of videos. */
  @Get('library/courses/:id')
  async course(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformCourseTree> {
    const db = this.db.system;
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    if (!course) throw new NotFoundException('Course not found');
    const chs = await db.select({ id: chapters.id, title: chapters.title }).from(chapters).where(and(eq(chapters.courseId, id), isNull(chapters.tenantId))).orderBy(asc(chapters.position));
    const tps = chs.length
      ? await db
          .select({ id: topics.id, chapterId: topics.chapterId, title: topics.title, videos: sql<number>`count(${conceptVideos.id})::int` })
          .from(topics)
          .leftJoin(conceptVideos, eq(conceptVideos.topicId, topics.id))
          .where(and(inArray(topics.chapterId, chs.map((c) => c.id)), isNull(topics.tenantId)))
          .groupBy(topics.id)
          .orderBy(asc(topics.position))
      : [];
    return {
      id: course.id,
      curriculumCode: course.curriculumCode,
      code: course.code,
      title: course.title,
      term: course.term,
      language: course.language,
      chapters: chs.map((c) => ({ ...c, topics: tps.filter((t) => t.chapterId === c.id).map(({ chapterId: _c, ...t }) => t) })),
    };
  }

  /** Global topics by title, chapter or course title. `missing=true`: only topics without videos. */
  @Get('library/search')
  async search(@Query('q') q = '', @Query('missing') missing?: string) {
    const term = q.trim();
    if (term.length < 2) return [];
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db.system
      .select({
        id: topics.id,
        title: topics.title,
        chapter: { id: chapters.id, title: chapters.title },
        course: { id: courses.id, title: courses.title, curriculumCode: courses.curriculumCode },
        videos: sql<number>`count(${conceptVideos.id})::int`,
      })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .leftJoin(conceptVideos, eq(conceptVideos.topicId, topics.id))
      .where(and(isNull(topics.tenantId), isNull(chapters.tenantId), or(ilike(topics.title, like), ilike(chapters.title, like), ilike(courses.title, like))))
      .groupBy(topics.id, chapters.id, courses.id)
      .orderBy(asc(courses.title), asc(chapters.position), asc(topics.position))
      .limit(50);
    return missing === 'true' ? rows.filter((r) => r.videos === 0) : rows;
  }

  /** A topic and its videos in the platform team's order. */
  @Get('topics/:id/videos')
  async videos(@Param('id', ParseUUIDPipe) id: string) {
    const topic = await this.globalTopic(this.db.system, id);
    return { topic, videos: await this.list(this.db.system, id) };
  }

  /** Adds a video from any YouTube link. The title comes from YouTube unless one is given. */
  @Post('topics/:id/videos')
  async add(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AddBody)) b: z.infer<typeof AddBody>): Promise<ConceptVideo> {
    const videoId = parseYouTubeId(b.url);
    if (!videoId) throw new BadRequestException('That is not a YouTube video link');
    const topic = await this.globalTopic(this.db.system, id);
    const info = await this.youtube.videoInfo(videoId);
    const title = b.title ?? info?.title;
    if (!title) throw new BadRequestException("Couldn't get the video's title from YouTube. Type a title and add it again.");
    return this.db.system.transaction(async (tx) => {
      await this.assertNotOnTopic(tx, id, [videoId]);
      const [{ last }] = await tx.select({ last: max(conceptVideos.position) }).from(conceptVideos).where(eq(conceptVideos.topicId, id));
      const [v] = await tx
        .insert(conceptVideos)
        .values({
          topicId: id,
          youtubeVideoId: videoId,
          title: title.slice(0, 200),
          language: b.language ?? topic.courseLanguage,
          durationSeconds: info?.durationSeconds ?? null,
          channelTitle: info?.channelTitle ?? null,
          position: (last ?? 0) + 1,
          createdBy: p.userId,
        })
        .returning(VIDEO);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.concept_video.added', subjectType: 'topic', subjectId: id, data: { youtubeVideoId: videoId } });
      return v as ConceptVideo;
    });
  }

  @Patch('videos/:id')
  async edit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EditBody)) b: z.infer<typeof EditBody>): Promise<ConceptVideo> {
    return this.db.system.transaction(async (tx) => {
      const [v] = await tx.update(conceptVideos).set(b).where(eq(conceptVideos.id, id)).returning(VIDEO);
      if (!v) throw new NotFoundException('Video not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.concept_video.edited', subjectType: 'topic', subjectId: v.topicId, data: { videoId: id, ...b } });
      return v as ConceptVideo;
    });
  }

  @Delete('videos/:id')
  @HttpCode(204)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.db.system.transaction(async (tx) => {
      const [v] = await tx.delete(conceptVideos).where(eq(conceptVideos.id, id)).returning(VIDEO);
      if (!v) throw new NotFoundException('Video not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.concept_video.removed', subjectType: 'topic', subjectId: v.topicId, data: { youtubeVideoId: v.youtubeVideoId } });
    });
  }

  /** The topic's videos in a new order: every video of the topic, once. */
  @Put('topics/:id/videos/order')
  async reorder(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OrderBody)) b: z.infer<typeof OrderBody>): Promise<ConceptVideo[]> {
    return this.db.system.transaction(async (tx) => {
      await this.globalTopic(tx, id);
      const current = await tx.select({ id: conceptVideos.id }).from(conceptVideos).where(eq(conceptVideos.topicId, id));
      const ids = new Set(b.ids);
      if (ids.size !== b.ids.length || ids.size !== current.length || current.some((c) => !ids.has(c.id))) throw new BadRequestException("List each of the topic's videos once");
      for (const [i, vid] of b.ids.entries()) await tx.update(conceptVideos).set({ position: i + 1 }).where(eq(conceptVideos.id, vid));
      return this.list(tx, id);
    });
  }

  /**
   * A playlist's videos (YouTube Data API, needs YOUTUBE_API_KEY) with the chapter's topics and,
   * for each video, the topic its title matches best. Nothing is saved until the import.
   */
  @Post('playlists/preview')
  @HttpCode(200)
  async preview(@Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>): Promise<PlaylistPreview> {
    const playlistId = parsePlaylistId(b.url);
    if (!playlistId) throw new BadRequestException('That is not a YouTube playlist link');
    const db = this.db.system;
    const [chapter] = await db.select({ id: chapters.id, title: chapters.title }).from(chapters).where(and(eq(chapters.id, b.chapterId), isNull(chapters.tenantId)));
    if (!chapter) throw new NotFoundException('Chapter not found');
    const chapterTopics = await db.select({ id: topics.id, title: topics.title, summary: topics.summary }).from(topics).where(and(eq(topics.chapterId, chapter.id), isNull(topics.tenantId))).orderBy(asc(topics.position));
    let items;
    try {
      items = await this.youtube.playlistVideos(playlistId);
    } catch (e) {
      if (e instanceof PlaylistsUnavailableError) throw new ServiceUnavailableException(e.message);
      if (e instanceof PlaylistNotFoundError) throw new NotFoundException(e.message);
      throw new ServiceUnavailableException("Couldn't reach YouTube. Try again in a minute.");
    }
    const details = await this.youtube.videoDetails(items.map((i) => i.videoId)).catch(() => new Map<string, { durationSeconds: number | null }>());
    const existing = items.length
      ? await db
          .select({ youtubeVideoId: conceptVideos.youtubeVideoId, topicId: conceptVideos.topicId })
          .from(conceptVideos)
          .where(inArray(conceptVideos.youtubeVideoId, items.map((i) => i.videoId)))
      : [];
    return {
      playlistId,
      chapter,
      topics: chapterTopics.map(({ id, title }) => ({ id, title })),
      videos: items.map((i) => ({
        youtubeVideoId: i.videoId,
        title: i.title,
        position: i.position,
        durationSeconds: details.get(i.videoId)?.durationSeconds ?? null,
        suggestedTopicId: bestTopicFor(i.title, chapterTopics),
        alreadyOn: existing.filter((x) => x.youtubeVideoId === i.videoId).map((x) => x.topicId),
      })),
    };
  }

  /** Adds the chosen playlist videos to the chapter's topics. A video already on its topic is skipped. */
  @Post('playlists/import')
  async import(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    return this.db.system.transaction(async (tx) => {
      const allowed = new Set(
        (
          await tx
            .select({ id: topics.id })
            .from(topics)
            .innerJoin(chapters, eq(chapters.id, topics.chapterId))
            .where(and(eq(chapters.id, b.chapterId), isNull(chapters.tenantId), isNull(topics.tenantId)))
        ).map((t) => t.id),
      );
      if (b.items.some((i) => !allowed.has(i.topicId))) throw new BadRequestException('Some topics are not in this chapter');
      let added = 0;
      let skipped = 0;
      for (const i of b.items) {
        const [{ last }] = await tx.select({ last: max(conceptVideos.position) }).from(conceptVideos).where(eq(conceptVideos.topicId, i.topicId));
        const rows = await tx
          .insert(conceptVideos)
          .values({ topicId: i.topicId, youtubeVideoId: i.youtubeVideoId, title: i.title, language: b.language, durationSeconds: i.durationSeconds ?? null, playlistId: b.playlistId, position: (last ?? 0) + 1, createdBy: p.userId })
          .onConflictDoNothing()
          .returning({ id: conceptVideos.id });
        if (rows.length) added++;
        else skipped++;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.concept_video.imported', subjectType: 'chapter', subjectId: b.chapterId, data: { playlistId: b.playlistId, added, skipped } });
      return { added, skipped };
    });
  }

  // ----------------------------------------------------------------------------------------

  private list(db: Tx | DbService['system'], topicId: string): Promise<ConceptVideo[]> {
    return db.select(VIDEO).from(conceptVideos).where(eq(conceptVideos.topicId, topicId)).orderBy(asc(conceptVideos.position)) as Promise<ConceptVideo[]>;
  }

  /** A topic of the global library (never an institution's own), with its course's language. */
  private async globalTopic(db: Tx | DbService['system'], id: string) {
    const [t] = await db
      .select({ id: topics.id, title: topics.title, chapter: { id: chapters.id, title: chapters.title }, course: { id: courses.id, title: courses.title }, courseLanguage: courses.language })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .where(and(eq(topics.id, id), isNull(topics.tenantId)));
    if (!t) throw new NotFoundException('Topic not found in the KINETIX library');
    return t as typeof t & { courseLanguage: Language };
  }

  private async assertNotOnTopic(tx: Tx, topicId: string, videoIds: string[]) {
    const [dup] = await tx.select({ id: conceptVideos.id }).from(conceptVideos).where(and(eq(conceptVideos.topicId, topicId), inArray(conceptVideos.youtubeVideoId, videoIds)));
    if (dup) throw new ConflictException('This video is already on this topic');
  }
}
