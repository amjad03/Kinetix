'use client';

import { ArrowLeftRight } from 'lucide-react';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const COLUMNS: ColSpec[] = [
  { key: 'fromVersionId', from: 'fromVersion', header: 'rk.f.curriculum-equivalences.fromVersionId', hideBelow: 'md' },
  { key: 'fromCode', header: 'rk.f.curriculum-equivalences.fromCode', kind: 'strong' },
  { key: 'fromName', header: 'kr.eq.fromName', sortKey: false, hideBelow: 'sm' },
  { key: 'toVersionId', from: 'toVersion', header: 'rk.f.curriculum-equivalences.toVersionId', hideBelow: 'md' },
  { key: 'toCode', header: 'rk.f.curriculum-equivalences.toCode', kind: 'strong' },
  { key: 'toName', header: 'kr.eq.toName', sortKey: false, hideBelow: 'sm' },
  { key: 'note', header: 'rk.f.curriculum-equivalences.note', kind: 'wrap', sortKey: false, defaultHidden: true },
];

/** Equivalences between two curriculum versions as a record kit list: add, import from Excel, edit, history, bin. */
export function EquivalencesDesk({ list }: { list: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState } }) {
  return <KitList {...list} label="rk.entity.curriculum-equivalences" columns={COLUMNS} empty={{ icon: <ArrowLeftRight />, title: 'kr.eq.empty', body: 'kr.empty.curriculum-equivalences' }} testId="cu-equivalences" />;
}
