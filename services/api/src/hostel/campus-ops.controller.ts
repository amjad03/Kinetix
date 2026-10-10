import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { assertCanSeeStudent } from '../common/student-access.js';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { hostelComplaints, hostelRooms, invItems, invPurchaseOrders, invStock, invStockMoves, invVendors, students } from '../db/schema.js';
import { canteenFeedback, canteenStockLog, hostelWorkOrders } from '../db/schema-depth.js';
import { CANTEEN_ROLES } from './canteen.controller.js';
import { HOSTEL_ROLES } from './hostel.controller.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Meal = z.enum(['breakfast', 'lunch', 'snacks', 'dinner']);
const WorkOrderBody = z.object({
  complaintId: z.uuid().nullish(),
  roomId: z.uuid().nullish(),
  title: z.string().trim().min(3).max(200),
  category: z.string().trim().max(60).default('general'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assigneeName: z.string().trim().max(120).default(''),
  assigneeUserId: z.uuid().nullish(),
  dueOn: Day.nullish(),
  note: z.string().trim().max(1000).default(''),
});
const StockBody = z
  .object({
    kind: z.enum(['purchase', 'use', 'waste']),
    loggedOn: Day,
    meal: Meal.nullish(),
    itemName: z.string().trim().min(2).max(120),
    invItemId: z.uuid().nullish(),
    vendorId: z.uuid().nullish(),
    purchaseOrderId: z.uuid().nullish(),
    quantity: z.number().gt(0).max(100000),
    unit: z.string().trim().min(1).max(12).default('kg'),
    costPaise: z.number().int().min(0).default(0),
    reason: z.string().trim().max(300).default(''),
    issueFromStore: z.boolean().default(false),
  })
  .refine((b) => b.kind !== 'purchase' || b.costPaise > 0, { message: 'A purchase needs its cost', path: ['costPaise'] })
  .refine((b) => b.kind !== 'waste' || b.reason.length >= 3, { message: 'Say why the food was wasted', path: ['reason'] })
  .refine((b) => !b.issueFromStore || (!!b.invItemId && b.kind !== 'purchase'), { message: 'Drawing from the store needs a store item and a use or waste entry', path: ['issueFromStore'] });
const NO_CHILD = '00000000-0000-0000-0000-000000000000';
const FeedbackBody = z.object({ studentId: z.uuid().optional(), mealDate: Day, meal: Meal, rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).default('') });

const NEXT: Record<string, string[]> = { open: ['assigned', 'in_progress'], reopened: ['assigned', 'in_progress'], assigned: ['in_progress', 'assigned'], in_progress: ['done'], done: ['verified', 'reopened'] };

/** Hostel maintenance work orders: assigned, done, then checked by the warden (PRD section 37). */
@Controller('v1/hostel/work-orders')
export class HostelWorkOrdersController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get()
  @Auth('user', HOSTEL_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ w: hostelWorkOrders, room: hostelRooms.number, complaint: hostelComplaints.description })
        .from(hostelWorkOrders)
        .leftJoin(hostelRooms, eq(hostelRooms.id, hostelWorkOrders.roomId))
        .leftJoin(hostelComplaints, eq(hostelComplaints.id, hostelWorkOrders.complaintId))
        .where(status ? eq(hostelWorkOrders.status, status) : undefined)
        .orderBy(desc(hostelWorkOrders.createdAt))
        .limit(300);
      const today = this.clock.now().toISOString().slice(0, 10);
      return rows.map((r) => ({ ...r.w, room: r.room, complaint: r.complaint, overdue: !!r.w.dueOn && r.w.dueOn < today && !['done', 'verified'].includes(r.w.status) }));
    });
  }

  /** Work orders raised from the signed-in resident's own complaints, so the student sees where the repair stands. */
  @Get('mine')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .select({ id: hostelWorkOrders.id, title: hostelWorkOrders.title, status: hostelWorkOrders.status, dueOn: hostelWorkOrders.dueOn, completedAt: hostelWorkOrders.completedAt, complaint: hostelComplaints.description })
        .from(hostelWorkOrders)
        .innerJoin(hostelComplaints, eq(hostelComplaints.id, hostelWorkOrders.complaintId))
        .where(eq(hostelComplaints.raisedBy, p.userId))
        .orderBy(desc(hostelWorkOrders.createdAt)),
    );
  }

  @Post()
  @Auth('user', HOSTEL_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(WorkOrderBody)) b: z.infer<typeof WorkOrderBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let roomId = b.roomId ?? null;
      if (b.complaintId) {
        const [c] = await tx.select().from(hostelComplaints).where(eq(hostelComplaints.id, b.complaintId));
        if (!c) throw new BadRequestException('Complaint not found');
        const [dup] = await tx.select({ id: hostelWorkOrders.id }).from(hostelWorkOrders).where(and(eq(hostelWorkOrders.complaintId, b.complaintId), sql`${hostelWorkOrders.status} <> 'verified'`));
        if (dup) throw new ConflictException('A work order is already open for this complaint');
        roomId = roomId ?? c.roomId;
        await tx.update(hostelComplaints).set({ status: 'in_progress' }).where(eq(hostelComplaints.id, b.complaintId));
      }
      const assigned = !!b.assigneeName || !!b.assigneeUserId;
      const [row] = await tx.insert(hostelWorkOrders).values({ tenantId: p.tenantId, complaintId: b.complaintId ?? null, roomId, title: b.title, category: b.category, priority: b.priority, assigneeName: b.assigneeName, assigneeUserId: b.assigneeUserId ?? null, status: assigned ? 'assigned' : 'open', dueOn: b.dueOn ?? null, note: b.note, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'hostel.work_order_created', 'hostel_work_order', row.id);
      return row;
    });
  }

  private async move(p: UserPrincipal, id: string, to: string, patch: Record<string, unknown>, action: string, after?: (tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], w: typeof hostelWorkOrders.$inferSelect) => Promise<void>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [w] = await tx.select().from(hostelWorkOrders).where(eq(hostelWorkOrders.id, id)).for('update');
      if (!w) throw new NotFoundException('Work order not found');
      if (!(NEXT[w.status] ?? []).includes(to)) throw new ConflictException(`A ${w.status.replace('_', ' ')} work order cannot move to ${to.replace('_', ' ')}`);
      const [row] = await tx.update(hostelWorkOrders).set({ status: to, ...patch }).where(eq(hostelWorkOrders.id, id)).returning();
      if (after) await after(tx, row);
      await auditUser(tx, p, action, 'hostel_work_order', id);
      return row;
    });
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ assigneeName: z.string().trim().min(2).max(120), assigneeUserId: z.uuid().nullish(), dueOn: Day.nullish() }))) b: { assigneeName: string; assigneeUserId?: string | null; dueOn?: string | null }) {
    return this.move(p, id, 'assigned', { assigneeName: b.assigneeName, assigneeUserId: b.assigneeUserId ?? null, ...(b.dueOn ? { dueOn: b.dueOn } : {}) }, 'hostel.work_order_assigned');
  }

  @Post(':id/start')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  start(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.move(p, id, 'in_progress', {}, 'hostel.work_order_started');
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  complete(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ costPaise: z.number().int().min(0).default(0), note: z.string().trim().max(1000).default('') }))) b: { costPaise: number; note: string }) {
    return this.move(p, id, 'done', { costPaise: b.costPaise, completedAt: this.clock.now(), ...(b.note ? { note: b.note } : {}) }, 'hostel.work_order_completed');
  }

  /** The warden checks the repair. Accepted: the order and the complaint close. Not accepted: the order reopens. */
  @Post(':id/verify')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ ok: z.boolean(), note: z.string().trim().max(500).default('') }))) b: { ok: boolean; note: string }) {
    return this.move(
      p,
      id,
      b.ok ? 'verified' : 'reopened',
      b.ok ? { verifiedBy: p.userId, verifiedAt: this.clock.now() } : { completedAt: null, note: b.note || 'Reopened after inspection' },
      b.ok ? 'hostel.work_order_verified' : 'hostel.work_order_reopened',
      async (tx, w) => {
        if (!w.complaintId) return;
        if (b.ok) await tx.update(hostelComplaints).set({ status: 'resolved', resolvedAt: this.clock.now(), resolution: `Repair completed${w.note ? ': ' + w.note : ''}` }).where(eq(hostelComplaints.id, w.complaintId));
        else await tx.update(hostelComplaints).set({ status: 'in_progress', resolvedAt: null }).where(eq(hostelComplaints.id, w.complaintId));
      },
    );
  }
}

/** Kitchen stock tied to vendors, purchase orders and the store, wastage, and meal feedback (PRD section 39). */
@Controller('v1/canteen/ops')
export class CanteenOpsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  /** Vendors, purchase orders and store items the stock form can link to. */
  @Get('options')
  @Auth('user', CANTEEN_ROLES)
  options(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      vendors: await tx.select({ id: invVendors.id, name: invVendors.name }).from(invVendors).orderBy(invVendors.name),
      items: await tx.select({ id: invItems.id, name: invItems.name, unit: invItems.unit }).from(invItems).where(eq(invItems.active, true)).orderBy(invItems.name),
    }));
  }

  @Get('stock')
  @Auth('user', CANTEEN_ROLES)
  stock(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ l: canteenStockLog, vendor: invVendors.name, item: invItems.name })
        .from(canteenStockLog)
        .leftJoin(invVendors, eq(invVendors.id, canteenStockLog.vendorId))
        .leftJoin(invItems, eq(invItems.id, canteenStockLog.invItemId))
        .where(and(from && Day.safeParse(from).success ? gte(canteenStockLog.loggedOn, from) : undefined, to && Day.safeParse(to).success ? lte(canteenStockLog.loggedOn, to) : undefined))
        .orderBy(desc(canteenStockLog.loggedOn), desc(canteenStockLog.createdAt))
        .limit(500);
      return rows.map((r) => ({ ...r.l, vendor: r.vendor, storeItem: r.item }));
    });
  }

  /** A purchase from a vendor, a use at a meal, or wastage. A use or waste entry can also draw the quantity from the store. */
  @Post('stock')
  @Auth('user', CANTEEN_ROLES)
  log(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StockBody)) b: z.infer<typeof StockBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.vendorId) {
        const [v] = await tx.select({ id: invVendors.id }).from(invVendors).where(eq(invVendors.id, b.vendorId));
        if (!v) throw new BadRequestException('Vendor not found');
      }
      if (b.purchaseOrderId) {
        const [po] = await tx.select({ id: invPurchaseOrders.id }).from(invPurchaseOrders).where(eq(invPurchaseOrders.id, b.purchaseOrderId));
        if (!po) throw new BadRequestException('Purchase order not found');
      }
      if (b.invItemId) {
        const [it] = await tx.select({ id: invItems.id }).from(invItems).where(eq(invItems.id, b.invItemId));
        if (!it) throw new BadRequestException('Store item not found');
      }
      const [row] = await tx.insert(canteenStockLog).values({ tenantId: p.tenantId, kind: b.kind, loggedOn: b.loggedOn, meal: b.meal ?? null, itemName: b.itemName, invItemId: b.invItemId ?? null, vendorId: b.vendorId ?? null, purchaseOrderId: b.purchaseOrderId ?? null, quantity: b.quantity, unit: b.unit, costPaise: b.costPaise, reason: b.reason, recordedBy: p.userId }).returning();
      if (b.issueFromStore && b.invItemId) {
        if (!Number.isInteger(b.quantity)) throw new BadRequestException('The store counts whole units; enter a whole quantity to draw from it');
        const [stock] = await tx.select().from(invStock).where(and(eq(invStock.itemId, b.invItemId), sql`${invStock.qty} >= ${b.quantity}`)).orderBy(desc(invStock.qty)).limit(1).for('update');
        if (!stock) throw new ConflictException('The store does not hold that much');
        await tx.update(invStock).set({ qty: stock.qty - b.quantity }).where(eq(invStock.id, stock.id));
        await tx.insert(invStockMoves).values({ tenantId: p.tenantId, storeId: stock.storeId, itemId: b.invItemId, delta: -b.quantity, kind: 'issue', refType: 'canteen_stock_log', refId: row.id, issuedTo: 'Canteen', note: `${b.kind} ${b.meal ?? ''}`.trim(), createdBy: p.userId });
      }
      await auditUser(tx, p, `canteen.stock_${b.kind}`, 'canteen_stock_log', row.id, { quantity: b.quantity });
      return row;
    });
  }

  /** Per item: bought, used and wasted over a period, with the balance and the wastage share; per meal wastage; spend by vendor. */
  @Get('summary')
  @Auth('user', CANTEEN_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    const f = from && Day.safeParse(from).success ? from : undefined;
    const t = to && Day.safeParse(to).success ? to : undefined;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(canteenStockLog).where(and(f ? gte(canteenStockLog.loggedOn, f) : undefined, t ? lte(canteenStockLog.loggedOn, t) : undefined));
      const items = new Map<string, { item: string; unit: string; purchased: number; used: number; wasted: number; spendPaise: number }>();
      for (const r of rows) {
        const key = `${r.itemName.toLowerCase()}|${r.unit}`;
        const cur = items.get(key) ?? { item: r.itemName, unit: r.unit, purchased: 0, used: 0, wasted: 0, spendPaise: 0 };
        if (r.kind === 'purchase') (cur.purchased += r.quantity, (cur.spendPaise += r.costPaise));
        else if (r.kind === 'use') cur.used += r.quantity;
        else cur.wasted += r.quantity;
        items.set(key, cur);
      }
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const perItem = [...items.values()].map((i) => ({ ...i, purchased: r2(i.purchased), used: r2(i.used), wasted: r2(i.wasted), balance: r2(i.purchased - i.used - i.wasted), wastePercent: i.used + i.wasted > 0 ? r2((100 * i.wasted) / (i.used + i.wasted)) : 0 })).sort((a, b) => b.wastePercent - a.wastePercent);
      const meals = (['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((m) => {
        const used = rows.filter((r) => r.kind === 'use' && r.meal === m).reduce((a, r) => a + r.quantity, 0);
        const wasted = rows.filter((r) => r.kind === 'waste' && r.meal === m).reduce((a, r) => a + r.quantity, 0);
        return { meal: m, used: r2(used), wasted: r2(wasted), wastePercent: used + wasted > 0 ? r2((100 * wasted) / (used + wasted)) : 0 };
      });
      const vendorIds = [...new Set(rows.filter((r) => r.vendorId).map((r) => r.vendorId as string))];
      const names = vendorIds.length ? await tx.select({ id: invVendors.id, name: invVendors.name }).from(invVendors).where(inArray(invVendors.id, vendorIds)) : [];
      const vendors = vendorIds.map((id) => ({ vendorId: id, name: names.find((n) => n.id === id)?.name ?? '', spendPaise: rows.filter((r) => r.vendorId === id && r.kind === 'purchase').reduce((a, r) => a + r.costPaise, 0) })).sort((a, b) => b.spendPaise - a.spendPaise);
      return { items: perItem, meals, vendors, totals: { spendPaise: perItem.reduce((a, i) => a + i.spendPaise, 0), entries: rows.length } };
    });
  }

  // ---- feedback ------------------------------------------------------------------------------------------------------

  /** A student, guardian or staff member rates a meal; rating the same meal again replaces the earlier one. */
  @Post('feedback')
  @Auth('user')
  feedback(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeedbackBody)) b: z.infer<typeof FeedbackBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.mealDate > this.clock.now().toISOString().slice(0, 10)) throw new BadRequestException('You can rate a meal only after it has been served');
      // A parent may rate on behalf of a linked child; that child is stored, and each child has one rating per meal.
      if (b.studentId) await assertCanSeeStudent(tx, p, b.studentId, []);
      const [st] = b.studentId ? [{ id: b.studentId }] : await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
      const [row] = await tx
        .insert(canteenFeedback)
        .values({ tenantId: p.tenantId, userId: p.userId, studentId: st?.id ?? null, childKey: st?.id ?? NO_CHILD, mealDate: b.mealDate, meal: b.meal, rating: b.rating, comment: b.comment })
        .onConflictDoUpdate({ target: [canteenFeedback.userId, canteenFeedback.mealDate, canteenFeedback.meal, canteenFeedback.childKey], set: { rating: b.rating, comment: b.comment } })
        .returning();
      return row;
    });
  }

  /** Average rating and comments by meal (the canteen manager; names are not shown). */
  @Get('feedback')
  @Auth('user', CANTEEN_ROLES)
  feedbackReport(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(canteenFeedback).where(and(from && Day.safeParse(from).success ? gte(canteenFeedback.mealDate, from) : undefined, to && Day.safeParse(to).success ? lte(canteenFeedback.mealDate, to) : undefined)).orderBy(desc(canteenFeedback.mealDate));
      const meals = (['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((m) => {
        const mine = rows.filter((r) => r.meal === m);
        return { meal: m, count: mine.length, average: mine.length ? Math.round((mine.reduce((a, r) => a + r.rating, 0) / mine.length) * 100) / 100 : null };
      });
      return { meals, comments: rows.filter((r) => r.comment).slice(0, 100).map((r) => ({ mealDate: r.mealDate, meal: r.meal, rating: r.rating, comment: r.comment })), total: rows.length };
    });
  }
}

