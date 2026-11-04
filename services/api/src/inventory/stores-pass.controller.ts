import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, nextNumber, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { readSettings } from '../campus-ops/settings.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, invItems, invRequisitionLines, invRequisitions, invStockMoves, invStores, userRoles, users } from '../db/schema.js';
import { invIssueSlips, invStockLayers, invWriteOffs } from '../db/schema-procurement.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { APPROVER_ROLES, STORE_ROLES } from './inventory.controller.js';
import { ProcurementService } from './procurement.service.js';
import { booksOn, monthMovements, postMonthStores } from './purchase-books.js';
import { applyStockMove } from './stock.js';

const Qty = z.number().int().min(1).max(1_000_000);
const SlipBody = z.object({
  storeId: z.uuid(),
  departmentId: z.uuid().nullish(),
  issuedTo: z.string().trim().min(1).max(120),
  receivedBy: z.string().trim().max(120).default(''),
  requisitionId: z.uuid().nullish(),
  purpose: z.string().trim().max(300).default(''),
  lines: z.array(z.object({ itemId: z.uuid(), qty: Qty, batchNo: z.string().trim().max(40).nullish() })).min(1).max(50),
});
const WriteOffBody = z.object({
  storeId: z.uuid(),
  itemId: z.uuid(),
  qty: Qty,
  batchNo: z.string().trim().max(40).nullish(),
  kind: z.enum(['expired', 'damaged', 'obsolete', 'lost', 'shortage']),
  reason: z.string().trim().min(3).max(300),
  disposalMode: z.enum(['scrap', 'auction', 'destroy', 'return_to_vendor', 'none']).default('scrap'),
  realisedPaise: Paise.default(0),
});
const DecisionBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
const MonthBody = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10') });

/**
 * The stores pass: numbered issue slips to departments (against an approved indent when the settings ask for it),
 * stock write-offs that wait for an approver (expired lab chemicals and mess provisions, damage, loss), the batches
 * in a store with their expiry, and the month's stores journal into the books.
 */
@Controller('v1/inventory')
export class StoresPassController {
  constructor(
    private readonly db: DbService,
    private readonly proc: ProcurementService,
    private readonly notifier: NotificationsService,
  ) {}

  // --- Issue slips --------------------------------------------------------------------------------------------------

  /** Issues several items in one slip: each line leaves the store at its cost (earliest-expiring batch first). */
  @Post('issue-slips')
  @Auth('user', STORE_ROLES)
  issueSlip(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SlipBody)) b: z.infer<typeof SlipBody>) {
    if (new Set(b.lines.map((l) => `${l.itemId}:${l.batchNo ?? ''}`)).size !== b.lines.length) throw new BadRequestException('Each item (and batch) once on a slip');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [store] = await tx.select().from(invStores).where(eq(invStores.id, b.storeId));
      if (!store || !store.active) throw new NotFoundException('Store not found');
      if (b.departmentId && !(await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, b.departmentId)))[0]) throw new BadRequestException('Department not found');
      const rules = (await readSettings(tx, p.tenantId, 'inventory')).rules;
      if (rules.issueNeedsRequisition === true && !b.requisitionId) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'ISSUE_NEEDS_INDENT', message: 'Stock is issued against an approved indent: choose the indent' });
      if (b.requisitionId) {
        const [r] = await tx.select().from(invRequisitions).where(eq(invRequisitions.id, b.requisitionId));
        if (!r || !['approved', 'ordered'].includes(r.status)) throw new ConflictException('Issue against an approved indent');
        const asked = await tx.select().from(invRequisitionLines).where(eq(invRequisitionLines.requisitionId, r.id));
        const issued = await tx.select({ itemId: invStockMoves.itemId, n: sql<number>`(-sum(${invStockMoves.delta}))::int` }).from(invStockMoves).innerJoin(invIssueSlips, eq(invIssueSlips.id, invStockMoves.refId)).where(and(eq(invStockMoves.refType, 'inv_issue_slip'), eq(invIssueSlips.requisitionId, r.id))).groupBy(invStockMoves.itemId);
        for (const l of b.lines) {
          const a = asked.find((x) => x.itemId === l.itemId);
          if (!a) throw new BadRequestException('An item is not on the indent');
          const done = issued.find((x) => x.itemId === l.itemId)?.n ?? 0;
          if (done + l.qty > a.qty) throw new ConflictException(`Only ${a.qty - done} more of an item can be issued on this indent`);
        }
      }
      const today = await this.proc.today(tx);
      const number = await nextNumber(tx, p.tenantId, 'ISS');
      const [slip] = await tx.insert(invIssueSlips).values({ tenantId: p.tenantId, number, storeId: b.storeId, departmentId: b.departmentId ?? store.departmentId ?? null, issuedTo: b.issuedTo, receivedBy: b.receivedBy, requisitionId: b.requisitionId ?? null, purpose: b.purpose, lines: b.lines.length, createdBy: p.userId }).returning();
      let value = 0;
      const out: { itemId: string; qty: number; valuePaise: number; batches: string }[] = [];
      for (const l of b.lines) {
        const mv = await applyStockMove(tx, p, { storeId: b.storeId, itemId: l.itemId, delta: -l.qty, qty: l.qty, kind: 'issue', note: `${number}${b.purpose ? `: ${b.purpose}` : ''}`, issuedTo: b.issuedTo, departmentId: slip.departmentId, refType: 'inv_issue_slip', refId: slip.id, fromBatch: l.batchNo, today });
        value += mv.valuePaise;
        out.push({ itemId: l.itemId, qty: l.qty, valuePaise: mv.valuePaise, batches: mv.draws.map((d) => `${d.batchNo || '—'} × ${d.qty}`).join(', ') });
      }
      const [done] = await tx.update(invIssueSlips).set({ valuePaise: value }).where(eq(invIssueSlips.id, slip.id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.issue_slip', subjectType: 'inv_issue_slip', subjectId: slip.id, data: { number, valuePaise: value, lines: b.lines.length } });
      return { ...done, lines: out };
    });
  }

  @Get('issue-slips')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  slips(@CurrentPrincipal() p: UserPrincipal, @Query('departmentId') departmentId?: string, @Query('page') pageQ?: string) {
    const page = Math.max(1, Number(pageQ) || 1);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const where = departmentId && z.uuid().safeParse(departmentId).success ? eq(invIssueSlips.departmentId, departmentId) : undefined;
      const rows = await tx
        .select({ s: invIssueSlips, store: invStores.name, department: departments.name, requisition: invRequisitions.number })
        .from(invIssueSlips)
        .innerJoin(invStores, eq(invStores.id, invIssueSlips.storeId))
        .leftJoin(departments, eq(departments.id, invIssueSlips.departmentId))
        .leftJoin(invRequisitions, eq(invRequisitions.id, invIssueSlips.requisitionId))
        .where(where)
        .orderBy(desc(invIssueSlips.createdAt))
        .limit(50)
        .offset((page - 1) * 50);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(invIssueSlips).where(where);
      return { rows: rows.map((r) => ({ ...r.s, store: r.store, department: r.department, requisition: r.requisition })), total: n, page, pageSize: 50 };
    });
  }

  /** One slip with its lines (item, quantity, batches and value), for printing. */
  @Get('issue-slips/:id')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  slip(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ s: invIssueSlips, store: invStores.name, department: departments.name, by: users.fullName }).from(invIssueSlips).innerJoin(invStores, eq(invStores.id, invIssueSlips.storeId)).leftJoin(departments, eq(departments.id, invIssueSlips.departmentId)).leftJoin(users, eq(users.id, invIssueSlips.createdBy)).where(eq(invIssueSlips.id, id));
      if (!s) throw new NotFoundException('Issue slip not found');
      const lines = await tx.select({ itemId: invItems.id, sku: invItems.sku, item: invItems.name, unit: invItems.unit, qty: sql<number>`(-${invStockMoves.delta})::int`, batchNo: invStockMoves.batchNo, expiryOn: invStockMoves.expiryOn, valuePaise: sql<number>`(-${invStockMoves.valuePaise})::bigint`.mapWith(Number) }).from(invStockMoves).innerJoin(invItems, eq(invItems.id, invStockMoves.itemId)).where(and(eq(invStockMoves.refType, 'inv_issue_slip'), eq(invStockMoves.refId, id))).orderBy(asc(invItems.name));
      return { ...s.s, store: s.store, department: s.department, issuedBy: s.by, lines };
    });
  }

  // --- Batches and expiry ---------------------------------------------------------------------------------------------

  /** Batches held (what is left of each receipt) with expiry; `expiring=N` keeps those expiring within N days or expired. */
  @Get('batches')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  batches(@CurrentPrincipal() p: UserPrincipal, @Query('storeId') storeId?: string, @Query('itemId') itemId?: string, @Query('expiring') expiring?: string) {
    const days = expiring === undefined ? null : Math.min(3650, Math.max(0, Number(expiring) || 0));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      // Filtered to `expiring` days when asked; marked expiring within the settings' alert window either way.
      const until = days === null ? null : plus(days);
      const soon = plus(days ?? Number((await readSettings(tx, p.tenantId, 'inventory')).rules.expiryAlertDays ?? 30));
      const rows = await tx
        .select({ id: invStockLayers.id, storeId: invStockLayers.storeId, store: invStores.name, itemId: invItems.id, sku: invItems.sku, item: invItems.name, unit: invItems.unit, itemType: invItems.itemType, batchNo: invStockLayers.batchNo, mfgOn: invStockLayers.mfgOn, expiryOn: invStockLayers.expiryOn, receivedOn: invStockLayers.receivedOn, qtyLeft: invStockLayers.qtyLeft, unitCostPaise: invStockLayers.unitCostPaise })
        .from(invStockLayers)
        .innerJoin(invItems, eq(invItems.id, invStockLayers.itemId))
        .innerJoin(invStores, eq(invStores.id, invStockLayers.storeId))
        .where(and(gt(invStockLayers.qtyLeft, 0), storeId && z.uuid().safeParse(storeId).success ? eq(invStockLayers.storeId, storeId) : undefined, itemId && z.uuid().safeParse(itemId).success ? eq(invStockLayers.itemId, itemId) : undefined, until ? and(isNotNull(invStockLayers.expiryOn), lte(invStockLayers.expiryOn, until)) : undefined))
        .orderBy(asc(sql`coalesce(${invStockLayers.expiryOn}, '9999-12-31')`), asc(invItems.name))
        .limit(1000);
      return rows.map((r) => ({ ...r, valuePaise: r.qtyLeft * r.unitCostPaise, state: !r.expiryOn ? 'no_expiry' : r.expiryOn < today ? 'expired' : r.expiryOn <= soon ? 'expiring' : 'good' }));
    });
  }

  // --- Write-offs ------------------------------------------------------------------------------------------------------

  /** The store proposes writing stock off; nothing leaves until an approver agrees (unless approval is switched off). */
  @Post('write-offs')
  @Auth('user', STORE_ROLES)
  proposeWriteOff(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(WriteOffBody)) b: z.infer<typeof WriteOffBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [item] = await tx.select().from(invItems).where(eq(invItems.id, b.itemId));
      const [store] = await tx.select({ id: invStores.id }).from(invStores).where(eq(invStores.id, b.storeId));
      if (!item || !store) throw new NotFoundException('Store or item not found');
      if (item.batchTracked && b.kind === 'expired' && !b.batchNo) throw new BadRequestException('Say which batch has expired');
      const today = await this.proc.today(tx);
      const open = await tx.select({ qty: invStockLayers.qtyLeft, expiryOn: invStockLayers.expiryOn }).from(invStockLayers).where(and(eq(invStockLayers.storeId, b.storeId), eq(invStockLayers.itemId, b.itemId), gt(invStockLayers.qtyLeft, 0), b.batchNo ? eq(invStockLayers.batchNo, b.batchNo) : undefined));
      const held = open.reduce((s, l) => s + l.qty, 0);
      if (b.qty > held) throw new ConflictException(`Only ${held} of ${item.name}${b.batchNo ? ` (batch ${b.batchNo})` : ''} are in this store`);
      if (b.kind === 'expired' && !open.some((l) => l.expiryOn && l.expiryOn < today)) throw new ConflictException('Nothing of this has expired yet');
      const number = await nextNumber(tx, p.tenantId, 'WO');
      const [w] = await tx.insert(invWriteOffs).values({ tenantId: p.tenantId, number, storeId: b.storeId, itemId: b.itemId, batchNo: b.batchNo ?? null, qty: b.qty, reason: b.reason, kind: b.kind, disposalMode: b.disposalMode, realisedPaise: b.realisedPaise, proposedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.write_off_proposed', subjectType: 'inv_write_off', subjectId: w.id, data: { number, qty: b.qty, kind: b.kind } });
      if ((await readSettings(tx, p.tenantId, 'inventory')).rules.writeOffNeedsApproval === false) return this.apply(tx, p, w.id, { approve: true, note: 'No approval needed (settings)' }, true);
      const approvers = (await this.proc.usersWithRoles(tx, [...APPROVER_ROLES])).filter((u) => u !== p.userId);
      await this.notifier.notifyUsers(tx, approvers, { kind: 'task', text: { title: `Write-off ${number} waits for approval`, body: `${b.qty} ${item.unit} of ${item.name}: ${b.reason}` }, data: { writeOffId: w.id, number }, dedupeKey: `inv-wo:${w.id}` });
      return w;
    });
  }

  @Get('write-offs')
  @Auth('user', [...STORE_ROLES, 'accountant'])
  writeOffs(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    const st = z.enum(['proposed', 'approved', 'rejected']).safeParse(status);
    return this.db.withTenant(p.tenantId, async (tx) =>
      (await tx
        .select({ w: invWriteOffs, item: invItems.name, sku: invItems.sku, unit: invItems.unit, store: invStores.name, proposer: users.fullName })
        .from(invWriteOffs)
        .innerJoin(invItems, eq(invItems.id, invWriteOffs.itemId))
        .innerJoin(invStores, eq(invStores.id, invWriteOffs.storeId))
        .leftJoin(users, eq(users.id, invWriteOffs.proposedBy))
        .where(st.success ? eq(invWriteOffs.status, st.data) : undefined)
        .orderBy(desc(invWriteOffs.createdAt))
        .limit(500)).map((r) => ({ ...r.w, item: r.item, sku: r.sku, unit: r.unit, store: r.store, proposer: r.proposer })),
    );
  }

  /** An approver (not the proposer) approves, and the stock leaves at its cost, or rejects with a reason. */
  @Post('write-offs/:id/decision')
  @HttpCode(200)
  @Auth('user', APPROVER_ROLES)
  decideWriteOff(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.apply(tx, p, id, b, false));
  }

  private async apply(tx: Tx, p: UserPrincipal, id: string, b: { approve: boolean; note?: string }, auto: boolean) {
    const [w] = await tx.select().from(invWriteOffs).where(eq(invWriteOffs.id, id)).for('update');
    if (!w) throw new NotFoundException('Write-off not found');
    if (w.status !== 'proposed') throw new ConflictException(`This write-off is already ${w.status}`);
    if (!auto && w.proposedBy === p.userId) throw new ForbiddenException('You cannot approve a write-off you proposed');
    if (!b.approve && !b.note?.trim()) throw new BadRequestException('Give a reason for rejecting');
    let value = 0;
    if (b.approve) {
      const mv = await applyStockMove(tx, p, { storeId: w.storeId, itemId: w.itemId, delta: -w.qty, qty: w.qty, kind: 'write_off', note: `${w.number}: ${w.reason}`, refType: 'inv_write_off', refId: w.id, fromBatch: w.batchNo, includeExpired: true, today: await this.proc.today(tx) });
      value = mv.valuePaise;
    }
    const status = b.approve ? 'approved' : 'rejected';
    const [done] = await tx.update(invWriteOffs).set({ status, valuePaise: value, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.note ?? null }).where(eq(invWriteOffs.id, id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `inventory.write_off_${status}`, subjectType: 'inv_write_off', subjectId: id, before: { status: 'proposed' }, after: { status }, data: { valuePaise: value } });
    if (w.proposedBy && !auto) await this.notifier.notifyUsers(tx, [w.proposedBy], { kind: 'task', text: { title: `Write-off ${w.number} ${status}`, body: b.note?.trim() || '' }, data: { writeOffId: id, number: w.number }, dedupeKey: `inv-wo-decided:${id}` });
    return done;
  }

  // --- Books ----------------------------------------------------------------------------------------------------------

  /** What a month's stores journal would post (consumption and losses), and whether it is posted. */
  @Get('books/month')
  @Auth('user', ['accountant', ...APPROVER_ROLES])
  monthPreview(@CurrentPrincipal() p: UserPrincipal, @Query('month') month?: string) {
    const m = MonthBody.safeParse({ month });
    if (!m.success) throw new BadRequestException('Use a month like 2026-10');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const mv = await monthMovements(tx, m.data.month);
      const { rows } = await tx.execute<{ number: string }>(sql`select number from acct_vouchers where source_type = 'inv_stores_month' and source_id = ${m.data.month} and voided_at is null limit 1`);
      return { month: m.data.month, ...mv, voucher: rows[0]?.number ?? null };
    });
  }

  /** Posts a month that has ended: stores consumed and stock losses against Stores and Inventory. Once per month. */
  @Post('books/month')
  @HttpCode(200)
  @Auth('user', ['accountant', ...APPROVER_ROLES])
  postMonth(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MonthBody)) b: z.infer<typeof MonthBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.proc.today(tx);
      if (b.month >= today.slice(0, 7)) throw new ConflictException('Post a month once it has ended');
      if (!(await booksOn(tx, p.tenantId))) throw new ConflictException('Postings to the books are switched off in the purchase settings');
      const [y, mo] = b.month.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      const v = await postMonthStores(tx, p, b.month, lastDay);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'inventory.month_posted', subjectType: 'inv_books', data: { month: b.month, voucher: v?.number ?? null } });
      return { month: b.month, voucher: v?.number ?? null, voucherId: v?.id ?? null };
    });
  }
}

/**
 * Tells the store when an item falls to its reorder level (the event written by a stock move), once per item until it
 * is restocked above the level and falls again.
 */
@Injectable()
export class StockAlerts implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.bus.subscribe('inventory-reorder-alerts', [DomainEvents.StockReorderLevel], async (e, tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${e.tenantId}, true)`);
      const pl = e.payload as { itemId: string; sku: string; name: string; unit: string; onHand: number; reorderLevel: number; reorderQty: number };
      const keepers = (await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(and(eq(userRoles.tenantId, e.tenantId), inArray(userRoles.role, ['store_keeper'])))).map((r) => r.id);
      await this.notifications.notifyUsers(tx, keepers, { kind: 'task', text: { title: `${pl.name} is at its reorder level`, body: `${pl.onHand} ${pl.unit} left (reorder at ${pl.reorderLevel}${pl.reorderQty ? `, order ${pl.reorderQty}` : ''}). Raise an indent from Reorder.` }, data: { itemId: pl.itemId, sku: pl.sku }, dedupeKey: `inv-reorder:${pl.itemId}:${e.id}` });
    });
  }
}
