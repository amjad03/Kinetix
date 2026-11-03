import { BadRequestException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { accountByCode, ensureAccount, postVoucher } from '../books/books.service.js';
import { POSTING, type GroupType } from '../books/books.logic.js';
import { readSettings } from '../campus-ops/settings.js';
import type { Tx } from '../db/db.service.js';
import { invInvoices, invItems, invPoLines, invPurchaseOrders, invStockMoves, invVendors } from '../db/schema.js';

/**
 * The accounts the stores, purchase and asset postings use. They are added to the chart the first time they are needed
 * (the default chart already has Fixed Assets 1200, Sundry Creditors 2000 and Depreciation 5300).
 */
export const STORE_ACCOUNTS: Record<string, { code: string; name: string; group: GroupType }> = {
  fixedAssets: { code: '1200', name: 'Fixed Assets', group: 'asset' },
  accumulated: { code: '1210', name: 'Accumulated Depreciation', group: 'asset' },
  inputGst: { code: '1250', name: 'Input GST', group: 'asset' },
  stores: { code: '1300', name: 'Stores and Inventory', group: 'asset' },
  creditors: { code: '2000', name: 'Sundry Creditors', group: 'liability' },
  gain: { code: '4200', name: 'Profit on Sale of Assets', group: 'income' },
  depreciation: { code: '5300', name: 'Depreciation', group: 'expense' },
  consumed: { code: '5400', name: 'Stores Consumed', group: 'expense' },
  losses: { code: '5410', name: 'Stock Losses and Write-offs', group: 'expense' },
  loss: { code: '5420', name: 'Loss on Sale of Assets', group: 'expense' },
};
type Key = keyof typeof STORE_ACCOUNTS;

const acct = async (tx: Tx, tenantId: string, k: Key) => (await ensureAccount(tx, tenantId, STORE_ACCOUNTS[k].code, STORE_ACCOUNTS[k].name, STORE_ACCOUNTS[k].group)).id;

/** Whether automatic postings are on (procurement settings, `postToBooks`). */
export async function booksOn(tx: Tx, tenantId: string) {
  return (await readSettings(tx, tenantId, 'procurement')).rules.postToBooks !== false;
}

/** Lines to a voucher: drops zero lines and merges lines on the same account and side. */
function lines(xs: { accountId: string; debitPaise?: number; creditPaise?: number }[]) {
  const m = new Map<string, { accountId: string; debitPaise: number; creditPaise: number }>();
  for (const x of xs) {
    const d = Math.max(0, x.debitPaise ?? 0);
    const c = Math.max(0, x.creditPaise ?? 0);
    if (!d && !c) continue;
    const key = `${x.accountId}:${d ? 'd' : 'c'}`;
    const cur = m.get(key) ?? { accountId: x.accountId, debitPaise: 0, creditPaise: 0 };
    cur.debitPaise += d;
    cur.creditPaise += c;
    m.set(key, cur);
  }
  return [...m.values()];
}

/**
 * A vendor invoice accepted (matched, or a mismatch approved) becomes a purchase journal: the goods to Stores and
 * Inventory, or to Fixed Assets for durables and anything at or above the capitalisation limit a unit; the GST to
 * Input GST when the institution takes input credit (otherwise it is part of the cost); the invoice total to the
 * vendor's account under Sundry Creditors. Posting the same invoice twice returns the first voucher.
 */
export async function postPurchaseInvoice(tx: Tx, ctx: { tenantId: string; userId: string }, invoiceId: string, date: string) {
  const [inv] = await tx.select({ i: invInvoices, po: invPurchaseOrders, vendor: invVendors.name }).from(invInvoices).innerJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invInvoices.poId)).innerJoin(invVendors, eq(invVendors.id, invInvoices.vendorId)).where(eq(invInvoices.id, invoiceId));
  if (!inv) throw new BadRequestException('Invoice not found');
  const rules = (await readSettings(tx, ctx.tenantId, 'procurement')).rules;
  const capitalAbove = Number((await readSettings(tx, ctx.tenantId, 'assets')).rules.capitaliseAbovePaise ?? 0);
  const itc = rules.gstInputCredit === true;
  const pl = await tx.select({ qty: invPoLines.receivedQty, price: invPoLines.unitPricePaise, type: invItems.itemType }).from(invPoLines).innerJoin(invItems, eq(invItems.id, invPoLines.itemId)).where(eq(invPoLines.poId, inv.po.id));
  const isCapital = (l: { price: number; type: string }) => l.type === 'durable' || (capitalAbove > 0 && l.price >= capitalAbove);
  const received = pl.reduce((s, l) => s + l.qty * l.price, 0);
  const capitalShare = received > 0 ? pl.filter(isCapital).reduce((s, l) => s + l.qty * l.price, 0) / received : 0;
  const tax = inv.i.cgstPaise + inv.i.sgstPaise + inv.i.igstPaise;
  const goods = itc ? inv.i.amountPaise - tax : inv.i.amountPaise;
  const capital = Math.round(goods * capitalShare);
  const v = await postVoucher(tx, ctx, {
    type: 'journal',
    date,
    narration: `Purchase: ${inv.vendor} invoice ${inv.i.invoiceNo} on ${inv.po.number}`,
    lines: lines([
      { accountId: await acct(tx, ctx.tenantId, 'stores'), debitPaise: goods - capital },
      { accountId: await acct(tx, ctx.tenantId, 'fixedAssets'), debitPaise: capital },
      ...(itc ? [{ accountId: await acct(tx, ctx.tenantId, 'inputGst'), debitPaise: tax }] : []),
      { accountId: await acct(tx, ctx.tenantId, 'creditors'), creditPaise: inv.i.amountPaise },
    ]),
    sourceType: 'inv_invoice',
    sourceId: invoiceId,
    departmentId: inv.po.departmentId,
  });
  await tx.update(invInvoices).set({ journalVoucherId: v.id }).where(eq(invInvoices.id, invoiceId));
  return v;
}

/**
 * Paying an invoice: a payment voucher clearing the vendor's account for the invoice total, the bank paying the net,
 * and the debit notes set off (goods rejected or returned) taken back out of Stores and Inventory.
 */
export async function postInvoicePayment(tx: Tx, ctx: { tenantId: string; userId: string }, invoiceId: string, p: { date: string; netPaise: number; debitPaise: number; voucherNo: string; cash: boolean }) {
  const [inv] = await tx.select({ i: invInvoices, vendor: invVendors.name, dept: invPurchaseOrders.departmentId }).from(invInvoices).innerJoin(invVendors, eq(invVendors.id, invInvoices.vendorId)).innerJoin(invPurchaseOrders, eq(invPurchaseOrders.id, invInvoices.poId)).where(eq(invInvoices.id, invoiceId));
  const money = await accountByCode(tx, p.cash ? POSTING.cash : POSTING.bank);
  const v = await postVoucher(tx, ctx, {
    type: 'payment',
    date: p.date,
    narration: `${p.voucherNo}: paid ${inv.vendor} for invoice ${inv.i.invoiceNo}${p.debitPaise ? `, less debit notes ₹${(p.debitPaise / 100).toFixed(2)}` : ''}`,
    lines: lines([
      { accountId: await acct(tx, ctx.tenantId, 'creditors'), debitPaise: inv.i.amountPaise },
      { accountId: money.id, creditPaise: p.netPaise },
      { accountId: await acct(tx, ctx.tenantId, 'stores'), creditPaise: p.debitPaise },
    ]),
    sourceType: 'inv_payment',
    sourceId: invoiceId,
    departmentId: inv.dept,
  });
  await tx.update(invInvoices).set({ paymentVoucherId: v.id }).where(eq(invInvoices.id, invoiceId));
  return v;
}

/** A year's depreciation for the assets just posted: one journal, depreciation against accumulated depreciation. */
export async function postDepreciationJournal(tx: Tx, ctx: { tenantId: string; userId: string }, p: { fiscalYear: string; date: string; totalPaise: number; runId: string; count: number }) {
  return postVoucher(tx, ctx, {
    type: 'journal',
    date: p.date,
    narration: `Depreciation ${p.fiscalYear} on ${p.count} asset${p.count === 1 ? '' : 's'} (Companies Act, Schedule II)`,
    lines: lines([{ accountId: await acct(tx, ctx.tenantId, 'depreciation'), debitPaise: p.totalPaise }, { accountId: await acct(tx, ctx.tenantId, 'accumulated'), creditPaise: p.totalPaise }]),
    sourceType: 'asset_depreciation',
    sourceId: `${p.fiscalYear}:${p.runId}`,
  });
}

/**
 * Disposal of an asset: the cost leaves Fixed Assets, its accumulated depreciation is cleared, the proceeds come into
 * the bank (a receipt) and the difference from book value is the profit or loss on sale.
 */
export async function postDisposal(tx: Tx, ctx: { tenantId: string; userId: string }, p: { assetId: string; tag: string; name: string; date: string; costPaise: number; accumulatedPaise: number; proceedsPaise: number }) {
  const gain = p.proceedsPaise - (p.costPaise - p.accumulatedPaise);
  const bank = await accountByCode(tx, POSTING.bank);
  return postVoucher(tx, ctx, {
    type: p.proceedsPaise > 0 ? 'receipt' : 'journal',
    date: p.date,
    narration: `Disposal of ${p.name} (${p.tag})`,
    lines: lines([
      { accountId: bank.id, debitPaise: p.proceedsPaise },
      { accountId: await acct(tx, ctx.tenantId, 'accumulated'), debitPaise: p.accumulatedPaise },
      { accountId: await acct(tx, ctx.tenantId, 'loss'), debitPaise: gain < 0 ? -gain : 0 },
      { accountId: await acct(tx, ctx.tenantId, 'fixedAssets'), creditPaise: p.costPaise },
      { accountId: await acct(tx, ctx.tenantId, 'gain'), creditPaise: gain > 0 ? gain : 0 },
    ]),
    sourceType: 'asset_disposal',
    sourceId: p.assetId,
  });
}

/** The stock moves of a month (in the institution's time zone) by what they do to the books. */
export async function monthMovements(tx: Tx, month: string) {
  const rows = await tx
    .select({ kind: invStockMoves.kind, value: sql<number>`coalesce(sum(${invStockMoves.valuePaise}), 0)::bigint`.mapWith(Number) })
    .from(invStockMoves)
    .where(and(sql`to_char(${invStockMoves.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM') = ${month}`, inArray(invStockMoves.kind, ['issue', 'return_issue', 'out', 'write_off', 'verify_adjust'])))
    .groupBy(invStockMoves.kind);
  const v = (k: string) => rows.find((r) => r.kind === k)?.value ?? 0;
  // Issues are negative values; returns of issues positive: consumption is what left, net.
  const consumed = -(v('issue') + v('return_issue'));
  const losses = -(v('out') + v('write_off') + v('verify_adjust'));
  return { consumedPaise: consumed, lossesPaise: losses };
}

/**
 * A month's stores journal: what departments consumed (issues less returns) to Stores Consumed, and write-offs and
 * verification differences to Stock Losses, out of Stores and Inventory. Only a month that has ended; once per month.
 */
export async function postMonthStores(tx: Tx, ctx: { tenantId: string; userId: string }, month: string, lastDay: string) {
  const m = await monthMovements(tx, month);
  const outOf = m.consumedPaise + m.lossesPaise;
  if (m.consumedPaise === 0 && m.lossesPaise === 0) return null;
  const stores = await acct(tx, ctx.tenantId, 'stores');
  return postVoucher(tx, ctx, {
    type: 'journal',
    date: lastDay,
    narration: `Stores consumed and written off in ${month}`,
    lines: lines([
      { accountId: await acct(tx, ctx.tenantId, 'consumed'), debitPaise: m.consumedPaise, creditPaise: -m.consumedPaise },
      { accountId: await acct(tx, ctx.tenantId, 'losses'), debitPaise: m.lossesPaise, creditPaise: -m.lossesPaise },
      { accountId: stores, creditPaise: outOf, debitPaise: -outOf },
    ]),
    sourceType: 'inv_stores_month',
    sourceId: month,
  });
}
