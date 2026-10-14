import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, nextNumber } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { departments, invItems, invPurchaseOrders, invStock, invStockMoves, invStores, invVendors, users } from '../db/schema.js';
import { invApprovedVendors, invCategories, invDebitNotes, invRateContracts, invStockVerificationLines, invStockVerifications, invVendorRatings } from '../db/schema-procurement.js';
import { APPROVER_ROLES, STAFF_ROLES, STORE_ROLES } from './inventory.controller.js';
import { fiscalYearOf, vendorScore } from './procurement.logic.js';
import { ProcurementService } from './procurement.service.js';
import { applyStockMove } from './stock.js';

const Score = z.number().int().min(1).max(5);
const RatingBody = z.object({ poId: z.uuid().nullish(), quality: Score, delivery: Score, price: Score, note: z.string().trim().max(300).default('') });
const VendorsBody = z.object({ vendorIds: z.array(z.uuid()).max(200) });
const VerifyBody = z.object({ storeId: z.uuid(), note: z.string().trim().max(300).default('') });
const CountBody = z.object({ counts: z.array(z.object({ itemId: z.uuid(), countedQty: z.number().int().min(0).max(10_000_000), remark: z.string().trim().max(200).default('') })).min(1).max(2000) });
const ReorderBody = z.object({ itemIds: z.array(z.uuid()).min(1).max(50), departmentId: z.uuid().nullish(), reason: z.string().trim().max(300).default('Reorder: stock at or below the reorder level') });

/**
 * The depth around buying and stores: approved vendor lists per category, vendor ratings, rate contracts in force,
 * department budget positions, debit notes, stock verification (the annual audit), reorder suggestions and
 * consumption by department.
 */
@Controller('v1/inventory')
export class ProcurementDepthController {
  constructor(
    private readonly db: DbService,
    private readonly proc: ProcurementService,
  ) {}

  // --- Categories and approved vendors -------------------------------------------------------

  @Get('categories')
  @Auth('user', STAFF_ROLES)
  categories(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cats = await tx.select().from(invCategories).orderBy(asc(invCategories.name));
      const approved = await tx.select({ categoryId: invApprovedVendors.categoryId, vendorId: invVendors.id, vendor: invVendors.name }).from(invApprovedVendors).innerJoin(invVendors, eq(invVendors.id, invApprovedVendors.vendorId));
      return cats.map((c) => ({ ...c, vendors: approved.filter((a) => a.categoryId === c.id).map((a) => ({ id: a.vendorId, name: a.vendor })) }));
    });
  }

  /** Sets a category's approved vendor list (empty = any vendor may supply it). */
  @Put('categories/:id/vendors')
  @Auth('user', STORE_ROLES)
  setVendors(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VendorsBody)) b: z.infer<typeof VendorsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(invCategories).where(eq(invCategories.id, id));
      if (!c) throw new NotFoundException('Category not found');
      const ids = [...new Set(b.vendorIds)];
      if (ids.length) {
        const found = await tx.select({ id: invVendors.id, blacklisted: invVendors.blacklisted }).from(invVendors).where(inArray(invVendors.id, ids));
        if (found.length !== ids.length) throw new BadRequestException('A vendor was not found');
        if (found.some((v) => v.blacklisted)) throw new ConflictException('A blacklisted vendor cannot be approved');
      }
      const before = (await tx.select({ v: invApprovedVendors.vendorId }).from(invApprovedVendors).where(eq(invApprovedVendors.categoryId, id))).map((x) => x.v).sort();
      await tx.delete(invApprovedVendors).where(eq(invApprovedVendors.categoryId, id));
      if (ids.length) await tx.insert(invApprovedVendors).values(ids.map((vendorId) => ({ tenantId: p.tenantId, categoryId: id, vendorId })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.approved_vendors_set', subjectType: 'inv_category', subjectId: id, before: { vendors: before }, after: { vendors: [...ids].sort() } });
      return { categoryId: id, vendorIds: ids };
    });
  }

  // --- Vendors: profile and rating ------------------------------------------------------------

  /** A vendor's profile: orders, open debit notes, ratings and score, approved categories and rate contracts. */
  @Get('vendors/:id')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  vendor(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(invVendors).where(eq(invVendors.id, id));
      if (!v) throw new NotFoundException('Vendor not found');
      const ratings = await tx.select({ r: invVendorRatings, by: users.fullName, po: invPurchaseOrders.number }).from(invVendorRatings).leftJoin(users, eq(users.id, invVendorRatings.ratedBy)).leftJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invVendorRatings.poId)).where(eq(invVendorRatings.vendorId, id)).orderBy(desc(invVendorRatings.createdAt));
      const orders = await tx.select({ id: invPurchaseOrders.id, number: invPurchaseOrders.number, status: invPurchaseOrders.status, totalPaise: invPurchaseOrders.totalPaise, createdAt: invPurchaseOrders.createdAt }).from(invPurchaseOrders).where(eq(invPurchaseOrders.vendorId, id)).orderBy(desc(invPurchaseOrders.createdAt)).limit(100);
      const categories = await tx.select({ id: invCategories.id, name: invCategories.name }).from(invApprovedVendors).innerJoin(invCategories, eq(invCategories.id, invApprovedVendors.categoryId)).where(eq(invApprovedVendors.vendorId, id));
      const contracts = await tx.select({ c: invRateContracts, item: invItems.name, sku: invItems.sku }).from(invRateContracts).innerJoin(invItems, eq(invItems.id, invRateContracts.itemId)).where(eq(invRateContracts.vendorId, id)).orderBy(desc(invRateContracts.validTo));
      const debitNotes = await tx.select().from(invDebitNotes).where(eq(invDebitNotes.vendorId, id)).orderBy(desc(invDebitNotes.createdAt));
      return { ...v, score: vendorScore(ratings.map((r) => r.r)), ratings: ratings.map((r) => ({ ...r.r, by: r.by, po: r.po })), orders, categories, contracts: contracts.map((c) => ({ ...c.c, item: c.item, sku: c.sku })), debitNotes };
    });
  }

  /** Blacklists a vendor with the reason: no new orders, quotations or approved-list places until it is lifted. */
  @Post('vendors/:id/blacklist')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  blacklist(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ reason: z.string().trim().min(3).max(300) }))) b: { reason: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(invVendors).where(eq(invVendors.id, id)).for('update');
      if (!v) throw new NotFoundException('Vendor not found');
      if (v.blacklisted) throw new ConflictException('This vendor is already blacklisted');
      const [row] = await tx.update(invVendors).set({ blacklisted: true, blacklistReason: b.reason, blacklistedAt: new Date() }).where(eq(invVendors.id, id)).returning();
      await tx.delete(invApprovedVendors).where(eq(invApprovedVendors.vendorId, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.vendor_blacklisted', subjectType: 'inv_vendor', subjectId: id, before: { blacklisted: false }, after: { blacklisted: true }, data: { reason: b.reason } });
      return row;
    });
  }

  @Post('vendors/:id/ratings')
  @Auth('user', STORE_ROLES)
  rate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RatingBody)) b: z.infer<typeof RatingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select({ id: invVendors.id }).from(invVendors).where(eq(invVendors.id, id));
      if (!v) throw new NotFoundException('Vendor not found');
      if (b.poId) {
        const [po] = await tx.select({ vendorId: invPurchaseOrders.vendorId }).from(invPurchaseOrders).where(eq(invPurchaseOrders.id, b.poId));
        if (!po || po.vendorId !== id) throw new BadRequestException('That order is not from this vendor');
      }
      const [row] = await tx.insert(invVendorRatings).values({ tenantId: p.tenantId, vendorId: id, poId: b.poId ?? null, quality: b.quality, delivery: b.delivery, price: b.price, note: b.note, ratedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.vendor_rated', subjectType: 'inv_vendor', subjectId: id, data: { quality: b.quality, delivery: b.delivery, price: b.price } });
      return row;
    });
  }

  /** Rate contracts in force today for an item (lowest rate first), for ordering under a contract. */
  @Get('rate-contracts/current')
  @Auth('user', STORE_ROLES)
  current(@CurrentPrincipal() p: UserPrincipal, @Query('itemId') itemId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      return tx
        .select({ id: invRateContracts.id, vendorId: invRateContracts.vendorId, vendor: invVendors.name, itemId: invRateContracts.itemId, item: invItems.name, ratePaise: invRateContracts.ratePaise, validTo: invRateContracts.validTo, reference: invRateContracts.reference })
        .from(invRateContracts)
        .innerJoin(invVendors, eq(invVendors.id, invRateContracts.vendorId))
        .innerJoin(invItems, eq(invItems.id, invRateContracts.itemId))
        .where(and(eq(invRateContracts.active, true), lte(invRateContracts.validFrom, today), gte(invRateContracts.validTo, today), itemId && z.uuid().safeParse(itemId).success ? eq(invRateContracts.itemId, itemId) : undefined))
        .orderBy(asc(invItems.name), asc(invRateContracts.ratePaise));
    });
  }

  /** A department's budget for this financial year: budget, spent, committed by approved indents, and what is left. */
  @Get('budget/:departmentId')
  @Auth('user', STAFF_ROLES)
  budget(@CurrentPrincipal() p: UserPrincipal, @Param('departmentId', ParseUUIDPipe) departmentId: string, @Query('fy') fy?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select({ name: departments.name }).from(departments).where(eq(departments.id, departmentId));
      if (!d) throw new NotFoundException('Department not found');
      const year = fy && /^\d{4}-\d{2}$/.test(fy) ? fy : fiscalYearOf(await this.proc.today(tx));
      const b = await this.proc.budgetOf(tx, departmentId, year);
      return { department: d.name, ...b, availablePaise: b.budgetPaise - b.spentPaise - b.committedPaise };
    });
  }

  @Get('debit-notes')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  debitNotes(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ d: invDebitNotes, vendor: invVendors.name, po: invPurchaseOrders.number })
        .from(invDebitNotes)
        .innerJoin(invVendors, eq(invVendors.id, invDebitNotes.vendorId))
        .innerJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invDebitNotes.poId))
        .where(status === 'open' || status === 'adjusted' ? eq(invDebitNotes.status, status) : undefined)
        .orderBy(desc(invDebitNotes.createdAt))
        .limit(500)
        .then((rows) => rows.map((r) => ({ ...r.d, vendor: r.vendor, po: r.po }))),
    );
  }

  // --- Reorder ----------------------------------------------------------------------------------

  /** Items at or below their reorder level, with how much to order (the reorder quantity, or back to twice the level). */
  @Get('reorder')
  @Auth('user', STORE_ROLES)
  reorder(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: invItems.id, sku: invItems.sku, name: invItems.name, unit: invItems.unit, category: invItems.category, reorderLevel: invItems.reorderLevel, reorderQty: invItems.reorderQty, lastPricePaise: invItems.lastPricePaise, onHand: sql<number>`coalesce((select sum(s.qty)::int from inv_stock s where s.item_id = "inv_items"."id"), 0)` })
        .from(invItems)
        .where(and(eq(invItems.active, true), sql`${invItems.reorderLevel} > 0`))
        .orderBy(asc(invItems.name));
      return rows.filter((r) => r.onHand <= r.reorderLevel).map((r) => ({ ...r, suggestedQty: r.reorderQty > 0 ? r.reorderQty : Math.max(1, r.reorderLevel * 2 - r.onHand) }));
    });
  }

  /** Raises one indent for the chosen low items at their suggested quantities. */
  @Post('reorder/indent')
  @Auth('user', STORE_ROLES)
  reorderIndent(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReorderBody)) b: z.infer<typeof ReorderBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const items = await tx.select({ id: invItems.id, reorderLevel: invItems.reorderLevel, reorderQty: invItems.reorderQty, onHand: sql<number>`coalesce((select sum(s.qty)::int from inv_stock s where s.item_id = "inv_items"."id"), 0)` }).from(invItems).where(inArray(invItems.id, b.itemIds));
      if (items.length !== new Set(b.itemIds).size) throw new BadRequestException('An item was not found');
      return this.proc.raiseIndent(tx, p, { reason: b.reason, departmentId: b.departmentId ?? null, lines: items.map((i) => ({ itemId: i.id, qty: i.reorderQty > 0 ? i.reorderQty : Math.max(1, i.reorderLevel * 2 - i.onHand) })) });
    });
  }

  // --- Consumption --------------------------------------------------------------------------------

  /** What each department drew from the stores in a period, by item, with its value at the last purchase price. */
  @Get('consumption')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  consumption(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    const f = Day.safeParse(from);
    const t = Day.safeParse(to);
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ department: sql<string>`coalesce(${departments.name}, ${invStockMoves.issuedTo}, '')`, itemId: invItems.id, item: invItems.name, unit: invItems.unit, qty: sql<number>`(-sum(${invStockMoves.delta}))::int`, valuePaise: sql<number>`(-sum(${invStockMoves.delta}) * max(${invItems.lastPricePaise}))::bigint`.mapWith(Number) })
        .from(invStockMoves)
        .innerJoin(invItems, eq(invItems.id, invStockMoves.itemId))
        .leftJoin(departments, eq(departments.id, invStockMoves.departmentId))
        .where(and(eq(invStockMoves.kind, 'issue'), f.success ? sql`${invStockMoves.createdAt}::date >= ${f.data}::date` : undefined, t.success ? sql`${invStockMoves.createdAt}::date <= ${t.data}::date` : undefined))
        .groupBy(sql`1`, invItems.id)
        .orderBy(sql`1`, asc(invItems.name)),
    );
  }

  // --- Stock verification -------------------------------------------------------------------------

  @Get('verifications')
  @Auth('user', STORE_ROLES)
  verifications(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      (await tx
        .select({ v: invStockVerifications, store: invStores.name, lines: sql<number>`(select count(*)::int from inv_stock_verification_lines l where l.verification_id = ${invStockVerifications.id})`, counted: sql<number>`(select count(*)::int from inv_stock_verification_lines l where l.verification_id = ${invStockVerifications.id} and l.counted_qty is not null)` })
        .from(invStockVerifications)
        .innerJoin(invStores, eq(invStores.id, invStockVerifications.storeId))
        .orderBy(desc(invStockVerifications.createdAt))
        .limit(200)).map((r) => ({ ...r.v, store: r.store, lines: r.lines, counted: r.counted })),
    );
  }

  /** Starts a verification of a store: every item it holds, with the book quantity as of now. One open verification per store. */
  @Post('verifications')
  @Auth('user', STORE_ROLES)
  startVerification(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VerifyBody)) b: z.infer<typeof VerifyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [store] = await tx.select({ id: invStores.id }).from(invStores).where(eq(invStores.id, b.storeId));
      if (!store) throw new NotFoundException('Store not found');
      const [open] = await tx.select({ number: invStockVerifications.number }).from(invStockVerifications).where(and(eq(invStockVerifications.storeId, b.storeId), eq(invStockVerifications.status, 'open')));
      if (open) throw new ConflictException(`Verification ${open.number} of this store is still open`);
      const stock = await tx.select({ itemId: invStock.itemId, qty: invStock.qty }).from(invStock).innerJoin(invItems, eq(invItems.id, invStock.itemId)).where(eq(invStock.storeId, b.storeId));
      if (!stock.length) throw new ConflictException('This store holds no items to verify');
      const number = await nextNumber(tx, p.tenantId, 'SV');
      const [v] = await tx.insert(invStockVerifications).values({ tenantId: p.tenantId, number, storeId: b.storeId, fiscalYear: fiscalYearOf(await this.proc.today(tx)), note: b.note, startedBy: p.userId }).returning();
      await tx.insert(invStockVerificationLines).values(stock.map((s) => ({ tenantId: p.tenantId, verificationId: v.id, itemId: s.itemId, bookQty: s.qty })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.verification_started', subjectType: 'inv_stock_verification', subjectId: v.id, data: { number, items: stock.length } });
      return v;
    });
  }

  @Get('verifications/:id')
  @Auth('user', STORE_ROLES)
  verification(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select({ v: invStockVerifications, store: invStores.name }).from(invStockVerifications).innerJoin(invStores, eq(invStores.id, invStockVerifications.storeId)).where(eq(invStockVerifications.id, id));
      if (!v) throw new NotFoundException('Verification not found');
      const lines = await tx
        .select({ id: invStockVerificationLines.id, itemId: invItems.id, sku: invItems.sku, item: invItems.name, unit: invItems.unit, bookQty: invStockVerificationLines.bookQty, countedQty: invStockVerificationLines.countedQty, remark: invStockVerificationLines.remark, valuePaise: invItems.lastPricePaise })
        .from(invStockVerificationLines)
        .innerJoin(invItems, eq(invItems.id, invStockVerificationLines.itemId))
        .where(eq(invStockVerificationLines.verificationId, id))
        .orderBy(asc(invItems.name));
      const out = lines.map((l) => ({ ...l, variance: l.countedQty === null ? null : l.countedQty - l.bookQty, varianceValuePaise: l.countedQty === null ? null : (l.countedQty - l.bookQty) * l.valuePaise }));
      return { ...v.v, store: v.store, lines: out, summary: { items: out.length, counted: out.filter((l) => l.countedQty !== null).length, short: out.filter((l) => (l.variance ?? 0) < 0).length, excess: out.filter((l) => (l.variance ?? 0) > 0).length, varianceValuePaise: out.reduce((s, l) => s + (l.varianceValuePaise ?? 0), 0) } };
    });
  }

  /** Records counted quantities (any number of times while open). */
  @Put('verifications/:id/counts')
  @Auth('user', STORE_ROLES)
  count(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CountBody)) b: z.infer<typeof CountBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(invStockVerifications).where(eq(invStockVerifications.id, id)).for('update');
      if (!v) throw new NotFoundException('Verification not found');
      if (v.status !== 'open') throw new ConflictException('This verification is closed');
      let n = 0;
      for (const c of b.counts) {
        const done = await tx.update(invStockVerificationLines).set({ countedQty: c.countedQty, remark: c.remark, countedBy: p.userId, countedAt: new Date() }).where(and(eq(invStockVerificationLines.verificationId, id), eq(invStockVerificationLines.itemId, c.itemId))).returning({ id: invStockVerificationLines.id });
        if (!done.length) throw new BadRequestException('An item is not on this verification');
        n++;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.verification_counted', subjectType: 'inv_stock_verification', subjectId: id, data: { lines: n } });
      return { counted: n };
    });
  }

  /**
   * Closes a verification: every line must be counted, and with `adjust` each difference is posted to stock as a
   * verification adjustment (approvers only). Without it, the verification closes as a report only.
   */
  @Post('verifications/:id/close')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ adjust: z.boolean().default(false) }))) b: { adjust: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.adjust && !p.roles.some((r) => APPROVER_ROLES.includes(r))) throw new BadRequestException('Only the principal or administrator can adjust stock to the count');
      const [v] = await tx.select().from(invStockVerifications).where(eq(invStockVerifications.id, id)).for('update');
      if (!v) throw new NotFoundException('Verification not found');
      if (v.status !== 'open') throw new ConflictException('This verification is already closed');
      const lines = await tx.select().from(invStockVerificationLines).where(eq(invStockVerificationLines.verificationId, id));
      if (lines.some((l) => l.countedQty === null)) throw new ConflictException('Count every item before closing');
      let adjusted = 0;
      if (b.adjust) {
        for (const l of lines) {
          const [cur] = await tx.select({ qty: invStock.qty }).from(invStock).where(and(eq(invStock.storeId, v.storeId), eq(invStock.itemId, l.itemId)));
          // Moves since the verification began stay: the difference counted is applied to today's stock.
          const delta = l.countedQty! - l.bookQty;
          if (delta === 0 || !cur) continue;
          await applyStockMove(tx, p, { storeId: v.storeId, itemId: l.itemId, delta, kind: 'verify_adjust', qty: Math.abs(delta), note: `${v.number}: ${l.remark || 'physical verification'}`, refType: 'inv_stock_verification', refId: id });
          adjusted++;
        }
      }
      const [done] = await tx.update(invStockVerifications).set({ status: 'closed', closedBy: p.userId, closedAt: new Date() }).where(eq(invStockVerifications.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.verification_closed', subjectType: 'inv_stock_verification', subjectId: id, data: { adjusted } });
      return { ...done, adjusted };
    });
  }
}
