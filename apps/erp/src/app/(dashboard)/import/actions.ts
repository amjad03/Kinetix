'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { IMPORT_KINDS, MAX_FILE_BYTES, missingColumns, type ImportKind, type ImportResult } from '@/lib/import';
import type { ActionResult } from '@/lib/types';

const isKind = (k: unknown): k is ImportKind => typeof k === 'string' && (IMPORT_KINDS as readonly string[]).includes(k);

/** Sends the CSV to the API: a dry run (`check`) or the import itself. The API checks roles and every row. */
async function send(kind: ImportKind, csv: string, opts: { dryRun: boolean; replace: boolean }): Promise<ActionResult<ImportResult>> {
  const { t } = await getI18n();
  if (!isKind(kind) || typeof csv !== 'string') return { ok: false, error: t('import.err.file') };
  if (csv.length > MAX_FILE_BYTES) return { ok: false, error: t('import.err.size') };
  if (!csv.replace(/^﻿/, '').split(/\r?\n/).some((l) => l.trim() && !l.startsWith('#'))) return { ok: false, error: t('import.err.empty') };
  const missing = missingColumns(csv, kind);
  if (missing.length) return { ok: false, error: t('import.err.columns', { columns: missing.join(', ') }) };
  const query = new URLSearchParams({ dryRun: String(opts.dryRun), ...(kind === 'timetable' && opts.replace ? { replace: 'true' } : {}) });
  const res = await act(() => api<ImportResult>(`/v1/admin/import/${kind}?${query}`, { method: 'POST', csv, timeoutMs: 120_000 }));
  if (res.ok && res.data.committed) for (const path of ['/', '/classes', '/timetable', '/departments', '/department']) revalidatePath(path);
  return res;
}

export async function checkImport(kind: ImportKind, csv: string, replace = false): Promise<ActionResult<ImportResult>> {
  return send(kind, csv, { dryRun: true, replace });
}

export async function runImport(kind: ImportKind, csv: string, replace = false): Promise<ActionResult<ImportResult>> {
  return send(kind, csv, { dryRun: false, replace });
}

/** The CSV template for a file type (GET /v1/admin/import/templates/:kind). */
export async function importTemplate(kind: ImportKind): Promise<ActionResult<string>> {
  if (!isKind(kind)) return { ok: false, error: (await getI18n()).t('import.err.file') };
  return act(() => api<string>(`/v1/admin/import/templates/${kind}`, { text: true }));
}
