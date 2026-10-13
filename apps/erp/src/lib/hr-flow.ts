// HR and payroll workflow shapes (services/api/src/hr/hr-workflows.controller.ts, hr-reports.controller.ts) and helpers for record pages.
import type { ActivityItem, WorkflowStep } from '@/components/templates';

export interface HrHistoryRow {
  id: string;
  at: string;
  action: string;
  actor: string;
  data: unknown;
}

export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'closed';
export interface StaffLoan {
  id: string;
  loanNo: string;
  user: { id: string; fullName: string };
  kind: 'advance' | 'loan';
  amountPaise: number;
  installments: number;
  emiPaise: number;
  startMonth: string;
  purpose: string;
  status: LoanStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  recoveredPaise: number;
  outstandingPaise: number;
  schedule: { month: string; amountPaise: number; recovered: boolean }[];
}

export interface LeaveEncashment {
  id: string;
  user: { id: string; fullName: string };
  leaveType: { id: string; code: string; name: string };
  year: number;
  days: number;
  amountPaise: number;
  payMonth: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface ServiceBookEntry {
  id: string;
  kind: string;
  onDate: string;
  title: string;
  details: string;
  orderNo: string | null;
  source: string;
}

export interface Series {
  prefix: string;
  next: number;
  digits: number;
  suffix: string;
}
export interface HrModuleSettings {
  employeeSeries: Series;
  payslipSeries: Series;
  leaveLevels: 1 | 2;
  encashment: { maxDaysPerYear: number; minBalanceAfter: number };
  attendance: { officeStart: string; graceMinutes: number; halfDayAfterMinutes: number; minHoursFullDay: number };
  loans: { maxInstallments: number; maxAdvancePaise: number; maxLoanPaise: number };
  preview: { employeeCode: string; payslipNo: string };
}

export const HR_REPORTS = ['staff-strength', 'attendance-register', 'leave-register', 'leave-balances', 'payroll-register', 'salary-statement', 'pf', 'esi', 'pt', 'tds', 'bank-transfer', 'form16', 'appraisal-summary', 'fdp-summary', 'attrition'] as const;
export type HrReportKind = (typeof HR_REPORTS)[number];
export interface HrReport {
  kind: HrReportKind;
  filters: { month: string; fy: number; year: number; departmentId: string | null };
  columns: string[];
  rows: Record<string, string | number | null>[];
}
/** Which filters each report reads. */
export const REPORT_FILTERS: Record<HrReportKind, ('month' | 'fy' | 'year')[]> = {
  'staff-strength': [],
  'attendance-register': ['month'],
  'leave-register': ['year'],
  'leave-balances': ['year'],
  'payroll-register': ['month'],
  'salary-statement': ['fy'],
  pf: ['month'],
  esi: ['month'],
  pt: ['month'],
  tds: ['month'],
  'bank-transfer': ['month'],
  form16: ['fy'],
  'appraisal-summary': [],
  'fdp-summary': ['fy'],
  attrition: ['fy'],
};

/** The verbs at the end of audit actions that have a translation (hf.verb.<verb>); others are shown as they are. */
export const HISTORY_VERBS = ['created', 'updated', 'requested', 'recommended', 'approved', 'rejected', 'cancelled', 'verified', 'locked', 'reopened', 'published', 'recomputed', 'export_bank', 'export_pf', 'export_esi', 'export_pt', 'export_tds', 'export_tally', 'payslip_downloaded', 'staff_created', 'staff_updated', 'service_book_entry', 'requisition_raised', 'requisition_approved', 'requisition_rejected', 'opening_created', 'run_created', 'run_verified', 'run_approved', 'run_locked', 'run_reopened', 'run_published', 'run_recomputed', 'loan_requested', 'loan_approved', 'loan_rejected', 'loan_cancelled', 'encashment_requested', 'encashment_approved', 'encashment_rejected'] as const;

export function historyVerb(action: string): string {
  return action.slice(action.indexOf('.') + 1);
}

/** Audit rows as Activity items; `label` turns an action into words. */
export function toActivity(rows: HrHistoryRow[], label: (action: string) => string): ActivityItem[] {
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: label(r.action),
    tone: /rejected|cancelled|withdrawn/.test(r.action) ? 'danger' : /approved|locked|published|confirmed|relieved/.test(r.action) ? 'success' : undefined,
  }));
}

/** The leave steps: applied → (head of department, when two levels) → approval. */
export function leaveSteps(r: { status: string; createdAt: string; user: { fullName: string }; recommendedBy?: { fullName: string } | null; recommendedAt?: string | null; recommendNote?: string | null; decidedBy: { fullName: string } | null; decidedAt: string | null; decisionNote: string | null }, twoLevel: boolean, labels: { applied: string; hod: string; approval: string }): WorkflowStep[] {
  const closed = r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled';
  const steps: WorkflowStep[] = [{ id: 'applied', label: labels.applied, state: 'done', by: r.user.fullName, at: r.createdAt }];
  if (twoLevel || r.recommendedBy) {
    const rejectedAtHod = r.status === 'rejected' && !r.recommendedBy;
    steps.push({ id: 'hod', label: labels.hod, state: r.recommendedBy ? 'done' : rejectedAtHod ? 'rejected' : r.status === 'pending' ? 'current' : closed ? 'skipped' : 'upcoming', by: r.recommendedBy?.fullName ?? (rejectedAtHod ? r.decidedBy?.fullName : undefined), at: r.recommendedAt ?? (rejectedAtHod ? (r.decidedAt ?? undefined) : undefined), note: r.recommendNote ?? (rejectedAtHod ? (r.decisionNote ?? undefined) : undefined) });
    if (rejectedAtHod) return [...steps, { id: 'approval', label: labels.approval, state: 'skipped' }];
  }
  steps.push({ id: 'approval', label: labels.approval, state: r.status === 'approved' ? 'done' : r.status === 'rejected' ? 'rejected' : r.status === 'cancelled' ? 'skipped' : (twoLevel && r.status === 'pending') ? 'upcoming' : 'current', by: r.decidedBy?.fullName, at: r.decidedAt ?? undefined, note: r.decisionNote ?? undefined });
  return steps;
}

/** The payroll run steps: prepare → verify → approve → lock → bank file → publish. */
export function runSteps(run: { status: string; createdAt: string; verifiedAt?: string | null; approvedAt: string | null; lockedAt: string | null; bankFileAt?: string | null; publishedAt?: string | null }, labels: Record<'prepare' | 'verify' | 'approve' | 'lock' | 'bank' | 'publish', string>): WorkflowStep[] {
  const order = ['draft', 'verified', 'approved', 'locked'];
  const at = order.indexOf(run.status);
  const st = (i: number, done: boolean): WorkflowStep['state'] => (done ? 'done' : i === at + 1 ? 'current' : 'upcoming');
  return [
    { id: 'prepare', label: labels.prepare, state: 'done', at: run.createdAt },
    { id: 'verify', label: labels.verify, state: st(1, at >= 1), at: run.verifiedAt ?? undefined },
    { id: 'approve', label: labels.approve, state: st(2, at >= 2), at: run.approvedAt ?? undefined },
    { id: 'lock', label: labels.lock, state: st(3, at >= 3), at: run.lockedAt ?? undefined },
    { id: 'bank', label: labels.bank, state: run.bankFileAt ? 'done' : at >= 2 ? 'current' : 'upcoming', at: run.bankFileAt ?? undefined },
    { id: 'publish', label: labels.publish, state: run.publishedAt ? 'done' : at === 3 ? 'current' : 'upcoming', at: run.publishedAt ?? undefined },
  ];
}

/** Steps along an ordered status list: every status up to the current one is done and the next is current. A failed status rejects the second step. */
export function linearSteps(order: string[], status: string, labels: (s: string) => string, failed: string[] = []): WorkflowStep[] {
  const i = order.indexOf(status);
  return order.map((s, k) => ({ id: s, label: labels(s), state: failed.includes(status) ? (k === 0 ? 'done' : k === 1 ? 'rejected' : 'skipped') : k <= i ? 'done' : k === i + 1 ? 'current' : 'upcoming' }));
}
