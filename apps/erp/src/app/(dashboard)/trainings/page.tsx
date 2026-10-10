import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TrainingDesk } from '@/components/trainings/TrainingDesk';
import { api, load, requireSection } from '@/lib/api';
import type { TrainingRequestRow } from '@/lib/trainings';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.trainings') };
}

/** Training sessions teachers asked for from the board (Schedule a Training), with their status. */
export default async function TrainingsPage() {
  await requireSection('trainings');
  const { t } = await getI18n();
  const rows = await load(() => api<TrainingRequestRow[]>('/v1/classroom/trainings'));
  return (
    <>
      <PageHeader title={t('nav.trainings')} subtitle={t('trn.subtitle')} />
      {rows.error !== undefined ? <ErrorState message={rows.error} /> : <TrainingDesk rows={rows.data!} />}
    </>
  );
}
