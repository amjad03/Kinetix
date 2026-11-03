'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { SlotProblem, StudioSlot, VersionDetail } from '@/lib/timetable-studio';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('tts2.err.invalid') });

async function call<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<ActionResult<T>> {
  const res = await act(() => api<T>(path, { method, body: method === 'DELETE' ? undefined : (body ?? {}) }));
  if (res.ok) {
    revalidatePath('/timetable/studio', 'layout');
    revalidatePath('/timetable');
  }
  return res;
}

export interface NewVersion {
  name: string;
  sectionIds: string[];
  source: 'generate' | 'copy' | 'blank';
  combine: { subjectId: string; sectionIds: string[] }[];
}

export async function createVersion(v: NewVersion): Promise<ActionResult<{ id: string }>> {
  const name = v.name.trim();
  if (!name || name.length > 120 || !v.sectionIds.length || !v.sectionIds.every((x) => UUID.test(x)) || !['generate', 'copy', 'blank'].includes(v.source)) return bad();
  const combine = v.combine.filter((c) => UUID.test(c.subjectId) && c.sectionIds.length >= 2 && c.sectionIds.every((x) => UUID.test(x)));
  return call('/v1/timetable-studio/versions', 'POST', { name, sectionIds: v.sectionIds, source: v.source, settings: combine.length ? { combine } : {} });
}

export async function regenerate(id: string): Promise<ActionResult<{ placed: number }>> {
  if (!UUID.test(id)) return bad();
  return call(`/v1/timetable-studio/versions/${id}/generate`, 'POST', {});
}

/** A drop in the grid (or, with dryRun, a check while hovering). */
export async function moveSlot(id: string, slotId: string, to: { dayOfWeek: number; startsAt: string; roomId?: string | null; teacherId?: string }, dryRun = false): Promise<ActionResult<{ ok: boolean; problems: SlotProblem[]; slots?: StudioSlot[] }>> {
  if (!UUID.test(id) || !UUID.test(slotId) || !(to.dayOfWeek >= 1 && to.dayOfWeek <= 7) || !TIME.test(to.startsAt) || (to.roomId && !UUID.test(to.roomId)) || (to.teacherId && !UUID.test(to.teacherId))) return bad();
  if (dryRun) return act(() => api(`/v1/timetable-studio/versions/${id}/slots/${slotId}`, { method: 'PATCH', body: { ...to, dryRun: true } }));
  return call(`/v1/timetable-studio/versions/${id}/slots/${slotId}`, 'PATCH', to);
}

export async function lockSlot(id: string, slotId: string, locked: boolean): Promise<ActionResult<{ locked: boolean }>> {
  if (!UUID.test(id) || !UUID.test(slotId)) return bad();
  return call(`/v1/timetable-studio/versions/${id}/slots/${slotId}/lock`, 'POST', { locked });
}

export async function removeVersionSlot(id: string, slotId: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id) || !UUID.test(slotId)) return bad();
  return call(`/v1/timetable-studio/versions/${id}/slots/${slotId}`, 'DELETE');
}

export async function addVersionSlot(id: string, s: { sectionId: string; subjectId: string; teacherId: string; roomId: string | null; dayOfWeek: number; startsAt: string; endsAt: string; batch: string | null; kind: string }): Promise<ActionResult<StudioSlot>> {
  if (!UUID.test(id) || ![s.sectionId, s.subjectId, s.teacherId].every((x) => UUID.test(x)) || (s.roomId && !UUID.test(s.roomId)) || !TIME.test(s.startsAt) || !TIME.test(s.endsAt) || s.startsAt >= s.endsAt) return bad();
  return call(`/v1/timetable-studio/versions/${id}/slots`, 'POST', { ...s, batch: s.batch?.trim() || null });
}

export async function publishVersion(id: string, effectiveFrom: string | null, notify: boolean): Promise<ActionResult<{ published: number; archived: number; told: number }>> {
  if (!UUID.test(id) || (effectiveFrom && !DAY.test(effectiveFrom))) return bad();
  return call(`/v1/timetable-studio/versions/${id}/publish`, 'POST', { effectiveFrom: effectiveFrom || null, notify });
}

export async function discardVersion(id: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(id)) return bad();
  return call(`/v1/timetable-studio/versions/${id}/discard`, 'POST');
}

export async function duplicateVersion(id: string): Promise<ActionResult<VersionDetail>> {
  if (!UUID.test(id)) return bad();
  return call(`/v1/timetable-studio/versions/${id}/duplicate`, 'POST');
}
