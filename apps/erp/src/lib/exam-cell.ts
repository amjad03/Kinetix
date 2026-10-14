// The exam cell's desks (sections 5 and 6 of the module depth checklist): the API paths their actions may reach,
// and the shapes of what the pages load.

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The API paths the exam cell's server action may call; anything else is refused. */
export const CELL_PATHS = new RegExp(
  `^/v1/(${[
    `exam-sessions/${ID}/(dry-run|freeze|unfreeze|rollback|unpublish|publish|process|duties/auto|papers/${ID}/reschedule|grace-applications|supplementary|results/${ID}/change)`,
    `result-withholds/${ID}/release`,
    `grace-applications/${ID}/(decide|apply)`,
    `malpractice/${ID}/decide`,
    `revaluations/${ID}/(decide|complete)`,
    `invigilation/duties/${ID}/swap`,
    `invigilation/swaps/${ID}/decide`,
    `answer-sheet-accounts/${ID}/submit`,
    `exam-papers/${ID}/double-entry(/(1|2|resolve|post))?`,
    `valuation-camps/${ID}/(pack|close)`,
    `valuation-bundles/${ID}/(issue|count|return)`,
    `academic-docs/requests/${ID}/(decide|issue|pay|reissue|duplicate)`,
    `record-corrections/${ID}/(decide|apply)`,
    `verification-requests/${ID}/(pay|check|reject)`,
    `assessments/${ID}/attendance-marks`,
    'exam-cell/settings',
  ].join('|')})$`,
);

export const isCellPath = (path: string) => !path.includes('?') && CELL_PATHS.test(path);

/** The registers and analyses (GET /v1/exam-cell/reports/:report). */
export const CELL_REPORTS = ['gazette', 'result_register', 'pass_by_course', 'pass_by_teacher', 'toppers', 'ranks', 'analysis', 'distinctions', 'gold_medals', 'nirf', 'exam_fees', 'withheld', 'pending_certificates', 'remuneration', 'answer_sheets', 'mismatches'] as const;
export type CellReport = (typeof CELL_REPORTS)[number];
/** Reports that need no exam session. */
export const NO_SESSION_REPORTS: CellReport[] = ['pending_certificates', 'remuneration'];

export interface ReportData {
  report: CellReport;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
}

export interface CellSettings {
  attemptPolicy: 'best' | 'latest';
  lateFeeSlabs: { afterDays: number; amountPaise: number; label: string }[];
  attendanceSlabs: { minPercent: number; percentOfMax: number }[];
  rates: { invigilatorPaise: number; chiefPaise: number; valuationPerScriptPaise: number; chiefExaminerPerDayPaise: number };
  perInvigilator: number;
  revaluationThresholdPercent: number | null;
  ranks: { excludeRepeaters: boolean };
  medal: { minCgpa: number; firstAttemptOnly: boolean };
  duplicateFeePaise: number;
  verificationFeePaise: number;
}

export interface SessionOption {
  id: string;
  name: string;
  status: string;
  kind: string;
  startsOn: string;
  frozenAt?: string | null;
}

export interface PaperOption {
  id: string;
  subject: string;
  section: string;
  examDate: string;
  maxMarks: number;
}

export interface EntryCell {
  marks: number | null;
  absent: boolean;
  by: string | null;
}

export interface DoubleEntrySheet {
  paperId: string;
  subject: string;
  code: string;
  maxMarks: number;
  rows: { studentId: string; rollNo: string; name: string; first: EntryCell | null; second: EntryCell | null; status: 'pending' | 'matched' | 'mismatch' | 'resolved'; resolved: (EntryCell & { note: string | null }) | null; posted: boolean }[];
  summary: { candidates: number; pending: number; matched: number; mismatch: number; resolved: number; posted: number };
}

export interface ResultRun {
  id: string;
  kind: string;
  summary: Record<string, unknown>;
  note: string | null;
  by: string | null;
  at: string;
}

export interface DryRunResult {
  runId: string;
  problems: string[];
  students: number;
  passed: number;
  failed: number;
  changed: number;
  changes: { studentId: string; rollNo?: string; name?: string; kind: 'new' | 'changed' | 'removed'; before: { sgpa: number; outcome: string } | null; after: { sgpa: number; outcome: string } | null; subjects: { subjectId: string; code: string; before: string | null; after: string | null }[] }[];
}

export interface RevisionRow {
  id: string;
  studentId: string;
  rollNo: string;
  name: string;
  version: number;
  kind: string;
  reason: string;
  sgpaBefore: number | null;
  sgpaAfter: number | null;
  by: string | null;
  at: string;
}

export interface SwapRow {
  id: string;
  status: string;
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  dutyDate: string;
  startsAt: string;
  room: string;
  requestedBy: string;
  swapWith: string;
  onDuty: string;
}

/** Rupees typed in a form as paise. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
