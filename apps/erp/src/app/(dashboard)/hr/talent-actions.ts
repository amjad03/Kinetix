'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';
import type { OnboardingItem } from '@/lib/hr-lifecycle';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });
const refresh = () => revalidatePath('/hr', 'layout');
const paise = (rupees: number) => Math.round(rupees * 100);

type Scores = Record<string, { score: number; evidence?: string }>;

// ---- appraisal -----------------------------------------------------------------------------------------

export async function createCycle(input: { period: string; opensOn: string; closesOn: string }): Promise<ActionResult<unknown>> {
  if (input.period.trim().length < 4 || !DAY.test(input.opensOn) || !DAY.test(input.closesOn)) return bad();
  const res = await act(() => api('/v1/hr/appraisal-cycles', { method: 'POST', body: { period: input.period.trim(), opensOn: input.opensOn, closesOn: input.closesOn } }));
  if (res.ok) refresh();
  return res;
}

export async function closeCycle(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/appraisal-cycles/${id}/close`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

export async function saveSelfAppraisal(cycleId: string, scores: Scores, submit: boolean): Promise<ActionResult<unknown>> {
  if (!UUID.test(cycleId)) return bad();
  const res = await act(() => api('/v1/hr/appraisals/me', { method: 'PUT', body: { cycleId, scores, submit } }));
  if (res.ok) refresh();
  return res;
}

export async function hodReview(id: string, scores: Scores, remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/appraisals/${id}/hod-review`, { method: 'PUT', body: { scores, remarks: remarks.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function finaliseAppraisal(id: string, finalPercent: number | null, remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/appraisals/${id}/finalise`, { method: 'PUT', body: { ...(finalPercent == null ? {} : { finalPercent }), remarks: remarks.trim() } }));
  if (res.ok) refresh();
  return res;
}

// ---- training ------------------------------------------------------------------------------------------

export async function addTraining(input: { userId: string; title: string; kind: string; organiser: string; startsOn: string; endsOn: string; hours: number; certificateRef: string }): Promise<ActionResult<unknown>> {
  if (input.title.trim().length < 3 || !DAY.test(input.startsOn) || !DAY.test(input.endsOn) || !(input.hours >= 0) || (input.userId && !UUID.test(input.userId))) return bad();
  const body = {
    ...(input.userId ? { userId: input.userId } : {}),
    title: input.title.trim(),
    kind: input.kind,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    hours: input.hours,
    ...(input.organiser.trim() ? { organiser: input.organiser.trim() } : {}),
    ...(input.certificateRef.trim() ? { certificateRef: input.certificateRef.trim() } : {}),
  };
  const res = await act(() => api('/v1/hr/training-records', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function verifyTraining(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/training-records/${id}/verify`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

export async function removeTraining(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/training-records/${id}`, { method: 'DELETE' }));
  if (res.ok) refresh();
  return res;
}

// ---- offer letters -------------------------------------------------------------------------------------

export async function issueOffer(applicantId: string, input: { ctcRupees: number; joiningOn: string; validUntil: string; terms: string }): Promise<ActionResult<{ id: string; offerNo: string }>> {
  if (!UUID.test(applicantId) || !(input.ctcRupees > 0) || !DAY.test(input.joiningOn) || !DAY.test(input.validUntil)) return bad();
  const res = await act(() => api<{ id: string; offerNo: string }>(`/v1/hr/applicants/${applicantId}/offer`, { method: 'POST', body: { annualCtcPaise: paise(input.ctcRupees), joiningOn: input.joiningOn, validUntil: input.validUntil, terms: input.terms.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function setOfferStatus(id: string, status: 'accepted' | 'declined' | 'withdrawn'): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/offers/${id}/status`, { method: 'PUT', body: { status } }));
  if (res.ok) refresh();
  return res;
}

export async function loadOffers(applicantId: string): Promise<ActionResult<{ id: string; offerNo: string; status: string; joiningOn: string; annualCtcPaise: number }[]>> {
  if (!UUID.test(applicantId)) return bad();
  return act(() => api(`/v1/hr/applicants/${applicantId}/offers`));
}

// ---- onboarding ----------------------------------------------------------------------------------------

export async function startOnboarding(userId: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(userId)) return bad();
  const res = await act(() => api(`/v1/hr/staff/${userId}/onboarding/start`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

export async function loadOnboarding(userId: string): Promise<ActionResult<OnboardingItem[]>> {
  if (!UUID.test(userId)) return bad();
  return act(() => api<OnboardingItem[]>(`/v1/hr/staff/${userId}/onboarding`));
}

export async function tickOnboarding(id: string, done: boolean): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/onboarding/${id}/done`, { method: 'PUT', body: { done } }));
  if (res.ok) refresh();
  return res;
}

export async function addOnboardingItem(userId: string, title: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(userId) || title.trim().length < 3) return bad();
  return act(() => api(`/v1/hr/staff/${userId}/onboarding`, { method: 'POST', body: { title: title.trim(), owner: 'HR' } }));
}

// ---- exit ----------------------------------------------------------------------------------------------

export async function recordResignation(input: { userId: string; reason: string; noticeDays: number; lastWorkingDay: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(input.userId) || input.reason.trim().length < 3 || !(input.noticeDays >= 0)) return bad();
  const body = { userId: input.userId, reason: input.reason.trim(), noticeDays: input.noticeDays, ...(DAY.test(input.lastWorkingDay) ? { lastWorkingDay: input.lastWorkingDay } : {}) };
  const res = await act(() => api('/v1/hr/separations', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function acceptResignation(id: string, lastWorkingDay: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/separations/${id}/accept`, { method: 'POST', body: DAY.test(lastWorkingDay) ? { lastWorkingDay } : {} }));
  if (res.ok) refresh();
  return res;
}

export async function setClearance(id: string, department: string, status: 'cleared' | 'pending', duesRupees: number, remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !/^[A-Za-z]{2,20}$/.test(department) || !(duesRupees >= 0)) return bad();
  const res = await act(() => api(`/v1/hr/separations/${id}/clearances/${department}`, { method: 'PUT', body: { status, duesPaise: paise(duesRupees), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function saveSettlement(id: string, amountRupees: number, note: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !Number.isFinite(amountRupees) || note.trim().length < 5) return bad();
  const res = await act(() => api(`/v1/hr/separations/${id}/settlement`, { method: 'PUT', body: { settlementPaise: paise(amountRupees), note: note.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function relieveEmployee(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/separations/${id}/relieve`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

export async function withdrawResignation(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/separations/${id}/withdraw`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}
