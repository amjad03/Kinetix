import type { Metadata } from 'next';
import { CalendarDesk } from '@/components/governance/CalendarDesk';
import { GovList } from '@/components/governance/GovLists';
import { GovTabs } from '@/components/governance/GovTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Calendar } from '@/lib/governance-pass';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.compliance') };
}

/** The compliance calendar: regulatory deadlines month by month with owners and reminders, and the register of them. */
export default async function CompliancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('governance');
  const { t } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'list' ? 'list' : 'calendar';
  const views = <LinkTabs value={view} label={t('gp.title.compliance')} items={[{ value: 'calendar', label: t('gp.cal.calendar'), href: '/governance/compliance' }, { value: 'list', label: t('gp.cal.list'), href: '/governance/compliance?view=list' }]} />;
  if (view === 'list') {
    const records = await loadRecords('compliance-deadlines', sp);
    return (
      <>
        <PageHeader title={t('gp.title.compliance')} subtitle={t('gp.sub.compliance')} />
        <GovTabs value="compliance" />
        {views}
        {records.error !== undefined ? <ErrorState message={records.error} /> : <GovList entity="compliance-deadlines" meta={records.data.meta} page={records.data.page} state={records.data.state} extraParams={{ view: 'list' }} />}
      </>
    );
  }
  const res = await load(() => api<Calendar>('/v1/governance/compliance/calendar'));
  return (
    <>
      <PageHeader title={t('gp.title.compliance')} subtitle={t('gp.sub.compliance')} />
      <GovTabs value="compliance" />
      {views}
      {res.error !== undefined ? <ErrorState message={res.error} /> : <CalendarDesk cal={res.data} />}
    </>
  );
}
