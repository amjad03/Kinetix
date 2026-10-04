'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { slotProblem, type SlotInput } from '@/lib/timetable';
import type { ActionResult, TimetableSlot } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refresh = () => {
  revalidatePath('/timetable');
  revalidatePath('/');
  revalidatePath('/classes');
};

function check(s: SlotInput): string | null {
  const problem = slotProblem(s);
  if (problem) return problem;
  if (![s.sectionId, s.subjectId, s.teacherId].every((x) => UUID.test(x)) || (s.roomId !== null && !UUID.test(s.roomId))) return 'Choose the class, subject, teacher and room again.';
  return null;
}

const body = (s: SlotInput) => ({ sectionId: s.sectionId, subjectId: s.subjectId, teacherId: s.teacherId, roomId: s.roomId, dayOfWeek: s.dayOfWeek, startsAt: s.startsAt, endsAt: s.endsAt });

export async function addSlot(s: SlotInput): Promise<ActionResult<TimetableSlot>> {
  const problem = check(s);
  if (problem) return { ok: false, error: problem };
  const res = await act(() => api<TimetableSlot>('/v1/admin/timetable/slots', { method: 'POST', body: body(s) }));
  if (res.ok) refresh();
  return res;
}

/** The API archives the old period and creates a new one, so past attendance keeps its period. */
export async function changeSlot(id: string, s: SlotInput): Promise<ActionResult<TimetableSlot>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown period.' };
  const problem = check(s);
  if (problem) return { ok: false, error: problem };
  const res = await act(() => api<TimetableSlot>(`/v1/admin/timetable/slots/${id}`, { method: 'PATCH', body: body(s) }));
  if (res.ok) refresh();
  return res;
}

export async function removeSlot(id: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown period.' };
  const res = await act(() => api<undefined>(`/v1/admin/timetable/slots/${id}`, { method: 'DELETE' }));
  if (res.ok) refresh();
  return res;
}
