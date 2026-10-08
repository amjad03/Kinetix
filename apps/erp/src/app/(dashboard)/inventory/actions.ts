'use server';

import { qtyRows } from '@/lib/ops';
import { read, send, num, optStr } from '@/lib/ops-server';
import type { IPoDetail, IRfqDetail } from '@/lib/ops';
import type { ActionResult } from '@/lib/types';

const PAGE = '/inventory';
type V = Record<string, string>;
const I = '/v1/inventory';
const id = encodeURIComponent;

export async function loadPo(poId: string): Promise<ActionResult<IPoDetail>> {
  return read<IPoDetail>(`${I}/purchase-orders/${id(poId)}`);
}

export async function addItem(v: V) {
  return send(`${I}/items`, { sku: v.sku, name: v.name, category: v.category || 'general', unit: v.unit || 'nos', reorderLevel: num(v.reorderLevel || '0') }, PAGE);
}

export async function addStore(v: V) {
  return send(`${I}/stores`, { name: v.name, location: v.location ?? '' }, PAGE);
}

export async function addVendor(v: V) {
  return send(`${I}/vendors`, { name: v.name, phone: v.phone ?? '', ...(optStr(v.gstin) ? { gstin: v.gstin } : {}), ...(optStr(v.email) ? { email: v.email } : {}) }, PAGE);
}

/** Stock movements: in (received), out (used or written off) and issue (handed to someone). */
export async function moveStock(kind: 'in' | 'out' | 'issue', v: V) {
  return send(`${I}/stock/${kind}`, { storeId: v.storeId, itemId: v.itemId, qty: num(v.qty), note: v.note ?? '', ...(kind === 'issue' ? { issuedTo: v.issuedTo } : {}) }, PAGE);
}

export async function raiseRequisition(v: V) {
  return send(`${I}/requisitions`, { reason: v.reason ?? '', lines: qtyRows(v, 'q_').map((r) => ({ itemId: r.id, qty: r.qty })) }, PAGE);
}

export async function decideRequisition(reqId: string, approve: boolean, v: V = {}) {
  return send(`${I}/requisitions/${id(reqId)}/decision`, { approve, ...(optStr(v.note) ? { note: v.note } : {}) }, PAGE);
}

export async function createPo(requisitionId: string, v: V, lines: { itemId: string; qty: number }[]) {
  return send(`${I}/purchase-orders`, { requisitionId, vendorId: v.vendorId, storeId: v.storeId, lines: lines.map((l) => ({ ...l, unitPricePaise: num(v[`p_${l.itemId}`]) })) }, PAGE);
}

/** The key is made once per dialog, so a retried receipt adds the stock once. */
export async function receiveGoods(poId: string, v: V, key: string) {
  return send(`${I}/purchase-orders/${id(poId)}/receipts`, { idempotencyKey: key, note: v.note ?? '', lines: qtyRows(v, 'q_').map((r) => ({ poLineId: r.id, qty: r.qty })) }, PAGE);
}

export async function recordInvoice(poId: string, v: V) {
  return send(`${I}/purchase-orders/${id(poId)}/invoices`, { invoiceNo: v.invoiceNo, amountPaise: num(v.amount) }, PAGE);
}

export async function approveInvoice(invoiceId: string) {
  return send(`${I}/invoices/${id(invoiceId)}/approve`, undefined, PAGE);
}

export async function markInvoicePaid(invoiceId: string) {
  return send(`${I}/invoices/${id(invoiceId)}/paid`, undefined, PAGE);
}

export async function loadRfq(rfqId: string): Promise<ActionResult<IRfqDetail>> {
  return read<IRfqDetail>(`${I}/rfqs/${id(rfqId)}`);
}

export async function openRfq(v: V) {
  return send(`${I}/rfqs`, { requisitionId: v.requisitionId, ...(optStr(v.closesOn) ? { closesOn: v.closesOn } : {}) }, PAGE);
}

export async function addQuote(rfqId: string, v: V, itemIds: string[]) {
  return send(`${I}/rfqs/${id(rfqId)}/quotes`, { vendorId: v.vendorId, deliveryDays: num(v.deliveryDays || '0'), note: v.note ?? '', lines: itemIds.map((itemId) => ({ itemId, unitPricePaise: num(v[`p_${itemId}`]) })) }, PAGE);
}

export async function awardQuote(rfqId: string, quoteId: string, v: V) {
  return send(`${I}/rfqs/${id(rfqId)}/award`, { quoteId, storeId: v.storeId }, PAGE);
}

export async function transferStock(v: V) {
  return send(`${I}/stock/transfers`, { fromStoreId: v.fromStoreId, toStoreId: v.toStoreId, itemId: v.itemId, qty: num(v.qty), note: v.note ?? '' }, PAGE);
}

export async function returnToVendor(v: V) {
  return send(`${I}/returns`, { kind: 'vendor', poId: v.poId, itemId: v.itemId, qty: num(v.qty), reason: v.reason }, PAGE);
}

export async function returnFromIssue(v: V) {
  return send(`${I}/returns`, { kind: 'issue', storeId: v.storeId, itemId: v.itemId, qty: num(v.qty), issuedTo: v.issuedTo, reason: v.reason }, PAGE);
}
