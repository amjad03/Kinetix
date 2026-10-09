'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
const refresh = () => revalidatePath('/admissions', 'layout');
const paise = (rupees: number) => Math.round(rupees * 100);

export interface AttemptRow {
  id: string;
  applicationId: string;
  applicantName: string;
  applicationNo: string;
  startedAt: string;
  submittedAt: string | null;
  answered: number;
  score: number | null;
}

// ---- agents and commission ---------------------------------------------------------------------------

export async function createAgent(input: { name: string; kind: 'agent' | 'partner'; phone: string; email: string; commissionRupees: number; referralCode: string }): Promise<ActionResult<unknown>> {
  if (input.name.trim().length < 2 || !(input.commissionRupees >= 0)) return bad();
  const body = {
    name: input.name.trim(),
    kind: input.kind,
    commissionPaise: paise(input.commissionRupees),
    ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.email.trim() ? { email: input.email.trim() } : {}),
    ...(input.referralCode.trim() ? { referralCode: input.referralCode.trim() } : {}),
  };
  const res = await act(() => api('/v1/admissions/agents', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function setAgentActive(id: string, active: boolean): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/admissions/agents/${id}`, { method: 'PATCH', body: { active } }));
  if (res.ok) refresh();
  return res;
}

export async function payCommission(id: string, paidOn: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return bad();
  const res = await act(() => api('/v1/admissions/commissions/pay', { method: 'POST', body: { ids: [id], paidOn } }));
  if (res.ok) refresh();
  return res;
}

// ---- interviews ----------------------------------------------------------------------------------------

/** A browser date-and-time value is the institution's local time (IST). */
const slotIso = (local: string) => new Date(`${local}:00+05:30`).toISOString();

export async function scheduleInterview(input: { applicationId: string; slotAt: string; venue: string; panel: string }): Promise<ActionResult<unknown>> {
  const names = input.panel.split('\n').map((n) => n.trim()).filter(Boolean);
  if (!UUID.test(input.applicationId) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.slotAt) || names.length === 0) return bad();
  const body = { applicationId: input.applicationId, slotAt: slotIso(input.slotAt), ...(input.venue.trim() ? { venue: input.venue.trim() } : {}), panel: names.map((name) => ({ userId: null, name })) };
  const res = await act(() => api('/v1/admissions/interviews', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function saveSheet(id: string, criteria: { criterion: string; score: number; max: number }[], remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || criteria.length === 0) return bad();
  const res = await act(() => api(`/v1/admissions/interviews/${id}/sheet`, { method: 'PUT', body: { criteria, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function completeInterview(id: string, outcome: string, remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !['selected', 'waitlisted', 'rejected'].includes(outcome)) return bad();
  const res = await act(() => api(`/v1/admissions/interviews/${id}/complete`, { method: 'POST', body: { outcome, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function cancelInterview(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/admissions/interviews/${id}`, { method: 'PATCH', body: { cancel: true } }));
  if (res.ok) refresh();
  return res;
}

export async function markNoShow(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/admissions/interviews/${id}/no-show`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

// ---- online entrance test ------------------------------------------------------------------------------

export async function addQuestion(input: { topic: string; question: string; options: string; correct: number; marks: number }): Promise<ActionResult<unknown>> {
  const options = input.options.split('\n').map((o) => o.trim()).filter(Boolean);
  if (input.question.trim().length < 5 || options.length < 2 || options.length > 6 || !(input.correct >= 1 && input.correct <= options.length) || !(input.marks > 0)) return bad();
  const body = { topic: input.topic.trim() || 'General', question: input.question.trim(), options, correctIndex: input.correct - 1, marks: input.marks };
  const res = await act(() => api('/v1/admissions/entrance-questions', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function retireQuestion(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/admissions/entrance-questions/${id}`, { method: 'DELETE' }));
  if (res.ok) refresh();
  return res;
}

export async function configureOnlineTest(testId: string, input: { questionCount: number; negativeMarks: number; open: boolean }): Promise<ActionResult<unknown>> {
  if (!UUID.test(testId) || !(input.questionCount >= 1) || !(input.negativeMarks >= 0)) return bad();
  const res = await act(() => api(`/v1/admissions/entrance-tests/${testId}/online`, { method: 'PUT', body: input }));
  if (res.ok) refresh();
  return res;
}

export async function getAttempts(testId: string): Promise<ActionResult<AttemptRow[]>> {
  if (!UUID.test(testId)) return bad();
  return act(() => api<AttemptRow[]>(`/v1/admissions/entrance-tests/${testId}/attempts`));
}
