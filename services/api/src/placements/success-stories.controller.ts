import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { alumniProfiles } from '../db/schema.js';
import { alumniSuccessStories } from '../db/schema-pathways.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PLACEMENT_ROLES, found } from './placements.access.js';

const StoryBody = z.object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(40).max(5000) });
const ReviewBody = z.object({ decision: z.enum(['publish', 'reject']), note: z.string().trim().max(500).optional(), featured: z.boolean().default(false) });

/** Alumni success stories: an alumnus writes one, the alumni office reviews it, and published stories show in the apps. */
@Controller('v1')
export class SuccessStoriesController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  private async profile(tx: Tx, p: UserPrincipal) {
    const [row] = await tx.select().from(alumniProfiles).where(eq(alumniProfiles.userId, p.userId));
    if (!row) throw new NotFoundException('No alumni profile is linked to your login; ask the alumni office');
    return row;
  }

  @Get('alumni-portal/stories')
  @Auth('user', ['alumni'])
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.profile(tx, p);
      return tx.select().from(alumniSuccessStories).where(eq(alumniSuccessStories.alumniId, a.id)).orderBy(desc(alumniSuccessStories.createdAt));
    });
  }

  @Post('alumni-portal/stories')
  @Auth('user', ['alumni'])
  write(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StoryBody)) b: z.infer<typeof StoryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.profile(tx, p);
      const [row] = await tx.insert(alumniSuccessStories).values({ tenantId: p.tenantId, alumniId: a.id, ...b }).returning();
      return row;
    });
  }

  @Put('alumni-portal/stories/:id')
  @Auth('user', ['alumni'])
  edit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StoryBody)) b: z.infer<typeof StoryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.profile(tx, p);
      const s = found((await tx.select().from(alumniSuccessStories).where(and(eq(alumniSuccessStories.id, id), eq(alumniSuccessStories.alumniId, a.id))))[0], 'Story');
      if (!['draft', 'rejected'].includes(s.status)) throw new ConflictException('A story under review or published cannot be edited');
      const [row] = await tx.update(alumniSuccessStories).set({ ...b, status: 'draft' }).where(eq(alumniSuccessStories.id, id)).returning();
      return row;
    });
  }

  @Post('alumni-portal/stories/:id/submit')
  @HttpCode(200)
  @Auth('user', ['alumni'])
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.profile(tx, p);
      const s = found((await tx.select().from(alumniSuccessStories).where(and(eq(alumniSuccessStories.id, id), eq(alumniSuccessStories.alumniId, a.id))))[0], 'Story');
      if (s.status !== 'draft') throw new ConflictException('Only a draft can be submitted');
      const [row] = await tx.update(alumniSuccessStories).set({ status: 'submitted' }).where(eq(alumniSuccessStories.id, id)).returning();
      return row;
    });
  }

  /** The alumni office's queue. */
  @Get('placements/success-stories')
  @Auth('user', PLACEMENT_ROLES)
  queue(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: alumniSuccessStories.id, title: alumniSuccessStories.title, body: alumniSuccessStories.body, status: alumniSuccessStories.status, featured: alumniSuccessStories.featured, reviewNote: alumniSuccessStories.reviewNote, alumnus: alumniProfiles.fullName, graduationYear: alumniProfiles.graduationYear, createdAt: alumniSuccessStories.createdAt })
        .from(alumniSuccessStories)
        .innerJoin(alumniProfiles, eq(alumniProfiles.id, alumniSuccessStories.alumniId))
        .where(status ? eq(alumniSuccessStories.status, status) : undefined)
        .orderBy(desc(alumniSuccessStories.createdAt)),
    );
  }

  @Post('placements/success-stories/:id/review')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = found((await tx.select().from(alumniSuccessStories).where(eq(alumniSuccessStories.id, id)).for('update'))[0], 'Story');
      if (s.status !== 'submitted') throw new ConflictException('Only a submitted story can be reviewed');
      const publish = b.decision === 'publish';
      const [row] = await tx
        .update(alumniSuccessStories)
        .set({ status: publish ? 'published' : 'rejected', featured: publish && b.featured, publishedAt: publish ? this.clock.now() : null, reviewedBy: p.userId, reviewNote: b.note ?? null })
        .where(eq(alumniSuccessStories.id, id))
        .returning();
      const [a] = await tx.select({ userId: alumniProfiles.userId }).from(alumniProfiles).where(eq(alumniProfiles.id, s.alumniId));
      if (a?.userId) await this.notifications.notifyUsers(tx, [a.userId], { kind: 'placement', text: { title: publish ? 'Your story is published' : 'Your story needs changes', body: b.note ?? s.title }, data: { storyId: id }, dedupeKey: `story:${id}:${row.status}` });
      await auditUser(tx, p, `alumni.story_${row.status}`, 'alumni_story', id);
      return row;
    });
  }

  /** Published stories, for students, parents and staff. Featured ones first. */
  @Get('alumni-stories')
  @Auth('user')
  published(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: alumniSuccessStories.id, title: alumniSuccessStories.title, body: alumniSuccessStories.body, featured: alumniSuccessStories.featured, publishedAt: alumniSuccessStories.publishedAt, alumnus: alumniProfiles.fullName, graduationYear: alumniProfiles.graduationYear, program: alumniProfiles.program, employer: alumniProfiles.employer, designation: alumniProfiles.designation })
        .from(alumniSuccessStories)
        .innerJoin(alumniProfiles, eq(alumniProfiles.id, alumniSuccessStories.alumniId))
        .where(eq(alumniSuccessStories.status, 'published'))
        .orderBy(desc(alumniSuccessStories.featured), sql`${alumniSuccessStories.publishedAt} desc nulls last`),
    );
  }
}
