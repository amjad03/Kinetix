import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export const CELL_TABS = ['sessions', 'duties', 'halls', 'postponements', 'malpractice', 'marks', 'valuation', 'past-papers', 'settings'] as const;
export type CellTab = (typeof CELL_TABS)[number];
export const DESK_TABS = ['processing', 'withheld', 'grace', 'revaluations', 'registers', 'transfers'] as const;
export type DeskTab = (typeof DESK_TABS)[number];
export const DOC_TABS = ['requests', 'corrections', 'verification'] as const;
export type DocTab = (typeof DOC_TABS)[number];

const LABEL: Record<string, MessageKey> = {
  sessions: 'xc.tab.sessions',
  duties: 'xc.tab.duties',
  halls: 'xc.tab.halls',
  postponements: 'xc.tab.postponements',
  malpractice: 'xc.tab.malpractice',
  marks: 'xc.tab.marks',
  valuation: 'xc.tab.valuation',
  'past-papers': 'xc.tab.pastPapers',
  settings: 'xc.tab.settings',
  processing: 'xc.tab.processing',
  withheld: 'xc.tab.withheld',
  grace: 'xc.tab.grace',
  revaluations: 'xc.tab.revaluations',
  registers: 'xc.tab.registers',
  transfers: 'xc.tab.transfers',
  requests: 'xc.tab.requests',
  corrections: 'xc.tab.corrections',
  verification: 'xc.tab.verification',
};

/** The exam cell's, the results desk's or the documents desk's own tabs. */
export async function CellTabs({ area, current }: { area: 'cell' | 'desk' | 'docs'; current: string }) {
  const { t } = await getI18n();
  const list: readonly string[] = area === 'cell' ? CELL_TABS : area === 'desk' ? DESK_TABS : DOC_TABS;
  const href = (tab: string) => (area === 'cell' ? `/exams/cell/${tab}` : area === 'desk' ? `/exams/results-desk/${tab}` : `/exams/documents?tab=${tab}`);
  const label = area === 'cell' ? t('nav.examCell') : area === 'desk' ? t('nav.resultsDesk') : t('nav.docRequests');
  return <LinkTabs value={current} label={label} items={list.map((tab) => ({ value: tab, label: t(LABEL[tab]), href: href(tab) }))} />;
}
