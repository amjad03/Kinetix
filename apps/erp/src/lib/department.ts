// The head of department's view (GET /v1/departments/:id/overview): ranges, flags and labels.

import type { Locale } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/messages';
import type { TFunction } from '@/i18n/translate';
import { addDays, daysBetween, formatDate, isIsoDate, isoWeekday } from './dates';
import { behindPlan } from './plans';
import type { PlanProgress } from './types';

/** The API covers at most this many days in one overview. */
export const MAX_RANGE_DAYS = 120;

export type RangeKey = 'week' | 'month' | 'term' | 'custom';

export interface DeptRange {
  key: RangeKey;
  from: string;
  to: string;
}

export const RANGE_LABEL: Record<RangeKey, MessageKey> = {
  week: 'dept.range.week',
  month: 'dept.range.month',
  term: 'dept.range.term',
  custom: 'dept.range.custom',
};

/**
 * The range from the URL. `week` runs from Monday to today, `month` the last 30 days, `term` the
 * longest range the API allows (about a term). `from`/`to` give a custom range, clamped to
 * today and to {@link MAX_RANGE_DAYS} days. Anything else is this week.
 */
export function rangeFrom(params: { range?: string; from?: string; to?: string }, today: string): DeptRange {
  if (isIsoDate(params.from) || isIsoDate(params.to)) {
    let to = isIsoDate(params.to) && params.to < today ? params.to : today;
    let from = isIsoDate(params.from) ? params.from : addDays(to, -6);
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) > MAX_RANGE_DAYS - 1) from = addDays(to, -(MAX_RANGE_DAYS - 1));
    return { key: 'custom', from, to };
  }
  switch (params.range) {
    case 'month':
      return { key: 'month', from: addDays(today, -29), to: today };
    case 'term':
      return { key: 'term', from: addDays(today, -(MAX_RANGE_DAYS - 1)), to: today };
    default:
      return { key: 'week', from: addDays(today, -(isoWeekday(today) - 1)), to: today };
  }
}

/** The query string for a department and range (`dept=…&range=…` or `…&from=…&to=…`). */
export function deptQuery(deptId: string | null, range: DeptRange): string {
  const q = new URLSearchParams();
  if (deptId) q.set('dept', deptId);
  if (range.key === 'custom') {
    q.set('from', range.from);
    q.set('to', range.to);
  } else if (range.key !== 'week') q.set('range', range.key);
  return q.toString();
}

/** What a percentage means for the department: below `LOW` it is flagged, from `GOOD` it is fine. */
export const THRESHOLDS = {
  /** Classes held on the board, and attendance taken, out of periods due. */
  held: { low: 75, good: 90 },
  /** Students present (present or late) out of attendance marked. */
  attendance: { low: 75, good: 90 },
  /** A class's test average, as a percentage of the maximum marks. */
  marks: { low: 40, good: 70 },
} as const;

export type Tone = 'low' | 'fair' | 'good' | 'none';

/** Tone for a percentage; `null` (nothing due, nothing marked) is `none`, never flagged. */
export function toneOf(percent: number | null | undefined, kind: keyof typeof THRESHOLDS): Tone {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return 'none';
  const t = THRESHOLDS[kind];
  if (percent < t.low) return 'low';
  return percent >= t.good ? 'good' : 'fair';
}

export const TONE_COLOR: Record<Tone, string> = {
  low: 'error.main',
  fair: 'primary.main',
  good: 'kx.success',
  none: 'text.secondary',
};

/** "87%", or "—" when there is nothing to measure. */
export function formatPercent(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '—';
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

/** "12 of 15" (or "—" when nothing was due); in the ERP language with `t`. */
export function ofText(n: number, d: number, t?: TFunction): string {
  if (d === 0) return '—';
  return t ? t('dept.of', { n, d }) : `${n} of ${d}`;
}

/** "29 Sept – 4 Oct 2026" style range label. */
export function rangeText(range: { from: string; to: string }, locale: Locale = 'en'): string {
  const fmt = (d: string, year: boolean) => formatDate(d, year ? 'day' : 'dayMonth', locale);
  if (range.from === range.to) return fmt(range.to, true);
  return `${fmt(range.from, range.from.slice(0, 4) !== range.to.slice(0, 4))} – ${fmt(range.to, true)}`;
}

export interface Rates {
  scheduled: number;
  taughtPercent: number | null;
  attendanceTakenPercent: number | null;
  attendancePercent: number | null;
  /** A class's year plan (teachers have none). */
  yearPlan?: PlanProgress | null;
}

/** Why a teacher or class is flagged (dictionary keys: "Few classes held", …); empty when all is well. */
export function flagsFor(r: Rates): MessageKey[] {
  const out: MessageKey[] = [];
  if (toneOf(r.taughtPercent, 'held') === 'low') out.push('dept.flag.held');
  if (toneOf(r.attendanceTakenPercent, 'held') === 'low') out.push('dept.flag.taken');
  if (toneOf(r.attendancePercent, 'attendance') === 'low') out.push('dept.flag.attendance');
  if (behindPlan(r.yearPlan)) out.push('dept.flag.behindPlan');
  return out;
}

/** Topics covered across classes, as a percentage (null when no class has a syllabus). */
export function syllabusTotal(classes: readonly { syllabus?: { covered: number; total: number } }[]): { covered: number; total: number; percent: number | null } {
  const covered = classes.reduce((n, c) => n + (c.syllabus?.covered ?? 0), 0);
  const total = classes.reduce((n, c) => n + (c.syllabus?.total ?? 0), 0);
  return { covered, total, percent: total ? Math.round((covered / total) * 1000) / 10 : null };
}

/** Who may head a department: staff with the HOD role (the API refuses anyone else). */
export function headCandidates<T extends { roles: readonly string[] }>(staff: readonly T[]): T[] {
  return staff.filter((s) => s.roles.includes('hod'));
}

/**
 * Subjects chosen for department `deptId` that now belong to another department: saving moves
 * them, since a subject belongs to one department. Returns "Subject (from Department)" lines.
 */
export function movedSubjects(
  deptId: string | null,
  subjectIds: readonly string[],
  departments: readonly { id: string; name: string; subjects: readonly { id: string; name: string }[] }[],
): { id: string; name: string; from: string }[] {
  const chosen = new Set(subjectIds);
  return departments
    .filter((d) => d.id !== deptId)
    .flatMap((d) => d.subjects.filter((s) => chosen.has(s.id)).map((s) => ({ id: s.id, name: s.name, from: d.name })));
}
