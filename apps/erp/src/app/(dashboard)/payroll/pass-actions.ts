'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { BankFileSettings, Declaration, DeclarationInput, IncrementPreview, Settlement } from '@/lib/hr-pass';
import type { ActionResult } from '@/lib/types';

/** Server actions of the HR and payroll pass: declarations and proofs, claims, the pay matrix, bank files and settlement. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX = 5 * 1024 * 1024;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });

async function upload(path: string, form: FormData): Promise<ActionResult<unknown>> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return { ok: false, error: (await getI18n()).t('hk.err.file') };
  return act(() => api(path, { method: 'POST', form }));
}

// ----- my declaration and claims ------------------------------------------------------------------------

export async function saveMyDeclaration(body: DeclarationInput): Promise<ActionResult<Declaration>> {
  const res = await act(() => api<Declaration>('/v1/hr/tax-declarations/me', { method: 'PUT', body }));
  if (res.ok) revalidatePath('/hr/my-tax');
  return res;
}

export async function submitMyDeclaration(fy: number, proofs: boolean): Promise<ActionResult<Declaration>> {
  if (!Number.isInteger(fy)) return bad();
  const res = await act(() => api<Declaration>(`/v1/hr/tax-declarations/me/${proofs ? 'submit-proofs' : 'submit'}`, { method: 'POST', body: { fy } }));
  if (res.ok) revalidatePath('/hr/my-tax');
  return res;
}

export async function uploadProof(itemId: string, form: FormData): Promise<ActionResult<unknown>> {
  if (!UUID.test(itemId)) return bad();
  const res = await upload(`/v1/hr/tax-declarations/items/${itemId}/proof`, form);
  if (res.ok) revalidatePath('/hr/my-tax');
  return res;
}

export async function addClaim(body: { category: string; spentOn: string; amountPaise: number; description: string }, form?: FormData): Promise<ActionResult<{ id: string }>> {
  if (!DAY.test(body.spentOn) || !Number.isInteger(body.amountPaise)) return bad();
  const res = await act(() => api<{ id: string }>('/v1/hr/reimbursements', { method: 'POST', body }));
  if (res.ok && form && form.get('file') instanceof File && (form.get('file') as File).size > 0) {
    const up = await upload(`/v1/hr/reimbursements/${res.data.id}/bill`, form);
    if (!up.ok) return up as ActionResult<never>;
  }
  if (res.ok) revalidatePath('/hr/my-tax');
  return res;
}

// ----- review -------------------------------------------------------------------------------------------

export async function decideDeclaration(id: string, action: 'approve' | 'reject', version: number, note: string): Promise<ActionResult<Declaration>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<Declaration>(`/v1/hr/tax-declarations/${id}/${action}`, { method: 'POST', body: { expectedVersion: version, note } }));
  if (res.ok) revalidatePath(`/payroll/declarations/${id}`);
  return res;
}

export async function verifyDeclaration(id: string, version: number, items: { id: string; accepted: boolean; acceptedPaise?: number; note?: string }[], note: string): Promise<ActionResult<Declaration>> {
  if (!UUID.test(id) || items.some((i) => !UUID.test(i.id))) return bad();
  const res = await act(() => api<Declaration>(`/v1/hr/tax-declarations/${id}/verify`, { method: 'POST', body: { expectedVersion: version, items, note } }));
  if (res.ok) revalidatePath(`/payroll/declarations/${id}`);
  return res;
}

// ----- pay matrix ---------------------------------------------------------------------------------------

export async function placeOnMatrix(userId: string, body: { levelId: string; cell?: number; effectiveFrom: string; kind: 'placement' | 'promotion'; hraClass?: string; orderNo: string; note: string }): Promise<ActionResult<{ basicPaise: number; cell: number }>> {
  if (!UUID.test(userId) || !UUID.test(body.levelId) || !DAY.test(body.effectiveFrom)) return bad();
  const res = await act(() => api<{ basicPaise: number; cell: number }>(`/v1/payroll/pay-matrix/staff/${userId}`, { method: 'PUT', body }));
  if (res.ok) revalidatePath('/payroll/pay-matrix');
  return res;
}

export async function runIncrements(on: string, apply: boolean): Promise<ActionResult<IncrementPreview>> {
  if (!DAY.test(on)) return bad();
  const res = await act(() => api<IncrementPreview>('/v1/payroll/pay-matrix/increments', { method: 'POST', body: { on, apply } }));
  if (res.ok && apply) revalidatePath('/payroll/pay-matrix');
  return res;
}

// ----- bank file and settlement --------------------------------------------------------------------------

export async function saveBankFile(body: { format: string; debitAccount?: string; corporateId: string }): Promise<ActionResult<BankFileSettings>> {
  const res = await act(() => api<BankFileSettings>('/v1/payroll/bank-file', { method: 'PUT', body: { ...body, debitAccount: body.debitAccount || undefined } }));
  if (res.ok) revalidatePath('/payroll');
  return res;
}

export async function computeSettlement(id: string, waiveNotice: boolean): Promise<ActionResult<Settlement>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<Settlement>(`/v1/hr/separations/${id}/settlement/compute${waiveNotice ? '?waiveNotice=1' : ''}`));
}

export async function saveSettlement(id: string, body: { note: string; waiveNotice: boolean; extra: { label: string; kind: 'earning' | 'recovery'; amountPaise: number }[] }): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`/v1/hr/separations/${id}/settlement`, { method: 'PUT', body }));
  if (res.ok) revalidatePath(`/hr/exit/${id}`);
  return res;
}
