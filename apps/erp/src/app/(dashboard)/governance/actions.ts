'use server';

import { getI18n } from '@/i18n/server';
import { read, send } from '@/lib/ops-server';
import type { Incident } from '@/lib/governance';

// Rules, incidents and retention policies are record kit lists (records-actions.ts); these are the steps around them.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETENTION = '/governance/retention';

async function field(name: string) {
  return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field: name }) };
}

/** An incident with its timeline. */
export async function incidentTimeline(id: string) {
  if (!UUID.test(id)) return field('id');
  return read<Incident>(`/v1/governance/incidents/${id}`);
}

/** Archives every file that is past its retention. */
export async function runRetention() {
  return send('/v1/governance/retention/run', undefined, RETENTION);
}

/** Puts a file on legal hold (kept out of the archive run), or takes it off. */
export async function holdFile(id: string, hold: boolean) {
  if (!UUID.test(id)) return field('id');
  return send(`/v1/governance/documents/${id}/hold`, { hold }, RETENTION);
}
