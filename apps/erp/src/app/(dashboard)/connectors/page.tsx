import type { Metadata } from 'next';
import { ConnectorDesk } from '@/components/connectors/ConnectorDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ConnectorRow, ConnectorTypeMeta } from '@/lib/govern';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.connectors') };
}

const ADMIN = ['tenant_admin'];

/** The connector registry: what can be connected, this institution's connectors and the delivery log of its webhooks. */
export default async function ConnectorsPage() {
  const me = await requireSection('connectors');
  const { t } = await getI18n();
  const [types, rows] = await Promise.all([load(() => api<ConnectorTypeMeta[]>('/v1/connectors/types')), load(() => api<ConnectorRow[]>('/v1/connectors'))]);
  const failed = types.error ?? rows.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  const canEdit = (me?.roles ?? []).some((r) => ADMIN.includes(r));
  return (
    <>
      <PageHeader title={t('nav.connectors')} subtitle={t('conn.subtitle')} />
      <ConnectorDesk types={types.data!} connectors={rows.data!} canEdit={canEdit} />
    </>
  );
}
