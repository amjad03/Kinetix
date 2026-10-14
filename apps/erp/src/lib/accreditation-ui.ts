// Shapes returned by /v1/accreditation and small helpers for its pages.

export type Scoring = 'naac' | 'nba' | 'nirf' | 'none';

export interface FrameworkSummary {
  key: string;
  body: 'naac' | 'nba' | 'nirf' | 'aishe' | 'udise';
  title: string;
  variant: string;
  source: string;
  scoring: Scoring;
  years: number;
  criteria: number;
  metrics: number;
  quantitative: number;
  qualitative: number;
  weight: number;
}

export interface YearInput {
  key: string;
  value: number | null;
  source: 'manual' | 'rows' | 'auto' | 'none';
  records: number;
}
export interface YearCell {
  year: string;
  required: boolean;
  entryId: string | null;
  inputs: YearInput[];
  value: number | null;
  source: 'manual' | 'computed' | 'none';
  hasData: boolean;
  rows: number;
  evidence: number;
}
export interface AccTask {
  id: string;
  status: TaskStatus;
  ownerId: string | null;
  ownerName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  dueOn: string | null;
  scope: string;
}
export type TaskStatus = 'assigned' | 'in_progress' | 'submitted' | 'approved' | 'returned';

export interface AccMetric {
  code: string;
  criterion: string;
  indicator: string;
  kind: 'QnM' | 'QlM';
  title: string;
  unit: string;
  weight: number;
  formula: string;
  combine: 'avg' | 'sum' | 'latest' | 'pool';
  yearsRequired: number;
  bench: number | null;
  dir: 'high' | 'low';
  inputs: { key: string; label: string; auto: boolean; source: string | null }[];
  columns: string[];
  evidenceRequired: string[];
  options: { labels: string[]; selected: number[] | null } | null;
  years: YearCell[];
  value: number | null;
  valueSource: 'manual' | 'auto' | 'mixed' | 'none';
  combinedInputs: Record<string, number>;
  narrative: string;
  autoNarrative: string;
  selfScore: number | null;
  note: string;
  score: number | null;
  maxScore: number;
  evidence: number;
  completeness: number;
  complete: boolean;
  task: AccTask | null;
  dvvOpen: number;
}

export interface AccCriterion {
  id: string;
  title: string;
  weight: number;
  metrics: number;
  complete: number;
  completeness: number;
  scored: number;
  score: number | null;
  floor: number | null;
  max: number;
  indicators: { id: string; title: string; weight: number; metrics: string[] }[];
}

export interface AccEstimate {
  scoring: Scoring;
  value: number | null;
  floor: number | null;
  max: number;
  grade: string | null;
  floorGrade: string | null;
  binary: { ready: boolean; reasons: string[] } | null;
}

export interface AccFramework {
  key: string;
  title: string;
  body: string;
  variant: string;
  source: string;
  scoring: Scoring;
  years: number;
}

export interface AccOverview {
  framework: AccFramework;
  cycle: string;
  window: string[];
  criteria: AccCriterion[];
  metrics: AccMetric[];
  completeness: { complete: number; total: number; percent: number };
  estimate: AccEstimate;
}

export interface TaskRow extends Omit<AccTask, 'scope'> {
  scope: string;
  title: string;
  note: string;
  reviewerId: string | null;
  reviewerName: string | null;
  lastRemindedOn: string | null;
  overdue?: boolean;
}

export interface Gap {
  code: string;
  criterion: string;
  title: string;
  kind: 'QnM' | 'QlM';
  weight: number;
  completeness: number;
  reasons: string[];
  owner: string | null;
  dueOn: string | null;
  status: TaskStatus | null;
  impact: number;
}

export interface Readiness {
  framework: AccFramework;
  cycle: string;
  window: string[];
  estimate: AccEstimate;
  completeness: { complete: number; total: number; percent: number };
  criteria: (AccCriterion & { owners: string[]; tasks: number; overdue: number; nextDue: string | null; gaps: number })[];
  gaps: Gap[];
  tasks: TaskRow[];
  dvv: Record<string, number>;
  today: string;
  metrics: BriefMetric[];
}

/** A metric in brief, as the readiness view lists it in the criteria tree. */
export interface BriefMetric {
  code: string;
  criterion: string;
  indicator: string;
  kind: 'QnM' | 'QlM';
  title: string;
  unit: string;
  weight: number;
  value: number | null;
  valueSource: AccMetric['valueSource'];
  score: number | null;
  maxScore: number;
  completeness: number;
  evidence: number;
  yearsRequired: number;
  task: AccTask | null;
  dvvOpen: number;
  options: { count: number; selected: number | null } | null;
  hasNarrative: boolean | null;
}

export interface DvvRow {
  id: string;
  framework: string;
  cycle: string;
  metricCode: string;
  deviation: string;
  query: string;
  heiValue: number | null;
  dvvValue: number | null;
  response: string;
  status: 'open' | 'answered' | 'accepted' | 'rejected' | 'closed';
  dueOn: string | null;
  documents?: number;
  createdAt: string;
}

export interface EvidenceRow {
  id: string;
  title: string;
  url: string | null;
  note: string | null;
  fileName: string | null;
  createdAt: string;
  year: string | null;
}

export interface MetricDetail {
  framework: AccFramework;
  cycle: string;
  window: string[];
  criterion: string;
  indicator: string;
  metric: AccMetric;
  dataRows: { year: string; rows: string[][] }[];
  records: { year: string; input: string; label: string; columns: string[]; rows: (string | number | null)[][]; total: number }[];
  evidence: EvidenceRow[];
  comments: { id: string; body: string; createdAt: string; userId: string | null; author: string | null }[];
  dvv: DvvRow[];
}

export interface People {
  staff: { id: string; name: string; roles: string; department: string }[];
  departments: { id: string; name: string }[];
}

export const BODY_ORDER = ['naac', 'nba', 'nirf', 'aishe', 'udise'] as const;

/** The current cycle and the four before it, for the cycle picker (for example 2026-27 back to 2022-23). */
export function cycleOptions(current: string): { value: string; label: string }[] {
  const start = Number(current.slice(0, 4));
  const out = Array.from({ length: 5 }, (_, i) => {
    const y = start - i;
    const v = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    return { value: v, label: v };
  });
  return out.some((o) => o.value === current) ? out : [{ value: current, label: current }, ...out];
}

/** Where a metric stands: complete, partly done, or nothing yet. */
export type MetricState = 'complete' | 'partial' | 'missing';
export const metricState = (m: Pick<AccMetric, 'completeness'>): MetricState => (m.completeness >= 100 ? 'complete' : m.completeness > 0 ? 'partial' : 'missing');

/** A figure for display: rounded to two decimals, or a dash. */
export const fig = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : String(Math.round(v * 10 ** digits) / 10 ** digits));

/** The download route address for an accreditation file. */
export const accDownload = (fw: string, id: string, cycle?: string) => `/api/download?kind=accreditation&id=${encodeURIComponent(id)}&fw=${encodeURIComponent(fw)}${cycle ? `&cycle=${encodeURIComponent(cycle)}` : ''}`;

/** The exports a framework offers, as download ids. */
export function exportsOf(f: Pick<AccFramework, 'body'>): ('ssr' | 'aqar' | 'xlsx' | 'pack' | 'dvv')[] {
  if (f.body === 'naac') return ['ssr', 'aqar', 'xlsx', 'pack', 'dvv'];
  return ['xlsx', 'pack'];
}
