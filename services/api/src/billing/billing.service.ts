import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { aiUsage, devices, saasInvoices, saasSubscriptions, saasUsageSnapshots, staffProfiles, students, vaultDocuments } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { addDays, computeInvoice, invoiceNumber, PAYMENT_DUE_DAYS, periodEnd, planByCode, renewalDue, TRIAL_DAYS, type Usage } from './billing.logic.js';

export const BILLING_RENEWAL = 'billing.renew';

/** The institution's KINETIX subscription: usage metering, invoices with GST, and renewal. */
@Injectable()
export class BillingService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(BILLING_RENEWAL, (job: Job) => this.renew(job.tenantId).then(() => undefined));
  }

  today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  /** Live figures for the period starting on `since`: active students and staff, enrolled boards, AI calls since then and stored megabytes. */
  async usage(tx: Tx, since: string, until?: string): Promise<Usage> {
    const [st] = await tx.select({ n: count() }).from(students).where(eq(students.status, 'active'));
    const [sf] = await tx.select({ n: count() }).from(staffProfiles);
    const [bd] = await tx.select({ n: count() }).from(devices).where(isNotNull(devices.enrolledAt));
    const [ai] = await tx
      .select({ n: count() })
      .from(aiUsage)
      .where(and(eq(aiUsage.outcome, 'ok'), gte(aiUsage.createdAt, new Date(`${since}T00:00:00Z`)), until ? lt(aiUsage.createdAt, new Date(`${addDays(until, 1)}T00:00:00Z`)) : undefined));
    const [fs] = await tx.select({ bytes: sql<number>`coalesce(sum(${vaultDocuments.sizeBytes}), 0)::float` }).from(vaultDocuments);
    return { students: st.n, staff: sf.n, boards: bd.n, aiCalls: ai.n, storageMb: Math.ceil(fs.bytes / 1_048_576) };
  }

  async snapshot(tx: Tx, tenantId: string, periodStart: string, u: Usage) {
    await tx
      .insert(saasUsageSnapshots)
      .values({ tenantId, periodStart, ...u })
      .onConflictDoUpdate({ target: [saasUsageSnapshots.tenantId, saasUsageSnapshots.periodStart], set: { ...u, takenAt: this.clock.now() } });
  }

  /** Starts (or replaces) the subscription. A trial is free for 30 days and then bills as the chosen plan. */
  async subscribe(tx: Tx, tenantId: string, actorId: string, b: { planCode: string; interval: 'month' | 'year'; billingStateCode: string; gstin?: string | null; trial?: boolean }) {
    const today = this.today();
    const [cur] = await tx.select().from(saasSubscriptions).for('update');
    if (cur) {
      const [row] = await tx
        .update(saasSubscriptions)
        .set({ planCode: b.planCode, interval: b.interval, billingStateCode: b.billingStateCode, gstin: b.gstin ?? cur.gstin, status: cur.status === 'cancelled' ? 'active' : cur.status, autoRenew: true, cancelledAt: null, updatedAt: this.clock.now() })
        .where(eq(saasSubscriptions.id, cur.id))
        .returning();
      await audit(tx, { tenantId, actorType: 'user', actorId, action: 'billing.plan_changed', subjectType: 'saas_subscription', subjectId: cur.id, changes: { planCode: { before: cur.planCode, after: b.planCode }, interval: { before: cur.interval, after: b.interval } } });
      return row;
    }
    const trialEnds = b.trial ? addDays(today, TRIAL_DAYS) : null;
    const [row] = await tx
      .insert(saasSubscriptions)
      .values({ tenantId, planCode: b.planCode, interval: b.interval, status: b.trial ? 'trial' : 'active', startedOn: today, currentPeriodStart: today, currentPeriodEnd: trialEnds ?? periodEnd(today, b.interval), trialEndsOn: trialEnds, billingStateCode: b.billingStateCode, gstin: b.gstin ?? null })
      .returning();
    await audit(tx, { tenantId, actorType: 'user', actorId, action: 'billing.subscribed', subjectType: 'saas_subscription', subjectId: row.id, data: { planCode: b.planCode, interval: b.interval, trial: !!b.trial } });
    return row;
  }

  /** Issues the invoice for [start, end] from that period's usage. Safe to repeat: one invoice per period. */
  async invoiceFor(tx: Tx, tenantId: string, sub: typeof saasSubscriptions.$inferSelect, start: string, end: string) {
    const plan = planByCode(sub.planCode)!;
    const u = await this.usage(tx, start, end);
    await this.snapshot(tx, tenantId, start, u);
    const c = computeInvoice(plan, sub.interval as 'month' | 'year', u, sub.billingStateCode);
    const today = this.today();
    const [{ n }] = await tx.select({ n: count() }).from(saasInvoices);
    const [row] = await tx
      .insert(saasInvoices)
      .values({ tenantId, number: invoiceNumber(today, n + 1), periodStart: start, periodEnd: end, planCode: plan.code, lines: c.lines, subtotalPaise: c.subtotalPaise, taxPaise: c.taxPaise, taxBreakdown: c.taxBreakdown, totalPaise: c.totalPaise, issuedOn: today, dueOn: addDays(today, PAYMENT_DUE_DAYS) })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await audit(tx, { tenantId, actorType: 'system', action: 'billing.invoice_issued', subjectType: 'saas_invoice', subjectId: row.id, data: { number: row.number, totalPaise: row.totalPaise } });
      await this.events.emit(tx, tenantId, { type: DomainEvents.InvoiceIssued, aggregateType: 'saas_invoice', aggregateId: row.id, payload: { number: row.number, totalPaise: row.totalPaise } });
    }
    return row ?? null;
  }

  /**
   * The daily job: renews a subscription whose period has ended (invoicing the ended period unless it was a trial),
   * and marks it past due when an invoice is unpaid after its due date.
   */
  async renew(tenantId: string): Promise<{ renewed: boolean; invoice: string | null }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [sub] = await tx.select().from(saasSubscriptions).for('update');
      if (!sub) return { renewed: false, invoice: null };
      const today = this.today();
      let invoice: string | null = null;
      let renewed = false;
      if (renewalDue({ status: sub.status, autoRenew: sub.autoRenew, currentPeriodEnd: sub.currentPeriodEnd }, today)) {
        if (sub.status !== 'trial') invoice = (await this.invoiceFor(tx, tenantId, sub, sub.currentPeriodStart, sub.currentPeriodEnd))?.number ?? null;
        const start = addDays(sub.currentPeriodEnd, 1);
        await tx.update(saasSubscriptions).set({ status: sub.status === 'trial' ? 'active' : sub.status, currentPeriodStart: start, currentPeriodEnd: periodEnd(start, sub.interval as 'month' | 'year'), updatedAt: this.clock.now() }).where(eq(saasSubscriptions.id, sub.id));
        await audit(tx, { tenantId, actorType: 'system', action: 'billing.renewed', subjectType: 'saas_subscription', subjectId: sub.id, data: { from: sub.currentPeriodStart, to: start } });
        renewed = true;
      }
      const [late] = await tx.select({ n: count() }).from(saasInvoices).where(and(eq(saasInvoices.status, 'issued'), lt(saasInvoices.dueOn, today)));
      if (late.n > 0 && sub.status === 'active') await tx.update(saasSubscriptions).set({ status: 'past_due', updatedAt: this.clock.now() }).where(eq(saasSubscriptions.id, sub.id));
      return { renewed, invoice };
    });
  }

  /** Records a payment against an invoice; the subscription returns to active when nothing else is overdue. */
  async markPaid(tx: Tx, tenantId: string, actorId: string, invoiceId: string, ref: string) {
    const [inv] = await tx.select().from(saasInvoices).where(eq(saasInvoices.id, invoiceId)).for('update');
    if (!inv) return null;
    if (inv.status !== 'issued') return inv;
    const [row] = await tx.update(saasInvoices).set({ status: 'paid', paidOn: this.today(), paymentRef: ref }).where(eq(saasInvoices.id, invoiceId)).returning();
    const [late] = await tx.select({ n: count() }).from(saasInvoices).where(and(eq(saasInvoices.status, 'issued'), lt(saasInvoices.dueOn, this.today())));
    if (late.n === 0) await tx.update(saasSubscriptions).set({ status: 'active', updatedAt: this.clock.now() }).where(eq(saasSubscriptions.status, 'past_due'));
    await audit(tx, { tenantId, actorType: 'user', actorId, action: 'billing.invoice_paid', subjectType: 'saas_invoice', subjectId: invoiceId, data: { number: inv.number, ref } });
    return row;
  }

  invoices(tx: Tx) {
    return tx.select().from(saasInvoices).orderBy(desc(saasInvoices.periodStart)).limit(60);
  }
}
