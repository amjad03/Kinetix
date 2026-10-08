import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { chapters, conceptVideos, courses, topics, tenants } from '../db/schema.js';
import { contentLicenses } from '../db/schema-foundation.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

const LicenceBody = z.object({
  contentType: z.enum(['course', 'topic', 'concept_video']),
  contentId: z.uuid(),
  rightsHolder: z.string().trim().min(1).max(200),
  licence: z.string().trim().min(1).max(200),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-03-31').nullable().default(null),
  /** Institutions allowed to see it; empty = all. */
  allowedTenants: z.array(z.uuid()).max(500).default([]),
  notes: z.string().trim().max(1000).default(''),
});

/**
 * Rights metadata on global library content (rights holder, licence, expiry, allowed institutions).
 * Institutions never see items whose licence expired or excludes them: course and topic lists, the
 * syllabus, search and concept-video lists all filter with content/licensing.ts. Written with the
 * owner role, like the rest of the platform area.
 */
@Controller('v1/platform/content-licenses')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class ContentLicensesController {
  constructor(private readonly db: DbService) {}

  @Get()
  list(@Query('contentType') contentType?: string) {
    const t = z.enum(['course', 'topic', 'concept_video']).safeParse(contentType);
    return this.db.system.select().from(contentLicenses).where(t.success ? eq(contentLicenses.contentType, t.data) : undefined).orderBy(asc(contentLicenses.contentType), asc(contentLicenses.rightsHolder));
  }

  /** Sets (or replaces) the licence of one item. */
  @Put()
  async upsert(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LicenceBody)) b: z.infer<typeof LicenceBody>) {
    const db = this.db.system;
    const table = { course: courses, topic: topics, concept_video: conceptVideos }[b.contentType];
    const [exists] = await db.select({ id: table.id }).from(table).where(eq(table.id, b.contentId));
    if (!exists) throw new NotFoundException('That library item does not exist');
    if (b.allowedTenants.length) {
      const known = await db.select({ id: tenants.id }).from(tenants);
      const ids = new Set(known.map((k) => k.id));
      if (b.allowedTenants.some((t) => !ids.has(t))) throw new NotFoundException('One of the institutions does not exist');
    }
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contentLicenses)
        .values(b)
        .onConflictDoUpdate({ target: [contentLicenses.contentType, contentLicenses.contentId], set: { rightsHolder: b.rightsHolder, licence: b.licence, expiresOn: b.expiresOn, allowedTenants: b.allowedTenants, notes: b.notes, updatedAt: new Date() } })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'content.licence_set', subjectType: b.contentType, subjectId: b.contentId, data: { rightsHolder: b.rightsHolder, licence: b.licence, expiresOn: b.expiresOn, allowedTenants: b.allowedTenants.length } });
      return row;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.system.transaction(async (tx) => {
      const [row] = await tx.delete(contentLicenses).where(eq(contentLicenses.id, id)).returning();
      if (!row) throw new NotFoundException('Licence not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'content.licence_removed', subjectType: row.contentType, subjectId: row.contentId });
    });
  }
}
