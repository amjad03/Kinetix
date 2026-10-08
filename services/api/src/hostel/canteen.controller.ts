import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { orConflict } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { canteenItems, canteenMealAttendance, canteenTopups, canteenWallets, canteenWalletTxns, students, tenants, users } from '../db/schema.js';
import { PAYMENTS_NOT_CONFIGURED, PaymentGateway } from '../fees/payment-gateway.service.js';
import { WalletTopupService } from '../fees/wallet-topup.service.js';
import { Clock, localParts } from '../common/time.js';

export const CANTEEN_ROLES: RoleName[] = ['canteen_manager', 'tenant_admin', 'principal'];

const ItemBody = z.object({ name: z.string().trim().min(1).max(80), pricePaise: z.number().int().min(100).max(1_000_000) });
const ItemPatch = z.object({ pricePaise: z.number().int().min(100).max(1_000_000).optional(), available: z.boolean().optional() });
const TopUpBody = z.object({ studentId: z.uuid(), amountPaise: z.number().int().min(100).max(10_000_000), idempotencyKey: z.string().min(8).max(80) });
const OnlineTopUpBody = z.object({ amountPaise: z.number().int().min(100).max(10_000_000) });
const ConfirmBody = z.object({ providerPaymentId: z.string().min(1).max(100), signature: z.string().min(1).max(200) });
const Meal = z.enum(['breakfast', 'lunch', 'snacks', 'dinner']);
const MealBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), meal: Meal, studentIds: z.array(z.uuid()).min(1).max(500) });
const OrderBody = z.object({ studentId: z.uuid(), idempotencyKey: z.string().min(8).max(80), items: z.array(z.object({ itemId: z.uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(30) });

/** Canteen: a menu with prices and a prepaid wallet per student; an order debits the wallet. */
@Controller('v1/canteen')
export class CanteenController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly gateway: PaymentGateway,
    private readonly topups: WalletTopupService,
  ) {}

  @Get('items')
  @Auth('user')
  items(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(canteenItems).orderBy(asc(canteenItems.name)));
  }

  @Post('items')
  @Auth('user', CANTEEN_ROLES)
  addItem(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ItemBody)) b: z.infer<typeof ItemBody>) {
    return orConflict('An item with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [i] = await tx.insert(canteenItems).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'canteen.item_added', subjectType: 'canteen_item', subjectId: i.id });
        return i;
      }),
    );
  }

  @Patch('items/:id')
  @Auth('user', CANTEEN_ROLES)
  patchItem(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemPatch)) b: z.infer<typeof ItemPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [i] = await tx.update(canteenItems).set(b).where(eq(canteenItems.id, id)).returning();
      if (!i) throw new NotFoundException('Item not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'canteen.item_updated', subjectType: 'canteen_item', subjectId: id, data: b });
      return i;
    });
  }

  /** A student's wallet and recent activity, for the family and the canteen. */
  @Get('students/:id')
  @Auth('user')
  wallet(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CANTEEN_ROLES);
      const [w] = await tx.select({ balancePaise: canteenWallets.balancePaise }).from(canteenWallets).where(eq(canteenWallets.studentId, studentId));
      const txns = await tx.select().from(canteenWalletTxns).where(eq(canteenWalletTxns.studentId, studentId)).orderBy(desc(canteenWalletTxns.createdAt)).limit(30);
      const meals = await tx.select({ date: canteenMealAttendance.mealDate, meal: canteenMealAttendance.meal }).from(canteenMealAttendance).where(eq(canteenMealAttendance.studentId, studentId)).orderBy(desc(canteenMealAttendance.mealDate), desc(canteenMealAttendance.createdAt)).limit(30);
      return { balancePaise: w?.balancePaise ?? 0, txns, meals, onlinePayments: await this.gateway.availableName(tx) };
    });
  }

  /** Cash received at the counter goes on the wallet. A retry with the same key adds nothing. */
  @Post('wallet/topup')
  @Auth('user', CANTEEN_ROLES)
  topUp(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TopUpBody)) b: z.infer<typeof TopUpBody>) {
    return this.move(p, b.studentId, b.idempotencyKey, b.amountPaise, 'topup');
  }

  /** Starts an online top-up (family, student or counter): creates the gateway order the app's checkout opens. */
  @Post('students/:id/topup-checkout')
  @Auth('user')
  async topUpCheckout(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Body(new ZodBody(OnlineTopUpBody)) b: z.infer<typeof OnlineTopUpBody>) {
    const { provider, payer } = await this.db.withTenant(p.tenantId, async (tx) => {
      const provider = await this.gateway.forTenant(tx);
      if (!provider) throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
      await assertCanSeeStudent(tx, p, studentId, CANTEEN_ROLES);
      const [payer] = await tx.select({ fullName: users.fullName, email: users.email, phone: users.phone }).from(users).where(eq(users.id, p.userId));
      return { provider, payer };
    });
    // The gateway call happens outside the transaction.
    const order = await provider.createOrder({ amountPaise: b.amountPaise, receipt: `wal_${studentId.slice(0, 8)}`, notes: { studentId, tenantId: p.tenantId, purpose: 'canteen_wallet' } });
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [topup] = await tx.insert(canteenTopups).values({ tenantId: p.tenantId, studentId, amountPaise: b.amountPaise, provider: provider.name, providerOrderId: order.orderId, payerUserId: p.userId }).returning();
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
      return { topupId: topup.id, provider: provider.name, keyId: provider.keyId, orderId: order.orderId, amountPaise: b.amountPaise, currency: 'INR', name: tenant?.name ?? 'KINETIX', description: 'Canteen wallet', prefill: { name: payer?.fullName ?? '', email: payer?.email ?? '', contact: payer?.phone ?? '' } };
    });
  }

  /** The app reports the checkout result; the gateway's signature proves it. A repeat adds nothing. */
  @Post('topups/:id/confirm')
  @HttpCode(200)
  @Auth('user')
  confirmTopUp(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConfirmBody)) b: z.infer<typeof ConfirmBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select().from(canteenTopups).where(eq(canteenTopups.id, id));
      if (!t) throw new NotFoundException('Top-up not found');
      await assertCanSeeStudent(tx, p, t.studentId, CANTEEN_ROLES);
      if (t.status !== 'paid') {
        const provider = await this.gateway.forTenant(tx);
        if (!provider || !provider.verifyPayment(t.providerOrderId, b.providerPaymentId, b.signature)) throw new ForbiddenException('The payment could not be verified');
      }
      return this.topups.credit(tx, id, b.providerPaymentId);
    });
  }

  // --- Meal attendance -----------------------------------------------------------------------

  /** Marks who ate a meal (the counter's tick list). Marking again is harmless. */
  @Post('meal-attendance')
  @HttpCode(200)
  @Auth('user', CANTEEN_ROLES)
  markMeals(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MealBody)) b: z.infer<typeof MealBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [tz] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const today = localParts(this.clock.now(), tz?.tz ?? 'Asia/Kolkata').date;
      const date = b.date ?? today;
      if (date > today) throw new BadRequestException('That day has not happened yet');
      const ids = [...new Set(b.studentIds)];
      const found = await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, ids), eq(students.status, 'active')));
      if (found.length !== ids.length) throw new BadRequestException('A student was not found');
      const added = await tx.insert(canteenMealAttendance).values(ids.map((studentId) => ({ tenantId: p.tenantId, studentId, mealDate: date, meal: b.meal, markedBy: p.userId }))).onConflictDoNothing().returning({ id: canteenMealAttendance.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'canteen.meals_marked', data: { date, meal: b.meal, added: added.length } });
      return { date, meal: b.meal, marked: added.length, alreadyMarked: ids.length - added.length };
    });
  }

  /** A day's headcount per meal, with names. */
  @Get('meal-attendance')
  @Auth('user', CANTEEN_ROLES)
  meals(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [tz] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localParts(this.clock.now(), tz?.tz ?? 'Asia/Kolkata').date;
      const rows = await tx.select({ meal: canteenMealAttendance.meal, studentId: students.id, studentName: students.fullName }).from(canteenMealAttendance).innerJoin(students, eq(students.id, canteenMealAttendance.studentId)).where(eq(canteenMealAttendance.mealDate, day)).orderBy(asc(students.fullName));
      return { date: day, meals: Meal.options.map((m) => ({ meal: m, count: rows.filter((r) => r.meal === m).length, students: rows.filter((r) => r.meal === m).map((r) => ({ id: r.studentId, name: r.studentName })) })) };
    });
  }

  @Post('orders')
  @Auth('user', CANTEEN_ROLES)
  order(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OrderBody)) b: z.infer<typeof OrderBody>) {
    return this.move(p, b.studentId, b.idempotencyKey, 0, 'order', b.items);
  }

  private move(p: UserPrincipal, studentId: string, key: string, topUp: number, kind: 'topup' | 'order', lines: { itemId: string; qty: number }[] = []) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [again] = await tx.select().from(canteenWalletTxns).where(eq(canteenWalletTxns.idempotencyKey, key));
      if (again) {
        if (again.studentId !== studentId) throw new ConflictException('That key was used for another student');
        return { txn: again, balancePaise: await this.balance(tx, studentId), repeated: true };
      }
      const [s] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.status, 'active')));
      if (!s) throw new NotFoundException('Student not found');
      let delta = topUp;
      let items: { itemId: string; name: string; qty: number; pricePaise: number }[] | null = null;
      if (kind === 'order') {
        const menu = await tx.select().from(canteenItems).where(inArray(canteenItems.id, lines.map((l) => l.itemId)));
        items = lines.map((l) => {
          const m = menu.find((x) => x.id === l.itemId);
          if (!m || !m.available) throw new BadRequestException('An item is not available');
          return { itemId: m.id, name: m.name, qty: l.qty, pricePaise: m.pricePaise };
        });
        delta = -items.reduce((t, i) => t + i.qty * i.pricePaise, 0);
      }
      await tx.insert(canteenWallets).values({ tenantId: p.tenantId, studentId }).onConflictDoNothing();
      const [w] = await tx.select().from(canteenWallets).where(eq(canteenWallets.studentId, studentId)).for('update');
      if (w.balancePaise + delta < 0) throw new ConflictException(`Not enough balance (₹${(w.balancePaise / 100).toFixed(2)})`);
      await tx.update(canteenWallets).set({ balancePaise: sql`${canteenWallets.balancePaise} + ${delta}`, updatedAt: new Date() }).where(eq(canteenWallets.id, w.id));
      const [txn] = await tx.insert(canteenWalletTxns).values({ tenantId: p.tenantId, studentId, deltaPaise: delta, kind, items, idempotencyKey: key, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `canteen.${kind}`, subjectType: 'canteen_wallet_txn', subjectId: txn.id, data: { studentId, deltaPaise: delta } });
      return { txn, balancePaise: w.balancePaise + delta, repeated: false };
    });
  }

  private async balance(tx: Tx, studentId: string): Promise<number> {
    const [w] = await tx.select({ b: canteenWallets.balancePaise }).from(canteenWallets).where(eq(canteenWallets.studentId, studentId));
    return w?.b ?? 0;
  }
}
