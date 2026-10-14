import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, arrayOverlaps, asc, desc, eq, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { roleName, savedViews, users } from '../db/schema.js';
import { pgError } from './snapshot.js';

const Page = z.string().regex(/^[a-z][a-z0-9./-]{0,80}$/);
const State = z.object({
  q: z.string().max(200).optional(),
  filters: z.record(z.string().max(60), z.string().max(200)).optional(),
  sort: z.object({ id: z.string().max(60), dir: z.enum(['asc', 'desc']) }).nullable().optional(),
  columns: z.array(z.string().max(60)).max(60).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});
const ViewBody = z.object({
  page: Page,
  name: z.string().trim().min(1).max(80),
  state: State,
  sharedRoles: z.array(z.enum(roleName.enumValues)).max(30).default([]),
  isDefault: z.boolean().default(false),
});
const ViewPatch = ViewBody.omit({ page: true }).partial();

/**
 * Saved views: a person's named search, filters, columns, sort and density for one list, optionally shared with
 * roles. A list shows the person's own views and those shared with any of their roles; only the owner changes one.
 */
@Controller('v1/saved-views')
export class SavedViewsController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('page') page: string) {
    const parsed = Page.safeParse(page ?? '');
    if (!parsed.success) throw new BadRequestException('Name the list with ?page=');
    const pg = parsed.data;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ v: savedViews, owner: users.fullName })
        .from(savedViews)
        .innerJoin(users, eq(users.id, savedViews.userId))
        .where(and(eq(savedViews.page, pg), or(eq(savedViews.userId, p.userId), arrayOverlaps(savedViews.sharedRoles, p.roles))))
        .orderBy(desc(eq(savedViews.userId, p.userId)), asc(savedViews.name));
      return rows.map(({ v, owner }) => ({ id: v.id, page: v.page, name: v.name, state: v.state, sharedRoles: v.sharedRoles, isDefault: v.isDefault && v.userId === p.userId, mine: v.userId === p.userId, owner, updatedAt: v.updatedAt.toISOString() }));
    });
  }

  @Post()
  @Auth('user')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ViewBody)) body: z.infer<typeof ViewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (body.isDefault) await this.clearDefault(tx, p, body.page);
      const [v] = await this.unique(() => tx.insert(savedViews).values({ tenantId: p.tenantId, userId: p.userId, page: body.page, name: body.name, state: body.state, sharedRoles: body.sharedRoles, isDefault: body.isDefault }).returning());
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'saved_view.created', subjectType: 'saved_view', subjectId: v.id, data: { page: v.page, name: v.name, sharedRoles: v.sharedRoles } });
      return { ...v, mine: true };
    });
  }

  @Put(':id')
  @Auth('user')
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ViewPatch)) body: z.infer<typeof ViewPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.own(tx, p, id);
      if (body.isDefault) await this.clearDefault(tx, p, before.page, id);
      const [v] = await this.unique(() =>
        tx
          .update(savedViews)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(savedViews.id, id))
          .returning(),
      );
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'saved_view.updated', subjectType: 'saved_view', subjectId: id, before: { name: before.name, sharedRoles: before.sharedRoles, isDefault: before.isDefault }, after: { name: v.name, sharedRoles: v.sharedRoles, isDefault: v.isDefault } });
      return { ...v, mine: true };
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user')
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.own(tx, p, id);
      await tx.delete(savedViews).where(eq(savedViews.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'saved_view.deleted', subjectType: 'saved_view', subjectId: id, data: { page: v.page, name: v.name } });
    });
  }

  /** The view, if this person owns it. A view shared with them reads as theirs to use, not to change. */
  private async own(tx: Tx, p: UserPrincipal, id: string) {
    const [v] = await tx.select().from(savedViews).where(eq(savedViews.id, id));
    if (!v) throw new NotFoundException('Not found');
    if (v.userId !== p.userId) throw new ForbiddenException('Only the person who saved this view can change it');
    return v;
  }

  private async clearDefault(tx: Tx, p: UserPrincipal, page: string, except?: string) {
    await tx
      .update(savedViews)
      .set({ isDefault: false })
      .where(and(eq(savedViews.userId, p.userId), eq(savedViews.page, page), except ? ne(savedViews.id, except) : undefined));
  }

  private async unique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (pgError(e)?.code === '23505') throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'VIEW_NAME_TAKEN', message: 'You already have a view with this name' });
      throw e;
    }
  }
}
