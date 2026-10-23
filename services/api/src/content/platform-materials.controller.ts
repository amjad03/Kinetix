import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { Language } from '@kinetix/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { chapters, courses, topics } from '../db/schema.js';
import { topicMaterials } from '../db/schema-zynetix.js';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { MaterialBody, MaterialEdit, MaterialOrder, TopicMaterialsService } from './topic-materials.service.js';

/**
 * Materials on the global library's topics (PDFs, books, syllabus documents, links, animations,
 * 3D models, sims), shown to every institution. Platform team only; written as the owner role
 * because the app role may not write platform rows.
 */
@Controller('v1/platform')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class PlatformMaterialsController {
  constructor(
    private readonly db: DbService,
    private readonly materials: TopicMaterialsService,
  ) {}

  @Get('topics/:id/materials')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    await this.globalTopic(id);
    return this.materials.list(this.db.system, [id], eq(topicMaterials.scope, 'platform'));
  }

  @Post('topics/:id/materials')
  async add(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaterialBody)) b: z.infer<typeof MaterialBody>) {
    const language = await this.globalTopic(id);
    const m = await this.db.system.transaction((tx) => this.materials.add(tx, id, b, { scope: 'platform', tenantId: null, userId: p.userId, approved: true, language }));
    await this.audit(p, 'platform.topic_material.added', id, { materialId: m.id, kind: m.kind });
    return m;
  }

  @Put('topics/:id/materials/order')
  async reorder(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaterialOrder)) b: z.infer<typeof MaterialOrder>) {
    await this.globalTopic(id);
    const rows = await this.db.system.transaction((tx) => this.materials.reorder(tx, id, 'platform', b.ids));
    await this.audit(p, 'platform.topic_material.reordered', id, {});
    return rows;
  }

  @Patch('materials/:id')
  async edit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaterialEdit)) b: z.infer<typeof MaterialEdit>) {
    const m = await this.db.system.transaction((tx) => this.materials.edit(tx, id, 'platform', b, null));
    await this.audit(p, 'platform.topic_material.edited', m.topicId, { materialId: id });
    return m;
  }

  @Delete('materials/:id')
  @HttpCode(204)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.db.system.transaction((tx) => this.materials.remove(tx, id, 'platform', null));
    await this.audit(p, 'platform.topic_material.removed', m.topicId, { materialId: id, title: m.title });
  }

  /** The global topic's course language; 404 for an institution's own topic. */
  private async globalTopic(id: string): Promise<Language> {
    const [t] = await this.db.system
      .select({ language: courses.language })
      .from(topics)
      .innerJoin(chapters, eq(chapters.id, topics.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .where(and(eq(topics.id, id), isNull(topics.tenantId)));
    if (!t) throw new NotFoundException('Topic not found in the Zynetix library');
    return t.language;
  }

  private audit(p: UserPrincipal, action: string, topicId: string, data: object) {
    return this.db.withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action, subjectType: 'topic', subjectId: topicId, data }));
  }
}
