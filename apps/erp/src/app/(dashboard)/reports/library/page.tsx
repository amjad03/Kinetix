import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LibraryBrowser } from '@/components/reports/studio/LibraryBrowser';
import { OVERVIEW_ROLES, ReportsTabs } from '@/components/reports/studio/ReportsTabs';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { LibraryItem } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.tab.library') };
}

/** The report library: ready-made reports for the person's work, each one editable in the builder. */
export default async function ReportLibraryPage() {
  const me = await requireSection('reports');
  const { t, locale } = await getI18n();
  const lib = await load(() => api<{ categories: string[]; reports: LibraryItem[] }>(`/v1/analytics/studio/library?lang=${locale}`));
  return (
    <>
      <PageHeader title={t('rs.title')} subtitle={t('rs.library.subtitle')} />
      <ReportsTabs active="library" overview={(me?.roles ?? []).some((r) => OVERVIEW_ROLES.includes(r))} />
      {lib.error !== undefined ? <ErrorState message={lib.error} /> : <LibraryBrowser reports={lib.data.reports} categories={lib.data.categories} />}
    </>
  );
}
