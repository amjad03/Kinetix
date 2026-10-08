'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { parseRecipients } from '@/lib/insights';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z_.]{3,60}$/;

export async function createSchedule(input: { reportKey: string; frequency: string; format: string; recipients: string }): Promise<ActionResult> {
  const recipients = parseRecipients(input.recipients);
  if (!KEY.test(input.reportKey) || !['daily', 'weekly', 'monthly'].includes(input.frequency) || !['csv', 'pdf'].includes(input.format) || recipients.length === 0) {
    return { ok: false, error: 'Fill in every field.' };
  }
  const res = await act(() => api('/v1/analytics/schedules', { method: 'POST', body: { reportKey: input.reportKey, frequency: input.frequency, format: input.format, recipients } }));
  if (res.ok) revalidatePath('/reports');
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function setScheduleActive(id: string, active: boolean): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api(`/v1/analytics/schedules/${id}`, { method: 'PATCH', body: { active } }));
  if (res.ok) revalidatePath('/reports');
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api(`/v1/analytics/schedules/${id}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/reports');
  return res.ok ? { ok: true, data: undefined } : res;
}
