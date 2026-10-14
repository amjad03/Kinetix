'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { HrModuleSettings, ServiceBookEntry } from '@/lib/hr-flow';
import type { LeaveType } from '@/lib/hr-types';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type DecisionKind = 'leave' | 'loan' | 'encashment' | 'requisition';

/** Approve or reject from an approval panel; the API sends the notifications. */
export async function decideHr(kind: DecisionKind, id: string, decision: 'approve' | 'reject', comment: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() =>
    kind === 'leave'
      ? api(`/v1/hr/leave/requests/${id}/${decision}`, { method: 'POST', body: { note: comment || undefined } })
      : api(kind === 'loan' ? `/v1/hr/loans/${id}/decide` : kind === 'encashment' ? `/v1/hr/leave/encashments/${id}/decide` : `/v1/hr/openings/${id}/decide`, { method: 'POST', body: { decision, note: comment } }),
  );
  if (res.ok) revalidatePath(kind === 'leave' ? '/hr/leave' : kind === 'requisition' ? '/hr/recruitment' : '/payroll/loans');
  return res;
}

export async function addServiceEntry(userId: string, input: { kind: string; onDate: string; title: string; details: string; orderNo: string }): Promise<ActionResult<ServiceBookEntry>> {
  if (!UUID.test(userId) || !DAY.test(input.onDate) || input.title.trim().length < 2) return { ok: false, error: (await getI18n()).t('hf.err.entry') };
  const res = await act(() => api<ServiceBookEntry>(`/v1/hr/staff/${userId}/service-book`, { method: 'POST', body: { ...input, orderNo: input.orderNo || null } }));
  if (res.ok) revalidatePath(`/hr/staff/${userId}`);
  return res;
}

export async function raiseRequisition(input: { title: string; departmentId: string; positions: number; justification: string; description: string }): Promise<ActionResult<{ id: string }>> {
  if (input.title.trim().length < 1 || input.justification.trim().length < 5) return { ok: false, error: (await getI18n()).t('hf.err.requisition') };
  const res = await act(() => api<{ id: string }>('/v1/hr/openings/requisitions', { method: 'POST', body: { ...input, departmentId: input.departmentId || null } }));
  if (res.ok) revalidatePath('/hr/recruitment');
  return res;
}

export async function saveHrSettings(s: Omit<HrModuleSettings, 'preview'>): Promise<ActionResult<HrModuleSettings>> {
  const res = await act(() => api<HrModuleSettings>('/v1/hr/module-settings', { method: 'PUT', body: s }));
  if (res.ok) revalidatePath('/hr/settings');
  return res;
}

/** Turns encashment on or off for a leave type (the leave policy section of HR settings). */
export async function setEncashable(lt: LeaveType, encashable: boolean): Promise<ActionResult<LeaveType>> {
  if (!UUID.test(lt.id)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<LeaveType>(`/v1/hr/leave-types/${lt.id}`, { method: 'PUT', body: { code: lt.code, name: lt.name, paid: lt.paid, annualDays: lt.annualDays, accrual: lt.accrual, carryForwardMax: lt.carryForwardMax, active: lt.active, encashable } }));
  if (res.ok) revalidatePath('/hr/settings');
  return res;
}
