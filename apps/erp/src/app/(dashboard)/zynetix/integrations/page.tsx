import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { IntegrationCard } from '@/components/zynetix/IntegrationCard';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ConnectorRow } from '@/lib/govern';
import { integrationViews } from '@/lib/zynetix-integrations';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxIntegrations') };
}

/** Zynetix → Integrations: Google Drive and Classroom, OneDrive and Moodle for the boards. */
export default async function IntegrationsPage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const [rows, setup] = await Promise.all([load(() => api<ConnectorRow[]>('/v1/connectors')), load(() => api<{ redirectUri: string }>('/v1/cloud/setup'))]);
  return (
    <>
      <PageHeader title={t('nav.zxIntegrations')} subtitle={t('zxi.subtitle')} />
      {rows.data ? (
        <div className="flex flex-col gap-4">
          {integrationViews(rows.data).map((v) => (
            <IntegrationCard key={v.type} view={v} redirectUri={setup.data?.redirectUri ?? null} />
          ))}
        </div>
      ) : (
        <ErrorState message={rows.error ?? ''} />
      )}
    </>
  );
}
