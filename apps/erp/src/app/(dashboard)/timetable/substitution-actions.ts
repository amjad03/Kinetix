'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('tt.err.again') });

export interface NeededPeriod {
  slotId: string;
  startsAt: string;
  endsAt: string;
  teacher: string;
  section: string;
  subject: string;
  date: string;
}
export interface Candidate {
  id: string;
  fullName: string;
  match: 'subject' | 'department';
  periodsThatDay: number;
}
export interface SubstitutionRow {
  id: string;
  slotId: string;
  date: string;
  status: string;
  startsAt: string;
  endsAt: string;
  section: { displayName: string };
  subject: { name: string };
  originalTeacher: string;
  substituteTeacher: string | null;
}

export async function loadSubstitutions(date: string): Promise<ActionResult<{ needed: NeededPeriod[]; assigned: SubstitutionRow[] }>> {
  if (!DAY.test(date)) return bad();
  const needed = await act(() => api<NeededPeriod[]>(`/v1/timetable/substitutions/needed?date=${date}`));
  if (!needed.ok) return needed;
  const assigned = await act(() => api<SubstitutionRow[]>(`/v1/timetable/substitutions?from=${date}&to=${date}`));
  if (!assigned.ok) return assigned;
  return { ok: true, data: { needed: needed.data, assigned: assigned.data.filter((a) => a.status === 'assigned') } };
}

export async function suggestSubstitutes(slotId: string, date: string): Promise<ActionResult<Candidate[]>> {
  if (!UUID.test(slotId) || !DAY.test(date)) return bad();
  const res = await act(() => api<{ candidates: Candidate[] }>(`/v1/timetable/substitutes?slotId=${slotId}&date=${date}`));
  return res.ok ? { ok: true, data: res.data.candidates } : res;
}

export async function assignSubstitute(slotId: string, date: string, substituteTeacherId: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(slotId) || !UUID.test(substituteTeacherId) || !DAY.test(date)) return bad();
  const res = await act(() => api('/v1/timetable/substitutions', { method: 'POST', body: { slotId, date, substituteTeacherId } }));
  if (res.ok) revalidatePath('/timetable');
  return res;
}

export async function cancelSubstitution(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/timetable/substitutions/${id}/cancel`, { method: 'POST' }));
  if (res.ok) revalidatePath('/timetable');
  return res;
}
