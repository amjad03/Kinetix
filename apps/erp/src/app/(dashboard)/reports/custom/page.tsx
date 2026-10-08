import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ReportBuilder } from '@/components/reports/ReportBuilder';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { DatasetMeta, SavedReport } from '@/lib/govern';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rb.title') };
}

/** The custom report builder: saved definitions over the datasets the person's role allows. */
export default async function CustomReportsPage() {
  await requireSection('reports');
  const { t } = await getI18n();
  const [datasets, saved] = await Promise.all([
    load(() => api<{ datasets: DatasetMeta[] }>('/v1/analytics/custom-reports/datasets')),
    load(() => api<SavedReport[]>('/v1/analytics/custom-reports')),
  ]);
  const failed = datasets.error ?? saved.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  return (
    <>
      <PageHeader title={t('rb.title')} subtitle={t('rb.subtitle')} />
      <ReportBuilder datasets={datasets.data!.datasets} reports={saved.data!} />
    </>
  );
}
