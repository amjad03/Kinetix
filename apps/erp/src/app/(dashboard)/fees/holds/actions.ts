'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { FeeHoldPurpose } from '@/lib/fee-holds';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(studentId?: string) {
  revalidatePath('/fees', 'layout');
  if (studentId) revalidatePath(`/students/${studentId}`);
}

/** The principal lets a held hall ticket, result or TC through for a student, with the reason. */
export async function grantFeeHoldOverride(studentId: string, purpose: FeeHoldPurpose, reason: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(studentId)) return { ok: false, error: 'Not allowed' };
  const res = await act(() => api(`/v1/fee-holds/${studentId}/overrides`, { method: 'POST', body: { purpose, reason } }));
  if (res.ok) refresh(studentId);
  return res;
}

/** Withdraws an override, with the reason; the hold applies again. */
export async function withdrawFeeHoldOverride(id: string, reason: string, studentId?: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not allowed' };
  const res = await act(() => api(`/v1/fee-holds/overrides/${id}`, { method: 'DELETE', body: { reason } }));
  if (res.ok) refresh(studentId);
  return res;
}
