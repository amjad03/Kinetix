import type { Metadata } from 'next';
import { HR_TABS, SectionTabs } from '@/components/hr/Common';
import { HrList } from '@/components/hr/HrList';
import { TrainingDesk } from '@/components/hr/TrainingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { canSee } from '@/lib/access';
import { getI18n } from '@/i18n/server';
import type { TrainingSummary } from '@/lib/hr-lifecycle';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hl.tab.training') };
}

/** Training, FDP and CPD records (verified by HR, with certificates) and the hours per person. */
export default async function TrainingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('appraisal');
  const { t } = await getI18n();
  const sp = await searchParams;
  const isHr = canSee(me?.roles ?? [], 'hr');
  const view = isHr && sp.view === 'hours' ? 'hours' : 'records';
  const head = (
    <>
      <PageHeader title={t('hl.tab.training')} subtitle={t('hl.train.subtitle')} />
      {isHr && <SectionTabs tabs={HR_TABS} label="nav.hr" />}
      {isHr && (
        <LinkTabs
          value={view}
          label={t('hl.tab.training')}
          items={[
            { value: 'records', href: '/hr/training', label: t('hk.train.view.records') },
            { value: 'hours', href: '/hr/training?view=hours', label: t('hk.train.view.hours') },
          ]}
        />
      )}
    </>
  );
  if (view === 'hours') {
    const summary = await load(() => api<TrainingSummary[]>('/v1/hr/training-summary'));
    return (
      <>
        {head}
        {summary.error !== undefined ? <ErrorState message={summary.error} /> : <TrainingDesk records={[]} summary={summary.data} staff={[]} isHr meId={me?.id ?? ''} summaryOnly />}
      </>
    );
  }
  const list = await loadRecords('training-records', sp);
  return (
    <>
      {head}
      {list.error !== undefined ? <ErrorState message={list.error} /> : <HrList entity="training-records" data={list.data} />}
    </>
  );
}
