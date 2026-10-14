import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { GuardianLinks } from '@/components/students/GuardianLinks';
import { StudentsTabs } from '@/components/students/StudentsTabs';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('si.tab.guardians') };
}

/** Guardians and the students they belong to (record kit: edit, bulk edit, import of families, export, history). */
export default async function GuardiansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('students');
  const { t } = await getI18n();
  const loaded = await loadRecords('guardian-links', await searchParams);
  return (
    <>
      <PageHeader title={t('si.tab.guardians')} subtitle={t('si.guardians.subtitle')} />
      <StudentsTabs current="guardians" />
      {loaded.error !== undefined ? <ErrorState message={loaded.error} /> : <GuardianLinks meta={loaded.data.meta} page={loaded.data.page} state={loaded.data.state} />}
    </>
  );
}
