import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { CustomFieldRecords } from '@/components/students/CustomFieldRecords';
import { StudentsTabs } from '@/components/students/StudentsTabs';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('si.tab.fields') };
}

/** The institution's own student profile fields, with field-level visibility and edit rights. */
export default async function CustomFieldsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('students');
  const { t } = await getI18n();
  const loaded = await loadRecords('student-custom-fields', await searchParams);
  return (
    <>
      <PageHeader title={t('si.tab.fields')} subtitle={t('si.fields.subtitle')} />
      <StudentsTabs current="fields" />
      {loaded.error !== undefined ? <ErrorState message={loaded.error} /> : <CustomFieldRecords meta={loaded.data.meta} page={loaded.data.page} state={loaded.data.state} />}
    </>
  );
}
