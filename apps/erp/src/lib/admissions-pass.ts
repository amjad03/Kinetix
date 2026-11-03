/** Shapes of the admissions pass API (reservation matrix, checklist, enrolment, broadcasts, returns). */

export interface MatrixRow {
  option: string;
  seatType: string;
  category: string;
  supernumerary: boolean;
  horizontal: Record<string, number>;
  horizontalHeld: Record<string, number>;
  seats: number;
  held: number;
  outside: number;
  left: number;
}

export interface Conversion {
  id: string;
  afterRound: number;
  optionLabel: string;
  fromSeatType: string;
  fromCategory: string;
  toSeatType: string;
  toCategory: string;
  seats: number;
  reason: string;
  createdAt: string;
}

export interface Matrix {
  cycleId: string;
  rows: MatrixRow[];
  totals: { intake: number; supernumerary: number; held: number; left: number; bySeatType: Record<string, { seats: number; left: number }> };
  conversions: Conversion[];
}

export interface SeatPlan {
  options: { label: string; intake: number }[];
  seatTypes: { seatType: string; percent: number }[];
  reservation: { appliesTo: string[]; categories: { key: string; percent: number }[] };
  horizontal: { appliesTo: string[]; kinds: { kind: string; percent: number }[] };
  supernumerary: { kind: string; percent: number; seatType: string }[];
}

export interface PassCatalog {
  seatTypes: { key: string; label: string }[];
  categories: { key: string; label: string; percent: number | null }[];
  horizontalKinds: string[];
  supernumeraryKinds: string[];
  planPresets: { key: string; label: string; source: string; plan: Omit<SeatPlan, 'options'> }[];
  eligibilityPresets: { key: string; label: string; profiles: string[]; source: string }[];
  entrancePresets: { key: string; label: string; exam: string }[];
  exams: string[];
  tfwIncomeLimitPaise: number;
}

export interface EligibilityOptions {
  profile: { code: string; name: string; scheme: string } | null;
  presets: { key: string; label: string; source: string; minPercent: number; relaxed: { categories: string[]; minPercent: number } | null; qualifyingLabels: string[] }[];
  chosen: { key: string; label: string } | null;
}

export interface ChecklistItem {
  id: string;
  itemKey: string;
  label: string;
  required: boolean;
  original: boolean;
  why: string | null;
  status: 'pending' | 'received' | 'verified' | 'deferred' | 'waived';
  dueOn: string | null;
  referenceNo: string | null;
  note: string | null;
}

export interface Checklist {
  applicationId: string;
  applicationNo: string;
  provisional: boolean;
  provisionalUntil: string | null;
  confirmedAt: string | null;
  items: ChecklistItem[];
  complete: boolean;
  open: string[];
  overdue: string[];
  provisionalOk: boolean;
}

export interface AdmitResult {
  studentId: string;
  className: string;
  rollNo: string;
  registerNo: string | null;
  provisional: boolean;
  fees: { structure: string; amountPaise: number; dueOn: string }[];
  credentials: { role: string; channel: string; destination: string; status: string; error?: string }[];
}

export interface ProgrammeSetting {
  programId: string;
  programme: string;
  level: string;
  branchCode: string | null;
  sanctionedIntake: number | null;
  approvalBody: string | null;
  approvalRef: string | null;
  approvalValidTo: string | null;
}

export interface Broadcast {
  id: string;
  template: string;
  channel: string;
  status: string;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface ApprovalRow {
  slNo: number;
  programme: string;
  applicationNo: string;
  registerNo: string | null;
  name: string;
  gender: string | null;
  dateOfBirth: string | null;
  category: string;
  seatType: string;
  admissionType: string;
  qualifying: string;
  qualifyingPercent: number | null;
  entrance: string | null;
  admittedOn: string | null;
  provisional: boolean;
  eligibilityCertificate: string;
}

export interface IntakeRow {
  programId: string;
  programme: string;
  sanctionedIntake: number | null;
  approvalRef: string | null;
  admitted: number;
  bySeatType: Record<string, number>;
  lateral: number;
  transfer: number;
  supernumerary: number;
  vacant: number | null;
  fillPercent: number | null;
}

type G = { male: number; female: number; transgender?: number };
export interface AisheRow {
  programme: string;
  general: G;
  ews: G;
  sc: G;
  st: G;
  obc: G;
  total: G;
  pwd: G;
  muslimMinority: G;
  otherMinority: G;
  foreign: G;
}

export interface PublicStatus {
  applicationNo: string;
  applicant: string;
  programme: string;
  cycle: string;
  status: string;
  statusLabel: string;
  next: string;
  steps: { key: string; label: string; done: boolean; at?: string }[];
  pendingDocuments: { label: string; dueOn: string | null }[];
  offerExpiresOn: string | null;
}
