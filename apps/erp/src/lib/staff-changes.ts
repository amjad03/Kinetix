// Shapes returned by the probation, transfer and marking-help APIs.

export type ProbationStatus = 'pending' | 'recommended' | 'confirmed' | 'extended';
export interface ProbationReview {
  id: string;
  userId: string;
  dueOn: string;
  status: ProbationStatus;
  recommendation: 'confirm' | 'extend' | null;
  hodRemarks: string | null;
  decisionRemarks: string | null;
  extendedUntil: string | null;
  letterNo: string | null;
}
export interface Probationer {
  userId: string;
  fullName: string;
  employeeCode: string;
  department: string | null;
  designation: string | null;
  joinedOn: string | null;
  dueOn: string | null;
  daysLeft: number | null;
  due: boolean;
  review: ProbationReview | null;
}

export type TransferStatus = 'scheduled' | 'applied' | 'cancelled';
export interface Transfer {
  id: string;
  userId: string;
  fullName: string | null;
  effectiveOn: string;
  reason: string;
  status: TransferStatus;
  from: { department?: string; designation?: string; campus?: string };
  to: { department?: string; designation?: string; campus?: string };
}
export interface TransferOptions {
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  campuses: { id: string; name: string }[];
}

export interface GradeCriterion {
  criterion: string;
  max: number;
  awarded: number;
  comment: string;
}
export interface GradeDraft {
  id: string;
  maxMarks: number;
  suggestedMarks: number;
  rationale: string;
  criteria: GradeCriterion[];
  preview: boolean;
  status: 'draft' | 'accepted' | 'edited' | 'rejected';
  finalMarks: number | null;
}

export interface ClassroomActivity {
  id: string;
  question: string;
  kind: string;
  openedAt: string;
  hasAnswer: boolean;
  section: string;
  responses: number;
  cos: { coId: string; code: string }[];
}

export interface SigningKeyInfo {
  keyId: string;
  algorithm: string;
  createdAt: string;
}
