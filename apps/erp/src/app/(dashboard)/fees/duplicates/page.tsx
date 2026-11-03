import type { Metadata } from 'next';
import { DuplicateFlags, type FlagRow } from '@/components/fee-flagship/DuplicateFlags';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ff.dup.title') };
}

/** Payments flagged as possible duplicates, open ones first. */
export default async function DuplicatesPage() {
  await requireSection('fees');
  const { t } = await getI18n();
  const data = await load(() => api<FlagRow[]>('/v1/fees/flags'));
  return (
    <>
      <PageHeader title={t('ff.dup.title')} subtitle={t('ff.dup.subtitle')} />
      <FeesNav value="duplicates" />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <DuplicateFlags rows={[...data.data].sort((a, b) => Number(b.flag.status === 'open') - Number(a.flag.status === 'open'))} />}
    </>
  );
}
