'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { structureLines, type LineDraft } from '@/lib/hr';
import type { ActionResult } from '@/lib/types';
import type { PayrollRunDetail, PayrollSettings, SalaryComponent, SalaryStructure } from '@/lib/hr-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function createRun(month: string): Promise<ActionResult<PayrollRunDetail>> {
  const res = await act(() => api<PayrollRunDetail>('/v1/payroll/runs', { method: 'POST', body: { month } }));
  if (res.ok) revalidatePath('/payroll');
  return res;
}

/** recompute needs no version; approve, lock and reopen send the one the person was looking at. */
export async function runAction(id: string, action: 'recompute' | 'approve' | 'lock' | 'reopen', version: number): Promise<ActionResult<PayrollRunDetail>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<PayrollRunDetail>(`/v1/payroll/runs/${id}/${action}`, { method: 'POST', body: { expectedVersion: version } }));
  if (res.ok) {
    revalidatePath(`/payroll/runs/${id}`);
    revalidatePath('/payroll');
  }
  return res;
}

export async function loadStructures(userId: string): Promise<ActionResult<{ current: SalaryStructure | null; history: SalaryStructure[] }>> {
  if (!UUID.test(userId)) return { ok: false, error: (await getI18n()).t('error.generic') };
  return act(() => api<{ current: SalaryStructure | null; history: SalaryStructure[] }>(`/v1/payroll/structures/${userId}`));
}

export async function saveStructure(userId: string, effectiveFrom: string, rows: LineDraft[]): Promise<ActionResult<SalaryStructure>> {
  const { t } = await getI18n();
  if (!UUID.test(userId) || !DAY.test(effectiveFrom)) return { ok: false, error: t('pay.st.err.date') };
  const lines = structureLines(rows);
  if (!lines.ok) return { ok: false, error: t(lines.reason === 'duplicate' ? 'pay.st.err.duplicate' : lines.reason === 'empty' ? 'pay.st.err.empty' : 'pay.st.err.amount') };
  return act(() => api<SalaryStructure>(`/v1/payroll/structures/${userId}`, { method: 'PUT', body: { effectiveFrom, lines: lines.lines } }));
}

export async function addComponent(c: { code: string; name: string; kind: 'earning' | 'deduction'; pfWage: boolean; taxable: boolean }): Promise<ActionResult<SalaryComponent>> {
  const res = await act(() => api<SalaryComponent>('/v1/payroll/components', { method: 'POST', body: { ...c, code: c.code.trim(), name: c.name.trim(), active: true, sortOrder: c.kind === 'deduction' ? 10 : 5 } }));
  if (res.ok) revalidatePath('/payroll');
  return res;
}

export async function saveSettings(s: PayrollSettings): Promise<ActionResult<PayrollSettings>> {
  const res = await act(() => api<PayrollSettings>('/v1/payroll/settings', { method: 'PUT', body: s }));
  if (res.ok) revalidatePath('/payroll');
  return res;
}
