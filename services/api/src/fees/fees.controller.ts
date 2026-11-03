import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, feePayments, sections, students, tenants, users } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ApplicationFeesService } from './application-fees.service.js';
import { FEE_ROLES, FeesService } from './fees.service.js';
import { PAYMENTS_NOT_CONFIGURED, PaymentGateway } from './payment-gateway.service.js';
import { WalletTopupService } from './wallet-topup.service.js';
import { settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { convenienceFee } from './fee-depth.logic.js';
import type { PaymentProvider } from './payment-provider.js';
import { naturalAsc } from '../common/natural-order.js';
import { GatewayFlow } from './gateway-flow.service.js';
import { accrues, syncAccruals } from './accruals.js';
import { ensureLines, feeToday, findHead, headsOf } from './fee-lines.js';

const RETURN_PAGE = (ok: boolean) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment</title><style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#1f2937}main{max-width:28rem;padding:2rem;text-align:center}</style></head><body><main><h1>${ok ? 'Thank you' : 'Payment not completed'}</h1><p>${ok ? 'Your payment has reached the institution. The receipt will appear in the app in a moment; you can close this window.' : 'The payment did not go through. No money was taken by the institution; you can close this window and try again.'}</p></main></body></html>`;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Paise = z.number().int().min(100).max(100_000_000_00);

const IssueBody = z.object({ sectionId: z.uuid(), title: z.string().trim().min(1).max(120), amountPaise: Paise, dueOn: Day });
const CounterBody = z.object({
  amountPaise: Paise,
  method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi']),
  reference: z.string().trim().max(100).optional(),
});
const RemindBody = z.object({ studentIds: z.array(z.uuid()).min(1).max(500) });
const CheckoutBody = z.object({ amountPaise: Paise.optional(), returnUrl: z.url().max(300).optional() });
const ConfirmBody = z.object({ providerPaymentId: z.string().min(1).max(100), signature: z.string().min(1).max(200), /** A hosted checkout's whole response (PayU). */ fields: z.record(z.string(), z.string().max(500)).optional() });

/**
 * Fees: the accounts office issues fees to a class and records counter payments; families pay
 * online in the app through the institution's own Razorpay account and get numbered receipts.
 * Amounts are integer paise.
 */
@Controller('v1/fees')
export class FeesController {
  private readonly log = new Logger(FeesController.name);

  constructor(
    private readonly db: DbService,
    private readonly fees: FeesService,
    private readonly gateway: PaymentGateway,
    private readonly notifications: NotificationsService,
    private readonly lookups: SystemLookups,
    private readonly applicationFees: ApplicationFeesService,
    private readonly walletTopups: WalletTopupService,
    private readonly flow: GatewayFlow,
  ) {}

  /** One invoice per active student of the class. */
  @Post('invoices')
  @Auth('user', FEE_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IssueBody)) body: z.infer<typeof IssueBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [section] = await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, body.sectionId));
      if (!section) throw new NotFoundException('Class not found');
      const roster = await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, section.id), eq(students.status, 'active')));
      if (roster.length === 0) throw new BadRequestException('This class has no students');
      const batchId = randomUUID();
      // The fee's head (by its title) names the fee account it is collected into.
      const head = findHead(await headsOf(tx, p.tenantId), body.title);
      const made = await tx
        .insert(feeInvoices)
        .values(roster.map((s) => ({ tenantId: p.tenantId, studentId: s.id, sectionId: section.id, batchId, title: body.title, amountPaise: body.amountPaise, dueOn: body.dueOn, createdBy: p.userId, feeAccountId: head?.feeAccountId ?? null })))
        .returning({ id: feeInvoices.id });
      // On the accrual basis the charge is booked now, under its head.
      if (made.length && (await accrues(tx, made[0].id))) {
        const day = await feeToday(tx);
        for (const m of made) {
          await ensureLines(tx, m.id);
          await syncAccruals(tx, { tenantId: p.tenantId, userId: p.userId }, m.id, day);
        }
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.issued', subjectType: 'fee_batch', subjectId: batchId, data: { ...body, students: roster.length } });
      await this.notifications.feeIssued(tx, { batchId, title: body.title, amountPaise: body.amountPaise, dueOn: body.dueOn, studentIds: roster.map((s) => s.id) });
      return { batchId, invoices: roster.length };
    });
  }

  @Get('invoices')
  @Auth('user', FEE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('sectionId') sectionId?: string, @Query('status') status?: string) {
    if (sectionId && !z.uuid().safeParse(sectionId).success) throw new BadRequestException('Bad sectionId');
    const st = z.enum(['due', 'paid', 'cancelled']).optional().safeParse(status || undefined);
    if (!st.success) throw new BadRequestException('Bad status');
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: feeInvoices.id,
          title: feeInvoices.title,
          amountPaise: feeInvoices.amountPaise,
          paidPaise: feeInvoices.paidPaise,
          dueOn: feeInvoices.dueOn,
          status: feeInvoices.status,
          student: { id: students.id, fullName: students.fullName, rollNo: students.rollNo },
          className: sections.displayName,
        })
        .from(feeInvoices)
        .innerJoin(students, eq(students.id, feeInvoices.studentId))
        .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
        .where(and(sectionId ? eq(feeInvoices.sectionId, sectionId) : undefined, st.data ? eq(feeInvoices.status, st.data) : undefined))
        .orderBy(asc(feeInvoices.dueOn), ...naturalAsc(sections.displayName), asc(students.rollNo))
        .limit(2000),
    );
  }

  /** Totals per class for the accounts dashboard. */
  @Get('summary')
  @Auth('user', FEE_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => feeSummary(tx));
  }

  /** Paid receipts of the last few months (newest first): the monthly collection chart and recent receipts. */
  @Get('payments')
  @Auth('user', FEE_ROLES)
  payments(@CurrentPrincipal() p: UserPrincipal, @Query('months') months?: string) {
    const m = Math.min(24, Math.max(1, Number(months ?? 6) || 6));
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: feePayments.id,
          receiptNo: feePayments.receiptNo,
          amountPaise: feePayments.amountPaise,
          method: feePayments.method,
          paidAt: feePayments.paidAt,
          student: { id: students.id, fullName: students.fullName, rollNo: students.rollNo },
          className: sections.displayName,
        })
        .from(feePayments)
        .innerJoin(feeInvoices, eq(feeInvoices.id, feePayments.invoiceId))
        .innerJoin(students, eq(students.id, feePayments.studentId))
        .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
        .where(and(eq(feePayments.status, 'paid'), gte(feePayments.paidAt, sql`date_trunc('month', now()) - (${m - 1} || ' months')::interval`)))
        .orderBy(desc(feePayments.paidAt))
        .limit(5000),
    );
  }

  /** Reminds the families of these students about everything still due (once a day per student). */
  @Post('reminders')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  remind(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RemindBody)) body: z.infer<typeof RemindBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
      const today = localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date;
      const due = await tx
        .select({ studentId: feeInvoices.studentId, balance: sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::int`, dueOn: feeInvoices.dueOn })
        .from(feeInvoices)
        .where(and(eq(feeInvoices.status, 'due'), inArray(feeInvoices.studentId, [...new Set(body.studentIds)])));
      const per = new Map<string, { balancePaise: number; dueOn: string; invoices: number }>();
      for (const d of due) {
        const cur = per.get(d.studentId) ?? { balancePaise: 0, dueOn: d.dueOn, invoices: 0 };
        per.set(d.studentId, { balancePaise: cur.balancePaise + d.balance, dueOn: d.dueOn < cur.dueOn ? d.dueOn : cur.dueOn, invoices: cur.invoices + 1 });
      }
      for (const [studentId, r] of per) await this.notifications.feeReminder(tx, { studentId, balancePaise: r.balancePaise, dueOn: r.dueOn, day: today });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.reminded', subjectType: 'fee_reminder', subjectId: randomUUID(), data: { students: per.size } });
      return { reminded: per.size, skipped: new Set(body.studentIds).size - per.size };
    });
  }

  @Post('invoices/:id/cancel')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id));
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.paidPaise > 0) throw new BadRequestException('Money has been received against this invoice; it cannot be cancelled');
      await tx.update(feeInvoices).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(feeInvoices.id, id));
      // On the accrual basis what was booked for it is reversed.
      await syncAccruals(tx, { tenantId: p.tenantId, userId: p.userId }, id, await feeToday(tx), { note: 'Invoice cancelled' });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.cancelled', subjectType: 'fee_invoice', subjectId: id });
      return { id, status: 'cancelled' };
    });
  }

  /** A payment taken at the fees counter (cash, cheque, bank transfer, UPI to the college). */
  @Post('invoices/:id/payments')
  @Auth('user', FEE_ROLES)
  counter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CounterBody)) body: z.infer<typeof CounterBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const inv = await this.openInvoice(tx, id);
      if (body.amountPaise > inv.amountPaise - inv.paidPaise) throw new BadRequestException('That is more than the balance due');
      const [pay] = await tx
        .insert(feePayments)
        .values({ tenantId: p.tenantId, invoiceId: id, studentId: inv.studentId, amountPaise: body.amountPaise, method: body.method, status: 'created', reference: body.reference, recordedBy: p.userId })
        .returning();
      await this.fees.markPaid(tx, pay.id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.counter_payment', subjectType: 'fee_payment', subjectId: pay.id });
      return this.fees.receipt(tx, p, pay.id);
    });
  }

  /** A student's invoices and payments: for the family, the student, and the accounts office. */
  @Get('students/:id')
  @Auth('user')
  student(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.fees.assertCanSee(tx, p, studentId);
      const invoices = await tx
        .select({ id: feeInvoices.id, batchId: feeInvoices.batchId, title: feeInvoices.title, amountPaise: feeInvoices.amountPaise, paidPaise: feeInvoices.paidPaise, dueOn: feeInvoices.dueOn, status: feeInvoices.status })
        .from(feeInvoices)
        .where(and(eq(feeInvoices.studentId, studentId), ne(feeInvoices.status, 'cancelled')))
        .orderBy(desc(feeInvoices.dueOn));
      const payments = await tx
        .select({
          id: feePayments.id,
          invoiceId: feePayments.invoiceId,
          title: feeInvoices.title,
          amountPaise: feePayments.amountPaise,
          method: feePayments.method,
          reference: sql<string | null>`coalesce(${feePayments.reference}, ${feePayments.providerPaymentId})`,
          receiptNo: feePayments.receiptNo,
          paidAt: feePayments.paidAt,
        })
        .from(feePayments)
        .innerJoin(feeInvoices, eq(feeInvoices.id, feePayments.invoiceId))
        .where(and(eq(feePayments.studentId, studentId), eq(feePayments.status, 'paid')))
        .orderBy(desc(feePayments.paidAt));
      const duePaise = invoices.filter((i) => i.status === 'due').reduce((s, i) => s + i.amountPaise - i.paidPaise, 0);
      // Invoices of a fee account with its own gateway say which one the app opens.
      const own = await tx.select({ id: feeInvoices.id, a: feeInvoices.feeAccountId }).from(feeInvoices).where(and(eq(feeInvoices.studentId, studentId), eq(feeInvoices.status, 'due'), sql`${feeInvoices.feeAccountId} is not null`));
      const names = new Map<string, string | null>();
      for (const o of own) if (!names.has(o.a!)) names.set(o.a!, await this.gateway.availableName(tx, o.a));
      const accountOf = new Map(own.map((o) => [o.id, o.a!]));
      const s = await settingsOf(tx, p.tenantId);
      // On instalments: what is due now, so the apps can offer "pay this instalment".
      const dueNow = await this.flow.dueNowOf(tx, invoices.filter((i) => i.status === 'due'));
      return {
        duePaise,
        onlinePayments: await this.gateway.availableName(tx),
        online: { allowPartial: s.online.allowPartial !== false, minPartPaise: Math.round((s.online.minPartRupees ?? 0) * 100) },
        invoices: invoices.map((i) => ({ ...i, ...(accountOf.has(i.id) ? { onlinePayments: names.get(accountOf.get(i.id)!) ?? null } : {}), ...(dueNow.has(i.id) ? { dueNowPaise: dueNow.get(i.id) } : {}) })),
        payments,
      };
    });
  }

  /** Starts an online payment: creates the gateway order the app's checkout opens. */
  @Post('invoices/:id/checkout')
  @Auth('user')
  async checkout(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CheckoutBody)) body: z.infer<typeof CheckoutBody>) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      // Fees go to the fee account's own gateway (else the institution's); without one, only the counter.
      if (!(await this.gateway.availableName(tx))) {
        const [inv] = await tx.select({ a: feeInvoices.feeAccountId }).from(feeInvoices).where(eq(feeInvoices.id, id));
        if (!inv?.a || !(await this.gateway.availableName(tx, inv.a))) throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
      }
      const inv = await this.openInvoice(tx, id);
      await this.fees.assertCanSee(tx, p, inv.studentId);
    });
    return this.flow.startCheckout(p.tenantId, p.userId, id, { amountPaise: body.amountPaise, returnUrl: body.returnUrl });
  }

  /**
   * Asks the gateway about a payment still pending (the app calls it when a hosted checkout or the Cashfree SDK
   * returns); credits it when the gateway says it is paid.
   */
  @Post('payments/:id/refresh')
  @HttpCode(200)
  @Auth('user')
  async refresh(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const studentId = await this.flow.studentOf(tx, id);
      if (!studentId) throw new NotFoundException('Payment not found');
      await this.fees.assertCanSee(tx, p, studentId);
    });
    const r = await this.flow.refresh(p.tenantId, id);
    if (r.status !== 'paid') return { paymentId: id, status: r.status };
    return { paymentId: id, status: 'paid', receipt: await this.db.withTenant(p.tenantId, (tx) => this.fees.receipt(tx, p, id)) };
  }

  /** The app reports the checkout result; the gateway's signature proves it. */
  @Post('payments/:id/confirm')
  @HttpCode(200)
  @Auth('user')
  confirm(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConfirmBody)) body: z.infer<typeof ConfirmBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, id));
      if (!pay || pay.method !== 'online') throw new NotFoundException('Payment not found');
      await this.fees.assertCanSee(tx, p, pay.studentId);
      if (pay.status !== 'paid') {
        // Signed with the key secret of the account the order was made with.
        const provider = await this.gateway.forAccountId(tx, pay.gatewayAccountId);
        if (!pay.providerOrderId || !provider || !provider.verifyPayment(pay.providerOrderId, body.providerPaymentId, body.signature, body.fields)) {
          throw new ForbiddenException('The payment could not be verified');
        }
        await this.fees.markPaid(tx, id, { providerPaymentId: body.providerPaymentId });
      }
      return this.fees.receipt(tx, p, id);
    });
  }

  @Get('payments/:id/receipt')
  @Auth('user')
  receipt(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.fees.receipt(tx, p, id));
  }

  /**
   * The gateway's server-to-server notice, in case the app never confirmed (closed, offline).
   * Public, authenticated by the signature over the raw body with the institution's own webhook
   * secret. Each institution pastes its URL (with its slug) into its Razorpay dashboard.
   */
  @Post('webhooks/razorpay/:tenantSlug')
  @HttpCode(200)
  async tenantWebhook(@Param('tenantSlug') slug: string, @Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string, @Headers('x-razorpay-event-id') eventId?: string) {
    const tenant = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('Not found');
    if (!req.rawBody || !signature) throw new UnauthorizedException('Bad signature');
    // Checked with each of the institution's Razorpay accounts (the default and any fee account's own); each event once.
    const r = await this.flow.webhook(tenant.id, 'razorpay', req.rawBody, { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId });
    if (!r.ok) throw new UnauthorizedException('Bad signature');
    const entity = this.paymentEntity(req);
    // Not a fee: it may be a canteen wallet top-up or an admission application fee (RLS keeps it to this institution).
    if (r.outcome === 'unknown_order' && entity) await this.db.withTenant(tenant.id, async (tx) => (await this.walletTopups.creditByOrder(tx, entity)) || (await this.applicationFees.creditByOrder(tx, entity)));
    return { ok: true, outcome: r.outcome };
  }

  /**
   * The webhook URL from before institutions had their own accounts. The order names the
   * institution, whose webhook secret must have signed the body. Unknown orders are acknowledged
   * (another environment) so they are not retried.
   */
  @Post('webhooks/razorpay')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
    const entity = this.paymentEntity(req);
    const found = entity ? await this.lookups.tenantForPaymentOrder(entity.order_id) : undefined;
    if (!found) return { ok: true }; // nothing to do, so nothing to verify
    await this.db.withTenant(found.tenantId, async (tx) => {
      this.assertSigned(await this.gateway.forTenant(tx), req, signature);
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, found.paymentId));
      await this.credit(tx, pay, entity!);
    });
    return { ok: true };
  }

  /**
   * PayU's server-to-server notice (and its success/failure return post): a form whose `hash`
   * field, computed with the institution's own salt, proves it. Public, like the Razorpay one.
   */
  @Post('webhooks/payu/:tenantSlug')
  @HttpCode(200)
  async payuWebhook(@Param('tenantSlug') slug: string, @Req() req: RawBodyRequest<Request>) {
    const tenant = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('Not found');
    if (!req.rawBody) throw new UnauthorizedException('Bad signature');
    const r = await this.flow.webhook(tenant.id, 'payu', req.rawBody, {});
    if (!r.ok) throw new UnauthorizedException('Bad signature');
    return { ok: true, outcome: r.outcome };
  }

  /**
   * Cashfree (x-webhook-signature over the timestamp and body), Easebuzz (the reverse hash in the form) and CCAvenue
   * (encResp, which only the working key decrypts): the server-to-server notice of each institution's own account.
   */
  @Post('webhooks/:provider/:tenantSlug')
  @HttpCode(200)
  async gatewayWebhook(@Param('provider') provider: string, @Param('tenantSlug') slug: string, @Req() req: RawBodyRequest<Request>) {
    if (!['cashfree', 'easebuzz', 'ccavenue'].includes(provider)) throw new NotFoundException('Not found');
    const tenant = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant || !req.rawBody) throw new NotFoundException('Not found');
    const r = await this.flow.webhook(tenant.id, provider, req.rawBody, { 'x-webhook-signature': req.header('x-webhook-signature'), 'x-webhook-timestamp': req.header('x-webhook-timestamp') });
    if (!r.ok) throw new UnauthorizedException('Bad signature');
    return { ok: true, outcome: r.outcome };
  }

  /**
   * Where a hosted checkout (PayU, Easebuzz, CCAvenue) sends the payer's browser back: the post is checked like the
   * webhook (so the payment is credited even if the webhook is late) and a page tells the payer to return to the app.
   */
  @Post('gateway-return/:provider/:tenantSlug')
  @HttpCode(200)
  async gatewayReturn(@Param('provider') provider: string, @Param('tenantSlug') slug: string, @Req() req: RawBodyRequest<Request>, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!['payu', 'easebuzz', 'ccavenue', 'razorpay'].includes(provider)) return RETURN_PAGE(false);
    const tenant = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant || !req.rawBody) return RETURN_PAGE(false);
    // Razorpay's web checkout posts the payment id, order id and signature (HMAC of order|payment with the key secret).
    if (provider === 'razorpay') {
      const f = Object.fromEntries(new URLSearchParams(req.rawBody.toString('utf8'))) as Record<string, string>;
      if (!f.razorpay_order_id || !f.razorpay_payment_id || !f.razorpay_signature) return RETURN_PAGE(false);
      return RETURN_PAGE(await this.flow.confirmByOrder(tenant.id, f.razorpay_order_id.slice(0, 100), f.razorpay_payment_id.slice(0, 100), f.razorpay_signature.slice(0, 200)));
    }
    const r = await this.flow.webhook(tenant.id, provider, req.rawBody, {});
    return RETURN_PAGE(r.ok && ['credited', 'already_paid', 'duplicate'].includes(r.outcome));
  }

  /** Cashfree sends the browser back with only the order id: the gateway is asked (with the account's keys) and the page says how it went. */
  @Get('gateway-return/cashfree/:tenantSlug')
  async cashfreeReturn(@Param('tenantSlug') slug: string, @Query('order_id') orderId: string | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const tenant = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    const pay = tenant && orderId && /^[A-Za-z0-9_-]{1,64}$/.test(orderId) ? await this.flow.paymentOfOrder(tenant.id, orderId) : null;
    if (!tenant || !pay) return RETURN_PAGE(false);
    return RETURN_PAGE((await this.flow.refresh(tenant.id, pay)).status === 'paid');
  }

  private paymentEntity(req: Request) {
    const event = req.body as { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; status: string } } } };
    const entity = event?.payload?.payment?.entity;
    return entity && typeof entity.order_id === 'string' && ['payment.captured', 'order.paid'].includes(event.event ?? '') ? entity : undefined;
  }

  private assertSigned(provider: PaymentProvider | null, req: RawBodyRequest<Request>, signature?: string) {
    if (!provider || !req.rawBody || !signature || !provider.verifyWebhook(req.rawBody, signature)) throw new UnauthorizedException('Bad signature');
  }

  private async credit(tx: Tx, pay: typeof feePayments.$inferSelect, entity: { id: string; amount: number }) {
    if (pay.amountPaise + pay.conveniencePaise !== entity.amount) {
      this.log.error(`Webhook amount ${entity.amount} does not match payment ${pay.id} (${pay.amountPaise})`);
      return;
    }
    await this.fees.markPaid(tx, pay.id, { providerPaymentId: entity.id });
  }

  private async openInvoice(tx: Tx, id: string) {
    const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id));
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'due') throw new BadRequestException(inv.status === 'paid' ? 'This fee is already paid' : 'This fee was cancelled');
    return inv;
  }
}


/** Billed, collected and overdue totals per class. */
export async function feeSummary(tx: Tx) {
  const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
  const today = localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date;
  const rows = await tx
    .select({
      sectionId: sections.id,
      className: sections.displayName,
      billedPaise: sql<number>`sum(${feeInvoices.amountPaise})::bigint`.mapWith(Number),
      collectedPaise: sql<number>`sum(${feeInvoices.paidPaise})::bigint`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${feeInvoices.status} = 'due' and ${feeInvoices.dueOn} < ${today})::int`,
      overduePaise: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}) filter (where ${feeInvoices.status} = 'due' and ${feeInvoices.dueOn} < ${today}), 0)::bigint`.mapWith(Number),
      open: sql<number>`count(*) filter (where ${feeInvoices.status} = 'due')::int`,
    })
    .from(feeInvoices)
    .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
    .where(ne(feeInvoices.status, 'cancelled'))
    .groupBy(sections.id, sections.displayName)
    .orderBy(...naturalAsc(sections.displayName));
  const total = (k: 'billedPaise' | 'collectedPaise' | 'overdue' | 'overduePaise' | 'open') => rows.reduce((s, r) => s + Number(r[k]), 0);
  return {
    billedPaise: total('billedPaise'),
    collectedPaise: total('collectedPaise'),
    outstandingPaise: Math.max(0, total('billedPaise') - total('collectedPaise')),
    overdueInvoices: total('overdue'),
    overduePaise: total('overduePaise'),
    openInvoices: total('open'),
    classes: rows.map((r) => ({ ...r, outstandingPaise: Math.max(0, r.billedPaise - r.collectedPaise) })),
  };
}
