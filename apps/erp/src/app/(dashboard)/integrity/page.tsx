import type { Metadata } from 'next';
import { IntegrityDesk } from '@/components/integrity/IntegrityDesk';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { IntegrityReport } from '@/lib/governance';
import type { HomeworkRow } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.integrity') };
}

/** Academic integrity: pick a homework, compare the typed answers, and review what is flagged. */
export default async function IntegrityPage({ searchParams }: { searchParams: Promise<{ homeworkId?: string }> }) {
  await requireSection('integrity');
  const q = await searchParams;
  const { t } = await getI18n();
  const list = await load(() => api<HomeworkRow[]>('/v1/admin/homework?days=30'));
  const head = <PageHeader title={t('nav.integrity')} subtitle={t('ig.subtitle')} />;
  if (list.error !== undefined) {
    return (
      <>
        {head}
        <ErrorState message={list.error} />
      </>
    );
  }
  const rows = list.data!;
  if (rows.length === 0) {
    return (
      <>
        {head}
        <EmptyState icon={<span>·</span>} title={t('ig.noHomework')} />
      </>
    );
  }
  const id = rows.find((r) => r.id === q.homeworkId)?.id ?? rows[0].id;
  const report = await load(() => api<IntegrityReport>(`/v1/integrity/homework/${id}`));
  return (
    <>
      {head}
      <UrlSelect label={t('ig.homework')} param="homeworkId" value={id} options={rows.map((r) => ({ value: r.id, label: `${r.section} · ${r.subject} · ${r.title}` }))} />
      {report.error !== undefined ? <ErrorState message={report.error} /> : <IntegrityDesk key={id} homeworkId={id} report={report.data!} />}
    </>
  );
}
