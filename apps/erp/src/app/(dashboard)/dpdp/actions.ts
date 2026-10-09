'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Approves or rejects one request. A rejection needs a note; the API applies the correction or erases unless retention blocks it. */
export async function processRequest(id: string, decision: 'approve' | 'reject', note: string) {
  const { t } = await getI18n();
  if (!UUID.test(id)) return { ok: false as const, error: t('ops.err.field', { field: 'id' }) };
  if (decision === 'reject' && !note.trim()) return { ok: false as const, error: t('dp.noteNeeded') };
  return send(`/v1/dpdp/requests/${encodeURIComponent(id)}/process`, { decision, note: note.trim() }, '/dpdp');
}
