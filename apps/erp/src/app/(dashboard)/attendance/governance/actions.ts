'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const ID = /^[0-9a-f-]{36}$/i;

/** Approves or rejects a correction request (head of department or principal). */
export async function decideCorrection(id: string, decision: 'approved' | 'rejected', note: string): Promise<ActionResult<unknown>> {
  if (!ID.test(id)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api(`/v1/attendance/corrections/${id}/decision`, { method: 'POST', body: { decision, note: note.trim() } }));
  if (res.ok) revalidatePath('/attendance/governance');
  return res;
}

/** Approves (with percentage points) or rejects a condonation request (principal). */
export async function decideCondonation(id: string, decision: 'approved' | 'rejected', points: number, note: string): Promise<ActionResult<unknown>> {
  if (!ID.test(id)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api(`/v1/attendance/condonations/${id}/decision`, { method: 'POST', body: { decision, points, note: note.trim() } }));
  if (res.ok) revalidatePath('/attendance/governance');
  return res;
}
