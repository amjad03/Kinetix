import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { canSeeClassItem } from '../common/class-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, whiteboards, type WhiteboardContent } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WhiteboardsService } from './whiteboards.service.js';

const MAX_BYTES = 6 * 1024 * 1024;

const StrokeSchema = z.object({
  t: z.enum(['pen', 'highlighter', 'shape']),
  c: z.number().int(),
  w: z.number().positive().max(200),
  s: z.string().max(32).optional(),
  p: z.array(z.number()).min(2).max(40_000),
});

const SaveBody = z.object({
  title: z.string().trim().min(1).max(120),
  background: z.string().max(32).default('plain'),
  /** Canvas size the strokes were drawn on, so viewers can scale them. */
  canvas: z.object({ w: z.number().int().min(100).max(10_000), h: z.number().int().min(100).max(10_000) }).default({ w: 1920, h: 1080 }),
  pages: z.array(z.object({ strokes: z.array(StrokeSchema).max(10_000) })).min(1).max(100),
  /** Share with the class now: students and parents can open it in their apps. */
  share: z.boolean().default(false),
});

type Viewer = UserPrincipal | BoardPrincipal;

/** Saved boards: written by the board, read by the teacher, and by the class once shared. */
@Controller('v1/whiteboards')
export class WhiteboardsController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly boards: WhiteboardsService,
  ) {}

  /** Save (or save again) the board's pages. The board picks the id, so saving is idempotent. */
  @Put(':id')
  @Auth('board')
  save(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SaveBody)) body: z.infer<typeof SaveBody>) {
    const content: WhiteboardContent = { v: 1, background: body.background, canvas: body.canvas, pages: body.pages };
    const sizeBytes = Buffer.byteLength(JSON.stringify(content));
    if (sizeBytes > MAX_BYTES) throw new ForbiddenException('This board is too large to save. Split it into two boards.');

    return this.db.withTenant(p.tenantId, async (tx) => {
      const [existing] = await tx.select({ ownerId: whiteboards.ownerId, sharedAt: whiteboards.sharedAt }).from(whiteboards).where(eq(whiteboards.id, id));
      if (existing && existing.ownerId !== p.teacherId) throw new ForbiddenException('This board belongs to another teacher');

      const [session] = await tx.select().from(boardSessions).where(eq(boardSessions.id, p.sessionId));
      const now = new Date();
      const values = {
        title: body.title,
        pageCount: body.pages.length,
        content,
        sizeBytes,
        updatedAt: now,
        ...(body.share && !existing?.sharedAt && session?.sectionId ? { sharedAt: now } : {}),
      };
      await tx
        .insert(whiteboards)
        .values({
          id,
          tenantId: p.tenantId,
          ownerId: p.teacherId,
          boardSessionId: session?.id,
          sectionId: session?.sectionId,
          subjectId: session?.subjectId,
          ...values,
        })
        .onConflictDoUpdate({ target: whiteboards.id, set: values });

      if ('sharedAt' in values) await this.notifyShared(tx, id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.teacherId, action: 'whiteboard.saved', subjectType: 'whiteboard', subjectId: id, data: { pages: body.pages.length, sizeBytes, shared: body.share } });
      return this.boards.summary(tx, id);
    });
  }

  /** The teacher's boards, newest first (on the board: "Your whiteboards"). */
  @Get()
  @Auth(['board', 'user'])
  mine(@CurrentPrincipal() p: Viewer) {
    const ownerId = p.kind === 'board' ? p.teacherId : p.userId;
    return this.db.withTenant(p.tenantId, (tx) =>
      this.boards.summaries(tx).where(eq(whiteboards.ownerId, ownerId)).orderBy(desc(whiteboards.updatedAt)).limit(50),
    );
  }

  /** Full content. Owners and school leaders always; students and parents once shared. */
  @Get(':id')
  @Auth(['board', 'user'])
  get(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [wb] = await tx.select().from(whiteboards).where(eq(whiteboards.id, id));
      if (!wb || !(await this.canView(tx, p, wb))) throw new NotFoundException('Board not found');
      return { ...(await this.boards.summary(tx, id)), content: wb.content };
    });
  }

  /** Share a saved board with its class. */
  @Post(':id/share')
  @HttpCode(200)
  @Auth(['board', 'user'])
  share(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    const ownerId = p.kind === 'board' ? p.teacherId : p.userId;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [wb] = await tx.select().from(whiteboards).where(eq(whiteboards.id, id));
      if (!wb || wb.ownerId !== ownerId) throw new NotFoundException('Board not found');
      if (!wb.sectionId) throw new ForbiddenException('This board was not used with a class, so there is no one to share it with');
      if (!wb.sharedAt) {
        await tx.update(whiteboards).set({ sharedAt: new Date() }).where(eq(whiteboards.id, id));
        await this.notifyShared(tx, id);
      }
      return this.boards.summary(tx, id);
    });
  }

  private async canView(tx: Tx, p: Viewer, wb: typeof whiteboards.$inferSelect): Promise<boolean> {
    if (p.kind === 'board') return wb.ownerId === p.teacherId;
    return canSeeClassItem(tx, p, wb);
  }

  private async notifyShared(tx: Tx, id: string) {
    const s = await this.boards.summary(tx, id);
    if (s.sectionId) await this.notifications.boardShared(tx, { id, sectionId: s.sectionId, title: s.title, subjectName: s.subjectName });
  }
}
