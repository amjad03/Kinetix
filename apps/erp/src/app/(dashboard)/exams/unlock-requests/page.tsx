import type { Metadata } from 'next';
import { ExamsTabs } from '@/components/exams/ExamsTabs';
import { UnlockRequestRecords } from '@/components/exams/flagship/FlagshipRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xf.un.title') };
}

/** Requests from teachers to unlock submitted or locked marks; heads of department and the controller decide. */
export default async function UnlockRequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireSection('exams');
  const sp = await searchParams;
  const { t } = await getI18n();
  const r = await loadRecords('marks-unlock-requests', sp);
  return (
    <>
      <PageHeader title={t('xf.un.title')} subtitle={t('xf.un.subtitle')} />
      <ExamsTabs current="unlock" roles={me?.roles ?? []} />
      {r.error !== undefined ? <ErrorState message={r.error} /> : <UnlockRequestRecords meta={r.data.meta} page={r.data.page} state={r.data.state} />}
    </>
  );
}
