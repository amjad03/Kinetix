import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import type { Language, ManagedConceptVideo, PeriodConceptVideos, TopicConceptVideos, TopicVideoCount } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, devices } from '../db/schema.js';
import { parseYouTubeId } from '../platform/youtube.js';
import { ConceptVideosService, LANGUAGES, type VideoActor, type VideoViewer } from './concept-videos.service.js';

const Lang = z.enum(['en', 'hi', 'kn']);
const Scope = z.enum(['institution', 'teacher']);
const AddBody = z.object({
  url: z.string().trim().min(1).max(500),
  scope: Scope,
  language: Lang.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  sectionIds: z.array(z.uuid()).max(50).optional(),
});
const EditBody = z
  .object({ title: z.string().trim().min(1).max(200).optional(), language: Lang.optional(), sectionIds: z.array(z.uuid()).max(50).optional() })
  .refine((b) => b.title !== undefined || b.language !== undefined || b.sectionIds !== undefined, 'Nothing to change');
const OrderBody = z.object({ scope: Scope, ids: z.array(z.uuid()).min(1).max(100) });
const RejectBody = z.object({ reason: z.string().trim().min(1).max(500) });

type Who = UserPrincipal | BoardPrincipal;

/** What a signed-in person may do with videos: admins for the institution, teachers (and a board's teacher) for their classes. */
function actor(p: Who): VideoActor {
  if (p.kind === 'board') return { userId: p.teacherId, admin: false, teacher: true };
  return { userId: p.userId, admin: p.roles.some((r) => STAFF_ADMIN_ROLES.includes(r)), teacher: p.roles.some((r) => TEACHING_ROLES.includes(r)) };
}

function language(lang: string | undefined): Language | undefined {
  if (!lang) return undefined;
  if (!(LANGUAGES as string[]).includes(lang)) throw new BadRequestException('lang must be en, hi or kn');
  return lang as Language;
}

/**
 * Concept videos for the apps: a topic's videos (board, Student App, Teacher App) and the board's
 * suggestion at the start of a period. Played with YouTube's embedded player; nothing is
 * downloaded or stored on the device.
 */
@Controller('v1')
export class ConceptVideosController {
  constructor(
    private readonly db: DbService,
    private readonly videos: ConceptVideosService,
  ) {}

  /** A topic's videos: `lang` first (default: the topic's course language), then English, then the rest. */
  @Get('content/topics/:id/videos')
  @Auth(['user', 'board'])
  topic(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string): Promise<TopicConceptVideos> {
    const preferred = language(lang);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const courseLanguage = await this.videos.topicLanguage(tx, id);
      if (!courseLanguage) throw new NotFoundException('Topic not found');
      const l = preferred ?? courseLanguage;
      return { topicId: id, language: l, videos: await this.videos.forTopics(tx, [id], l, await this.viewerOf(tx, p)) };
    });
  }

  private viewerOf(tx: Tx, p: Who): Promise<VideoViewer> {
    const a = actor(p);
    return this.videos.viewer(tx, a.userId, a.admin);
  }

  /** The videos you manage on a topic: an admin's institution and teacher videos, or a teacher's own. */
  @Get('content/topics/:id/videos/mine')
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'tenant_admin'])
  mine(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string): Promise<ManagedConceptVideo[]> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.mine(tx, actor(p), id));
  }

  /** Adds a video from a pasted YouTube link; the title comes from YouTube (oEmbed) unless one is given. */
  @Post('content/topics/:id/videos')
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'tenant_admin'])
  add(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AddBody)) b: z.infer<typeof AddBody>): Promise<ManagedConceptVideo> {
    const videoId = parseYouTubeId(b.url);
    if (!videoId) throw new BadRequestException('That is not a YouTube video link');
    return this.db.withTenant(p.tenantId, (tx) => this.videos.add(tx, p.tenantId, actor(p), id, videoId, b));
  }

  /** The actor's videos of one scope on the topic, in a new order. */
  @Put('content/topics/:id/videos/order')
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'tenant_admin'])
  order(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OrderBody)) b: z.infer<typeof OrderBody>): Promise<ManagedConceptVideo[]> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.reorder(tx, actor(p), id, b.scope, b.ids));
  }

  @Patch('content/videos/:id')
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'tenant_admin'])
  edit(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EditBody)) b: z.infer<typeof EditBody>): Promise<ManagedConceptVideo> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.edit(tx, p.tenantId, actor(p), id, b));
  }

  @Delete('content/videos/:id')
  @HttpCode(204)
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'tenant_admin'])
  async remove(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.db.withTenant(p.tenantId, (tx) => this.videos.remove(tx, p.tenantId, actor(p), id));
  }

  /** A teacher asks for their video to be shown to the whole institution; an admin approves or rejects it. */
  @Post('content/videos/:id/share')
  @HttpCode(200)
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'tenant_admin'])
  share(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string): Promise<ManagedConceptVideo> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.requestShare(tx, p.tenantId, actor(p), id));
  }

  @Get('content/video-approvals')
  @Auth('user', STAFF_ADMIN_ROLES)
  approvals(@CurrentPrincipal() p: UserPrincipal, @Query('status') status = 'pending'): Promise<ManagedConceptVideo[]> {
    if (status !== 'pending' && status !== 'approved' && status !== 'rejected') throw new BadRequestException('status must be pending, approved or rejected');
    return this.db.withTenant(p.tenantId, (tx) => this.videos.approvals(tx, status));
  }

  @Post('content/videos/:id/approve')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<ManagedConceptVideo> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.review(tx, p.tenantId, actor(p), id, 'approved'));
  }

  @Post('content/videos/:id/reject')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RejectBody)) b: z.infer<typeof RejectBody>): Promise<ManagedConceptVideo> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.review(tx, p.tenantId, actor(p), id, 'rejected', b.reason));
  }

  /** The institution's own videos per topic of a course, for the admin's syllabus tree. */
  @Get('content/video-counts')
  @Auth('user', [...TEACHING_ROLES, 'tenant_admin'])
  counts(@CurrentPrincipal() p: UserPrincipal, @Query('courseId', ParseUUIDPipe) courseId: string): Promise<TopicVideoCount[]> {
    return this.db.withTenant(p.tenantId, (tx) => this.videos.counts(tx, courseId));
  }

  /**
   * The board's period (open class, else the current or next one today) with its topic's
   * videos, for the suggestion card at the start of a period and the Concept videos button.
   */
  @Get('devices/me/concept-videos')
  @Auth(['device', 'board'])
  forBoard(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal, @Query('lang') lang?: string): Promise<PeriodConceptVideos> {
    const preferred = language(lang);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select({ roomId: devices.roomId }).from(devices).where(eq(devices.id, p.deviceId));
      let slotId: string | null = null;
      if (p.kind === 'board') {
        const [s] = await tx.select({ slotId: boardSessions.timetableSlotId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
        slotId = s?.slotId ?? null;
      }
      return this.videos.forBoard(tx, { slotId, teacherId: p.kind === 'board' ? p.teacherId : null, roomId: d?.roomId ?? null }, preferred);
    });
  }
}
