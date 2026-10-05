'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { razorpayBody, razorpayProblem, type RazorpayAccount, type RazorpayInput, type RazorpayTestResult } from '@/lib/payments';
import { grievanceBody, grievanceProblem, SETTING_KEYS, type InstitutionSettings, type SettingKey } from '@/lib/settings';
import type { ActionResult } from '@/lib/types';

/** Changes one institution setting (PUT /v1/admin/settings takes a partial body). */
export async function saveSetting(key: SettingKey, value: boolean): Promise<ActionResult<InstitutionSettings>> {
  if (!SETTING_KEYS.includes(key) || typeof value !== 'boolean') return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
  const res = await act(() => api<InstitutionSettings>('/v1/admin/settings', { method: 'PUT', body: { [key]: value } }));
  if (res.ok) {
    revalidatePath('/settings');
    revalidatePath('/live', 'layout');
  }
  return res;
}

/** Sets the grievance officer families see in the apps, or removes it (null). */
export async function saveGrievanceOfficer(input: { name: string; email: string; phone: string } | null): Promise<ActionResult<InstitutionSettings>> {
  if (input) {
    const problem = grievanceProblem(input);
    if (problem) return { ok: false, error: (await getI18n()).t(`grievance.problem.${problem}`) };
  }
  const res = await act(() => api<InstitutionSettings>('/v1/admin/settings', { method: 'PUT', body: { grievanceOfficer: input ? grievanceBody(input) : null } }));
  if (res.ok) revalidatePath('/settings');
  return res;
}

/** Saves the institution's Razorpay keys. Secrets left empty keep the stored ones; none come back. */
export async function saveRazorpay(input: RazorpayInput, saved: Pick<RazorpayAccount, 'configured' | 'keyId'>): Promise<ActionResult<RazorpayAccount>> {
  const problem = razorpayProblem(input, saved);
  if (problem) return { ok: false, error: (await getI18n()).t(`payments.problem.${problem}`) };
  const res = await act(() => api<RazorpayAccount>('/v1/admin/payments/razorpay', { method: 'PUT', body: razorpayBody(input) }));
  if (res.ok) revalidatePath('/settings');
  return res;
}

/** Asks the API to call Razorpay with the stored keys. */
export async function testRazorpay(): Promise<ActionResult<RazorpayTestResult>> {
  return act(() => api<RazorpayTestResult>('/v1/admin/payments/razorpay/test', { method: 'POST' }));
}
