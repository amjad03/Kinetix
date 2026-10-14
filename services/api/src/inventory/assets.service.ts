import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import type { Tx } from '../db/db.service.js';
import { disposalLines } from '../finance/gl.js';
import { assetAllocations, assetGlPostings, assets, departments, invPurchaseOrders, invVendors, rooms } from '../db/schema.js';
import { assetCondemnations, assetTransfers } from '../db/schema-procurement.js';
import { fiscalYearOf } from './procurement.logic.js';

export interface AssetInput {
  name: string;
  category: string;
  location: string;
  purchasedOn: string;
  costPaise: number;
  salvagePaise: number;
  usefulLifeYears: number;
  method: 'slm' | 'wdv';
  wdvRatePct?: number | null;
  departmentId?: string | null;
  roomId?: string | null;
  vendorId?: string | null;
  poId?: string | null;
  invoiceNo?: string | null;
  make?: string | null;
  model?: string | null;
  serialNo?: string | null;
  warrantyUntil?: string | null;
}

/** The asset register's shared writes: registering, transfers, and condemnation through to the write-off. */
@Injectable()
export class AssetsService {
  constructor(private readonly clock: Clock) {}

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  private async assertRefs(tx: Tx, b: { departmentId?: string | null; roomId?: string | null; vendorId?: string | null; poId?: string | null }) {
    if (b.departmentId && !(await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, b.departmentId)))[0]) throw new BadRequestException('Department not found');
    if (b.roomId && !(await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, b.roomId)))[0]) throw new BadRequestException('Room not found');
    if (b.vendorId && !(await tx.select({ id: invVendors.id }).from(invVendors).where(eq(invVendors.id, b.vendorId)))[0]) throw new BadRequestException('Vendor not found');
    if (b.poId && !(await tx.select({ id: invPurchaseOrders.id }).from(invPurchaseOrders).where(eq(invPurchaseOrders.id, b.poId)))[0]) throw new BadRequestException('Purchase order not found');
  }

  /** Registers an asset under the next tag (AST series). */
  async register(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, b: AssetInput) {
    if (b.salvagePaise >= b.costPaise) throw new BadRequestException('Salvage value must be below cost');
    if (b.method === 'wdv' && !b.wdvRatePct) throw new BadRequestException('Give the written-down rate');
    await this.assertRefs(tx, b);
    const tag = await nextNumber(tx, p.tenantId, 'AST');
    const [a] = await tx
      .insert(assets)
      .values({ tenantId: p.tenantId, tag, name: b.name, category: b.category, location: b.location, purchasedOn: b.purchasedOn, costPaise: b.costPaise, salvagePaise: b.salvagePaise, usefulLifeYears: b.usefulLifeYears, method: b.method, wdvRatePct: b.wdvRatePct ?? null, departmentId: b.departmentId ?? null, roomId: b.roomId ?? null, vendorId: b.vendorId ?? null, poId: b.poId ?? null, invoiceNo: b.invoiceNo ?? null, make: b.make ?? null, model: b.model ?? null, serialNo: b.serialNo ?? null, warrantyUntil: b.warrantyUntil ?? null })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.registered', subjectType: 'asset', subjectId: a.id, data: { tag } });
    return a;
  }

  /** Moves an asset to another place, room or department, keeping the transfer register. */
  async transfer(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, id: string, b: { toLocation?: string; toRoomId?: string | null; toDepartmentId?: string | null; reason: string; on?: string }) {
    const [a] = await tx.select().from(assets).where(eq(assets.id, id)).for('update');
    if (!a) throw new NotFoundException('Asset not found');
    if (a.status === 'disposed') throw new ConflictException('This asset has been disposed of');
    await this.assertRefs(tx, { roomId: b.toRoomId, departmentId: b.toDepartmentId });
    const to = { location: b.toLocation ?? a.location, roomId: b.toRoomId === undefined ? a.roomId : b.toRoomId, departmentId: b.toDepartmentId === undefined ? a.departmentId : b.toDepartmentId };
    if (to.location === a.location && to.roomId === a.roomId && to.departmentId === a.departmentId) throw new BadRequestException('The asset is already there');
    const on = b.on ?? (await this.today(tx));
    if (on < a.purchasedOn) throw new BadRequestException('Moved before it was bought');
    const [t] = await tx.insert(assetTransfers).values({ tenantId: p.tenantId, assetId: id, fromLocation: a.location, toLocation: to.location, fromRoomId: a.roomId, toRoomId: to.roomId, fromDepartmentId: a.departmentId, toDepartmentId: to.departmentId, reason: b.reason, transferredOn: on, createdBy: p.userId }).returning();
    await tx.update(assets).set(to).where(eq(assets.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.transferred', subjectType: 'asset', subjectId: id, before: { location: a.location, roomId: a.roomId, departmentId: a.departmentId }, after: to, data: { reason: b.reason } });
    return t;
  }

  /** Disposes of an asset: ends its allocation, marks it disposed and posts the disposal journal. */
  async dispose(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, id: string, b: { disposedOn: string; disposalPaise: number }) {
    const [a] = await tx.select().from(assets).where(eq(assets.id, id)).for('update');
    if (!a) throw new NotFoundException('Asset not found');
    if (a.status === 'disposed') throw new ConflictException('Already disposed of');
    if (b.disposedOn < a.purchasedOn) throw new BadRequestException('Disposed before it was bought');
    await tx.update(assetAllocations).set({ returnedOn: b.disposedOn }).where(and(eq(assetAllocations.assetId, id), isNull(assetAllocations.returnedOn)));
    const [done] = await tx.update(assets).set({ status: 'disposed', disposedOn: b.disposedOn, disposalPaise: b.disposalPaise }).where(eq(assets.id, id)).returning();
    const [acc] = await tx.select({ n: sql<number>`coalesce(sum((${assetGlPostings.lines}->0->>'debitPaise')::bigint), 0)::float8` }).from(assetGlPostings).where(and(eq(assetGlPostings.assetId, id), eq(assetGlPostings.kind, 'depreciation')));
    await tx.insert(assetGlPostings).values({ tenantId: p.tenantId, assetId: id, kind: 'disposal', fiscalYear: fiscalYearOf(b.disposedOn), postedOn: b.disposedOn, voucherNo: `DSP-${a.tag}`, narration: `Disposal of ${a.name} (${a.tag})`, lines: disposalLines(a.costPaise, acc.n, b.disposalPaise), postedBy: p.userId });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.disposed', subjectType: 'asset', subjectId: id, data: b });
    return done;
  }

  /** Proposes an asset for condemnation (one open proposal per asset). */
  async propose(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, assetId: string, b: { reason: string; condition: string }) {
    const [a] = await tx.select().from(assets).where(eq(assets.id, assetId));
    if (!a) throw new NotFoundException('Asset not found');
    if (a.status === 'disposed') throw new ConflictException('This asset has been disposed of');
    const [open] = await tx.select({ id: assetCondemnations.id }).from(assetCondemnations).where(and(eq(assetCondemnations.assetId, assetId), sql`${assetCondemnations.status} in ('proposed', 'approved')`));
    if (open) throw new ConflictException('This asset is already proposed for condemnation');
    const number = await nextNumber(tx, p.tenantId, 'CND');
    const [c] = await tx.insert(assetCondemnations).values({ tenantId: p.tenantId, number, assetId, reason: b.reason, condition: b.condition, proposedBy: p.userId }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.condemnation_proposed', subjectType: 'asset_condemnation', subjectId: c.id, data: { number, assetId } });
    return c;
  }

  /** The condemnation committee (principal or administrator) approves or rejects a proposal; not the proposer. */
  async decide(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, id: string, b: { approve: boolean; note?: string }) {
    const [c] = await tx.select().from(assetCondemnations).where(eq(assetCondemnations.id, id)).for('update');
    if (!c) throw new NotFoundException('Condemnation not found');
    if (c.status !== 'proposed') throw new ConflictException(`This proposal is already ${c.status}`);
    if (c.proposedBy === p.userId) throw new ForbiddenException('You cannot decide a proposal you made');
    if (!b.approve && !b.note?.trim()) throw new BadRequestException('Give a reason for rejecting');
    const status = b.approve ? 'approved' : 'rejected';
    const [done] = await tx.update(assetCondemnations).set({ status, committeeNote: b.note ?? null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(assetCondemnations.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `assets.condemnation_${status}`, subjectType: 'asset_condemnation', subjectId: id, before: { status: c.status }, after: { status } });
    return done;
  }

  /** Writes off an approved condemnation: the asset is disposed of at the amount realised (auction, scrap, buyback). */
  async writeOff(tx: Tx, p: Pick<UserPrincipal, 'tenantId' | 'userId'>, id: string, b: { disposalMode: string; realisedPaise: number; on?: string }) {
    const [c] = await tx.select().from(assetCondemnations).where(eq(assetCondemnations.id, id)).for('update');
    if (!c) throw new NotFoundException('Condemnation not found');
    if (c.status !== 'approved') throw new ConflictException('Only an approved condemnation can be written off');
    const on = b.on ?? (await this.today(tx));
    await this.dispose(tx, p, c.assetId, { disposedOn: on, disposalPaise: b.realisedPaise });
    const [done] = await tx.update(assetCondemnations).set({ status: 'written_off', disposalMode: b.disposalMode, realisedPaise: b.realisedPaise, writtenOffOn: on }).where(eq(assetCondemnations.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'assets.written_off', subjectType: 'asset_condemnation', subjectId: id, data: { disposalMode: b.disposalMode, realisedPaise: b.realisedPaise } });
    return done;
  }
}
