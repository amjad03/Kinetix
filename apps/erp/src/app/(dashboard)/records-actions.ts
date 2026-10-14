'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { ENTITY_KEY, type BinResult, type BulkReport, type HistoryEntry, type ImportBatch, type Row, type SavedView, type SavedViewState } from '@/lib/records';
import type { ActionResult } from '@/lib/types';

/**
 * The record kit's server actions, the same for every module: they send the change to `/v1/records/:entity` (or the
 * recycle bin and saved views) as the signed-in user. The API checks roles and every value.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = /^[a-z][a-z0-9./-]{0,80}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('error.generic') });
const done = <T>(res: ActionResult<T>) => {
  if (res.ok) revalidatePath('/', 'layout');
  return res;
};
const okEntity = (e: string) => typeof e === 'string' && ENTITY_KEY.test(e);
const okId = (id: string) => typeof id === 'string' && UUID.test(id);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function getRecord(entity: string, id: string): Promise<ActionResult<Row>> {
  if (!okEntity(entity) || !okId(id)) return bad();
  return act(() => api<Row>(`/v1/records/${entity}/${id}`));
}

export async function createRecord(entity: string, values: Record<string, unknown>): Promise<ActionResult<Row>> {
  if (!okEntity(entity) || !plain(values)) return bad();
  return done(await act(() => api<Row>(`/v1/records/${entity}`, { method: 'POST', body: values })));
}

export async function updateRecord(entity: string, id: string, values: Record<string, unknown>): Promise<ActionResult<Row>> {
  if (!okEntity(entity) || !okId(id) || !plain(values)) return bad();
  return done(await act(() => api<Row>(`/v1/records/${entity}/${id}`, { method: 'PATCH', body: values })));
}

/** Moves the record to the recycle bin; the bin entry's id lets the person undo at once. */
export async function deleteRecord(entity: string, id: string): Promise<ActionResult<{ binId: string; label: string; rows: number }>> {
  if (!okEntity(entity) || !okId(id)) return bad();
  return done(await act(() => api<{ binId: string; label: string; rows: number }>(`/v1/records/${entity}/${id}`, { method: 'DELETE' })));
}

export async function duplicateRecord(entity: string, id: string): Promise<ActionResult<Row>> {
  if (!okEntity(entity) || !okId(id)) return bad();
  return done(await act(() => api<Row>(`/v1/records/${entity}/${id}/duplicate`, { method: 'POST', body: {} })));
}

export async function moveRecord(entity: string, id: string, to: string, reason?: string): Promise<ActionResult<Row>> {
  if (!okEntity(entity) || !okId(id) || typeof to !== 'string' || !to) return bad();
  return done(await act(() => api<Row>(`/v1/records/${entity}/${id}/move`, { method: 'POST', body: { to, ...(reason?.trim() ? { reason: reason.trim() } : {}) } })));
}

/** Bulk update, delete, move or a module's own action, with a report per record. */
export async function bulkRecords(entity: string, body: Record<string, unknown>): Promise<ActionResult<BulkReport>> {
  if (!okEntity(entity) || !plain(body) || !['update', 'delete', 'move', 'action'].includes(String(body.op))) return bad();
  return done(await act(() => api<BulkReport>(`/v1/records/${entity}/bulk`, { method: 'POST', body, timeoutMs: 120_000 })));
}

export async function reorderRecords(entity: string, ids: string[]): Promise<ActionResult<{ ids: string[] }>> {
  if (!okEntity(entity) || !Array.isArray(ids) || !ids.length || !ids.every(okId)) return bad();
  return done(await act(() => api<{ ids: string[] }>(`/v1/records/${entity}/reorder`, { method: 'POST', body: { ids } })));
}

export async function recordHistory(entity: string, id: string, offset = 0): Promise<ActionResult<{ items: HistoryEntry[]; total: number }>> {
  if (!okEntity(entity) || !okId(id) || !Number.isInteger(offset) || offset < 0) return bad();
  return act(() => api<{ items: HistoryEntry[]; total: number }>(`/v1/records/${entity}/${id}/history?limit=50&offset=${offset}`));
}

/** Upload → check every row (nothing is saved yet). `form` carries `file` and `mode` (insert or upsert). */
export async function uploadImport(entity: string, form: FormData): Promise<ActionResult<ImportBatch>> {
  if (!okEntity(entity)) return bad();
  const file = form.get('file');
  const { t } = await getI18n();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: t('rk.import.noFile') };
  if (file.size > 6 * 1024 * 1024) return { ok: false, error: t('import.err.size') };
  const mode = form.get('mode') === 'insert' ? 'insert' : 'upsert';
  const out = new FormData();
  out.set('file', file, file.name);
  return act(() => api<ImportBatch>(`/v1/records/${entity}/import?mode=${mode}`, { method: 'POST', form: out, timeoutMs: 120_000 }));
}

export async function commitImport(entity: string, batchId: string, skipErrors: boolean): Promise<ActionResult<ImportBatch>> {
  if (!okEntity(entity) || !okId(batchId)) return bad();
  return done(await act(() => api<ImportBatch>(`/v1/records/${entity}/import/${batchId}/commit`, { method: 'POST', body: { skipErrors: !!skipErrors }, timeoutMs: 120_000 })));
}

// ---- saved views --------------------------------------------------------------------------------

export async function listViews(page: string): Promise<ActionResult<SavedView[]>> {
  if (!PAGE.test(page)) return bad();
  return act(() => api<SavedView[]>(`/v1/saved-views?page=${encodeURIComponent(page)}`));
}

export async function saveView(input: { page: string; name: string; state: SavedViewState; sharedRoles: string[]; isDefault: boolean }): Promise<ActionResult<SavedView>> {
  if (!PAGE.test(input.page) || !input.name?.trim()) return bad();
  return act(() => api<SavedView>('/v1/saved-views', { method: 'POST', body: { ...input, name: input.name.trim() } }));
}

export async function updateView(id: string, patch: Partial<{ name: string; state: SavedViewState; sharedRoles: string[]; isDefault: boolean }>): Promise<ActionResult<SavedView>> {
  if (!okId(id) || !plain(patch)) return bad();
  return act(() => api<SavedView>(`/v1/saved-views/${id}`, { method: 'PUT', body: patch }));
}

export async function deleteView(id: string): Promise<ActionResult<unknown>> {
  if (!okId(id)) return bad();
  return act(() => api(`/v1/saved-views/${id}`, { method: 'DELETE' }));
}

// ---- recycle bin ----------------------------------------------------------------------------------

export async function restoreFromBin(ids: string[]): Promise<ActionResult<{ results: BinResult[] }>> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(okId)) return bad();
  return done(await act(() => api<{ results: BinResult[] }>('/v1/recycle-bin/restore', { method: 'POST', body: { ids } })));
}

export async function purgeFromBin(ids: string[]): Promise<ActionResult<{ results: BinResult[] }>> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(okId)) return bad();
  return done(await act(() => api<{ results: BinResult[] }>('/v1/recycle-bin/purge', { method: 'POST', body: { ids } })));
}

export async function saveBinRetention(days: number): Promise<ActionResult<{ retentionDays: number }>> {
  if (!Number.isInteger(days) || days < 1 || days > 3650) return bad();
  return done(await act(() => api<{ retentionDays: number }>('/v1/recycle-bin/settings', { method: 'PUT', body: { retentionDays: days } })));
}
