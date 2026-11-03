'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { AdmitResult, Checklist, Matrix, SeatPlan } from '@/lib/admissions-pass';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
const refresh = () => revalidatePath('/admissions', 'layout');

async function call<T>(path: string, method: 'POST' | 'PUT' | 'PATCH', body?: unknown): Promise<ActionResult<T>> {
  const res = await act(() => api<T>(path, { method, body: body ?? {} }));
  if (res.ok) refresh();
  return res;
}

export async function applySeatPlan(cycleId: string, plan: SeatPlan): Promise<ActionResult<Matrix>> {
  if (!UUID.test(cycleId) || !plan.options.length) return bad();
  return call(`/v1/admissions/cycles/${cycleId}/reservation`, 'PUT', plan);
}

export async function dereserveSeats(cycleId: string, surrenderToManagement: boolean): Promise<ActionResult<{ moves: unknown[] }>> {
  if (!UUID.test(cycleId)) return bad();
  return call(`/v1/admissions/cycles/${cycleId}/reservation/dereserve`, 'POST', { interchange: [['sc', 'st']], toMerit: true, surrender: surrenderToManagement ? { merit: 'management' } : {} });
}

export async function setEligibilityPreset(cycleId: string, preset: string | null): Promise<ActionResult<unknown>> {
  if (!UUID.test(cycleId) || (preset !== null && !/^[a-z0-9-]{2,60}$/.test(preset))) return bad();
  return call(`/v1/admissions/cycles/${cycleId}/profile-eligibility`, 'PUT', { preset });
}

/** Rows pasted from a spreadsheet: "application or roll no, rank, score". */
export async function importEntranceResults(cycleId: string, exam: string, matchBy: 'application' | 'roll', text: string): Promise<ActionResult<{ updated: number; marked: number; unmatched: string[]; errors: string[] }>> {
  if (!UUID.test(cycleId) || !/^[a-z_]{2,12}$/.test(exam)) return bad();
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t]/).map((c) => c.trim()))
    .filter((c) => c[0] && !/^application|^roll/i.test(c[0]))
    .map(([key, rank, score]) => ({ ...(matchBy === 'application' ? { applicationNo: key } : { rollNo: key }), ...(rank ? { rank: Number(rank) } : {}), ...(score ? { score: Number(score) } : {}) }));
  if (!rows.length || rows.some((r) => (r.rank !== undefined && !Number.isInteger(r.rank)) || (r.score !== undefined && !Number.isFinite(r.score)))) return bad();
  return call(`/v1/admissions/cycles/${cycleId}/entrance-results`, 'POST', { exam, rows });
}

/** KEA / COMEDK allotment list pasted as CSV: ref, roll no, rank, name, date of birth, gender, phone, guardian, guardian phone, category, option. */
export async function importAllotments(cycleId: string, authority: 'kea' | 'comedk', text: string): Promise<ActionResult<{ created: number; skipped: string[] }>> {
  if (!UUID.test(cycleId)) return bad();
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t]/).map((c) => c.trim()))
    .filter((c) => c.length >= 10 && !/^allotment|^ref/i.test(c[0]))
    .map(([allotmentRef, rollNo, rank, name, dateOfBirth, gender, phone, guardianName, guardianPhone, category, option]) => ({ allotmentRef, rollNo, rank: Number(rank), name, ...(DAY.test(dateOfBirth) ? { dateOfBirth } : {}), ...(['female', 'male', 'other'].includes(gender?.toLowerCase()) ? { gender: gender.toLowerCase() } : {}), phone, guardianName, guardianPhone, category, ...(option ? { option } : {}) }));
  if (!rows.length) return bad();
  return call(`/v1/admissions/cycles/${cycleId}/external-allotments`, 'POST', { authority, rows });
}

export async function setClaims(applicationId: string, input: { horizontal: string[]; supernumerary: string[]; familyIncomeRupees?: number | null }): Promise<ActionResult<unknown>> {
  if (!UUID.test(applicationId)) return bad();
  return call(`/v1/admissions/applications/${applicationId}/claims`, 'PUT', { horizontal: input.horizontal, supernumerary: input.supernumerary, ...(typeof input.familyIncomeRupees === 'number' ? { familyIncomePaise: Math.round(input.familyIncomeRupees * 100) } : {}) });
}

export async function createChecklist(applicationId: string): Promise<ActionResult<Checklist>> {
  if (!UUID.test(applicationId)) return bad();
  return call(`/v1/admissions/applications/${applicationId}/checklist`, 'POST');
}

export async function updateChecklistItem(itemId: string, input: { status: string; dueOn?: string | null; referenceNo?: string | null; note?: string | null }): Promise<ActionResult<unknown>> {
  if (!UUID.test(itemId) || (input.dueOn && !DAY.test(input.dueOn))) return bad();
  return call(`/v1/admissions/checklist-items/${itemId}`, 'PATCH', { status: input.status, ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}), ...(input.referenceNo?.trim() ? { referenceNo: input.referenceNo.trim() } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}) });
}

export async function admitProvisionally(applicationId: string, dueOn: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(applicationId) || !DAY.test(dueOn)) return bad();
  return call(`/v1/admissions/applications/${applicationId}/provisional`, 'POST', { dueOn, undertaking: true });
}

export async function admitApplicant(applicationId: string, duplicateOverride?: string): Promise<ActionResult<AdmitResult>> {
  if (!UUID.test(applicationId)) return bad();
  return call(`/v1/admissions/applications/${applicationId}/admit`, 'POST', { activate: true, ...(duplicateOverride?.trim() ? { duplicateOverride: duplicateOverride.trim() } : {}) });
}

export async function resendCredentials(studentId: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(studentId)) return bad();
  return call(`/v1/admissions/students/${studentId}/credentials`, 'POST');
}

export async function saveProgrammeSetting(programId: string, input: { branchCode?: string; sanctionedIntake?: number | null; approvalBody?: string; approvalRef?: string; approvalValidTo?: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(programId) || (input.approvalValidTo && !DAY.test(input.approvalValidTo))) return bad();
  const body = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== ''));
  return call(`/v1/admissions/programme-settings/${programId}`, 'PUT', body);
}

export interface SegmentInput {
  stages: string[];
  programId?: string;
  campaignId?: string;
  followUpBy?: string;
}
const segmentOf = (s: SegmentInput) => ({ ...(s.stages.length ? { stages: s.stages } : {}), ...(s.programId && UUID.test(s.programId) ? { programId: s.programId } : {}), ...(s.campaignId && UUID.test(s.campaignId) ? { campaignId: s.campaignId } : {}), ...(s.followUpBy && DAY.test(s.followUpBy) ? { followUpBy: s.followUpBy } : {}) });

export async function previewBroadcast(channel: 'sms' | 'whatsapp' | 'email', segment: SegmentInput): Promise<ActionResult<{ recipients: number; unreachable: number; optedOut: number; limit: number }>> {
  return act(() => api(`/v1/admissions/broadcasts/preview`, { method: 'POST', body: { channel, segment: segmentOf(segment) } }));
}

export async function sendBroadcast(templateId: string, segment: SegmentInput, idempotencyKey: string): Promise<ActionResult<{ id: string; total: number }>> {
  if (!UUID.test(templateId) || !/^[\w-]{8,80}$/.test(idempotencyKey)) return bad();
  return call(`/v1/admissions/broadcasts`, 'POST', { templateId, segment: segmentOf(segment), idempotencyKey, ...(segment.campaignId && UUID.test(segment.campaignId) ? { campaignId: segment.campaignId } : {}) });
}

export async function setOptOut(enquiryId: string, optedOut: boolean): Promise<ActionResult<unknown>> {
  if (!UUID.test(enquiryId)) return bad();
  return call(`/v1/admissions/enquiries/${enquiryId}/opt-out`, 'POST', { optedOut });
}
