import type { Metadata } from 'next';
import Link from 'next/link';
import { FeeKitTable } from '@/components/fee-depth/FeeKitTable';
import { LateFeeRule, type Rule } from '@/components/fee-depth/LateFeeRule';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { SETUP_KIT, SETUP_TABS, type SetupTab } from '@/lib/fee-depth';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fx.feeSetup') };
}

type Tab = SetupTab | 'fines';

/**
 * Fee setup: the heads (priority, ledger, GST, refundable, optional), concession types, instalment plans, each
 * student's fee profile (quota, category, batch, optional heads) and the late-fee rule.
 */
export default async function FeeSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'fines' ? 'fines' : (SETUP_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as SetupTab) : 'heads';
  const { t } = await getI18n();
  await load(() => api('/v1/fee-setup/heads'));
  const tabs = (
    <LinkTabs
      value={tab}
      label={t('fx.feeSetup')}
      items={[...SETUP_TABS, 'fines' as const].map((x) => ({ value: x, label: t(`fx.setup.${x}` as MessageKey), href: x === 'heads' ? '/fees/setup' : `/fees/setup?tab=${x}` }))}
    />
  );
  const header = (
    <>
      <PageHeader
        title={t('fx.feeSetup')}
        subtitle={t(`fx.setup.${tab}.sub` as MessageKey)}
        actions={
          <Button asChild variant="outline" className="h-9">
            <Link href="/accounts/settings">{t('fd.settings')}</Link>
          </Button>
        }
      />
      <FeesNav value="setup" />
      {tabs}
    </>
  );
  if (tab === 'fines') {
    const rule = await load(() => api<Rule | null>('/v1/fees/late-fee-rule'));
    return (
      <>
        {header}
        {rule.error !== undefined ? <ErrorState message={rule.error} /> : <LateFeeRule rule={rule.data} />}
      </>
    );
  }
  const records = await loadRecords(SETUP_KIT[tab], sp);
  return (
    <>
      {header}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <FeeKitTable meta={records.data.meta} page={records.data.page} state={records.data.state} label={t(`fx.setup.${tab}` as MessageKey)} extraParams={tab === 'heads' ? {} : { tab }} />}
    </>
  );
}
