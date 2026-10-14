import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { type Agent, type Commission, PartnersDesk } from '@/components/admissions/PartnersDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { schoolToday } from '@/lib/school';
import { KitList } from '@/components/admissions/KitList';
import { EmptyState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { loadRecords } from '@/lib/records-server';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { Handshake } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.partners') };
}

/** Agents and partners: commissions and payouts (default) and the agents as a record kit list. */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const { t: tt } = await getI18n();
  const tabs = <LinkTabs value={sp.view === 'list' ? 'list' : 'desk'} label={tt('adm.tab.partners')} items={[{ value: 'desk', label: tt('adk.view.commissions'), href: '/admissions/partners' }, { value: 'list', label: tt('adk.view.list'), href: '/admissions/partners?view=list' }]} />;
  if (sp.view === 'list') {
    const loaded = await loadRecords('admission-agents', sp);
    return (
      <>
        <PageHeader title={tt('adm.tab.partners')} subtitle={tt('ag.partners.subtitle')} />
        <AdmissionsTabs current="partners" />
        {tabs}
        {loaded.error !== undefined ? (
          <ErrorState message={loaded.error} />
        ) : (
          <KitList
            meta={loaded.data.meta}
            page={loaded.data.page}
            state={loaded.data.state}
            label={tt('adm.tab.partners')}
            extraParams={{ view: 'list' }}
            columns={[
              { key: 'name', header: tt('adk.rep.agent'), sortKey: 'name', rowHeader: true, sub: 'phone' },
              { key: 'kind', header: tt('adk.col.kind'), labels: { agent: tt('adk.agent.agent'), partner: tt('adk.agent.partner') } },
              { key: 'referralCode', header: tt('adk.rep.code') },
              { key: 'commissionRupees', header: tt('adk.col.commission'), kind: 'rupees', hideBelow: 'md' },
              { key: 'referrals', header: tt('adk.rep.referrals'), sortKey: 'referrals', kind: 'number', hideBelow: 'sm' },
              { key: 'enrolled', header: tt('adk.funnel.enrolled'), sortKey: 'enrolled', kind: 'number', hideBelow: 'sm' },
              { key: 'dueRupees', header: tt('adk.rep.due'), sortKey: 'due', kind: 'rupees', hideBelow: 'md' },
              { key: 'active', header: tt('adk.col.active'), kind: 'bool', hideBelow: 'sm' },
            ]}
            empty={
              <EmptyState icon={<Handshake />} title={tt('adk.agent.none')}>
                {tt('adk.agent.noneBody')}
              </EmptyState>
            }
          />
        )}
      </>
    );
  }
  const [agents, commissions] = await Promise.all([load(() => api<Agent[]>('/v1/admissions/agents')), load(() => api<Commission[]>('/v1/admissions/commissions'))]);
  const { t } = await getI18n();
  const error = agents.error ?? commissions.error;
  return (
    <>
      <PageHeader title={t('adm.tab.partners')} subtitle={t('ag.partners.subtitle')} />
      <AdmissionsTabs current="partners" />
      {tabs}
      {error !== undefined ? <ErrorState message={error} /> : <PartnersDesk agents={agents.data!} commissions={commissions.data!} today={schoolToday()} />}
    </>
  );
}
