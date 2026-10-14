// Student information beyond the roll: the shapes of v1/students/:id/details, change requests, clearances, roll
// numbers, section reshuffles, promotion eligibility and the registers (services/api/src/students/student-info.*).

export interface ProfileFieldView {
  key: string;
  label: string;
  kind: 'text' | 'date' | 'select' | 'boolean';
  options: string[] | null;
  requestable: boolean;
  value: string | number | boolean | null;
}

export interface CustomFieldView {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[];
  required: boolean;
  help: string | null;
  value: string | number | boolean | null;
  canEdit: boolean;
}

export interface Sibling {
  id: string;
  fullName: string;
  rollNo: string;
  className: string;
  status: string;
  dateOfBirth: string | null;
  /** 1 = the eldest of the family at the institution (sibling concessions go by it). */
  position: number;
}

export interface StudentDetails {
  studentId: string;
  fields: ProfileFieldView[];
  /** "XXXX XXXX 1234", or null. */
  aadhaar: string | null;
  custom: CustomFieldView[];
  canEdit: boolean;
  siblings: Sibling[];
}

export interface ChangeRequest {
  id: string;
  studentId: string;
  studentName: string;
  field: string;
  fieldLabel: string;
  currentValue: string | null;
  newValue: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedAs: 'student' | 'guardian' | 'staff';
  deciderName: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface ClearanceItem {
  id: string;
  department: string;
  label: string;
  status: 'pending' | 'cleared' | 'blocked';
  duesPaise: number;
  finding: string | null;
  note: string | null;
  deciderName: string | null;
  decidedAt: string | null;
}

export interface Clearance {
  id: string;
  studentId: string;
  purpose: string;
  status: 'open' | 'cleared' | 'cancelled';
  note: string | null;
  createdAt: string;
  completedAt: string | null;
  student: { fullName: string; rollNo: string; className: string };
  items: ClearanceItem[];
}

export const CLEARANCE_PURPOSES = ['tc', 'course_completion', 'migration', 'other'] as const;
export const ROLL_ORDERS = ['alphabetic', 'gender', 'admission', 'admission_no'] as const;
export type RollOrder = (typeof ROLL_ORDERS)[number];

export interface RollPlan {
  dryRun: boolean;
  className: string;
  changed: number;
  plan: { id: string; fullName: string; from: string; to: string }[];
}

export interface RebalancePlan {
  dryRun: boolean;
  moves: { id: string; fullName: string; from: string; to: string; fromName: string; toName: string }[];
  sizes: { sectionId: string; className: string; before: number; after: number }[];
}

export interface Eligibility {
  className: string;
  eligible: number;
  heldBack: number;
  students: { studentId: string; fullName: string; rollNo: string; attendancePct: number | null; duesPaise: number; eligible: boolean; reasons: string[] }[];
}

export const STUDENT_REPORTS = ['strength', 'religion', 'age', 'missing', 'dropouts', 'tc-register'] as const;
export type StudentReport = (typeof STUDENT_REPORTS)[number];

/** Roles a custom field can be limited to (the API checks the same list). */
export const FIELD_ROLES = ['tenant_admin', 'principal', 'admissions_officer', 'hod', 'teacher', 'accountant', 'counsellor', 'exam_controller', 'librarian', 'hostel_warden'] as const;
