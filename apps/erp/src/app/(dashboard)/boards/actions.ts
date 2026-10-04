'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { ActionResult, CreatedDevice } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addBoard(input: { name: string; campusId: string; roomId?: string }): Promise<ActionResult<CreatedDevice>> {
  const name = input.name.trim();
  if (!name || name.length > 80) return { ok: false, error: 'Name the board (up to 80 characters), for example “Room 204 Board”.' };
  if (!UUID.test(input.campusId)) return { ok: false, error: 'Choose a campus.' };
  if (input.roomId && !UUID.test(input.roomId)) return { ok: false, error: 'Choose a room.' };
  const res = await act(() =>
    api<CreatedDevice>('/v1/devices', { method: 'POST', body: { name, campusId: input.campusId, ...(input.roomId ? { roomId: input.roomId } : {}) } }),
  );
  if (res.ok) revalidatePath('/boards');
  return res;
}
