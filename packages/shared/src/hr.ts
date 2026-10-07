/**
 * HR, payroll and documents/certificates contracts (services/api/src/hr, src/documents).
 * Amounts are integer paise; dates are YYYY-MM-DD; months are YYYY-MM; times are ISO instants.
 * See docs/architecture/hr-payroll.md and docs/architecture/documents-certificates.md.
 */

export type EmploymentType = 'permanent' | 'contract' | 'probation' | 'visiting';
export type StaffStatus = 'active' | 'on_notice' | 'exited';
export type TaxRegime = 'new' | 'old';

export interface Designation {
  id: string;
  name: string;
  grade: string | null;
}

/** A row of the staff directory (GET /v1/hr/staff). */
export interface StaffSummary {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  /** Null until HR fills in the employment record. */
  employeeCode: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
  employmentType: EmploymentType | null;
  status: StaffStatus | null;
  dateOfJoining: string | null;
}

export interface BankDetailsView {
  accountHolder: string;
  bankName: string;
  ifsc: string;
  /** Only the last four digits ever leave the server (outside the bank-transfer export). */
  accountLast4: string;
}

/** GET /v1/hr/staff/:userId and GET /v1/hr/me. */
export interface StaffProfile extends StaffSummary {
  dateOfLeaving: string | null;
  gender: 'female' | 'male' | 'other' | null;
  dateOfBirth: string | null;
  pan: string | null;
  uan: string | null;
  esiNumber: string | null;
  taxRegime: TaxRegime;
  tax80cPaise: number;
  taxOtherDeductionsPaise: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  bank: BankDetailsView | null;
  /** For optimistic concurrency: send back as expectedVersion. 0 = no record yet. */
  version: number;
}

export type StaffAttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave';
export type StaffAttendanceSource = 'app' | 'manual' | 'biometric';

export interface StaffAttendanceDay {
  date: string;
  status: StaffAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: StaffAttendanceSource;
  note: string | null;
}

/** GET /v1/hr/attendance?date=: every staff member, marked or not. */
export interface StaffAttendanceRow {
  userId: string;
  fullName: string;
  employeeCode: string | null;
  status: StaffAttendanceStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  source: StaffAttendanceSource | null;
  /** An approved leave covers this day. */
  onLeave: boolean;
}

export interface AttendanceImportResult {
  imported: number;
  errors: { line: number; error: string }[];
}

export interface StaffAttendanceSummary {
  userId: string;
  fullName: string;
  employeeCode: string | null;
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  /** As payroll will count them this month. */
  lopDays: number;
}

export type LeaveAccrual = 'yearly' | 'monthly';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  annualDays: number;
  accrual: LeaveAccrual;
  carryForwardMax: number;
  active: boolean;
}

export interface LeaveBalance {
  leaveType: Pick<LeaveType, 'id' | 'code' | 'name' | 'paid'>;
  year: number;
  opening: number;
  accrued: number;
  used: number;
  pending: number;
  /** opening + accrued − used − pending (unpaid types: not limited). */
  available: number;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  user: { id: string; fullName: string };
  leaveType: Pick<LeaveType, 'id' | 'code' | 'name' | 'paid'>;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  /** Working days (weekly offs and holidays excluded). */
  days: number;
  reason: string;
  status: LeaveStatus;
  decidedBy: { id: string; fullName: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface Holiday {
  date: string;
  title: string;
}

export type OpeningStatus = 'open' | 'on_hold' | 'closed';
export type ApplicantStage = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';

export interface JobOpening {
  id: string;
  title: string;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
  positions: number;
  description: string;
  status: OpeningStatus;
  closesOn: string | null;
  /** Applicants per stage. */
  pipeline: Partial<Record<ApplicantStage, number>>;
  createdAt: string;
}

export interface JobApplicant {
  id: string;
  openingId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string;
  stage: ApplicantStage;
  stageHistory: { stage: ApplicantStage; at: string; by: string; note?: string }[];
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------------------------

export type SalaryComponentKind = 'earning' | 'deduction';

export interface SalaryComponent {
  id: string;
  code: string;
  name: string;
  kind: SalaryComponentKind;
  /** Counts toward the PF wage (Basic, DA). */
  pfWage: boolean;
  /** Earnings: part of taxable income. */
  taxable: boolean;
  active: boolean;
  sortOrder: number;
}

export interface SalaryStructure {
  userId: string;
  effectiveFrom: string;
  lines: { componentId: string; code: string; name: string; kind: SalaryComponentKind; monthlyPaise: number }[];
  /** Monthly earnings before deductions. */
  monthlyGrossPaise: number;
}

export interface PtSlab {
  minGrossPaise: number;
  amountPaise: number;
  /** Karnataka collects ₹300 in February. */
  februaryAmountPaise?: number;
}

export interface PayrollSettings {
  pfCapAtCeiling: boolean;
  pfWageCeilingPaise: number;
  esiGrossLimitPaise: number;
  ptState: string;
  ptSlabs: PtSlab[];
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffs: number[];
  ledgers: TallyLedgers;
}

export interface TallyLedgers {
  salaryExpense: string;
  employerPfExpense: string;
  employerEsiExpense: string;
  pfPayable: string;
  esiPayable: string;
  ptPayable: string;
  tdsPayable: string;
  salaryPayable: string;
  otherDeductions: string;
}

export type PayrollRunStatus = 'draft' | 'approved' | 'locked';

export interface PayrollRunSummary {
  id: string;
  month: string;
  status: PayrollRunStatus;
  version: number;
  staffCount: number;
  grossPaise: number;
  deductionsPaise: number;
  netPaise: number;
  employerCostPaise: number;
  createdAt: string;
  approvedAt: string | null;
  lockedAt: string | null;
}

export interface PayslipLine {
  code: string;
  name: string;
  amountPaise: number;
}

export interface Payslip {
  id: string;
  runId: string;
  month: string;
  runStatus: PayrollRunStatus;
  user: { id: string; fullName: string; employeeCode: string | null; designation: string | null; department: string | null };
  daysInMonth: number;
  lopDays: number;
  paidDays: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossPaise: number;
  deductionsPaise: number;
  netPaise: number;
  employer: { epfPaise: number; epsPaise: number; esiPaise: number };
  taxRegime: TaxRegime;
  /** Notes on the TDS projection, for the payslip. */
  annualTaxPaise: number;
}

export interface PayrollRunDetail extends PayrollRunSummary {
  payslips: Payslip[];
  /** Active staff left out (no salary structure). */
  skipped: { userId: string; fullName: string; reason: string }[];
}

// ---------------------------------------------------------------------------------------------
// Documents and certificates
// ---------------------------------------------------------------------------------------------

export type CertificateKind = 'transfer_certificate' | 'bonafide' | 'conduct' | 'study' | 'course_completion' | 'fee_receipt' | 'experience' | 'custom';
export type CertificateSubject = 'student' | 'staff';
export type CertificateStatus = 'requested' | 'approved' | 'rejected' | 'issued' | 'revoked';

export interface CertificateTemplate {
  id: string;
  kind: CertificateKind;
  name: string;
  subjectType: CertificateSubject;
  title: string;
  /** Text with {{placeholders}}; see docs/architecture/documents-certificates.md. */
  body: string;
  /** Extra fields the requester fills in (e.g. "reasonForLeaving"). */
  fields: { key: string; label: string; required: boolean }[];
  serialPrefix: string;
  active: boolean;
  version: number;
}

export interface CertificateRequest {
  id: string;
  template: { id: string; kind: CertificateKind; name: string };
  subjectType: CertificateSubject;
  subject: { id: string; name: string; detail: string | null };
  purpose: string;
  fields: Record<string, string>;
  status: CertificateStatus;
  requestedBy: { id: string; fullName: string };
  decidedBy: { id: string; fullName: string } | null;
  decisionNote: string | null;
  serialNo: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  /** The public verification link encoded in the QR (issued certificates only). */
  verifyUrl: string | null;
  createdAt: string;
}

/** GET /v1/public/verify/:slug/:token (no sign-in). Reveals no more than the certificate shows. */
export interface CertificateVerification {
  status: 'valid' | 'revoked' | 'not_found';
  institution?: string;
  title?: string;
  serialNo?: string;
  subjectName?: string;
  issuedOn?: string;
  revokedOn?: string;
}

export interface IdCardVerification {
  status: 'valid' | 'inactive' | 'not_found';
  institution?: string;
  kind?: 'student' | 'staff';
  name?: string;
  detail?: string;
}

export type VaultOwner = 'student' | 'staff';
/** staff: only office/HR staff see it; owner: the student/family or the staff member too. */
export type VaultVisibility = 'staff' | 'owner';

export interface VaultDocument {
  id: string;
  ownerType: VaultOwner;
  ownerId: string;
  title: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  version: number;
  visibility: VaultVisibility;
  expiresOn: string | null;
  uploadedBy: { id: string; fullName: string };
  createdAt: string;
}
