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
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Request } from 'express';
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
import { FEE_ROLES, FeesService } from './fees.service.js';
import { PaymentProvider } from './payment-provider.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Paise = z.number().int().min(100).max(100_000_000_00);

const IssueBody = z.object({ sectionId: z.uuid(), title: z.string().trim().min(1).max(120), amountPaise: Paise, dueOn: Day });
const CounterBody = z.object({
  amountPaise: Paise,
  method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi']),
  reference: z.string().trim().max(100).optional(),
});
const CheckoutBody = z.object({ amountPaise: Paise.optional() });
const ConfirmBody = z.object({ providerPaymentId: z.string().min(1).max(100), signature: z.string().min(1).max(200) });

/**
 * Fees: the accounts office issues fees to a class and records counter payments; families pay
 * online in the app (Razorpay) and get numbered receipts. Amounts are integer paise.
 */
@Controller('v1/fees')
export class FeesController {
  private readonly log = new Logger(FeesController.name);

  constructor(
    private readonly db: DbService,
    private readonly fees: FeesService,
    private readonly provider: PaymentProvider,
    private readonly notifications: NotificationsService,
    private readonly lookups: SystemLookups,
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
      await tx.insert(feeInvoices).values(
        roster.map((s) => ({ tenantId: p.tenantId, studentId: s.id, sectionId: section.id, batchId, title: body.title, amountPaise: body.amountPaise, dueOn: body.dueOn, createdBy: p.userId })),
      );
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
        .orderBy(asc(feeInvoices.dueOn), asc(sections.displayName), asc(students.rollNo))
        .limit(2000),
    );
  }

  /** Totals per class for the accounts dashboard. */
  @Get('summary')
  @Auth('user', FEE_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
      const today = localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').date;
      const rows = await tx
        .select({
          sectionId: sections.id,
          className: sections.displayName,
          billedPaise: sql<number>`sum(${feeInvoices.amountPaise})::bigint`.mapWith(Number),
          collectedPaise: sql<number>`sum(${feeInvoices.paidPaise})::bigint`.mapWith(Number),
          overdue: sql<number>`count(*) filter (where ${feeInvoices.status} = 'due' and ${feeInvoices.dueOn} < ${today})::int`,
          open: sql<number>`count(*) filter (where ${feeInvoices.status} = 'due')::int`,
        })
        .from(feeInvoices)
        .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
        .where(ne(feeInvoices.status, 'cancelled'))
        .groupBy(sections.id, sections.displayName)
        .orderBy(asc(sections.displayName));
      const total = (k: 'billedPaise' | 'collectedPaise' | 'overdue' | 'open') => rows.reduce((s, r) => s + Number(r[k]), 0);
      return {
        billedPaise: total('billedPaise'),
        collectedPaise: total('collectedPaise'),
        outstandingPaise: Math.max(0, total('billedPaise') - total('collectedPaise')),
        overdueInvoices: total('overdue'),
        openInvoices: total('open'),
        classes: rows.map((r) => ({ ...r, outstandingPaise: Math.max(0, r.billedPaise - r.collectedPaise) })),
      };
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
      return { duePaise, onlinePayments: this.provider.configured ? this.provider.name : null, invoices, payments };
    });
  }

  /** Starts an online payment: creates the gateway order the app's checkout opens. */
  @Post('invoices/:id/checkout')
  @Auth('user')
  async checkout(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CheckoutBody)) body: z.infer<typeof CheckoutBody>) {
    if (!this.provider.configured) throw new ServiceUnavailableException('Online payment is not available yet. Please pay at the fees counter.');
    const { inv, amountPaise, payer } = await this.db.withTenant(p.tenantId, async (tx) => {
      const inv = await this.openInvoice(tx, id);
      await this.fees.assertCanSee(tx, p, inv.studentId);
      const balance = inv.amountPaise - inv.paidPaise;
      const amountPaise = body.amountPaise ?? balance;
      if (amountPaise > balance) throw new BadRequestException('That is more than the balance due');
      const [payer] = await tx.select({ fullName: users.fullName, email: users.email, phone: users.phone }).from(users).where(eq(users.id, p.userId));
      return { inv, amountPaise, payer };
    });
    // The gateway call happens outside the transaction.
    const order = await this.provider.createOrder({ amountPaise, receipt: `inv_${id.slice(0, 8)}`, notes: { invoiceId: id, tenantId: p.tenantId } });
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx
        .insert(feePayments)
        .values({ tenantId: p.tenantId, invoiceId: id, studentId: inv.studentId, amountPaise, method: 'online', status: 'created', provider: this.provider.name, providerOrderId: order.orderId, payerUserId: p.userId })
        .returning();
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
      return {
        paymentId: pay.id,
        provider: this.provider.name,
        keyId: this.provider.keyId,
        orderId: order.orderId,
        amountPaise,
        currency: 'INR',
        name: tenant?.name ?? 'KINETIX',
        description: inv.title,
        prefill: { name: payer?.fullName ?? '', email: payer?.email ?? '', contact: payer?.phone ?? '' },
      };
    });
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
        if (!pay.providerOrderId || !this.provider.verifyPayment(pay.providerOrderId, body.providerPaymentId, body.signature)) {
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
   * Public, authenticated by the signature over the raw body.
   */
  @Post('webhooks/razorpay')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
    if (!req.rawBody || !signature || !this.provider.verifyWebhook(req.rawBody, signature)) throw new UnauthorizedException('Bad signature');
    const event = req.body as { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; status: string } } } };
    const entity = event.payload?.payment?.entity;
    if (!entity || !['payment.captured', 'order.paid'].includes(event.event ?? '')) return { ok: true };
    const found = await this.lookups.tenantForPaymentOrder(entity.order_id);
    if (!found) return { ok: true }; // not ours (another environment): acknowledge so it is not retried
    await this.db.withTenant(found.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, found.paymentId));
      if (pay.amountPaise !== entity.amount) {
        this.log.error(`Webhook amount ${entity.amount} does not match payment ${pay.id} (${pay.amountPaise})`);
        return;
      }
      await this.fees.markPaid(tx, pay.id, { providerPaymentId: entity.id });
    });
    return { ok: true };
  }

  private async openInvoice(tx: Tx, id: string) {
    const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, id));
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'due') throw new BadRequestException(inv.status === 'paid' ? 'This fee is already paid' : 'This fee was cancelled');
    return inv;
  }
}

