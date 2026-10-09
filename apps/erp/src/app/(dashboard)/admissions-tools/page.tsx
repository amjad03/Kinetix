import type { Metadata } from 'next';
import { DeskPage } from '@/components/g1/DeskPage';
import { getI18n } from '@/i18n/server';
import { ADMISSIONS_TOOLS_DESK } from '@/lib/g1-specs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t(ADMISSIONS_TOOLS_DESK.title) };
}

export default function AdmissionsToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DeskPage spec={ADMISSIONS_TOOLS_DESK} page="/admissions-tools" section="admissionsTools" searchParams={searchParams} />;
}
