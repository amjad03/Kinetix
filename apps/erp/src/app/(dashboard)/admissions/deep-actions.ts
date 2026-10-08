'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
const refresh = () => revalidatePath('/admissions', 'layout');

export interface SeatRow {
  applicationId: string;
  applicationNo: string;
  applicantName: string;
  hall: string;
  seatNo: number;
  score: number | null;
  absent: boolean;
}

export interface QuotaView {
  seats: number;
  generalSeats: number;
  generalLeft: number;
  quotas: { category: string; reservedSeats: number; taken: number; left: number }[];
}

export async function createEntranceTest(input: { cycleId: string; name: string; testDate: string; startsAt: string; maxScore: number; passScore?: number; venue?: string; hallName: string; hallCapacity: number }): Promise<ActionResult<unknown>> {
  if (!UUID.test(input.cycleId) || !DAY.test(input.testDate) || !TIME.test(input.startsAt) || !(input.maxScore > 0)) return bad();
  const halls = input.hallName.trim() && input.hallCapacity > 0 ? [{ name: input.hallName.trim(), capacity: input.hallCapacity }] : [];
  const body = { cycleId: input.cycleId, name: input.name.trim(), testDate: input.testDate, startsAt: input.startsAt, maxScore: input.maxScore, ...(input.passScore ? { passScore: input.passScore } : {}), ...(input.venue?.trim() ? { venue: input.venue.trim() } : {}), halls };
  const res = await act(() => api('/v1/admissions/entrance-tests', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function addEntranceHall(testId: string, name: string, capacity: number): Promise<ActionResult<unknown>> {
  if (!UUID.test(testId) || !name.trim() || !(capacity > 0)) return bad();
  const res = await act(() => api(`/v1/admissions/entrance-tests/${testId}/halls`, { method: 'POST', body: { name: name.trim(), capacity } }));
  if (res.ok) refresh();
  return res;
}

export async function allocateEntranceSeats(testId: string): Promise<ActionResult<{ allocated: number }>> {
  if (!UUID.test(testId)) return bad();
  const res = await act(() => api<{ allocated: number }>(`/v1/admissions/entrance-tests/${testId}/allocate`, { method: 'POST' }));
  if (res.ok) refresh();
  return res;
}

export async function loadSeating(testId: string): Promise<ActionResult<SeatRow[]>> {
  if (!UUID.test(testId)) return bad();
  return act(() => api<SeatRow[]>(`/v1/admissions/entrance-tests/${testId}/seating`));
}

export async function saveEntranceScores(testId: string, scores: { applicationId: string; score?: number; absent?: boolean }[]): Promise<ActionResult<unknown>> {
  if (!UUID.test(testId) || scores.length === 0 || scores.some((s) => !UUID.test(s.applicationId))) return bad();
  const res = await act(() => api(`/v1/admissions/entrance-tests/${testId}/scores`, { method: 'PUT', body: { scores } }));
  if (res.ok) refresh();
  return res;
}

export async function loadQuotas(cycleId: string): Promise<ActionResult<QuotaView>> {
  if (!UUID.test(cycleId)) return bad();
  return act(() => api<QuotaView>(`/v1/admissions/cycles/${cycleId}/quotas`));
}

export async function saveQuotas(cycleId: string, quotas: { category: string; reservedSeats: number }[]): Promise<ActionResult<QuotaView>> {
  if (!UUID.test(cycleId) || quotas.some((q) => !q.category.trim() || !(q.reservedSeats >= 1))) return bad();
  const res = await act(() => api<QuotaView>(`/v1/admissions/cycles/${cycleId}/quotas`, { method: 'PUT', body: { quotas: quotas.map((q) => ({ category: q.category.trim(), reservedSeats: q.reservedSeats })) } }));
  if (res.ok) refresh();
  return res;
}

export async function createCampaign(input: { name: string; channel: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; budgetRupees: number }): Promise<ActionResult<unknown>> {
  if (input.name.trim().length < 2 || input.channel.trim().length < 2 || !(input.budgetRupees >= 0)) return bad();
  const opt = (v?: string) => (v?.trim() ? { value: v.trim() } : null);
  const body = {
    name: input.name.trim(),
    channel: input.channel.trim(),
    budgetPaise: Math.round(input.budgetRupees * 100),
    ...(opt(input.utmSource) ? { utmSource: opt(input.utmSource)!.value } : {}),
    ...(opt(input.utmMedium) ? { utmMedium: opt(input.utmMedium)!.value } : {}),
    ...(opt(input.utmCampaign) ? { utmCampaign: opt(input.utmCampaign)!.value } : {}),
  };
  const res = await act(() => api('/v1/admissions/campaigns', { method: 'POST', body }));
  if (res.ok) refresh();
  return res;
}

export async function setCampaignActive(id: string, active: boolean): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/admissions/campaigns/${id}`, { method: 'PATCH', body: { active } }));
  if (res.ok) refresh();
  return res;
}
