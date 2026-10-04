// Marks: percentages, the class's distribution and labels. Pure.

import type { MessageKey } from '@/i18n/messages';
import type { AssessmentDetail, AssessmentKind } from './types';

/** Dictionary keys for assessment kinds. */
export const KIND_LABEL: Record<AssessmentKind, MessageKey> = {
  test: 'kind.test',
  assignment: 'kind.assignment',
  internal: 'kind.internal',
  exam: 'kind.exam',
  practical: 'kind.practical',
};

/** "Test", or the kind as the API sent it when the ERP doesn't know it. */
export function kindLabel(kind: string, t: (k: MessageKey) => string): string {
  const key = KIND_LABEL[kind as AssessmentKind];
  return key ? t(key) : kind;
}

export function percent(marks: number, max: number): number {
  return max > 0 ? (marks / max) * 100 : 0;
}

/** "18.5" / "19": marks as entered, at most one decimal. */
export function formatMarks(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** Score bands for the distribution chart, as percentages of the maximum. */
export const BANDS = [
  { label: 'Below 40%', from: 0, to: 40 },
  { label: '40–49%', from: 40, to: 50 },
  { label: '50–59%', from: 50, to: 60 },
  { label: '60–69%', from: 60, to: 70 },
  { label: '70–79%', from: 70, to: 80 },
  { label: '80–89%', from: 80, to: 90 },
  { label: '90–100%', from: 90, to: Infinity },
] as const;

/** How many students scored in each band (absentees and marks not entered are left out). */
export function distribution(marks: (number | null)[], max: number): { label: string; count: number }[] {
  const counts = BANDS.map((b) => ({ label: b.label, count: 0 }));
  for (const m of marks) {
    if (m === null) continue;
    const p = percent(m, max);
    const i = BANDS.findIndex((b) => p >= b.from && p < b.to);
    counts[i === -1 ? 0 : i].count++;
  }
  return counts;
}

export interface ResultCounts {
  students: number;
  entered: number;
  absent: number;
  missing: number;
}

export function resultCounts(students: AssessmentDetail['students']): ResultCounts {
  const absent = students.filter((s) => s.absent).length;
  const entered = students.filter((s) => s.marks !== null).length;
  return { students: students.length, entered, absent, missing: students.length - entered - absent };
}

/**
 * Which classes a head of department sees on Results. The API answers a head of department
 * with the department's assessments for any class (an empty list where there are none), so
 * every class would come back; keep the classes they teach, the department's classes, and any
 * other class that has assessments they may read.
 */
export function hodResultClass(sectionId: string, assessments: number, taught: ReadonlySet<string>, department: ReadonlySet<string>): boolean {
  return taught.has(sectionId) || department.has(sectionId) || assessments > 0;
}
