import type { Metadata } from 'next';
import { LhtRecordsPage } from '@/components/lht/LhtRecordsPage';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lht.records.transport') };
}

/** Every transport list (fleet, routes and stops, riders, operations) with the record kit. */
export default async function TransportRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('transport');
  return <LhtRecordsPage module="transport" sp={await searchParams} />;
}
