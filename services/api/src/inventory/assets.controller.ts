import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { qrSvg } from '../common/qr.js';
import { assetTagsPdf } from '../documents/pdfs.js';
import { bookValueAfter, Day, depreciationSchedule, nextNumber, Paise } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assetAllocations, assetMaintenance, assets, tenants } from '../db/schema.js';
import { STORE_ROLES } from './inventory.controller.js';

const AssetBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().max(60).default('general'),
    location: z.string().trim().max(120).default(''),
    purchasedOn: Day,
    costPaise: Paise.min(100),
    salvagePaise: Paise.default(0),
    usefulLifeYears: z.number().int().min(1).max(50),
    method: z.enum(['slm', 'wdv']).default('slm'),
    wdvRatePct: z.number().min(1).max(100).optional(),
  })
  .refine((a) => a.salvagePaise < a.costPaise, { message: 'Salvage value must be below cost', path: ['salvagePaise'] })
  .refine((a) => a.method !== 'wdv' || a.wdvRatePct != null, { message: 'Give the written-down rate', path: ['wdvRatePct'] });
const AllocateBody = z.object({ assignedTo: z.string().trim().min(1).max(120), userId: z.uuid().optional(), allocatedOn: Day.optional() });
const MaintBody = z.object({ kind: z.enum(['service', 'repair', 'inspection']), description: z.string().trim().max(300).default(''), costPaise: Paise.default(0), doneOn: Day, nextDueOn: Day.optional(), ongoing: z.boolean().default(false) });
const DisposeBody = z.object({ disposedOn: Day, disposalPaise: Paise.default(0) });

/**
 * Asset register: every asset gets a tag (printed as a QR label that opens the asset), can be
 * allocated to a person or place, is serviced, depreciates (straight-line or written-down
 * value), and is disposed of. All changes are audited.
 */
@Controller('v1/assets')
export class AssetsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Post()
  @Auth('user', STORE_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AssetBody)) b: z.infer<typeof AssetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const tag = await nextNumber(tx, p.tenantId, 'AST');
      const [a] = await tx.insert(assets).values({ tenantId: p.tenantId, tag, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.registered', subjectType: 'asset', subjectId: a.id, data: { tag } });
      return this.view(a);
    });
  }

  @Get()
  @Auth('user', STORE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const rows = await tx
        .select({ asset: assets, assignedTo: assetAllocations.assignedTo })
        .from(assets)
        .leftJoin(assetAllocations, and(eq(assetAllocations.assetId, assets.id), isNull(assetAllocations.returnedOn)))
        .where(status ? eq(assets.status, status) : undefined)
        .orderBy(asc(assets.tag))
        .limit(500);
      return rows.map((r) => ({ ...this.view(r.asset), assignedTo: r.assignedTo, bookValuePaise: this.bookValue(r.asset, today) }));
    });
  }

  /** Printable tag sheet (PDF, 24 to a page) with a QR on each tag: the chosen assets, or every asset still in service. */
  @Get('tags.pdf')
  @Auth('user', STORE_ROLES)
  tagSheet(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response, @Query('ids') ids?: string) {
    const parsed = ids ? z.array(z.uuid()).min(1).max(500).safeParse(ids.split(',')) : undefined;
    if (parsed && !parsed.success) throw new BadRequestException('Bad ids');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
      const rows = await tx.select().from(assets).where(parsed?.success ? inArray(assets.id, parsed.data) : ne(assets.status, 'disposed')).orderBy(asc(assets.tag)).limit(500);
      if (!rows.length) throw new NotFoundException('No assets to print');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.tags_printed', subjectType: 'asset', data: { count: rows.length } });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="asset-tags.pdf"');
      return new StreamableFile(assetTagsPdf(t?.name ?? '', rows.map((a) => ({ tag: a.tag, name: a.name, location: a.location, qr: `kinetix://asset/${a.tag}` }))));
    });
  }

  /** What a scan of the QR label resolves to. */
  @Get('by-tag/:tag')
  @Auth('user', STORE_ROLES)
  byTag(@CurrentPrincipal() p: UserPrincipal, @Param('tag') tag: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.tag, tag));
      if (!a) throw new NotFoundException('Asset not found');
      return this.detail(tx, a.id);
    });
  }

  /** Assets whose next service is due within 30 days or overdue. */
  @Get('maintenance-due')
  @Auth('user', STORE_ROLES)
  due(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      return tx
        .select({ assetId: assets.id, tag: assets.tag, name: assets.name, nextDueOn: sql<string>`max(${assetMaintenance.nextDueOn})` })
        .from(assetMaintenance)
        .innerJoin(assets, eq(assets.id, assetMaintenance.assetId))
        .where(sql`${assets.status} <> 'disposed'`)
        .groupBy(assets.id)
        .having(sql`max(${assetMaintenance.nextDueOn}) <= (${today}::date + 30)`)
        .orderBy(sql`max(${assetMaintenance.nextDueOn})`);
    });
  }

  @Get(':id')
  @Auth('user', STORE_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.detail(tx, id));
  }

  @Post(':id/allocate')
  @Auth('user', STORE_ROLES)
  allocate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AllocateBody)) b: z.infer<typeof AllocateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.lock(tx, id);
      if (a.status === 'disposed') throw new ConflictException('This asset has been disposed of');
      const [open] = await tx.select({ assignedTo: assetAllocations.assignedTo }).from(assetAllocations).where(and(eq(assetAllocations.assetId, id), isNull(assetAllocations.returnedOn)));
      if (open) throw new ConflictException(`Already allocated to ${open.assignedTo}; take it back first`);
      const [row] = await tx.insert(assetAllocations).values({ tenantId: p.tenantId, assetId: id, assignedTo: b.assignedTo, userId: b.userId, allocatedOn: b.allocatedOn ?? (await this.today(tx)) }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.allocated', subjectType: 'asset', subjectId: id, data: { assignedTo: b.assignedTo } });
      return row;
    });
  }

  @Post(':id/return')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  giveBack(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.lock(tx, id);
      const [row] = await tx.update(assetAllocations).set({ returnedOn: await this.today(tx) }).where(and(eq(assetAllocations.assetId, id), isNull(assetAllocations.returnedOn))).returning();
      if (!row) throw new ConflictException('This asset is not allocated');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.returned', subjectType: 'asset', subjectId: id });
      return row;
    });
  }

  /** A service or repair. `ongoing` keeps the asset out of use until a later record closes it. */
  @Post(':id/maintenance')
  @Auth('user', STORE_ROLES)
  maintain(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MaintBody)) b: z.infer<typeof MaintBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.lock(tx, id);
      if (a.status === 'disposed') throw new ConflictException('This asset has been disposed of');
      const { ongoing, ...rest } = b;
      if (rest.nextDueOn && rest.nextDueOn < rest.doneOn) throw new BadRequestException('The next service is before this one');
      const [m] = await tx.insert(assetMaintenance).values({ tenantId: p.tenantId, assetId: id, createdBy: p.userId, ...rest }).returning();
      await tx.update(assets).set({ status: ongoing ? 'in_maintenance' : 'active' }).where(eq(assets.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.maintained', subjectType: 'asset', subjectId: id, data: { kind: b.kind, costPaise: b.costPaise } });
      return m;
    });
  }

  @Post(':id/dispose')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  dispose(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DisposeBody)) b: z.infer<typeof DisposeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.lock(tx, id);
      if (a.status === 'disposed') throw new ConflictException('Already disposed of');
      if (b.disposedOn < a.purchasedOn) throw new BadRequestException('Disposed before it was bought');
      await tx.update(assetAllocations).set({ returnedOn: b.disposedOn }).where(and(eq(assetAllocations.assetId, id), isNull(assetAllocations.returnedOn)));
      const [done] = await tx.update(assets).set({ status: 'disposed', disposedOn: b.disposedOn, disposalPaise: b.disposalPaise }).where(eq(assets.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.disposed', subjectType: 'asset', subjectId: id, data: b });
      return this.view(done);
    });
  }

  // --- helpers -----------------------------------------------------------------------------

  private view(a: typeof assets.$inferSelect) {
    return { ...a, qr: `kinetix://asset/${a.tag}` };
  }

  private bookValue(a: typeof assets.$inferSelect, today: string): number {
    const end = a.disposedOn && a.disposedOn < today ? a.disposedOn : today;
    const years = Math.max(0, Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${a.purchasedOn}T00:00:00Z`)) / (365.25 * 86400_000)));
    return bookValueAfter(a, years);
  }

  private async detail(tx: Tx, id: string) {
    const [a] = await tx.select().from(assets).where(eq(assets.id, id));
    if (!a) throw new NotFoundException('Asset not found');
    const [allocations, maintenance] = await Promise.all([
      tx.select().from(assetAllocations).where(eq(assetAllocations.assetId, id)).orderBy(desc(assetAllocations.allocatedOn)),
      tx.select().from(assetMaintenance).where(eq(assetMaintenance.assetId, id)).orderBy(desc(assetMaintenance.doneOn)),
    ]);
    return { ...this.view(a), qrSvg: qrSvg(`kinetix://asset/${a.tag}`), allocations, maintenance, depreciation: depreciationSchedule(a), bookValuePaise: this.bookValue(a, await this.today(tx)) };
  }

  private async lock(tx: Tx, id: string) {
    const [a] = await tx.select().from(assets).where(eq(assets.id, id)).for('update');
    if (!a) throw new NotFoundException('Asset not found');
    return a;
  }

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }
}
