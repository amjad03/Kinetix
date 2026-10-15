import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export type SessionTab = 'overview' | 'applications' | 'papers' | 'registers';

/** The pages of one exam session: its desk, the applications, question paper setting and the registers. */
export async function SessionTabs({ sessionId, current }: { sessionId: string; current: SessionTab }) {
  const { t } = await getI18n();
  const base = `/exams/${sessionId}`;
  return (
    <LinkTabs
      value={current}
      label={t('xf.tabs.label')}
      items={[
        { value: 'overview', label: t('xf.tabs.overview'), href: base },
        { value: 'applications', label: t('xf.tabs.applications'), href: `${base}/applications` },
        { value: 'papers', label: t('xf.tabs.papers'), href: `${base}/papers` },
        { value: 'registers', label: t('xf.tabs.registers'), href: `${base}/registers` },
      ]}
    />
  );
}
