import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { canteenTopups, canteenWallets, canteenWalletTxns } from '../db/schema.js';

/** Canteen wallet top-ups paid online (the institution's own Razorpay account): credited once, by the app's confirm or the gateway's webhook, whichever comes first. */
@Injectable()
export class WalletTopupService {
  private readonly log = new Logger(WalletTopupService.name);

  /** Marks the top-up paid and puts the money on the wallet. A second call changes nothing. */
  async credit(tx: Tx, topupId: string, providerPaymentId: string): Promise<{ balancePaise: number; repeated: boolean }> {
    const [t] = await tx.select().from(canteenTopups).where(eq(canteenTopups.id, topupId)).for('update');
    await tx.insert(canteenWallets).values({ tenantId: t.tenantId, studentId: t.studentId }).onConflictDoNothing();
    const [w] = await tx.select().from(canteenWallets).where(eq(canteenWallets.studentId, t.studentId)).for('update');
    if (t.status === 'paid') return { balancePaise: w.balancePaise, repeated: true };
    if (!t.payerUserId) {
      this.log.error(`Top-up ${t.id} has no payer to record; not credited`);
      return { balancePaise: w.balancePaise, repeated: true };
    }
    await tx.update(canteenTopups).set({ status: 'paid', providerPaymentId, paidAt: new Date() }).where(eq(canteenTopups.id, t.id));
    await tx.update(canteenWallets).set({ balancePaise: sql`${canteenWallets.balancePaise} + ${t.amountPaise}`, updatedAt: new Date() }).where(eq(canteenWallets.id, w.id));
    await tx.insert(canteenWalletTxns).values({ tenantId: t.tenantId, studentId: t.studentId, deltaPaise: t.amountPaise, kind: 'topup', idempotencyKey: `online:${t.providerOrderId}`, createdBy: t.payerUserId });
    await audit(tx, { tenantId: t.tenantId, actorType: 'user', actorId: t.payerUserId, action: 'canteen.online_topup', subjectType: 'canteen_topup', subjectId: t.id, data: { amountPaise: t.amountPaise } });
    return { balancePaise: w.balancePaise + t.amountPaise, repeated: false };
  }

  /** The gateway's webhook: returns whether the order was a wallet top-up. */
  async creditByOrder(tx: Tx, entity: { id: string; order_id: string; amount: number }): Promise<boolean> {
    const [t] = await tx.select().from(canteenTopups).where(eq(canteenTopups.providerOrderId, entity.order_id));
    if (!t) return false;
    if (t.amountPaise !== entity.amount) this.log.error(`Webhook amount ${entity.amount} does not match top-up ${t.id} (${t.amountPaise})`);
    else await this.credit(tx, t.id, entity.id);
    return true;
  }
}
