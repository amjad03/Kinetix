import { LinkTabs } from '@/components/ui/Tabs';
import { getI18n } from '@/i18n/server';

export type FeesTab = 'overview' | 'invoices' | 'transfers' | 'plans' | 'sponsors';
const HREF: Record<FeesTab, string> = { overview: '/fees', invoices: '/fees/invoices', transfers: '/fees/bank-transfers', plans: '/fees/plans', sponsors: '/fees/sponsors' };

/** The Fees & accounts sections, the same strip on every fees page. */
export async function FeesNav({ value }: { value: FeesTab }) {
  const { t } = await getI18n();
  const items = (Object.keys(HREF) as FeesTab[]).map((k) => ({ value: k, label: t(`fo.tab.${k}`), href: HREF[k] }));
  return (
    <div className="-mt-1 overflow-x-auto" data-testid="fees-nav">
      <LinkTabs value={value} items={items} label={t('fo.nav')} />
    </div>
  );
}
