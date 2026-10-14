'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Re-admits a student into the curriculum version in force on the day they rejoin. */
export async function readmitStudent(studentId: string, rejoinedOn: string, rejoinTerm: number, note: string): Promise<ActionResult<{ id: string }>> {
  if (!UUID.test(studentId) || !DAY.test(rejoinedOn) || !Number.isInteger(rejoinTerm)) return { ok: false, error: 'Not allowed' };
  const res = await act(() => api<{ id: string }>('/v1/readmissions', { method: 'POST', body: { studentId, rejoinedOn, rejoinTerm, note } }));
  if (res.ok) {
    revalidatePath('/curriculum/readmission');
    revalidatePath(`/students/${studentId}`);
  }
  return res;
}
