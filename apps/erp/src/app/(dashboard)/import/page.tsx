import type { Metadata } from 'next';
import { ImportWizard } from '@/components/import/ImportWizard';
import { PageHeader } from '@/components/PageHeader';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.import') };
}

/** Bulk import for the principal and admin office: programs, staff, students, then the timetable. */
export default async function ImportPage() {
  await requireSection('import');
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('nav.import')} subtitle={t('import.subtitle')} />
      <ImportWizard />
    </>
  );
}
