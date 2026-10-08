'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { razorpayBody, razorpayProblem, type RazorpayAccount, type RazorpayInput, type RazorpayTestResult } from '@/lib/payments';
import { grievanceBody, grievanceProblem, kioskPinProblem, parsePastExamCsv, SETTING_KEYS, type InstitutionSettings, type SettingKey, type WhatsNewItem } from '@/lib/settings';
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

/**
 * Board kiosk mode: on or off, and the IT PIN (set, or removed with null). The PIN goes to the API
 * once, which keeps only a salted hash; it is never logged or sent back.
 */
export async function saveBoardKiosk(change: { enabled?: boolean; pin?: { pin: string; confirm: string } | null }): Promise<ActionResult<InstitutionSettings>> {
  const body: { enabled?: boolean; pin?: string | null } = {};
  if (change.enabled !== undefined) {
    if (typeof change.enabled !== 'boolean') return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
    body.enabled = change.enabled;
  }
  if (change.pin === null) body.pin = null;
  else if (change.pin) {
    const problem = kioskPinProblem(String(change.pin.pin), String(change.pin.confirm));
    if (problem) return { ok: false, error: (await getI18n()).t(`kiosk.problem.${problem}`) };
    body.pin = change.pin.pin;
  }
  if (!Object.keys(body).length) return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
  const res = await act(() => api<InstitutionSettings>('/v1/admin/settings', { method: 'PUT', body: { boardKiosk: body } }));
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

/** Board training link and contact, and the What's New announcements (shown on every board). */
export async function saveBoardContent(input: { training: { url: string; contact: string }; whatsNew: WhatsNewItem[] }): Promise<ActionResult<InstitutionSettings>> {
  const url = input.training.url.trim();
  const contact = input.training.contact.trim();
  if (url && !/^https?:\/\/\S+$/.test(url)) return { ok: false, error: (await getI18n()).t('boardContent.badUrl') };
  const whatsNew = input.whatsNew.filter((w) => w.title.trim()).map((w) => ({ title: w.title.trim(), body: w.body.trim(), at: w.at }));
  const res = await act(() =>
    api<InstitutionSettings>('/v1/admin/settings', { method: 'PUT', body: { boardTraining: url || contact ? { url: url || null, contact: contact || null } : null, boardWhatsNew: whatsNew } }),
  );
  if (res.ok) revalidatePath('/settings');
  return res;
}

/** Imports past-exam questions (the only source of Quiz AI's exam-frequency badges). */
export async function importPastExams(csv: string): Promise<ActionResult<{ imported: number; bad: number[] }>> {
  const { rows, bad } = parsePastExamCsv(csv);
  if (!rows.length) return { ok: false, error: (await getI18n()).t('pastExams.none') };
  const res = await act(() => api<{ imported: number }>('/v1/past-exam-questions/import', { method: 'POST', body: { rows } }));
  return res.ok ? { ok: true, data: { imported: res.data.imported, bad } } : res;
}
