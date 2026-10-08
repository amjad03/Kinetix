'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const PAGE = '/fees/bank-transfers';
const BASE = '/v1/fees/bank-transfers';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The accountant has matched the transfer to the bank statement: the payment is recorded and the receipt numbered. */
export async function verifyTransfer(id: string) {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('pd.err.transfer') };
  return send(`${BASE}/${id}/verify`, undefined, PAGE);
}

export async function rejectTransfer(id: string, v: Record<string, string>) {
  const { t } = await getI18n();
  if (!UUID.test(id)) return { ok: false as const, error: t('pd.err.transfer') };
  const note = (v.note ?? '').trim();
  if (!note || note.length > 300) return { ok: false as const, error: t('pd.err.reason') };
  return send(`${BASE}/${id}/reject`, { note }, PAGE);
}
