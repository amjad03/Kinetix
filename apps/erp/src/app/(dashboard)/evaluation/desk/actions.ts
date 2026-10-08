'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/evaluation/desk';
const base = (id: string) => `/v1/evaluation/allocations/${encodeURIComponent(id)}`;

/** Saves the examiner's marks and comments for a script; can be called again to resume. */
export async function saveMarks(allocationId: string, entries: { questionId: string; marks: number; comment?: string }[]) {
  if (!UUID.test(allocationId) || entries.length === 0) return { ok: false as const, error: (await getI18n()).t('ev.desk.err.entries') };
  return send(`${base(allocationId)}/marks`, { entries }, PAGE, 'PUT');
}

/** Locks the valuation; the API refuses it while a question has no marks. */
export async function submitValuation(allocationId: string) {
  if (!UUID.test(allocationId)) return { ok: false as const, error: (await getI18n()).t('ev.desk.err.entries') };
  return send<{ total: number; needsThird: boolean }>(`${base(allocationId)}/submit`, undefined, PAGE);
}
