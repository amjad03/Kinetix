import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';

const TABS = [
  { href: '/students', key: 'list', label: 'si.tab.list' },
  { href: '/students/guardians', key: 'guardians', label: 'si.tab.guardians' },
  { href: '/students/change-requests', key: 'requests', label: 'si.tab.requests' },
  { href: '/students/clearances', key: 'clearances', label: 'si.tab.clearances' },
  { href: '/students/registers', key: 'registers', label: 'si.tab.registers' },
  { href: '/students/tools', key: 'tools', label: 'si.tab.tools' },
  { href: '/students/fields', key: 'fields', label: 'si.tab.fields' },
] as const;

export type StudentsTab = (typeof TABS)[number]['key'];

/** The student information areas, as link tabs under the page header. */
export async function StudentsTabs({ current }: { current: StudentsTab }) {
  const { t } = await getI18n();
  return <LinkTabs value={current} label={t('nav.students')} items={TABS.map((tab) => ({ value: tab.key, label: t(tab.label), href: tab.href }))} />;
}
