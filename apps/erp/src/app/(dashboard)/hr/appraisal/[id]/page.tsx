import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppraisalRecord } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { historyFor } from '@/lib/hr-records';
import type { Appraisal, AppraisalCategory, AppraisalCycle } from '@/lib/hr-lifecycle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.appraisal') };
}

/** One appraisal form: self scores, HoD review, the principal's final score. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('appraisal');
  const { id } = await params;
  if (![id].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<Appraisal>(`/v1/hr/appraisals/${id}`), api<{ categories: AppraisalCategory[] }>('/v1/hr/appraisal-categories'), api<AppraisalCycle[]>('/v1/hr/appraisal-cycles'), historyFor('appraisal', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hl.tab.appraisal')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const [a, cats, cycles, activity] = data.data;
  if (!me) notFound();
  return <AppraisalRecord a={a} cats={cats.categories} period={cycles.find((c) => c.id === a.cycleId)?.period ?? ''} activity={activity} />;
}
