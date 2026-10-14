import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { readSettings } from '../campus-ops/settings.js';
import { Day, nextNumber, orConflict, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { departments, invGoodsReceiptLines, invQuoteLines, invQuotes, invReturns, invRfqs, invTransfers, invGoodsReceipts, invInvoices, invItems, invPoLines, invPurchaseOrders, invRequisitionLines, invRequisitions, invStock, invStockMoves, invStores, invVendors, users } from '../db/schema.js';
import { invApprovals, invDebitNotes, invPoAmendments } from '../db/schema-procurement.js';
import { PURCHASE_MODES } from './procurement.logic.js';
import { ProcurementService } from './procurement.service.js';
import { applyStockMove, ensureCategory } from './stock.js';

export const STORE_ROLES: RoleName[] = ['store_keeper', 'tenant_admin', 'principal'];
/** Who approves requisitions and invoice mismatches. */
export const APPROVER_ROLES: RoleName[] = ['tenant_admin', 'principal'];
/** Anyone on the staff may ask for something. */
export const STAFF_ROLES: RoleName[] = ['store_keeper', 'tenant_admin', 'principal', 'hod', 'teacher', 'librarian', 'accountant', 'transport_manager', 'hostel_warden', 'canteen_manager'];

const Qty = z.number().int().min(1).max(1_000_000);
const StoreBody = z.object({ name: z.string().trim().min(1).max(80), location: z.string().trim().max(120).default(''), kind: z.enum(['central', 'department', 'lab']).default('central'), departmentId: z.uuid().nullish() });
const ItemBody = z.object({ sku: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120), category: z.string().trim().max(60).default('general'), unit: z.string().trim().max(20).default('nos'), reorderLevel: z.number().int().min(0).max(1_000_000).default(0), reorderQty: z.number().int().min(0).max(1_000_000).default(0), description: z.string().trim().max(500).default('') });
const ItemPatch = z.object({ name: z.string().trim().min(1).max(120).optional(), reorderLevel: z.number().int().min(0).max(1_000_000).optional(), active: z.boolean().optional() });
const VendorBody = z.object({ name: z.string().trim().min(1).max(120), gstin: z.string().trim().length(15).optional(), phone: z.string().trim().max(20).default(''), email: z.email().optional(), contactPerson: z.string().trim().max(120).default(''), address: z.string().trim().max(300).default(''), pan: z.string().trim().length(10).optional() });
const MoveBody = z.object({ storeId: z.uuid(), itemId: z.uuid(), qty: Qty, note: z.string().trim().max(200).default('') });
const IssueBody = MoveBody.extend({ issuedTo: z.string().trim().min(1).max(120), departmentId: z.uuid().nullish() });
const ReqBody = z.object({ reason: z.string().trim().max(300).default(''), departmentId: z.uuid().nullish(), neededBy: Day.nullish(), lines: z.array(z.object({ itemId: z.uuid(), qty: Qty, estUnitPaise: Paise.optional() })).min(1).max(50) });
const DecisionBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional(), budgetOverride: z.boolean().optional() });
const PoBody = z.object({
  requisitionId: z.uuid(),
  vendorId: z.uuid(),
  storeId: z.uuid(),
  departmentId: z.uuid().optional(),
  purchaseMode: z.enum(PURCHASE_MODES as [string, ...string[]]).optional(),
  gemRef: z.string().trim().max(80).nullish(),
  tenderRef: z.string().trim().max(80).nullish(),
  deliveryBy: Day.nullish(),
  terms: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({ itemId: z.uuid(), qty: Qty, unitPricePaise: Paise.min(1) })).min(1).max(50),
});
const GrnBody = z.object({
  idempotencyKey: z.string().min(8).max(80),
  note: z.string().trim().max(200).default(''),
  challanNo: z.string().trim().max(60).optional(),
  lines: z
    .array(z.object({ poLineId: z.uuid(), qty: z.number().int().min(0).max(1_000_000), rejectedQty: z.number().int().min(0).max(1_000_000).default(0), rejectReason: z.string().trim().max(200).optional() }))
    .min(1)
    .refine((ls) => ls.every((l) => l.qty + l.rejectedQty > 0), { message: 'Each line needs a quantity accepted or rejected' })
    .refine((ls) => ls.every((l) => l.rejectedQty === 0 || !!l.rejectReason), { message: 'Say why goods were rejected' }),
});
const RfqBody = z.object({ requisitionId: z.uuid(), closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const QuoteBody = z.object({ vendorId: z.uuid(), deliveryDays: z.number().int().min(0).max(365).default(0), note: z.string().trim().max(300).default(''), lines: z.array(z.object({ itemId: z.uuid(), unitPricePaise: Paise.min(1) })).min(1).max(50) });
const AwardBody = z.object({ quoteId: z.uuid(), storeId: z.uuid(), departmentId: z.uuid().optional() });
const TransferBody = z.object({ fromStoreId: z.uuid(), toStoreId: z.uuid(), itemId: z.uuid(), qty: Qty, note: z.string().trim().max(200).default('') });
const ReturnBody = z.object({ kind: z.enum(['vendor', 'issue']), itemId: z.uuid(), qty: Qty, reason: z.string().trim().min(2).max(200), poId: z.uuid().optional(), storeId: z.uuid().optional(), issuedTo: z.string().trim().min(1).max(120).optional() });
const InvoiceBody = z.object({ invoiceNo: z.string().trim().min(1).max(60), amountPaise: Paise.min(1), invoiceDate: Day.optional() });
const PaidBody = z.object({ paidOn: Day.optional(), paymentMode: z.enum(['neft', 'rtgs', 'cheque', 'upi', 'cash', 'dd']).optional(), paymentRef: z.string().trim().max(80).optional() }).default({});
const AmendBody = z.object({ reason: z.string().trim().min(3).max(300), deliveryBy: Day.nullish(), terms: z.string().trim().max(1000).optional(), lines: z.array(z.object({ poLineId: z.uuid().optional(), itemId: z.uuid(), qty: Qty, unitPricePaise: Paise.min(1) })).min(1).max(50) });
const CommitteeBody = z.object({ minutes: z.string().trim().min(3).max(4000), metOn: Day, members: z.string().trim().min(2).max(500) });
const CancelBody = z.object({ reason: z.string().trim().min(3).max(300) });

/**
 * Inventory and procurement: stores, items and stock (every change a ledger row), reorder
 * levels, vendors, and the buying chain indent (with its approval chain and budget check),
 * purchase order (purchase mode, approval, amendment, committee minutes), goods receipt
 * (with rejected goods and debit notes) and three-way invoice match with the payment voucher.
 */
@Controller('v1/inventory')
export class InventoryController {
  constructor(
    private readonly db: DbService,
    private readonly proc: ProcurementService,
  ) {}

  // --- Masters -----------------------------------------------------------------------------

  /** Stores; any staff member can list them to say where an indent is for. */
  @Get('stores')
  @Auth('user', STAFF_ROLES)
  stores(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(invStores).orderBy(asc(invStores.name)));
  }

  @Post('stores')
  @Auth('user', STORE_ROLES)
  addStore(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StoreBody)) b: z.infer<typeof StoreBody>) {
    return orConflict('A store with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [s] = await tx.insert(invStores).values({ tenantId: p.tenantId, ...b, departmentId: b.departmentId ?? null }).returning();
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
        .select({ id: invItems.id, sku: invItems.sku, name: invItems.name, category: invItems.category, unit: invItems.unit, reorderLevel: invItems.reorderLevel, reorderQty: invItems.reorderQty, lastPricePaise: invItems.lastPricePaise, active: invItems.active, onHand: sql<number>`coalesce((select sum(s.qty)::int from inv_stock s where s.item_id = "inv_items"."id"), 0)` })
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
        await ensureCategory(tx, p.tenantId, b.category);
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
      const [was] = await tx.select().from(invItems).where(eq(invItems.id, id));
      if (!was) throw new NotFoundException('Item not found');
      const [i] = await tx.update(invItems).set(b).where(eq(invItems.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.item_updated', subjectType: 'inv_item', subjectId: id, before: was, after: i, fields: Object.keys(b) });
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
        .where(storeId && z.uuid().safeParse(storeId).success ? eq(invStock.storeId, storeId) : undefined)
        .orderBy(asc(invItems.name)),
    );
  }

  @Get('stock/moves')
  @Auth('user', STORE_ROLES)
  moves(@CurrentPrincipal() p: UserPrincipal, @Query('itemId') itemId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(invStockMoves).where(itemId && z.uuid().safeParse(itemId).success ? eq(invStockMoves.itemId, itemId) : undefined).orderBy(desc(invStockMoves.createdAt)).limit(200),
    );
  }

  /** Stock received outside a purchase order (opening balance, donation, return). */
  @Post('stock/in')
  @Auth('user', STORE_ROLES)
  stockIn(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MoveBody)) b: z.infer<typeof MoveBody>) {
    return this.db.withTenant(p.tenantId, (tx) => applyStockMove(tx, p, { ...b, delta: b.qty, kind: 'in' }));
  }

  /** Stock leaving without an owner: damage, expiry, loss. */
  @Post('stock/out')
  @Auth('user', STORE_ROLES)
  stockOut(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MoveBody)) b: z.infer<typeof MoveBody>) {
    if (!b.note) throw new BadRequestException('Say why the stock is written off');
    return this.db.withTenant(p.tenantId, (tx) => applyStockMove(tx, p, { ...b, delta: -b.qty, kind: 'out' }));
  }

  /** Stock handed to a person or department; with a department it counts towards that department's consumption. */
  @Post('stock/issue')
  @Auth('user', STORE_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IssueBody)) b: z.infer<typeof IssueBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.departmentId) {
        const [d] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, b.departmentId));
        if (!d) throw new BadRequestException('Department not found');
      }
      return applyStockMove(tx, p, { ...b, delta: -b.qty, kind: 'issue' });
    });
  }

  // --- Requisitions (indents) ----------------------------------------------------------------

  @Post('requisitions')
  @Auth('user', STAFF_ROLES)
  requisition(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReqBody)) b: z.infer<typeof ReqBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.proc.raiseIndent(tx, p, b));
  }

  /** Store and approvers see all requisitions; a head of department also their department's; everyone else their own. */
  @Get('requisitions')
  @Auth('user', STAFF_ROLES)
  requisitions(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const all = this.proc.seesAll(p);
      const headed = all ? [] : await this.proc.headedDepartments(tx, p.userId);
      const mine = all ? undefined : headed.length ? or(eq(invRequisitions.requestedBy, p.userId), inArray(invRequisitions.departmentId, headed)) : eq(invRequisitions.requestedBy, p.userId);
      const rows = await tx
        .select({ r: invRequisitions, department: departments.name, requester: users.fullName })
        .from(invRequisitions)
        .leftJoin(departments, eq(departments.id, invRequisitions.departmentId))
        .leftJoin(users, eq(users.id, invRequisitions.requestedBy))
        .where(and(mine, status ? eq(invRequisitions.status, status) : undefined))
        .orderBy(desc(invRequisitions.createdAt))
        .limit(200);
      const lines = rows.length
        ? await tx
            .select({ requisitionId: invRequisitionLines.requisitionId, itemId: invItems.id, item: invItems.name, unit: invItems.unit, qty: invRequisitionLines.qty, estUnitPaise: invRequisitionLines.estUnitPaise })
            .from(invRequisitionLines)
            .innerJoin(invItems, eq(invItems.id, invRequisitionLines.itemId))
            .where(inArray(invRequisitionLines.requisitionId, rows.map((r) => r.r.id)))
        : [];
      return rows.map((r) => ({ ...r.r, department: r.department, requester: r.requester, lines: lines.filter((l) => l.requisitionId === r.r.id) }));
    });
  }

  /** One indent: lines, the approval trail, the budget position and whether this person decides the waiting step. */
  @Get('requisitions/:id')
  @Auth('user', STAFF_ROLES)
  requisitionDetail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.proc.indentDetail(tx, p, id));
  }

  /** Approve or reject the waiting step (head of department, then principal with the budget check). Not by the requester. */
  @Post('requisitions/:id/decision')
  @HttpCode(200)
  @Auth('user', [...APPROVER_ROLES, 'hod'])
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.proc.decideIndent(tx, p, id, b));
  }

  // --- Purchase orders, receipts, invoices ---------------------------------------------------

  @Post('purchase-orders')
  @Auth('user', STORE_ROLES)
  createPo(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PoBody)) b: z.infer<typeof PoBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.proc.createPo(tx, p, { ...b, purchaseMode: b.purchaseMode as never }));
  }

  @Get('purchase-orders')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  pos(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: invPurchaseOrders.id, number: invPurchaseOrders.number, status: invPurchaseOrders.status, approvalStatus: invPurchaseOrders.approvalStatus, purchaseMode: invPurchaseOrders.purchaseMode, totalPaise: invPurchaseOrders.totalPaise, vendor: invVendors.name, createdAt: invPurchaseOrders.createdAt })
        .from(invPurchaseOrders)
        .innerJoin(invVendors, eq(invVendors.id, invPurchaseOrders.vendorId))
        .where(status ? eq(invPurchaseOrders.status, status) : undefined)
        .orderBy(desc(invPurchaseOrders.createdAt))
        .limit(200),
    );
  }

  /** The order with its lines, receipts (and their lines), invoices, debit notes, amendments and approval trail. */
  @Get('purchase-orders/:id')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  po(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select({ po: invPurchaseOrders, vendor: invVendors.name, store: invStores.name, department: departments.name, requisition: invRequisitions.number }).from(invPurchaseOrders).innerJoin(invVendors, eq(invVendors.id, invPurchaseOrders.vendorId)).innerJoin(invStores, eq(invStores.id, invPurchaseOrders.storeId)).leftJoin(departments, eq(departments.id, invPurchaseOrders.departmentId)).leftJoin(invRequisitions, eq(invRequisitions.id, invPurchaseOrders.requisitionId)).where(eq(invPurchaseOrders.id, id));
      if (!row) throw new NotFoundException('Purchase order not found');
      const lines = await tx
        .select({ id: invPoLines.id, itemId: invItems.id, item: invItems.name, unit: invItems.unit, qty: invPoLines.qty, unitPricePaise: invPoLines.unitPricePaise, receivedQty: invPoLines.receivedQty })
        .from(invPoLines)
        .innerJoin(invItems, eq(invItems.id, invPoLines.itemId))
        .where(eq(invPoLines.poId, id));
      const invoices = await tx.select().from(invInvoices).where(eq(invInvoices.poId, id));
      const receipts = await tx.select().from(invGoodsReceipts).where(eq(invGoodsReceipts.poId, id)).orderBy(asc(invGoodsReceipts.receivedAt));
      const receiptLines = receipts.length ? await tx.select().from(invGoodsReceiptLines).where(inArray(invGoodsReceiptLines.receiptId, receipts.map((r) => r.id))) : [];
      const debitNotes = await tx.select().from(invDebitNotes).where(eq(invDebitNotes.poId, id)).orderBy(asc(invDebitNotes.createdAt));
      const amendments = await tx.select({ a: invPoAmendments, by: users.fullName }).from(invPoAmendments).leftJoin(users, eq(users.id, invPoAmendments.amendedBy)).where(eq(invPoAmendments.poId, id)).orderBy(asc(invPoAmendments.amendmentNo));
      const approvals = await tx.select({ a: invApprovals, by: users.fullName }).from(invApprovals).leftJoin(users, eq(users.id, invApprovals.decidedBy)).where(eq(invApprovals.poId, id)).orderBy(asc(invApprovals.createdAt));
      return {
        ...row.po,
        vendor: row.vendor,
        store: row.store,
        department: row.department,
        requisition: row.requisition,
        lines,
        invoices,
        receipts: receipts.map((r) => ({ ...r, lines: receiptLines.filter((l) => l.receiptId === r.id) })),
        debitNotes,
        amendments: amendments.map((x) => ({ ...x.a, by: x.by })),
        approvals: approvals.map((x) => ({ ...x.a, by: x.by })),
      };
    });
  }

  /** An approver decides an order waiting for approval (a large order, or an amendment). */
  @Post('purchase-orders/:id/decision')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  decidePo(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.proc.decidePo(tx, p, id, b));
  }

  /** Changes an approved order; it goes back for approval. */
  @Post('purchase-orders/:id/amend')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  amend(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AmendBody)) b: z.infer<typeof AmendBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.proc.amendPo(tx, p, id, b));
  }

  /** The purchase committee's minutes for the order: when it met, who sat and what it decided. */
  @Put('purchase-orders/:id/committee')
  @Auth('user', STORE_ROLES)
  committee(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CommitteeBody)) b: z.infer<typeof CommitteeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [was] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id));
      if (!was) throw new NotFoundException('Purchase order not found');
      const [row] = await tx.update(invPurchaseOrders).set({ committeeMinutes: b.minutes, committeeMetOn: b.metOn, committeeMembers: b.members }).where(eq(invPurchaseOrders.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.po_committee_minutes', subjectType: 'inv_purchase_order', subjectId: id, before: { committeeMetOn: was.committeeMetOn, committeeMembers: was.committeeMembers }, after: { committeeMetOn: b.metOn, committeeMembers: b.members } });
      return row;
    });
  }

  @Post('purchase-orders/:id/cancel')
  @HttpCode(200)
  @Auth('user', STORE_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CancelBody)) b: z.infer<typeof CancelBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.proc.cancelPo(tx, p, id, b.reason);
      return { ok: true };
    });
  }

  /**
   * Goods arrive: what is accepted goes into the PO's store; what is rejected at inspection is not taken in and is
   * debited to the vendor (a debit note). Retried with the same key, it applies once.
   */
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
      if (po.approvalStatus === 'pending') throw new ConflictException('This order is waiting for approval');
      const lines = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id)).for('update');
      const number = await nextNumber(tx, p.tenantId, 'GRN');
      const [grn] = await tx.insert(invGoodsReceipts).values({ tenantId: p.tenantId, poId: id, receivedBy: p.userId, note: b.note, idempotencyKey: b.idempotencyKey, number, challanNo: b.challanNo ?? null }).returning();
      let rejectedPaise = 0;
      const reasons: string[] = [];
      for (const l of b.lines) {
        const line = lines.find((x) => x.id === l.poLineId);
        if (!line) throw new BadRequestException('A line is not on this order');
        if (line.receivedQty + l.qty > line.qty) throw new BadRequestException(`Only ${line.qty - line.receivedQty} more of a line is expected`);
        if (l.qty > 0) await tx.update(invPoLines).set({ receivedQty: sql`${invPoLines.receivedQty} + ${l.qty}` }).where(eq(invPoLines.id, line.id));
        await tx.insert(invGoodsReceiptLines).values({ tenantId: p.tenantId, receiptId: grn.id, poLineId: line.id, qty: l.qty, rejectedQty: l.rejectedQty, rejectReason: l.rejectReason ?? null });
        line.receivedQty += l.qty;
        if (l.qty > 0) await applyStockMove(tx, p, { storeId: po.storeId, itemId: line.itemId, delta: l.qty, kind: 'grn', qty: l.qty, note: po.number, refType: 'goods_receipt', refId: grn.id });
        if (l.rejectedQty > 0) {
          rejectedPaise += l.rejectedQty * line.unitPricePaise;
          reasons.push(l.rejectReason!);
        }
      }
      let debitNote: typeof invDebitNotes.$inferSelect | null = null;
      if (rejectedPaise > 0) {
        [debitNote] = await tx.insert(invDebitNotes).values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'DN'), vendorId: po.vendorId, poId: id, receiptId: grn.id, amountPaise: rejectedPaise, reason: `Rejected at receipt ${number}: ${[...new Set(reasons)].join('; ')}`, createdBy: p.userId }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.debit_note_raised', subjectType: 'inv_purchase_order', subjectId: id, data: { number: debitNote.number, amountPaise: rejectedPaise } });
      }
      const complete = lines.every((l) => l.receivedQty >= l.qty);
      await tx.update(invPurchaseOrders).set({ status: complete ? 'received' : 'partially_received' }).where(eq(invPurchaseOrders.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.goods_received', subjectType: 'inv_goods_receipt', subjectId: grn.id, data: { po: po.number, complete, rejectedPaise } });
      return { ...grn, debitNote, repeated: false };
    });
  }

  /** The vendor's invoice is matched to what was ordered and received; a difference is held for an approver. */
  @Post('purchase-orders/:id/invoices')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  invoice(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(InvoiceBody)) b: z.infer<typeof InvoiceBody>) {
    return orConflict('This invoice number is already recorded for the vendor', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id));
        if (!po) throw new NotFoundException('Purchase order not found');
        const lines = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id));
        const expected = lines.reduce((t, l) => t + l.receivedQty * l.unitPricePaise, 0);
        if (expected === 0) throw new ConflictException('Nothing has been received against this order yet');
        const matched = Math.abs(b.amountPaise - expected) <= Number((await readSettings(tx, p.tenantId, 'procurement')).rules.invoiceTolerancePaise);
        const [inv] = await tx
          .insert(invInvoices)
          .values({ tenantId: p.tenantId, poId: id, vendorId: po.vendorId, invoiceNo: b.invoiceNo, invoiceDate: b.invoiceDate ?? null, amountPaise: b.amountPaise, expectedPaise: expected, status: matched ? 'matched' : 'mismatch', note: matched ? null : `Invoice differs from received goods by ${b.amountPaise - expected} paise`, createdBy: p.userId })
          .returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: matched ? 'inventory.invoice_matched' : 'inventory.invoice_mismatch', subjectType: 'inv_invoice', subjectId: inv.id });
        return inv;
      }),
    );
  }

  @Get('invoices')
  @Auth('user', [...STORE_ROLES, 'accountant'])
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

  /**
   * Pays a matched or approved invoice with a payment voucher (numbered PV); open debit notes on the order are set off
   * against it, so the amount paid is the invoice less those notes.
   */
  @Post('invoices/:id/paid')
  @HttpCode(200)
  @Auth('user', ['accountant', ...APPROVER_ROLES])
  paid(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PaidBody)) b: z.infer<typeof PaidBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(invInvoices).where(eq(invInvoices.id, id)).for('update');
      if (!cur || !['matched', 'approved'].includes(cur.status)) throw new ConflictException('Only a matched or approved invoice can be paid');
      const open = await tx.select().from(invDebitNotes).where(and(eq(invDebitNotes.poId, cur.poId), eq(invDebitNotes.status, 'open')));
      const debit = Math.min(cur.amountPaise, open.reduce((s, d) => s + d.amountPaise, 0));
      if (open.length) await tx.update(invDebitNotes).set({ status: 'adjusted', invoiceId: id }).where(inArray(invDebitNotes.id, open.map((d) => d.id)));
      const voucherNo = await nextNumber(tx, p.tenantId, 'PV');
      const [inv] = await tx
        .update(invInvoices)
        .set({ status: 'paid', voucherNo, paidOn: b.paidOn ?? (await this.proc.today(tx)), paymentMode: b.paymentMode ?? null, paymentRef: b.paymentRef ?? null, debitPaise: debit })
        .where(eq(invInvoices.id, id))
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.invoice_paid', subjectType: 'inv_invoice', subjectId: id, data: { voucherNo, netPaise: inv.amountPaise - debit, debitPaise: debit } });
      return { ...inv, netPaise: inv.amountPaise - debit };
    });
  }

  // --- RFQ and quotation comparison -------------------------------------------------------

  /** Asks vendors to quote for an approved requisition. */
  @Post('rfqs')
  @Auth('user', STORE_ROLES)
  createRfq(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RfqBody)) b: z.infer<typeof RfqBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [req] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, b.requisitionId));
      if (!req) throw new NotFoundException('Requisition not found');
      if (req.status !== 'approved') throw new ConflictException('Only an approved requisition can go to quotation');
      const number = await nextNumber(tx, p.tenantId, 'RFQ');
      const [rfq] = await tx.insert(invRfqs).values({ tenantId: p.tenantId, number, requisitionId: req.id, closesOn: b.closesOn ?? null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.rfq_opened', subjectType: 'inv_rfq', subjectId: rfq.id, data: { number } });
      return rfq;
    });
  }

  @Get('rfqs')
  @Auth('user', STORE_ROLES)
  rfqs(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(invRfqs).orderBy(desc(invRfqs.createdAt)).limit(200));
  }

  /** The requisition's lines and each vendor's quote side by side, with the cheapest total and per-item best price marked. */
  @Get('rfqs/:id')
  @Auth('user', STORE_ROLES)
  rfq(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [rfq] = await tx.select().from(invRfqs).where(eq(invRfqs.id, id));
      if (!rfq) throw new NotFoundException('RFQ not found');
      const lines = await tx.select({ itemId: invItems.id, item: invItems.name, unit: invItems.unit, qty: invRequisitionLines.qty }).from(invRequisitionLines).innerJoin(invItems, eq(invItems.id, invRequisitionLines.itemId)).where(eq(invRequisitionLines.requisitionId, rfq.requisitionId));
      const quotes = await tx.select({ q: invQuotes, vendor: invVendors.name }).from(invQuotes).innerJoin(invVendors, eq(invVendors.id, invQuotes.vendorId)).where(eq(invQuotes.rfqId, id)).orderBy(asc(invQuotes.totalPaise));
      const prices = quotes.length ? await tx.select().from(invQuoteLines).where(inArray(invQuoteLines.quoteId, quotes.map((x) => x.q.id))) : [];
      const best = new Map<string, number>();
      for (const l of prices) best.set(l.itemId, Math.min(best.get(l.itemId) ?? Infinity, l.unitPricePaise));
      return {
        ...rfq,
        lines,
        quotes: quotes.map(({ q, vendor }, i) => ({ ...q, vendor, lowest: i === 0, prices: lines.map((ln) => { const price = prices.find((x) => x.quoteId === q.id && x.itemId === ln.itemId)?.unitPricePaise ?? 0; return { itemId: ln.itemId, unitPricePaise: price, best: price === best.get(ln.itemId) }; }) })),
      };
    });
  }

  /** A vendor's quote must price every requisition line; a vendor quotes once; a blacklisted vendor cannot quote. */
  @Post('rfqs/:id/quotes')
  @Auth('user', STORE_ROLES)
  addQuote(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuoteBody)) b: z.infer<typeof QuoteBody>) {
    return orConflict('This vendor has already quoted', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [rfq] = await tx.select().from(invRfqs).where(eq(invRfqs.id, id)).for('update');
        if (!rfq) throw new NotFoundException('RFQ not found');
        if (rfq.status !== 'open') throw new ConflictException(`This RFQ is ${rfq.status}`);
        const [vendor] = await tx.select({ id: invVendors.id, blacklisted: invVendors.blacklisted }).from(invVendors).where(and(eq(invVendors.id, b.vendorId), eq(invVendors.active, true)));
        if (!vendor) throw new BadRequestException('Vendor not found');
        if (vendor.blacklisted) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'VENDOR_BLACKLISTED', message: 'This vendor is blacklisted' });
        const asked = await tx.select().from(invRequisitionLines).where(eq(invRequisitionLines.requisitionId, rfq.requisitionId));
        const given = new Set(b.lines.map((l) => l.itemId));
        if (given.size !== b.lines.length || asked.length !== given.size || !asked.every((a) => given.has(a.itemId))) throw new BadRequestException('Price every line of the requisition, once');
        const total = b.lines.reduce((t, l) => t + l.unitPricePaise * asked.find((a) => a.itemId === l.itemId)!.qty, 0);
        const [q] = await tx.insert(invQuotes).values({ tenantId: p.tenantId, rfqId: id, vendorId: b.vendorId, deliveryDays: b.deliveryDays, note: b.note, totalPaise: total }).returning();
        await tx.insert(invQuoteLines).values(b.lines.map((l) => ({ tenantId: p.tenantId, quoteId: q.id, ...l })));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.quote_received', subjectType: 'inv_quote', subjectId: q.id, data: { totalPaise: total } });
        return q;
      }),
    );
  }

  /** The approver picks a quote: it becomes the purchase order at the quoted prices for the requisitioned quantities. */
  @Post('rfqs/:id/award')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  award(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AwardBody)) b: z.infer<typeof AwardBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [rfq] = await tx.select().from(invRfqs).where(eq(invRfqs.id, id)).for('update');
      if (!rfq) throw new NotFoundException('RFQ not found');
      if (rfq.status !== 'open') throw new ConflictException(`This RFQ is ${rfq.status}`);
      const [q] = await tx.select().from(invQuotes).where(and(eq(invQuotes.id, b.quoteId), eq(invQuotes.rfqId, id)));
      if (!q) throw new NotFoundException('Quote not found');
      const [req] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, rfq.requisitionId));
      if (req.status !== 'approved') throw new ConflictException('The requisition is no longer open for ordering');
      const pr = (await readSettings(tx, p.tenantId, 'procurement')).rules;
      if (q.totalPaise > Number(pr.quotesRequiredAbovePaise)) {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(invQuotes).where(eq(invQuotes.rfqId, id));
        if (n < Number(pr.minQuotes)) throw new ConflictException(`Orders above ₹${(Number(pr.quotesRequiredAbovePaise) / 100).toFixed(0)} need ${String(pr.minQuotes)} quotations; this request has ${n}`);
      }
      const asked = await tx.select().from(invRequisitionLines).where(eq(invRequisitionLines.requisitionId, req.id));
      const prices = await tx.select().from(invQuoteLines).where(eq(invQuoteLines.quoteId, q.id));
      const po = await this.proc.createPo(tx, p, { requisitionId: req.id, vendorId: q.vendorId, storeId: b.storeId, departmentId: b.departmentId, purchaseMode: 'quotation', lines: asked.map((a) => ({ itemId: a.itemId, qty: a.qty, unitPricePaise: prices.find((x) => x.itemId === a.itemId)!.unitPricePaise })) }, { fromQuote: true });
      await tx.update(invRfqs).set({ status: 'awarded', awardedQuoteId: q.id }).where(eq(invRfqs.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.rfq_awarded', subjectType: 'inv_rfq', subjectId: id, data: { quoteId: q.id, po: po.number } });
      return po;
    });
  }

  // --- Stock transfers and returns ------------------------------------------------------------

  /** Moves stock between two stores: one ledger row out, one in, both under one transfer number. */
  @Post('stock/transfers')
  @Auth('user', STORE_ROLES)
  transfer(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TransferBody)) b: z.infer<typeof TransferBody>) {
    if (b.fromStoreId === b.toStoreId) throw new BadRequestException('Choose two different stores');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const number = await nextNumber(tx, p.tenantId, 'TRF');
      const [t] = await tx.insert(invTransfers).values({ tenantId: p.tenantId, number, createdBy: p.userId, ...b }).returning();
      const ref = { refType: 'inv_transfer', refId: t.id, qty: b.qty, note: number };
      await applyStockMove(tx, p, { storeId: b.fromStoreId, itemId: b.itemId, delta: -b.qty, kind: 'transfer_out', ...ref });
      await applyStockMove(tx, p, { storeId: b.toStoreId, itemId: b.itemId, delta: b.qty, kind: 'transfer_in', ...ref });
      return t;
    });
  }

  @Get('stock/transfers')
  @Auth('user', STORE_ROLES)
  transfers(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(invTransfers).orderBy(desc(invTransfers.createdAt)).limit(200));
  }

  /**
   * Vendor return: goods received on a PO go back (stock out, credit at the PO price, raised as a debit note). Issue
   * return: what was issued to someone comes back (stock in).
   */
  @Post('returns')
  @Auth('user', STORE_ROLES)
  giveBack(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReturnBody)) b: z.infer<typeof ReturnBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let storeId = b.storeId;
      let vendorId: string | null = null;
      let credit = 0;
      if (b.kind === 'vendor') {
        if (!b.poId) throw new BadRequestException('Say which purchase order the goods came on');
        const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, b.poId));
        const [line] = po ? await tx.select().from(invPoLines).where(and(eq(invPoLines.poId, po.id), eq(invPoLines.itemId, b.itemId))) : [];
        if (!po || !line) throw new NotFoundException('That item is not on this purchase order');
        const [done] = await tx.select({ n: sql<number>`coalesce(sum(${invReturns.qty}), 0)::int` }).from(invReturns).where(and(eq(invReturns.poId, po.id), eq(invReturns.itemId, b.itemId)));
        if (b.qty > line.receivedQty - done.n) throw new ConflictException(`Only ${line.receivedQty - done.n} can still be returned on this order`);
        storeId = po.storeId;
        vendorId = po.vendorId;
        credit = b.qty * line.unitPricePaise;
      } else {
        if (!b.issuedTo || !b.storeId) throw new BadRequestException('Say who returned it and to which store');
        const [out] = await tx.select({ n: sql<number>`coalesce(-sum(${invStockMoves.delta}), 0)::int` }).from(invStockMoves).where(and(eq(invStockMoves.kind, 'issue'), eq(invStockMoves.storeId, b.storeId), eq(invStockMoves.itemId, b.itemId), eq(invStockMoves.issuedTo, b.issuedTo)));
        const [back] = await tx.select({ n: sql<number>`coalesce(sum(${invReturns.qty}), 0)::int` }).from(invReturns).where(and(eq(invReturns.kind, 'issue'), eq(invReturns.storeId, b.storeId), eq(invReturns.itemId, b.itemId), eq(invReturns.issuedTo, b.issuedTo)));
        if (b.qty > out.n - back.n) throw new ConflictException(`Only ${out.n - back.n} are out with ${b.issuedTo}`);
      }
      const number = await nextNumber(tx, p.tenantId, 'RTN');
      const [r] = await tx.insert(invReturns).values({ tenantId: p.tenantId, number, kind: b.kind, storeId: storeId!, itemId: b.itemId, qty: b.qty, vendorId, poId: b.poId ?? null, issuedTo: b.issuedTo ?? null, reason: b.reason, creditPaise: credit, createdBy: p.userId }).returning();
      await applyStockMove(tx, p, { storeId: storeId!, itemId: b.itemId, delta: b.kind === 'vendor' ? -b.qty : b.qty, kind: `return_${b.kind}`, qty: b.qty, note: b.reason, issuedTo: b.issuedTo, refType: 'inv_return', refId: r.id });
      if (b.kind === 'vendor' && credit > 0) await tx.insert(invDebitNotes).values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'DN'), vendorId: vendorId!, poId: b.poId!, returnId: r.id, amountPaise: credit, reason: `Returned (${number}): ${b.reason}`, createdBy: p.userId });
      return r;
    });
  }

  @Get('returns')
  @Auth('user', STORE_ROLES)
  returns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(invReturns).orderBy(desc(invReturns.createdAt)).limit(200));
  }
}
