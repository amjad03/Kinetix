import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { ChangeRequests } from '@/components/students/ChangeRequests';
import { StudentsTabs } from '@/components/students/StudentsTabs';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('si.tab.requests') };
}

/** Profile change requests from students, parents and staff (record kit: approve or reject in bulk, export, history). */
export default async function ChangeRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('students');
  const { t } = await getI18n();
  const loaded = await loadRecords('student-change-requests', await searchParams);
  return (
    <>
      <PageHeader title={t('si.tab.requests')} subtitle={t('si.requests.subtitle')} />
      <StudentsTabs current="requests" />
      {loaded.error !== undefined ? <ErrorState message={loaded.error} /> : <ChangeRequests meta={loaded.data.meta} page={loaded.data.page} state={loaded.data.state} />}
    </>
  );
}
