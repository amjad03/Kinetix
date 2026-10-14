import type { Metadata } from 'next';
import { MyInterviews } from '@/components/hr/MyInterviews';
import { ErrorState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { MyInterview } from '@/lib/hr-depth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hk.myInterviews.title') };
}

/** The interviews the signed-in person sits on as a panel member, with their score sheet. */
export default async function MyInterviewsPage() {
  await requireSection('appraisal');
  const { t } = await getI18n();
  const data = await load(() => api<MyInterview[]>('/v1/hr/interviews/mine'));
  return (
    <>
      <PageHeader title={t('hk.myInterviews.title')} subtitle={t('hk.myInterviews.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <MyInterviews rows={data.data} />}
    </>
  );
}
