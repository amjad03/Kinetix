import type { Metadata } from 'next';
import { MyScripts, ScriptMarking } from '@/components/evaluation/ExaminerDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { AnnotationSet } from '@/lib/annotations';
import type { AllocationDetail, MyAllocation } from '@/lib/evaluation-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.evaluationDesk') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The examiner's desk: the scripts allocated to the signed-in examiner, then one script to value. */
export default async function ExaminerDeskPage({ searchParams }: { searchParams: Promise<{ allocation?: string }> }) {
  await requireSection('evaluationDesk');
  const { allocation } = await searchParams;
  const { t } = await getI18n();
  const header = <PageHeader title={t('nav.evaluationDesk')} subtitle={t('ev.desk.subtitle')} />;

  if (allocation && UUID.test(allocation)) {
    const [detail, marks] = await Promise.all([load(() => api<AllocationDetail>(`/v1/evaluation/allocations/${allocation}`)), load(() => api<AnnotationSet>(`/v1/evaluation/allocations/${allocation}/annotations`))]);
    return (
      <>
        {header}
        {detail.error !== undefined ? <ErrorState message={detail.error} /> : <ScriptMarking detail={detail.data!} annotations={marks.data ?? { mine: [], earlier: [] }} />}
      </>
    );
  }
  const mine = await load(() => api<MyAllocation[]>('/v1/evaluation/allocations/mine'));
  return (
    <>
      {header}
      {mine.error !== undefined ? <ErrorState message={mine.error} /> : <MyScripts rows={mine.data ?? []} />}
    </>
  );
}
