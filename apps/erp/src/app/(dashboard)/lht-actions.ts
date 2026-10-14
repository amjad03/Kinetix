'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { isLhtPath, isLhtRead } from '@/lib/lht';
import type { ActionResult } from '@/lib/types';

/** One server action for the library, hostel and transport desks: only their listed API paths, only POST. */
export async function runLht(path: string, body: Record<string, unknown>): Promise<ActionResult<Record<string, unknown>>> {
  if (typeof path !== 'string' || !isLhtPath(path) || typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: (await getI18n()).t('error.generic') };
  const res = await act(() => api<Record<string, unknown> | null>(path, { method: 'POST', body, timeoutMs: 60_000 }));
  if (!res.ok) return res;
  revalidatePath('/', 'layout');
  return { ok: true, data: res.data ?? {} };
}

/** A desk lookup (a scanned code, an ISBN, a student's no-dues): only the listed API paths, only GET. */
export async function readLht(path: string): Promise<ActionResult<Record<string, unknown>>> {
  if (typeof path !== 'string' || !isLhtRead(path)) return { ok: false, error: (await getI18n()).t('error.generic') };
  return act(() => api<Record<string, unknown>>(path));
}

/** A MARC file (ISO 2709 or MARCXML): checked first (`preview`), then added to the catalogue with copies. */
export async function sendMarc(mode: 'preview' | 'import', form: FormData): Promise<ActionResult<Record<string, unknown>>> {
  const file = form.get('file');
  const copies = Number(form.get('copies') ?? 1);
  const branchId = String(form.get('branchId') ?? '');
  if (!['preview', 'import'].includes(mode) || !(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024 || !Number.isInteger(copies) || copies < 0 || copies > 50 || (branchId && !/^[0-9a-f-]{36}$/.test(branchId)))
    return { ok: false, error: (await getI18n()).t('error.generic') };
  const out = new FormData();
  out.append('file', file, file.name);
  const q = mode === 'import' ? `?copies=${copies}${branchId ? `&branchId=${branchId}` : ''}` : '';
  const res = await act(() => api<Record<string, unknown>>(`/v1/library/marc/${mode}${q}`, { method: 'POST', form: out, timeoutMs: 120_000 }));
  if (res.ok && mode === 'import') revalidatePath('/', 'layout');
  return res;
}
