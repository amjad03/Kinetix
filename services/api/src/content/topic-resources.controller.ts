import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import type { Language } from '@kinetix/shared';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { chapters, courses, subjects, topics } from '../db/schema.js';
import { topicMaterials, type Audience } from '../db/schema-zynetix.js';
import { ANIMATIONS } from './animations.js';
import { ConceptVideosService, LANGUAGES } from './concept-videos.service.js';
import { ContentService } from './content.service.js';
import { curriculumFits, topicLicensed } from './licensing.js';
import { MaterialBody, MaterialEdit, MaterialOrder, ReviewBody, TopicMaterialsService } from './topic-materials.service.js';

const ADMINS: RoleName[] = [...STAFF_ADMIN_ROLES, 'tenant_admin'];
const EDITORS: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

type Who = UserPrincipal | BoardPrincipal;

/** Which app is asking: the board, a teacher (staff), a student or a parent. Administrators see every audience. */
export function audienceOf(p: Who): Audience | 'all' {
  if (p.kind === 'board') return 'board';
  if (p.roles.some((r) => ADMINS.includes(r))) return 'all';
  if (p.roles.includes('student')) return 'student';
  if (p.roles.includes('guardian') && !p.roles.some((r) => EDITORS.includes(r))) return 'parent';
  return 'teacher';
}

const isAdmin = (p: Who) => p.kind === 'user' && p.roles.some((r) => ADMINS.includes(r));

/**
 * Everything a topic is taught with, in one read for the board and the Teacher, Student and
 * Parent apps: videos (platform, institution and the viewer's teacher videos), materials (PDFs,
 * books with chapter and pages, syllabus documents, links, 3D models, sims), the board's built-in
 * animations and the topic's own 3D models and labs. Only approved materials meant for the
 * viewer's app are listed. Teachers add materials for approval; administrators add, review,
 * order and remove them.
 */
@Controller('v1')
export class TopicResourcesController {
  constructor(
    private readonly db: DbService,
    private readonly videos: ConceptVideosService,
    private readonly materials: TopicMaterialsService,
    private readonly content: ContentService,
  ) {}

  @Get('topics/:id/resources')
  @Auth(['user', 'board'])
  resources(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string) {
    if (lang && !(LANGUAGES as string[]).includes(lang)) throw new BadRequestException('lang must be en, hi or kn');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const topic = await this.topic(tx, id);
      const language = (lang as Language | undefined) ?? topic.course.language;
      const userId = p.kind === 'board' ? p.teacherId : p.userId;
      const viewer = await this.videos.viewer(tx, userId, isAdmin(p));
      const [videos, mats] = await Promise.all([this.videos.forTopics(tx, [id], language, viewer), this.materials.visible(tx, [id], audienceOf(p))]);
      const strip = ({ createdBy: _c, createdByName: _n, status: _s, reviewReason: _r, topicId: _t, ...m }: (typeof mats)[number]) => m;
      const { resources, ...rest } = topic;
      return {
        topic: rest,
        language,
        videos,
        materials: mats.filter((m) => m.kind !== 'animation').map(strip),
        animations: mats.filter((m) => m.kind === 'animation').map((m) => ({ id: m.ref!, title: m.title, materialId: m.id, source: m.source })),
        builtIn: resources,
      };
    });
  }

  /**
   * A subject's syllabus outline (units and topics) with how many videos, materials and
   * animations each topic has, for the apps' subject screens. `course: null` when the subject is
   * not linked to a course yet.
   */
  @Get('subjects/:id/outline')
  @Auth(['user', 'board'])
  outline(@CurrentPrincipal() p: Who, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [subject] = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, term: subjects.term, courseId: subjects.courseId }).from(subjects).where(eq(subjects.id, id));
      if (!subject) throw new NotFoundException('Subject not found');
      const { courseId, ...s } = subject;
      const course = courseId ? await this.content.outline(tx, courseId) : null;
      if (!course) return { subject: s, course: null };
      const ids = course.chapters.flatMap((c) => c.topics.map((t) => t.id));
      const audience = audienceOf(p);
      const userId = p.kind === 'board' ? p.teacherId : p.userId;
      const viewer = await this.videos.viewer(tx, userId, isAdmin(p));
      const [vids, mats] = await Promise.all([this.videos.forTopics(tx, ids, 'en', viewer), this.materials.visible(tx, ids, audience)]);
      const count = (topicId: string) => ({
        videos: vids.filter((v) => v.topicId === topicId).length,
        materials: mats.filter((m) => m.topicId === topicId && m.kind !== 'animation').length,
        animations: mats.filter((m) => m.topicId === topicId && m.kind === 'animation').length,
      });
      return { subject: s, course: { ...course, chapters: course.chapters.map((c) => ({ ...c, topics: c.topics.map((t) => ({ id: t.id, title: t.title, own: t.own, counts: count(t.id) })) })) } };
    });
  }

  /** The built-in animation catalogue, for the material picker. */
  @Get('topics/animations')
  @Auth(['user', 'board'])
  animations() {
    return Object.entries(ANIMATIONS).map(([id, title]) => ({ id, title }));
  }

  /** The topic's materials for managing: the global library's (read-only here) and the institution's, with their review status. */
  @Get('topics/:id/materials')
  @Auth('user', [...EDITORS, ...ADMINS])
  list(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.topic(tx, id);
      const rows = await this.materials.list(tx, [id]);
      return isAdmin(p) ? rows : rows.filter((m) => m.status === 'approved' || m.createdBy === p.userId);
    });
  }

  /** Adds a material: an administrator's is shown at once, a teacher's after an administrator approves it. */
  @Post('topics/:id/materials')
  @Auth('user', [...EDITORS, ...ADMINS])
  add(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaterialBody)) b: z.infer<typeof MaterialBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const topic = await this.topic(tx, id);
      const m = await this.materials.add(tx, id, b, { scope: 'institution', tenantId: p.tenantId, userId: p.userId, approved: isAdmin(p), language: topic.course.language });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'topic_material.added', subjectType: 'topic', subjectId: id, data: { materialId: m.id, kind: m.kind, status: m.status } });
      return m;
    });
  }

  @Put('topics/:id/materials/order')
  @Auth('user', ADMINS)
  reorder(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaterialOrder)) b: z.infer<typeof MaterialOrder>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await this.materials.reorder(tx, id, 'institution', b.ids);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'topic_material.reordered', subjectType: 'topic', subjectId: id });
      return rows;
    });
  }

  /** Teachers' materials waiting for an administrator, oldest first. */
  @Get('topic-materials/pending')
  @Auth('user', ADMINS)
  pending(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: topicMaterials.id, topicId: topicMaterials.topicId, topic: topics.title })
        .from(topicMaterials)
        .innerJoin(topics, eq(topics.id, topicMaterials.topicId))
        .where(and(eq(topicMaterials.scope, 'institution'), eq(topicMaterials.status, 'pending')))
        .orderBy(asc(topicMaterials.createdAt));
      const full = await this.materials.list(tx, [...new Set(rows.map((r) => r.topicId))], eq(topicMaterials.status, 'pending'));
      return full.map((m) => ({ ...m, topic: rows.find((r) => r.id === m.id)?.topic ?? null }));
    });
  }

  @Patch('topic-materials/:id')
  @Auth('user', [...EDITORS, ...ADMINS])
  edit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaterialEdit)) b: z.infer<typeof MaterialEdit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.materials.edit(tx, id, 'institution', b, isAdmin(p) ? null : p.userId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'topic_material.edited', subjectType: 'topic', subjectId: m.topicId, data: { materialId: id } });
      return m;
    });
  }

  @Delete('topic-materials/:id')
  @HttpCode(204)
  @Auth('user', [...EDITORS, ...ADMINS])
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.materials.remove(tx, id, 'institution', isAdmin(p) ? null : p.userId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'topic_material.removed', subjectType: 'topic', subjectId: m.topicId, data: { materialId: id, title: m.title } });
    });
  }

  /** Approves a teacher's material (shown to its audiences) or rejects it with a reason. */
  @Post('topic-materials/:id/review')
  @HttpCode(200)
  @Auth('user', ADMINS)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    if (!b.approve && !b.reason) throw new BadRequestException('Give a reason for rejecting it');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx
        .update(topicMaterials)
        .set({ status: b.approve ? 'approved' : 'rejected', reviewReason: b.approve ? null : b.reason!, reviewedBy: p.userId, reviewedAt: new Date() })
        .where(and(eq(topicMaterials.id, id), eq(topicMaterials.scope, 'institution')))
        .returning({ id: topicMaterials.id, topicId: topicMaterials.topicId, status: topicMaterials.status, reviewReason: topicMaterials.reviewReason });
      if (!m) throw new NotFoundException('Material not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `topic_material.${m.status}`, subjectType: 'topic', subjectId: m.topicId, data: { materialId: id, reason: b.reason ?? null } });
      return m;
    });
  }

  /** The topic with its unit and course, when it is in this institution's library. */
  private async topic(tx: Tx, id: string) {
    const [t] = await tx
      .select({
        id: topics.id,
        title: topics.title,
        summary: topics.summary,
        resources: topics.resources,
        chapter: { id: chapters.id, title: chapters.title },
        course: { id: courses.id, title: courses.title, language: courses.language },
      })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .where(and(eq(topics.id, id), topicLicensed(topics.id, courses.id), curriculumFits(courses.curriculumCode)));
    if (!t) throw new NotFoundException('Topic not found');
    return t as typeof t & { course: { language: Language } };
  }
}
