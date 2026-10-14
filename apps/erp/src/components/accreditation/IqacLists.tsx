'use client';

import { Award, CalendarCheck, ClipboardList, FileCheck2, ListTodo, MessageSquareText, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import type { Tone } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const tone = (good: string[], warn: string[] = [], bad: string[] = []) => (v: string): Tone => (good.includes(v) ? 'success' : warn.includes(v) ? 'warning' : bad.includes(v) ? 'danger' : 'neutral');

const SPECS: Record<string, { label: MessageKey; columns: ColSpec[]; empty: { icon: ReactNode; title: MessageKey; body: MessageKey } }> = {
  'iqac-members': {
    label: 'iqx.list.members',
    columns: [
      { key: 'name', header: 'iqx.col.name', kind: 'strong' },
      { key: 'category', header: 'iqx.col.category', kind: 'choice' },
      { key: 'designation', header: 'iqx.col.designation', hideBelow: 'md' },
      { key: 'organisation', header: 'iqx.col.organisation', hideBelow: 'lg' },
      { key: 'termFrom', header: 'iqx.col.termFrom', kind: 'date', hideBelow: 'sm' },
      { key: 'termTo', header: 'iqx.col.termTo', kind: 'date', hideBelow: 'sm' },
      { key: 'email', header: 'iqx.col.email', defaultHidden: true },
    ],
    empty: { icon: <Users />, title: 'iqx.empty.members', body: 'iqx.emptyBody.members' },
  },
  'iqac-meetings': {
    label: 'iqx.list.meetings',
    columns: [
      { key: 'title', header: 'iqx.col.meeting', kind: 'strong' },
      { key: 'meetingOn', header: 'iqx.col.date', kind: 'date' },
      { key: 'kind', header: 'iqx.col.kind', kind: 'choice', hideBelow: 'md' },
      { key: 'present', header: 'iqx.col.present', kind: 'number', hideBelow: 'md' },
      { key: 'actions', header: 'iqx.col.actions', kind: 'number', sortKey: false, hideBelow: 'sm' },
      { key: 'openActions', header: 'iqx.col.openActions', kind: 'number', sortKey: false, hideBelow: 'lg' },
      { key: 'status', header: 'iqx.col.status', kind: 'choice', tone: tone(['minutes_approved'], ['held'], []) },
      { key: 'minutes', header: 'iqx.col.minutes', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <CalendarCheck />, title: 'iqx.empty.meetings', body: 'iqx.emptyBody.meetings' },
  },
  'iqac-actions': {
    label: 'iqx.list.actions',
    columns: [
      { key: 'action', header: 'iqx.col.action', kind: 'wrap' },
      { key: 'meeting', header: 'iqx.col.meeting', sortKey: false, hideBelow: 'lg' },
      { key: 'ownerUserId', from: 'ownerUserIdName', header: 'iqx.col.owner', hideBelow: 'sm' },
      { key: 'criterion', header: 'iqx.col.criterion', kind: 'choice', hideBelow: 'md' },
      { key: 'priority', header: 'iqx.col.priority', kind: 'choice', tone: tone([], ['high']), hideBelow: 'md' },
      { key: 'dueOn', header: 'iqx.col.due', kind: 'date' },
      { key: 'status', header: 'iqx.col.status', kind: 'choice', tone: tone(['done'], ['open', 'in_progress'], ['dropped']) },
      { key: 'actionTaken', header: 'iqx.col.taken', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <ListTodo />, title: 'iqx.empty.actions', body: 'iqx.emptyBody.actions' },
  },
  'iqac-initiatives': {
    label: 'iqx.list.initiatives',
    columns: [
      { key: 'title', header: 'iqx.col.initiative', kind: 'wrap' },
      { key: 'kind', header: 'iqx.col.kind', kind: 'choice', hideBelow: 'sm' },
      { key: 'criterion', header: 'iqx.col.criterion', kind: 'choice', hideBelow: 'md' },
      { key: 'plannedOn', header: 'iqx.col.planned', kind: 'date' },
      { key: 'heldOn', header: 'iqx.col.held', kind: 'date', hideBelow: 'sm' },
      { key: 'participants', header: 'iqx.col.participants', kind: 'number', hideBelow: 'lg' },
      { key: 'status', header: 'iqx.col.status', kind: 'choice', tone: tone(['done'], ['planned'], ['cancelled']) },
      { key: 'outcome', header: 'iqx.col.outcome', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <ClipboardList />, title: 'iqx.empty.initiatives', body: 'iqx.emptyBody.initiatives' },
  },
  'iqac-feedback': {
    label: 'iqx.list.feedback',
    columns: [
      { key: 'stakeholder', header: 'iqx.col.stakeholder', kind: 'choice' },
      { key: 'cycle', header: 'iqx.col.year' },
      { key: 'responses', header: 'iqx.col.responses', kind: 'number', hideBelow: 'sm' },
      { key: 'averageRating', header: 'iqx.col.rating', kind: 'number', hideBelow: 'sm' },
      { key: 'summary', header: 'iqx.col.analysis', kind: 'wrap', hideBelow: 'md' },
      { key: 'actionTaken', header: 'iqx.col.taken', kind: 'wrap', hideBelow: 'lg' },
      { key: 'status', header: 'iqx.col.status', kind: 'choice', tone: tone(['action_taken'], ['analysed', 'action_planned']) },
    ],
    empty: { icon: <MessageSquareText />, title: 'iqx.empty.feedback', body: 'iqx.emptyBody.feedback' },
  },
  'iqac-practices': {
    label: 'iqx.list.practices',
    columns: [
      { key: 'title', header: 'iqx.col.practice', kind: 'strong' },
      { key: 'kind', header: 'iqx.col.kind', kind: 'choice' },
      { key: 'year', header: 'iqx.col.year', hideBelow: 'sm' },
      { key: 'complete', header: 'iqx.col.complete', kind: 'bool', sortKey: false, hideBelow: 'sm' },
      { key: 'objectives', header: 'iqx.col.objectives', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <Award />, title: 'iqx.empty.practices', body: 'iqx.emptyBody.practices' },
  },
  'iqac-aqar': {
    label: 'iqx.list.aqar',
    columns: [
      { key: 'year', header: 'iqx.col.year', kind: 'strong' },
      { key: 'dueOn', header: 'iqx.col.due', kind: 'date' },
      { key: 'submittedOn', header: 'iqx.col.submitted', kind: 'date' },
      { key: 'reference', header: 'iqx.col.reference', hideBelow: 'sm' },
      { key: 'status', header: 'iqx.col.status', kind: 'choice', tone: tone(['accepted', 'submitted'], ['preparing'], ['returned']) },
    ],
    empty: { icon: <FileCheck2 />, title: 'iqx.empty.aqar', body: 'iqx.emptyBody.aqar' },
  },
};

/** One IQAC register as a kit list. */
export function IqacList({ entity, meta, page, state, extraParams }: { entity: string; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; extraParams: Record<string, string> }) {
  const s = SPECS[entity];
  return <KitList meta={meta} page={page} state={state} label={s.label} columns={s.columns} empty={s.empty} extraParams={extraParams} testId={`list-${entity}`} />;
}
