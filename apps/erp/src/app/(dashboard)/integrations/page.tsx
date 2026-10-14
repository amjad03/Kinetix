import type { Metadata } from 'next';
import { INTEGRATION_VIEWS, IntegrationsDesk, type IntegrationView } from '@/components/integrations/IntegrationsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.integrations') };
}

/** DigiLocker documents and the NAD file, attendance and card devices, LTI tools and SCORM packages, and feed tokens (?view=). */
export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('integrations');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view: IntegrationView = INTEGRATION_VIEWS.find((v) => v === sp.view) ?? 'digilocker-documents';
  const list = await loadRecords(view, sp);
  return (
    <>
      <PageHeader title={t('nav.integrations')} subtitle={t('itg.subtitle')} />
      <LinkTabs value={view} label={t('nav.integrations')} items={INTEGRATION_VIEWS.map((v) => ({ value: v, label: t(`rk.entity.${v}` as MessageKey), href: `/integrations?view=${v}` }))} />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <IntegrationsDesk key={view} view={view} list={list.data} />}
    </>
  );
}
