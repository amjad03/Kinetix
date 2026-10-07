'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { ACTIVITY_KINDS, ENQUIRY_SOURCES, ENQUIRY_STAGES, type EnquiryDetail } from '@/lib/admissions';
import { isIsoDate } from '@/lib/dates';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (key: 'adm.err.invalid'): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t(key) });
const refresh = () => revalidatePath('/admissions', 'layout');

export async function loadEnquiry(id: string): Promise<ActionResult<EnquiryDetail>> {
  if (!UUID.test(id)) return bad('adm.err.invalid');
  return act(() => api<EnquiryDetail>(`/v1/admissions/enquiries/${id}`));
}

export async function createEnquiry(input: { name: string; phone: string; email?: string; programId?: string; source: string; message?: string }): Promise<ActionResult<unknown>> {
  if (!(ENQUIRY_SOURCES as readonly string[]).includes(input.source) || (input.programId && !UUID.test(input.programId))) return bad('adm.err.invalid');
  const body = { name: input.name.trim(), phone: input.phone.trim(), source: input.source, ...(input.email?.trim() ? { email: input.email.trim() } : {}), ...(input.programId ? { programId: input.programId } : {}), ...(input.message?.trim() ? { message: input.message.trim() } : {}) };
  const res = await act(() => api('/v1/admissions/enquiries', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function moveEnquiry(id: string, stage: string, reason?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !(ENQUIRY_STAGES as readonly string[]).includes(stage)) return bad('adm.err.invalid');
  const res = await act(() => api(`/v1/admissions/enquiries/${id}/stage`, { method: 'POST', body: { stage, ...(reason?.trim() ? { reason: reason.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function assignEnquiry(id: string, counsellorId: string | null): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || (counsellorId !== null && !UUID.test(counsellorId))) return bad('adm.err.invalid');
  const res = await act(() => api(`/v1/admissions/enquiries/${id}/assign`, { method: 'POST', body: { counsellorId } }));
  if (res.ok) refresh();
  return res;
}

export async function logActivity(id: string, input: { kind: string; note: string; nextFollowUpOn?: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !(ACTIVITY_KINDS as readonly string[]).includes(input.kind) || (input.nextFollowUpOn && !isIsoDate(input.nextFollowUpOn))) return bad('adm.err.invalid');
  const res = await act(() => api(`/v1/admissions/enquiries/${id}/activities`, { method: 'POST', body: { kind: input.kind, note: input.note.trim(), nextFollowUpOn: input.nextFollowUpOn || null } }));
  if (res.ok) refresh();
  return res;
}

// ---- applications ---------------------------------------------------------------------------------

export async function setApplicationStatus(id: string, status: string, reason?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !/^[a-z_]+$/.test(status)) return bad('adm.err.invalid');
  const res = await act(() => api(`/v1/admissions/applications/${id}/status`, { method: 'POST', body: { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function reviewDocument(applicationId: string, docId: string, status: 'verified' | 'rejected', note?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(applicationId) || !UUID.test(docId)) return bad('adm.err.invalid');
  const res = await act(() => api(`/v1/admissions/applications/${applicationId}/documents/${docId}/review`, { method: 'POST', body: { status, ...(note?.trim() ? { note: note.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function recordApplicationFee(id: string, input: { kind: 'counter'; method: 'cash' | 'cheque' | 'bank_transfer' | 'upi'; reference?: string } | { kind: 'waive'; reason: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad('adm.err.invalid');
  const res = await act(() =>
    input.kind === 'counter'
      ? api(`/v1/admissions/applications/${id}/fee/counter`, { method: 'POST', body: { method: input.method, ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}) } })
      : api(`/v1/admissions/applications/${id}/fee/waive`, { method: 'POST', body: { reason: input.reason.trim() } }),
  );
  if (res.ok) refresh();
  return res;
}

export async function enrollApplicant(id: string, sectionId?: string): Promise<ActionResult<{ studentId: string; className: string; rollNo: string }>> {
  if (!UUID.test(id) || (sectionId && !UUID.test(sectionId))) return bad('adm.err.invalid');
  const res = await act(() => api<{ studentId: string; className: string; rollNo: string }>(`/v1/admissions/applications/${id}/enroll`, { method: 'POST', body: sectionId ? { sectionId } : {} }));
  if (res.ok) {
    refresh();
    revalidatePath('/students', 'layout');
  }
  return res;
}

// ---- cycles and merit lists -----------------------------------------------------------------------

export async function createCycle(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const res = await act(() => api<{ id: string }>('/v1/admissions/cycles', { method: 'POST', body: input }));
  if (res.ok) refresh();
  return res;
}

export async function cycleAction(id: string, what: 'open' | 'close' | 'evaluate' | 'generate' | 'expire'): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad('adm.err.invalid');
  const call = () => {
    switch (what) {
      case 'open':
      case 'close':
        return api(`/v1/admissions/cycles/${id}/status`, { method: 'POST', body: { status: what === 'open' ? 'open' : 'closed' } });
      case 'evaluate':
        return api(`/v1/admissions/cycles/${id}/evaluate`, { method: 'POST' });
      case 'generate':
        return api(`/v1/admissions/cycles/${id}/merit-lists`, { method: 'POST' });
      default:
        return api(`/v1/admissions/cycles/${id}/expire-offers`, { method: 'POST' });
    }
  };
  const res = await act(call);
  if (res.ok) refresh();
  return res;
}

export async function publishMeritList(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad('adm.err.invalid');
  const res = await act(() => api(`/v1/admissions/merit-lists/${id}/publish`, { method: 'POST' }));
  if (res.ok) refresh();
  return res;
}
