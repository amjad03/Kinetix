import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DeskRecord } from '@/components/fee-desk/DeskRecord';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { isEntity } from '@/lib/fee-desk';
import { recordView } from '@/lib/fee-desk-records';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const { entity } = await params;
  return { title: (await getI18n()).t(`fd.one.${entity}` as MessageKey) };
}

/** One record of the fees and accounts desk: header, facts, tabs, audit history and its approval route. */
export default async function DeskRecordPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const me = await requireSection('finance');
  const { entity, id } = await params;
  if (!isEntity(entity) || !UUID.test(id)) notFound();
  const { t } = await getI18n();
  const res = await load(() => api<Parameters<typeof recordView>[2]>(`/v1/fee-accounts/records/${entity}/${id}`));
  if (res.error !== undefined || !me) return <ErrorState title={t(`fd.one.${entity}` as MessageKey)} message={res.error ?? ''} />;
  const view = recordView(entity, id, res.data, { id: me.id, roles: me.roles });
  return <DeskRecord {...view} history={res.data.history} />;
}
