'use server';

import { qtyRows } from '@/lib/ops';
import { num, send } from '@/lib/ops-server';

const PAGE = '/canteen';
type V = Record<string, string>;

export async function addItem(v: V) {
  return send('/v1/canteen/items', { name: v.name, pricePaise: num(v.price) }, PAGE);
}

export async function setItem(itemId: string, patch: { pricePaise?: number; available?: boolean }) {
  return send(`/v1/canteen/items/${encodeURIComponent(itemId)}`, patch, PAGE, 'PATCH');
}

/** The key is made in the browser once per dialog, so a retried click tops up once. */
export async function topUp(v: V, key: string) {
  return send('/v1/canteen/wallet/topup', { studentId: v.studentId, amountPaise: num(v.amount), idempotencyKey: key }, PAGE);
}

export async function placeOrder(v: V, key: string) {
  return send<{ balancePaise: number }>('/v1/canteen/orders', { studentId: v.studentId, idempotencyKey: key, items: qtyRows(v, 'q_').map((r) => ({ itemId: r.id, qty: r.qty })) }, PAGE);
}

export async function markMeal(v: V) {
  return send('/v1/canteen/meal-attendance', { meal: v.meal, studentIds: v.studentIds.split(/[\s,]+/).filter(Boolean) }, PAGE);
}
