'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { Clearance, Eligibility, RebalancePlan, RollOrder, RollPlan, StudentDetails } from '@/lib/student-info';
import { CLEARANCE_PURPOSES, ROLL_ORDERS } from '@/lib/student-info';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
const refresh = () => revalidatePath('/students', 'layout');

type Value = string | number | boolean | null;

/** Saves profile details: fixed fields, custom fields and (when given) the Aadhaar number. */
export async function saveStudentDetails(id: string, input: { values?: Record<string, Value>; custom?: Record<string, Value>; aadhaar?: string | null }): Promise<ActionResult<StudentDetails>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<StudentDetails>(`/v1/students/${id}/details`, { method: 'PUT', body: input }));
  if (res.ok) refresh();
  return res;
}

export async function giveAdmissionNo(id: string): Promise<ActionResult<{ admissionNo: string }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ admissionNo: string }>(`/v1/students/${id}/admission-no`, { method: 'POST' }));
  if (res.ok) refresh();
  return res;
}

export async function requestDetailChange(id: string, input: { field: string; newValue: string; reason: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !/^[a-zA-Z.][a-zA-Z0-9_.]{1,60}$/.test(input.field)) return bad();
  const res = await act(() => api(`/v1/students/${id}/change-requests`, { method: 'POST', body: { field: input.field, newValue: input.newValue.trim(), reason: input.reason.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function decideDetailChange(id: string, decision: 'approve' | 'reject', note?: string): Promise<ActionResult<{ result: string }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ result: string }>(`/v1/student-change-requests/${id}/decide`, { method: 'POST', body: { decision, ...(note?.trim() ? { note: note.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function startClearance(id: string, purpose: string, note?: string): Promise<ActionResult<Clearance>> {
  if (!UUID.test(id) || !(CLEARANCE_PURPOSES as readonly string[]).includes(purpose)) return bad();
  const res = await act(() => api<Clearance>(`/v1/students/${id}/clearances`, { method: 'POST', body: { purpose, ...(note?.trim() ? { note: note.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function recheckClearance(id: string): Promise<ActionResult<Clearance>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<Clearance>(`/v1/student-clearances/${id}/recheck`, { method: 'POST' }));
  if (res.ok) refresh();
  return res;
}

export async function loadClearance(id: string): Promise<ActionResult<Clearance>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<Clearance>(`/v1/student-clearances/${id}`));
}

export async function decideClearanceLine(itemId: string, status: 'cleared' | 'blocked', note?: string): Promise<ActionResult<Clearance>> {
  if (!UUID.test(itemId)) return bad();
  const res = await act(() => api<Clearance>(`/v1/student-clearance-items/${itemId}/decide`, { method: 'POST', body: { status, ...(note?.trim() ? { note: note.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function planRollNumbers(input: { sectionId: string; order: RollOrder; prefix: string; start: number; width: number; girlsFirst: boolean; dryRun: boolean }): Promise<ActionResult<RollPlan>> {
  if (!UUID.test(input.sectionId) || !(ROLL_ORDERS as readonly string[]).includes(input.order)) return bad();
  const res = await act(() => api<RollPlan>('/v1/students/roll-numbers', { method: 'POST', body: { ...input, prefix: input.prefix.trim() } }));
  if (res.ok && !input.dryRun) refresh();
  return res;
}

export async function planRebalance(input: { sectionIds: string[]; mode: 'alphabetic' | 'balanced'; reason: string; dryRun: boolean }): Promise<ActionResult<RebalancePlan>> {
  if (input.sectionIds.length < 2 || input.sectionIds.some((s) => !UUID.test(s))) return bad();
  const res = await act(() => api<RebalancePlan>('/v1/students/rebalance', { method: 'POST', body: { ...input, reason: input.reason.trim() || undefined } }));
  if (res.ok && !input.dryRun) refresh();
  return res;
}

export async function promotionEligibility(sectionId: string, minAttendancePct: number, maxDuesRupees: number): Promise<ActionResult<Eligibility>> {
  if (!UUID.test(sectionId)) return bad();
  const q = new URLSearchParams({ sectionId, minAttendancePct: String(minAttendancePct), maxDuesPaise: String(Math.round(maxDuesRupees * 100)) });
  return act(() => api<Eligibility>(`/v1/students/promotions/eligibility?${q}`));
}
