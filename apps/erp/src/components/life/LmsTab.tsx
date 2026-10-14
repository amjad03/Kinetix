'use client';

import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { AssignmentsKit, ComplianceView, QuizzesKit } from './LmsLists';

type Opt = { id: string; name: string };

/** The homework page's tab: assignments, quizzes (record kit lists) or the compliance report. */
export function LmsTab({ tab, meta, page, state, sections, subjects }: { tab: string; meta?: RecordMeta; page?: RecordsPage<Row>; state?: ListState; sections: Opt[]; subjects: Opt[] }) {
  if (tab === 'compliance' || !meta || !page || !state) return <ComplianceView sections={sections} />;
  const p = { meta, page, state, tab, sections, subjects };
  return tab === 'quizzes' ? <QuizzesKit {...p} /> : <AssignmentsKit {...p} />;
}
