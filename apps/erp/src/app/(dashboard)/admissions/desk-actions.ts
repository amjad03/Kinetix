'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { DuplicateEnquiry, RefundQuote } from '@/lib/admissions-desk';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
const refresh = () => revalidatePath('/admissions', 'layout');

export async function enquiryDuplicates(id: string): Promise<ActionResult<DuplicateEnquiry[]>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<DuplicateEnquiry[]>(`/v1/admissions/enquiries/${id}/duplicates`));
}

export async function mergeEnquiries(id: string, mergeIds: string[]): Promise<ActionResult<{ id: string; merged: number }>> {
  if (!UUID.test(id) || !mergeIds.length || mergeIds.some((m) => !UUID.test(m))) return bad();
  const res = await act(() => api<{ id: string; merged: number }>(`/v1/admissions/enquiries/${id}/merge`, { method: 'POST', body: { mergeIds } }));
  if (res.ok) refresh();
  return res;
}

export async function raiseAdmissionRequest(id: string, input: { kind: 'management_quota' | 'cancellation' | 'programme_change'; reason: string; declaration?: boolean; toCycleId?: string; cancelOn?: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || (input.toCycleId && !UUID.test(input.toCycleId)) || (input.cancelOn && !DAY.test(input.cancelOn))) return bad();
  const res = await act(() => api(`/v1/admissions/applications/${id}/requests`, { method: 'POST', body: { ...input, reason: input.reason.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function decideAdmissionRequest(id: string, decision: 'approve' | 'reject', note?: string): Promise<ActionResult<{ result: string }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ result: string }>(`/v1/admissions/requests/${id}/decide`, { method: 'POST', body: { decision, ...(note?.trim() ? { note: note.trim() } : {}) } }));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

export async function refundQuoteOn(id: string, on: string): Promise<ActionResult<RefundQuote>> {
  if (!UUID.test(id) || !DAY.test(on)) return bad();
  return act(() => api<RefundQuote>(`/v1/admissions/applications/${id}/refund-quote?on=${on}`));
}

export async function receiveOriginals(id: string, items: { document: string; referenceNo?: string }[], receivedOn?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !items.length || (receivedOn && !DAY.test(receivedOn))) return bad();
  const res = await act(() => api(`/v1/admissions/applications/${id}/custody`, { method: 'POST', body: { items: items.map((i) => ({ document: i.document.trim(), ...(i.referenceNo?.trim() ? { referenceNo: i.referenceNo.trim() } : {}) })), ...(receivedOn ? { receivedOn } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function returnOriginal(id: string, input: { returnedTo: string; acknowledgement: string; returnedOn?: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || (input.returnedOn && !DAY.test(input.returnedOn))) return bad();
  const res = await act(() => api(`/v1/admissions/custody/${id}/return`, { method: 'POST', body: { returnedTo: input.returnedTo.trim(), acknowledgement: input.acknowledgement.trim(), ...(input.returnedOn ? { returnedOn: input.returnedOn } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function setAdmissionKind(id: string, input: { admissionType?: string; entryTermOverride?: number | null; nationality?: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/admissions/applications/${id}/admission-kind`, { method: 'PATCH', body: input }));
  if (res.ok) refresh();
  return res;
}

export async function loadUgcSlabs(): Promise<ActionResult<{ added: number }>> {
  const res = await act(() => api<{ added: number }>('/v1/admissions/refund-slabs/ugc', { method: 'POST' }));
  if (res.ok) refresh();
  return res;
}
