import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { safeEqual } from './payment-provider.js';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, feePayments, students, tenants, users } from '../db/schema.js';
import { feeInstalments } from '../db/schema-depth.js';
import { feePaymentLinks, gatewayWebhookEvents } from '../db/schema-fee-flagship.js';
import { settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { convenienceFee } from './fee-depth.logic.js';
import { allocatePaid } from './fees-depth.logic.js';
import { FeesService } from './fees.service.js';
import { PAYMENTS_NOT_CONFIGURED, PaymentGateway } from './payment-gateway.service.js';
import type { PaymentProvider, WebhookEvent } from './payment-provider.js';

export const POLL_JOB = 'fees.gateway_status';
/** Pending online payments are given up (cancelled) after this long with no answer from the gateway. */
export const PENDING_GIVE_UP_HOURS = 72;
const MAX_CHECKS = 30;

/** What a payment may be: the whole balance, the instalments due now, or (when the institution allows it) a part. */
export function allowedAmount(o: { balancePaise: number; dueNowPaise: number | null; wantPaise?: number; allowPartial: boolean; minPartPaise: number }): { ok: true; paise: number } | { ok: false; error: string } {
  const want = o.wantPaise ?? o.balancePaise;
  if (want <= 0) return { ok: false, error: 'Nothing is due on this fee' };
  if (want > o.balancePaise) return { ok: false, error: 'That is more than the balance due' };
  if (want === o.balancePaise || (o.dueNowPaise != null && want === o.dueNowPaise)) return { ok: true, paise: want };
  if (!o.allowPartial) return { ok: false, error: o.dueNowPaise ? 'Pay the instalment due now or the whole balance' : 'Pay the whole balance; part payments are not taken online' };
  if (want < o.minPartPaise) return { ok: false, error: `Pay at least ₹${(o.minPartPaise / 100).toLocaleString('en-IN')} at a time` };
  return { ok: true, paise: want };
}

/**
 * Online payment through the institution's (or fee account's) gateway: starting a checkout, the gateway's webhook
 * (signature checked, each event processed once), asking the gateway about payments still pending (on return from a
 * hosted page, and every hour in the background), and giving up on ones never completed.
 */
@Injectable()
export class GatewayFlow implements OnModuleInit {
  private readonly log = new Logger(GatewayFlow.name);
  private readonly publicUrl: string | undefined;
  private readonly launchSecret: string;

  constructor(
    private readonly db: DbService,
    private readonly gateway: PaymentGateway,
    private readonly fees: FeesService,
    private readonly jobs: JobsService,
    @Inject(ENV) env: Env,
  ) {
    this.publicUrl = env.API_PUBLIC_URL?.replace(/\/+$/, '');
    this.launchSecret = `launch:${env.JWT_SECRET}`;
  }

  /** A short-lived token that lets a browser open the checkout of one payment (the apps hand it the launch URL). */
  launchToken(tenantId: string, paymentId: string, ttlMinutes = 30): string {
    const exp = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
    return `${exp}.${createHmac('sha256', this.launchSecret).update(`${tenantId}:${paymentId}:${exp}`).digest('base64url')}`;
  }

  launchTokenOk(tenantId: string, paymentId: string, token: string): boolean {
    const [exp, sig] = token.split('.');
    if (!exp || !sig || !/^\d{9,11}$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
    return safeEqual(createHmac('sha256', this.launchSecret).update(`${tenantId}:${paymentId}:${exp}`).digest('base64url'), sig);
  }

  onModuleInit(): void {
    this.jobs.registerHourly(POLL_JOB, (job: Job) => this.pollPending(job.tenantId).then(() => undefined));
  }

  /** What is due now on each of these invoices that is on instalments (the instalments due by today, else the next one). */
  async dueNowOf(tx: Tx, invs: { id: string; paidPaise: number }[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!invs.length) return out;
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const today = localParts(new Date(), t?.tz ?? 'Asia/Kolkata').date;
    const inst = await tx.select().from(feeInstalments).where(inArray(feeInstalments.invoiceId, invs.map((i) => i.id))).orderBy(asc(feeInstalments.seq));
    for (const inv of invs) {
      const mine = inst.filter((x) => x.invoiceId === inv.id);
      if (!mine.length) continue;
      const schedule = allocatePaid(mine.map((x) => ({ seq: x.seq, dueOn: x.dueOn, amountPaise: x.amountPaise })), inv.paidPaise, today);
      const now = schedule.filter((x) => x.dueOn <= today && x.status !== 'paid').reduce((s, x) => s + x.amountPaise - x.paidPaise, 0);
      const next = schedule.find((x) => x.status !== 'paid');
      const v = now > 0 ? now : next ? next.amountPaise - next.paidPaise : 0;
      if (v > 0) out.set(inv.id, v);
    }
    return out;
  }

  /** The invoice's balance and what is due now on its instalments. */
  async payable(tx: Tx, invoiceId: string) {
    const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId));
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'due') throw new BadRequestException(inv.status === 'paid' ? 'This fee is already paid' : 'This fee was cancelled');
    const [t] = await tx.select({ tz: tenants.timezone, name: tenants.name, slug: tenants.slug }).from(tenants);
    const today = localParts(new Date(), t?.tz ?? 'Asia/Kolkata').date;
    const inst = await tx.select().from(feeInstalments).where(eq(feeInstalments.invoiceId, invoiceId)).orderBy(asc(feeInstalments.seq));
    const schedule = inst.length ? allocatePaid(inst.map((x) => ({ seq: x.seq, dueOn: x.dueOn, amountPaise: x.amountPaise })), inv.paidPaise, today) : [];
    const dueNow = schedule.length ? schedule.filter((x) => x.dueOn <= today && x.status !== 'paid').reduce((s, x) => s + x.amountPaise - x.paidPaise, 0) : null;
    const next = schedule.find((x) => x.status !== 'paid');
    return { inv, tenant: t, balancePaise: inv.amountPaise - inv.paidPaise, dueNowPaise: dueNow && dueNow > 0 ? dueNow : next ? next.amountPaise - next.paidPaise : null, schedule };
  }

  /**
   * Starts an online payment of an invoice: checks the amount against the institution's rules, creates the order in
   * the gateway of the invoice's fee account (outside the transaction), and stores a pending payment.
   */
  async startCheckout(tenantId: string, payerUserId: string | null, invoiceId: string, o: { amountPaise?: number; returnUrl?: string; linkId?: string | null; payer?: { name: string; email: string; phone: string } }) {
    const prep = await this.db.withTenant(tenantId, async (tx) => {
      const { inv, tenant, balancePaise, dueNowPaise } = await this.payable(tx, invoiceId);
      const found = await this.gateway.forFeeAccount(tx, inv.feeAccountId);
      if (!found) throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
      const s = await settingsOf(tx, tenantId);
      const ok = allowedAmount({ balancePaise, dueNowPaise, wantPaise: o.amountPaise, allowPartial: s.online.allowPartial !== false, minPartPaise: Math.round((s.online.minPartRupees ?? 0) * 100) });
      if (!ok.ok) throw new BadRequestException(ok.error);
      const [u] = payerUserId ? await tx.select({ fullName: users.fullName, email: users.email, phone: users.phone }).from(users).where(eq(users.id, payerUserId)) : [];
      const payer = o.payer ?? { name: u?.fullName ?? '', email: u?.email ?? '', phone: u?.phone ?? '' };
      const conveniencePaise = convenienceFee(s.convenience, ok.paise);
      return { inv, tenant, amountPaise: ok.paise, conveniencePaise, payer, ...found };
    });
    const notifyUrl = this.publicUrl ? `${this.publicUrl}/v1/fees/webhooks/${prep.provider.name}/${prep.tenant?.slug ?? ''}` : undefined;
    // Hosted pages send the payer back to the API, which checks the post and asks them to return to the app.
    const returnUrl = o.returnUrl ?? (this.publicUrl && ['payu', 'easebuzz', 'ccavenue', 'cashfree'].includes(prep.provider.name) ? `${this.publicUrl}/v1/fees/gateway-return/${prep.provider.name}/${prep.tenant?.slug ?? ''}` : undefined);
    let order;
    try {
      order = await prep.provider.createOrder({ amountPaise: prep.amountPaise + prep.conveniencePaise, receipt: `inv_${invoiceId.slice(0, 8)}`, notes: { invoiceId, tenantId, studentId: prep.inv.studentId }, payer: prep.payer, returnUrl, notifyUrl });
    } catch (e) {
      this.log.warn(`Checkout for invoice ${invoiceId} failed at ${prep.provider.name}: ${(e as Error).message.slice(0, 160)}`);
      throw new ServiceUnavailableException('The payment gateway could not start the payment. Please try again in a few minutes.');
    }
    return this.db.withTenant(tenantId, async (tx) => {
      const [pay] = await tx
        .insert(feePayments)
        .values({ tenantId, invoiceId, studentId: prep.inv.studentId, amountPaise: prep.amountPaise, conveniencePaise: prep.conveniencePaise, method: 'online', status: 'created', provider: prep.provider.name, providerOrderId: order.orderId, payerUserId, gatewayAccountId: prep.accountId, linkId: o.linkId ?? null, checkout: { hosted: order.hosted ?? null, session: order.session ?? null, keyId: prep.provider.keyId, name: prep.tenant?.name ?? '', description: prep.inv.title, prefill: { name: prep.payer.name, email: prep.payer.email, contact: prep.payer.phone } } })
        .returning();
      const launchPath = `/v1/public/checkout/${prep.tenant?.slug ?? ''}/${pay.id}?t=${this.launchToken(tenantId, pay.id)}`;
      return {
        paymentId: pay.id,
        provider: prep.provider.name,
        // The account's own public key: the checkout pays into its account.
        keyId: prep.provider.keyId,
        orderId: order.orderId,
        /** A hosted checkout (PayU, Easebuzz, CCAvenue): the app opens the url (posting the fields) in a browser. */
        hosted: order.hosted ?? null,
        /** Cashfree's SDK session. */
        session: order.session ?? null,
        amountPaise: prep.amountPaise + prep.conveniencePaise,
        feePaise: prep.amountPaise,
        conveniencePaise: prep.conveniencePaise,
        currency: 'INR',
        name: prep.tenant?.name ?? 'ZYNETIX',
        description: prep.inv.title,
        prefill: { name: prep.payer.name, email: prep.payer.email, contact: prep.payer.phone },
        /** A page that opens this checkout in any browser (the apps use it for gateways without an in-app SDK). */
        launchPath,
        launchUrl: this.publicUrl ? `${this.publicUrl}${launchPath}` : null,
      };
    });
  }

  /** Asks the gateway about a pending online payment and credits it when the gateway says it is paid. */
  async refresh(tenantId: string, paymentId: string): Promise<{ status: 'paid' | 'pending' | 'failed' | 'cancelled'; receiptNo?: string | null }> {
    const ctx = await this.db.withTenant(tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, paymentId));
      if (!pay || pay.method !== 'online') throw new NotFoundException('Payment not found');
      if (pay.status !== 'created' || !pay.providerOrderId) return { kind: 'done' as const, pay, provider: null };
      return { kind: 'ask' as const, pay, provider: await this.gateway.forAccountId(tx, pay.gatewayAccountId) };
    });
    if (ctx.kind === 'done') return { status: ctx.pay.status as 'paid', receiptNo: ctx.pay.receiptNo };
    if (!ctx.provider || ctx.provider.name !== ctx.pay.provider) return { status: 'pending' };
    let st;
    try {
      st = await ctx.provider.fetchStatus(ctx.pay.providerOrderId!, ctx.pay.amountPaise + ctx.pay.conveniencePaise);
    } catch (e) {
      this.log.warn(`Status of payment ${paymentId} at ${ctx.provider.name} failed: ${(e as Error).message.slice(0, 160)}`);
      st = { status: 'pending' as const };
    }
    return this.db.withTenant(tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, paymentId)).for('update');
      if (pay.status !== 'created') return { status: pay.status as 'paid', receiptNo: pay.receiptNo };
      if (st.status === 'paid') {
        if (st.amountPaise != null && st.amountPaise !== pay.amountPaise + pay.conveniencePaise) {
          this.log.error(`Gateway amount ${st.amountPaise} does not match payment ${pay.id} (${pay.amountPaise + pay.conveniencePaise})`);
          await tx.update(feePayments).set({ statusCheckedAt: new Date(), statusChecks: pay.statusChecks + 1 }).where(eq(feePayments.id, pay.id));
          return { status: 'pending' as const };
        }
        const paid = await this.fees.markPaid(tx, pay.id, { providerPaymentId: st.providerPaymentId });
        await this.linkPaid(tx, paid);
        return { status: 'paid' as const, receiptNo: paid.receiptNo };
      }
      if (st.status === 'failed') {
        await tx.update(feePayments).set({ status: 'failed', statusCheckedAt: new Date(), statusChecks: pay.statusChecks + 1 }).where(eq(feePayments.id, pay.id));
        return { status: 'failed' as const };
      }
      await tx.update(feePayments).set({ statusCheckedAt: new Date(), statusChecks: pay.statusChecks + 1 }).where(eq(feePayments.id, pay.id));
      return { status: 'pending' as const };
    });
  }

  /** The hourly job: every pending online payment older than the wait is asked about; very old ones are given up. */
  async pollPending(tenantId: string): Promise<{ checked: number; paid: number; failed: number; gaveUp: number }> {
    const { ids, gaveUp } = await this.db.withTenant(tenantId, async (tx) => {
      const s = await settingsOf(tx, tenantId);
      const wait = new Date(Date.now() - (s.online.pollAfterMinutes ?? 15) * 60_000);
      const old = new Date(Date.now() - PENDING_GIVE_UP_HOURS * 3600_000);
      const dropped = await tx.update(feePayments).set({ status: 'cancelled', statusCheckedAt: new Date() }).where(and(eq(feePayments.method, 'online'), eq(feePayments.status, 'created'), lt(feePayments.createdAt, old))).returning({ id: feePayments.id });
      const rows = await tx
        .select({ id: feePayments.id })
        .from(feePayments)
        .where(and(eq(feePayments.method, 'online'), eq(feePayments.status, 'created'), lt(feePayments.createdAt, wait), gte(feePayments.createdAt, old), lt(feePayments.statusChecks, MAX_CHECKS), sql`${feePayments.providerOrderId} is not null`))
        .orderBy(asc(feePayments.createdAt))
        .limit(200);
      return { ids: rows.map((r) => r.id), gaveUp: dropped.length };
    });
    let paid = 0;
    let failed = 0;
    for (const id of ids) {
      const r = await this.refresh(tenantId, id);
      if (r.status === 'paid') paid++;
      if (r.status === 'failed') failed++;
    }
    return { checked: ids.length, paid, failed, gaveUp };
  }

  /**
   * A gateway's webhook for one institution: the signature is checked with each of the institution's accounts at that
   * gateway, each event is processed once (a retried notice is acknowledged), and a payment is credited only when the
   * order is this institution's, was ordered with the account that signed, and the amount matches.
   */
  async webhook(tenantId: string, providerName: string, rawBody: Buffer, headers: Record<string, string | undefined>): Promise<{ ok: true; outcome: string } | { ok: false }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const accounts = await this.gateway.allOf(tx, providerName);
      let hit: { id: string; provider: PaymentProvider; event: WebhookEvent | null } | null = null;
      for (const a of accounts) {
        const r = a.provider.readWebhook(rawBody, headers);
        if (r.ok) {
          hit = { id: a.id, provider: a.provider, event: r.event };
          break;
        }
      }
      if (!hit) return { ok: false as const };
      if (!hit.event) return { ok: true as const, outcome: 'ignored' };
      const e = hit.event;
      const [seen] = await tx.insert(gatewayWebhookEvents).values({ tenantId, provider: providerName, eventKey: e.key.slice(0, 200), kind: e.kind, orderId: e.orderId.slice(0, 100), outcome: 'received' }).onConflictDoNothing().returning();
      if (!seen) return { ok: true as const, outcome: 'duplicate' };
      const outcome = await this.apply(tx, hit.id, e);
      await tx.update(gatewayWebhookEvents).set({ outcome: outcome.outcome, paymentId: outcome.paymentId ?? null }).where(eq(gatewayWebhookEvents.id, seen.id));
      return { ok: true as const, outcome: outcome.outcome };
    });
  }

  private async apply(tx: Tx, accountId: string, e: WebhookEvent): Promise<{ outcome: string; paymentId?: string }> {
    const [pay] = await tx.select().from(feePayments).where(eq(feePayments.providerOrderId, e.orderId)).for('update');
    if (!pay) return { outcome: 'unknown_order' };
    // Signed by a different account than the order was made with: not this payment's notice.
    if (pay.gatewayAccountId && pay.gatewayAccountId !== accountId) return { outcome: 'wrong_account', paymentId: pay.id };
    if (e.kind === 'refund') return { outcome: 'refund_noted', paymentId: pay.id };
    if (e.status === 'failed') {
      if (pay.status === 'created') await tx.update(feePayments).set({ status: 'failed', statusCheckedAt: new Date() }).where(eq(feePayments.id, pay.id));
      return { outcome: pay.status === 'created' ? 'failed' : 'already_settled', paymentId: pay.id };
    }
    if (pay.status === 'paid') return { outcome: 'already_paid', paymentId: pay.id };
    if (pay.amountPaise + pay.conveniencePaise !== e.amountPaise) {
      this.log.error(`Webhook amount ${e.amountPaise} does not match payment ${pay.id} (${pay.amountPaise + pay.conveniencePaise})`);
      return { outcome: 'amount_mismatch', paymentId: pay.id };
    }
    const paid = await this.fees.markPaid(tx, pay.id, { providerPaymentId: e.providerPaymentId });
    await this.linkPaid(tx, paid);
    return { outcome: 'credited', paymentId: pay.id };
  }

  /** The API's public address when configured (for return and webhook URLs). */
  get publicBase(): string | undefined {
    return this.publicUrl;
  }

  /**
   * A browser checkout came back with the gateway's signed answer (Razorpay's callback: payment id and signature):
   * checked with the key of the account the order was made with, then credited.
   */
  async confirmByOrder(tenantId: string, orderId: string, providerPaymentId: string, signature: string, fields?: Record<string, string>): Promise<boolean> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.providerOrderId, orderId)).for('update');
      if (!pay || pay.method !== 'online') return false;
      if (pay.status === 'paid') return true;
      const provider = await this.gateway.forAccountId(tx, pay.gatewayAccountId);
      if (!provider || !provider.verifyPayment(orderId, providerPaymentId, signature, fields)) return false;
      const paid = await this.fees.markPaid(tx, pay.id, { providerPaymentId });
      await this.linkPaid(tx, paid);
      return true;
    });
  }

  /** The payment of an order (a return page that names only the order: Cashfree's return URL). */
  async paymentOfOrder(tenantId: string, orderId: string): Promise<string | null> {
    const [p] = await this.db.withTenant(tenantId, (tx) => tx.select({ id: feePayments.id }).from(feePayments).where(eq(feePayments.providerOrderId, orderId)));
    return p?.id ?? null;
  }

  /** A payment made through a payment link closes the link. */
  async linkPaid(tx: Tx, pay: typeof feePayments.$inferSelect): Promise<void> {
    if (!pay.linkId) return;
    await tx.update(feePaymentLinks).set({ status: 'paid', paymentId: pay.id, paidAt: new Date() }).where(and(eq(feePaymentLinks.id, pay.linkId), inArray(feePaymentLinks.status, ['active', 'expired'])));
  }

  /** The student of a pending payment (for the access check of a family refreshing it). */
  async studentOf(tx: Tx, paymentId: string): Promise<string | null> {
    const [r] = await tx.select({ s: feePayments.studentId }).from(feePayments).innerJoin(students, eq(students.id, feePayments.studentId)).where(eq(feePayments.id, paymentId));
    return r?.s ?? null;
  }
}
