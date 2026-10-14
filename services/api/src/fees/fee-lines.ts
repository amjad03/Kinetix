import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { feeHeads, feeInvoiceLines, feePaymentAllocations } from '../db/schema-fee-depth.js';
import { feeAccountsSettings } from '../db/schema-fee-accounts.js';
import { feeInvoices, feePayments } from '../db/schema.js';
import { DEFAULT_HEADS, headOf } from '../fee-accounts/fee-accounts.logic.js';
import { allocateAcross, reductionPlan, type LineBalance } from './fee-depth.logic.js';

/**
 * Invoice lines by fee head, and the money on them. An invoice's amount is always the sum of its lines' net charge
 * (amount less what was waived); every change of an invoice's amount in the fees modules goes through
 * {@link chargeHead} or {@link reduceCharge}. Invoices raised before lines existed get one line the first time they
 * are touched ({@link ensureLines}). A line's paid amount is what payments allocated to it, plus any paid amount no
 * payment allocated (older payments), spread by head priority.
 */

export type FeeHeadRow = typeof feeHeads.$inferSelect;
export const GENERAL = { code: 'GEN', name: 'General fee' };
const KIND_OF: Record<string, string> = { TUI: 'tuition', EXM: 'exam', LAB: 'lab', TRN: 'transport', UNI: 'uniform', FIN: 'fine' };

/** The fee heads in allocation order; the first read seeds them from the desk settings' list. */
export async function headsOf(tx: Tx, tenantId: string): Promise<FeeHeadRow[]> {
  let rows = await tx.select().from(feeHeads).orderBy(asc(feeHeads.sortOrder), asc(feeHeads.code));
  if (rows.length) return rows;
  const [s] = await tx.select({ heads: feeAccountsSettings.feeHeads }).from(feeAccountsSettings);
  const seed = s?.heads?.length ? s.heads : DEFAULT_HEADS;
  await tx
    .insert(feeHeads)
    .values(seed.map((h, i) => ({ tenantId, code: h.code, name: h.name, kind: KIND_OF[h.code] ?? 'other', sortOrder: (h.code === 'FIN' ? 900 : i + 1) * 10, accountCode: h.accountCode, gstRate: h.gstRate, refundable: !['FIN'].includes(h.code), optional: h.code === 'TRN', linkedModule: h.code === 'TRN' ? 'transport' : 'none' })))
    .onConflictDoNothing();
  rows = await tx.select().from(feeHeads).orderBy(asc(feeHeads.sortOrder), asc(feeHeads.code));
  return rows;
}

/** The head with this code or name (case-insensitive), or the one the text mentions. */
export function findHead(heads: FeeHeadRow[], text: string): FeeHeadRow | undefined {
  const t = text.trim().toLowerCase();
  const exact = heads.find((h) => h.code.toLowerCase() === t || h.name.toLowerCase() === t);
  if (exact) return exact;
  const hit = headOf(text, heads.map((h) => ({ code: h.code, name: h.name, gstRate: h.gstRate, accountCode: h.accountCode })));
  return hit ? heads.find((h) => h.code === hit.code) : undefined;
}

/** The fine head (kind "fine"), seeded as FIN. */
export async function fineHead(tx: Tx, tenantId: string): Promise<{ code: string; name: string; priority: number; gstRate: number }> {
  const heads = await headsOf(tx, tenantId);
  const h = heads.find((x) => x.kind === 'fine') ?? heads.find((x) => x.code === 'FIN');
  return h ? { code: h.code, name: h.name, priority: h.sortOrder, gstRate: h.gstRate } : { code: 'FIN', name: 'Late fee', priority: 9000, gstRate: 0 };
}

export interface NewLine {
  code: string;
  name: string;
  priority: number;
  amountPaise: number;
  gstRate?: number;
}

/** Raises an invoice with its lines; the amount is their total. */
export async function raiseInvoice(
  tx: Tx,
  v: { tenantId: string; studentId: string; sectionId: string; title: string; dueOn: string; createdBy: string; lines: NewLine[]; batchId?: string; structureId?: string | null; academicYear?: string | null; kind?: string },
) {
  const lines = v.lines.filter((l) => l.amountPaise > 0);
  const amount = lines.reduce((s, l) => s + l.amountPaise, 0);
  const [inv] = await tx
    .insert(feeInvoices)
    .values({ tenantId: v.tenantId, studentId: v.studentId, sectionId: v.sectionId, batchId: v.batchId ?? randomUUID(), title: v.title, amountPaise: amount, dueOn: v.dueOn, createdBy: v.createdBy, structureId: v.structureId ?? null, academicYear: v.academicYear ?? null, kind: v.kind ?? 'fee', status: amount > 0 ? 'due' : 'paid' })
    .returning();
  if (lines.length) await tx.insert(feeInvoiceLines).values(lines.map((l) => ({ tenantId: v.tenantId, invoiceId: inv.id, headCode: l.code, headName: l.name, priority: l.priority, amountPaise: l.amountPaise, gstRate: l.gstRate ?? 0 })));
  return inv;
}

/** Gives an invoice lines when it has none, and squares them with its amount when something changed it directly. */
export async function ensureLines(tx: Tx, invoiceId: string): Promise<void> {
  const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId));
  if (!inv) return;
  const lines = await tx.select().from(feeInvoiceLines).where(eq(feeInvoiceLines.invoiceId, invoiceId));
  const net = lines.reduce((s, l) => s + l.amountPaise - l.waivedPaise, 0);
  if (lines.length && net === inv.amountPaise) return;
  const heads = await headsOf(tx, inv.tenantId);
  if (!lines.length) {
    const h = findHead(heads, inv.title);
    await tx.insert(feeInvoiceLines).values({ tenantId: inv.tenantId, invoiceId, headCode: h?.code ?? GENERAL.code, headName: h?.name ?? inv.title.slice(0, 120), priority: h?.sortOrder ?? 500, amountPaise: inv.amountPaise, gstRate: h?.gstRate ?? 0 });
    return;
  }
  const diff = inv.amountPaise - net;
  if (diff > 0) {
    // Charged directly (a late fee from an older path, an exam fee change): goes on the first line.
    const first = [...lines].sort((a, b) => a.priority - b.priority)[0];
    await tx.update(feeInvoiceLines).set({ amountPaise: first.amountPaise + diff }).where(eq(feeInvoiceLines.id, first.id));
  } else {
    let left = -diff;
    for (const l of [...lines].sort((a, b) => b.priority - a.priority)) {
      if (left <= 0) break;
      const take = Math.min(left, l.amountPaise - l.waivedPaise);
      if (take > 0) await tx.update(feeInvoiceLines).set({ waivedPaise: l.waivedPaise + take }).where(eq(feeInvoiceLines.id, l.id));
      left -= take;
    }
  }
}

export interface LineState {
  id: string;
  invoiceId: string;
  headCode: string;
  headName: string;
  priority: number;
  gstRate: number;
  amountPaise: number;
  waivedPaise: number;
  netPaise: number;
  paidPaise: number;
  balancePaise: number;
}

/** Every line of these invoices with what is paid and still due on it (lines are created first where missing). */
export async function lineState(tx: Tx, invoiceIds: string[]): Promise<LineState[]> {
  if (!invoiceIds.length) return [];
  for (const id of invoiceIds) await ensureLines(tx, id);
  const invs = await tx.select({ id: feeInvoices.id, paidPaise: feeInvoices.paidPaise }).from(feeInvoices).where(inArray(feeInvoices.id, invoiceIds));
  const lines = await tx.select().from(feeInvoiceLines).where(inArray(feeInvoiceLines.invoiceId, invoiceIds)).orderBy(asc(feeInvoiceLines.priority), asc(feeInvoiceLines.headCode), asc(feeInvoiceLines.createdAt));
  const allocated = await tx
    .select({ lineId: feePaymentAllocations.lineId, invoiceId: feePaymentAllocations.invoiceId, paise: sql<number>`sum(${feePaymentAllocations.amountPaise})::bigint`.mapWith(Number) })
    .from(feePaymentAllocations)
    .innerJoin(feePayments, eq(feePayments.id, feePaymentAllocations.paymentId))
    .where(and(inArray(feePaymentAllocations.invoiceId, invoiceIds), eq(feePayments.status, 'paid')))
    .groupBy(feePaymentAllocations.lineId, feePaymentAllocations.invoiceId);
  const byLine = new Map(allocated.filter((a) => a.lineId).map((a) => [a.lineId!, a.paise]));
  const out: LineState[] = [];
  for (const inv of invs) {
    const mine = lines.filter((l) => l.invoiceId === inv.id);
    const allocatedTotal = allocated.filter((a) => a.invoiceId === inv.id).reduce((s, a) => s + a.paise, 0);
    let loose = Math.max(0, inv.paidPaise - allocatedTotal);
    for (const l of mine) {
      const net = l.amountPaise - l.waivedPaise;
      let paid = Math.min(net, Math.max(0, byLine.get(l.id) ?? 0));
      const extra = Math.min(loose, net - paid);
      paid += extra;
      loose -= extra;
      out.push({ id: l.id, invoiceId: l.invoiceId, headCode: l.headCode, headName: l.headName, priority: l.priority, gstRate: l.gstRate, amountPaise: l.amountPaise, waivedPaise: l.waivedPaise, netPaise: net, paidPaise: paid, balancePaise: net - paid });
    }
  }
  return out;
}

/** Adds a charge under a head (a fine, a revision, a cheque-return charge) to an invoice and reopens it. */
export async function chargeHead(tx: Tx, invoiceId: string, head: { code: string; name: string; priority: number; gstRate?: number }, deltaPaise: number): Promise<void> {
  if (deltaPaise === 0) return;
  await ensureLines(tx, invoiceId);
  const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId)).for('update');
  const [line] = await tx.select().from(feeInvoiceLines).where(and(eq(feeInvoiceLines.invoiceId, invoiceId), eq(feeInvoiceLines.headCode, head.code))).limit(1);
  if (line) await tx.update(feeInvoiceLines).set({ amountPaise: line.amountPaise + deltaPaise }).where(eq(feeInvoiceLines.id, line.id));
  else await tx.insert(feeInvoiceLines).values({ tenantId: inv.tenantId, invoiceId, headCode: head.code, headName: head.name, priority: head.priority, amountPaise: deltaPaise, gstRate: head.gstRate ?? 0 });
  const amount = inv.amountPaise + deltaPaise;
  await tx.update(feeInvoices).set({ amountPaise: amount, status: inv.status === 'cancelled' ? 'cancelled' : inv.paidPaise >= amount ? 'paid' : 'due', updatedAt: new Date() }).where(eq(feeInvoices.id, invoiceId));
}

/**
 * Takes up to `amount` off what an invoice still asks for (the named heads only, when given), lowest-priority heads
 * first, never below what is already paid. Returns how much came off; the invoice is paid when nothing is left.
 */
export async function reduceCharge(tx: Tx, invoiceId: string, amount: number, heads: string[] = []): Promise<number> {
  const state = await lineState(tx, [invoiceId]);
  const plan = reductionPlan(
    state.map((l) => ({ id: l.id, headCode: l.headCode, priority: l.priority, netPaise: l.netPaise, unpaidPaise: l.balancePaise })),
    amount,
    heads,
  );
  const applied = plan.reduce((s, p) => s + p.paise, 0);
  if (!applied) return 0;
  for (const p of plan) await tx.update(feeInvoiceLines).set({ waivedPaise: sql`${feeInvoiceLines.waivedPaise} + ${p.paise}` }).where(eq(feeInvoiceLines.id, p.id));
  const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId)).for('update');
  const left = inv.amountPaise - applied;
  await tx.update(feeInvoices).set({ amountPaise: left, status: inv.status === 'cancelled' ? 'cancelled' : inv.paidPaise >= left ? 'paid' : 'due', updatedAt: new Date() }).where(eq(feeInvoices.id, invoiceId));
  return applied;
}

/** Records how a payment settled the invoice's heads: the given split, or by head priority. */
export async function allocatePayment(tx: Tx, payment: { id: string; tenantId: string; invoiceId: string; amountPaise: number }, given?: { lineId: string; headCode: string; paise: number }[]): Promise<{ headCode: string; paise: number; lineId: string | null }[]> {
  const [have] = await tx.select({ n: sql<number>`count(*)::int` }).from(feePaymentAllocations).where(eq(feePaymentAllocations.paymentId, payment.id));
  if (have.n > 0) return (await tx.select().from(feePaymentAllocations).where(eq(feePaymentAllocations.paymentId, payment.id))).map((a) => ({ headCode: a.headCode, paise: a.amountPaise, lineId: a.lineId }));
  let pieces = given;
  if (!pieces) {
    // The payment is not paid yet, so the state is as it stood before it.
    const state = await lineState(tx, [payment.invoiceId]);
    const lines: LineBalance[] = state.map((l) => ({ id: l.id, invoiceId: l.invoiceId, headCode: l.headCode, priority: l.priority, balancePaise: l.balancePaise }));
    pieces = allocateAcross(lines, payment.amountPaise).map((x) => ({ lineId: x.line.id, headCode: x.line.headCode, paise: x.paise }));
    const placed = pieces.reduce((s, x) => s + x.paise, 0);
    // More than the lines show as due (they were squared after a direct change): the rest goes on the last line.
    if (placed < payment.amountPaise && state.length) {
      const last = state.at(-1)!;
      pieces.push({ lineId: last.id, headCode: last.headCode, paise: payment.amountPaise - placed });
    }
  }
  if (pieces.length) await tx.insert(feePaymentAllocations).values(pieces.map((x) => ({ tenantId: payment.tenantId, paymentId: payment.id, invoiceId: payment.invoiceId, lineId: x.lineId, headCode: x.headCode, amountPaise: x.paise })));
  return pieces.map((x) => ({ headCode: x.headCode, paise: x.paise, lineId: x.lineId }));
}

/** A refund takes its amount back off the payment's heads, highest priority number (paid last) first. */
export async function unallocate(tx: Tx, payment: { id: string; tenantId: string; invoiceId: string }, amount: number): Promise<void> {
  const rows = await tx
    .select({ lineId: feePaymentAllocations.lineId, headCode: feePaymentAllocations.headCode, paise: sql<number>`sum(${feePaymentAllocations.amountPaise})::bigint`.mapWith(Number), priority: sql<number>`coalesce(max(${feeInvoiceLines.priority}), 0)`.mapWith(Number) })
    .from(feePaymentAllocations)
    .leftJoin(feeInvoiceLines, eq(feeInvoiceLines.id, feePaymentAllocations.lineId))
    .where(eq(feePaymentAllocations.paymentId, payment.id))
    .groupBy(feePaymentAllocations.lineId, feePaymentAllocations.headCode);
  let left = amount;
  for (const r of rows.sort((a, b) => b.priority - a.priority)) {
    if (left <= 0) break;
    const take = Math.min(left, r.paise);
    if (take > 0) await tx.insert(feePaymentAllocations).values({ tenantId: payment.tenantId, paymentId: payment.id, invoiceId: payment.invoiceId, lineId: r.lineId, headCode: r.headCode, amountPaise: -take });
    left -= take;
  }
}
