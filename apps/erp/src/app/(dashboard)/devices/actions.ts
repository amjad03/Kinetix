'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RemoteAction =
  | { type: 'lock' | 'unlock' | 'restart_app' | 'clear_pin_profiles' | 'unpair' }
  | { type: 'message'; text: string; seconds: number }
  | { type: 'kiosk_policy'; enabled: boolean | null }
  | { type: 'rename_move'; name?: string; roomId?: string | null };

/** Sends one remote action to a board. The result says whether the board got it now or will when it reconnects. */
export async function sendAction(id: string, action: RemoteAction): Promise<ActionResult<{ id: string; status: string; online: boolean }>> {
  const { t } = await getI18n();
  if (!UUID.test(id)) return { ok: false, error: t('devices.err.unknown') };
  if (action.type === 'message' && (!action.text.trim() || action.text.length > 280)) return { ok: false, error: t('devices.err.message') };
  if (action.type === 'rename_move' && action.name !== undefined && (!action.name.trim() || action.name.length > 80)) return { ok: false, error: t('devices.err.name') };
  const res = await act(() => api<{ id: string; status: string; online: boolean }>(`/v1/devices/${id}/actions`, { method: 'POST', body: action.type === 'message' ? { ...action, text: action.text.trim() } : action }));
  if (res.ok) revalidatePath('/devices');
  return res;
}

/** Replaces the institution's offline pairing key (for the institution administrator). */
export async function rotateSigningKey(): Promise<ActionResult<{ keyId: string }>> {
  const res = await act(() => api<{ keyId: string }>('/v1/pairing/signing-key/rotate', { method: 'POST', body: {} }));
  if (res.ok) revalidatePath('/devices');
  return res;
}
