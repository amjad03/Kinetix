import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

const TABS = ['overview', 'committees', 'policies', 'rti', 'compliance', 'disclosure'] as const;
export type GovTab = (typeof TABS)[number];
const HREF: Record<GovTab, string> = { overview: '/governance', committees: '/governance/committees', policies: '/governance/policies', rti: '/governance/rti', compliance: '/governance/compliance', disclosure: '/governance/disclosure' };

/** The governance pages as tabs: overview, committees, policies, RTI, the compliance calendar and the disclosure page. */
export async function GovTabs({ value }: { value: GovTab }) {
  const { t } = await getI18n();
  return <LinkTabs value={value} label={t('gp.title.overview')} items={TABS.map((x) => ({ value: x, label: t(`gp.tab.${x}` as MessageKey), href: HREF[x] }))} />;
}
