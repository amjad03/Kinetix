'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { GatewayAccount, GatewayInput, GatewayTest } from '@/lib/gateways';
import type { ActionResult } from '@/lib/types';

/** Saves the default gateway or a fee account's own; secrets left empty keep the stored ones. */
export async function saveGateway(input: GatewayInput): Promise<ActionResult<GatewayAccount>> {
  const res = await act(() => api<GatewayAccount>('/v1/admin/payments/gateways', { method: 'PUT', body: input }));
  if (res.ok) revalidatePath('/fees/gateways');
  return res;
}

export async function removeGateway(feeAccountId: string | null): Promise<ActionResult<{ removed: boolean }>> {
  const q = feeAccountId && /^[0-9a-f-]{36}$/.test(feeAccountId) ? `?feeAccountId=${feeAccountId}` : '';
  const res = await act(() => api<{ removed: boolean }>(`/v1/admin/payments/gateways${q}`, { method: 'DELETE' }));
  if (res.ok) revalidatePath('/fees/gateways');
  return res;
}

export async function testGateway(feeAccountId: string | null): Promise<ActionResult<GatewayTest>> {
  const scope = feeAccountId && /^[0-9a-f-]{36}$/.test(feeAccountId) ? feeAccountId : 'default';
  return act(() => api<GatewayTest>(`/v1/admin/payments/gateways/${scope}/test`, { method: 'POST' }));
}
