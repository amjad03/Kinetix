import type { Metadata } from 'next';
import { DisclosurePublish } from '@/components/governance/DisclosurePublish';
import { DisclosureView } from '@/components/governance/DisclosureView';
import { GovList } from '@/components/governance/GovLists';
import { GovTabs } from '@/components/governance/GovTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Disclosure } from '@/lib/governance-pass';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.disclosure') };
}

/** The mandatory disclosure page: a preview of what the public sees, the publish switch, and the typed lines. */
export default async function DisclosurePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('governance');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const view = sp.view === 'lines' ? 'lines' : 'preview';
  const views = <LinkTabs value={view} label={t('gp.title.disclosure')} items={[{ value: 'preview', label: t('gp.ds.preview'), href: '/governance/disclosure' }, { value: 'lines', label: t('gp.ds.lines'), href: '/governance/disclosure?view=lines' }]} />;
  if (view === 'lines') {
    const records = await loadRecords('disclosure-items', sp);
    return (
      <>
        <PageHeader title={t('gp.title.disclosure')} subtitle={t('gp.sub.disclosure')} />
        <GovTabs value="disclosure" />
        {views}
        {records.error !== undefined ? <ErrorState message={records.error} /> : <GovList entity="disclosure-items" meta={records.data.meta} page={records.data.page} state={records.data.state} extraParams={{ view: 'lines' }} />}
      </>
    );
  }
  const res = await load(() => api<Disclosure>('/v1/governance/disclosure'));
  return (
    <>
      <PageHeader title={t('gp.title.disclosure')} subtitle={t('gp.sub.disclosure')} />
      <GovTabs value="disclosure" />
      {views}
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : (
        <>
          <DisclosurePublish published={res.data.published} publishedAt={res.data.publishedAt} intro={res.data.intro} slug={res.data.institution.slug} />
          <Card>
            <DisclosureView d={res.data} t={t} date={(d) => fmt.date(d, 'short')} />
          </Card>
        </>
      )}
    </>
  );
}
