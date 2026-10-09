'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Compares the typed answers of a homework with each other and with earlier work in the subject. */
export async function runIntegrityCheck(homeworkId: string, threshold: number) {
  if (!UUID.test(homeworkId)) return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field: 'homework' }) };
  const th = Math.min(1, Math.max(0.2, threshold));
  return send(`/v1/integrity/homework/${homeworkId}/check`, { threshold: th }, '/integrity');
}

/** The teacher's decision on one flag: a prompt to look, never a finding. */
export async function reviewFlag(id: string, reviewed: 'confirmed' | 'dismissed') {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field: 'id' }) };
  return send(`/v1/integrity/matches/${id}`, { reviewed }, '/integrity', 'PUT');
}
