'use client';

import { CalendarClock, FileText, Landmark, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import type { Tone } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const tone = (good: string[], warn: string[] = [], bad: string[] = []) => (v: string): Tone => (good.includes(v) ? 'success' : warn.includes(v) ? 'warning' : bad.includes(v) ? 'danger' : 'neutral');

const SPECS: Record<string, { label: MessageKey; columns: ColSpec[]; empty: { icon: ReactNode; title: MessageKey; body: MessageKey }; href?: (r: Row) => string }> = {
  'governance-policies': {
    label: 'gp.tab.policies',
    columns: [
      { key: 'code', header: 'rk.f.governance-policies.code', kind: 'strong' },
      { key: 'title', header: 'rk.f.governance-policies.title', kind: 'wrap' },
      { key: 'category', header: 'rk.f.governance-policies.category', kind: 'choice', hideBelow: 'sm' },
      { key: 'publishedVersion', header: 'gp.col.published', kind: 'number', sortKey: false, hideBelow: 'sm' },
      { key: 'openVersion', header: 'gp.col.open', kind: 'choice', sortKey: false, tone: tone([], ['in_review', 'approved'], []), hideBelow: 'md' },
      { key: 'acknowledged', header: 'gp.col.acknowledged', kind: 'number', sortKey: false, hideBelow: 'md' },
      { key: 'nextReviewOn', header: 'gp.col.review', kind: 'date', hideBelow: 'lg' },
      { key: 'ownerUserId', from: 'ownerUserIdName', header: 'rk.f.governance-policies.ownerUserId', hideBelow: 'lg' },
      { key: 'status', header: 'rk.f.governance-policies.status', kind: 'choice', tone: tone(['active'], [], ['retired']), defaultHidden: true },
    ],
    empty: { icon: <ScrollText />, title: 'gp.empty.policies', body: 'gp.emptyBody.policies' },
    href: (r) => `/governance/policies/${String(r.id)}`,
  },
  'rti-requests': {
    label: 'gp.tab.rti',
    columns: [
      { key: 'requestNo', header: 'gp.col.requestNo', kind: 'strong' },
      { key: 'subject', header: 'rk.f.rti-requests.subject', kind: 'wrap' },
      { key: 'applicantName', header: 'rk.f.rti-requests.applicantName', hideBelow: 'sm' },
      { key: 'receivedOn', header: 'rk.f.rti-requests.receivedOn', kind: 'date', hideBelow: 'md' },
      { key: 'dueOn', header: 'gp.col.dueOn', kind: 'date' },
      { key: 'daysLeft', header: 'gp.col.daysLeft', kind: 'number', sortKey: 'dueOn', hideBelow: 'md' },
      { key: 'status', header: 'gp.col.status', kind: 'choice', tone: tone(['replied', 'closed'], ['received', 'transferred'], ['rejected']) },
      { key: 'pioUserId', from: 'pioUserIdName', header: 'rk.f.rti-requests.pioUserId', hideBelow: 'lg' },
      { key: 'appealOutcome', header: 'gp.col.appeal', kind: 'choice', sortKey: false, hideBelow: 'lg' },
      { key: 'rejectionSection', header: 'gp.col.section', sortKey: false, defaultHidden: true },
      { key: 'additionalFeeRupees', header: 'gp.col.fee', kind: 'money', sortKey: false, defaultHidden: true },
    ],
    empty: { icon: <Landmark />, title: 'gp.empty.rti', body: 'gp.emptyBody.rti' },
  },
  'compliance-deadlines': {
    label: 'gp.tab.compliance',
    columns: [
      { key: 'title', header: 'rk.f.compliance-deadlines.title', kind: 'wrap' },
      { key: 'authority', header: 'rk.f.compliance-deadlines.authority', kind: 'choice', hideBelow: 'sm' },
      { key: 'dueOn', header: 'rk.f.compliance-deadlines.dueOn', kind: 'date' },
      { key: 'state', header: 'gp.col.state', kind: 'choice', tone: tone(['done'], ['due_soon'], ['overdue', 'missed']) },
      { key: 'recurrence', header: 'rk.f.compliance-deadlines.recurrence', kind: 'choice', hideBelow: 'md' },
      { key: 'ownerUserId', from: 'ownerUserIdName', header: 'rk.f.compliance-deadlines.ownerUserId', hideBelow: 'md' },
      { key: 'reference', header: 'rk.f.compliance-deadlines.reference', hideBelow: 'lg' },
      { key: 'remindersSent', header: 'gp.col.reminders', kind: 'number', sortKey: false, defaultHidden: true },
    ],
    empty: { icon: <CalendarClock />, title: 'gp.empty.compliance', body: 'gp.emptyBody.compliance' },
  },
  'disclosure-items': {
    label: 'gp.tab.disclosure',
    columns: [
      { key: 'section', header: 'rk.f.disclosure-items.section', kind: 'choice' },
      { key: 'label', header: 'rk.f.disclosure-items.label', kind: 'strong' },
      { key: 'value', header: 'rk.f.disclosure-items.value', kind: 'wrap', hideBelow: 'sm' },
      { key: 'public', header: 'rk.f.disclosure-items.public', kind: 'bool', hideBelow: 'md' },
      { key: 'url', header: 'rk.f.disclosure-items.url', hideBelow: 'lg' },
      { key: 'updatedAt', header: 'gp.col.updated', kind: 'date', sortKey: false, defaultHidden: true },
    ],
    empty: { icon: <FileText />, title: 'gp.empty.disclosure', body: 'gp.emptyBody.disclosure' },
  },
};

/** One governance register as a record kit list. */
export function GovList({ entity, meta, page, state, extraParams }: { entity: keyof typeof SPECS | string; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; extraParams?: Record<string, string> }) {
  const s = SPECS[entity];
  return <KitList meta={meta} page={page} state={state} label={s.label} columns={s.columns} empty={s.empty} extraParams={extraParams} rowHref={s.href} testId={`list-${entity}`} />;
}
