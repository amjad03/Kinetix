import type { Metadata } from 'next';
import { LhtRecordsPage } from '@/components/lht/LhtRecordsPage';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lht.records.library') };
}

/** Every library list (catalogue, copies, members, loans, acquisitions, serials, digital) with the record kit. */
export default async function LibraryRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('library');
  return <LhtRecordsPage module="library" sp={await searchParams} />;
}
