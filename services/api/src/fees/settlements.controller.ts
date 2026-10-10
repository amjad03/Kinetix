import { BadGatewayException, BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feePayments, feeRefunds, settlementBatches, settlementLines } from '../db/schema.js';
import { issueRefund } from '../finance/finance.controller.js';
import { FEE_ROLES } from './fees.service.js';
import { PAYMENTS_NOT_CONFIGURED, PaymentGateway } from './payment-gateway.service.js';
import { type GatewaySettlement, type GatewaySettlementLine, rupeesToPaise } from './payment-provider.js';

const Provider = z.enum(['razorpay', 'payu']);
const LineBody = z.object({
  kind: z.enum(['payment', 'refund']).default('payment'),
  providerPaymentId: z.string().trim().min(1).max(100),
  providerOrderId: z.string().trim().max(100).nullish(),
  amountPaise: Paise,
  feePaise: z.number().int().min(0).default(0),
  netPaise: z.number().int().optional(),
});
const ImportBody = z
  .object({
    provider: Provider,
    reference: z.string().trim().min(1).max(100),
    settlementDate: Day,
    lines: z.array(LineBody).max(5000).optional(),
    /** A settlement report as CSV: payment_id, order_id, type, amount, fee, net (rupees; the first row names the columns). */
    csv: z.string().max(2_000_000).optional(),
  })
  .refine((b) => b.lines?.length || b.csv?.trim(), 'Give the settlement lines or the report file');
const FetchBody = z.object({ day: Day });
const ResolveBody = z.object({ action: z.enum(['accept', 'link']), feePaymentId: z.uuid().optional(), note: z.string().trim().max(300).default('') });
const GatewayRefundBody = z.object({ amountPaise: Paise.min(100), reason: z.string().trim().min(3).max(200) });

/** Reads a settlement report: header row, then one payment or refund per row. */
export function parseSettlementCsv(text: string): z.infer<typeof LineBody>[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map((r) => r.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
  if (rows.length < 2) throw new BadRequestException('The file has no rows');
  const head = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iPay = col('paymentid', 'entityid', 'mihpayid', 'payuid');
  const iAmt = col('amount');
  if (iPay < 0 || iAmt < 0) throw new BadRequestException('The file needs payment_id and amount columns');
  const iOrder = col('orderid', 'txnid');
  const iType = col('type', 'kind');
  const iFee = col('fee', 'fees', 'servicefee');
  const iNet = col('net', 'netamount');
  return rows.slice(1).map((r, n) => {
    const amount = rupeesToPaise(r[iAmt]);
    if (!r[iPay] || !Number.isFinite(amount) || amount <= 0) throw new BadRequestException(`Row ${n + 2}: payment id and a positive amount are needed`);
    const fee = iFee >= 0 && r[iFee] ? rupeesToPaise(r[iFee]) : 0;
    return {
      kind: iType >= 0 && /refund/i.test(r[iType]) ? ('refund' as const) : ('payment' as const),
      providerPaymentId: r[iPay],
      providerOrderId: iOrder >= 0 ? r[iOrder] || null : null,
      amountPaise: amount,
      feePaise: fee,
      netPaise: iNet >= 0 && r[iNet] ? rupeesToPaise(r[iNet]) : undefined,
    };
  });
}

/**
 * Settlement reconciliation: the gateway's payout report (a file the accountant imports, or the
 * gateway's own settlement API) is matched line by line to fee receipts. Anything that does not
 * match goes to the exceptions queue for the accountant to accept or link by hand.
 */
@Controller('v1/fees/settlements')
export class SettlementsController {
  constructor(
    private readonly db: DbService,
    private readonly gateway: PaymentGateway,
  ) {}

  @Post('import')
  @Auth('user', FEE_ROLES)
  import(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    const lines = b.lines?.length ? b.lines : parseSettlementCsv(b.csv!);
    return this.db.withTenant(p.tenantId, (tx) => this.store(tx, p, { provider: b.provider, source: b.csv ? 'file' : 'manual', reference: b.reference, settlementDate: b.settlementDate, lines }));
  }

  /** Pulls the day's settlement from the gateway's API. */
  @Post('fetch')
  @Auth('user', FEE_ROLES)
  async fetch(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FetchBody)) b: z.infer<typeof FetchBody>) {
    const provider = await this.db.withTenant(p.tenantId, (tx) => this.gateway.forTenant(tx));
    if (!provider || provider.name === 'demo') throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
    let got: GatewaySettlement | null;
    try {
      got = await provider.fetchSettlement(b.day);
    } catch (e) {
      throw new BadGatewayException((e as Error).message.slice(0, 200));
    }
    if (!got) return { imported: false, message: 'The gateway reported no settlement for that day' };
    const lines: GatewaySettlementLine[] = got.lines;
    return this.db.withTenant(p.tenantId, async (tx) => ({ imported: true, ...(await this.store(tx, p, { provider: provider.name as 'razorpay' | 'payu', source: 'api', reference: got.reference, settlementDate: got.settlementDate, lines })) }));
  }

  @Get()
  @Auth('user', FEE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(settlementBatches).orderBy(desc(settlementBatches.settlementDate), desc(settlementBatches.createdAt)).limit(200));
  }

  /** Lines still needing a decision. */
  @Get('exceptions')
  @Auth('user', FEE_ROLES)
  exceptions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ line: settlementLines, reference: settlementBatches.reference, provider: settlementBatches.provider })
        .from(settlementLines)
        .innerJoin(settlementBatches, eq(settlementBatches.id, settlementLines.batchId))
        .where(eq(settlementLines.status, 'exception'))
        .orderBy(desc(settlementLines.createdAt))
        .limit(500),
    );
  }

  /** Online payments marked paid here that no settlement has covered yet. */
  @Get('unsettled')
  @Auth('user', FEE_ROLES)
  unsettled(@CurrentPrincipal() p: UserPrincipal, @Query('olderThanDays') days?: string) {
    const d = Math.min(60, Math.max(0, Number(days ?? 2) || 0));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const covered = tx.select({ id: settlementLines.feePaymentId }).from(settlementLines).where(and(isNotNull(settlementLines.feePaymentId), inArray(settlementLines.status, ['matched', 'resolved'])));
      return tx
        .select({ id: feePayments.id, receiptNo: feePayments.receiptNo, amountPaise: feePayments.amountPaise, provider: feePayments.provider, providerPaymentId: feePayments.providerPaymentId, paidAt: feePayments.paidAt })
        .from(feePayments)
        .where(and(eq(feePayments.status, 'paid'), eq(feePayments.method, 'online'), notInArray(feePayments.id, covered), sql`${feePayments.paidAt} < now() - (${d} || ' days')::interval`))
        .orderBy(desc(feePayments.paidAt))
        .limit(500);
    });
  }

  @Get(':id')
  @Auth('user', FEE_ROLES)
  detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [batch] = await tx.select().from(settlementBatches).where(eq(settlementBatches.id, id));
      if (!batch) throw new NotFoundException('Settlement not found');
      return { batch, lines: await tx.select().from(settlementLines).where(eq(settlementLines.batchId, id)) };
    });
  }

  @Post('lines/:id/resolve')
  @Auth('user', FEE_ROLES)
  resolve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ResolveBody)) b: z.infer<typeof ResolveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [line] = await tx.select().from(settlementLines).where(eq(settlementLines.id, id)).for('update');
      if (!line || line.status !== 'exception') throw new NotFoundException('That line is not waiting for a decision');
      let feePaymentId = line.feePaymentId;
      if (b.action === 'link') {
        if (!b.feePaymentId) throw new BadRequestException('Choose the receipt to link');
        const [pay] = await tx.select({ id: feePayments.id }).from(feePayments).where(eq(feePayments.id, b.feePaymentId));
        if (!pay) throw new NotFoundException('Receipt not found');
        feePaymentId = pay.id;
      }
      const [row] = await tx.update(settlementLines).set({ status: 'resolved', feePaymentId, resolvedBy: p.userId, resolvedAt: new Date(), note: b.note || null }).where(eq(settlementLines.id, id)).returning();
      await tx.update(settlementBatches).set({ exceptionCount: sql`greatest(${settlementBatches.exceptionCount} - 1, 0)` }).where(eq(settlementBatches.id, line.batchId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'settlement.line_resolved', subjectType: 'settlement_line', subjectId: id, data: { action: b.action, reason: line.exceptionReason } });
      return row;
    });
  }

  /** Refunds an online payment at the gateway, then records the refund against the invoice. */
  @Post('/payments/:id/gateway-refund')
  @Auth('user', FEE_ROLES)
  async gatewayRefund(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(GatewayRefundBody)) b: z.infer<typeof GatewayRefundBody>) {
    const { provider, pay } = await this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, id));
      if (!pay || pay.status !== 'paid' || pay.method !== 'online' || !pay.providerPaymentId) throw new NotFoundException('Paid online payment not found');
      const [done] = await tx.select({ t: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)::bigint` }).from(feeRefunds).where(eq(feeRefunds.paymentId, id));
      if (Number(done.t) + b.amountPaise > pay.amountPaise) throw new BadRequestException('That is more than was paid');
      const provider = await this.gateway.forTenant(tx);
      if (!provider || provider.name !== pay.provider) throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
      return { provider, pay };
    });
    // The gateway call happens outside the transaction.
    let refundId: string;
    try {
      ({ refundId } = await provider.refund({ providerPaymentId: pay.providerPaymentId!, amountPaise: b.amountPaise, refundRef: `rf_${id.slice(0, 8)}_${Date.now().toString(36)}` }));
    } catch (e) {
      throw new BadGatewayException((e as Error).message.slice(0, 200));
    }
    return this.db.withTenant(p.tenantId, async (tx) => {
      const row = await issueRefund(tx, { tenantId: p.tenantId, userId: p.userId }, { paymentId: id, amountPaise: b.amountPaise, reason: b.reason });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.gateway_refund', subjectType: 'fee_payment', subjectId: id, data: { provider: provider.name, refundId, amountPaise: b.amountPaise } });
      return { ...row, gatewayRefundId: refundId };
    });
  }

  private async store(tx: Tx, p: UserPrincipal, b: { provider: 'razorpay' | 'payu'; source: string; reference: string; settlementDate: string; lines: (Omit<GatewaySettlementLine, 'netPaise' | 'providerOrderId'> & { providerOrderId?: string | null; netPaise?: number })[] }) {
    const [dupe] = await tx.select({ id: settlementBatches.id }).from(settlementBatches).where(and(eq(settlementBatches.provider, b.provider), eq(settlementBatches.reference, b.reference)));
    if (dupe) throw new BadRequestException('That settlement was already imported');
    const lines = b.lines.map((l) => ({ ...l, kind: l.kind ?? 'payment', feePaise: l.feePaise ?? 0, netPaise: l.netPaise ?? (l.kind === 'refund' ? -l.amountPaise : l.amountPaise - (l.feePaise ?? 0)) }));
    const gross = lines.reduce((s, l) => s + (l.kind === 'refund' ? -l.amountPaise : l.amountPaise), 0);
    const fee = lines.reduce((s, l) => s + l.feePaise, 0);
    const [batch] = await tx
      .insert(settlementBatches)
      .values({ tenantId: p.tenantId, provider: b.provider, source: b.source, reference: b.reference, settlementDate: b.settlementDate, grossPaise: gross, feePaise: fee, netPaise: lines.reduce((s, l) => s + l.netPaise, 0), lineCount: lines.length, importedBy: p.userId })
      .returning();
    let exceptions = 0;
    for (const l of lines) {
      const m = await this.match(tx, batch.id, l);
      if (m.status === 'exception') exceptions++;
      await tx.insert(settlementLines).values({ tenantId: p.tenantId, batchId: batch.id, kind: l.kind, providerPaymentId: l.providerPaymentId, providerOrderId: l.providerOrderId ?? null, amountPaise: l.amountPaise, feePaise: l.feePaise, netPaise: l.netPaise, ...m });
    }
    await tx.update(settlementBatches).set({ exceptionCount: exceptions }).where(eq(settlementBatches.id, batch.id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'settlement.imported', subjectType: 'settlement_batch', subjectId: batch.id, data: { provider: b.provider, source: b.source, lines: lines.length, exceptions } });
    return { batchId: batch.id, lines: lines.length, matched: lines.length - exceptions, exceptions };
  }

  /** The receipt a line belongs to, or why none could be found. */
  private async match(tx: Tx, batchId: string, l: { kind: string; providerPaymentId: string; providerOrderId?: string | null; amountPaise: number }): Promise<{ status: string; feePaymentId: string | null; exceptionReason: string | null }> {
    const [pay] = await tx.select().from(feePayments).where(l.providerOrderId ? sql`${feePayments.providerPaymentId} = ${l.providerPaymentId} or ${feePayments.providerOrderId} = ${l.providerOrderId}` : eq(feePayments.providerPaymentId, l.providerPaymentId));
    const exception = (reason: string, id: string | null = pay?.id ?? null) => ({ status: 'exception', feePaymentId: id, exceptionReason: reason });
    if (!pay) return exception('unknown_payment', null);
    if (l.kind === 'refund') {
      const [r] = await tx.select({ t: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)::bigint` }).from(feeRefunds).where(eq(feeRefunds.paymentId, pay.id));
      return Number(r.t) >= l.amountPaise ? { status: 'matched', feePaymentId: pay.id, exceptionReason: null } : exception('refund_not_recorded');
    }
    const [seen] = await tx.select({ id: settlementLines.id }).from(settlementLines).where(and(eq(settlementLines.feePaymentId, pay.id), eq(settlementLines.kind, 'payment'), inArray(settlementLines.status, ['matched', 'resolved'])));
    if (seen) return exception('duplicate');
    if (pay.status !== 'paid') return exception('not_paid_in_kinetix');
    if (pay.amountPaise !== l.amountPaise) return exception('amount_mismatch');
    void batchId;
    return { status: 'matched', feePaymentId: pay.id, exceptionReason: null };
  }
}
