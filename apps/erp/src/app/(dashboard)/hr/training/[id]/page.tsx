import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TrainingRecordView } from '@/components/hr/Records';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { historyFor } from '@/lib/hr-records';
import type { TrainingRecord } from '@/lib/hr-lifecycle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.training') };
}

/** One training or FDP record with its certificate. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('hr');
  const { id } = await params;
  if (![id].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<TrainingRecord[]>('/v1/hr/training-records'), historyFor('training_record', id)]));
  if (data.error !== undefined) {
    return (
      <>
        <PageHeader title={t('hl.tab.training')} />
        <ErrorState message={data.error} />
      </>
    );
  }
  const r = data.data[0].find((x) => x.id === id);
  if (!r || !me) notFound();
  return <TrainingRecordView r={r} activity={data.data[1]} />;
}
