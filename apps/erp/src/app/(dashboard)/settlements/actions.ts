'use server';

import { optStr, send } from '@/lib/ops-server';

const PAGE = '/settlements';
type V = Record<string, string>;

export async function saveGateway(v: V) {
  const payu = v.provider === 'payu';
  return send('/v1/admin/payments/gateway', { provider: v.provider, keyId: v.keyId, ...(optStr(v.keySecret) ? { keySecret: v.keySecret } : {}), ...(!payu && optStr(v.webhookSecret) ? { webhookSecret: v.webhookSecret } : {}) }, PAGE, 'PUT');
}

export async function importSettlement(v: V) {
  return send<{ lines: number; matched: number; exceptions: number }>('/v1/fees/settlements/import', { provider: v.provider, reference: v.reference, settlementDate: v.settlementDate, csv: v.csv }, PAGE);
}

export async function fetchSettlement(v: V) {
  return send('/v1/fees/settlements/fetch', { day: v.day }, PAGE);
}

export async function resolveLine(id: string, note: string) {
  return send(`/v1/fees/settlements/lines/${encodeURIComponent(id)}/resolve`, { action: 'accept', note }, PAGE);
}
