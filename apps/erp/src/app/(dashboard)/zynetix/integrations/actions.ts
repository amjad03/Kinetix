'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ConnectorRow } from '@/lib/govern';
import type { ActionResult } from '@/lib/types';
import { CLOUD_INTEGRATIONS, integrationConfig, type CloudIntegration } from '@/lib/zynetix-integrations';

const PAGE = '/zynetix/integrations';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function bad<T>(): Promise<ActionResult<T>> {
  return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
}

/** Creates the integration (switched on) or updates it; an empty secret keeps the saved one. */
export async function saveIntegration(type: CloudIntegration, values: Record<string, string>, existingId?: string): Promise<ActionResult<ConnectorRow>> {
  if (!CLOUD_INTEGRATIONS.includes(type) || (existingId && !UUID.test(existingId))) return bad();
  const config = integrationConfig(type, values);
  const { t } = await getI18n();
  const res = await act(async () => {
    if (!existingId) return api<ConnectorRow>('/v1/connectors', { method: 'POST', body: { type, name: t(`zxi.type.${type}`), config, enabled: true } });
    await api<ConnectorRow>(`/v1/connectors/${existingId}`, { method: 'PATCH', body: { config } });
    return api<ConnectorRow>(`/v1/connectors/${existingId}/enable`, { method: 'POST' });
  });
  revalidatePath(PAGE);
  return res;
}

export async function setIntegrationEnabled(id: string, enabled: boolean): Promise<ActionResult<ConnectorRow>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<ConnectorRow>(`/v1/connectors/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' }));
  revalidatePath(PAGE);
  return res;
}

export async function testIntegration(id: string): Promise<ActionResult<{ status: 'ok' | 'failed' | 'not_available'; message: string }>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api<{ status: 'ok' | 'failed' | 'not_available'; message: string }>(`/v1/connectors/${id}/test`, { method: 'POST' }));
  revalidatePath(PAGE);
  return res;
}

export async function removeIntegration(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return bad();
  const res = await act(async () => {
    await api<unknown>(`/v1/connectors/${id}`, { method: 'DELETE' });
    return null;
  });
  revalidatePath(PAGE);
  return res;
}
