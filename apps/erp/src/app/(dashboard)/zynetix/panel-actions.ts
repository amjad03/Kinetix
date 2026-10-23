'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { launcherProblem, RELEASE_CHANNELS, RELEASE_PLATFORMS, versionOk, type LauncherApp, type PanelRelease, type ReleaseChannel, type ReleasePlatform, type Rollout } from '@/lib/panel';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function invalid(key: Parameters<Awaited<ReturnType<typeof getI18n>>['t']>[0] = 'error.VALIDATION'): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t(key) };
}

/** A new release; the file is uploaded next, through /api/panel-release/<id>. */
export async function createRelease(input: { platform: ReleasePlatform; version: string; channel: ReleaseChannel; notes: string }): Promise<ActionResult<PanelRelease>> {
  if (!RELEASE_PLATFORMS.includes(input.platform) || !RELEASE_CHANNELS.includes(input.channel)) return invalid();
  if (!versionOk(input.version)) return invalid('zx.p.err.version');
  return act(() => api<PanelRelease>('/v1/panel/releases', { method: 'POST', body: { platform: input.platform, version: input.version.trim(), channel: input.channel, notes: input.notes.trim() || undefined } }));
}

export async function deleteRelease(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return invalid();
  const r = await act(() => api<null>(`/v1/panel/releases/${id}`, { method: 'DELETE' }));
  if (r.ok) revalidatePath('/zynetix/updates');
  return r;
}

export async function startRollout(releaseId: string, target: 'all' | 'selected', deviceIds: string[]): Promise<ActionResult<Rollout>> {
  if (!UUID.test(releaseId) || !deviceIds.every((d) => UUID.test(d))) return invalid();
  if (target === 'selected' && !deviceIds.length) return invalid('zx.p.err.noBoards');
  const r = await act(() => api<Rollout>('/v1/panel/rollouts', { method: 'POST', body: { releaseId, target, ...(target === 'selected' ? { deviceIds } : {}) } }));
  if (r.ok) revalidatePath('/zynetix/updates');
  return r;
}

export async function stopRollout(id: string): Promise<ActionResult<Rollout>> {
  if (!UUID.test(id)) return invalid();
  const r = await act(() => api<Rollout>(`/v1/panel/rollouts/${id}/stop`, { method: 'POST' }));
  if (r.ok) revalidatePath('/zynetix/updates');
  return r;
}

export async function setBoardChannel(deviceId: string, channel: ReleaseChannel): Promise<ActionResult<{ id: string; updateChannel: ReleaseChannel }>> {
  if (!UUID.test(deviceId) || !RELEASE_CHANNELS.includes(channel)) return invalid();
  return act(() => api(`/v1/panel/devices/${deviceId}/channel`, { method: 'PUT', body: { channel } }));
}

export async function getLauncher(deviceId: string | null): Promise<ActionResult<{ deviceId: string | null; apps: LauncherApp[] }>> {
  if (deviceId && !UUID.test(deviceId)) return invalid();
  return act(() => api(`/v1/panel/launcher${deviceId ? `?deviceId=${deviceId}` : ''}`));
}

export async function saveLauncher(deviceId: string | null, apps: LauncherApp[]): Promise<ActionResult<{ deviceId: string | null; apps: LauncherApp[] }>> {
  if (deviceId && !UUID.test(deviceId)) return invalid();
  const clean = apps.map((a) => ({ package: a.package.trim(), label: a.label.trim(), iconUrl: a.iconUrl?.trim() || null }));
  const problem = launcherProblem(clean);
  if (problem) return invalid(problem);
  return act(() => api('/v1/panel/launcher', { method: 'PUT', body: { deviceId, apps: clean } }));
}
