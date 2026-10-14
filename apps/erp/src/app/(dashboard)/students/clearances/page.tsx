import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { ClearanceRecords } from '@/components/students/ClearanceRecords';
import { StudentsTabs } from '@/components/students/StudentsTabs';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('si.tab.clearances') };
}

/** No-dues clearances for transfer certificates and course completion (start one from a student or the students list). */
export default async function ClearancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('students');
  const { t } = await getI18n();
  const loaded = await loadRecords('student-clearances', await searchParams);
  return (
    <>
      <PageHeader title={t('si.tab.clearances')} subtitle={t('si.clr.subtitle')} />
      <StudentsTabs current="clearances" />
      {loaded.error !== undefined ? <ErrorState message={loaded.error} /> : <ClearanceRecords meta={loaded.data.meta} page={loaded.data.page} state={loaded.data.state} />}
    </>
  );
}
