import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { sponsorInvoiceLines, sponsorInvoices, sponsorPayments, sponsors, students, tenants } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { FEE_ROLES, financialYear } from './fees.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Paise = z.number().int().min(100).max(100_000_000_00);

const SponsorBody = z.object({ name: z.string().trim().min(1).max(120), contactName: z.string().trim().max(120).optional(), contactEmail: z.email().max(200).optional(), gstin: z.string().trim().max(20).optional() });
const InvoiceBody = z.object({
  sponsorId: z.uuid(),
  poNumber: z.string().trim().max(60).optional(),
  title: z.string().trim().min(1).max(160),
  dueOn: Day,
  lines: z.array(z.object({ studentId: z.uuid(), description: z.string().trim().min(1).max(160), amountPaise: Paise })).min(1).max(500),
});
const PaymentBody = z.object({
  amountPaise: Paise,
  method: z.enum(['bank_transfer', 'cheque', 'cash', 'upi']),
  reference: z.string().trim().max(100).optional(),
  receivedOn: Day,
});

/**
 * Institution (PO) billing for corporate-sponsored students (PRD section 66): invoices to a sponsor
 * organisation for one or more students, part payments, and the outstanding report. Kept apart from
 * the per-student fee invoices so the family is not billed for what the sponsor pays.
 */
@Controller('v1/fees')
export class SponsorBillingController {
  constructor(
    private readonly db: DbService,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  @Post('sponsors')
  @Auth('user', FEE_ROLES)
  createSponsor(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SponsorBody)) b: z.infer<typeof SponsorBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: sponsors.id }).from(sponsors).where(eq(sponsors.name, b.name));
      if (dup) throw new BadRequestException('A sponsor with that name already exists');
      const [row] = await tx.insert(sponsors).values({ tenantId: p.tenantId, ...b, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.sponsor_created', subjectType: 'sponsor', subjectId: row.id });
      return row;
    });
  }

  @Get('sponsors')
  @Auth('user', FEE_ROLES)
  listSponsors(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(sponsors).orderBy(asc(sponsors.name)));
  }

  /** Raises an invoice to the sponsor for the listed students; the total is the sum of the lines. */
  @Post('sponsor-invoices')
  @Auth('user', FEE_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(InvoiceBody)) b: z.infer<typeof InvoiceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [sp] = await tx.select({ id: sponsors.id }).from(sponsors).where(eq(sponsors.id, b.sponsorId));
      if (!sp) throw new NotFoundException('Sponsor not found');
      const ids = [...new Set(b.lines.map((l) => l.studentId))];
      const found = await tx.select({ id: students.id }).from(students).where(inArray(students.id, ids));
      if (found.length !== ids.length) throw new NotFoundException('A student was not found');
      const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
      const fy = financialYear(localParts(this.clock.now(), tenant?.timezone ?? 'Asia/Kolkata').date);
      // Numbered per financial year from the count so far (serialised by the unique index; a clash retries as a 400).
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(sponsorInvoices).where(sql`${sponsorInvoices.invoiceNo} like ${`SINV/${fy}/%`}`);
      const invoiceNo = `SINV/${fy}/${String(n + 1).padStart(4, '0')}`;
      const total = b.lines.reduce((s, l) => s + l.amountPaise, 0);
      const [inv] = await tx.insert(sponsorInvoices).values({ tenantId: p.tenantId, sponsorId: b.sponsorId, invoiceNo, poNumber: b.poNumber, title: b.title, amountPaise: total, dueOn: b.dueOn, createdBy: p.userId }).returning();
      await tx.insert(sponsorInvoiceLines).values(b.lines.map((l) => ({ tenantId: p.tenantId, invoiceId: inv.id, studentId: l.studentId, description: l.description, amountPaise: l.amountPaise })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.sponsor_invoice_issued', subjectType: 'sponsor_invoice', subjectId: inv.id, data: { invoiceNo, amountPaise: total } });
      return inv;
    });
  }

  @Get('sponsor-invoices')
  @Auth('user', FEE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('sponsorId') sponsorId?: string) {
    const st = z.enum(['open', 'partial', 'paid', 'cancelled']).optional().safeParse(status || undefined);
    if (!st.success) throw new BadRequestException('Bad status');
    if (sponsorId && !z.uuid().safeParse(sponsorId).success) throw new BadRequestException('Bad sponsorId');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const rows = await tx
        .select({ inv: sponsorInvoices, sponsorName: sponsors.name })
        .from(sponsorInvoices)
        .innerJoin(sponsors, eq(sponsors.id, sponsorInvoices.sponsorId))
        .where(and(st.data ? eq(sponsorInvoices.status, st.data) : undefined, sponsorId ? eq(sponsorInvoices.sponsorId, sponsorId) : undefined))
        .orderBy(asc(sponsorInvoices.dueOn), desc(sponsorInvoices.createdAt))
        .limit(1000);
      return rows.map((r) => ({ ...r.inv, sponsorName: r.sponsorName, balancePaise: r.inv.amountPaise - r.inv.paidPaise, overdue: ['open', 'partial'].includes(r.inv.status) && r.inv.dueOn < today }));
    });
  }

  /** Per sponsor: billed, received, outstanding and the overdue part. */
  @Get('sponsor-invoices/outstanding')
  @Auth('user', FEE_ROLES)
  outstanding(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const rows = await tx
        .select({
          sponsorId: sponsors.id,
          sponsorName: sponsors.name,
          invoices: sql<number>`count(*) filter (where ${sponsorInvoices.status} in ('open','partial'))::int`,
          billedPaise: sql<number>`coalesce(sum(${sponsorInvoices.amountPaise}), 0)::bigint`.mapWith(Number),
          paidPaise: sql<number>`coalesce(sum(${sponsorInvoices.paidPaise}), 0)::bigint`.mapWith(Number),
          overduePaise: sql<number>`coalesce(sum(${sponsorInvoices.amountPaise} - ${sponsorInvoices.paidPaise}) filter (where ${sponsorInvoices.status} in ('open','partial') and ${sponsorInvoices.dueOn} < ${today}), 0)::bigint`.mapWith(Number),
        })
        .from(sponsors)
        .innerJoin(sponsorInvoices, and(eq(sponsorInvoices.sponsorId, sponsors.id), sql`${sponsorInvoices.status} <> 'cancelled'`))
        .groupBy(sponsors.id, sponsors.name)
        .orderBy(asc(sponsors.name));
      const sponsorsOut = rows.map((r) => ({ ...r, outstandingPaise: r.billedPaise - r.paidPaise }));
      const sum = (k: 'billedPaise' | 'paidPaise' | 'outstandingPaise' | 'overduePaise') => sponsorsOut.reduce((s, r) => s + r[k], 0);
      return { billedPaise: sum('billedPaise'), paidPaise: sum('paidPaise'), outstandingPaise: sum('outstandingPaise'), overduePaise: sum('overduePaise'), sponsors: sponsorsOut };
    });
  }

  @Get('sponsor-invoices/:id')
  @Auth('user', FEE_ROLES)
  detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const inv = await this.invoice(tx, id);
      const [sp] = await tx.select().from(sponsors).where(eq(sponsors.id, inv.sponsorId));
      const lines = await tx
        .select({ id: sponsorInvoiceLines.id, studentId: sponsorInvoiceLines.studentId, studentName: students.fullName, rollNo: students.rollNo, description: sponsorInvoiceLines.description, amountPaise: sponsorInvoiceLines.amountPaise })
        .from(sponsorInvoiceLines)
        .innerJoin(students, eq(students.id, sponsorInvoiceLines.studentId))
        .where(eq(sponsorInvoiceLines.invoiceId, id));
      const payments = await tx.select().from(sponsorPayments).where(eq(sponsorPayments.invoiceId, id)).orderBy(asc(sponsorPayments.receivedOn), asc(sponsorPayments.createdAt));
      return { ...inv, balancePaise: inv.amountPaise - inv.paidPaise, sponsor: sp, lines, payments };
    });
  }

  /** A part or full payment from the sponsor. */
  @Post('sponsor-invoices/:id/payments')
  @Auth('user', FEE_ROLES)
  pay(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PaymentBody)) b: z.infer<typeof PaymentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(sponsorInvoices).where(eq(sponsorInvoices.id, id)).for('update');
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status === 'paid' || inv.status === 'cancelled') throw new BadRequestException(inv.status === 'paid' ? 'This invoice is already paid' : 'This invoice was cancelled');
      if (b.amountPaise > inv.amountPaise - inv.paidPaise) throw new BadRequestException('That is more than the balance due');
      const [pay] = await tx.insert(sponsorPayments).values({ tenantId: p.tenantId, invoiceId: id, ...b, recordedBy: p.userId }).returning();
      const paid = inv.paidPaise + b.amountPaise;
      const [updated] = await tx.update(sponsorInvoices).set({ paidPaise: paid, status: paid >= inv.amountPaise ? 'paid' : 'partial' }).where(eq(sponsorInvoices.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.sponsor_payment', subjectType: 'sponsor_invoice', subjectId: id, data: { amountPaise: b.amountPaise, reference: b.reference } });
      await this.events.emit(tx, p.tenantId, { type: DomainEvents.SponsorPaymentReceived, aggregateType: 'sponsor_invoice', aggregateId: id, payload: { sponsorId: inv.sponsorId, paymentId: pay.id, amountPaise: b.amountPaise, method: b.method } });
      return { payment: pay, invoice: { ...updated, balancePaise: updated.amountPaise - updated.paidPaise } };
    });
  }

  @Post('sponsor-invoices/:id/cancel')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const inv = await this.invoice(tx, id);
      if (inv.paidPaise > 0) throw new BadRequestException('Money has been received against this invoice; it cannot be cancelled');
      await tx.update(sponsorInvoices).set({ status: 'cancelled' }).where(eq(sponsorInvoices.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'fees.sponsor_invoice_cancelled', subjectType: 'sponsor_invoice', subjectId: id });
      return { id, status: 'cancelled' };
    });
  }

  private async invoice(tx: Tx, id: string) {
    const [inv] = await tx.select().from(sponsorInvoices).where(eq(sponsorInvoices.id, id));
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  private async today(tx: Tx): Promise<string> {
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), tenant?.timezone ?? 'Asia/Kolkata').date;
  }
}
