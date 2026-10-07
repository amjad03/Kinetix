import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { orConflict } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { canteenItems, canteenWallets, canteenWalletTxns, students } from '../db/schema.js';

export const CANTEEN_ROLES: RoleName[] = ['canteen_manager', 'tenant_admin', 'principal'];

const ItemBody = z.object({ name: z.string().trim().min(1).max(80), pricePaise: z.number().int().min(100).max(1_000_000) });
const ItemPatch = z.object({ pricePaise: z.number().int().min(100).max(1_000_000).optional(), available: z.boolean().optional() });
const TopUpBody = z.object({ studentId: z.uuid(), amountPaise: z.number().int().min(100).max(10_000_000), idempotencyKey: z.string().min(8).max(80) });
const OrderBody = z.object({ studentId: z.uuid(), idempotencyKey: z.string().min(8).max(80), items: z.array(z.object({ itemId: z.uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(30) });

/** Canteen: a menu with prices and a prepaid wallet per student; an order debits the wallet. */
@Controller('v1/canteen')
export class CanteenController {
  constructor(private readonly db: DbService) {}

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
      return { balancePaise: w?.balancePaise ?? 0, txns };
    });
  }

  /** Cash received at the counter goes on the wallet. A retry with the same key adds nothing. */
  @Post('wallet/topup')
  @Auth('user', CANTEEN_ROLES)
  topUp(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TopUpBody)) b: z.infer<typeof TopUpBody>) {
    return this.move(p, b.studentId, b.idempotencyKey, b.amountPaise, 'topup');
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
