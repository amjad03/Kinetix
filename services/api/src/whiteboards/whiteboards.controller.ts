import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Ip, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { canSeeClassItem } from '../common/class-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { boardSessions, tenants, whiteboardExports, whiteboards, whiteboardVersions, type WhiteboardContent } from '../db/schema.js';
import { jpegSize, Pdf } from '../common/pdf-doc.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WhiteboardsService } from './whiteboards.service.js';

const MAX_BYTES = 6 * 1024 * 1024;
/** Earlier saves kept per board. */
const KEEP_VERSIONS = 20;
const MAX_PAGE_JPEG = 3 * 1024 * 1024;
const MAX_EXPORT_PDF = 40 * 1024 * 1024;
const MAX_EXPORT_PAGES = 100;
const EXPORT_DAYS = 30;

const ExportBody = z.object({
  /** Shown in the header of every page (default: the institution's name). */
  brand: z.string().trim().max(80).optional(),
  /** Faint text across each page, e.g. the teacher's or the institution's name. */
  watermark: z.string().trim().max(60).optional(),
});

/** One A4-landscape page per board page: header (logo, brand, title), the page, footer, watermark. */
export function boardPdf(o: { title: string; brand: string; watermark?: string; logo?: Buffer; pages: Buffer[] }): Buffer {
  const W = 841.89, H = 595.28, top = 34, bottom = 22, side = 18;
  const pdf = new Pdf(o.title);
  o.pages.forEach((jpg, i) => {
    pdf.addPage(W, H);
    let x = side;
    if (o.logo) {
      pdf.jpeg(o.logo, side, 7, 20, 20);
      x += 26;
    }
    pdf.text(o.brand, x, 21, { size: 11, bold: true, color: '#1f3a5f' }).text(o.title, W - side, 21, { size: 10, align: 'right', color: '#444444' });
    pdf.line(side, top - 4, W - side, top - 4, { color: '#c8ced6' });
    const size = jpegSize(jpg)!;
    const boxW = W - 2 * side, boxH = H - top - bottom;
    const k = Math.min(boxW / size.w, boxH / size.h);
    pdf.jpeg(jpg, side + (boxW - size.w * k) / 2, top + (boxH - size.h * k) / 2, size.w * k, size.h * k);
    if (o.watermark) pdf.text(o.watermark, W / 2, H / 2, { size: 44, bold: true, align: 'center', color: '#dddddd' });
    pdf.text(`${i + 1} / ${o.pages.length}`, W / 2, H - 8, { size: 8, align: 'center', color: '#777777' });
  });
  return pdf.build();
}

const StrokeSchema = z.object({
  t: z.enum(['pen', 'highlighter', 'shape']),
  c: z.number().int(),
  w: z.number().positive().max(200),
  s: z.string().max(32).optional(),
  /** Inside colour of a filled shape (format 2). */
  f: z.number().int().optional(),
  p: z.array(z.number()).min(2).max(40_000),
});

/**
 * The other board elements (format 2): text, pictures, equations, graphs, figures, notes and sheets.
 * Their fields are the board's to define (packages/kinetix_ink serialization.dart); the API
 * only checks the kind and keeps them as they are. The whole board is size-limited below.
 */
const OtherElementSchema = z.looseObject({ t: z.enum(['text', 'image', 'math', 'graph', 'polygon', 'note', 'sheet']) });

const PageSchema = z.object({
  strokes: z.array(z.union([StrokeSchema, OtherElementSchema])).max(10_000),
  /** Elements that move together, as lists of positions in `strokes`. */
  groups: z.array(z.array(z.number().int().min(0)).max(10_000)).max(2_000).optional(),
});

const SaveBody = z.object({
  title: z.string().trim().min(1).max(120),
  background: z.string().max(32).default('plain'),
  /** Canvas size the strokes were drawn on, so viewers can scale them. */
  canvas: z.object({ w: z.number().int().min(100).max(10_000), h: z.number().int().min(100).max(10_000) }).default({ w: 1920, h: 1080 }),
  pages: z.array(PageSchema).min(1).max(100),
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
    private readonly storage: ObjectStorage,
  ) {}

  /** Save (or save again) the board's pages. The board picks the id, so saving is idempotent. */
  @Put(':id')
  @Auth('board')
  save(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SaveBody)) body: z.infer<typeof SaveBody>) {
    const content: WhiteboardContent = { v: 2, background: body.background, canvas: body.canvas, pages: body.pages as WhiteboardContent['pages'] };
    const sizeBytes = Buffer.byteLength(JSON.stringify(content));
    if (sizeBytes > MAX_BYTES) throw new ForbiddenException('This board is too large to save. Split it into two boards.');

    return this.db.withTenant(p.tenantId, async (tx) => {
      const [existing] = await tx.select().from(whiteboards).where(eq(whiteboards.id, id));
      if (existing && existing.ownerId !== p.teacherId) throw new ForbiddenException('This board belongs to another teacher');
      if (existing) await this.keepVersion(tx, existing);

      const [session] = await tx.select().from(boardSessions).where(eq(boardSessions.id, p.sessionId));
      const now = new Date();
      const values = {
        title: body.title,
        pageCount: body.pages.length,
        content,
        sizeBytes,
        updatedAt: now,
        version: (existing?.version ?? 0) + 1,
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

  /** Earlier saves, newest first (no content). */
  @Get(':id/versions')
  @Auth(['board', 'user'])
  versions(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.owned(tx, p, id);
      return tx
        .select({ version: whiteboardVersions.version, title: whiteboardVersions.title, pageCount: whiteboardVersions.pageCount, savedAt: whiteboardVersions.createdAt })
        .from(whiteboardVersions)
        .where(eq(whiteboardVersions.whiteboardId, id))
        .orderBy(desc(whiteboardVersions.version));
    });
  }

  /** Brings back an earlier save; what was there becomes a version itself, so a restore can be undone. */
  @Post(':id/versions/:version/restore')
  @HttpCode(200)
  @Auth(['board', 'user'])
  restore(@CurrentPrincipal() p: Viewer, @Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const wb = await this.owned(tx, p, id);
      const [v] = await tx.select().from(whiteboardVersions).where(and(eq(whiteboardVersions.whiteboardId, id), eq(whiteboardVersions.version, version)));
      if (!v) throw new NotFoundException('That version is no longer kept');
      await this.keepVersion(tx, wb);
      await tx.update(whiteboards).set({ content: v.content, pageCount: v.pageCount, sizeBytes: v.sizeBytes, title: v.title, version: wb.version + 1, updatedAt: new Date() }).where(eq(whiteboards.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: wb.ownerId, action: 'whiteboard.restored', subjectType: 'whiteboard', subjectId: id, data: { from: version } });
      return { ...(await this.boards.summary(tx, id)), content: v.content };
    });
  }

  /**
   * A branded PDF of the board's pages for WhatsApp, email and QR. Either the board sends the PDF
   * it built and branded itself (`pdf`), or JPEG pages (`pages`, in order, plus an optional `logo`)
   * that are composed here. The link works without signing in until it expires (30 days).
   */
  @Post(':id/export')
  @Auth('board')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'pages', maxCount: MAX_EXPORT_PAGES }, { name: 'logo', maxCount: 1 }, { name: 'pdf', maxCount: 1 }], { limits: { fileSize: MAX_EXPORT_PDF } }))
  async export(
    @CurrentPrincipal() p: BoardPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(ExportBody)) body: z.infer<typeof ExportBody>,
    @UploadedFiles() files: { pages?: { buffer: Buffer }[]; logo?: { buffer: Buffer }[]; pdf?: { buffer: Buffer }[] } = {},
  ) {
    const pages = (files.pages ?? []).map((f) => f.buffer);
    const given = files.pdf?.[0]?.buffer;
    if (given && given.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('That is not a PDF');
    if (!given && pages.length === 0) throw new BadRequestException('Nothing to share: the board has no pages');
    if (pages.some((b) => b.length > MAX_PAGE_JPEG)) throw new BadRequestException('A page picture is too large');
    if (pages.some((b) => !jpegSize(b))) throw new BadRequestException('Pages must be JPEG images');
    const logo = files.logo?.[0]?.buffer;
    if (logo && !jpegSize(logo)) throw new BadRequestException('The logo must be a JPEG image');

    const meta = await this.db.withTenant(p.tenantId, async (tx) => {
      const wb = await this.owned(tx, p, id);
      const [t] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
      return { wb, tenant: t };
    });
    const pdf = given ?? boardPdf({ title: meta.wb.title, brand: body.brand || meta.tenant.name, watermark: body.watermark, logo, pages });
    const pageCount = given ? meta.wb.pageCount : pages.length;
    const token = randomBytes(16).toString('hex');
    const storageKey = `tenants/${p.tenantId}/whiteboards/${id}/exports/${token}.pdf`;
    await this.storage.put(storageKey, Readable.from(pdf), pdf.length + 1, 'application/pdf');
    const expiresAt = new Date(Date.now() + EXPORT_DAYS * 86_400_000);
    await this.db.withTenant(p.tenantId, async (tx) => {
      await tx.insert(whiteboardExports).values({ tenantId: p.tenantId, whiteboardId: id, token, storageKey, pageCount, sizeBytes: pdf.length, createdBy: p.teacherId, expiresAt });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.teacherId, action: 'whiteboard.exported', subjectType: 'whiteboard', subjectId: id, data: { pages: pageCount } });
    });
    return { path: `/v1/public/boards/${meta.tenant.slug}/${token}.pdf`, pageCount, sizeBytes: pdf.length, expiresAt };
  }

  private async owned(tx: Tx, p: Viewer, id: string) {
    const ownerId = p.kind === 'board' ? p.teacherId : p.userId;
    const [wb] = await tx.select().from(whiteboards).where(eq(whiteboards.id, id));
    if (!wb || wb.ownerId !== ownerId) throw new NotFoundException('Board not found');
    return wb;
  }

  private async keepVersion(tx: Tx, wb: typeof whiteboards.$inferSelect) {
    await tx
      .insert(whiteboardVersions)
      .values({ tenantId: wb.tenantId, whiteboardId: wb.id, version: wb.version, title: wb.title, pageCount: wb.pageCount, content: wb.content, sizeBytes: wb.sizeBytes })
      .onConflictDoNothing();
    await tx.delete(whiteboardVersions).where(and(eq(whiteboardVersions.whiteboardId, wb.id), lt(whiteboardVersions.version, wb.version - KEEP_VERSIONS + 1)));
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

/** The shared PDF behind a WhatsApp/email/QR link. No sign-in; random 128-bit tokens; rate limited. */
@Controller('v1/public/boards')
export class PublicBoardsController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly storage: ObjectStorage,
  ) {}

  @Get(':slug/:file')
  async pdf(@Param('slug') slug: string, @Param('file') file: string, @Ip() ip: string, @Res() res: Response) {
    await this.limiter.hit(`board-pdf:${ip}`, 60, 60_000);
    const token = /^([0-9a-f]{32})\.pdf$/.exec(file)?.[1];
    const tenant = token && /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    const row = tenant ? await this.db.withTenant(tenant.id, async (tx) => (await tx.select().from(whiteboardExports).where(eq(whiteboardExports.token, token!)))[0]) : undefined;
    if (!row || row.expiresAt < new Date()) throw new NotFoundException('This link has expired or does not exist');
    const { stream, size } = await this.storage.get(row.storageKey);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-length', size);
    res.setHeader('content-disposition', 'inline; filename="board.pdf"');
    res.setHeader('cache-control', 'private, max-age=3600');
    stream.pipe(res);
  }
}
