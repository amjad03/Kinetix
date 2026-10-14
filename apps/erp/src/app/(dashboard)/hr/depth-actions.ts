'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { PayrollRunDetail } from '@/lib/hr-types';
import type { StaffDetails } from '@/lib/hr-depth';
import type { ActionResult } from '@/lib/types';

/** Server actions of the HR depth screens: staff details, scans, leave documents and substitutes, interviews, hiring and payroll runs. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });
const refresh = (path = '/hr') => revalidatePath(path, 'layout');
const MAX = 5 * 1024 * 1024;

async function upload(path: string, form: FormData): Promise<ActionResult<unknown>> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return { ok: false, error: (await getI18n()).t('hk.err.file') };
  return act(() => api(path, { method: 'POST', form }));
}

export async function saveStaffDetails(userId: string, body: Omit<StaffDetails, 'userId' | 'aadhaarLast4' | 'retiresOn' | 'experience' | 'publications'> & { aadhaar?: string | null }): Promise<ActionResult<StaffDetails>> {
  if (!UUID.test(userId)) return bad();
  const res = await act(() => api<StaffDetails>(`/v1/hr/staff/${userId}/details`, { method: 'PUT', body }));
  if (res.ok) refresh();
  return res;
}

export async function uploadStaffDocument(id: string, form: FormData): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await upload(`/v1/hr/staff-documents/${id}/file`, form);
  if (res.ok) refresh();
  return res;
}

export async function uploadLeaveDocument(id: string, form: FormData): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await upload(`/v1/hr/leave/requests/${id}/document`, form);
  if (res.ok) refresh();
  return res;
}

export async function arrangeSubstitutes(id: string): Promise<ActionResult<{ assigned: { date: string; subject: string; section: string; substitute: string }[]; uncovered: { date: string; subject: string; section: string }[] }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ assigned: { date: string; subject: string; section: string; substitute: string }[]; uncovered: { date: string; subject: string; section: string }[] }>(`/v1/hr/leave/requests/${id}/arrange-substitutes`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

export async function revokeLeave(id: string, reason: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || reason.trim().length < 3) return bad();
  const res = await act(() => api(`/v1/hr/leave/requests/${id}/revoke`, { method: 'POST', body: { reason: reason.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function scoreInterview(id: string, body: { scores: Record<string, number>; recommendation: 'select' | 'hold' | 'reject'; remarks: string }): Promise<ActionResult<{ total: number; completed: boolean }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ total: number; completed: boolean }>(`/v1/hr/interviews/${id}/scores`, { method: 'PUT', body: { ...body, remarks: body.remarks.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function hireApplicant(id: string, body: { joiningOn: string; role: string; employmentType: string; startOnboarding: boolean }): Promise<ActionResult<{ userId: string; employeeCode: string }>> {
  if (!UUID.test(id) || !DAY.test(body.joiningOn)) return bad();
  const res = await act(() => api<{ userId: string; employeeCode: string }>(`/v1/hr/applicants/${id}/hire`, { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function uploadResume(id: string, form: FormData): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await upload(`/v1/hr/applicants/${id}/resume`, form);
  if (res.ok) refresh();
  return res;
}

export async function committeeReview(id: string, score: number, remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !(score >= 0 && score <= 100)) return bad();
  const res = await act(() => api(`/v1/hr/appraisals/${id}/committee`, { method: 'PUT', body: { score, remarks: remarks.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function createPayrollRun(month: string, kind: 'regular' | 'supplementary', staffIds: string[], note: string): Promise<ActionResult<PayrollRunDetail>> {
  if (!MONTH.test(month) || !staffIds.every((x) => UUID.test(x))) return bad();
  const res = await act(() => api<PayrollRunDetail>('/v1/payroll/runs', { method: 'POST', body: { month, kind, staffIds, note: note.trim() } }));
  if (res.ok) refresh('/payroll');
  return res;
}

export async function reversePayrollRun(id: string, version: number, reason: string): Promise<ActionResult<PayrollRunDetail>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<PayrollRunDetail>(`/v1/payroll/runs/${id}/reverse`, { method: 'POST', body: { expectedVersion: version, reason: reason.trim() } }));
  if (res.ok) refresh('/payroll');
  return res;
}
