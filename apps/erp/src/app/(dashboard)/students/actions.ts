'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { STUDENT_STATUSES, type PromotionResult } from '@/lib/admissions';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
const refresh = () => revalidatePath('/students', 'layout');

export async function changeStudentStatus(id: string, status: string, reason?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !(STUDENT_STATUSES as readonly string[]).includes(status)) return bad();
  const res = await act(() => api(`/v1/students/${id}/status`, { method: 'POST', body: { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) } }));
  if (res.ok) refresh();
  return res;
}

export async function changeStudentSection(id: string, sectionId: string, reason: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !UUID.test(sectionId)) return bad();
  const res = await act(() => api(`/v1/students/${id}/section`, { method: 'POST', body: { sectionId, reason: reason.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function linkGuardian(id: string, input: { fullName: string; phone: string; email?: string; relation: string; isPrimary: boolean }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const body = { fullName: input.fullName.trim(), phone: input.phone.trim(), relation: input.relation.trim() || 'parent', isPrimary: input.isPrimary, ...(input.email?.trim() ? { email: input.email.trim() } : {}) };
  const res = await act(() => api(`/v1/students/${id}/guardians`, { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function unlinkGuardian(id: string, guardianId: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id) || !UUID.test(guardianId)) return bad();
  const res = await act(() => api(`/v1/students/${id}/guardians/${guardianId}`, { method: 'DELETE' }));
  if (res.ok) refresh();
  return res;
}

export async function runPromotion(input: { label: string; mappings: { fromSectionId: string; toSectionId: string | null }[]; dryRun: boolean }): Promise<ActionResult<PromotionResult>> {
  if (input.mappings.some((m) => !UUID.test(m.fromSectionId) || (m.toSectionId !== null && !UUID.test(m.toSectionId)))) return bad();
  const res = await act(() => api<PromotionResult>('/v1/students/promotions', { method: 'POST', body: { label: input.label.trim(), mappings: input.mappings, dryRun: input.dryRun } }));
  if (res.ok && !input.dryRun) refresh();
  return res;
}
