import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { DashboardView } from '@/components/reports/studio/Dashboards';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Catalogue, DashboardDoc, LibraryItem, SavedReportRow, WidgetData } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.tab.dashboards') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One dashboard, every widget run for the viewer; `?edit=1` opens the layout editor. */
export default async function DashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireSection('reports');
  const { t, locale } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const base = '/v1/analytics/studio';
  const [doc, data, library, saved, catalogue] = await Promise.all([
    load(() => api<DashboardDoc>(`${base}/dashboards/${id}`)),
    load(() => api<{ widgets: WidgetData[] }>(`${base}/dashboards/${id}/data`, { method: 'POST', body: { lang: locale }, timeoutMs: 60_000 })),
    load(() => api<{ reports: LibraryItem[] }>(`${base}/library?lang=${locale}`)),
    load(() => api<SavedReportRow[]>(`${base}/reports?lang=${locale}`)),
    load(() => api<Catalogue>(`${base}/catalogue?lang=${locale}`)),
  ]);
  if (doc.error !== undefined) return <ErrorState message={doc.error} />;
  if (library.error !== undefined) return <ErrorState message={library.error} />;
  if (saved.error !== undefined) return <ErrorState message={saved.error} />;
  if (catalogue.error !== undefined) return <ErrorState message={catalogue.error} />;
  return (
    <>
      <PageHeader
        title={doc.data.name}
        subtitle={doc.data.description || t('rs.dash.subtitle')}
        actions={
          <LinkButton href="/reports/dashboards" variant="outlined">
            {t('rs.tab.dashboards')}
          </LinkButton>
        }
      />
      {data.error !== undefined && <ErrorState message={data.error} />}
      <DashboardView key={doc.data.id} doc={doc.data} initial={data.data?.widgets ?? []} library={library.data.reports} saved={saved.data} relative={catalogue.data.relative} startEditing={sp.edit === '1'} />
    </>
  );
}
