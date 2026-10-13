import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';

/** Workflows | Runs, shared by the builder list and the runs list. */
export async function BuilderTabs({ value }: { value: 'workflows' | 'runs' }) {
  const { t } = await getI18n();
  return (
    <LinkTabs
      value={value}
      label={t('wb.title')}
      items={[
        { value: 'workflows', label: t('wb.tab.workflows'), href: '/workflows/builder' },
        { value: 'runs', label: t('wb.tab.runs'), href: '/workflows/runs' },
      ]}
    />
  );
}

export const ADMIN = ['principal', 'tenant_admin'];
