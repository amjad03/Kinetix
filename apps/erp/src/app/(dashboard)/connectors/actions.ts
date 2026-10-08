'use server';

import { getI18n } from '@/i18n/server';
import { read, send } from '@/lib/ops-server';
import { connectorConfig, type ConnectorField, type DeliveryRow } from '@/lib/govern';

const PAGE = '/connectors';
const BASE = '/v1/connectors';
type V = Record<string, string>;

/** Adds a connector of `type`, or changes `existingId`. Settings are `c_<key>` fields of the form; a secret left empty keeps the stored one. */
export async function saveConnector(type: string, fields: ConnectorField[], v: V, existingId?: string) {
  const config = connectorConfig(fields, v);
  if (existingId) return send(`${BASE}/${encodeURIComponent(existingId)}`, { name: v.name, config }, PAGE, 'PATCH');
  const { t } = await getI18n();
  const missing = fields.find((f) => f.required && config[f.key] === undefined);
  if (missing) return { ok: false as const, error: t('ops.err.field', { field: missing.label }) };
  return send(BASE, { type, name: v.name, config, enabled: v.enabled === 'yes' }, PAGE);
}

export async function setConnectorEnabled(id: string, enabled: boolean) {
  return send(`${BASE}/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, undefined, PAGE);
}

export async function deleteConnector(id: string) {
  return send(`${BASE}/${encodeURIComponent(id)}`, undefined, PAGE, 'DELETE');
}

/** Sends the test; the answer says whether the endpoint replied (or that the type is not available in this build). */
export async function testConnector(id: string) {
  return send<{ status: 'ok' | 'failed' | 'not_available'; message: string }>(`${BASE}/${encodeURIComponent(id)}/test`, undefined, PAGE);
}

export async function loadDeliveries(id: string) {
  return read<DeliveryRow[]>(`${BASE}/${encodeURIComponent(id)}/deliveries`);
}

export async function retryDelivery(deliveryId: string) {
  return send(`${BASE}/deliveries/${encodeURIComponent(deliveryId)}/retry`, undefined, PAGE);
}
