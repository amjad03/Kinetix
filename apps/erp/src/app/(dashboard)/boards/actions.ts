'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult, CreatedDevice } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addBoard(input: { name: string; campusId: string; roomId?: string }): Promise<ActionResult<CreatedDevice>> {
  const { t } = await getI18n();
  const name = input.name.trim();
  if (!name || name.length > 80) return { ok: false, error: t('boards.err.name') };
  if (!UUID.test(input.campusId)) return { ok: false, error: t('boards.err.campus') };
  if (input.roomId && !UUID.test(input.roomId)) return { ok: false, error: t('boards.err.room') };
  const res = await act(() =>
    api<CreatedDevice>('/v1/devices', { method: 'POST', body: { name, campusId: input.campusId, ...(input.roomId ? { roomId: input.roomId } : {}) } }),
  );
  if (res.ok) revalidatePath('/boards');
  return res;
}

export async function renameBoard(id: string, name: string): Promise<ActionResult<{ id: string; name: string }>> {
  const { t } = await getI18n();
  const trimmed = name.trim();
  if (!UUID.test(id)) return { ok: false, error: t('boards.err.unknown') };
  if (!trimmed || trimmed.length > 80) return { ok: false, error: t('boards.err.nameShort') };
  const res = await act(() => api<{ id: string; name: string }>(`/v1/devices/${id}`, { method: 'PATCH', body: { name: trimmed } }));
  if (res.ok) revalidatePath('/boards');
  return res;
}

/** A new one-time code; the board is signed out and must be set up again with it. */
export async function newEnrollmentCode(id: string): Promise<ActionResult<CreatedDevice>> {
  if (!UUID.test(id)) return { ok: false, error: (await getI18n()).t('boards.err.unknown') };
  const res = await act(() => api<CreatedDevice>(`/v1/devices/${id}/enrollment-code`, { method: 'POST' }));
  if (res.ok) revalidatePath('/boards');
  return res;
}
