import type { Metadata } from 'next';
import { LhtRecordsPage } from '@/components/lht/LhtRecordsPage';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lht.records.hostel') };
}

/** Every hostel and mess list (buildings, residents, gate, welfare, staff, mess) with the record kit. */
export default async function HostelRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('hostel');
  return <LhtRecordsPage module="hostel" sp={await searchParams} />;
}
