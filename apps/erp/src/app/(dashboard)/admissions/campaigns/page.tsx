import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { CampaignsDesk, type CampaignReport } from '@/components/admissions/CampaignsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.campaigns') };
}

export default async function CampaignsPage() {
  await requireSection('admissions');
  const report = await load(() => api<CampaignReport>('/v1/admissions/reports/campaigns'));
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('adm.tab.campaigns')} subtitle={t('camp.subtitle')} />
      <AdmissionsTabs current="campaigns" />
      {report.error !== undefined ? <ErrorState message={report.error} /> : <CampaignsDesk report={report.data!} />}
    </>
  );
}
