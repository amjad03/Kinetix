import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { AffiliationAdmin } from '@/components/settings/affiliation/AffiliationAdmin';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { AffiliationOverview, HistoryRow, RulesView } from '@/lib/affiliation';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.affiliation') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Settings > Affiliation (also the setup wizard's Affiliation step): the university or board, the scheme per
 * programme, the rules in plain language, the institution's changes with their history, and the sources.
 */
export default async function AffiliationPage({ searchParams }: { searchParams: Promise<{ programId?: string; tab?: string }> }) {
  await requireSection('settings');
  const { t } = await getI18n();
  const { programId: raw, tab } = await searchParams;
  const programId = raw && UUID.test(raw) ? raw : null;
  const overview = await load(() => api<AffiliationOverview>('/v1/affiliation'));
  const selected = overview.data?.selected;
  const [rules, history] = selected
    ? await Promise.all([load(() => api<RulesView>(`/v1/affiliation/rules${programId ? `?programId=${programId}` : ''}`)), load(() => api<HistoryRow[]>('/v1/affiliation/history'))])
    : [null, null];
  return (
    <>
      <PageHeader title={t('nav.affiliation')} subtitle={t('aff.subtitle')} />
      {overview.error !== undefined ? (
        <ErrorState message={overview.error} />
      ) : rules?.error !== undefined ? (
        <ErrorState message={rules.error} />
      ) : (
        <AffiliationAdmin
          // A new selection or saved change reloads the form with the rules now in force.
          key={`${selected?.profileCode}|${selected?.schemeCode}|${programId}|${JSON.stringify(rules?.data?.differences ?? [])}`}
          overview={overview.data} rules={rules?.data ?? null} history={history?.data ?? []} programId={programId} tab={tab ?? 'rules'} />
      )}
    </>
  );
}
