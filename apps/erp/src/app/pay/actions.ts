'use server';

import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

const SLUG = /^[a-z0-9-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const UUID = /^[0-9a-f-]{36}$/;

export interface PayOrder {
  paymentId: string;
  provider: string;
  keyId: string;
  orderId: string;
  hosted: { url: string; method: 'POST' | 'GET'; fields: Record<string, string> } | null;
  session: { id: string; environment: 'sandbox' | 'production' } | null;
  amountPaise: number;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

/** Starts the payment of a payment link (no sign-in: the link's token is the key). */
export async function payLinkCheckout(slug: string, token: string, amountPaise?: number): Promise<ActionResult<PayOrder>> {
  if (!SLUG.test(slug) || !TOKEN.test(token)) return { ok: false, error: 'This link is not valid' } as ActionResult<PayOrder>;
  return act(() => api<PayOrder>(`/v1/public/pay/${slug}/${token}/checkout`, { method: 'POST', body: amountPaise ? { amountPaise } : {}, anonymous: true }));
}

/** Asks whether the payment went through (after the gateway's checkout returns). */
export async function payLinkRefresh(slug: string, token: string, paymentId: string): Promise<ActionResult<{ status: string; receiptNo: string | null }>> {
  if (!SLUG.test(slug) || !TOKEN.test(token) || !UUID.test(paymentId)) return { ok: false, error: 'This link is not valid' } as ActionResult<{ status: string; receiptNo: string | null }>;
  return act(() => api<{ status: string; receiptNo: string | null }>(`/v1/public/pay/${slug}/${token}/payments/${paymentId}/refresh`, { method: 'POST', anonymous: true }));
}
