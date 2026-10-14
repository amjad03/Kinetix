import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { readSettings } from '../campus-ops/settings.js';
import type { Tx } from '../db/db.service.js';
import { budgets, costExpenses, departments, invItems, invPoLines, invPurchaseOrders, invRequisitionLines, invRequisitions, invStores, invVendors, users } from '../db/schema.js';
import { invApprovals, invApprovedVendors, invCategories, invPoAmendments, invRateContracts } from '../db/schema-procurement.js';
import { budgetCheck, fiscalRange, fiscalYearOf, indentSteps, purchaseModeProblem, type PurchaseMode } from './procurement.logic.js';
import { assertActiveItems } from './stock.js';

export const APPROVERS: readonly string[] = ['tenant_admin', 'principal'];
const isApprover = (p: UserPrincipal) => p.roles.some((r) => APPROVERS.includes(r));

export interface IndentInput {
  reason: string;
  departmentId?: string | null;
  neededBy?: string | null;
  lines: { itemId: string; qty: number; estUnitPaise?: number }[];
}

export interface PoInput {
  requisitionId: string;
  vendorId: string;
  storeId: string;
  departmentId?: string | null;
  purchaseMode?: PurchaseMode;
  gemRef?: string | null;
  tenderRef?: string | null;
  deliveryBy?: string | null;
  terms?: string;
  lines: { itemId: string; qty: number; unitPricePaise: number }[];
}

/**
 * The buying chain shared by the inventory endpoints and the record kit: indents with a department, an estimate and a
 * budget check through an approval chain (head of department, then the principal), purchase orders with the purchase
 * mode rules, approved vendors and rate contracts, order approval, amendments and cancellation.
 */
@Injectable()
export class ProcurementService {
  constructor(private readonly clock: Clock) {}

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  /** Each line's estimated unit price: the one given, else an active rate contract's lowest rate, else the last price paid. */
  async estimates(tx: Tx, lines: IndentInput['lines'], today: string): Promise<number[]> {
    const ids = [...new Set(lines.map((l) => l.itemId))];
    const items = await tx.select({ id: invItems.id, last: invItems.lastPricePaise }).from(invItems).where(inArray(invItems.id, ids));
    const rcs = await tx
      .select({ itemId: invRateContracts.itemId, rate: sql<number>`min(${invRateContracts.ratePaise})::bigint`.mapWith(Number) })
      .from(invRateContracts)
      .where(and(inArray(invRateContracts.itemId, ids), eq(invRateContracts.active, true), lte(invRateContracts.validFrom, today), gte(invRateContracts.validTo, today)))
      .groupBy(invRateContracts.itemId);
    return lines.map((l) => (l.estUnitPaise && l.estUnitPaise > 0 ? l.estUnitPaise : (rcs.find((r) => r.itemId === l.itemId)?.rate ?? items.find((i) => i.id === l.itemId)?.last ?? 0)));
  }

  /** A department's budget for the financial year, what is spent (orders and expenses) and what approved indents still commit. */
  async budgetOf(tx: Tx, departmentId: string, fy: string, exceptRequisition?: string) {
    const { from, to } = fiscalRange(fy);
    const [b] = await tx.select({ amount: budgets.amountPaise }).from(budgets).where(and(eq(budgets.departmentId, departmentId), eq(budgets.fiscalYear, fy)));
    const [po] = await tx
      .select({ n: sql<number>`coalesce(sum(${invPurchaseOrders.totalPaise}), 0)::bigint`.mapWith(Number) })
      .from(invPurchaseOrders)
      .where(and(eq(invPurchaseOrders.departmentId, departmentId), ne(invPurchaseOrders.status, 'cancelled'), gte(invPurchaseOrders.createdAt, new Date(`${from}T00:00:00+05:30`)), lte(invPurchaseOrders.createdAt, new Date(`${to}T23:59:59+05:30`))));
    const [ex] = await tx.select({ n: sql<number>`coalesce(sum(${costExpenses.amountPaise}), 0)::bigint`.mapWith(Number) }).from(costExpenses).where(and(eq(costExpenses.departmentId, departmentId), gte(costExpenses.spentOn, from), lte(costExpenses.spentOn, to)));
    const [committed] = await tx
      .select({ n: sql<number>`coalesce(sum(${invRequisitions.estimatedPaise}), 0)::bigint`.mapWith(Number) })
      .from(invRequisitions)
      .where(and(eq(invRequisitions.departmentId, departmentId), eq(invRequisitions.status, 'approved'), exceptRequisition ? ne(invRequisitions.id, exceptRequisition) : undefined, gte(invRequisitions.createdAt, new Date(`${from}T00:00:00+05:30`)), lte(invRequisitions.createdAt, new Date(`${to}T23:59:59+05:30`))));
    return { fiscalYear: fy, budgetPaise: b?.amount ?? 0, spentPaise: po.n + ex.n, committedPaise: committed.n };
  }

  /** Raises an indent: its estimate, its budget position and the first approval step. */
  async raiseIndent(tx: Tx, p: UserPrincipal, b: IndentInput) {
    await assertActiveItems(tx, b.lines.map((l) => l.itemId));
    if (new Set(b.lines.map((l) => l.itemId)).size !== b.lines.length) throw new BadRequestException('Each item can be on an indent once');
    let head: string | null = null;
    if (b.departmentId) {
      const [d] = await tx.select({ head: departments.headUserId }).from(departments).where(eq(departments.id, b.departmentId));
      if (!d) throw new BadRequestException('Department not found');
      head = d.head;
    }
    const today = await this.today(tx);
    const est = await this.estimates(tx, b.lines, today);
    const estimatedPaise = b.lines.reduce((s, l, i) => s + l.qty * est[i], 0);
    let budgetStatus: string | null = null;
    if (b.departmentId) {
      const bud = await this.budgetOf(tx, b.departmentId, fiscalYearOf(today));
      budgetStatus = budgetCheck(bud.budgetPaise, bud.spentPaise, bud.committedPaise, estimatedPaise).status;
    }
    const number = await nextNumber(tx, p.tenantId, 'REQ');
    const step = indentSteps(head, p.userId)[0];
    const [r] = await tx.insert(invRequisitions).values({ tenantId: p.tenantId, number, requestedBy: p.userId, reason: b.reason, departmentId: b.departmentId ?? null, neededBy: b.neededBy ?? null, estimatedPaise, budgetStatus, step }).returning();
    await tx.insert(invRequisitionLines).values(b.lines.map((l, i) => ({ tenantId: p.tenantId, requisitionId: r.id, itemId: l.itemId, qty: l.qty, estUnitPaise: est[i] })));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.requisition_raised', subjectType: 'inv_requisition', subjectId: r.id, data: { number, estimatedPaise } });
    return r;
  }

  /**
   * One approval step. The department head (or a principal for them) decides the hod step; the principal or
   * administrator the final step, where the estimate is checked against the department budget. Going over the budget
   * needs `budgetOverride` with a note. The requester never decides their own indent.
   */
  async decideIndent(tx: Tx, p: UserPrincipal, id: string, d: { approve: boolean; note?: string; budgetOverride?: boolean }) {
    const [r] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, id)).for('update');
    if (!r) throw new NotFoundException('Requisition not found');
    if (r.requestedBy === p.userId) throw new ForbiddenException('You cannot approve your own requisition');
    if (r.status !== 'submitted') throw new ConflictException(`This requisition is already ${r.status}`);
    const step = r.step ?? 'principal';
    if (step === 'hod') {
      const [dept] = r.departmentId ? await tx.select({ head: departments.headUserId }).from(departments).where(eq(departments.id, r.departmentId)) : [];
      if (dept?.head !== p.userId && !isApprover(p)) throw new ForbiddenException('The head of the department decides this step');
    } else if (!isApprover(p)) throw new ForbiddenException('The principal decides this step');
    if (!d.approve && !d.note?.trim()) throw new BadRequestException('Give a reason for rejecting');
    let budgetStatus = r.budgetStatus;
    let override = false;
    if (d.approve && step === 'principal' && r.departmentId && (await readSettings(tx, p.tenantId, 'procurement')).rules.indentBudgetCheck !== false) {
      const bud = await this.budgetOf(tx, r.departmentId, fiscalYearOf(await this.today(tx)), r.id);
      const check = budgetCheck(bud.budgetPaise, bud.spentPaise, bud.committedPaise, r.estimatedPaise);
      budgetStatus = check.status;
      if (check.status === 'exceeded') {
        if (!d.budgetOverride) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'BUDGET_EXCEEDED', message: `This indent (₹${(r.estimatedPaise / 100).toFixed(0)}) is more than the department has left this year (₹${(check.availablePaise / 100).toFixed(0)}). Approve over the budget with a note, or reject it.`, availablePaise: check.availablePaise });
        if (!d.note?.trim()) throw new BadRequestException('Say why the indent goes over the budget');
        budgetStatus = 'override';
        override = true;
      }
    }
    const next = d.approve && step === 'hod' ? 'principal' : null;
    const status = !d.approve ? 'rejected' : next ? 'submitted' : 'approved';
    const [done] = await tx
      .update(invRequisitions)
      .set({ status, step: next, budgetStatus, ...(status !== 'submitted' && { decidedBy: p.userId, decidedAt: new Date(), decisionNote: d.note ?? null }) })
      .where(eq(invRequisitions.id, id))
      .returning();
    await tx.insert(invApprovals).values({ tenantId: p.tenantId, requisitionId: id, step, decision: d.approve ? 'approved' : 'rejected', note: d.note ?? null, budgetOverride: override, decidedBy: p.userId });
    await audit(tx, {
      tenantId: p.tenantId,
      actorType: 'user',
      actorId: p.userId,
      action: !d.approve ? 'inventory.requisition_rejected' : next ? 'inventory.requisition_forwarded' : 'inventory.requisition_approved',
      subjectType: 'inv_requisition',
      subjectId: id,
      before: { status: r.status, step: r.step },
      after: { status, step: next },
      data: { step, ...(override && { budgetOverride: true }) },
    });
    return done;
  }

  /** A vendor that may take an order: active, not blacklisted, and on the approved list of every category with one. */
  async assertVendorFor(tx: Tx, vendorId: string, itemIds: string[]) {
    const [v] = await tx.select().from(invVendors).where(eq(invVendors.id, vendorId));
    if (!v || !v.active) throw new BadRequestException('Vendor not found');
    if (v.blacklisted) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'VENDOR_BLACKLISTED', message: `${v.name} is blacklisted${v.blacklistReason ? `: ${v.blacklistReason}` : ''}` });
    const cats = await tx
      .selectDistinct({ id: invCategories.id, name: invCategories.name })
      .from(invItems)
      .innerJoin(invCategories, sql`lower(${invCategories.name}) = lower(${invItems.category})`)
      .where(inArray(invItems.id, itemIds));
    for (const c of cats) {
      const list = await tx.select({ vendorId: invApprovedVendors.vendorId }).from(invApprovedVendors).where(eq(invApprovedVendors.categoryId, c.id));
      if (list.length && !list.some((x) => x.vendorId === vendorId)) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'VENDOR_NOT_APPROVED', message: `${v.name} is not on the approved vendor list for ${c.name}` });
    }
    return v;
  }

  /** Under a rate contract each line must be at most the contract rate of the vendor for the item, valid today. */
  async assertRateContract(tx: Tx, vendorId: string, lines: { itemId: string; unitPricePaise: number }[], today: string) {
    for (const l of lines) {
      const [rc] = await tx
        .select({ rate: invRateContracts.ratePaise })
        .from(invRateContracts)
        .where(and(eq(invRateContracts.vendorId, vendorId), eq(invRateContracts.itemId, l.itemId), eq(invRateContracts.active, true), lte(invRateContracts.validFrom, today), gte(invRateContracts.validTo, today)))
        .orderBy(invRateContracts.ratePaise)
        .limit(1);
      if (!rc) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'NO_RATE_CONTRACT', message: 'An item has no rate contract with this vendor in force today' });
      if (l.unitPricePaise > rc.rate) throw new BadRequestException(`A line is above the contract rate of ₹${(rc.rate / 100).toFixed(2)}`);
    }
  }

  /** Whether an order of this value waits for an approver (0 = every order). */
  async needsApproval(tx: Tx, tenantId: string, totalPaise: number) {
    const limit = Number((await readSettings(tx, tenantId, 'procurement')).rules.approvalAbovePaise ?? 0);
    return totalPaise > limit;
  }

  /** Issues a purchase order for an approved indent (directly, or from an awarded quotation with `mode: 'quotation'`). */
  async createPo(tx: Tx, p: UserPrincipal, b: PoInput, opts: { fromQuote?: boolean } = {}) {
    const [req] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, b.requisitionId)).for('update');
    if (!req) throw new NotFoundException('Requisition not found');
    if (req.status !== 'approved') throw new ConflictException('Only an approved requisition can be ordered');
    const asked = await tx.select().from(invRequisitionLines).where(eq(invRequisitionLines.requisitionId, req.id));
    for (const l of b.lines) {
      const a = asked.find((x) => x.itemId === l.itemId);
      if (!a) throw new BadRequestException('A line is not on the requisition');
      if (l.qty > a.qty) throw new BadRequestException('A line asks for more than the requisition approved');
    }
    await this.assertVendorFor(tx, b.vendorId, b.lines.map((l) => l.itemId));
    const [store] = await tx.select({ id: invStores.id }).from(invStores).where(eq(invStores.id, b.storeId));
    if (!store) throw new BadRequestException('Vendor or store not found');
    const total = b.lines.reduce((t, l) => t + l.qty * l.unitPricePaise, 0);
    const mode: PurchaseMode = b.purchaseMode ?? (opts.fromQuote ? 'quotation' : 'direct');
    const rules = (await readSettings(tx, p.tenantId, 'procurement')).rules;
    const problem = purchaseModeProblem(mode, total, { directPurchaseUptoPaise: Number(rules.quotesRequiredAbovePaise), tenderAbovePaise: Number(rules.tenderAbovePaise ?? 0) }, { gemRef: b.gemRef, tenderRef: b.tenderRef });
    if (problem) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'PURCHASE_MODE', message: problem });
    const today = await this.today(tx);
    if (mode === 'rate_contract') await this.assertRateContract(tx, b.vendorId, b.lines, today);
    const pending = await this.needsApproval(tx, p.tenantId, total);
    const number = await nextNumber(tx, p.tenantId, 'PO');
    const [po] = await tx
      .insert(invPurchaseOrders)
      .values({
        tenantId: p.tenantId,
        number,
        requisitionId: req.id,
        vendorId: b.vendorId,
        storeId: b.storeId,
        departmentId: b.departmentId ?? req.departmentId ?? null,
        totalPaise: total,
        createdBy: p.userId,
        purchaseMode: mode,
        gemRef: b.gemRef ?? null,
        tenderRef: b.tenderRef ?? null,
        deliveryBy: b.deliveryBy ?? null,
        terms: b.terms ?? '',
        status: pending ? 'pending_approval' : 'issued',
        approvalStatus: pending ? 'pending' : 'not_required',
      })
      .returning();
    await tx.insert(invPoLines).values(b.lines.map((l) => ({ tenantId: p.tenantId, poId: po.id, ...l })));
    for (const l of b.lines) await tx.update(invItems).set({ lastPricePaise: l.unitPricePaise }).where(eq(invItems.id, l.itemId));
    await tx.update(invRequisitions).set({ status: 'ordered' }).where(eq(invRequisitions.id, req.id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.po_issued', subjectType: 'inv_purchase_order', subjectId: po.id, data: { number, totalPaise: total, purchaseMode: mode, pendingApproval: pending } });
    return po;
  }

  /** The status an order goes back to once approved: by what has been received so far. */
  private async receiptStatus(tx: Tx, poId: string) {
    const lines = await tx.select().from(invPoLines).where(eq(invPoLines.poId, poId));
    const got = lines.reduce((s, l) => s + l.receivedQty, 0);
    return lines.length && lines.every((l) => l.receivedQty >= l.qty) ? 'received' : got > 0 ? 'partially_received' : 'issued';
  }

  /**
   * An approver decides an order waiting for approval (not the person who raised or amended it). Approving issues it;
   * rejecting a new order cancels it and frees the indent, and rejecting an amendment restores the order as it was.
   */
  async decidePo(tx: Tx, p: UserPrincipal, id: string, d: { approve: boolean; note?: string }) {
    if (!isApprover(p)) throw new ForbiddenException("Your account doesn't have access to this.");
    const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id)).for('update');
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.approvalStatus !== 'pending') throw new ConflictException('This order is not waiting for approval');
    const [lastAmend] = await tx.select().from(invPoAmendments).where(eq(invPoAmendments.poId, id)).orderBy(desc(invPoAmendments.amendmentNo)).limit(1);
    const maker = lastAmend && lastAmend.amendmentNo === po.amendmentNo ? lastAmend.amendedBy : po.createdBy;
    if (maker === p.userId) throw new ForbiddenException('You cannot approve an order you raised or amended');
    if (!d.approve && !d.note?.trim()) throw new BadRequestException('Give a reason for rejecting');
    let set: Partial<typeof invPurchaseOrders.$inferInsert>;
    if (d.approve) set = { approvalStatus: 'approved', approvedBy: p.userId, approvedAt: new Date(), status: await this.receiptStatus(tx, id) };
    else if (po.amendmentNo > 0 && lastAmend) {
      // Back to the order as approved before the amendment.
      const before = lastAmend.before as { totalPaise: number; deliveryBy: string | null; terms: string; lines: { id: string | null; itemId: string; qty: number; unitPricePaise: number }[] };
      const now = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id));
      for (const l of now) {
        const was = before.lines.find((x) => x.id === l.id);
        if (was) await tx.update(invPoLines).set({ qty: was.qty, unitPricePaise: was.unitPricePaise }).where(eq(invPoLines.id, l.id));
        else if (l.receivedQty === 0) await tx.delete(invPoLines).where(eq(invPoLines.id, l.id));
      }
      set = { approvalStatus: 'approved', totalPaise: before.totalPaise, deliveryBy: before.deliveryBy, terms: before.terms, amendmentNo: po.amendmentNo - 1, status: await this.receiptStatus(tx, id) };
      await tx.delete(invPoAmendments).where(eq(invPoAmendments.id, lastAmend.id));
    } else {
      set = { approvalStatus: 'rejected', status: 'cancelled', cancelReason: d.note ?? null };
      if (po.requisitionId) await tx.update(invRequisitions).set({ status: 'approved' }).where(eq(invRequisitions.id, po.requisitionId));
    }
    const [done] = await tx.update(invPurchaseOrders).set(set).where(eq(invPurchaseOrders.id, id)).returning();
    await tx.insert(invApprovals).values({ tenantId: p.tenantId, poId: id, step: po.amendmentNo > 0 ? `amendment_${po.amendmentNo}` : 'order', decision: d.approve ? 'approved' : 'rejected', note: d.note ?? null, decidedBy: p.userId });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: d.approve ? 'inventory.po_approved' : 'inventory.po_rejected', subjectType: 'inv_purchase_order', subjectId: id, before: { status: po.status, approvalStatus: po.approvalStatus }, after: { status: done.status, approvalStatus: done.approvalStatus }, data: { note: d.note } });
    return done;
  }

  /**
   * Amends an approved order (quantities, prices, new lines, delivery date, terms): the change is kept with the order
   * as it was, and the order goes back for approval before anything more is received.
   */
  async amendPo(tx: Tx, p: UserPrincipal, id: string, b: { reason: string; deliveryBy?: string | null; terms?: string; lines: { poLineId?: string; itemId: string; qty: number; unitPricePaise: number }[] }) {
    const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id)).for('update');
    if (!po) throw new NotFoundException('Purchase order not found');
    if (['cancelled', 'received'].includes(po.status)) throw new ConflictException(`A ${po.status} order cannot be amended`);
    if (po.approvalStatus === 'pending') throw new ConflictException('This order is waiting for approval; decide it before amending');
    const lines = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id));
    await assertActiveItems(tx, b.lines.map((l) => l.itemId));
    for (const l of lines) if (l.receivedQty > 0 && !b.lines.some((x) => x.poLineId === l.id)) throw new BadRequestException('A line with goods received cannot be removed');
    await this.assertVendorFor(tx, po.vendorId, b.lines.map((l) => l.itemId));
    const before = { totalPaise: po.totalPaise, deliveryBy: po.deliveryBy, terms: po.terms, lines: lines.map((l) => ({ id: l.id, itemId: l.itemId, qty: l.qty, unitPricePaise: l.unitPricePaise })) };
    for (const nl of b.lines) {
      if (nl.poLineId) {
        const l = lines.find((x) => x.id === nl.poLineId);
        if (!l) throw new BadRequestException('A line is not on this order');
        if (l.itemId !== nl.itemId) throw new BadRequestException('A line cannot change its item');
        if (nl.qty < l.receivedQty) throw new BadRequestException(`A line cannot go below the ${l.receivedQty} already received`);
        await tx.update(invPoLines).set({ qty: nl.qty, unitPricePaise: nl.unitPricePaise }).where(eq(invPoLines.id, l.id));
      } else await tx.insert(invPoLines).values({ tenantId: p.tenantId, poId: id, itemId: nl.itemId, qty: nl.qty, unitPricePaise: nl.unitPricePaise });
    }
    const keep = b.lines.map((l) => l.poLineId).filter((x): x is string => !!x);
    const drop = lines.filter((l) => !keep.includes(l.id)).map((l) => l.id);
    if (drop.length) await tx.delete(invPoLines).where(and(eq(invPoLines.poId, id), inArray(invPoLines.id, drop)));
    const after = await tx.select().from(invPoLines).where(eq(invPoLines.poId, id));
    const total = after.reduce((s, l) => s + l.qty * l.unitPricePaise, 0);
    const amendmentNo = po.amendmentNo + 1;
    await tx.update(invPurchaseOrders).set({ totalPaise: total, deliveryBy: b.deliveryBy === undefined ? po.deliveryBy : b.deliveryBy, terms: b.terms ?? po.terms, amendmentNo, approvalStatus: 'pending', status: 'pending_approval' }).where(eq(invPurchaseOrders.id, id));
    await tx.insert(invPoAmendments).values({ tenantId: p.tenantId, poId: id, amendmentNo, reason: b.reason, before, after: { totalPaise: total, deliveryBy: b.deliveryBy ?? po.deliveryBy, terms: b.terms ?? po.terms, lines: after.map((l) => ({ id: l.id, itemId: l.itemId, qty: l.qty, unitPricePaise: l.unitPricePaise })) }, amendedBy: p.userId });
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.po_amended', subjectType: 'inv_purchase_order', subjectId: id, before: { totalPaise: po.totalPaise }, after: { totalPaise: total }, data: { amendmentNo, reason: b.reason } });
    const [row] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id));
    return row;
  }

  /** Cancels an order nothing has been received on; its indent can be ordered again. */
  async cancelPo(tx: Tx, p: UserPrincipal, id: string, reason: string) {
    const [po] = await tx.select().from(invPurchaseOrders).where(eq(invPurchaseOrders.id, id)).for('update');
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === 'cancelled') throw new ConflictException('This order is already cancelled');
    const [got] = await tx.select({ n: sql<number>`coalesce(sum(${invPoLines.receivedQty}), 0)::int` }).from(invPoLines).where(eq(invPoLines.poId, id));
    if (got.n > 0) throw new ConflictException('Goods have been received on this order; amend it instead');
    await tx.update(invPurchaseOrders).set({ status: 'cancelled', cancelReason: reason }).where(eq(invPurchaseOrders.id, id));
    if (po.requisitionId) await tx.update(invRequisitions).set({ status: 'approved' }).where(and(eq(invRequisitions.id, po.requisitionId), eq(invRequisitions.status, 'ordered')));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.po_cancelled', subjectType: 'inv_purchase_order', subjectId: id, before: { status: po.status }, after: { status: 'cancelled' }, data: { reason } });
  }

  /** The indent with its lines, the approval trail and its department's budget position. */
  async indentDetail(tx: Tx, p: UserPrincipal, id: string) {
    const [r] = await tx
      .select({ r: invRequisitions, department: departments.name, head: departments.headUserId, requester: users.fullName })
      .from(invRequisitions)
      .leftJoin(departments, eq(departments.id, invRequisitions.departmentId))
      .leftJoin(users, eq(users.id, invRequisitions.requestedBy))
      .where(eq(invRequisitions.id, id));
    if (!r) throw new NotFoundException('Requisition not found');
    const store = p.roles.some((x) => ['store_keeper', ...APPROVERS].includes(x));
    if (!store && r.r.requestedBy !== p.userId && r.head !== p.userId) throw new NotFoundException('Requisition not found');
    const lines = await tx.select({ id: invRequisitionLines.id, itemId: invItems.id, sku: invItems.sku, item: invItems.name, unit: invItems.unit, qty: invRequisitionLines.qty, estUnitPaise: invRequisitionLines.estUnitPaise }).from(invRequisitionLines).innerJoin(invItems, eq(invItems.id, invRequisitionLines.itemId)).where(eq(invRequisitionLines.requisitionId, id));
    const approvals = await tx.select({ a: invApprovals, by: users.fullName }).from(invApprovals).leftJoin(users, eq(users.id, invApprovals.decidedBy)).where(eq(invApprovals.requisitionId, id)).orderBy(invApprovals.createdAt);
    const budget = r.r.departmentId ? await this.budgetOf(tx, r.r.departmentId, fiscalYearOf(await this.today(tx)), r.r.status === 'approved' ? r.r.id : undefined) : null;
    const orders = await tx.select({ id: invPurchaseOrders.id, number: invPurchaseOrders.number, status: invPurchaseOrders.status, totalPaise: invPurchaseOrders.totalPaise }).from(invPurchaseOrders).where(eq(invPurchaseOrders.requisitionId, id));
    const steps = indentSteps(r.head, r.r.requestedBy);
    const canDecide = r.r.status === 'submitted' && r.r.requestedBy !== p.userId && (r.r.step === 'hod' ? r.head === p.userId || isApprover(p) : isApprover(p));
    return { ...r.r, department: r.department, requester: r.requester, steps, lines, approvals: approvals.map((x) => ({ ...x.a, by: x.by })), budget: budget && { ...budget, availablePaise: budget.budgetPaise - budget.spentPaise - budget.committedPaise }, orders, canDecide };
  }

  /** Indents an HOD heads: their department's waiting for their step. */
  async headedDepartments(tx: Tx, userId: string): Promise<string[]> {
    return (await tx.select({ id: departments.id }).from(departments).where(eq(departments.headUserId, userId))).map((d) => d.id);
  }

  /** The store and approvers see every indent; others their own and their department's. */
  seesAll(p: UserPrincipal) {
    return p.roles.some((x) => ['store_keeper', ...APPROVERS].includes(x));
  }
}
