'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';
import type { ApplicantStage, AttendanceImportResult, Designation, JobApplicant, JobOpening, LeaveBalance, LeaveRequest, LeaveType, StaffAttendanceRow, StaffAttendanceStatus, StaffProfile } from '@/lib/hr-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });

export async function getProfile(userId: string): Promise<ActionResult<StaffProfile>> {
  if (!UUID.test(userId)) return bad();
  return act(() => api<StaffProfile>(`/v1/hr/staff/${userId}`));
}

export type ProfileInput = Omit<StaffProfile, 'userId' | 'fullName' | 'email' | 'phone' | 'roles' | 'department' | 'designation' | 'bank'> & { departmentId: string | null; designationId: string | null };

/** The record as the API's PUT body: nothing the API refuses (name, roles, bank) is sent. */
export async function saveProfile(userId: string, p: ProfileInput): Promise<ActionResult<StaffProfile>> {
  if (!UUID.test(userId)) return bad();
  const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const body = {
    employeeCode: p.employeeCode?.trim(),
    departmentId: p.departmentId || null,
    designationId: p.designationId || null,
    employmentType: p.employmentType ?? 'permanent',
    dateOfJoining: blank(p.dateOfJoining),
    dateOfLeaving: blank(p.dateOfLeaving),
    status: p.status ?? 'active',
    gender: p.gender || null,
    dateOfBirth: blank(p.dateOfBirth),
    pan: blank(p.pan),
    uan: blank(p.uan),
    esiNumber: blank(p.esiNumber),
    taxRegime: p.taxRegime,
    tax80cPaise: p.tax80cPaise,
    taxOtherDeductionsPaise: p.taxOtherDeductionsPaise,
    pfEnabled: p.pfEnabled,
    esiEnabled: p.esiEnabled,
    ptEnabled: p.ptEnabled,
    expectedVersion: p.version,
  };
  const res = await act(() => api<StaffProfile>(`/v1/hr/staff/${userId}`, { method: 'PUT', body }));
  if (res.ok) revalidatePath('/hr');
  return res;
}

export async function saveBank(userId: string, b: { accountHolder: string; bankName: string; ifsc: string; accountNumber: string }): Promise<ActionResult<{ accountLast4: string }>> {
  if (!UUID.test(userId)) return bad();
  const res = await act(() => api<{ accountLast4: string }>(`/v1/hr/staff/${userId}/bank`, { method: 'PUT', body: { ...b, accountNumber: b.accountNumber.replace(/\s/g, '') } }));
  if (res.ok) revalidatePath('/hr');
  return res;
}

export async function addDesignation(name: string, grade: string): Promise<ActionResult<Designation>> {
  const res = await act(() => api<Designation>('/v1/hr/designations', { method: 'POST', body: { name: name.trim(), grade: grade.trim() || null } }));
  if (res.ok) revalidatePath('/hr');
  return res;
}

export async function markAttendance(date: string, entries: { userId: string; status: StaffAttendanceStatus }[]): Promise<ActionResult<StaffAttendanceRow[]>> {
  const res = await act(() => api<StaffAttendanceRow[]>('/v1/hr/attendance', { method: 'PUT', body: { date, entries } }));
  if (res.ok) revalidatePath('/hr/attendance');
  return res;
}

export async function importAttendance(csv: string): Promise<ActionResult<AttendanceImportResult>> {
  const res = await act(() => api<AttendanceImportResult>('/v1/hr/attendance/import', { method: 'POST', body: { csv } }));
  if (res.ok) revalidatePath('/hr/attendance');
  return res;
}

export async function decideLeave(id: string, decision: 'approve' | 'reject', note: string): Promise<ActionResult<LeaveRequest>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<LeaveRequest>(`/v1/hr/leave/requests/${id}/${decision}`, { method: 'POST', body: note.trim() ? { note: note.trim() } : {} }));
  if (res.ok) revalidatePath('/hr/leave');
  return res;
}

export async function addLeaveType(t: { code: string; name: string; paid: boolean; annualDays: number; accrual: 'yearly' | 'monthly'; carryForwardMax: number }): Promise<ActionResult<LeaveType>> {
  const res = await act(() => api<LeaveType>('/v1/hr/leave-types', { method: 'POST', body: { ...t, code: t.code.trim(), name: t.name.trim(), active: true } }));
  if (res.ok) revalidatePath('/hr/leave');
  return res;
}

export async function getBalances(userId: string): Promise<ActionResult<LeaveBalance[]>> {
  if (!UUID.test(userId)) return bad();
  return act(() => api<LeaveBalance[]>(`/v1/hr/leave/balances?userId=${userId}`));
}

export async function saveOpening(id: string | null, o: { title: string; positions: number; description: string; status: 'open' | 'on_hold' | 'closed'; closesOn: string; departmentId: string }): Promise<ActionResult<JobOpening>> {
  const body = { title: o.title.trim(), positions: o.positions, description: o.description.trim(), status: o.status, closesOn: o.closesOn || null, departmentId: o.departmentId || null };
  const res = await act(() => api<JobOpening>(id ? `/v1/hr/openings/${id}` : '/v1/hr/openings', { method: id ? 'PUT' : 'POST', body }));
  if (res.ok) revalidatePath('/hr/recruitment');
  return res;
}

export async function addApplicant(openingId: string, a: { fullName: string; email: string; phone: string; notes: string }): Promise<ActionResult<JobApplicant>> {
  if (!UUID.test(openingId)) return bad();
  const body = { fullName: a.fullName.trim(), email: a.email.trim() || null, phone: a.phone.trim() || null, notes: a.notes.trim() };
  const res = await act(() => api<JobApplicant>(`/v1/hr/openings/${openingId}/applicants`, { method: 'POST', body }));
  if (res.ok) revalidatePath('/hr/recruitment');
  return res;
}

export async function moveApplicant(id: string, stage: ApplicantStage): Promise<ActionResult<JobApplicant>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<JobApplicant>(`/v1/hr/applicants/${id}/stage`, { method: 'PUT', body: { stage } }));
  if (res.ok) revalidatePath('/hr/recruitment');
  return res;
}
