import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { canSee, type Section } from '@/lib/access';
import type { MessageKey } from '@/i18n/messages';
import type { RoleName } from '@/lib/types';

const TABS: { key: string; href: string; label: MessageKey; section: Section }[] = [
  { key: 'sessions', href: '/exams', label: 'axr.tab.sessions', section: 'exams' },
  { key: 'schemes', href: '/exams/schemes', label: 'axr.tab.schemes', section: 'exams' },
  { key: 'university', href: '/exams/university', label: 'axr.tab.university', section: 'exams' },
  { key: 'documents', href: '/exams/documents', label: 'axr.tab.documents', section: 'exams' },
  { key: 'examiners', href: '/exams/examiners', label: 'axr.tab.examiners', section: 'exams' },
  { key: 'operations', href: '/exams/operations', label: 'axr.tab.operations', section: 'exams' },
  { key: 'evaluation', href: '/evaluation', label: 'axr.tab.evaluation', section: 'evaluation' },
  { key: 'desk', href: '/evaluation/desk', label: 'axr.tab.desk', section: 'evaluationDesk' },
  { key: 'results', href: '/results', label: 'axr.tab.results', section: 'results' },
];

/** The exams and results areas as link tabs, limited to what the signed-in roles can open. */
export async function ExamsTabs({ current, roles }: { current: string; roles?: readonly RoleName[] }) {
  const { t } = await getI18n();
  const items = TABS.filter((tab) => !roles || canSee(roles, tab.section));
  return <LinkTabs value={current} label={t('nav.exams')} items={items.map((tab) => ({ value: tab.key, label: t(tab.label), href: tab.href }))} />;
}
