'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });
const refresh = () => revalidatePath('/hr', 'layout');

export async function recommendProbation(userId: string, recommendation: 'confirm' | 'extend', remarks: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(userId)) return bad();
  const res = await act(() => api(`/v1/hr/probation/${userId}/recommend`, { method: 'POST', body: { recommendation, remarks: remarks.trim() } }));
  if (res.ok) refresh();
  return res;
}

export async function decideProbation(userId: string, decision: 'confirm' | 'extend', remarks: string, extendMonths: number): Promise<ActionResult<unknown>> {
  if (!UUID.test(userId) || !Number.isInteger(extendMonths) || extendMonths < 1 || extendMonths > 12) return bad();
  const res = await act(() => api(`/v1/hr/probation/${userId}/decide`, { method: 'POST', body: { decision, remarks: remarks.trim(), extendMonths } }));
  if (res.ok) refresh();
  return res;
}

export async function recordTransfer(input: { userId: string; toDepartmentId: string; toDesignationId: string; toCampusId: string; effectiveOn: string; reason: string }): Promise<ActionResult<unknown>> {
  if (!UUID.test(input.userId) || !DAY.test(input.effectiveOn)) return bad();
  const pick = (v: string) => (UUID.test(v) ? v : undefined);
  const res = await act(() =>
    api('/v1/hr/transfers', { method: 'POST', body: { userId: input.userId, toDepartmentId: pick(input.toDepartmentId), toDesignationId: pick(input.toDesignationId), toCampusId: pick(input.toCampusId), effectiveOn: input.effectiveOn, reason: input.reason.trim() } }),
  );
  if (res.ok) refresh();
  return res;
}

export async function cancelTransfer(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/transfers/${id}/cancel`, { method: 'POST', body: {} }));
  if (res.ok) refresh();
  return res;
}

/** Attaches a certificate (PDF, JPEG or PNG) to a training record. */
export async function uploadCertificate(recordId: string, form: FormData): Promise<ActionResult<unknown>> {
  const file = form.get('file');
  if (!UUID.test(recordId) || !(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) return { ok: false, error: (await getI18n()).t('as.cert.err') };
  const res = await act(() => api(`/v1/hr/training-records/${recordId}/certificate`, { method: 'POST', form }));
  if (res.ok) refresh();
  return res;
}
