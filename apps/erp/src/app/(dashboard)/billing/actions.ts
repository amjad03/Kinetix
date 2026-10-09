'use server';

import { getI18n } from '@/i18n/server';
import { optStr, send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/billing';

/** Starts or changes the plan. A GSTIN, when given, must have the GST format. */
export async function subscribe(v: Record<string, string>) {
  const { t } = await getI18n();
  if (!/^\d{2}$/.test(v.billingStateCode ?? '')) return { ok: false as const, error: t('bl.err.state') };
  const gstin = optStr(v.gstin)?.toUpperCase();
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) return { ok: false as const, error: t('bl.err.gstin') };
  return send('/v1/billing/subscription', { planCode: v.planCode, interval: v.interval === 'year' ? 'year' : 'month', billingStateCode: v.billingStateCode, ...(gstin ? { gstin } : {}), trial: v.trial === 'yes' }, PAGE);
}
export async function cancelSubscription() {
  return send('/v1/billing/subscription/cancel', undefined, PAGE);
}
export async function renewNow() {
  return send('/v1/billing/renew', undefined, PAGE);
}
export async function payInvoice(id: string, v: Record<string, string>) {
  const { t } = await getI18n();
  if (!UUID.test(id) || (v.reference ?? '').trim().length < 3) return { ok: false as const, error: t('ops.err.field', { field: t('bl.f.reference') }) };
  return send(`/v1/billing/invoices/${id}/pay`, { reference: v.reference.trim() }, PAGE);
}
