import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { postAdvance } from '../books/books.service.js';
import { auditUser } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { studentCredits } from '../db/schema-depth.js';
import { feeCheques } from '../db/schema-fee-accounts.js';
import { feeChallans, feeInvoiceLines, feePaymentAllocations, feeReceipts, type ReceiptMode } from '../db/schema-fee-depth.js';
import { feeInstalments } from '../db/schema-depth.js';
import { feeInvoices, feePayments, sections, students, tenants } from '../db/schema.js';
import { assertPeriodOpen, settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { allocateAcross, rupeesInWords, settleOrder, splitByModes } from '../fees/fee-depth.logic.js';
import { headsOf, lineState, type LineState } from '../fees/fee-lines.js';
import { FeesService } from '../fees/fees.service.js';
import { allocatePaid } from '../fees/fees-depth.logic.js';
import { creditBalance, moneyAccountFor, nextReceiptNo, prefixFor } from '../fees/receipts.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface CollectMode extends ReceiptMode {
  method: 'cash' | 'cheque' | 'dd' | 'card' | 'upi' | 'bank_transfer' | 'online' | 'scholarship';
}

export interface CollectInput {
  studentId: string;
  modes: CollectMode[];
  /** A person's own split (invoice and head); otherwise oldest dues first, heads by priority. */
  allocations?: { invoiceId: string; headCode: string; amountPaise: number }[];
  /** Keep what is more than the dues as advance credit (otherwise it is refused). */
  keepExcess?: boolean;
  /** Only these invoices (a challan, a reissue). */
  invoiceIds?: string[];
  note?: string;
  date?: string;
  reissueOf?: string | null;
  /** The family is told (false when the caller tells them its own way). */
  notify?: boolean;
}

/**
 * The fees counter: what a student owes by fee and head, a split of what is paid (automatic or by hand), and one
 * receipt for everything paid together, across several fees and several payment modes, with anything more than the
 * dues kept as advance credit. Cheques and DDs go into the cheque register as they are taken.
 */
@Injectable()
export class CollectionService {
  constructor(
    private readonly fees: FeesService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  /** A student's open invoices with their lines (oldest due first), instalments due, the advance held and the total due. */
  async dues(tx: Tx, studentId: string) {
    const [st] = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, status: students.status, section: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!st) throw new NotFoundException('Student not found');
    const today = await this.today(tx);
    const invs = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.studentId, studentId), eq(feeInvoices.status, 'due'))).orderBy(asc(feeInvoices.dueOn), asc(feeInvoices.createdAt));
    const lines = await lineState(tx, invs.map((i) => i.id));
    const inst = invs.length ? await tx.select().from(feeInstalments).where(inArray(feeInstalments.invoiceId, invs.map((i) => i.id))).orderBy(asc(feeInstalments.seq)) : [];
    const invoices = invs.map((i) => {
      const mine = inst.filter((x) => x.invoiceId === i.id);
      const schedule = mine.length ? allocatePaid(mine.map((x) => ({ seq: x.seq, dueOn: x.dueOn, amountPaise: x.amountPaise })), i.paidPaise, today) : [];
      return {
        id: i.id,
        invoiceNo: i.invoiceNo,
        title: i.title,
        kind: i.kind,
        dueOn: i.dueOn,
        overdue: i.dueOn < today,
        amountPaise: i.amountPaise,
        paidPaise: i.paidPaise,
        balancePaise: i.amountPaise - i.paidPaise,
        lines: lines.filter((l) => l.invoiceId === i.id),
        instalments: schedule,
        /** What is due now when the invoice is on instalments: the instalments due by today. */
        dueNowPaise: schedule.length ? schedule.filter((x) => x.dueOn <= today && x.status !== 'paid').reduce((s, x) => s + x.amountPaise - x.paidPaise, 0) : i.amountPaise - i.paidPaise,
      };
    });
    const advancePaise = await creditBalance(tx, studentId);
    return { student: st, today, invoices, duePaise: invoices.reduce((s, i) => s + i.balancePaise, 0), overduePaise: invoices.filter((i) => i.overdue).reduce((s, i) => s + i.balancePaise, 0), advancePaise };
  }

  /** How `amount` would be split: the person's allocation checked, or oldest dues first with heads by priority. */
  async plan(tx: Tx, studentId: string, amount: number, given?: CollectInput['allocations'], invoiceIds?: string[]) {
    const d = await this.dues(tx, studentId);
    const invoices = invoiceIds?.length ? d.invoices.filter((i) => invoiceIds.includes(i.id)) : d.invoices;
    if (invoiceIds?.length && invoices.length !== new Set(invoiceIds).size) throw new BadRequestException('Some of those fees are not open for this student');
    const flat = settleOrder(invoices.flatMap((i) => i.lines.map((l) => ({ ...l, dueOn: i.dueOn }))));
    let pieces: { line: LineState; paise: number }[];
    if (given?.length) {
      pieces = [];
      for (const g of given.filter((x) => x.amountPaise > 0)) {
        const line = flat.find((l) => l.invoiceId === g.invoiceId && l.headCode === g.headCode);
        if (!line) throw new BadRequestException(`${g.headCode} is not due on that fee`);
        if (g.amountPaise > line.balancePaise) throw new BadRequestException(`That is more than is due on ${line.headName}`);
        pieces.push({ line, paise: g.amountPaise });
      }
      if (pieces.reduce((s, x) => s + x.paise, 0) > amount) throw new BadRequestException('The split adds up to more than is being paid');
    } else {
      pieces = allocateAcross(flat.map((l) => ({ ...l, id: l.id })), amount).map((x) => ({ line: flat.find((l) => l.id === x.line.id)!, paise: x.paise }));
    }
    const allocated = pieces.reduce((s, x) => s + x.paise, 0);
    return { pieces, allocatedPaise: allocated, excessPaise: amount - allocated, duePaise: d.duePaise, advancePaise: d.advancePaise, student: d.student };
  }

  /** Takes a payment at the counter: one receipt, its payments per fee and mode, cheques registered, excess to advance. */
  async collect(tx: Tx, p: UserPrincipal, b: CollectInput) {
    const amount = b.modes.reduce((s, m) => s + m.amountPaise, 0);
    if (amount <= 0) throw new BadRequestException('Enter the amount received');
    for (const m of b.modes) {
      if ((m.method === 'cheque' || m.method === 'dd') && (!m.chequeNo || !m.bankName || !m.chequeDate)) throw new BadRequestException('A cheque or DD needs its number, bank and date');
      if (['upi', 'card', 'bank_transfer', 'online'].includes(m.method) && !m.reference) throw new BadRequestException('Enter the transaction reference for that payment');
    }
    const s = await settingsOf(tx, p.tenantId);
    const enabled = new Set(s.paymentModes.filter((m) => m.enabled).map((m) => m.mode));
    for (const m of b.modes) {
      const key = m.method === 'card' ? 'online' : m.method === 'scholarship' ? 'bank_transfer' : m.method;
      if (enabled.size && !enabled.has(key as never) && m.method !== 'scholarship') throw new BadRequestException(`${m.method.replace('_', ' ')} payments are switched off in the accounts settings`);
    }
    const date = b.date ?? (await this.today(tx));
    await assertPeriodOpen(tx, date);
    const plan = await this.plan(tx, b.studentId, amount, b.allocations, b.invoiceIds);
    if (plan.excessPaise > 0 && !b.keepExcess) throw new BadRequestException(`That is ₹${(plan.excessPaise / 100).toLocaleString('en-IN')} more than is due; keep it as advance or take less`);
    // Cash is used first so a cheque that later bounces takes back as little as possible.
    const order = b.modes.map((m, i) => ({ m, i })).sort((x, y) => Number(x.m.method !== 'cash') - Number(y.m.method !== 'cash')).map((x) => x.i);
    const modes = order.map((i) => b.modes[i]);
    const split = splitByModes(plan.pieces.map((x) => ({ line: x.line, paise: x.paise })), modes);
    const receiptNo = await nextReceiptNo(tx, p.tenantId, date, await prefixFor(tx, p.tenantId, plan.pieces.map((x) => x.line.headCode)));
    const [receipt] = await tx
      .insert(feeReceipts)
      .values({ tenantId: p.tenantId, receiptNo, studentId: b.studentId, totalPaise: amount, advancePaise: plan.excessPaise, modes: b.modes, note: b.note ?? '', collectedBy: p.userId, collectedOn: date, reissueOf: b.reissueOf ?? null })
      .returning();
    // One payment per fee and mode.
    const groups = new Map<string, { invoiceId: string; mode: number; pieces: typeof split }>();
    for (const x of split) {
      const k = `${x.line.invoiceId}:${x.mode}`;
      const g = groups.get(k) ?? { invoiceId: x.line.invoiceId, mode: x.mode, pieces: [] };
      g.pieces.push(x);
      groups.set(k, g);
    }
    const payments: (typeof feePayments.$inferSelect)[] = [];
    for (const g of groups.values()) {
      const m = modes[g.mode];
      const paise = g.pieces.reduce((s2, x) => s2 + x.paise, 0);
      const ref = m.method === 'cheque' || m.method === 'dd' ? `${m.method.toUpperCase()} ${m.chequeNo} ${m.bankName}` : (m.reference ?? null);
      const [pay] = await tx.insert(feePayments).values({ tenantId: p.tenantId, invoiceId: g.invoiceId, studentId: b.studentId, amountPaise: paise, method: m.method, status: 'created', reference: ref, recordedBy: p.userId, receiptId: receipt.id }).returning();
      const paid = await this.fees.markPaid(tx, pay.id, { allocations: g.pieces.map((x) => ({ lineId: x.line.id, headCode: x.line.headCode, paise: x.paise })), notify: false, date });
      payments.push(paid);
    }
    if (plan.excessPaise > 0) {
      await tx.insert(studentCredits).values({ tenantId: p.tenantId, studentId: b.studentId, amountPaise: plan.excessPaise, kind: 'advance', note: `Advance with receipt ${receiptNo}`, createdBy: p.userId });
      const advMode = modes.find((m) => m.method === 'cash') ?? modes[0];
      await postAdvance(tx, { tenantId: p.tenantId, userId: p.userId, receiptId: receipt.id, date, receiptNo, student: plan.student.fullName, moneyAccountCode: moneyAccountFor(s, advMode.method), paise: plan.excessPaise });
    }
    // Cheques and DDs go into the register now, one row per instrument.
    for (const m of b.modes.filter((x) => x.method === 'cheque' || x.method === 'dd')) {
      const first = payments.find((x) => x.method === m.method && x.reference?.includes(m.chequeNo ?? ''));
      if (!first) continue;
      await tx.insert(feeCheques).values({ tenantId: p.tenantId, paymentId: first.id, receiptId: receipt.id, studentId: b.studentId, chequeNo: m.chequeNo!, bankName: m.bankName!, chequeDate: m.chequeDate!, amountPaise: m.amountPaise, kind: m.method, createdBy: p.userId }).onConflictDoNothing();
    }
    await auditUser(tx, p, 'fee_receipt.collected', 'fee_receipt', receipt.id, { receiptNo, totalPaise: amount, modes: b.modes.map((m) => m.method), advancePaise: plan.excessPaise, invoices: groups.size });
    if (b.notify !== false) {
      const titles = [...new Set(plan.pieces.map((x) => x.line.headName))].slice(0, 3).join(', ');
      await this.notifications.feePaid(tx, { paymentId: payments[0]?.id ?? receipt.id, studentId: b.studentId, studentName: plan.student.fullName, title: titles || 'Advance', amountPaise: amount, receiptNo });
    }
    return this.view(tx, receipt.id);
  }

  /** Pays open fees from the advance credit the student holds, oldest first, on one receipt. */
  async fromAdvance(tx: Tx, p: UserPrincipal, studentId: string, max?: number) {
    const balance = await creditBalance(tx, studentId);
    const d = await this.dues(tx, studentId);
    const amount = Math.min(balance, d.duePaise, max ?? Infinity);
    if (amount <= 0) throw new ConflictException(balance <= 0 ? 'This student holds no advance' : 'Nothing is due');
    const date = await this.today(tx);
    const plan = await this.plan(tx, studentId, amount);
    const receiptNo = await nextReceiptNo(tx, p.tenantId, date);
    const [receipt] = await tx.insert(feeReceipts).values({ tenantId: p.tenantId, receiptNo, studentId, totalPaise: amount, modes: [{ method: 'credit', amountPaise: amount, reference: 'Advance credit' }], note: 'Paid from advance', collectedBy: p.userId, collectedOn: date }).returning();
    const byInvoice = new Map<string, typeof plan.pieces>();
    for (const x of plan.pieces) byInvoice.set(x.line.invoiceId, [...(byInvoice.get(x.line.invoiceId) ?? []), x]);
    for (const [invoiceId, pieces] of byInvoice) {
      const paise = pieces.reduce((s, x) => s + x.paise, 0);
      const [pay] = await tx.insert(feePayments).values({ tenantId: p.tenantId, invoiceId, studentId, amountPaise: paise, method: 'credit', status: 'created', reference: 'Advance credit', recordedBy: p.userId, receiptId: receipt.id }).returning();
      await this.fees.markPaid(tx, pay.id, { allocations: pieces.map((x) => ({ lineId: x.line.id, headCode: x.line.headCode, paise: x.paise })), notify: false, date });
      await tx.insert(studentCredits).values({ tenantId: p.tenantId, studentId, amountPaise: -paise, kind: 'applied', invoiceId, note: receiptNo, createdBy: p.userId });
    }
    await auditUser(tx, p, 'fee_receipt.from_advance', 'fee_receipt', receipt.id, { receiptNo, amountPaise: amount });
    return this.view(tx, receipt.id);
  }

  /** A receipt as printed and shown: the student, every fee and head it paid, the modes, the balance left, the status. */
  async view(tx: Tx, receiptId: string) {
    const [r] = await tx.select().from(feeReceipts).where(eq(feeReceipts.id, receiptId));
    if (!r) throw new NotFoundException('Receipt not found');
    const [st] = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, section: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, r.studentId));
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const pays = await tx
      .select({ id: feePayments.id, invoiceId: feePayments.invoiceId, title: feeInvoices.title, invoiceNo: feeInvoices.invoiceNo, method: feePayments.method, reference: feePayments.reference, amountPaise: feePayments.amountPaise, status: feePayments.status })
      .from(feePayments)
      .innerJoin(feeInvoices, eq(feeInvoices.id, feePayments.invoiceId))
      .where(eq(feePayments.receiptId, receiptId))
      .orderBy(asc(feePayments.createdAt));
    const allocs = pays.length
      ? await tx
          .select({ paymentId: feePaymentAllocations.paymentId, invoiceId: feePaymentAllocations.invoiceId, headCode: feePaymentAllocations.headCode, headName: feeInvoiceLines.headName, gstRate: feeInvoiceLines.gstRate, paise: sql<number>`sum(${feePaymentAllocations.amountPaise})::bigint`.mapWith(Number) })
          .from(feePaymentAllocations)
          .leftJoin(feeInvoiceLines, eq(feeInvoiceLines.id, feePaymentAllocations.lineId))
          .where(inArray(feePaymentAllocations.paymentId, pays.map((x) => x.id)))
          .groupBy(feePaymentAllocations.paymentId, feePaymentAllocations.invoiceId, feePaymentAllocations.headCode, feeInvoiceLines.headName, feeInvoiceLines.gstRate)
      : [];
    const heads = new Map((await headsOf(tx, r.tenantId)).map((h) => [h.code, h]));
    const items: { invoiceId: string; title: string; invoiceNo: string | null; headCode: string; head: string; gstRate: number; sac: string | null; amountPaise: number }[] = [];
    for (const pay of pays) {
      const mine = allocs.filter((a) => a.paymentId === pay.id && a.paise !== 0);
      if (!mine.length) items.push({ invoiceId: pay.invoiceId, title: pay.title, invoiceNo: pay.invoiceNo, headCode: '', head: pay.title, gstRate: 0, sac: null, amountPaise: pay.amountPaise });
      for (const a of mine) {
        const hit = items.find((x) => x.invoiceId === a.invoiceId && x.headCode === a.headCode);
        if (hit) hit.amountPaise += a.paise;
        else items.push({ invoiceId: a.invoiceId, title: pay.title, invoiceNo: pay.invoiceNo, headCode: a.headCode, head: a.headName ?? heads.get(a.headCode)?.name ?? a.headCode, gstRate: Number(a.gstRate ?? 0), sac: heads.get(a.headCode)?.sac ?? null, amountPaise: a.paise });
      }
    }
    // What is still due on those fees after this receipt (today's figure).
    const invIds = [...new Set(pays.map((x) => x.invoiceId))];
    const left = invIds.length ? await tx.select({ id: feeInvoices.id, bal: sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number) }).from(feeInvoices).where(inArray(feeInvoices.id, invIds)) : [];
    const cheques = await tx.select({ id: feeCheques.id, chequeNo: feeCheques.chequeNo, status: feeCheques.status, kind: feeCheques.kind }).from(feeCheques).where(eq(feeCheques.receiptId, receiptId));
    const [orig] = r.reissueOf ? await tx.select({ id: feeReceipts.id, receiptNo: feeReceipts.receiptNo }).from(feeReceipts).where(eq(feeReceipts.id, r.reissueOf)) : [];
    const [next] = await tx.select({ id: feeReceipts.id, receiptNo: feeReceipts.receiptNo }).from(feeReceipts).where(eq(feeReceipts.reissueOf, receiptId)).limit(1);
    const [challan] = await tx.select({ id: feeChallans.id, number: feeChallans.number }).from(feeChallans).where(eq(feeChallans.receiptId, receiptId)).limit(1);
    return {
      id: r.id,
      receiptNo: r.receiptNo,
      status: r.status,
      institution: t?.name ?? '',
      student: st,
      date: r.collectedOn,
      totalPaise: r.totalPaise,
      advancePaise: r.advancePaise,
      inWords: rupeesInWords(r.totalPaise),
      modes: r.modes,
      items,
      payments: pays,
      balancePaise: left.reduce((s, x) => s + Math.max(0, x.bal), 0),
      note: r.note,
      cancel: r.cancelReason ? { reason: r.cancelReason, at: r.cancelledAt ?? r.cancelRequestedAt, status: r.status, requestedBy: r.cancelRequestedBy } : null,
      printCount: r.printCount,
      cheques,
      reissueOf: orig ?? null,
      reissuedAs: next ?? null,
      challan: challan ?? null,
    };
  }

  /** Receipts of a student or a day (the counter's recent list). */
  async recent(tx: Tx, o: { studentId?: string; date?: string; limit?: number }) {
    return tx
      .select({ id: feeReceipts.id, receiptNo: feeReceipts.receiptNo, totalPaise: feeReceipts.totalPaise, status: feeReceipts.status, collectedOn: feeReceipts.collectedOn, student: students.fullName, rollNo: students.rollNo, modes: feeReceipts.modes, createdAt: feeReceipts.createdAt })
      .from(feeReceipts)
      .innerJoin(students, eq(students.id, feeReceipts.studentId))
      .where(and(o.studentId ? eq(feeReceipts.studentId, o.studentId) : undefined, o.date ? eq(feeReceipts.collectedOn, o.date) : undefined))
      .orderBy(desc(feeReceipts.createdAt))
      .limit(o.limit ?? 50);
  }
}
