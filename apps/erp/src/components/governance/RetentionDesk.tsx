'use client';

import { Archive } from 'lucide-react';
import { holdFile, runRetention } from '@/app/(dashboard)/governance/actions';
import { ActionButton, Bar, Grid, useToast } from '@/components/ops/kit';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { useI18n } from '@/i18n/client';
import type { DueFile } from '@/lib/governance';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const COLUMNS: ColSpec[] = [
  { key: 'category', header: 'rk.f.retention-policies.category', kind: 'strong' },
  { key: 'retainMonths', header: 'rk.f.retention-policies.retainMonths', kind: 'number' },
  { key: 'note', header: 'rk.f.retention-policies.note', kind: 'wrap', sortKey: false },
  { key: 'createdByName', header: 'rk.f.retention-policies.createdByName', sortKey: false, hideBelow: 'md' },
];

/**
 * How long each category of file is kept (a record kit list: add, edit, bulk edit, import, export, delete and restore),
 * the files that are past it, and a legal hold that keeps a file out of the archive run.
 */
export function RetentionDesk({ policies, due }: { policies: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }; due: DueFile[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  return (
    <>
      <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground">{t('ret.hint')}</p>
      <h2 className="mb-2 text-base leading-6 font-medium tracking-[0.1px]">{t('ret.policies')}</h2>
      <KitList {...policies} label="ret.policies" columns={COLUMNS} empty={{ icon: <Archive />, title: 'ret.noPolicies', body: 'ret.hint' }} testId="ret-policies" />
      <h2 className="mt-6 mb-2 text-base leading-6 font-medium tracking-[0.1px]">{t('ret.due')}</h2>
      <Bar>
        <ActionButton label={t('ret.run', { n: due.length })} run={runRetention} onDone={toast} disabled={due.length === 0} />
      </Bar>
      <Grid
        testId="ret-due"
        empty={t('ret.noneDue')}
        rows={due}
        cols={[
          { label: t('ret.col.file'), cell: (r) => r.title, sort: (r) => r.title },
          { label: t('ret.col.category'), cell: (r) => r.category, sort: (r) => r.category },
          { label: t('ret.col.kept'), cell: (r) => fmt.dateTime(r.createdAt, undefined, false), sort: (r) => r.createdAt },
          { label: t('ret.col.months'), cell: (r) => fmt.number(r.retainMonths), num: true },
          { label: '', cell: (r) => <ActionButton label={t('ret.hold')} run={() => holdFile(r.id, true)} onDone={toast} /> },
        ]}
      />
      {toastNode}
    </>
  );
}
