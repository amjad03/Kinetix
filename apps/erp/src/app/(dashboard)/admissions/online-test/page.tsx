import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { type BankQuestion, OnlineTestDesk, type OnlineTest } from '@/components/admissions/OnlineTestDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { KitList } from '@/components/admissions/KitList';
import { EmptyState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { loadRecords } from '@/lib/records-server';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { ListChecks } from 'lucide-react';

interface TestRow {
  id: string;
  name: string;
  testDate: string;
  durationMinutes: number;
}
interface Config {
  testId: string;
  questionCount: number;
  negativeMarks: number;
  open: boolean;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.onlineTest') };
}

export default async function OnlineTestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('admissions');
  const sp = await searchParams;
  const { t: tt } = await getI18n();
  const tabs = <LinkTabs value={sp.view === 'questions' ? 'questions' : 'desk'} label={tt('adm.tab.onlineTest')} items={[{ value: 'desk', label: tt('adk.view.tests'), href: '/admissions/online-test' }, { value: 'questions', label: tt('adk.view.questions'), href: '/admissions/online-test?view=questions' }]} />;
  if (sp.view === 'questions') {
    const loaded = await loadRecords('entrance-questions', sp);
    return (
      <>
        <PageHeader title={tt('adm.tab.onlineTest')} subtitle={tt('ag.ot.subtitle')} />
        <AdmissionsTabs current="onlineTest" />
        {tabs}
        {loaded.error !== undefined ? (
          <ErrorState message={loaded.error} />
        ) : (
          <KitList
            meta={loaded.data.meta}
            page={loaded.data.page}
            state={loaded.data.state}
            label={tt('adk.view.questions')}
            extraParams={{ view: 'questions' }}
            columns={[
              { key: 'question', header: tt('adk.col.question'), sortKey: 'question', rowHeader: true, sub: 'topic' },
              { key: 'correct', header: tt('adk.col.correct'), kind: 'number', hideBelow: 'sm' },
              { key: 'marks', header: tt('adk.col.marks'), sortKey: 'marks', kind: 'number', hideBelow: 'sm' },
              { key: 'programName', header: tt('adk.col.programme'), hideBelow: 'md' },
              { key: 'active', header: tt('adk.col.active'), kind: 'bool', hideBelow: 'sm' },
            ]}
            empty={
              <EmptyState icon={<ListChecks />} title={tt('adk.q.none')}>
                {tt('adk.q.noneBody')}
              </EmptyState>
            }
          />
        )}
      </>
    );
  }
  const [tests, configs, questions] = await Promise.all([
    load(() => api<TestRow[]>('/v1/admissions/entrance-tests')),
    load(() => api<Config[]>('/v1/admissions/online-configs')),
    load(() => api<BankQuestion[]>('/v1/admissions/entrance-questions')),
  ]);
  const { t } = await getI18n();
  const error = tests.error ?? configs.error ?? questions.error;
  const rows: OnlineTest[] = (tests.data ?? []).map((x) => ({ id: x.id, name: x.name, testDate: x.testDate, durationMinutes: x.durationMinutes, config: configs.data?.find((c) => c.testId === x.id) ?? null }));
  return (
    <>
      <PageHeader title={t('adm.tab.onlineTest')} subtitle={t('ag.ot.subtitle')} />
      <AdmissionsTabs current="onlineTest" />
      {tabs}
      {error !== undefined ? <ErrorState message={error} /> : <OnlineTestDesk questions={questions.data!} tests={rows} slug={me?.tenant.slug ?? ''} />}
    </>
  );
}
