import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { DiaryDesk } from '@/components/school-life/DiaryDesk';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.diary') };
}

/** The school diary: entries by class and day, who has read each, and writing one. */
export default async function DiaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('diary');
  const { t } = await getI18n();
  const list = await loadRecords('diary-entries', await searchParams);
  return (
    <>
      <PageHeader title={t('nav.diary')} subtitle={t('dy.subtitle')} />
      {list.error !== undefined ? <ErrorState message={list.error} /> : <DiaryDesk list={list.data} />}
    </>
  );
}
