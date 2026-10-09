import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { type BankQuestion, OnlineTestDesk, type OnlineTest } from '@/components/admissions/OnlineTestDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';

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

export default async function OnlineTestPage() {
  const me = await requireSection('admissions');
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
      {error !== undefined ? <ErrorState message={error} /> : <OnlineTestDesk questions={questions.data!} tests={rows} slug={me?.tenant.slug ?? ''} />}
    </>
  );
}
