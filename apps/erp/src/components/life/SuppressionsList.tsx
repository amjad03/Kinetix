'use client';

import { PhoneOff } from 'lucide-react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { EmptyState } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useKitColumns, emptyFor } from './kit';

/** The do-not-contact list as a record kit list: add, import (from the operator's DND file), export, history. */
export function SuppressionsList({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'address', header: 'cd.col.address', sortKey: 'address', rowHeader: true },
    { key: 'personName', header: 'cd.col.person', sortKey: 'person' },
    { key: 'channel', header: 'cd.col.channel', kind: 'choice' },
    { key: 'reason', header: 'cd.col.reason', kind: 'choice', tones: { dnd: 'warning', bounced: 'danger', opted_out: 'neutral', invalid: 'danger' } },
    { key: 'note', header: 'cd.col.note', kind: 'wrap', hideBelow: 'md' },
    { key: 'createdAt', header: 'cd.col.added', kind: 'date', sortKey: 'created', hideBelow: 'sm' },
  ]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('cd.sup.title')}
      columns={columns}
      testId="cd-suppressions"
      empty={emptyFor(meta, <EmptyState icon={<PhoneOff />} title={t('cd.sup.emptyTitle')}>{t('cd.sup.empty')}</EmptyState>)}
    />
  );
}
