import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { type ApplicantOption, type Interview, InterviewsDesk } from '@/components/admissions/InterviewsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { ApplicationRow } from '@/lib/admissions';
import { KitList } from '@/components/admissions/KitList';
import { EmptyState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { loadRecords } from '@/lib/records-server';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { CalendarClock } from 'lucide-react';

const CLOSED = ['rejected', 'withdrawn', 'declined', 'enrolled'];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.interviews') };
}

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const { t: tt } = await getI18n();
  const tabs = <LinkTabs value={sp.view === 'list' ? 'list' : 'desk'} label={tt('adm.tab.interviews')} items={[{ value: 'desk', label: tt('adk.view.schedule'), href: '/admissions/interviews' }, { value: 'list', label: tt('adk.view.list'), href: '/admissions/interviews?view=list' }]} />;
  if (sp.view === 'list') {
    const loaded = await loadRecords('admission-interviews', sp);
    const status = Object.fromEntries(['scheduled', 'done', 'cancelled', 'no_show'].map((s) => [s, tt(`adk.int.status.${s}` as MessageKey)]));
    return (
      <>
        <PageHeader title={tt('adm.tab.interviews')} subtitle={tt('ag.int.subtitle')} />
        <AdmissionsTabs current="interviews" />
        {tabs}
        {loaded.error !== undefined ? (
          <ErrorState message={loaded.error} />
        ) : (
          <KitList
            meta={loaded.data.meta}
            page={loaded.data.page}
            state={loaded.data.state}
            label={tt('adm.tab.interviews')}
            extraParams={{ view: 'list' }}
            rowHref="/admissions/applications/{applicationId}"
            columns={[
              { key: 'slotAt', header: tt('adk.col.when'), sortKey: 'slot', kind: 'datetime' },
              { key: 'applicantName', header: tt('adm.col.applicant'), sortKey: 'applicant', rowHeader: true, sub: 'applicationNo' },
              { key: 'venue', header: tt('adk.col.venue'), hideBelow: 'md' },
              { key: 'panelNames', header: tt('adk.col.panel'), hideBelow: 'lg' },
              { key: 'status', header: tt('adm.col.status'), sortKey: 'status', kind: 'pill', labels: status, tones: { scheduled: 'info', done: 'success', cancelled: 'neutral', no_show: 'warning' } },
              { key: 'outcome', header: tt('adk.col.outcome'), hideBelow: 'sm', labels: Object.fromEntries(['selected', 'waitlisted', 'rejected'].map((s) => [s, tt(`adk.int.outcome.${s}` as MessageKey)])) },
              { key: 'score', header: tt('adk.col.score'), sortKey: 'score', kind: 'number', hideBelow: 'sm' },
            ]}
            empty={
              <EmptyState icon={<CalendarClock />} title={tt('adk.int.none')}>
                {tt('adk.int.noneBody')}
              </EmptyState>
            }
          />
        )}
      </>
    );
  }
  const [interviews, apps] = await Promise.all([load(() => api<Interview[]>('/v1/admissions/interviews')), load(() => api<ApplicationRow[]>('/v1/admissions/applications'))]);
  const { t } = await getI18n();
  const error = interviews.error ?? apps.error;
  const applicants: ApplicantOption[] = (apps.data ?? []).filter((a) => !CLOSED.includes(a.status)).map((a) => ({ id: a.id, applicationNo: a.applicationNo, applicantName: a.applicantName, cycleName: a.cycleName }));
  return (
    <>
      <PageHeader title={t('adm.tab.interviews')} subtitle={t('ag.int.subtitle')} />
      <AdmissionsTabs current="interviews" />
      {tabs}
      {error !== undefined ? <ErrorState message={error} /> : <InterviewsDesk interviews={interviews.data!} applicants={applicants} />}
    </>
  );
}
