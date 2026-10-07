import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { nextNumber, orConflict, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { invGoodsReceiptLines, invGoodsReceipts, invInvoices, invItems, invPoLines, invPurchaseOrders, invRequisitionLines, invRequisitions, invStock, invStockMoves, invStores, invVendors } from '../db/schema.js';

export const STORE_ROLES: RoleName[] = ['store_keeper', 'tenant_admin', 'principal'];
/** Who approves requisitions and invoice mismatches. */
export const APPROVER_ROLES: RoleName[] = ['tenant_admin', 'principal'];
/** Anyone on the staff may ask for something. */
const STAFF_ROLES: RoleName[] = ['store_keeper', 'tenant_admin', 'principal', 'hod', 'teacher', 'librarian', 'accountant', 'transport_manager', 'hostel_warden', 'canteen_manager'];

const Qty = z.number().int().min(1).max(1_000_000);
const StoreBody = z.object({ name: z.string().trim().min(1).max(80), location: z.string().trim().max(120).default('') });
const ItemBody = z.object({ sku: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120), category: z.string().trim().max(60).default('general'), unit: z.string().trim().max(20).default('nos'), reorderLevel: z.number().int().min(0).max(1_000_000).default(0) });
const ItemPatch = z.object({ name: z.string().trim().min(1).max(120).optional(), reorderLevel: z.number().int().min(0).max(1_000_000).optional(), active: z.boolean().optional() });
const VendorBody = z.object({ name: z.string().trim().min(1).max(120), gstin: z.string().trim().length(15).optional(), phone: z.string().trim().max(20).default(''), email: z.email().optional() });
const MoveBody = z.object({ storeId: z.uuid(), itemId: z.uuid(), qty: Qty, note: z.string().trim().max(200).default('') });
const IssueBody = MoveBody.extend({ issuedTo: z.string().trim().min(1).max(120) });
const ReqBody = z.object({ reason: z.string().trim().max(300).default(''), lines: z.array(z.object({ itemId: z.uuid(), qty: Qty })).min(1).max(50) });
const DecisionBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
const PoBody = z.object({ requisitionId: z.uuid(), vendorId: z.uuid(), storeId: z.uuid(), lines: z.array(z.object({ itemId: z.uuid(), qty: Qty, unitPricePaise: Paise.min(1) })).min(1).max(50) });
const GrnBody = z.object({ idempotencyKey: z.string().min(8).max(80), note: z.string().trim().max(200).default(''), lines: z.array(z.object({ poLineId: z.uuid(), qty: Qty })).min(1) });
const InvoiceBody = z.object({ invoiceNo: z.string().trim().min(1).max(60), amountPaise: Paise.min(1) });

/**
 * Inventory and procurement: stores, items and stock (every change a ledger row), reorder
 * levels, vendors, and the buying chain requisition, approval, purchase order, goods receipt
 * and three-way invoice match.
 */
@Controller('v1/inventory')
export class InventoryController {
  constructor(private readonly db: DbService) {}

  // --- Masters -----------------------------------------------------------------------------

  @Get('stores')
  @Auth('user', STORE_ROLES)
  stores(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(invStores).orderBy(asc(invStores.name)));
  }

  @Post('stores')
  @Auth('user', STORE_ROLES)
  addStore(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StoreBody)) b: z.infer<typeof StoreBody>) {
    return orConflict('A store with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [s] = await tx.insert(invStores).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.store_added', subjectType: 'inv_store', subjectId: s.id });
        return s;
      }),
    );
  }

  /** Items with the quantity on hand across stores; `low` marks those at or under their reorder level. */
  @Get('items')
  @Auth('user', STAFF_ROLES)
  items(@CurrentPrincipal() p: UserPrincipal, @Query('low') low?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: invItems.id, sku: invItems.sku, name: invItems.name, category: invItems.category, unit: invItems.unit, reorderLevel: invItems.reorderLevel, active: invItems.active, onHand: sql<number>`coalesce((select sum(s.qty)::int from inv_stock s where s.item_id = "inv_items"."id"), 0)` })
        .from(invItems)
        .orderBy(asc(invItems.name));
      const all = rows.map((r) => ({ ...r, low: r.active && r.onHand <= r.reorderLevel && r.reorderLevel > 0 }));
      return low === 'true' ? all.filter((r) => r.low) : all;
    });
  }

  @Post('items')
  @Auth('user', STORE_ROLES)
  addItem(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ItemBody)) b: z.infer<typeof ItemBody>) {
    return orConflict('An item with this SKU already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [i] = await tx.insert(invItems).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.item_added', subjectType: 'inv_item', subjectId: i.id });
        return i;
      }),
    );
  }

  @Patch('items/:id')
  @Auth('user', STORE_ROLES)
  patchItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemPatch)) b: z.infer<typeof ItemPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [i] = await tx.update(invItems).set(b).where(eq(invItems.id, id)).returning();
      if (!i) throw new NotFoundException('Item not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.item_updated', subjectType: 'inv_item', subjectId: id, data: b });
      return i;
    });
  }

  @Get('vendors')
  @Auth('user', STORE_ROLES)
  vendors(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(invVendors).orderBy(asc(invVendors.name)));
  }

  @Post('vendors')
  @Auth('user', STORE_ROLES)
  addVendor(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VendorBody)) b: z.infer<typeof VendorBody>) {
    return orConflict('A vendor with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [v] = await tx.insert(invVendors).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.vendor_added', subjectType: 'inv_vendor', subjectId: v.id });
        return v;
      }),
    );
  }

  // --- Stock -------------------------------------------------------------------------------

  /** On-hand quantity per store and item. */
  @Get('stock')
  @Auth('user', STORE_ROLES)
  stock(@CurrentPrincipal() p: UserPrincipal, @Query('storeId') storeId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ storeId: invStock.storeId, store: invStores.name, itemId: invStock.itemId, sku: invItems.sku, item: invItems.name, unit: invItems.unit, qty: invStock.qty, reorderLevel: invItems.reorderLevel })
        .from(invStock)
        .innerJoin(invStores, eq(invStores.id, invStock.storeId))
        .innerJoin(invItems, eq(invItems.id, invStock.itemId))
        .where(storeId ? eq(invStock.storeId, storeId) : undefined)
        .orderBy(asc(invItems.name)),
    );
  }

  @Get('stock/moves')
  @Auth('user', STORE_ROLES)
  moves(@CurrentPrincipal() p: UserPrincipal, @Query('itemId') itemId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(invStockMoves).where(itemId ? eq(invStockMoves.itemId, itemId) : undefined).orderBy(desc(invStockMoves.createdAt)).limit(200),
    );
  }

  /** Stock received outside a purchase order (opening balance, donation, return). */
  @Post('stock/in')
  @Auth('user', STORE_ROLES)
  stockIn(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MoveBody)) b: z.infer<typeof MoveBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.applyMove(tx, p, { ...b, delta: b.qty, kind: 'in' }));
  }

  /** Stock leaving without an owner: damage, expiry, loss. */
  @Post('stock/out')
  @Auth('user', STORE_ROLES)
  stockOut(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MoveBody)) b: z.infer<typeof MoveBody>) {
    if (!b.note) throw new BadRequestException('Say why the stock is written off');
    return this.db.withTenant(p.tenantId, (tx) => this.applyMove(tx, p, { ...b, delta: -b.qty, kind: 'out' }));
  }

  /** Stock handed to a person or department. */
  @Post('stock/issue')
  @Auth('user', STORE_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IssueBody)) b: z.infer<typeof IssueBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.applyMove(tx, p, { ...b, delta: -b.qty, kind: 'issue' }));
  }

  // --- Requisitions ------------------------------------------------------------------------

  @Post('requisitions')
  @Auth('user', STAFF_ROLES)
  requisition(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReqBody)) b: z.infer<typeof ReqBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertItems(tx, b.lines.map((l) => l.itemId));
      const number = await nextNumber(tx, p.tenantId, 'REQ');
      const [r] = await tx.insert(invRequisitions).values({ tenantId: p.tenantId, number, requestedBy: p.userId, reason: b.reason }).returning();
      await tx.insert(invRequisitionLines).values(b.lines.map((l) => ({ tenantId: p.tenantId, requisitionId: r.id, ...l })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.requisition_raised', subjectType: 'inv_requisition', subjectId: r.id, data: { number } });
      return r;
    });
  }

  /** Store and approvers see all requisitions; everyone else their own. */
  @Get('requisitions')
  @Auth('user', STAFF_ROLES)
  requisitions(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const all = p.roles.some((r) => STORE_ROLES.includes(r));
      const rows = await tx
        .select()
        .from(invRequisitions)
        .where(and(all ? undefined : eq(invRequisitions.requestedBy, p.userId), status ? eq(invRequisitions.status, status) : undefined))
        .orderBy(desc(invRequisitions.createdAt))
        .limit(200);
      const lines = rows.length
        ? await tx
            .select({ requisitionId: invRequisitionLines.requisitionId, itemId: invItems.id, item: invItems.name, unit: invItems.unit, qty: invRequisitionLines.qty })
            .from(invRequisitionLines)
            .innerJoin(invItems, eq(invItems.id, invRequisitionLines.itemId))
            .where(inArray(invRequisitionLines.requisitionId, rows.map((r) => r.id)))
        : [];
      return rows.map((r) => ({ ...r, lines: lines.filter((l) => l.requisitionId === r.id) }));
    });
  }

  /** Approve or reject. Not by the person who raised it (maker and checker differ). */
  @Post('requisitions/:id/decision')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, id)).for('update');
      if (!r) throw new NotFoundException('Requisition not found');
      if (r.requestedBy === p.userId) throw new ForbiddenException('You cannot approve your own requisition');
      if (r.status !== 'submitted') throw new ConflictException(`This requisition is already ${r.status}`);
      const [done] = await tx.update(invRequisitions).set({ status: b.approve ? 'approved' : 'rejected', decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.note ?? null }).where(eq(invRequisitions.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.approve ? 'inventory.requisition_approved' : 'inventory.requisition_rejected', subjectType: 'inv_requisition', subjectId: id });
      return done;
    });
  }

  // --- Purchase orders, receipts, invoices ---------------------------------------------------

  @Post('purchase-orders')
  @Auth('user', STORE_ROLES)
  createPo(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PoBody)) b: z.infer<typeof PoBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [req] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, b.requisitionId)).for('update');
      if (!req) throw new NotFoundException('Requisition not found');
      if (req.status !== 'approved') throw new ConflictException('Only an approved requisition can be ordered');
      const asked = await tx.select().from(invRequisitionLines).where(eq(invRequisitionLines.requisitionId, req.id));
      for (const l of b.lines) {
        const a = asked.find((x) => x.itemId === l.itemId);
        if (!a) throw new BadRequestException('A line is not on the requisition');
        if (l.qty > a.qty) throw new BadRequestException('A line asks for more than the requisition approved');
      }
      const [vendor] = await tx.select({ id: invVendors.id }).from(invVendors).where(and(eq(invVendors.id, b.vendorId), eq(invVendors.active, true)));
      const [store] = await tx.select({ id: invStores.id }).from(invStores).where(eq(invStores.id, b.storeId));
      if (!vendor || !store) throw new BadRequestException('Vendor or store not found');
      const number = await nextNumber(tx, p.tenantId, 'PO');
      const total = b.lines.reduce((t, l) => t + l.qty * l.unitPricePaise, 0);
      const [po] = await tx.insert(invPurchaseOrders).values({ tenantId: p.tenantId, number, requisitionId: req.id, vendorId: b.vendorId, storeId: b.storeId, totalPaise: total, createdBy: p.userId }).returning();
      await tx.insert(invPoLines).values(b.lines.map((l) => ({ tenantId: p.tenantId, poId: po.id, ...l })));
      await tx.update(invRequisitions).set({ status: 'ordered' }).where(eq(invRequisitions.id, req.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.po_issued', subjectType: 'inv_purchase_order', subjectId: po.id, data: { number, totalPaise: total } });
      return po;
    });
  }

  @Get('purchase-orders')
  @Auth('user', STORE_ROLES)
  pos(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: invPurchaseOrders.id, number: invPurchaseOrders.number, status: invPurchaseOrders.status, totalPaise: invPurchaseOrders.totalPaise, vendor: invVendors.name, createdAt: invPurchaseOrders.createdAt })
        .from(invPurchaseOrders)
        .innerJoin(invVendors, eq(invVendors.id, invPurchaseOrders.vendorId))
        .where(status ? eq(invPurchaseOrders.status, status) : undefined)
        .orderBy(desc(invPurchaseOrders.createdAt))
        .limit(200),
    );
  }

  @Get('purchase-orders/:id')
  @Auth('user', STORE_ROLES)
  po(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id));
      if (!po) throw new NotFoundException('Purchase order not found');
      const lines = await tx
        .select({ id: invPoLines.id, itemId: invItems.id, item: invItems.name, unit: invItems.unit, qty: invPoLines.qty, unitPricePaise: invPoLines.unitPricePaise, receivedQty: invPoLines.receivedQty })
        .from(invPoLines)
        .innerJoin(invItems, eq(invItems.id, invPoLines.itemId))
        .where(eq(invPoLines.poId, id));
      const invoices = await tx.select().from(invInvoices).where(eq(invInvoices.poId, id));
      const receipts = await tx.select().from(invGoodsReceipts).where(eq(invGoodsReceipts.poId, id)).orderBy(asc(invGoodsReceipts.receivedAt));
      return { ...po, lines, invoices, receipts };
    });
  }

  /** Goods arrive: stock goes up in the PO's store. Retried with the same key, it applies once. */
  @Post('purchase-orders/:id/receipts')
  @Auth('user', STORE_ROLES)
  receive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(GrnBody)) b: z.infer<typeof GrnBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [again] = await tx.select().from(invGoodsReceipts).where(eq(invGoodsReceipts.idempotencyKey, b.idempotencyKey));
      if (again) {
        if (again.poId !== id) throw new ConflictException('That key was used for another order');
        return { ...again, repeated: true };
      }
      const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id)).for('update');
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status === 'cancelled' || po.status === 'received') throw new ConflictException(`This order is ${po.status}`);
      const lines = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id)).for('update');
      const [grn] = await tx.insert(invGoodsReceipts).values({ tenantId: p.tenantId, poId: id, receivedBy: p.userId, note: b.note, idempotencyKey: b.idempotencyKey }).returning();
      for (const l of b.lines) {
        const line = lines.find((x) => x.id === l.poLineId);
        if (!line) throw new BadRequestException('A line is not on this order');
        if (line.receivedQty + l.qty > line.qty) throw new BadRequestException(`Only ${line.qty - line.receivedQty} more of a line is expected`);
        await tx.update(invPoLines).set({ receivedQty: sql`${invPoLines.receivedQty} + ${l.qty}` }).where(eq(invPoLines.id, line.id));
        await tx.insert(invGoodsReceiptLines).values({ tenantId: p.tenantId, receiptId: grn.id, poLineId: line.id, qty: l.qty });
        line.receivedQty += l.qty;
        await this.applyMove(tx, p, { storeId: po.storeId, itemId: line.itemId, delta: l.qty, kind: 'grn', qty: l.qty, note: po.number, refType: 'goods_receipt', refId: grn.id });
      }
      const complete = lines.every((l) => l.receivedQty >= l.qty);
      await tx.update(invPurchaseOrders).set({ status: complete ? 'received' : 'partially_received' }).where(eq(invPurchaseOrders.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.goods_received', subjectType: 'inv_goods_receipt', subjectId: grn.id, data: { po: po.number, complete } });
      return { ...grn, repeated: false };
    });
  }

  /** The vendor's invoice is matched to what was ordered and received; a difference is held for an approver. */
  @Post('purchase-orders/:id/invoices')
  @Auth('user', STORE_ROLES)
  invoice(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(InvoiceBody)) b: z.infer<typeof InvoiceBody>) {
    return orConflict('This invoice number is already recorded for the vendor', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id));
        if (!po) throw new NotFoundException('Purchase order not found');
        const lines = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id));
        const expected = lines.reduce((t, l) => t + l.receivedQty * l.unitPricePaise, 0);
        if (expected === 0) throw new ConflictException('Nothing has been received against this order yet');
        const matched = b.amountPaise === expected;
        const [inv] = await tx
          .insert(invInvoices)
          .values({ tenantId: p.tenantId, poId: id, vendorId: po.vendorId, invoiceNo: b.invoiceNo, amountPaise: b.amountPaise, expectedPaise: expected, status: matched ? 'matched' : 'mismatch', note: matched ? null : `Invoice differs from received goods by ${b.amountPaise - expected} paise`, createdBy: p.userId })
          .returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: matched ? 'inventory.invoice_matched' : 'inventory.invoice_mismatch', subjectType: 'inv_invoice', subjectId: inv.id });
        return inv;
      }),
    );
  }

  @Get('invoices')
  @Auth('user', STORE_ROLES)
  invoices(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ invoice: invInvoices, po: invPurchaseOrders.number, vendor: invVendors.name })
        .from(invInvoices)
        .innerJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invInvoices.poId))
        .innerJoin(invVendors, eq(invVendors.id, invInvoices.vendorId))
        .where(status ? eq(invInvoices.status, status) : undefined)
        .orderBy(desc(invInvoices.createdAt))
        .limit(200),
    );
  }

  /** An approver accepts a mismatched invoice (not the person who recorded it). */
  @Post('invoices/:id/approve')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  approveInvoice(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(invInvoices).where(eq(invInvoices.id, id)).for('update');
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'mismatch') throw new ConflictException(`This invoice is ${inv.status}`);
      if (inv.createdBy === p.userId) throw new ForbiddenException('You cannot approve an invoice you recorded');
      const [done] = await tx.update(invInvoices).set({ status: 'approved' }).where(eq(invInvoices.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.invoice_approved', subjectType: 'inv_invoice', subjectId: id });
      return done;
    });
  }

  @Post('invoices/:id/paid')
  @HttpCode(200)
  @Auth('user', ['accountant', ...APPROVER_ROLES])
  paid(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.update(invInvoices).set({ status: 'paid' }).where(and(eq(invInvoices.id, id), inArray(invInvoices.status, ['matched', 'approved']))).returning();
      if (!inv) throw new ConflictException('Only a matched or approved invoice can be paid');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.invoice_paid', subjectType: 'inv_invoice', subjectId: id });
      return inv;
    });
  }

  // --- helpers -----------------------------------------------------------------------------

  /** Changes stock under a row lock and writes the ledger row; stock never goes below zero. */
  private async applyMove(tx: Tx, p: UserPrincipal, m: { storeId: string; itemId: string; delta: number; kind: string; qty: number; note: string; issuedTo?: string; refType?: string; refId?: string }) {
    const [store] = await tx.select({ id: invStores.id }).from(invStores).where(eq(invStores.id, m.storeId));
    const [item] = await tx.select({ id: invItems.id, name: invItems.name }).from(invItems).where(eq(invItems.id, m.itemId));
    if (!store || !item) throw new NotFoundException('Store or item not found');
    await tx.insert(invStock).values({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId }).onConflictDoNothing();
    const [row] = await tx.select().from(invStock).where(and(eq(invStock.storeId, m.storeId), eq(invStock.itemId, m.itemId))).for('update');
    if (row.qty + m.delta < 0) throw new ConflictException(`Only ${row.qty} of ${item.name} in this store`);
    await tx.update(invStock).set({ qty: row.qty + m.delta }).where(eq(invStock.id, row.id));
    const [mv] = await tx.insert(invStockMoves).values({ tenantId: p.tenantId, storeId: m.storeId, itemId: m.itemId, delta: m.delta, kind: m.kind, refType: m.refType, refId: m.refId, issuedTo: m.issuedTo, note: m.note, createdBy: p.userId }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `inventory.stock_${m.kind}`, subjectType: 'inv_item', subjectId: m.itemId, data: { storeId: m.storeId, delta: m.delta } });
    return { ...mv, qtyAfter: row.qty + m.delta };
  }

  private async assertItems(tx: Tx, ids: string[]) {
    const uniq = [...new Set(ids)];
    const found = await tx.select({ id: invItems.id }).from(invItems).where(and(inArray(invItems.id, uniq), eq(invItems.active, true)));
    if (found.length !== uniq.length) throw new BadRequestException('An item was not found');
  }
}
