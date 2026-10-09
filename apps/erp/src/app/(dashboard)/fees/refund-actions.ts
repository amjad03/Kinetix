'use server';

import { send } from '@/lib/ops-server';

/** Refunds part or all of a payment now. With an approval flow active the API refuses with a message saying to send it for approval. */
export async function refundPayment(paymentId: string, v: Record<string, string>) {
  return send('/v1/finance/refunds', { paymentId, amountPaise: Number(v.amount), reason: v.reason }, '/fees');
}
