import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';

/** The curriculum area: versions, the equivalences between them, and re-admission into the scheme in force. */
export async function CurriculumTabs({ current }: { current: 'versions' | 'equivalences' | 'readmission' }) {
  const { t } = await getI18n();
  return (
    <LinkTabs
      value={current}
      label={t('nav.curriculum')}
      items={[
        { value: 'versions', label: t('ra.tab.versions'), href: '/curriculum' },
        { value: 'equivalences', label: t('ra.tab.equivalences'), href: '/curriculum/equivalences' },
        { value: 'readmission', label: t('ra.tab.readmission'), href: '/curriculum/readmission' },
      ]}
    />
  );
}
