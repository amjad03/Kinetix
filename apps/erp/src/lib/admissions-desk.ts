// The admissions desk: shapes of v1/admissions/desk/*, enquiry duplicates, approval requests, refund quotes, the
// custody register and the application desk panel (services/api/src/admissions/desk).

export interface DuplicateEnquiry {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  programName: string | null;
  createdAt: string;
  reasons: string[];
}

export interface RefundQuote {
  lastDate: string;
  on: string;
  paidPaise: number;
  daysFromLastDate: number;
  slab: string | null;
  percent: number;
  deductionPaise: number;
  refundPaise: number;
}

export interface AdmissionRequest {
  id: string;
  kind: 'management_quota' | 'cancellation' | 'programme_change';
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  data: Record<string, unknown>;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface CustodyItem {
  id: string;
  document: string;
  referenceNo: string | null;
  receivedOn: string;
  status: 'held' | 'returned';
  returnedOn: string | null;
  returnedTo: string | null;
  acknowledgement: string | null;
}

export interface ScholarshipCheck {
  category: string | null;
  percentage: number | null;
  familyIncomePaise: number | null;
  schemes: { id: string; name: string; kind: 'percent' | 'fixed'; value: number; verdict: 'likely' | 'not_eligible' | 'unknown'; reasons: string[] }[];
}

export interface ApplicationDesk {
  requests: AdmissionRequest[];
  custody: CustodyItem[];
  refund: RefundQuote;
  changeTargets: { id: string; name: string; programName: string; seats: number; seatsLeft: number }[];
  scholarships: ScholarshipCheck;
  canDecide: boolean;
}

export interface Funnel {
  from: string;
  to: string;
  now: { enquiries: number; applications: number; enrolled: number };
  lastYear: { enquiries: number; applications: number; enrolled: number };
  days: { day: string; enquiries: number; applications: number; enrolled: number }[];
  pendingRequests: number;
  originalsHeld: number;
}

export const ADMISSION_REPORTS = ['daily-register', 'category-stats', 'quota-fill', 'conversion', 'agent-statement', 'counsellors', 'fee-reconciliation', 'drafts'] as const;
export type AdmissionReport = (typeof ADMISSION_REPORTS)[number];

export interface LeadTemplate {
  id: string;
  key: string;
  channel: 'sms' | 'email' | 'whatsapp';
  locale: string;
  usable: boolean;
  problem: string | null;
}
