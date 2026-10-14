import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { DashboardsList } from '@/components/reports/studio/Dashboards';
import { OVERVIEW_ROLES, ReportsTabs } from '@/components/reports/studio/ReportsTabs';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { DashboardRow } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.tab.dashboards') };
}

/** Dashboards: grids of reports, shared with roles; leaders choose each role's home dashboard. */
export default async function DashboardsPage() {
  const me = await requireSection('reports');
  const { t } = await getI18n();
  const [rows, home] = await Promise.all([load(() => api<DashboardRow[]>('/v1/analytics/studio/dashboards')), load(() => api<{ dashboard: { id: string; name: string } | null }>('/v1/analytics/studio/dashboards/home'))]);
  return (
    <>
      <PageHeader title={t('rs.title')} subtitle={t('rs.dash.subtitle')} />
      <ReportsTabs active="dashboards" overview={(me?.roles ?? []).some((r) => OVERVIEW_ROLES.includes(r))} />
      {home.data?.dashboard && (
        <p className="mb-4 rounded-lg border bg-teal-soft/40 px-4 py-3 text-sm">
          {t('rs.d.yourHome')}{' '}
          <Link href={`/reports/dashboards/${home.data.dashboard.id}`} className="font-semibold text-primary hover:underline">
            {home.data.dashboard.name}
          </Link>
        </p>
      )}
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <DashboardsList rows={rows.data} />}
    </>
  );
}
