import type { Metadata } from 'next';
import { RetentionDesk } from '@/components/governance/RetentionDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { DueFile, RetentionPolicy } from '@/lib/governance';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.govRetention') };
}

/** File retention per category: the policy, the files that are past it, and the archive run. */
export default async function RetentionPage() {
  await requireSection('governance');
  const { t } = await getI18n();
  const [policies, due] = await Promise.all([load(() => api<RetentionPolicy[]>('/v1/governance/retention')), load(() => api<DueFile[]>('/v1/governance/retention/due'))]);
  const failed = policies.error ?? due.error;
  return (
    <>
      <PageHeader title={t('nav.govRetention')} subtitle={t('ret.subtitle')} />
      {failed !== undefined ? <ErrorState message={failed} /> : <RetentionDesk policies={policies.data!} due={due.data!} />}
    </>
  );
}
