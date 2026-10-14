import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Builder } from '@/components/reports/studio/Builder';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Catalogue, ReportDoc } from '@/lib/report-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rs.builder.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9_.]{3,80}$/;

/** The report builder: a new report (`?dataset=`), a saved one (`?id=`) or a library report to customise (`?lib=`). */
export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ id?: string; lib?: string; dataset?: string }> }) {
  await requireSection('reports');
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const [catalogue, folders, doc] = await Promise.all([
    load(() => api<Catalogue>(`/v1/analytics/studio/catalogue?lang=${locale}`)),
    load(() => api<{ name: string; count: number }[]>('/v1/analytics/studio/folders')),
    sp.id && UUID.test(sp.id)
      ? load(async () => {
          const r = await api<ReportDoc & { name: string }>(`/v1/analytics/studio/reports/${sp.id}`);
          return { ...r, title: r.name } as ReportDoc;
        })
      : sp.lib && KEY.test(sp.lib)
        ? load(() => api<ReportDoc>(`/v1/analytics/studio/library/${sp.lib}?lang=${locale}`))
        : null,
  ]);
  const failed = catalogue.error ?? folders.error ?? doc?.error;
  const d = doc?.data;
  const title = d ? (d.ref.startsWith('lib:') ? t('rs.builder.customise', { title: d.title }) : d.title) : t('rs.builder.title');
  const saved = d?.ref.startsWith('custom:');
  return (
    <>
      <PageHeader
        title={title}
        subtitle={t('rs.builder.subtitle')}
        actions={
          <LinkButton href={saved ? `/reports/view?id=${d!.ref.slice(7)}` : '/reports/custom'} variant="outlined">
            {saved ? t('rs.b.view') : t('rs.tab.mine')}
          </LinkButton>
        }
      />
      {failed !== undefined ? <ErrorState message={failed} /> : <Builder key={d?.ref ?? sp.dataset ?? 'new'} catalogue={catalogue.data!} doc={d ?? null} folders={folders.data!.map((f) => f.name)} startDataset={sp.dataset} />}
    </>
  );
}
