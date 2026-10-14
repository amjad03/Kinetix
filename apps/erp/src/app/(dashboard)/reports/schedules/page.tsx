import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { OVERVIEW_ROLES, ReportsTabs } from '@/components/reports/studio/ReportsTabs';
import { SchedulesTable } from '@/components/reports/studio/SchedulesTable';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ScheduleRow } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.tab.schedules') };
}

/** Report emails on a schedule, with how the last run went and the run history. */
export default async function SchedulesPage() {
  const me = await requireSection('reports');
  const { t, locale } = await getI18n();
  const rows = await load(() => api<ScheduleRow[]>(`/v1/analytics/studio/schedules?lang=${locale}`));
  return (
    <>
      <PageHeader title={t('rs.title')} subtitle={t('rs.sched.subtitle')} />
      <ReportsTabs active="schedules" overview={(me?.roles ?? []).some((r) => OVERVIEW_ROLES.includes(r))} />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <SchedulesTable schedules={rows.data} />}
    </>
  );
}
