'use server';

import { refuse } from '@/lib/procurement-fail';
import { revalidatePath } from 'next/cache';
import { qtyRows } from '@/lib/ops';
import { read, send, num, optStr } from '@/lib/ops-server';
import type { IPoDetail, IRfqDetail } from '@/lib/ops';
import type { RoomDay, Verification } from '@/lib/procurement';
import type { ActionResult } from '@/lib/types';

const PAGE = '/inventory';
const PROC = '/procurement';
type V = Record<string, string>;
const I = '/v1/inventory';
const id = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refreshes the other pages that show the same documents. */
const also = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));

export async function loadPo(poId: string): Promise<ActionResult<IPoDetail>> {
  return read<IPoDetail>(`${I}/purchase-orders/${id(poId)}`);
}

/** Stock movements: in (received), out (used or written off) and issue (handed to a person, and a department). */
export async function moveStock(kind: 'in' | 'out' | 'issue', v: V) {
  return send(`${I}/stock/${kind}`, { storeId: v.storeId, itemId: v.itemId, qty: num(v.qty), note: v.note ?? '', ...(kind === 'issue' ? { issuedTo: v.issuedTo, ...(optStr(v.departmentId) ? { departmentId: v.departmentId } : {}) } : {}) }, PAGE);
}

/** An indent: the lines the person asked for (`q_<itemId>` quantities), the department and when it is needed. */
export async function raiseRequisition(v: V) {
  const r = await send(`${I}/requisitions`, { reason: v.reason ?? '', ...(optStr(v.departmentId) ? { departmentId: v.departmentId } : {}), ...(optStr(v.neededBy) ? { neededBy: v.neededBy } : {}), lines: qtyRows(v, 'q_').map((x) => ({ itemId: x.id, qty: x.qty })) }, '/indents');
  if (r.ok) also(PROC, PAGE);
  return r;
}

export async function decideRequisition(reqId: string, approve: boolean, v: V = {}) {
  const r = await send(`${I}/requisitions/${id(reqId)}/decision`, { approve, ...(optStr(v.note) ? { note: v.note } : {}), ...(v.budgetOverride === 'yes' ? { budgetOverride: true } : {}) }, `/indents/${reqId}`);
  if (r.ok) also('/indents', PROC);
  return r;
}

/** A purchase order for an approved indent, at the prices typed in (`p_<itemId>`, paise), by the chosen purchase mode. */
export async function createPo(requisitionId: string, v: V, lines: { itemId: string; qty: number }[]) {
  const r = await send<{ id: string }>(
    `${I}/purchase-orders`,
    {
      requisitionId,
      vendorId: v.vendorId,
      storeId: v.storeId,
      ...(optStr(v.purchaseMode) ? { purchaseMode: v.purchaseMode } : {}),
      ...(optStr(v.gemRef) ? { gemRef: v.gemRef } : {}),
      ...(optStr(v.tenderRef) ? { tenderRef: v.tenderRef } : {}),
      ...(optStr(v.deliveryBy) ? { deliveryBy: v.deliveryBy } : {}),
      ...(optStr(v.terms) ? { terms: v.terms } : {}),
      lines: lines.map((l) => ({ ...l, unitPricePaise: num(v[`p_${l.itemId}`]) })),
    },
    PROC,
  );
  if (r.ok) also(`/indents/${requisitionId}`, '/indents');
  return r;
}

export async function decidePo(poId: string, approve: boolean, note: string) {
  return send(`${I}/purchase-orders/${id(poId)}/decision`, { approve, ...(note.trim() ? { note: note.trim() } : {}) }, `${PROC}/orders/${poId}`);
}

/** Changes an order's lines (`q_<lineId>`, `p_<lineId>` in paise) and sends it back for approval. */
export async function amendPo(poId: string, v: V, lines: { id: string; itemId: string }[]) {
  return send(`${I}/purchase-orders/${id(poId)}/amend`, { reason: v.reason, ...(optStr(v.deliveryBy) ? { deliveryBy: v.deliveryBy } : {}), lines: lines.map((l) => ({ poLineId: l.id, itemId: l.itemId, qty: num(v[`q_${l.id}`]), unitPricePaise: num(v[`p_${l.id}`]) })) }, `${PROC}/orders/${poId}`);
}

export async function saveCommittee(poId: string, v: V) {
  return send(`${I}/purchase-orders/${id(poId)}/committee`, { minutes: v.minutes, metOn: v.metOn, members: v.members }, `${PROC}/orders/${poId}`, 'PUT');
}

export async function cancelPo(poId: string, v: V) {
  return send(`${I}/purchase-orders/${id(poId)}/cancel`, { reason: v.reason }, `${PROC}/orders/${poId}`);
}

/** Goods arrive: accepted (`q_<lineId>`) and rejected (`r_<lineId>`) quantities; the key is made once per dialog, so a retry applies once. */
export async function receiveGoods(poId: string, v: V, key: string) {
  const accepted = Object.fromEntries(qtyRows(v, 'q_').map((x) => [x.id, x.qty]));
  const rejected = Object.fromEntries(qtyRows(v, 'r_').map((x) => [x.id, x.qty]));
  const lineIds = [...new Set([...Object.keys(accepted), ...Object.keys(rejected)])];
  const r = await send(`${I}/purchase-orders/${id(poId)}/receipts`, { idempotencyKey: key, note: v.note ?? '', ...(optStr(v.challanNo) ? { challanNo: v.challanNo } : {}), lines: lineIds.map((l) => ({ poLineId: l, qty: accepted[l] ?? 0, rejectedQty: rejected[l] ?? 0, ...(rejected[l] ? { rejectReason: v.rejectReason || undefined } : {}) })) }, `${PROC}/orders/${poId}`);
  if (r.ok) also(PAGE, PROC);
  return r;
}

export async function recordInvoice(poId: string, v: V) {
  return send(`${I}/purchase-orders/${id(poId)}/invoices`, { invoiceNo: v.invoiceNo, amountPaise: num(v.amount), ...(optStr(v.invoiceDate) ? { invoiceDate: v.invoiceDate } : {}) }, `${PROC}/orders/${poId}`);
}

export async function approveInvoice(invoiceId: string) {
  return send(`${I}/invoices/${id(invoiceId)}/approve`, undefined, PROC);
}

/** Pays an invoice under a payment voucher (mode, reference, date); open debit notes are set off. */
export async function markInvoicePaid(invoiceId: string, v: V = {}) {
  return send(`${I}/invoices/${id(invoiceId)}/paid`, { ...(optStr(v.paymentMode) ? { paymentMode: v.paymentMode } : {}), ...(optStr(v.paymentRef) ? { paymentRef: v.paymentRef } : {}), ...(optStr(v.paidOn) ? { paidOn: v.paidOn } : {}) }, PROC);
}

export async function loadRfq(rfqId: string): Promise<ActionResult<IRfqDetail>> {
  return read<IRfqDetail>(`${I}/rfqs/${id(rfqId)}`);
}

export async function openRfq(v: V) {
  return send(`${I}/rfqs`, { requisitionId: v.requisitionId, ...(optStr(v.closesOn) ? { closesOn: v.closesOn } : {}) }, PROC);
}

export async function addQuote(rfqId: string, v: V, itemIds: string[]) {
  return send(`${I}/rfqs/${id(rfqId)}/quotes`, { vendorId: v.vendorId, deliveryDays: num(v.deliveryDays || '0'), note: v.note ?? '', lines: itemIds.map((itemId) => ({ itemId, unitPricePaise: num(v[`p_${itemId}`]) })) }, PROC);
}

export async function awardQuote(rfqId: string, quoteId: string, v: V) {
  return send(`${I}/rfqs/${id(rfqId)}/award`, { quoteId, storeId: v.storeId }, PROC);
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

// ---- vendors and categories ------------------------------------------------------------------------

export async function setApprovedVendors(categoryId: string, vendorIds: string[]) {
  if (!UUID.test(categoryId) || vendorIds.some((v) => !UUID.test(v))) return refuse('ivd.err.notFound');
  return send(`${I}/categories/${id(categoryId)}/vendors`, { vendorIds }, PAGE, 'PUT');
}

export async function blacklistVendor(vendorId: string, v: V) {
  return send(`${I}/vendors/${id(vendorId)}/blacklist`, { reason: v.reason }, PROC);
}

export async function rateVendor(vendorId: string, v: V) {
  const r = await send(`${I}/vendors/${id(vendorId)}/ratings`, { quality: num(v.quality), delivery: num(v.delivery), price: num(v.price), note: v.note ?? '', ...(optStr(v.poId) ? { poId: v.poId } : {}) }, `${PROC}/vendors/${vendorId}`);
  if (r.ok) also(PROC);
  return r;
}

/** Raises one indent for the chosen low items at their reorder quantities. */
export async function reorderIndent(itemIds: string[]) {
  if (!itemIds.length || itemIds.some((v) => !UUID.test(v))) return refuse('ivd.err.notFound');
  const r = await send<{ id: string; number: string }>(`${I}/reorder/indent`, { itemIds }, PAGE);
  if (r.ok) also(PROC, '/indents');
  return r;
}

// ---- stock verification -----------------------------------------------------------------------------

export async function startVerification(v: V) {
  return send<{ id: string }>(`${I}/verifications`, { storeId: v.storeId, note: v.note ?? '' }, PAGE);
}

export async function loadVerification(vid: string): Promise<ActionResult<Verification>> {
  return read<Verification>(`${I}/verifications/${id(vid)}`);
}

export async function saveCounts(vid: string, counts: { itemId: string; countedQty: number; remark: string }[]) {
  if (!UUID.test(vid) || !counts.length) return refuse('ivd.err.notFound');
  return send(`${I}/verifications/${id(vid)}/counts`, { counts }, `${PAGE}/verifications/${vid}`, 'PUT');
}

export async function closeVerification(vid: string, adjust: boolean) {
  const r = await send(`${I}/verifications/${id(vid)}/close`, { adjust }, `${PAGE}/verifications/${vid}`);
  if (r.ok) also(PAGE);
  return r;
}

// ---- facilities ---------------------------------------------------------------------------------------

export async function roomDay(roomId: string, date: string): Promise<ActionResult<RoomDay>> {
  if (!UUID.test(roomId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return refuse('ivd.err.notFound');
  return read<RoomDay>(`/v1/facilities/rooms/${id(roomId)}/day?date=${date}`);
}

export async function decideBooking(bookingId: string, approve: boolean, v: V = {}) {
  return send(`/v1/facilities/bookings/${id(bookingId)}/decision`, { approve, ...(optStr(v.note) ? { note: v.note } : {}) }, '/facilities');
}

export async function cancelBooking(bookingId: string, v: V = {}) {
  return send(`/v1/facilities/bookings/${id(bookingId)}/cancel`, { ...(optStr(v.note) ? { note: v.note } : {}) }, '/facilities');
}

/** Moves a maintenance ticket on (assign, start, hold, resolve with what was done and its cost, close, reopen). */
export async function moveTicket(ticketId: string, status: string, v: V = {}) {
  return send(`/v1/facilities/tickets/${id(ticketId)}/status`, { status, ...(optStr(v.assigneeName) ? { assigneeName: v.assigneeName } : {}), ...(optStr(v.resolution) ? { resolution: v.resolution } : {}), ...(optStr(v.cost) ? { costPaise: num(v.cost) } : {}), ...(optStr(v.note) ? { note: v.note } : {}) }, '/facilities');
}

export async function rateTicket(ticketId: string, v: V) {
  return send(`/v1/facilities/tickets/${id(ticketId)}/feedback`, { rating: num(v.rating), reopen: v.reopen === 'yes', ...(optStr(v.note) ? { note: v.note } : {}) }, '/facilities');
}
