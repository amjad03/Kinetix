// Types and small helpers for the governance, billing, AI audit and integrity desks (migration 0120).

export const RULE_DOMAINS = ['grading', 'credits', 'eligibility', 'quota', 'obe', 'attendance', 'fees', 'other'] as const;
export const INCIDENT_SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'] as const;
export const INCIDENT_CATEGORIES = ['security', 'data_breach', 'outage', 'data_quality', 'safety', 'other'] as const;
export const INCIDENT_STATUSES = ['open', 'investigating', 'mitigated', 'resolved', 'closed'] as const;

export interface BusinessRule {
  id: string;
  domain: string;
  key: string;
  version: number;
  title: string;
  description: string;
  params: Record<string, unknown>;
  status: 'draft' | 'in_review' | 'approved' | 'retired';
  effectiveFrom: string;
  effectiveTo: string | null;
  authorId: string;
  approverId: string | null;
  approvedAt: string | null;
}

export interface Incident {
  id: string;
  title: string;
  severity: string;
  category: string;
  status: string;
  description: string;
  impact: string;
  detectedAt: string;
  resolvedAt: string | null;
  personalDataInvolved: boolean;
  regulatorNotifiedAt: string | null;
  regulatorDeadline: string | null;
  regulatorOverdue?: boolean;
  rootCause: string | null;
  correctiveActions: string | null;
  timeline?: { id: string; kind: string; body: string; statusAfter: string | null; author: string; createdAt: string }[];
}

export interface RetentionPolicy {
  id: string;
  category: string;
  retainMonths: number;
  note: string;
}
export interface DueFile {
  id: string;
  title: string;
  category: string;
  ownerType: string;
  createdAt: string;
  retainMonths: number;
}

export interface SaasPlan {
  code: string;
  name: string;
  perStudentPaise: number;
  minStudents: number;
  includedAiCalls: number;
  includedStorageMb: number;
  boards: number;
  features: string[];
}
export interface SaasUsage {
  students: number;
  staff: number;
  boards: number;
  aiCalls: number;
  storageMb: number;
}
export interface SaasInvoiceLine {
  label: string;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
}
export interface SaasInvoice {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  planCode: string;
  lines: SaasInvoiceLine[];
  subtotalPaise: number;
  taxPaise: number;
  taxBreakdown: { cgstPaise: number; sgstPaise: number; igstPaise: number; ratePercent: number };
  totalPaise: number;
  status: 'issued' | 'paid' | 'void';
  issuedOn: string;
  dueOn: string;
  paidOn: string | null;
}
export interface SaasSubscriptionView {
  subscription: {
    id: string;
    planCode: string;
    interval: 'month' | 'year';
    status: 'trial' | 'active' | 'past_due' | 'cancelled';
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsOn: string | null;
    autoRenew: boolean;
    billingStateCode: string;
    gstin: string | null;
  } | null;
  plan: SaasPlan | null;
  usage: SaasUsage;
  estimate: { lines: SaasInvoiceLine[]; subtotalPaise: number; taxPaise: number; totalPaise: number; taxBreakdown: SaasInvoice['taxBreakdown'] } | null;
}

export interface AiActionRow {
  id: string;
  task: string;
  surface: string;
  user: string | null;
  inputPreview: string;
  outputPreview: string;
  sources: { title: string }[];
  provider: string;
  model: string;
  decision: string | null;
  createdAt: string;
}
export interface AiActionSummary {
  bySurface: { surface: string; n: number }[];
  byDecision: { decision: string; n: number }[];
}
export interface EvalCase {
  id: string;
  name: string;
  task: string;
  input: Record<string, unknown>;
  mustInclude: string[];
  mustNotInclude: string[];
  maxChars: number | null;
  active: boolean;
}
export interface EvalRun {
  id: string;
  provider: string;
  model: string;
  passed: number;
  failed: number;
  createdAt: string;
  results: { caseId: string; name: string; passed: boolean; failures: string[]; chars: number }[];
}

export interface IntegrityReport {
  check: { id: string; threshold: number; compared: number; flagged: number; createdAt: string } | null;
  homework?: { id: string; title: string };
  matches: { id: string; student: string | null; studentRollNo: string | null; matchedStudent: string | null; matchedRollNo: string | null; similarity: number; sharedPhrase: string; reviewed: string | null }[];
}

export const rupees = (paise: number) => Math.round(paise / 100);
