'use client';

import { ListChecks } from 'lucide-react';
import { KitList, type ColSpec, type ParamAction } from '@/components/registers/KitList';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const COLUMNS: ColSpec[] = [
  { key: 'title', header: 'obe2.act.col.action', kind: 'wrap' },
  { key: 'code', header: 'obe2.act.col.outcome', sortKey: false },
  { key: 'program', header: 'obe2.act.col.programme', sortKey: false, hideBelow: 'md' },
  { key: 'year', header: 'obe2.act.col.year', sortKey: false, hideBelow: 'lg' },
  { key: 'ownerId', from: 'ownerIdName', header: 'obe2.act.col.owner', hideBelow: 'sm' },
  { key: 'dueOn', header: 'obe2.act.col.due', kind: 'date', hideBelow: 'sm' },
  { key: 'baselineValue', header: 'obe2.act.col.before', kind: 'number', hideBelow: 'md' },
  { key: 'targetValue', header: 'obe2.act.col.target', kind: 'number', hideBelow: 'md' },
  { key: 'remeasuredValue', header: 'obe2.act.col.after', kind: 'number', hideBelow: 'lg' },
  { key: 'status', header: 'obe2.act.col.status', kind: 'choice', tone: (v) => (v === 'done' ? 'success' : v === 'in_progress' ? 'info' : 'warning') },
  { key: 'stage', header: 'oa.act.col.stage', kind: 'choice', sortKey: false, hideBelow: 'md', tone: (v) => (v === 'verified' ? 'success' : v === 'done' || v === 'evidence' ? 'info' : v === 'identified' ? 'warning' : 'neutral') },
  { key: 'verifiedByName', header: 'oa.act.col.verifiedBy', sortKey: false, defaultHidden: true },
  { key: 'verifiedAt', header: 'oa.act.col.verifiedAt', kind: 'date', defaultHidden: true },
  { key: 'rootCause', header: 'obe2.act.col.rootCause', kind: 'wrap', defaultHidden: true, sortKey: false },
];

/** Verifying a done action (IQAC or principal) asks for a short note; it closes the action-taken report entry. */
const VERIFY: ParamAction[] = [{ key: 'verify', fields: [{ name: 'note', label: 'oa.act.verifyNote', type: 'textarea' }], when: (r) => r.status === 'done' && !r.verifiedAt }];

/** OBE improvement actions across programmes (the CQI loop) as a record kit list, with the IQAC's verification. */
export function ObeActionsList({ meta, page, state }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  return <KitList meta={meta} page={page} state={state} label="obe2.act.title" columns={COLUMNS} paramActions={VERIFY} empty={{ icon: <ListChecks />, title: 'obe2.act.none', body: 'obe2.act.noneBody' }} testId="obe-actions" />;
}
