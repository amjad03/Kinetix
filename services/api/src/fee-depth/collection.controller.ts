import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeCarryForwards, feeChallans, feeGovtScholarships, feeInvoiceLines, feeReceipts, feeReminderRuns } from '../db/schema-fee-depth.js';
import { feeInvoices, feePayments, sections, students, tenants, users } from '../db/schema.js';
import { rupees, rupeeWords, studentBlock } from '../documents/doc-data.js';
import { DocumentEngine } from '../documents/document-engine.service.js';
import { longDate } from '../documents/render.js';
import { chainOf, decideOnChain } from '../fee-accounts/chains.js';
import { assertPeriodOpen, approverIds, deskTexts, nextNumber, settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { fyOf } from '../fee-accounts/fee-accounts.logic.js';
import { parseChallanCsv, rupeesInWords } from '../fees/fee-depth.logic.js';
import { lineState, raiseInvoice, reduceCharge } from '../fees/fee-lines.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { receiptInvoices, reverseReceipt } from '../fees/receipts.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CollectionService } from './collection.service.js';
import { DuesService } from './dues.service.js';
import { feeTexts } from './texts.js';

/** How each payment mode reads on a receipt. */
const MODE_LABEL: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', dd: 'Demand draft', card: 'Card', upi: 'UPI', bank_transfer: 'Bank transfer', online: 'Online', credit: 'Credit adjustment' };

const Mode = z.object({
  method: z.enum(['cash', 'cheque', 'dd', 'card', 'upi', 'bank_transfer']),
  amountPaise: z.number().int().min(1).max(100_000_000_00),
  reference: z.string().trim().max(100).nullish(),
  chequeNo: z.string().trim().min(3).max(20).nullish(),
  bankName: z.string().trim().min(2).max(80).nullish(),
  chequeDate: Day.nullish(),
});
const Alloc = z.object({ invoiceId: z.uuid(), headCode: z.string().trim().min(1).max(12), amountPaise: z.number().int().min(0) });
const CollectBody = z.object({ studentId: z.uuid(), modes: z.array(Mode).min(1).max(6), allocations: z.array(Alloc).max(200).optional(), keepExcess: z.boolean().default(false), note: z.string().trim().max(300).default(''), date: Day.optional() });
const PreviewBody = z.object({ studentId: z.uuid(), amountPaise: z.number().int().min(1), allocations: z.array(Alloc).max(200).optional() });
const Reason = z.object({ reason: z.string().trim().min(3).max(300) });
const Decide = z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().trim().max(500).default('') }).refine((b) => b.decision === 'approve' || b.comment.length >= 3, { message: 'Say why it is rejected', path: ['comment'] });
const ReissueBody = z.object({ modes: z.array(Mode).min(1).max(6).optional(), note: z.string().trim().max(300).default('') });
const ChallanBody = z.object({ studentId: z.uuid(), invoiceIds: z.array(z.uuid()).max(50).optional(), amountPaise: z.number().int().min(100).optional(), bankName: z.string().trim().min(2).max(80), bankAccount: z.string().trim().max(40).default(''), validDays: z.number().int().min(1).max(90).default(15) });
const ReconcileBody = z.object({ csv: z.string().min(10).max(2_000_000) });
const SanctionBody = z.object({ amountPaise: z.number().int().min(1), on: Day });
const ReceiveBody = z.object({ amountPaise: z.number().int().min(1), on: Day, reference: z.string().trim().min(2).max(100) });
const CarryBody = z.object({ fromYear: z.string().regex(/^\d{4}-\d{2}$/), toYear: z.string().regex(/^\d{4}-\d{2}$/), dueOn: Day, studentIds: z.array(z.uuid()).max(5000).optional() });

/**
 * The fees counter and what follows a receipt: search a student, see dues by fee and head, collect in several modes
 * on one receipt, print or download it (duplicates marked), ask to cancel it (approval; the books are reversed), reissue
 * it; bank challans and the bank's paid file; government scholarship money; carrying dues into the next year; paying
 * from advance credit; and the dues check other offices use before a hall ticket, result or TC.
 */
@Controller('v1/fee-collect')
export class CollectionController {
  constructor(
    private readonly db: DbService,
    private readonly collection: CollectionService,
    private readonly duesSvc: DuesService,
    private readonly notifications: NotificationsService,
    private readonly engine: DocumentEngine,
  ) {}

  private async ask(tx: Tx, role: string, what: string, number: string, id: string, except: string) {
    const ids = (await approverIds(tx, [role])).filter((u) => u !== except);
    await this.notifications.notifyUsers(tx, ids, { kind: 'task', text: deskTexts.approvalNeeded(what, number), data: { id, kind: what }, dedupeKey: `fee-desk:${id}:${role}` });
  }

  /** Students by name, roll number or receipt number, with what each owes (the counter's search). */
  @Get('students')
  @Auth('user', FEE_ROLES)
  search(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string) {
    const text = (q ?? '').trim();
    if (text.length < 2) return [];
    return this.db.withTenant(p.tenantId, async (tx) => {
      const like = `%${text.replace(/[%_]/g, '')}%`;
      const viaReceipt = await tx.select({ id: feeReceipts.studentId }).from(feeReceipts).where(ilike(feeReceipts.receiptNo, like)).limit(5);
      return tx
        .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, status: students.status, section: sections.displayName, duePaise: sql<number>`coalesce((select sum(i.amount_paise - i.paid_paise) from fee_invoices i where i.student_id = ${students.id} and i.status = 'due'), 0)::bigint`.mapWith(Number) })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(or(ilike(students.fullName, like), ilike(students.rollNo, like), viaReceipt.length ? inArray(students.id, viaReceipt.map((r) => r.id)) : undefined))
        .orderBy(asc(students.fullName))
        .limit(20);
    });
  }

  /** A student's dues by fee and head, instalments, advance held, recent receipts and whether dues hold anything back. */
  @Get('students/:id')
  @Auth('user', FEE_ROLES)
  student(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.collection.dues(tx, id);
      return { ...d, receipts: await this.collection.recent(tx, { studentId: id, limit: 20 }), blocks: await this.duesSvc.blocks(tx, p.tenantId, id) };
    });
  }

  /** How an amount would be split over the fees and heads (nothing is saved). */
  @Post('preview')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PreviewBody)) b: z.infer<typeof PreviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const plan = await this.collection.plan(tx, b.studentId, b.amountPaise, b.allocations);
      return { allocatedPaise: plan.allocatedPaise, excessPaise: plan.excessPaise, duePaise: plan.duePaise, advancePaise: plan.advancePaise, rows: plan.pieces.map((x) => ({ invoiceId: x.line.invoiceId, headCode: x.line.headCode, head: x.line.headName, balancePaise: x.line.balancePaise, amountPaise: x.paise })) };
    });
  }

  @Post('counter')
  @Auth('user', FEE_ROLES)
  collect(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CollectBody)) b: z.infer<typeof CollectBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.collection.collect(tx, p, b));
  }

  /** Pays open fees from the advance the student holds. */
  @Post('students/:id/from-advance')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  fromAdvance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ amountPaise: z.number().int().min(1).optional() }))) b: { amountPaise?: number }) {
    return this.db.withTenant(p.tenantId, (tx) => this.collection.fromAdvance(tx, p, id, b.amountPaise));
  }

  @Get('receipts/:id')
  @Auth('user', FEE_ROLES)
  receipt(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.collection.view(tx, id));
  }

  /** Counts a print of the receipt; every print after the first is a duplicate and says so. */
  @Post('receipts/:id/print')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  printed(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.update(feeReceipts).set({ printCount: sql`${feeReceipts.printCount} + 1`, lastPrintedAt: new Date() }).where(eq(feeReceipts.id, id)).returning();
      if (!r) throw new NotFoundException('Receipt not found');
      if (r.printCount > 1) await auditUser(tx, p, 'fee_receipt.duplicate_printed', 'fee_receipt', id, { copy: r.printCount });
      return { printCount: r.printCount, duplicate: r.printCount > 1 };
    });
  }

  /**
   * The receipt as a PDF through the document engine (recorded in the register with its QR); printing the same
   * receipt again returns the same record. A cancelled or bounced receipt says so; a copy after the first is counted.
   */
  @Get('receipts/:id/pdf')
  @Auth('user', FEE_ROLES)
  pdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.update(feeReceipts).set({ printCount: sql`${feeReceipts.printCount} + 1`, lastPrintedAt: new Date() }).where(eq(feeReceipts.id, id)).returning();
      if (!r) throw new NotFoundException('Receipt not found');
      const v = await this.collection.view(tx, id);
      const duplicate = r.printCount > 1;
      if (duplicate) await auditUser(tx, p, 'fee_receipt.duplicate_printed', 'fee_receipt', id, { copy: r.printCount });
      const towards = v.items.map((i) => `${i.head} ${rupees(i.amountPaise)}`).join('; ') + (v.advancePaise ? `; Advance ${rupees(v.advancePaise)}` : '');
      const label = v.status === 'cancelled' ? ' (CANCELLED)' : v.status === 'bounced' ? ' (CHEQUE RETURNED)' : '';
      const paidOn = longDate(v.date);
      const lines = v.items.map((i, n) => ({ no: n + 1, head: i.head, amount: rupees(i.amountPaise) }));
      if (v.advancePaise) lines.push({ no: lines.length + 1, head: 'Advance', amount: rupees(v.advancePaise) });
      const data = {
        ...(await studentBlock(tx, v.student.id)),
        receipt: {
          no: `${v.receiptNo}${label}`,
          date: paidOn,
          mode: v.modes.map((m) => MODE_LABEL[m.method] ?? m.method).join(' + '),
          reference: v.modes.map((m) => m.chequeNo ?? m.reference).filter(Boolean).join(', ') || '—',
          amount: rupees(v.totalPaise),
          amountWords: rupeeWords(v.totalPaise),
          balance: rupees(v.balancePaise),
          towards: towards.slice(0, 160),
          period: '',
          receivedBy: 'Accounts office',
          total: rupees(v.totalPaise),
        },
        fee: { lines },
        doc: { issuedOn: paidOn },
      };
      const out = await this.engine.produce(tx, p, {
        docType: 'fee_receipt',
        title: 'Fee Receipt',
        subject: { type: 'student', id: v.student.id, name: v.student.fullName },
        source: { type: 'fee_receipt', id },
        serial: v.receiptNo,
        data,
        keyFields: [{ label: 'Receipt number', value: `${v.receiptNo}${label}` }, { label: 'Received from', value: `${v.student.fullName} (${v.student.rollNo})` }, { label: 'Amount', value: rupees(v.totalPaise) }, { label: 'Paid on', value: paidOn }, { label: 'Towards', value: towards.slice(0, 160) }],
        photo: null,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${v.receiptNo.replace(/\//g, '-')}${duplicate ? '-duplicate' : ''}.pdf"`);
      return new StreamableFile(out.pdf);
    });
  }

  /** Asks to cancel a receipt (wrong student, wrong amount); the receipt-cancel chain decides. Nothing is deleted. */
  @Post('receipts/:id/cancel')
  @Auth('user', FEE_ROLES)
  requestCancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Reason)) b: z.infer<typeof Reason>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeReceipts).where(eq(feeReceipts.id, id)).for('update');
      if (!r) throw new NotFoundException('Receipt not found');
      if (r.status !== 'active') throw new ConflictException(r.status === 'cancel_pending' ? 'Cancelling this receipt is already waiting for approval' : 'This receipt is not active');
      const [row] = await tx.update(feeReceipts).set({ status: 'cancel_pending', cancelReason: b.reason, cancelRequestedBy: p.userId, cancelRequestedAt: new Date() }).where(eq(feeReceipts.id, id)).returning();
      await auditUser(tx, p, 'fee_receipt.cancel_requested', 'fee_receipt', id, { reason: b.reason, receiptNo: r.receiptNo });
      const chain = await chainOf(tx, p.tenantId, 'receiptCancel');
      await this.ask(tx, chain[0].role, 'Receipt cancellation', r.receiptNo, id, p.userId);
      return row;
    });
  }

  @Post('receipts/:id/cancel/decide')
  @Auth('user', FEE_ROLES.concat('hod' as RoleName))
  decideCancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeReceipts).where(eq(feeReceipts.id, id)).for('update');
      if (!r) throw new NotFoundException('Receipt not found');
      if (r.status !== 'cancel_pending') throw new ConflictException('No cancellation is waiting on this receipt');
      // The chain's progress is kept in the audit trail of the receipt.
      const trail = (await tx.execute<{ data: { trail?: unknown } }>(sql`select data from audit_log where subject_type = 'fee_receipt' and subject_id = ${id} and action = 'fee_receipt.cancel_forwarded' order by at desc limit 1`)).rows[0]?.data?.trail as never[] | undefined;
      const level = trail?.length ?? 0;
      const out = await decideOnChain(tx, p, { level, trail: trail ?? [], requestedBy: r.cancelRequestedBy, amountPaise: r.totalPaise }, await chainOf(tx, p.tenantId, 'receiptCancel'), b.decision, b.comment);
      if (out.status === 'pending') {
        await auditUser(tx, p, 'fee_receipt.cancel_forwarded', 'fee_receipt', id, { to: out.nextRole, trail: out.trail });
        await this.ask(tx, out.nextRole!, 'Receipt cancellation', r.receiptNo, id, r.cancelRequestedBy ?? p.userId);
        return { ...r, level: out.level };
      }
      if (out.status === 'rejected') {
        const [row] = await tx.update(feeReceipts).set({ status: 'active' }).where(eq(feeReceipts.id, id)).returning();
        await auditUser(tx, p, 'fee_receipt.cancel_rejected', 'fee_receipt', id, { comment: b.comment, trail: out.trail });
        return row;
      }
      const today = await this.collection.today(tx);
      await assertPeriodOpen(tx, today);
      // Back to active for the reversal, which refuses a receipt already taken back.
      await tx.update(feeReceipts).set({ status: 'active' }).where(eq(feeReceipts.id, id));
      const row = await reverseReceipt(tx, { tenantId: p.tenantId, userId: p.userId }, id, { status: 'cancelled', date: today, reason: r.cancelReason ?? b.comment });
      await auditUser(tx, p, 'fee_receipt.cancelled', 'fee_receipt', id, { comment: b.comment, trail: out.trail, receiptNo: r.receiptNo });
      if (r.cancelRequestedBy) await this.notifications.notifyUsers(tx, [r.cancelRequestedBy], { kind: 'task', text: deskTexts.decided('Receipt cancellation', r.receiptNo, true), data: { id, status: 'cancelled' }, dedupeKey: `fee-desk:${id}:cancelled` });
      await this.notifications.feeDeskNotice(tx, r.studentId, { text: feeTexts.receiptCancelled(r.receiptNo), data: { receiptId: id, studentId: r.studentId }, dedupeKey: `receipt-cancelled:${id}` });
      return row;
    });
  }

  /** Collects a cancelled receipt's fees again under a new number (corrected mode or details), linked to the old one. */
  @Post('receipts/:id/reissue')
  @Auth('user', FEE_ROLES)
  reissue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReissueBody)) b: z.infer<typeof ReissueBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeReceipts).where(eq(feeReceipts.id, id));
      if (!r) throw new NotFoundException('Receipt not found');
      if (r.status !== 'cancelled') throw new ConflictException('Only a cancelled receipt can be reissued');
      const [again] = await tx.select({ id: feeReceipts.id }).from(feeReceipts).where(eq(feeReceipts.reissueOf, id));
      if (again) throw new ConflictException('This receipt has already been reissued');
      const invoices = await receiptInvoices(tx, id);
      const pays = await tx.select().from(feePayments).where(eq(feePayments.receiptId, id));
      const amount = pays.reduce((s, x) => s + x.amountPaise, 0);
      const modes = b.modes ?? r.modes.filter((m) => m.method !== 'credit').map((m) => ({ ...m, method: m.method as z.infer<typeof Mode>['method'] }));
      if (modes.reduce((s, m) => s + m.amountPaise, 0) !== amount + r.advancePaise) throw new BadRequestException(`The modes must add up to ₹${((amount + r.advancePaise) / 100).toLocaleString('en-IN')}, as on the cancelled receipt`);
      const v = await this.collection.collect(tx, p, { studentId: r.studentId, modes, invoiceIds: invoices.map((i) => i.id), keepExcess: r.advancePaise > 0, note: b.note || `Reissue of ${r.receiptNo}`, reissueOf: id });
      await auditUser(tx, p, 'fee_receipt.reissued', 'fee_receipt', id, { newReceiptId: v.id, newReceiptNo: v.receiptNo });
      return v;
    });
  }

  // ---- Bank challans ------------------------------------------------------------------------------

  /** A challan for the student's open fees (or these, or an amount), to pay at the bank before it lapses. */
  @Post('challans')
  @Auth('user', FEE_ROLES)
  challan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ChallanBody)) b: z.infer<typeof ChallanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.collection.dues(tx, b.studentId);
      const invs = b.invoiceIds?.length ? d.invoices.filter((i) => b.invoiceIds!.includes(i.id)) : d.invoices;
      if (!invs.length) throw new BadRequestException('Nothing is due for this student');
      const due = invs.reduce((s, i) => s + i.balancePaise, 0);
      const amount = Math.min(b.amountPaise ?? due, due);
      const today = await this.collection.today(tx);
      const valid = new Date(`${today}T00:00:00Z`);
      valid.setUTCDate(valid.getUTCDate() + b.validDays);
      const number = await nextNumber(tx, p.tenantId, 'challan', today);
      const [row] = await tx.insert(feeChallans).values({ tenantId: p.tenantId, number, studentId: b.studentId, invoiceIds: invs.map((i) => i.id), amountPaise: amount, bankName: b.bankName, bankAccount: b.bankAccount, validUntil: valid.toISOString().slice(0, 10), createdBy: p.userId }).returning();
      await auditUser(tx, p, 'fee_challan.issued', 'fee_challan', row.id, { number, amountPaise: amount });
      return row;
    });
  }

  /** A challan to print: the bank, the student, the fees on it and the amount in words. */
  @Get('challans/:id')
  @Auth('user', FEE_ROLES)
  challanView(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(feeChallans).where(eq(feeChallans.id, id));
      if (!c) throw new NotFoundException('Challan not found');
      const [st] = await tx.select({ fullName: students.fullName, rollNo: students.rollNo, section: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, c.studentId));
      const lines = (await lineState(tx, c.invoiceIds)).filter((l) => l.balancePaise > 0);
      const invs = c.invoiceIds.length ? await tx.select({ id: feeInvoices.id, title: feeInvoices.title, invoiceNo: feeInvoices.invoiceNo }).from(feeInvoices).where(inArray(feeInvoices.id, c.invoiceIds)) : [];
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const [r] = c.receiptId ? await tx.select({ receiptNo: feeReceipts.receiptNo }).from(feeReceipts).where(eq(feeReceipts.id, c.receiptId)) : [];
      return { challan: c, institution: t?.name ?? '', student: st, invoices: invs, lines, inWords: rupeesInWords(c.amountPaise), receiptNo: r?.receiptNo ?? null };
    });
  }

  @Post('challans/:id/cancel')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  cancelChallan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Reason)) b: z.infer<typeof Reason>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(feeChallans).where(eq(feeChallans.id, id)).for('update');
      if (!c) throw new NotFoundException('Challan not found');
      if (c.status !== 'issued') throw new ConflictException('Only an unpaid challan can be cancelled');
      const [row] = await tx.update(feeChallans).set({ status: 'cancelled' }).where(eq(feeChallans.id, id)).returning();
      await auditUser(tx, p, 'fee_challan.cancelled', 'fee_challan', id, { reason: b.reason });
      return row;
    });
  }

  /**
   * The bank's file of paid challans: each line whose challan and amount match is receipted (bank transfer, the
   * bank's reference) on the day it was paid; anything else is reported and nothing of it is saved.
   */
  @Post('challans/reconcile')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  reconcile(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReconcileBody)) b: z.infer<typeof ReconcileBody>) {
    let rows: ReturnType<typeof parseChallanCsv>;
    try {
      rows = parseChallanCsv(b.csv);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!rows.length) throw new BadRequestException('The file has no rows');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const report: { line: number; number: string; amountPaise: number; ok: boolean; message: string; receiptNo?: string }[] = [];
      for (const [i, row] of rows.entries()) {
        const res = await tx.transaction(async (sp) => {
          const [c] = await sp.select().from(feeChallans).where(eq(feeChallans.number, row.number)).for('update');
          if (!c) return { ok: false, message: 'No such challan' };
          if (c.status === 'paid') return { ok: false, message: 'Already paid' };
          if (c.status === 'cancelled') return { ok: false, message: 'This challan was cancelled' };
          if (c.amountPaise !== row.amountPaise) return { ok: false, message: `The bank shows ₹${(row.amountPaise / 100).toLocaleString('en-IN')}; the challan is for ₹${(c.amountPaise / 100).toLocaleString('en-IN')}` };
          try {
            const v = await this.collection.collect(sp, p, { studentId: c.studentId, modes: [{ method: 'bank_transfer', amountPaise: c.amountPaise, reference: `Challan ${c.number} ${row.bankRef}`.trim() }], invoiceIds: c.invoiceIds, keepExcess: true, date: row.paidOn, note: `Bank challan ${c.number}` });
            await sp.update(feeChallans).set({ status: 'paid', paidOn: row.paidOn, bankRef: row.bankRef || null, receiptId: v.id }).where(eq(feeChallans.id, c.id));
            return { ok: true, message: 'Receipted', receiptNo: v.receiptNo };
          } catch (e) {
            return { ok: false, message: (e as Error).message };
          }
        });
        report.push({ line: i + 2, number: row.number, amountPaise: row.amountPaise, ...res });
      }
      await auditUser(tx, p, 'fee_challan.reconciled', 'fee_challan', undefined, { rows: rows.length, receipted: report.filter((r) => r.ok).length });
      return { rows: report, receipted: report.filter((r) => r.ok).length, failed: report.filter((r) => !r.ok).length };
    });
  }

  // ---- Government scholarships ---------------------------------------------------------------------

  @Post('govt-scholarships/:id/sanction')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  sanction(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SanctionBody)) b: z.infer<typeof SanctionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [g] = await tx.select().from(feeGovtScholarships).where(eq(feeGovtScholarships.id, id)).for('update');
      if (!g) throw new NotFoundException('Scholarship not found');
      if (g.status !== 'applied') throw new ConflictException('Only an applied scholarship can be sanctioned');
      const [row] = await tx.update(feeGovtScholarships).set({ status: 'sanctioned', sanctionedPaise: b.amountPaise, sanctionedOn: b.on, updatedAt: new Date() }).where(eq(feeGovtScholarships.id, id)).returning();
      await auditUser(tx, p, 'govt_scholarship.sanctioned', 'govt_scholarship', id, { amountPaise: b.amountPaise, on: b.on });
      return row;
    });
  }

  /** The money arrived (DBT to the institution): it pays the student's dues on a receipt, anything more is kept as advance. */
  @Post('govt-scholarships/:id/receive')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  receive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReceiveBody)) b: z.infer<typeof ReceiveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [g] = await tx.select().from(feeGovtScholarships).where(eq(feeGovtScholarships.id, id)).for('update');
      if (!g) throw new NotFoundException('Scholarship not found');
      if (!['applied', 'sanctioned'].includes(g.status)) throw new ConflictException('This scholarship is closed');
      const v = await this.collectScholarship(tx, p, g.studentId, b, `${g.scheme} (${g.applicationNo})`);
      const [row] = await tx.update(feeGovtScholarships).set({ status: 'received', receivedPaise: b.amountPaise, receivedOn: b.on, reference: b.reference, receiptId: v.id, sanctionedPaise: g.sanctionedPaise || b.amountPaise, updatedAt: new Date() }).where(eq(feeGovtScholarships.id, id)).returning();
      await auditUser(tx, p, 'govt_scholarship.received', 'govt_scholarship', id, { amountPaise: b.amountPaise, receiptNo: v.receiptNo });
      return { ...row, receiptNo: v.receiptNo };
    });
  }

  private async collectScholarship(tx: Tx, p: UserPrincipal, studentId: string, b: z.infer<typeof ReceiveBody>, what: string) {
    const v = await this.collection.collect(tx, p, { studentId, modes: [{ method: 'bank_transfer', amountPaise: b.amountPaise, reference: `${what} ${b.reference}` }], keepExcess: true, date: b.on, note: `Scholarship: ${what}`, notify: false });
    // Recorded as scholarship money, not the family's own transfer.
    await tx.update(feePayments).set({ method: 'scholarship' }).where(eq(feePayments.receiptId, v.id));
    await tx.update(feeReceipts).set({ modes: [{ method: 'scholarship', amountPaise: b.amountPaise, reference: b.reference }] }).where(eq(feeReceipts.id, v.id));
    await this.notifications.feeDeskNotice(tx, studentId, { text: feeTexts.scholarshipReceived(what, b.amountPaise), data: { receiptId: v.id, studentId }, dedupeKey: `scholarship:${v.id}` });
    return this.collection.view(tx, v.id);
  }

  @Post('govt-scholarships/:id/reject')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  rejectScholarship(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['rejected', 'lapsed']), reason: z.string().trim().min(3).max(300) }))) b: { status: 'rejected' | 'lapsed'; reason: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [g] = await tx.select().from(feeGovtScholarships).where(eq(feeGovtScholarships.id, id)).for('update');
      if (!g) throw new NotFoundException('Scholarship not found');
      if (!['applied', 'sanctioned'].includes(g.status)) throw new ConflictException('This scholarship is closed');
      const [row] = await tx.update(feeGovtScholarships).set({ status: b.status, note: `${g.note ? `${g.note}\n` : ''}${b.reason}`, updatedAt: new Date() }).where(eq(feeGovtScholarships.id, id)).returning();
      await auditUser(tx, p, `govt_scholarship.${b.status}`, 'govt_scholarship', id, { reason: b.reason });
      return row;
    });
  }

  // ---- Carrying dues forward ----------------------------------------------------------------------------

  /** Who has dues on a year's fees and how much would move to the next year. */
  @Get('carry-forward')
  @Auth('user', FEE_ROLES)
  carryPreview(@CurrentPrincipal() p: UserPrincipal, @Query('fromYear') fromYear?: string) {
    if (!fromYear || !/^\d{4}-\d{2}$/.test(fromYear)) throw new BadRequestException('Choose the year to carry from');
    return this.db.withTenant(p.tenantId, (tx) => this.carryRows(tx, fromYear));
  }

  private async carryRows(tx: Tx, fromYear: string, studentIds?: string[]) {
    const rows = await tx
      .select({ id: feeInvoices.id, studentId: feeInvoices.studentId, sectionId: students.sectionId, title: feeInvoices.title, invoiceNo: feeInvoices.invoiceNo, academicYear: feeInvoices.academicYear, dueOn: feeInvoices.dueOn, balancePaise: sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number), student: students.fullName, rollNo: students.rollNo })
      .from(feeInvoices)
      .innerJoin(students, eq(students.id, feeInvoices.studentId))
      .where(and(eq(feeInvoices.status, 'due'), sql`${feeInvoices.carriedTo} is null`, sql`(coalesce(${feeInvoices.academicYear}, '') = ${fromYear} or (${feeInvoices.academicYear} is null and ${feeInvoices.dueOn} between ${`${fromYear.slice(0, 4)}-04-01`}::date and ${`${Number(fromYear.slice(0, 4)) + 1}-03-31`}::date))`, studentIds?.length ? inArray(feeInvoices.studentId, studentIds) : undefined))
      .orderBy(asc(students.fullName), asc(feeInvoices.dueOn));
    return rows.filter((r) => r.balancePaise > 0);
  }

  /**
   * Moves what is still due on a year's invoices to one arrears invoice per student in the next year (by head), and
   * closes the old invoices for that amount; the student's ledger shows both sides.
   */
  @Post('carry-forward')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  carry(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CarryBody)) b: z.infer<typeof CarryBody>) {
    if (b.toYear <= b.fromYear) throw new BadRequestException('Carry dues into a later year');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await this.carryRows(tx, b.fromYear, b.studentIds);
      if (!rows.length) throw new BadRequestException('Nothing is due on that year’s fees');
      const byStudent = new Map<string, typeof rows>();
      for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
      let moved = 0;
      for (const [studentId, invs] of byStudent) {
        const state = await lineState(tx, invs.map((i) => i.id));
        const heads = new Map<string, { code: string; name: string; priority: number; amountPaise: number; gstRate: number }>();
        for (const l of state.filter((x) => x.balancePaise > 0)) {
          const h = heads.get(l.headCode) ?? { code: l.headCode, name: l.headName, priority: l.priority, amountPaise: 0, gstRate: l.gstRate };
          h.amountPaise += l.balancePaise;
          heads.set(l.headCode, h);
        }
        const arrears = await raiseInvoice(tx, { tenantId: p.tenantId, studentId, sectionId: invs[0].sectionId, title: `Arrears brought forward from ${b.fromYear}`, dueOn: b.dueOn, createdBy: p.userId, lines: [...heads.values()], academicYear: b.toYear, kind: 'arrears' });
        for (const inv of invs) {
          const bal = inv.balancePaise;
          const off = await reduceCharge(tx, inv.id, bal);
          await tx.update(feeInvoices).set({ carriedPaise: sql`${feeInvoices.carriedPaise} + ${off}`, carriedTo: arrears.id }).where(eq(feeInvoices.id, inv.id));
          await tx.insert(feeCarryForwards).values({ tenantId: p.tenantId, studentId, fromYear: b.fromYear, toYear: b.toYear, fromInvoiceId: inv.id, toInvoiceId: arrears.id, amountPaise: off, createdBy: p.userId });
          moved += off;
        }
      }
      await auditUser(tx, p, 'fees.carried_forward', 'fee_carry_forward', undefined, { fromYear: b.fromYear, toYear: b.toYear, students: byStudent.size, amountPaise: moved });
      return { students: byStudent.size, invoices: rows.length, amountPaise: moved };
    });
  }

  /** Whether a student's dues hold back a hall ticket, result or TC (Settings → dues). */
  @Get('dues-check/:studentId')
  @Auth('user', FEE_ROLES.concat('exam_controller' as RoleName, 'hod' as RoleName))
  duesCheck(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.duesSvc.blocks(tx, p.tenantId, studentId));
  }

  /** Carry-forward history (what moved where), newest first. */
  @Get('carry-forward/history')
  @Auth('user', FEE_ROLES)
  carryHistory(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: feeCarryForwards.id, student: students.fullName, rollNo: students.rollNo, fromYear: feeCarryForwards.fromYear, toYear: feeCarryForwards.toYear, amountPaise: feeCarryForwards.amountPaise, createdAt: feeCarryForwards.createdAt, toInvoiceId: feeCarryForwards.toInvoiceId })
        .from(feeCarryForwards)
        .innerJoin(students, eq(students.id, feeCarryForwards.studentId))
        .orderBy(desc(feeCarryForwards.createdAt))
        .limit(500),
    );
  }

  /** The heads of the invoices a challan or receipt covers (for print). */
  @Get('invoices/:id/lines')
  @Auth('user', FEE_ROLES)
  async invoiceLines(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(feeInvoiceLines).where(eq(feeInvoiceLines.invoiceId, id))).sort((a, b) => a.priority - b.priority));
  }

  /** Sends reminders now to every family with overdue fees (on the channels the schedule names). */
  @Post('reminders/run')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  runReminders(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.duesSvc.remind(tx, p.tenantId, p));
  }

  /** The reminder runs (scheduled and by hand), newest first. */
  @Get('reminders/runs')
  @Auth('user', FEE_ROLES)
  reminderRuns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ r: feeReminderRuns, by: users.fullName }).from(feeReminderRuns).leftJoin(users, eq(users.id, feeReminderRuns.runBy)).orderBy(desc(feeReminderRuns.createdAt)).limit(100).then((rows) => rows.map((x) => ({ ...x.r, runByName: x.by }))));
  }

  /** Sends today's collection summary to the principal and admins now. */
  @Post('summary/send')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  sendSummary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const out = await this.duesSvc.summary(tx, p.tenantId, true);
      await auditUser(tx, p, 'fees.summary_sent', 'fee_reminder', undefined, out);
      return out;
    });
  }

  /** The settings the counter needs: enabled modes and whether advance may be kept. */
  @Get('counter-settings')
  @Auth('user', FEE_ROLES)
  counterSettings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await settingsOf(tx, p.tenantId);
      return { modes: s.paymentModes.filter((m) => m.enabled).map((m) => m.mode), fy: fyOf(await this.collection.today(tx)), today: await this.collection.today(tx) };
    });
  }
}
