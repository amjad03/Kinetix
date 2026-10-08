'use server';

import { getI18n } from '@/i18n/server';
import { optStr, send } from '@/lib/ops-server';
import { SPONSOR_PAY_METHODS, sponsorInvoiceBody } from '@/lib/payments-desk';

const PAGE = '/fees/sponsors';
const BASE = '/v1/fees';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type V = Record<string, string>;

export async function addSponsor(v: V) {
  return send(`${BASE}/sponsors`, { name: v.name, contactName: optStr(v.contactName), contactEmail: optStr(v.contactEmail), gstin: optStr(v.gstin) }, PAGE);
}

export async function issueSponsorInvoice(v: V) {
  const { t } = await getI18n();
  if (!UUID.test(v.sponsorId ?? '')) return { ok: false as const, error: t('pd.err.sponsor') };
  const r = sponsorInvoiceBody(v);
  if (!r.ok) return { ok: false as const, error: t(r.reason === 'lines' ? 'pd.err.lines' : 'pd.err.lineAmount') };
  return send(`${BASE}/sponsor-invoices`, r.body, PAGE);
}

export async function recordSponsorPayment(invoiceId: string, v: V) {
  const { t } = await getI18n();
  if (!UUID.test(invoiceId)) return { ok: false as const, error: t('pd.err.invoice') };
  const amountPaise = Number(v.amount);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) return { ok: false as const, error: t('pd.err.amount') };
  if (!(SPONSOR_PAY_METHODS as readonly string[]).includes(v.method)) return { ok: false as const, error: t('pd.err.method') };
  return send(`${BASE}/sponsor-invoices/${invoiceId}/payments`, { amountPaise, method: v.method, reference: optStr(v.reference), receivedOn: v.receivedOn }, PAGE);
}

export async function cancelSponsorInvoice(id: string) {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('pd.err.invoice') };
  return send(`${BASE}/sponsor-invoices/${id}/cancel`, undefined, PAGE);
}
