// Shapes of the examination applications, question paper setting, registers and marks ledger endpoints
// (services/api/src/exam-cell/applications.ts, qp-setting.ts, registers.ts).

export type ApplicationKind = 'regular' | 'backlog' | 'improvement';

export interface ApplicationSubject {
  subjectId: string;
  code: string;
  name: string;
  credits: number;
  kind: ApplicationKind;
  eligible: boolean;
  reasons: string[];
  feePaise: number;
  failedInSessionId: string | null;
  chosen: boolean;
  examDate: string | null;
  startsAt: string | null;
}

export interface ApplicationView {
  session: { id: string; name: string; kind: string; status: string; startsOn: string; endsOn: string };
  student: { id: string; name: string; rollNo: string; section: string };
  window: { opensOn: string; closesOn: string; lateUntil: string | null; state: 'upcoming' | 'open' | 'late' | 'closed' } | null;
  rules: { minAttendancePercent: number; condonableToPercent: number | null; internalEligibilityPercent: number | null; basis: 'per_subject' | 'overall'; source: string };
  blockers: string[];
  subjects: ApplicationSubject[];
  fee: { papersPaise: number; topUpPaise: number; lateFeePaise: number; totalPaise: number; papers: number; lateSlab: string | null; minimumPaise: number };
  application: {
    applicationNo: string | null;
    status: string;
    reasons: string[];
    submittedAt: string;
    fee: { amountPaise: number; status: string; receiptNo: string | null; invoiceId: string | null; invoiceNo: string | null; dueOn: string | null } | null;
  } | null;
  canSubmit: boolean;
}

export interface ApplicationRow {
  studentId: string;
  student: string;
  rollNo: string;
  section: string;
  applicationNo: string | null;
  status: 'registered' | 'ineligible';
  reasons: string[];
  submittedOn: string;
  overridden: boolean;
  regular: number;
  backlog: number;
  improvement: number;
  ineligible: number;
  feePaise: number | null;
  feeStatus: 'due' | 'paid' | 'waived' | null;
  receiptNo: string | null;
  invoiceNo: string | null;
}

export interface QpCoverage {
  totalMarks: number;
  questions: number;
  byCo: Record<string, number>;
  byBloom: Record<string, number>;
  byUnit: Record<string, number>;
  byDifficulty: Record<string, number>;
  higherOrderPercent: number;
}

export interface QpAppointment {
  id: string;
  role: 'setter' | 'moderator';
  userId: string;
  name: string;
  setsRequired: number;
  dueOn: string;
  status: string;
  progress: string;
  overdue: boolean;
  remunerationPaise: number;
  note: string | null;
}

export interface QpSet {
  id: string;
  subjectId: string;
  setLabel: string | null;
  status: 'draft' | 'scrutiny' | 'returned' | 'approved' | 'locked';
  title: string;
  repeats: number;
  coverage: QpCoverage;
  overlapPercent: number;
  drawn: boolean;
  release: { releaseAt: string; status: string } | null;
}

export interface QpSubject {
  subjectId: string;
  code: string;
  name: string;
  examDate: string | null;
  startsAt: string | null;
  appointments: QpAppointment[];
  sets: QpSet[];
  lockedSets: number;
  draw: { paperId: string; setLabel: string | null; drawnAt: string; candidates: number } | null;
  canDraw: boolean;
}

export interface QpOverview {
  session: { id: string; name: string; status: string };
  summary: { subjects: number; withSetter: number; setsLocked: number; drawn: number; overdue: number };
  subjects: QpSubject[];
}

export interface QpCoverageDetail {
  outcomes: string[];
  sets: { paperId: string; setLabel: string | null; status: string; blueprint: { title: string; totalMarks: number } | null; coverage: QpCoverage; gaps: string[] }[];
}

export interface LedgerAttempt {
  sessionId: string;
  session: string;
  kind: string;
  term: number;
  code: string;
  subject: string;
  credits: number;
  percent: number;
  grade: string;
  gradePoint: number;
  grace: number;
  passed: boolean;
  counts: boolean;
}

export interface MarksLedger {
  sessions: { sessionId: string; session: string; kind: string; term: number; startsOn: string; sgpa: number | null; cgpa: number | null; withheld: boolean }[];
  attempts: LedgerAttempt[];
  summary: { subjects: number; cleared: number; backlogs: number; creditsEarned: number; attempts: number; cgpa: number | null };
}

export interface StaffOption {
  id: string;
  fullName: string;
  roles?: string[];
}

/** Rupees with two decimals from paise. */
export const rupees = (paise: number | null | undefined) => (Number(paise ?? 0) / 100).toFixed(2);

/** The coverage of a set as "CO1 6 · CO2 8" (marks per outcome or level), largest first. */
export const spread = (m: Record<string, number>) =>
  Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');

/** The download link of a register through the ERP's download route. */
export const registerHref = (kind: 'exam-attendance-sheet' | 'exam-d-form' | 'exam-tabulation', sessionId: string, paperId?: string, roomId?: string) =>
  `/api/download?kind=${kind}&id=${sessionId}${paperId ? `&paper=${paperId}` : ''}${roomId ? `&room=${roomId}` : ''}`;

/** The backlog and improvement subjects a candidate has chosen (this term's papers are always in). */
export const chosenRepeats = (v: ApplicationView) => v.subjects.filter((s) => s.kind !== 'regular' && s.chosen).map((s) => s.subjectId);

/** What an application would cost for a choice, by the same rule as the API: eligible papers, the minimum, the late fee. */
export function feeFor(v: ApplicationView, chosen: Set<string>): number {
  const counted = v.subjects.filter((s) => s.eligible && (s.kind === 'regular' || chosen.has(s.subjectId)));
  if (!counted.length) return 0;
  const papers = counted.reduce((a, s) => a + s.feePaise, 0);
  return Math.max(papers, v.fee.minimumPaise) + v.fee.lateFeePaise;
}
