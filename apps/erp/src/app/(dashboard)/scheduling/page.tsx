import type { Metadata } from 'next';
import { DeskPage } from '@/components/g1/DeskPage';
import { getI18n } from '@/i18n/server';
import { SCHEDULING_DESK } from '@/lib/g1-specs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t(SCHEDULING_DESK.title) };
}

export default function SchedulingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DeskPage spec={SCHEDULING_DESK} page="/scheduling" section="scheduling" searchParams={searchParams} />;
}
