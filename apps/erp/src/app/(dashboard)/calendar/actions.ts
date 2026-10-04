'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { CALENDAR_KINDS, calendarProblem, type CalendarEvent, type CalendarInput } from '@/lib/calendar';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done() {
  // Holidays change Today and Classes too (classes on a holiday are not due).
  revalidatePath('/calendar');
  revalidatePath('/');
  revalidatePath('/classes');
}

async function check(input: CalendarInput): Promise<string | null> {
  const { t } = await getI18n();
  if (!CALENDAR_KINDS.includes(input.kind)) return t('error.VALIDATION');
  const problem = calendarProblem(input);
  if (problem) return t(`cal.problem.${problem}`);
  if (input.programIds && input.programIds.some((id) => !UUID.test(id))) return t('cal.problem.programs');
  return null;
}

const body = (i: CalendarInput) => ({
  kind: i.kind,
  title: i.title.trim(),
  startsOn: i.startsOn,
  endsOn: i.endsOn,
  programIds: i.programIds?.length ? [...new Set(i.programIds)] : null,
  notify: i.notify,
});

export async function createCalendarEvent(input: CalendarInput): Promise<ActionResult<CalendarEvent>> {
  const problem = await check(input);
  if (problem) return { ok: false, error: problem };
  const res = await act(() => api<CalendarEvent>('/v1/admin/calendar', { method: 'POST', body: body(input) }));
  if (res.ok) done();
  return res;
}

export async function updateCalendarEvent(id: string, input: CalendarInput): Promise<ActionResult<CalendarEvent>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('error.NOT_FOUND') };
  const problem = await check(input);
  if (problem) return { ok: false, error: problem };
  const res = await act(() => api<CalendarEvent>(`/v1/admin/calendar/${id}`, { method: 'PUT', body: body(input) }));
  if (res.ok) done();
  return res;
}

export async function deleteCalendarEvent(id: string): Promise<ActionResult<void>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('error.NOT_FOUND') };
  const res = await act(() => api<void>(`/v1/admin/calendar/${id}`, { method: 'DELETE' }));
  if (res.ok) done();
  return res;
}
