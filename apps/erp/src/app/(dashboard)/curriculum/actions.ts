'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { CurriculumDiff } from '@/lib/curriculum';
import { read, send } from '@/lib/ops-server';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/curriculum';
const base = '/v1/curriculum';

async function bad(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t('cu.err.input') };
}

/** A new draft version; with `cloneFromId` it starts as a copy of that version (a revision). */
export async function createVersion(v: { programId: string; regulationYear: string; label: string; cloneFromId?: string }) {
  const year = Number(v.regulationYear);
  if (!UUID.test(v.programId) || !Number.isInteger(year) || !v.label.trim() || (v.cloneFromId && !UUID.test(v.cloneFromId))) return bad();
  return send(`${base}/versions`, { programId: v.programId, regulationYear: year, label: v.label.trim(), ...(v.cloneFromId ? { cloneFromId: v.cloneFromId } : {}) }, PAGE);
}

export async function approveVersion(id: string, bosRef: string) {
  if (!UUID.test(id) || !bosRef.trim()) return bad();
  return send(`${base}/versions/${encodeURIComponent(id)}/approve`, { bosRef: bosRef.trim() }, PAGE);
}

export async function activateVersion(id: string) {
  if (!UUID.test(id)) return bad();
  return send(`${base}/versions/${encodeURIComponent(id)}/activate`, {}, PAGE);
}

export async function compareVersions(from: string, to: string): Promise<ActionResult<CurriculumDiff>> {
  if (!UUID.test(from) || !UUID.test(to)) return bad();
  return read<CurriculumDiff>(`${base}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

/** Uploads a syllabus PDF or Word file; the API reads it and keeps the AI's proposal for review. */
export async function uploadSyllabus(form: FormData): Promise<ActionResult<{ id: string }>> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || !UUID.test(String(form.get('programId') ?? '')) || !/^\d{4}$/.test(String(form.get('regulationYear') ?? ''))) return bad();
  const res = await act(() => api<{ id: string }>(`${base}/imports`, { method: 'POST', form, timeoutMs: 180_000 }));
  if (res.ok) revalidatePath(PAGE);
  return res;
}

export async function draftFromImport(id: string) {
  if (!UUID.test(id)) return bad();
  return send(`${base}/imports/${encodeURIComponent(id)}/draft`, {}, PAGE);
}
