import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { MyReports } from '@/components/reports/studio/MyReports';
import { OVERVIEW_ROLES, ReportsTabs } from '@/components/reports/studio/ReportsTabs';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { SavedReportRow } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.tab.mine') };
}

/** Saved reports: the person's own, and those shared with their role (leaders see everyone's). */
export default async function MyReportsPage() {
  const me = await requireSection('reports');
  const { t, locale } = await getI18n();
  const [reports, folders] = await Promise.all([load(() => api<SavedReportRow[]>(`/v1/analytics/studio/reports?lang=${locale}`)), load(() => api<{ name: string; count: number }[]>('/v1/analytics/studio/folders'))]);
  const failed = reports.error ?? folders.error;
  return (
    <>
      <PageHeader title={t('rs.title')} subtitle={t('rs.mine.subtitle')} />
      <ReportsTabs active="mine" overview={(me?.roles ?? []).some((r) => OVERVIEW_ROLES.includes(r))} />
      {failed !== undefined ? <ErrorState message={failed} /> : <MyReports reports={reports.data!} folders={folders.data!} />}
    </>
  );
}
