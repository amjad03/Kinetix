import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { ReportViewer } from '@/components/reports/studio/ReportViewer';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Catalogue, ReportDoc, StudioResult } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9_.]{3,80}$/;

/** One report, run for the viewer: a saved report (`?id=`) or a library report (`?lib=`). */
export default async function ReportViewPage({ searchParams }: { searchParams: Promise<{ id?: string; lib?: string }> }) {
  await requireSection('reports');
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const saved = !!sp.id && UUID.test(sp.id);
  if (!saved && !(sp.lib && KEY.test(sp.lib))) notFound();
  const base = '/v1/analytics/studio';
  const [doc, catalogue, result] = await Promise.all([
    saved
      ? load(async () => {
          const r = await api<ReportDoc & { name: string }>(`${base}/reports/${sp.id}`);
          return { ...r, title: r.name } as ReportDoc;
        })
      : load(() => api<ReportDoc>(`${base}/library/${sp.lib}?lang=${locale}`)),
    load(() => api<Catalogue>(`${base}/catalogue?lang=${locale}`)),
    load(() => api<StudioResult>(saved ? `${base}/reports/${sp.id}/run` : `${base}/library/${sp.lib}/run`, { method: 'POST', body: { runtime: [], lang: locale }, timeoutMs: 30_000 })),
  ]);
  if (doc.error !== undefined) return <ErrorState message={doc.error} />;
  if (catalogue.error !== undefined) return <ErrorState message={catalogue.error} />;
  const dataset = catalogue.data.datasets.find((d) => d.key === doc.data.dataset);
  if (!dataset) return <ErrorState message={t('rs.v.noAccess')} />;
  return (
    <>
      <PageHeader title={doc.data.title} subtitle={doc.data.description || dataset.description} />
      {result.error !== undefined && <ErrorState message={result.error} />}
      <ReportViewer doc={doc.data} dataset={dataset} relative={catalogue.data.relative} initial={result.data ?? null} />
    </>
  );
}
