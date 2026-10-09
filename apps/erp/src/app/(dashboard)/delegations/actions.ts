'use server';

import { getI18n } from '@/i18n/server';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/delegations';

/** Hands my approvals to a colleague between two dates. */
export async function giveDelegation(v: Record<string, string>) {
  const { t } = await getI18n();
  if (!UUID.test(v.delegateId ?? '')) return { ok: false as const, error: t('ops.err.field', { field: t('dg.f.delegate') }) };
  if (!v.startsOn || !v.endsOn || v.endsOn < v.startsOn) return { ok: false as const, error: t('dg.err.dates') };
  const scope = v.scope === 'workflows' || v.scope === 'leave' ? v.scope : 'all';
  return send('/v1/delegations', { delegateId: v.delegateId, scope, startsOn: v.startsOn, endsOn: v.endsOn, reason: v.reason ?? '' }, PAGE);
}

/** Ends a delegation now. */
export async function revokeDelegation(id: string) {
  if (!UUID.test(id)) return { ok: false as const, error: (await getI18n()).t('ops.err.field', { field: 'id' }) };
  return send(`/v1/delegations/${encodeURIComponent(id)}/revoke`, undefined, PAGE);
}
