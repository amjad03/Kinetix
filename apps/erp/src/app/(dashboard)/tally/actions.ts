'use server';

import { send } from '@/lib/ops-server';

const PAGE = '/tally';
type V = Record<string, string>;

export async function saveSettings(v: V) {
  return send('/v1/tally/settings', { host: v.host, port: Number(v.port || 9000), company: v.company, enabled: v.enabled !== 'no' }, PAGE, 'PUT');
}

export async function saveMapping(accountId: string, v: V) {
  return send('/v1/tally/mapping', { accountId, tallyLedger: v.tallyLedger, tallyParent: v.tallyParent }, PAGE, 'PUT');
}

export async function syncNow() {
  return send<{ sent: number; failed: number }>('/v1/tally/sync', {}, PAGE);
}

export async function retryRow(id: string) {
  return send(`/v1/tally/log/${encodeURIComponent(id)}/retry`, {}, PAGE);
}

export async function markImported() {
  return send('/v1/tally/mark-imported', {}, PAGE);
}
