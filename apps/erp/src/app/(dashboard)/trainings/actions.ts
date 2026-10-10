'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Confirms, completes or cancels a teacher's training request, with a note the teacher sees on the board. */
export async function decideTraining(id: string, status: 'confirmed' | 'done' | 'cancelled', adminNote?: string) {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('trn.err.id') };
  return send(`/v1/classroom/trainings/${encodeURIComponent(id)}`, { status, ...(adminNote === undefined ? {} : { adminNote }) }, '/trainings', 'PATCH');
}
