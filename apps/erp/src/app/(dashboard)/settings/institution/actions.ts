'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { ACADEMIC_MODELS, type AttendanceRules, type InstitutionProfile } from '@/lib/institution';
import type { ActionResult } from '@/lib/types';

/** Saves the profile, academic model and module toggles (PUT /v1/admin/institution/profile). */
export async function saveProfile(body: Record<string, unknown>): Promise<ActionResult<InstitutionProfile>> {
  if (body.academicModel !== undefined && !(ACADEMIC_MODELS as readonly string[]).includes(String(body.academicModel))) return { ok: false, error: 'Choose an academic model.' };
  const res = await act(() => api<InstitutionProfile>('/v1/admin/institution/profile', { method: 'PUT', body }));
  // The menu depends on the module toggles, so every page refreshes.
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

/** Attendance lock and threshold live with the other institution settings. */
export async function saveAttendanceRules(rules: AttendanceRules): Promise<ActionResult<unknown>> {
  const res = await act(() => api('/v1/admin/settings', { method: 'PUT', body: { attendanceLockHours: rules.attendanceLockHours, attendanceThresholdPct: rules.attendanceThresholdPct } }));
  if (res.ok) revalidatePath('/settings/institution');
  return res;
}

export async function addBuilding(input: { campusId: string; name: string; code: string }): Promise<ActionResult<unknown>> {
  const res = await act(() => api('/v1/admin/institution/buildings', { method: 'POST', body: { campusId: input.campusId, name: input.name.trim(), ...(input.code.trim() ? { code: input.code.trim() } : {}) } }));
  if (res.ok) revalidatePath('/settings/buildings');
  return res;
}

export async function addFloor(buildingId: string, input: { level: number; label: string }): Promise<ActionResult<unknown>> {
  const res = await act(() => api(`/v1/admin/institution/buildings/${encodeURIComponent(buildingId)}/floors`, { method: 'POST', body: { level: input.level, label: input.label.trim() } }));
  if (res.ok) revalidatePath('/settings/buildings');
  return res;
}

export async function placeRoom(roomId: string, floorId: string | null): Promise<ActionResult<unknown>> {
  const res = await act(() => api(`/v1/admin/institution/rooms/${encodeURIComponent(roomId)}/floor`, { method: 'PUT', body: { floorId } }));
  if (res.ok) revalidatePath('/settings/buildings');
  return res;
}
