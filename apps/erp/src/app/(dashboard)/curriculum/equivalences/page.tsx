import type { Metadata } from 'next';
import { CurriculumTabs } from '@/components/curriculum/CurriculumTabs';
import { EquivalencesDesk } from '@/components/curriculum/EquivalencesDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('rk.entity.curriculum-equivalences') };
}

/** Equivalences between curriculum versions, used when a student rejoins or moves to the version in force. */
export default async function EquivalencesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('curriculum');
  const { t } = await getI18n();
  const list = await loadRecords('curriculum-equivalences', await searchParams);
  return (
    <>
      <PageHeader title={t('nav.curriculum')} subtitle={t('ra.eqSubtitle')} />
      <CurriculumTabs current="equivalences" />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <EquivalencesDesk list={list.data} />}
    </>
  );
}
