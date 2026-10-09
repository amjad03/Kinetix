import type { Metadata } from 'next';
import { DeskPage } from '@/components/g1/DeskPage';
import { getI18n } from '@/i18n/server';
import { SETUP_DESK } from '@/lib/g1-specs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t(SETUP_DESK.title) };
}

export default function InstitutionSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DeskPage spec={SETUP_DESK} page="/institution-setup" section="institutionSetup" searchParams={searchParams} />;
}
