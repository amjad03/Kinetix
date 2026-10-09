// Server-side loaders the pages share (pages only; client code imports lib/pathways-b.ts).

import { api, load } from '@/lib/api';
import { activeFlows } from '@/lib/pathways-b';

/** Which of the five approval-routed flows have an active definition, or null when the list cannot be read. */
export async function loadFlows(): Promise<Record<string, boolean> | null> {
  const r = await load(() => api<{ requestType: string; active: boolean }[]>('/v1/workflows/definitions'));
  return r.error !== undefined ? null : activeFlows(r.data);
}
