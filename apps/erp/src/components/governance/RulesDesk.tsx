'use client';

import { Scale } from 'lucide-react';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const STATUS_TONE = (v: string) => (v === 'approved' ? 'success' : v === 'in_review' ? 'warning' : 'neutral');

const COLUMNS: ColSpec[] = [
  { key: 'title', header: 'rk.f.business-rules.title', kind: 'strong' },
  { key: 'domain', header: 'rk.f.business-rules.domain', kind: 'choice' },
  { key: 'key', header: 'rk.f.business-rules.key', hideBelow: 'sm' },
  { key: 'version', header: 'rk.f.business-rules.version', kind: 'number' },
  { key: 'params', header: 'rk.f.business-rules.params', kind: 'list', hideBelow: 'md' },
  { key: 'effectiveFrom', header: 'rk.f.business-rules.effectiveFrom', kind: 'date', hideBelow: 'sm' },
  { key: 'effectiveTo', header: 'rk.f.business-rules.effectiveTo', kind: 'date', sortKey: false, hideBelow: 'lg' },
  { key: 'status', header: 'rk.f.business-rules.status', kind: 'choice', tone: STATUS_TONE },
  { key: 'inForce', header: 'rk.f.business-rules.inForce', kind: 'bool', sortKey: false },
  { key: 'authorName', header: 'rk.f.business-rules.authorName', sortKey: false, defaultHidden: true },
  { key: 'approverName', header: 'rk.f.business-rules.approverName', sortKey: false, defaultHidden: true },
];

/**
 * The business rule registry as a record kit list: every version, who wrote and approved it, and when it is in force.
 * A draft is added and edited here; sending for review, approval by a second person, retiring and starting a new
 * version are the list's actions.
 */
export function RulesDesk({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t } = useI18n();
  return (
    <>
      <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground">{t('gr.hint')}</p>
      <KitList meta={meta} page={page} state={state} label="nav.govRules" columns={COLUMNS} empty={{ icon: <Scale />, title: 'gr.empty', body: 'gr.newHint' }} testId="gr-table" />
    </>
  );
}
