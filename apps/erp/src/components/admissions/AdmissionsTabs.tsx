import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';

const TABS = [
  { href: '/admissions', key: 'pipeline', label: 'adm.tab.pipeline' },
  { href: '/admissions/applications', key: 'applications', label: 'adm.tab.applications' },
  { href: '/admissions/cycles', key: 'cycles', label: 'adm.tab.cycles' },
  { href: '/admissions/entrance', key: 'entrance', label: 'adm.tab.entrance' },
  { href: '/admissions/campaigns', key: 'campaigns', label: 'adm.tab.campaigns' },
  { href: '/admissions/interviews', key: 'interviews', label: 'adm.tab.interviews' },
  { href: '/admissions/online-test', key: 'onlineTest', label: 'adm.tab.onlineTest' },
  { href: '/admissions/partners', key: 'partners', label: 'adm.tab.partners' },
] as const;

/** The admissions areas, as link tabs across the top of each page. */
export async function AdmissionsTabs({ current }: { current: (typeof TABS)[number]['key'] }) {
  const { t } = await getI18n();
  return <LinkTabs value={current} label={t('nav.admissions')} items={TABS.map((tab) => ({ value: tab.key, label: t(tab.label), href: tab.href }))} />;
}
