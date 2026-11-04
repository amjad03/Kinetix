import type { Metadata } from 'next';
import { CommitteesDesk } from '@/components/governance/CommitteesDesk';
import { GovTabs } from '@/components/governance/GovTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Compliance } from '@/lib/governance-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.committees') };
}

/** Statutory committees against their regulation: composition, the year's meetings, minutes and overdue actions. */
export default async function CommitteesPage() {
  await requireSection('governance');
  const { t } = await getI18n();
  const res = await load(() => api<Compliance>('/v1/governance/committees/compliance'));
  return (
    <>
      <PageHeader title={t('gp.title.committees')} subtitle={t('gp.sub.committees')} />
      <GovTabs value="committees" />
      {res.error !== undefined ? <ErrorState message={res.error} /> : <CommitteesDesk data={res.data} />}
    </>
  );
}
