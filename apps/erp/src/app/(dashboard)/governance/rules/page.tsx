import type { Metadata } from 'next';
import { RulesDesk } from '@/components/governance/RulesDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { BusinessRule } from '@/lib/governance';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.govRules') };
}

/** The business rule registry: versions, four-eyes approval and effective dates. */
export default async function RulesPage() {
  const me = await requireSection('governance');
  const { t } = await getI18n();
  const rules = await load(() => api<BusinessRule[]>('/v1/governance/rules'));
  return (
    <>
      <PageHeader title={t('nav.govRules')} subtitle={t('gr.subtitle')} />
      {rules.error !== undefined ? <ErrorState message={rules.error} /> : <RulesDesk rules={rules.data!} today={new Date().toISOString().slice(0, 10)} me={me?.id ?? ''} />}
    </>
  );
}
