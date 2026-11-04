import type { Metadata } from 'next';
import { MyGovernance } from '@/components/governance/MyGovernance';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { MyPolicy, MySummary } from '@/lib/governance-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.mine') };
}

/** For any member of staff: policies to read and acknowledge, minutes waiting for their signature, and their committee actions. */
export default async function MyGovernancePage() {
  await requireSection('myGovernance');
  const { t } = await getI18n();
  const res = await load(async () => ({ policies: await api<MyPolicy[]>('/v1/governance/policies/me/list'), summary: await api<MySummary>('/v1/governance/committees/me/summary') }));
  return (
    <>
      <PageHeader title={t('gp.title.mine')} subtitle={t('gp.sub.mine')} />
      {res.error !== undefined ? <ErrorState message={res.error} /> : <MyGovernance policies={res.data.policies} summary={res.data.summary} />}
    </>
  );
}
