'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { ACTIONS, isOpsModule, isRecordKind, recordHref } from '@/lib/campus-ops';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs one workflow action on a record through the module's own endpoint (only actions in the catalogue). */
export async function runRecordAction(kind: string, id: string, key: string, note: string): Promise<ActionResult<unknown>> {
  if (!isRecordKind(kind) || !UUID.test(id)) return { ok: false, error: 'Not found.' };
  const a = (ACTIONS[kind] ?? []).find((x) => x.key === key);
  if (!a) return { ok: false, error: 'Not found.' };
  const text = note.trim().slice(0, 500);
  if (a.decision === 'reject' && !text) return { ok: false, error: 'Give a reason for rejecting.' };
  const res = await act(() => api<unknown>(a.path(id), { method: 'POST', body: a.body?.(text) ?? {} }));
  if (res.ok) revalidatePath(recordHref(kind, id));
  return res;
}

export interface SettingsInput {
  rules: Record<string, string | number | boolean>;
  templates: Record<string, string>;
  defaults: Record<string, string | number | boolean>;
  numbering: Record<string, { prefix: string; next: number; pad: number; suffix?: string }>;
}

export async function saveModuleSettings(module: string, input: SettingsInput): Promise<ActionResult<unknown>> {
  if (!isOpsModule(module)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api<unknown>(`/v1/module-settings/${module}`, { method: 'PUT', body: input }));
  if (res.ok) revalidatePath(`/module-settings/${module}`);
  return res;
}

export async function startStockCheck(note: string): Promise<ActionResult<{ id: string }>> {
  const res = await act(() => api<{ id: string }>('/v1/library/stock-checks', { method: 'POST', body: { note: note.trim().slice(0, 300) } }));
  if (res.ok) revalidatePath('/library/stock-checks');
  return res;
}

export async function scanStockCheck(id: string, code: string): Promise<ActionResult<{ title: string; found: number; copies: number; over: boolean }>> {
  if (!UUID.test(id) || !code.trim()) return { ok: false, error: 'Not found.' };
  return act(() => api<{ title: string; found: number; copies: number; over: boolean }>(`/v1/library/stock-checks/${id}/scan`, { method: 'POST', body: { code: code.trim().slice(0, 80) } }));
}

export async function closeStockCheck(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return { ok: false, error: 'Not found.' };
  const res = await act(() => api<unknown>(`/v1/library/stock-checks/${id}/close`, { method: 'POST' }));
  if (res.ok) revalidatePath('/library/stock-checks');
  return res;
}
