// Admissions CRM and student lifecycle: the shapes of services/api's v1/admissions/*, v1/students/*
// and v1/public/admissions/* responses, and the few rules the UI needs to show only valid actions.
// The API enforces every rule; the stage moves mirror packages/shared/src/admissions.ts.

export const ENQUIRY_STAGES = ['new', 'contacted', 'counselling', 'applied', 'lost', 'deferred', 'converted'] as const;
export type EnquiryStage = (typeof ENQUIRY_STAGES)[number];

export const ENQUIRY_STAGE_MOVES: Record<EnquiryStage, readonly EnquiryStage[]> = {
  new: ['contacted', 'counselling', 'applied', 'lost', 'deferred'],
  contacted: ['counselling', 'applied', 'lost', 'deferred'],
  counselling: ['contacted', 'applied', 'lost', 'deferred'],
  applied: ['counselling', 'lost', 'deferred'],
  converted: [],
  lost: ['contacted', 'counselling'],
  deferred: ['contacted', 'counselling', 'lost'],
};

export const ENQUIRY_SOURCES = ['web', 'walk_in', 'phone', 'campaign', 'referral'] as const;
export const ACTIVITY_KINDS = ['call', 'visit', 'email', 'sms', 'whatsapp', 'note'] as const;
export const APPLICATION_STATUSES = ['submitted', 'under_review', 'eligible', 'ineligible', 'waitlisted', 'offered', 'accepted', 'declined', 'rejected', 'enrolled', 'withdrawn', 'correction_requested'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
/** Moves that need a written reason (APPLICATION_REASON_REQUIRED). */
export const APPLICATION_REASON_REQUIRED: readonly string[] = ['rejected', 'ineligible', 'withdrawn', 'eligible', 'correction_requested'];
export const STUDENT_STATUSES = ['applicant', 'enrolled', 'active', 'on_leave', 'detained', 'promoted', 'transferred', 'alumni', 'dropped', 'suspended', 'expelled', 'deceased', 'deferred'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
/** Changes that need a written reason (STUDENT_REASON_REQUIRED). */
export const STUDENT_REASON_REQUIRED: readonly string[] = ['on_leave', 'detained', 'transferred', 'dropped', 'suspended', 'expelled', 'deceased', 'deferred'];
/** Statuses that ask when the student returns (a leave of absence needs it; a suspension may have it). */
export const STUDENT_RETURN_STATUSES: readonly string[] = ['on_leave', 'suspended', 'deferred'];
/** Statuses a student can be readmitted from. */
export const STUDENT_READMIT_FROM: readonly string[] = ['dropped', 'transferred', 'expelled'];

export type Tone = 'default' | 'info' | 'success' | 'warning' | 'error';
export const applicationTone = (s: string): Tone =>
  s === 'enrolled' || s === 'accepted' ? 'success' : s === 'offered' || s === 'eligible' ? 'info' : s === 'rejected' || s === 'ineligible' || s === 'declined' || s === 'withdrawn' ? 'error' : s === 'waitlisted' || s === 'correction_requested' ? 'warning' : 'default';
export const studentTone = (s: string): Tone =>
  s === 'active' || s === 'enrolled' ? 'success' : s === 'on_leave' || s === 'detained' || s === 'promoted' || s === 'suspended' || s === 'deferred' ? 'warning' : s === 'transferred' || s === 'dropped' || s === 'expelled' || s === 'deceased' ? 'error' : s === 'alumni' ? 'info' : 'default';

export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  programId: string | null;
  programName: string | null;
  source: string;
  stage: EnquiryStage;
  counsellorId: string | null;
  counsellorName: string | null;
  message: string | null;
  lostReason: string | null;
  nextFollowUpOn: string | null;
  /** Rule-based lead score, 0 to 100. */
  leadScore: number;
  createdAt: string;
}
export interface EnquiryDetail extends Enquiry {
  activities: { id: string; kind: string; note: string; nextFollowUpOn: string | null; actorName: string | null; createdAt: string }[];
}
export interface Pipeline {
  stages: Record<string, number>;
  followUpsDue: number;
  newThisWeek: number;
}
export interface Counsellor {
  id: string;
  fullName: string;
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'email' | 'phone';
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
}
export interface DocSpec {
  key: string;
  label: string;
  required: boolean;
}
export interface CycleRow {
  id: string;
  name: string;
  programId: string;
  programName: string;
  yearLabel: string;
  status: 'draft' | 'open' | 'closed';
  entryTerm: number;
  seats: number;
  seatsLeft: number;
  opensOn: string;
  closesOn: string;
  applicationFeePaise: number;
  counts: Record<string, number>;
}
export interface CycleDetail extends CycleRow {
  formFields: FormField[];
  documents: DocSpec[];
  meritRules: { field: string; weight: number }[];
  eligibility: Record<string, unknown>;
}
export interface MeritListSummary {
  id: string;
  version: number;
  seats: number;
  ranked: number;
  publishedAt: string | null;
  createdAt: string;
}
export interface MeritListDetail {
  id: string;
  version: number;
  seats: number;
  publishedAt: string | null;
  entries: { applicationId: string; rank: number; score: number; decision: 'offer' | 'waitlist'; applicationNo?: string; applicantName?: string; status?: string }[];
}
export interface ApplicationRow {
  id: string;
  applicationNo: string;
  applicantName: string;
  phone: string;
  status: ApplicationStatus;
  feeStatus: string;
  meritScore: number | null;
  meritRank: number | null;
  submittedAt: string;
  cycleId: string;
  cycleName: string;
}
export interface ApplicationDetail extends Omit<ApplicationRow, 'cycleName'> {
  dateOfBirth: string | null;
  email: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  guardianRelation: string;
  answers: Record<string, string | number>;
  statusReason: string | null;
  offerExpiresOn: string | null;
  studentId: string | null;
  eligibilityNotes: string[];
  eligibilityCheck: string[];
  liveMeritScore: number;
  allowedStatuses: ApplicationStatus[];
  cycle: { id: string; name: string; programId: string; entryTerm: number; applicationFeePaise: number; formFields: FormField[]; documents: DocSpec[] };
  documents: { id: string; docKey: string; fileName: string; contentType: string; sizeBytes: number; status: 'pending' | 'verified' | 'rejected'; reviewNote: string | null; uploadedAt: string }[];
  payments: { id: string; amountPaise: number; method: string; status: string; receiptNo: string | null; reference: string | null; paidAt: string | null }[];
  history: { action: string; data: Record<string, unknown> | null; at: string; actorName: string | null }[];
}

export interface PublicCycles {
  institution: string;
  programs: { id: string; name: string }[];
  cycles: { id: string; name: string; programId: string; programName: string; closesOn: string; applicationFeePaise: number; formFields: FormField[]; documents: DocSpec[] }[];
}
export interface PublicApplication {
  id: string;
  institution: string;
  applicationNo: string;
  applicantName: string;
  /** Set only on the corrections screen, from the application view. */
  dateOfBirth?: string | null;
  cycleName: string;
  status: ApplicationStatus;
  statusReason: string | null;
  feeStatus: string;
  feeDuePaise: number;
  receiptNo: string | null;
  meritRank: number | null;
  offerExpiresOn: string | null;
  documents: { key: string; label: string; required: boolean; uploaded: boolean; fileName: string | null; status: string | null; reviewNote: string | null }[];
  submittedAt: string;
}

export interface StudentRow {
  id: string;
  fullName: string;
  rollNo: string;
  status: StudentStatus;
  sectionId: string;
  className: string;
}
export interface LifecycleEventRow {
  id: string;
  kind: 'status' | 'promotion' | 'section' | 'guardian';
  fromStatus: StudentStatus | null;
  toStatus: StudentStatus | null;
  fromSection: string | null;
  toSection: string | null;
  reason: string | null;
  effectiveOn: string;
  returnOn?: string | null;
  approverName?: string | null;
  certificateId?: string | null;
  batchId: string | null;
  actorName: string | null;
  at: string;
}
export interface StudentProfile {
  id: string;
  fullName: string;
  rollNo: string;
  status: StudentStatus;
  enrolledOn: string | null;
  section: { id: string; displayName: string; term: number };
  program: { id: string; name: string; termCount: number };
  finalTerm: boolean;
  allowedStatuses: StudentStatus[];
  guardians: { id: string; fullName: string; phone: string | null; email: string | null; relation: string; isPrimary: boolean; isEmergencyContact: boolean }[];
  application: { id: string; applicationNo: string; cycleName: string } | null;
  timeline: LifecycleEventRow[];
}
export interface PromotionResult {
  dryRun: boolean;
  batchId: string | null;
  promoted: number;
  detained: number;
  graduated: number;
  skipped: number;
  sections: { from: string; to: string | null }[];
}
