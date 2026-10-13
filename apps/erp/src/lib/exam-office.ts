// Exam office (v1/exam-office): records of every exam entity, the session workflow, reports and settings.
import type { TFunction } from '@/i18n/translate';
import type { MessageKey } from '@/i18n/messages';
import type { Fmt } from '@/i18n/format';
import type { NumberingSeries } from '@/lib/templates';

export const KINDS = ['session', 'paper', 'registration', 'hall_ticket', 'question_paper', 'script', 'examiner', 'result', 'revaluation', 'certificate'] as const;
export type Kind = (typeof KINDS)[number];
export const REPORTS = ['registration_summary', 'hall_tickets', 'seating_plan', 'invigilation', 'attendance', 'malpractice', 'valuation_status', 'tabulation', 'result_analysis', 'revaluation_outcomes', 'pass_fail'] as const;
export type Report = (typeof REPORTS)[number];

/** URL segment of a kind: hall_ticket → hall-ticket. */
export const kindSlug = (k: Kind) => k.replaceAll('_', '-');
export const kindFromSlug = (s: string): Kind | null => (KINDS as readonly string[]).includes(s.replaceAll('-', '_')) ? (s.replaceAll('-', '_') as Kind) : null;
export const reportFromSlug = (s: string): Report | null => (REPORTS as readonly string[]).includes(s.replaceAll('-', '_')) ? (s.replaceAll('-', '_') as Report) : null;
export const recordHref = (k: Kind, id: string) => `/exams/office/${kindSlug(k)}/${id}`;

export type Format = 'date' | 'datetime' | 'money' | 'percent' | 'status' | 'text';
export type Cell = string | number | boolean | null;
export interface Fact {
  key: string;
  value: Cell;
  format?: Format;
}
export interface ColumnSpec {
  key: string;
  format?: Format;
}
export type Row = Record<string, Cell> & { _id?: string; _kind?: Kind };
export interface RecordAction {
  key: string;
  input?: 'comment' | 'receipt' | 'marks' | 'datetime' | 'absentees' | 'moderation';
  blocked?: string;
  tone?: 'primary' | 'outline' | 'danger';
}
export interface RecordView {
  kind: Kind;
  id: string;
  title: string;
  subtitle: string | null;
  status: { key: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' };
  facts: Fact[];
  overview: Fact[];
  related: { key: string; columns: ColumnSpec[]; rows: Row[] }[];
  steps: { key: string; state: 'done' | 'current' | 'upcoming' | 'rejected'; by: string | null; at: string | null; note: string | null }[] | null;
  approval: { key: string; canDecide: boolean } | null;
  actions: RecordAction[];
  documents: { key: string; href: string }[];
  activity: { id: string; at: string; actor: string; action: string; note: string | null }[];
  candidates?: { id: string; name: string; rollNo: string; status: string }[];
  sessionId?: string;
}
export interface ListRow {
  id: string;
  title: string;
  ref: string | null;
  session: string | null;
  status: string;
  date: string | null;
}
export interface ReportData {
  columns: ColumnSpec[];
  rows: Row[];
}
export interface OverviewSession {
  id: string;
  name: string;
  status: string;
  programme: string;
  starts_on: string;
  ends_on: string;
  stage: string | null;
  pending: boolean;
  done: number;
  total: number;
  candidates: number;
  feeOpen: number;
  scriptsOpen: number;
  moderationsOpen: number;
  revaluationsOpen: number;
}
export interface Overview {
  sessions: OverviewSession[];
  counts: Record<string, number>;
}
export interface OfficeSettings {
  hallTicketSeries: NumberingSeries & { suffix: string };
  certificateSeries: NumberingSeries & { suffix: string };
  qpSeries: NumberingSeries & { suffix: string };
  defaultGradeScaleId: string | null;
  grace: { maxPerSubject: number; maxTotal: number; onlyToPass: boolean };
  moderation: { maxAddMarks: number; maxScalePercent: number; doubleValuationGapPercent: number };
  revaluation: { windowDays: number; revaluationFeePaise: number; retotallingFeePaise: number; photocopyFeePaise: number };
  examFees: { perPaperPaise: number; supplementaryPerPaperPaise: number; minimumPaise: number; lateFeePaise: number };
  qpReleaseMinutes: number;
}

const humanize = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replaceAll('_', ' ').replaceAll('.', ' · ');

/** The dictionary text of `prefix + key`, or the key made readable when the dictionary has none (data such as a subject code). */
export function label(t: TFunction, prefix: string, key: string): string {
  const k = `${prefix}${key}`;
  const v = t(k as MessageKey);
  return v === k ? humanize(key) : v;
}

/** A cell as text: dates and money formatted, statuses translated. */
export function show(t: TFunction, fmt: Fmt, value: Cell | undefined, format?: Format): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'date':
      return fmt.date(String(value).slice(0, 10), 'short');
    case 'datetime':
      return fmt.dateTime(String(value));
    case 'money':
      return fmt.rupees(Number(value));
    case 'percent':
      return `${fmt.number(Number(value), { maximumFractionDigits: 2 })}%`;
    case 'status':
      return label(t, 'xo.s.', String(value));
    default:
      return String(value);
  }
}

export const toneOf = (status: string): RecordView['status']['tone'] =>
  ['done', 'approved', 'published', 'registered', 'issued', 'paid', 'present', 'completed', 'released', 'applied', 'finalised', 'pass', 'active'].includes(status)
    ? 'success'
    : ['rejected', 'ineligible', 'blocked', 'absent', 'debarred', 'fail', 'reported', 'penalised'].includes(status)
      ? 'danger'
      : ['pending', 'requested', 'scrutiny', 'proposed', 'due', 'accepted', 'processed', 'submitted', 'needs_third'].includes(status)
        ? 'warning'
        : ['locked', 'scheduled', 'allocated', 'valued'].includes(status)
          ? 'info'
          : 'neutral';
