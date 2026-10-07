import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { admissionCycles, applicationPayments, applications, receiptCounters, tenants } from '../db/schema.js';
import { financialYear } from './fees.service.js';
import { PAYMENTS_NOT_CONFIGURED, PaymentGateway } from './payment-gateway.service.js';

/**
 * The admission application fee. It goes through the institution's own gateway account exactly like
 * a tuition fee (same provider, signature check, webhook and numbered receipt), but belongs to an
 * application, because the applicant is not a student yet and has no login.
 */
@Injectable()
export class ApplicationFeesService {
  private readonly log = new Logger(ApplicationFeesService.name);

  constructor(private readonly gateway: PaymentGateway) {}

  /** Starts an online payment for the application's fee. The gateway call is made by the caller's `createOrder`. */
  async prepareCheckout(tx: Tx, applicationId: string) {
    const provider = await this.gateway.forTenant(tx);
    if (!provider) throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
    const [row] = await tx
      .select({ app: applications, fee: admissionCycles.applicationFeePaise, cycleName: admissionCycles.name })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .where(eq(applications.id, applicationId));
    if (!row) throw new NotFoundException('Application not found');
    if (row.app.feeStatus !== 'pending') throw new BadRequestException(row.app.feeStatus === 'paid' ? 'The application fee is already paid' : 'No application fee is due');
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
    return { provider, app: row.app, amountPaise: row.fee, description: `Application fee: ${row.cycleName}`, institution: tenant?.name ?? 'KINETIX' };
  }

  async recordOrder(tx: Tx, a: { tenantId: string; applicationId: string; amountPaise: number; provider: string; orderId: string }) {
    const [pay] = await tx
      .insert(applicationPayments)
      .values({ tenantId: a.tenantId, applicationId: a.applicationId, amountPaise: a.amountPaise, method: 'online', status: 'created', provider: a.provider, providerOrderId: a.orderId })
      .returning();
    return pay;
  }

  /** The checkout result reported by the applicant's browser; the gateway's signature proves it. */
  async confirm(tx: Tx, applicationId: string, paymentId: string, providerPaymentId: string, signature: string) {
    const [pay] = await tx.select().from(applicationPayments).where(eq(applicationPayments.id, paymentId));
    if (!pay || pay.applicationId !== applicationId || pay.method !== 'online') throw new NotFoundException('Payment not found');
    if (pay.status !== 'paid') {
      const provider = await this.gateway.forTenant(tx);
      if (!pay.providerOrderId || !provider || !provider.verifyPayment(pay.providerOrderId, providerPaymentId, signature)) throw new ForbiddenException('The payment could not be verified');
      return this.markPaid(tx, paymentId, { providerPaymentId });
    }
    return pay;
  }

  /** The gateway's server-to-server notice. Returns whether the order was an application fee. */
  async creditByOrder(tx: Tx, entity: { id: string; order_id: string; amount: number }): Promise<boolean> {
    const [pay] = await tx.select().from(applicationPayments).where(eq(applicationPayments.providerOrderId, entity.order_id));
    if (!pay) return false;
    if (pay.amountPaise !== entity.amount) this.log.error(`Webhook amount ${entity.amount} does not match application payment ${pay.id} (${pay.amountPaise})`);
    else await this.markPaid(tx, pay.id, { providerPaymentId: entity.id });
    return true;
  }

  /** A payment taken at the admissions counter. */
  async recordCounter(tx: Tx, a: { tenantId: string; applicationId: string; actorId: string; method: 'cash' | 'cheque' | 'bank_transfer' | 'upi'; reference?: string }) {
    const [row] = await tx
      .select({ feeStatus: applications.feeStatus, fee: admissionCycles.applicationFeePaise })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .where(eq(applications.id, a.applicationId));
    if (!row) throw new NotFoundException('Application not found');
    if (row.feeStatus !== 'pending') throw new BadRequestException('No application fee is due');
    const [pay] = await tx
      .insert(applicationPayments)
      .values({ tenantId: a.tenantId, applicationId: a.applicationId, amountPaise: row.fee, method: a.method, status: 'created', reference: a.reference ?? null, recordedBy: a.actorId })
      .returning();
    return this.markPaid(tx, pay.id, {});
  }

  /** Marks paid, numbers the receipt (same series as fee receipts) and clears the application's fee. Idempotent. */
  async markPaid(tx: Tx, paymentId: string, details: { providerPaymentId?: string }) {
    const [payment] = await tx.select().from(applicationPayments).where(eq(applicationPayments.id, paymentId)).for('update');
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'paid') return payment;
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    const fy = financialYear(localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date);
    const [counter] = await tx
      .insert(receiptCounters)
      .values({ tenantId: payment.tenantId, financialYear: fy, lastNo: 1 })
      .onConflictDoUpdate({ target: [receiptCounters.tenantId, receiptCounters.financialYear], set: { lastNo: sql`${receiptCounters.lastNo} + 1` } })
      .returning();
    const receiptNo = `RCPT/${fy}/${String(counter.lastNo).padStart(5, '0')}`;
    const [paid] = await tx
      .update(applicationPayments)
      .set({ status: 'paid', paidAt: new Date(), receiptNo, providerPaymentId: details.providerPaymentId ?? payment.providerPaymentId })
      .where(eq(applicationPayments.id, paymentId))
      .returning();
    await tx.update(applications).set({ feeStatus: 'paid', updatedAt: new Date() }).where(eq(applications.id, payment.applicationId));
    await audit(tx, {
      tenantId: payment.tenantId,
      actorType: payment.recordedBy ? 'user' : 'system',
      actorId: payment.recordedBy ?? undefined,
      action: 'admissions.application.fee_paid.v1',
      subjectType: 'application',
      subjectId: payment.applicationId,
      data: { paymentId, amountPaise: payment.amountPaise, method: payment.method, receiptNo },
    });
    return paid;
  }
}
