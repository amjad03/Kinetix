import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { saasInvoices, saasSubscriptions, saasUsageSnapshots } from '../db/schema.js';
import { computeInvoice, PLANS, planByCode } from './billing.logic.js';
import { BillingService } from './billing.service.js';

export const BILLING_ROLES: RoleName[] = ['tenant_admin', 'principal'];

const SubscribeBody = z.object({
  planCode: z.enum(['starter', 'standard', 'enterprise']),
  interval: z.enum(['month', 'year']).default('month'),
  billingStateCode: z.string().regex(/^\d{2}$/, 'The GST state code is two digits, for example 29 for Karnataka').default('29'),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'That is not a valid GSTIN').optional(),
  trial: z.boolean().default(false),
});

/** The institution's own KINETIX plan, usage and invoices. */
@Controller('v1/billing')
export class BillingController {
  constructor(
    private readonly db: DbService,
    private readonly billing: BillingService,
  ) {}

  /** The plans on offer, with the prices the invoice uses. */
  @Get('plans')
  @Auth('user', BILLING_ROLES)
  plans() {
    return PLANS;
  }

  /** The subscription, live usage for the period and what the next invoice would be. */
  @Get('subscription')
  @Auth('user', BILLING_ROLES)
  subscription(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sub] = await tx.select().from(saasSubscriptions);
      if (!sub) return { subscription: null, plan: null, usage: await this.billing.usage(tx, this.billing.today()), estimate: null };
      const plan = planByCode(sub.planCode)!;
      const usage = await this.billing.usage(tx, sub.currentPeriodStart);
      await this.billing.snapshot(tx, p.tenantId, sub.currentPeriodStart, usage);
      const estimate = sub.status === 'trial' ? null : computeInvoice(plan, sub.interval as 'month' | 'year', usage, sub.billingStateCode);
      return { subscription: sub, plan, usage, estimate };
    });
  }

  @Post('subscription')
  @HttpCode(200)
  @Auth('user', BILLING_ROLES)
  subscribe(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SubscribeBody)) b: z.infer<typeof SubscribeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.billing.subscribe(tx, p.tenantId, p.userId, b));
  }

  /** Stops renewal. Access continues to the end of the paid period. */
  @Post('subscription/cancel')
  @HttpCode(200)
  @Auth('user', BILLING_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sub] = await tx.select().from(saasSubscriptions).for('update');
      if (!sub) throw new NotFoundException('There is no subscription');
      const [row] = await tx.update(saasSubscriptions).set({ autoRenew: false, status: 'cancelled', cancelledAt: new Date() }).where(eq(saasSubscriptions.id, sub.id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'billing.cancelled', subjectType: 'saas_subscription', subjectId: sub.id, changes: { status: { before: sub.status, after: 'cancelled' }, autoRenew: { before: sub.autoRenew, after: false } } });
      return row;
    });
  }

  /** Usage snapshots, newest first. */
  @Get('usage')
  @Auth('user', BILLING_ROLES)
  usage(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(saasUsageSnapshots).orderBy(desc(saasUsageSnapshots.periodStart)).limit(24));
  }

  @Get('invoices')
  @Auth('user', BILLING_ROLES)
  invoices(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.billing.invoices(tx));
  }

  /** Runs the renewal now (the daily job does the same): invoices a period that has ended and starts the next. */
  @Post('renew')
  @HttpCode(200)
  @Auth('user', BILLING_ROLES)
  renew(@CurrentPrincipal() p: UserPrincipal) {
    return this.billing.renew(p.tenantId);
  }

  /** Records that an invoice was paid (bank transfer reference or gateway payment id). */
  @Post('invoices/:id/pay')
  @HttpCode(200)
  @Auth('user', BILLING_ROLES)
  pay(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ reference: z.string().trim().min(3).max(100) }))) b: { reference: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(saasInvoices).where(eq(saasInvoices.id, id));
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status === 'void') throw new ConflictException('This invoice was voided');
      if (inv.status === 'paid') throw new BadRequestException('This invoice is already paid');
      return this.billing.markPaid(tx, p.tenantId, p.userId, id, b.reference);
    });
  }
}
