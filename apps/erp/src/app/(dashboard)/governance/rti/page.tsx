import type { Metadata } from 'next';
import { GovList } from '@/components/governance/GovLists';
import { GovTabs } from '@/components/governance/GovTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { RtiRegister } from '@/lib/governance-pass';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.rti') };
}

/** The RTI register: each request on its statutory clock, the steps as actions, and the quarter's return. */
export default async function RtiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('governance');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const [records, reg] = await Promise.all([loadRecords('rti-requests', sp), load(() => api<RtiRegister>('/v1/governance/rti/register'))]);
  return (
    <>
      <PageHeader title={t('gp.title.rti')} subtitle={t('gp.sub.rti')} />
      <GovTabs value="rti" />
      {reg.data && (
        <>
          <p className="mb-2 text-[13px] text-muted-foreground">{t('gp.r.period', { from: fmt.date(reg.data.from, 'short'), to: fmt.date(reg.data.to, 'short') })}</p>
          <StatGrid min={170}>
            <StatTile testId="rti-received" label={t('gp.r.received')} value={reg.data.received} caption={t('gp.r.carried', { n: reg.data.carriedIn })} />
            <StatTile testId="rti-replied" label={t('gp.r.replied')} value={reg.data.replied} caption={t('gp.r.late', { n: reg.data.lateReplies })} tone={reg.data.lateReplies ? 'warning' : 'default'} />
            <StatTile testId="rti-refused" label={t('gp.r.refused')} value={reg.data.refused} caption={Object.entries(reg.data.refusedBySection).map(([s, n]) => `${s}: ${n}`).join(', ') || t('gp.r.none')} />
            <StatTile testId="rti-overdue" label={t('gp.r.overdue')} value={reg.data.overdueNow} caption={t('gp.r.pending', { n: reg.data.pendingAtEnd })} tone={reg.data.overdueNow ? 'warning' : 'default'} />
            <StatTile testId="rti-appeals" label={t('gp.r.appeals')} value={reg.data.appealsReceived} caption={t('gp.r.appealsCap', { decided: reg.data.appealsDecided, pending: reg.data.appealsPending })} />
            <StatTile testId="rti-fees" label={t('gp.r.fees')} value={fmt.rupees(reg.data.feesPaise)} caption={t('gp.r.feesCap')} />
          </StatGrid>
        </>
      )}
      <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground">{t('gp.r.hint')}</p>
      {records.error !== undefined ? <ErrorState message={records.error} /> : <GovList entity="rti-requests" meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
