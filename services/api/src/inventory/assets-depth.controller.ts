import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, nextNumber, Paise } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { assetMaintenance, assets, devices, rooms } from '../db/schema.js';
import { amcContracts } from '../db/schema-depth.js';
import { STORE_ROLES } from './inventory.controller.js';

const AmcBody = z
  .object({ title: z.string().trim().min(2).max(160), assetId: z.uuid().nullish(), vendorId: z.uuid().nullish(), vendorName: z.string().trim().max(160).default(''), covers: z.string().trim().max(300).default(''), startsOn: Day, endsOn: Day, costPaise: Paise.default(0), visitsPerYear: z.number().int().min(0).max(52).default(0), contact: z.string().trim().max(160).default('') })
  .refine((b) => b.endsOn > b.startsOn, { message: 'The contract must end after it starts', path: ['endsOn'] });
const WarrantyBody = z.object({ warrantyUntil: Day.nullable(), serialNo: z.string().trim().max(80).nullish() });
const LinkBody = z.object({ assetId: z.uuid().optional(), create: z.object({ costPaise: Paise.min(100), purchasedOn: Day, usefulLifeYears: z.number().int().min(1).max(30) }).optional() }).refine((b) => !!b.assetId !== !!b.create, { message: 'Give an existing asset, or the details to register a new one' });

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** AMC contracts, warranty tracking, and smartboards kept in the asset register against their rooms (PRD section 35). */
@Controller('v1/asset-ops')
export class AssetsDepthController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private today() {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private amcState(endsOn: string, status: string, days = 60): 'cancelled' | 'expired' | 'expiring' | 'active' {
    const today = this.today();
    return status === 'cancelled' ? 'cancelled' : endsOn < today ? 'expired' : endsOn <= addDays(today, days) ? 'expiring' : 'active';
  }

  @Get('amc')
  @Auth('user', STORE_ROLES)
  amc(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ c: amcContracts, tag: assets.tag, asset: assets.name }).from(amcContracts).leftJoin(assets, eq(assets.id, amcContracts.assetId)).orderBy(asc(amcContracts.endsOn));
      return rows.map((r) => ({ ...r.c, assetTag: r.tag, assetName: r.asset, state: this.amcState(r.c.endsOn, r.c.status) }));
    });
  }

  @Post('amc')
  @Auth('user', STORE_ROLES)
  addAmc(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AmcBody)) b: z.infer<typeof AmcBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.assetId) {
        const [a] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, b.assetId));
        if (!a) throw new BadRequestException('Asset not found');
      }
      const [row] = await tx.insert(amcContracts).values({ tenantId: p.tenantId, title: b.title, assetId: b.assetId ?? null, vendorId: b.vendorId ?? null, vendorName: b.vendorName, covers: b.covers, startsOn: b.startsOn, endsOn: b.endsOn, costPaise: b.costPaise, visitsPerYear: b.visitsPerYear, contact: b.contact, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'assets.amc_added', 'amc_contract', row.id);
      return { ...row, state: this.amcState(row.endsOn, row.status) };
    });
  }

  /** A service visit under the contract; it is also written to the asset's maintenance history. */
  @Post('amc/:id/visit')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  visit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ note: z.string().trim().max(300).default('') }))) b: { note: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(amcContracts).where(eq(amcContracts.id, id)).for('update');
      if (!c) throw new NotFoundException('Contract not found');
      if (this.amcState(c.endsOn, c.status) === 'expired' || c.status === 'cancelled') throw new ConflictException('This contract is not in force');
      const [row] = await tx.update(amcContracts).set({ visitsDone: c.visitsDone + 1 }).where(eq(amcContracts.id, id)).returning();
      if (c.assetId) await tx.insert(assetMaintenance).values({ tenantId: p.tenantId, assetId: c.assetId, kind: 'service', description: `AMC visit${b.note ? ': ' + b.note : ''} (${c.title})`, costPaise: 0, doneOn: this.today(), createdBy: p.userId });
      await auditUser(tx, p, 'assets.amc_visit', 'amc_contract', id);
      return { ...row, state: this.amcState(row.endsOn, row.status) };
    });
  }

  @Post('amc/:id/cancel')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  cancelAmc(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(amcContracts).set({ status: 'cancelled' }).where(eq(amcContracts.id, id)).returning();
      if (!row) throw new NotFoundException('Contract not found');
      await auditUser(tx, p, 'assets.amc_cancelled', 'amc_contract', id);
      return row;
    });
  }

  @Put('assets/:id/warranty')
  @Auth('user', STORE_ROLES)
  warranty(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(WarrantyBody)) b: z.infer<typeof WarrantyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(assets).set({ warrantyUntil: b.warrantyUntil, ...(b.serialNo !== undefined ? { serialNo: b.serialNo } : {}) }).where(eq(assets.id, id)).returning();
      if (!row) throw new NotFoundException('Asset not found');
      await auditUser(tx, p, 'assets.warranty_set', 'asset', id);
      return row;
    });
  }

  /** Assets by cover: under warranty, under an AMC, or with none; warranties and contracts running out within `days` come first. */
  @Get('coverage')
  @Auth('user', STORE_ROLES)
  coverage(@CurrentPrincipal() p: UserPrincipal, @Query('days') daysQ?: string) {
    const days = Math.min(365, Math.max(1, Number(daysQ) || 60));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const list = await tx.select({ a: assets, room: rooms.name }).from(assets).leftJoin(rooms, eq(rooms.id, assets.roomId)).where(eq(assets.status, 'active')).orderBy(asc(assets.tag));
      const contracts = await tx.select().from(amcContracts).where(eq(amcContracts.status, 'active'));
      const today = this.today();
      const soon = addDays(today, days);
      const rows = list.map(({ a, room }) => {
        const amc = contracts.find((c) => c.assetId === a.id && c.endsOn >= today && c.startsOn <= today);
        const underWarranty = !!a.warrantyUntil && a.warrantyUntil >= today;
        const cover = amc ? 'amc' : underWarranty ? 'warranty' : 'none';
        const endsOn = amc ? amc.endsOn : underWarranty ? a.warrantyUntil : null;
        return { id: a.id, tag: a.tag, name: a.name, category: a.category, room, serialNo: a.serialNo, warrantyUntil: a.warrantyUntil, cover, coverEndsOn: endsOn, endingSoon: !!endsOn && endsOn <= soon };
      });
      return { days, assets: rows.sort((x, y) => Number(y.endingSoon) - Number(x.endingSoon)), summary: { amc: rows.filter((r) => r.cover === 'amc').length, warranty: rows.filter((r) => r.cover === 'warranty').length, none: rows.filter((r) => r.cover === 'none').length, endingSoon: rows.filter((r) => r.endingSoon).length } };
    });
  }

  // ---- rooms and smartboards --------------------------------------------------------------------------------------

  @Put('assets/:id/room')
  @Auth('user', STORE_ROLES)
  setRoom(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ roomId: z.uuid().nullable() }))) b: { roomId: string | null }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.roomId) {
        const [r] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, b.roomId));
        if (!r) throw new BadRequestException('Room not found');
      }
      const [row] = await tx.update(assets).set({ roomId: b.roomId }).where(eq(assets.id, id)).returning();
      if (!row) throw new NotFoundException('Asset not found');
      await auditUser(tx, p, 'assets.room_set', 'asset', id, { roomId: b.roomId });
      return row;
    });
  }

  @Get('rooms/:roomId/assets')
  @Auth('user', STORE_ROLES)
  roomAssets(@CurrentPrincipal() p: UserPrincipal, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: assets.id, tag: assets.tag, name: assets.name, category: assets.category, status: assets.status, deviceId: assets.deviceId, warrantyUntil: assets.warrantyUntil }).from(assets).where(eq(assets.roomId, roomId)).orderBy(asc(assets.tag)));
  }

  /** The device fleet next to the asset register: each board, its room, and the asset that records it. */
  @Get('smartboards')
  @Auth('user', STORE_ROLES)
  smartboards(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const boards = await tx.select({ d: devices, room: rooms.name }).from(devices).leftJoin(rooms, eq(rooms.id, devices.roomId)).orderBy(asc(devices.name));
      const linked = await tx.select({ id: assets.id, tag: assets.tag, deviceId: assets.deviceId, warrantyUntil: assets.warrantyUntil }).from(assets).where(sql`${assets.deviceId} is not null`);
      return boards.map((b) => {
        const a = linked.find((x) => x.deviceId === b.d.id);
        return { deviceId: b.d.id, name: b.d.name, roomId: b.d.roomId, room: b.room, lastSeenAt: b.d.lastSeenAt, assetId: a?.id ?? null, assetTag: a?.tag ?? null, warrantyUntil: a?.warrantyUntil ?? null };
      });
    });
  }

  /** Records a board in the asset register: links an existing asset, or registers a new smartboard asset in the board's room. */
  @Post('smartboards/:deviceId/link')
  @Auth('user', STORE_ROLES)
  link(@CurrentPrincipal() p: UserPrincipal, @Param('deviceId', ParseUUIDPipe) deviceId: string, @Body(new ZodBody(LinkBody)) b: z.infer<typeof LinkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(devices).where(eq(devices.id, deviceId));
      if (!d) throw new NotFoundException('Board not found');
      const [already] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.deviceId, deviceId));
      if (already) throw new ConflictException('This board is already in the asset register');
      if (b.assetId) {
        const [taken] = await tx.select({ deviceId: assets.deviceId }).from(assets).where(and(eq(assets.id, b.assetId), isNull(assets.deviceId)));
        if (!taken) throw new ConflictException('That asset is missing or already linked to a board');
        const [row] = await tx.update(assets).set({ deviceId, roomId: d.roomId }).where(eq(assets.id, b.assetId)).returning();
        await auditUser(tx, p, 'assets.smartboard_linked', 'asset', row.id, { deviceId });
        return row;
      }
      const tag = await nextNumber(tx, p.tenantId, 'AST');
      const [row] = await tx.insert(assets).values({ tenantId: p.tenantId, tag, name: d.name, category: 'smartboard', location: '', purchasedOn: b.create!.purchasedOn, costPaise: b.create!.costPaise, usefulLifeYears: b.create!.usefulLifeYears, deviceId, roomId: d.roomId }).returning();
      await auditUser(tx, p, 'assets.smartboard_registered', 'asset', row.id, { deviceId });
      return row;
    });
  }
}
