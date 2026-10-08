import type { Metadata } from 'next';
import { ScholarshipsDesk } from '@/components/finance/ScholarshipsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Application, Scheme } from '@/lib/finance';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.scholarships') };
}

export default async function ScholarshipsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('finance');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => ({ schemes: await api<Scheme[]>('/v1/finance/scholarship-schemes'), applications: await api<Application[]>('/v1/finance/scholarships') }));
  return (
    <>
      <PageHeader title={t('nav.scholarships')} subtitle={t('fin.sch.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <ScholarshipsDesk schemes={data.data.schemes} applications={data.data.applications} initialTab={tab ?? 'applications'} />}
    </>
  );
}
