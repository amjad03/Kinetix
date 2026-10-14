import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export type ReportsTab = 'overview' | 'library' | 'mine' | 'dashboards' | 'schedules';

/** The tabs across every Reports page. `overview` (KPIs and the classic catalogue) is for leaders, accounts and HR. */
export async function ReportsTabs({ active, overview = true }: { active: ReportsTab; overview?: boolean }) {
  const { t } = await getI18n();
  const items = [
    ...(overview ? [{ value: 'overview' as const, label: t('rs.tab.overview'), href: '/reports' }] : []),
    { value: 'library' as const, label: t('rs.tab.library'), href: '/reports/library' },
    { value: 'mine' as const, label: t('rs.tab.mine'), href: '/reports/custom' },
    { value: 'dashboards' as const, label: t('rs.tab.dashboards'), href: '/reports/dashboards' },
    { value: 'schedules' as const, label: t('rs.tab.schedules'), href: '/reports/schedules' },
  ];
  return <LinkTabs value={active} items={items} label={t('rs.tabs')} />;
}

/** Roles that see the overview tab (the API's ANALYTICS_ROLES). */
export const OVERVIEW_ROLES = ['principal', 'tenant_admin', 'hod', 'accountant', 'hr_manager'];
