import type { Metadata } from 'next';
import { TermRecords, YearRecords } from '@/components/access/YearRecords';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ga.years.title') };
}

/** Settings > Academic years and terms: the years (current year, rollover) and their terms or semesters. */
export default async function AcademicYearsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('settings');
  const sp = await searchParams;
  const { t } = await getI18n();
  const view = sp.view === 'terms' ? 'terms' : 'years';
  const records = await loadRecords(view === 'terms' ? 'terms' : 'academic-years', sp);
  return (
    <>
      <PageHeader title={t('ga.years.title')} subtitle={t('ga.years.sub')} />
      <LinkTabs
        value={view}
        label={t('ga.years.title')}
        items={[
          { value: 'years', label: t('ga.years.tab.years'), href: '/settings/academic-years' },
          { value: 'terms', label: t('ga.years.tab.terms'), href: '/settings/academic-years?view=terms' },
        ]}
      />
      {records.error !== undefined ? (
        <ErrorState message={records.error} />
      ) : view === 'terms' ? (
        <TermRecords meta={records.data.meta} page={records.data.page} state={records.data.state} />
      ) : (
        <YearRecords meta={records.data.meta} page={records.data.page} state={records.data.state} />
      )}
    </>
  );
}
