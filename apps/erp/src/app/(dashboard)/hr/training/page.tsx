import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { TrainingDesk } from '@/components/hr/TrainingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { canSee } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { StaffSummary } from '@/lib/hr-types';
import type { TrainingRecord, TrainingSummary } from '@/lib/hr-lifecycle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.training') };
}

export default async function TrainingPage() {
  const me = await requireSection('appraisal');
  const { t } = await getI18n();
  const isHr = canSee(me?.roles ?? [], 'hr');
  const data = await load(async () => {
    const records = await api<TrainingRecord[]>('/v1/hr/training-records');
    const [summary, staff] = isHr ? await Promise.all([api<TrainingSummary[]>('/v1/hr/training-summary'), api<StaffSummary[]>('/v1/hr/staff')]) : [[] as TrainingSummary[], [] as StaffSummary[]];
    return { records, summary, staff: staff.map((s) => ({ userId: s.userId, fullName: s.fullName })) };
  });
  return (
    <>
      <PageHeader title={t('hl.tab.training')} subtitle={t('hl.train.subtitle')} />
      {isHr && <SectionTabs tabs={HR_TABS} label="nav.hr" />}
      {data.error !== undefined ? <ErrorState message={data.error} /> : <TrainingDesk records={data.data.records} summary={data.data.summary} staff={data.data.staff} isHr={isHr} meId={me?.id ?? ''} />}
    </>
  );
}
