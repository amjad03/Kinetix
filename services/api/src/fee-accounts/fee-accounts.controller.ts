import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { accountByCode, postVoucher } from '../books/books.service.js';
import { audit } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { acctPeriodCloses, acctVoucherRequests, feeAccountsSettings, feeCashClosings, feeCheques, feeConcessions, feeRefundRequests, feeWriteOffs } from '../db/schema-fee-accounts.js';
import { feeStructures } from '../db/schema-g1.js';
import { feeInvoices, feePayments, students, tenants } from '../db/schema.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { issueRefund } from '../finance/finance.controller.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { chequeNext, concessionAmount, denominationTotal, periodClosable, SERIES_KEYS, seriesProblem, type ChequeAction } from './fee-accounts.logic.js';
import { approverIds, assertPeriodOpen, deskTexts, nextNumber, settingsOf } from './fee-accounts.service.js';

const HEADS: RoleName[] = ['principal', 'tenant_admin'];
const Decide = z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().trim().max(500).default('') }).refine((b) => b.decision === 'approve' || b.comment.length >= 3, { message: 'Say why it is rejected', path: ['comment'] });
const Item = z.object({ head: z.string().trim().min(1).max(80), amountPaise: Paise });
const StructureBody = z.object({ name: z.string().trim().min(2).max(120), academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27'), campusId: z.uuid().nullish(), programId: z.uuid().nullish(), items: z.array(Item).min(1).max(40), dueInDays: z.number().int().min(0).max(365).default(30) });
const ConcessionBody = z
  .object({ studentId: z.uuid(), invoiceId: z.uuid().nullish(), kind: z.enum(['concession', 'scholarship', 'sponsor', 'sibling', 'staff_ward', 'merit']), sponsorName: z.string().trim().max(120).nullish(), percent: z.number().int().min(1).max(100).nullish(), amountPaise: Paise.nullish(), reason: z.string().trim().min(3).max(300) })
  .refine((b) => b.percent != null || (b.amountPaise ?? 0) > 0, { message: 'Give a percent or an amount', path: ['amountPaise'] })
  .refine((b) => b.percent == null || b.invoiceId, { message: 'A percent needs an invoice', path: ['invoiceId'] });
const ChequeBody = z.object({ paymentId: z.uuid(), chequeNo: z.string().trim().min(3).max(20), bankName: z.string().trim().min(2).max(80), chequeDate: Day });
const ChequeStep = z.object({ on: Day, reason: z.string().trim().max(200).optional(), chargePaise: Paise.default(0) });
const RefundBody = z.object({ paymentId: z.uuid(), amountPaise: Paise.min(100), reason: z.string().trim().min(3).max(300) });
const PayBody = z.object({ mode: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'original_method']), reference: z.string().trim().max(80).default('') });
const WriteOffBody = z.object({ invoiceId: z.uuid(), amountPaise: Paise.min(100), reason: z.string().trim().min(3).max(300) });
const VLine = z.object({ accountId: z.uuid(), debitPaise: Paise.default(0), creditPaise: Paise.default(0) });
const VoucherBody = z.object({ type: z.enum(['receipt', 'payment', 'journal', 'contra']), date: Day, narration: z.string().trim().max(300).default(''), lines: z.array(VLine).min(2).max(40) });
const ClosingBody = z.object({ date: Day, denominations: z.record(z.string(), z.number().int().min(0).max(100000)), note: z.string().trim().max(300).default('') });
const PeriodBody = z.object({ note: z.string().trim().max(300).default('') });
const SeriesZ = z.object({ prefix: z.string().max(30), next: z.number().int().min(1), pad: z.number().int().min(1).max(10), suffix: z.string().max(20).optional() });
const SettingsBody = z.object({
  series: z.record(z.enum(SERIES_KEYS as [string, ...string[]]), SeriesZ).optional(),
  feeHeads: z.array(z.object({ code: z.string().trim().regex(/^[A-Z0-9]{2,6}$/, 'Codes are 2 to 6 capital letters or digits'), name: z.string().trim().min(2).max(60), gstRate: z.number().min(0).max(28), accountCode: z.string().trim().min(1).max(12) })).max(60).optional(),
  paymentModes: z.array(z.object({ mode: z.enum(['cash', 'cheque', 'dd', 'online', 'bank_transfer', 'upi']), enabled: z.boolean(), accountCode: z.string().trim().min(1).max(12) })).max(10).optional(),
  gateway: z.enum(['razorpay', 'payu', 'none']).optional(),
  mappings: z.record(z.string(), z.string().trim().min(1).max(12)).optional(),
  approvals: z.record(z.string(), z.union([z.number().min(0), z.boolean()])).optional(),
});

/**
 * The fees and accounts desk's workflows: fee structures go draft → approval → publish; concessions, refunds,
 * write-offs and vouchers wait for an approver (never the person who asked); cheques move received → deposited →
 * cleared or bounced; cashiers close the day and a second person verifies the count; months are closed.
 */
@Controller('v1/fee-accounts')
export class FeeAccountsController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  private log(tx: Tx, p: UserPrincipal, action: string, subjectType: string, subjectId: string, data?: unknown) {
    return audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action, subjectType, subjectId, data });
  }

  /** Approvers are the given roles, and never the person who raised the request. */
  private assertDecider(p: UserPrincipal, requestedBy: string | null, roles: RoleName[]) {
    if (!p.roles.some((r) => roles.includes(r))) throw new ForbiddenException('You cannot approve this');
    if (requestedBy && requestedBy === p.userId) throw new ForbiddenException('You cannot approve your own request');
  }

  private async askApprovers(tx: Tx, roles: RoleName[], what: string, number: string, id: string, except: string) {
    const ids = (await approverIds(tx, roles)).filter((u) => u !== except);
    await this.notifications.notifyUsers(tx, ids, { kind: 'task', text: deskTexts.approvalNeeded(what, number), data: { id, kind: what }, dedupeKey: `fee-desk:${id}` });
  }

  // ---- Settings ------------------------------------------------------------------------------------

  @Get('settings')
  @Auth('user', FEE_ROLES)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => settingsOf(tx, p.tenantId));
  }

  @Put('settings')
  @Auth('user', HEADS.concat('accountant'))
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = await settingsOf(tx, p.tenantId);
      for (const s of Object.values(b.series ?? {})) {
        const problem = seriesProblem(s);
        if (problem) throw new BadRequestException(problem);
      }
      if (b.feeHeads && new Set(b.feeHeads.map((h) => h.code)).size !== b.feeHeads.length) throw new BadRequestException('Each fee head needs its own code');
      const [row] = await tx
        .update(feeAccountsSettings)
        .set({ series: { ...cur.series, ...(b.series ?? {}) }, feeHeads: b.feeHeads ?? cur.feeHeads, paymentModes: b.paymentModes ?? cur.paymentModes, gateway: b.gateway ?? cur.gateway, mappings: { ...cur.mappings, ...(b.mappings ?? {}) }, approvals: { ...cur.approvals, ...(b.approvals ?? {}) }, updatedBy: p.userId, updatedAt: new Date() })
        .where(eq(feeAccountsSettings.id, cur.id))
        .returning();
      await this.log(tx, p, 'fee_accounts.settings_saved', 'fee_accounts_settings', row.id, { sections: Object.keys(b) });
      return row;
    });
  }

  // ---- Fee structures: draft → pending → approved → published ---------------------------------------

  @Post('structures')
  @Auth('user', FEE_ROLES)
  createStructure(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(StructureBody)) b: z.infer<typeof StructureBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(feeStructures).values({ tenantId: p.tenantId, name: b.name, academicYear: b.academicYear, campusId: b.campusId ?? null, programId: b.programId ?? null, items: b.items, dueInDays: b.dueInDays, status: 'draft', active: false, createdBy: p.userId }).returning();
      await this.log(tx, p, 'fee_structure.created', 'fee_structure', row.id, { name: b.name });
      return row;
    });
  }

  @Patch('structures/:id')
  @Auth('user', FEE_ROLES)
  editStructure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StructureBody.partial())) b: Partial<z.infer<typeof StructureBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fs] = await tx.select().from(feeStructures).where(eq(feeStructures.id, id)).for('update');
      if (!fs) throw new NotFoundException('Fee structure not found');
      if (!['draft', 'rejected'].includes(fs.status)) throw new ConflictException('Only a draft or a rejected structure can be changed');
      const [row] = await tx.update(feeStructures).set({ ...b, status: 'draft' }).where(eq(feeStructures.id, id)).returning();
      await this.log(tx, p, 'fee_structure.edited', 'fee_structure', id, { fields: Object.keys(b) });
      return row;
    });
  }

  @Post('structures/:id/submit')
  @Auth('user', FEE_ROLES)
  submitStructure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fs] = await tx.select().from(feeStructures).where(eq(feeStructures.id, id)).for('update');
      if (!fs) throw new NotFoundException('Fee structure not found');
      if (!['draft', 'rejected'].includes(fs.status)) throw new ConflictException('This structure has already been sent');
      const [row] = await tx.update(feeStructures).set({ status: 'pending', submittedBy: p.userId, submittedAt: new Date(), decisionNote: null }).where(eq(feeStructures.id, id)).returning();
      await this.log(tx, p, 'fee_structure.submitted', 'fee_structure', id);
      await this.askApprovers(tx, HEADS, 'Fee structure', fs.name, id, p.userId);
      return row;
    });
  }

  @Post('structures/:id/decide')
  @Auth('user', HEADS)
  decideStructure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fs] = await tx.select().from(feeStructures).where(eq(feeStructures.id, id)).for('update');
      if (!fs) throw new NotFoundException('Fee structure not found');
      if (fs.status !== 'pending') throw new ConflictException('This structure is not waiting for approval');
      this.assertDecider(p, fs.submittedBy, HEADS);
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      const [row] = await tx.update(feeStructures).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(feeStructures.id, id)).returning();
      await this.log(tx, p, `fee_structure.${status}`, 'fee_structure', id, { comment: b.comment });
      if (fs.submittedBy) await this.notifications.notifyUsers(tx, [fs.submittedBy], { kind: 'task', text: deskTexts.decided('Fee structure', fs.name, status === 'approved'), data: { id, status }, dedupeKey: `fee-desk:${id}:${status}` });
      return row;
    });
  }

  @Post('structures/:id/publish')
  @Auth('user', FEE_ROLES)
  publishStructure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fs] = await tx.select().from(feeStructures).where(eq(feeStructures.id, id)).for('update');
      if (!fs) throw new NotFoundException('Fee structure not found');
      if (fs.status !== 'approved') throw new ConflictException('Only an approved structure can be published');
      const [row] = await tx.update(feeStructures).set({ status: 'published', active: true, publishedAt: new Date() }).where(eq(feeStructures.id, id)).returning();
      await this.log(tx, p, 'fee_structure.published', 'fee_structure', id);
      return row;
    });
  }

  // ---- Concessions, scholarships and sponsorships ------------------------------------------------------

  @Post('concessions')
  @Auth('user', FEE_ROLES)
  requestConcession(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConcessionBody)) b: z.infer<typeof ConcessionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId));
      if (!st) throw new NotFoundException('Student not found');
      let amount = b.amountPaise ?? 0;
      if (b.invoiceId) {
        const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, b.invoiceId));
        if (!inv || inv.studentId !== b.studentId) throw new NotFoundException('Invoice not found for this student');
        if (inv.status !== 'due') throw new ConflictException('That invoice is not open');
        amount = concessionAmount({ invoiceAmountPaise: inv.amountPaise, outstandingPaise: inv.amountPaise - inv.paidPaise, percent: b.percent, amountPaise: b.amountPaise });
        if (amount <= 0) throw new BadRequestException('Nothing is left to concede on that invoice');
      }
      const today = await this.today(tx);
      const number = await nextNumber(tx, p.tenantId, 'concession', today);
      const [row] = await tx.insert(feeConcessions).values({ tenantId: p.tenantId, number, studentId: b.studentId, invoiceId: b.invoiceId ?? null, kind: b.kind, sponsorName: b.sponsorName ?? null, percent: b.percent ?? null, amountPaise: amount, reason: b.reason, requestedBy: p.userId }).returning();
      await this.log(tx, p, 'concession.requested', 'fee_concession', row.id, { number, amountPaise: amount });
      await this.askApprovers(tx, HEADS, 'Concession', number, row.id, p.userId);
      return row;
    });
  }

  @Post('concessions/:id/decide')
  @Auth('user', FEE_ROLES)
  decideConcession(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(feeConcessions).where(eq(feeConcessions.id, id)).for('update');
      if (!c) throw new NotFoundException('Concession not found');
      if (c.status !== 'pending') throw new ConflictException('This concession has been decided');
      const limit = Number((await settingsOf(tx, p.tenantId)).approvals.concessionLimitRupees ?? 0) * 100;
      this.assertDecider(p, c.requestedBy, c.amountPaise <= limit ? FEE_ROLES : HEADS);
      let applied = 0;
      if (b.decision === 'approve' && c.invoiceId) {
        const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, c.invoiceId)).for('update');
        applied = Math.min(c.amountPaise, Math.max(0, inv.amountPaise - inv.paidPaise));
        const amount = inv.amountPaise - applied;
        await tx.update(feeInvoices).set({ amountPaise: amount, status: inv.paidPaise >= amount ? 'paid' : inv.status, updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
      }
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      const [row] = await tx.update(feeConcessions).set({ status, appliedPaise: applied, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(feeConcessions.id, id)).returning();
      await this.log(tx, p, `concession.${status}`, 'fee_concession', id, { appliedPaise: applied, comment: b.comment });
      await this.notifications.feeDeskNotice(tx, c.studentId, { text: deskTexts.concession(status === 'approved', applied || c.amountPaise), data: { concessionId: id, studentId: c.studentId }, dedupeKey: `concession:${id}` });
      return row;
    });
  }

  // ---- Cheques and DDs ---------------------------------------------------------------------------------

  @Post('cheques')
  @Auth('user', FEE_ROLES)
  registerCheque(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ChequeBody)) b: z.infer<typeof ChequeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, b.paymentId));
      if (!pay || pay.status !== 'paid' || pay.method !== 'cheque') throw new NotFoundException('Paid cheque payment not found');
      const [dupe] = await tx.select({ id: feeCheques.id }).from(feeCheques).where(eq(feeCheques.paymentId, pay.id));
      if (dupe) throw new ConflictException('This cheque is already in the register');
      const [row] = await tx.insert(feeCheques).values({ tenantId: p.tenantId, paymentId: pay.id, studentId: pay.studentId, chequeNo: b.chequeNo, bankName: b.bankName, chequeDate: b.chequeDate, amountPaise: pay.amountPaise, createdBy: p.userId }).returning();
      await this.log(tx, p, 'cheque.received', 'fee_cheque', row.id, { chequeNo: b.chequeNo });
      return row;
    });
  }

  @Post('cheques/:id/:action')
  @Auth('user', FEE_ROLES)
  chequeStep(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string, @Body(new ZodBody(ChequeStep)) b: z.infer<typeof ChequeStep>) {
    if (!['deposit', 'clear', 'bounce'].includes(action)) throw new NotFoundException();
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [chq] = await tx.select().from(feeCheques).where(eq(feeCheques.id, id)).for('update');
      if (!chq) throw new NotFoundException('Cheque not found');
      const to = chequeNext(chq.status, action as ChequeAction);
      if (!to) throw new ConflictException(`A ${chq.status} cheque cannot be marked that way`);
      if (to === 'deposited') await tx.update(feeCheques).set({ status: to, depositedOn: b.on }).where(eq(feeCheques.id, id));
      if (to === 'cleared') await tx.update(feeCheques).set({ status: to, clearedOn: b.on }).where(eq(feeCheques.id, id));
      if (to === 'bounced') {
        if (!b.reason || b.reason.length < 3) throw new BadRequestException('Give the bank’s reason');
        const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, chq.paymentId)).for('update');
        const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, pay.invoiceId)).for('update');
        // The receipt stops counting: the invoice is due again and the books reverse the receipt.
        await tx.update(feePayments).set({ status: 'failed' }).where(eq(feePayments.id, pay.id));
        await tx.update(feeInvoices).set({ paidPaise: sql`${feeInvoices.paidPaise} - ${pay.amountPaise}`, status: 'due', updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
        const s = await settingsOf(tx, p.tenantId);
        const [income, bank] = [await accountByCode(tx, s.mappings.feeIncome), await accountByCode(tx, s.mappings.bank)];
        await assertPeriodOpen(tx, b.on);
        await postVoucher(tx, { tenantId: p.tenantId, userId: p.userId }, { type: 'payment', date: b.on, narration: `Cheque ${chq.chequeNo} returned: ${b.reason}`, lines: [{ accountId: income.id, debitPaise: pay.amountPaise, creditPaise: 0 }, { accountId: bank.id, debitPaise: 0, creditPaise: pay.amountPaise }], sourceType: 'cheque_bounce', sourceId: chq.id });
        let chargeInvoiceId: string | null = null;
        if (b.chargePaise > 0) {
          const [charge] = await tx.insert(feeInvoices).values({ tenantId: p.tenantId, studentId: chq.studentId, sectionId: inv.sectionId, batchId: randomUUID(), title: `Cheque return charge (${chq.chequeNo})`, amountPaise: b.chargePaise, dueOn: b.on, createdBy: p.userId }).returning();
          chargeInvoiceId = charge.id;
        }
        await tx.update(feeCheques).set({ status: to, bouncedOn: b.on, bounceReason: b.reason, bounceChargePaise: b.chargePaise, chargeInvoiceId }).where(eq(feeCheques.id, id));
        await this.notifications.feeDeskNotice(tx, chq.studentId, { text: deskTexts.chequeBounced(chq.chequeNo, chq.amountPaise, b.chargePaise), data: { chequeId: id, studentId: chq.studentId }, dedupeKey: `cheque-bounce:${id}` });
      }
      await this.log(tx, p, `cheque.${to}`, 'fee_cheque', id, { on: b.on, reason: b.reason });
      const [row] = await tx.select().from(feeCheques).where(eq(feeCheques.id, id));
      return row;
    });
  }

  // ---- Refunds: requested → approved → paid --------------------------------------------------------------

  @Post('refunds')
  @Auth('user', FEE_ROLES)
  requestRefund(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RefundBody)) b: z.infer<typeof RefundBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pay] = await tx.select().from(feePayments).where(eq(feePayments.id, b.paymentId));
      if (!pay || pay.status !== 'paid') throw new NotFoundException('Paid payment not found');
      const [open] = await tx.select({ t: sql<number>`coalesce(sum(${feeRefundRequests.amountPaise}), 0)::bigint` }).from(feeRefundRequests).where(and(eq(feeRefundRequests.paymentId, pay.id), sql`${feeRefundRequests.status} in ('requested', 'approved', 'paid')`));
      if (Number(open.t) + b.amountPaise > pay.amountPaise) throw new BadRequestException('That is more than was paid');
      const number = await nextNumber(tx, p.tenantId, 'refund', await this.today(tx));
      const [row] = await tx.insert(feeRefundRequests).values({ tenantId: p.tenantId, number, paymentId: pay.id, invoiceId: pay.invoiceId, studentId: pay.studentId, amountPaise: b.amountPaise, reason: b.reason, requestedBy: p.userId }).returning();
      await this.log(tx, p, 'refund.requested', 'fee_refund_request', row.id, { number, amountPaise: b.amountPaise });
      await this.askApprovers(tx, HEADS, 'Refund', number, row.id, p.userId);
      return row;
    });
  }

  @Post('refunds/:id/decide')
  @Auth('user', HEADS)
  decideRefund(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.decideSimple(p, id, b, feeRefundRequests, 'requested', 'fee_refund_request', 'refund', HEADS);
  }

  @Post('refunds/:id/pay')
  @Auth('user', FEE_ROLES)
  payRefund(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PayBody)) b: z.infer<typeof PayBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeRefundRequests).where(eq(feeRefundRequests.id, id)).for('update');
      if (!r) throw new NotFoundException('Refund not found');
      if (r.status !== 'approved') throw new ConflictException('Only an approved refund can be paid');
      await assertPeriodOpen(tx, await this.today(tx));
      const refund = await issueRefund(tx, { tenantId: p.tenantId, userId: p.userId }, { paymentId: r.paymentId, amountPaise: r.amountPaise, reason: `${r.number}: ${r.reason}` });
      const [row] = await tx.update(feeRefundRequests).set({ status: 'paid', payMode: b.mode, payReference: b.reference || null, refundId: refund.id, paidBy: p.userId, paidAt: new Date() }).where(eq(feeRefundRequests.id, id)).returning();
      await this.log(tx, p, 'refund.paid', 'fee_refund_request', id, { mode: b.mode, reference: b.reference });
      await this.notifications.feeDeskNotice(tx, r.studentId, { text: deskTexts.refundPaid(r.amountPaise, b.mode.replace('_', ' ')), data: { refundId: id, studentId: r.studentId }, dedupeKey: `refund-paid:${id}` });
      return row;
    });
  }

  // ---- Write-offs --------------------------------------------------------------------------------------

  @Post('write-offs')
  @Auth('user', FEE_ROLES)
  requestWriteOff(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(WriteOffBody)) b: z.infer<typeof WriteOffBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, b.invoiceId));
      if (!inv || inv.status !== 'due') throw new NotFoundException('Open invoice not found');
      if (b.amountPaise > inv.amountPaise - inv.paidPaise) throw new BadRequestException('That is more than is due');
      const number = await nextNumber(tx, p.tenantId, 'writeOff', await this.today(tx));
      const [row] = await tx.insert(feeWriteOffs).values({ tenantId: p.tenantId, number, invoiceId: inv.id, studentId: inv.studentId, amountPaise: b.amountPaise, reason: b.reason, requestedBy: p.userId }).returning();
      await this.log(tx, p, 'write_off.requested', 'fee_write_off', row.id, { number, amountPaise: b.amountPaise });
      await this.askApprovers(tx, HEADS, 'Write-off', number, row.id, p.userId);
      return row;
    });
  }

  /** Approving a write-off lowers what the invoice asks for. The books are kept on receipts, so nothing is posted. */
  @Post('write-offs/:id/decide')
  @Auth('user', HEADS)
  decideWriteOff(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [w] = await tx.select().from(feeWriteOffs).where(eq(feeWriteOffs.id, id)).for('update');
      if (!w) throw new NotFoundException('Write-off not found');
      if (w.status !== 'pending') throw new ConflictException('This write-off has been decided');
      this.assertDecider(p, w.requestedBy, HEADS);
      if (b.decision === 'approve') {
        const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, w.invoiceId)).for('update');
        if (w.amountPaise > inv.amountPaise - inv.paidPaise) throw new ConflictException('The invoice no longer has that much due');
        const amount = inv.amountPaise - w.amountPaise;
        await tx.update(feeInvoices).set({ amountPaise: amount, status: inv.paidPaise >= amount ? 'paid' : 'due', updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
      }
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      const [row] = await tx.update(feeWriteOffs).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(feeWriteOffs.id, id)).returning();
      await this.log(tx, p, `write_off.${status}`, 'fee_write_off', id, { comment: b.comment });
      return row;
    });
  }

  // ---- Vouchers that need approval --------------------------------------------------------------------

  @Post('vouchers')
  @Auth('user', FEE_ROLES)
  requestVoucher(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VoucherBody)) b: z.infer<typeof VoucherBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const debit = b.lines.reduce((a, l) => a + l.debitPaise, 0);
      const credit = b.lines.reduce((a, l) => a + l.creditPaise, 0);
      if (debit !== credit || debit === 0) throw new BadRequestException('Debits and credits must be equal and more than nothing');
      await assertPeriodOpen(tx, b.date);
      const number = await nextNumber(tx, p.tenantId, 'voucher', b.date);
      const [row] = await tx.insert(acctVoucherRequests).values({ tenantId: p.tenantId, number, voucherType: b.type, voucherDate: b.date, narration: b.narration, lines: b.lines, amountPaise: debit, requestedBy: p.userId }).returning();
      await this.log(tx, p, 'voucher.requested', 'acct_voucher_request', row.id, { number, amountPaise: debit });
      await this.askApprovers(tx, FEE_ROLES, 'Voucher', number, row.id, p.userId);
      return row;
    });
  }

  @Post('vouchers/:id/decide')
  @Auth('user', FEE_ROLES)
  decideVoucher(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(acctVoucherRequests).where(eq(acctVoucherRequests.id, id)).for('update');
      if (!v) throw new NotFoundException('Voucher not found');
      if (v.status !== 'pending') throw new ConflictException('This voucher has been decided');
      this.assertDecider(p, v.requestedBy, FEE_ROLES);
      let voucherId: string | null = null;
      if (b.decision === 'approve') {
        await assertPeriodOpen(tx, v.voucherDate);
        const posted = await postVoucher(tx, { tenantId: p.tenantId, userId: p.userId }, { type: v.voucherType as 'journal', date: v.voucherDate, narration: v.narration, lines: v.lines, sourceType: 'voucher_request', sourceId: v.id });
        voucherId = posted.id;
      }
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      const [row] = await tx.update(acctVoucherRequests).set({ status, voucherId, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(acctVoucherRequests.id, id)).returning();
      await this.log(tx, p, `voucher.${status}`, 'acct_voucher_request', id, { comment: b.comment, voucherId });
      return row;
    });
  }

  // ---- Day-end cash closing ------------------------------------------------------------------------

  /** What the system says this cashier took in cash on a day. */
  @Get('closings/expected')
  @Auth('user', FEE_ROLES)
  expected(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.expectedCash(tx, p.userId, Day.parse(date ?? (await this.today(tx)))));
  }

  private async expectedCash(tx: Tx, userId: string, date: string) {
    const [r] = await tx.execute<{ total: string; n: number }>(sql`select coalesce(sum(amount_paise), 0)::bigint as total, count(*)::int as n from fee_payments
      where status = 'paid' and method = 'cash' and recorded_by = ${userId}::uuid and (paid_at at time zone 'Asia/Kolkata')::date = ${date}::date`).then((x) => x.rows);
    return { date, systemPaise: Number(r.total), receiptCount: r.n };
  }

  @Post('closings')
  @Auth('user', FEE_ROLES)
  closeDay(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ClosingBody)) b: z.infer<typeof ClosingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let counted: number;
      try {
        counted = denominationTotal(b.denominations);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      const exp = await this.expectedCash(tx, p.userId, b.date);
      const [dupe] = await tx.select({ id: feeCashClosings.id, status: feeCashClosings.status }).from(feeCashClosings).where(and(eq(feeCashClosings.closingDate, b.date), eq(feeCashClosings.cashierId, p.userId)));
      if (dupe && dupe.status !== 'rejected') throw new ConflictException('You have already closed this day');
      if (dupe) await tx.delete(feeCashClosings).where(eq(feeCashClosings.id, dupe.id));
      const [row] = await tx.insert(feeCashClosings).values({ tenantId: p.tenantId, closingDate: b.date, cashierId: p.userId, systemPaise: exp.systemPaise, countedPaise: counted, receiptCount: exp.receiptCount, denominations: b.denominations, note: b.note }).returning();
      await this.log(tx, p, 'cash_closing.submitted', 'fee_cash_closing', row.id, { systemPaise: exp.systemPaise, countedPaise: counted });
      await this.askApprovers(tx, FEE_ROLES, 'Cash closing', b.date, row.id, p.userId);
      return row;
    });
  }

  @Post('closings/:id/decide')
  @Auth('user', FEE_ROLES)
  verifyDay(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(feeCashClosings).where(eq(feeCashClosings.id, id)).for('update');
      if (!c) throw new NotFoundException('Closing not found');
      if (c.status !== 'submitted') throw new ConflictException('This closing has been checked');
      this.assertDecider(p, c.cashierId, FEE_ROLES);
      if (b.decision === 'approve' && c.countedPaise !== c.systemPaise && b.comment.length < 3) throw new BadRequestException('The count differs from the system; note why before verifying');
      const status = b.decision === 'approve' ? 'verified' : 'rejected';
      const [row] = await tx.update(feeCashClosings).set({ status, verifiedBy: p.userId, verifiedAt: new Date(), decisionNote: b.comment || null }).where(eq(feeCashClosings.id, id)).returning();
      await this.log(tx, p, `cash_closing.${status}`, 'fee_cash_closing', id, { comment: b.comment });
      return row;
    });
  }

  // ---- Month close ---------------------------------------------------------------------------------

  @Get('periods')
  @Auth('user', FEE_ROLES)
  periods(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(acctPeriodCloses).orderBy(sql`${acctPeriodCloses.period} desc`));
  }

  @Post('periods/:period/close')
  @Auth('user', FEE_ROLES)
  closePeriod(@CurrentPrincipal() p: UserPrincipal, @Param('period') period: string, @Body(new ZodBody(PeriodBody)) b: z.infer<typeof PeriodBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!periodClosable(period, await this.today(tx))) throw new BadRequestException('Only a month that has ended can be closed');
      const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(feeCashClosings).where(and(eq(feeCashClosings.status, 'submitted'), sql`to_char(${feeCashClosings.closingDate}, 'YYYY-MM') = ${period}`));
      if (open.n > 0) throw new ConflictException('Verify the cash closings of that month first');
      const [pending] = await tx.select({ n: sql<number>`count(*)::int` }).from(acctVoucherRequests).where(and(eq(acctVoucherRequests.status, 'pending'), sql`to_char(${acctVoucherRequests.voucherDate}, 'YYYY-MM') = ${period}`));
      if (pending.n > 0) throw new ConflictException('Decide the vouchers waiting in that month first');
      const [row] = await tx.insert(acctPeriodCloses).values({ tenantId: p.tenantId, period, closedBy: p.userId, note: b.note }).onConflictDoNothing().returning();
      if (!row) throw new ConflictException('That month is already closed');
      await this.log(tx, p, 'period.closed', 'acct_period', row.id, { period });
      return row;
    });
  }

  /** Refund and its siblings share this: approve or reject a waiting request, never your own. */
  private decideSimple(p: UserPrincipal, id: string, b: z.infer<typeof Decide>, table: typeof feeRefundRequests, waiting: string, subject: string, action: string, roles: RoleName[]) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(table).where(eq(table.id, id)).for('update');
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== waiting) throw new ConflictException('This request has been decided');
      this.assertDecider(p, r.requestedBy, roles);
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      const [row] = await tx.update(table).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(table.id, id)).returning();
      await this.log(tx, p, `${action}.${status}`, subject, id, { comment: b.comment });
      if (r.requestedBy) await this.notifications.notifyUsers(tx, [r.requestedBy], { kind: 'task', text: deskTexts.decided('Refund', r.number, status === 'approved'), data: { id, status }, dedupeKey: `fee-desk:${id}:${status}` });
      return row;
    });
  }
}
