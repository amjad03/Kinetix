import type { Metadata } from 'next';
import { GapsList } from '@/components/obe/ObeKitLists';
import { ObeTabs } from '@/components/obe/ObeDepth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('of.tab.gaps') };
}

/** Curricular gaps found against the POs and how they were closed, and content delivered beyond the syllabus. */
export default async function ObeGapsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('obe');
  const { t } = await getI18n();
  const records = await loadRecords('obe-gaps', await searchParams);
  return (
    <>
      <PageHeader title={t('of.tab.gaps')} subtitle={t('of.gaps.sub')} />
      <ObeTabs value="gaps" />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <GapsList meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
