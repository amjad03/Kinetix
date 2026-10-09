// Shapes returned by the HR lifecycle API (appraisal, training, onboarding, exit).

export interface AppraisalCycle {
  id: string;
  period: string;
  opensOn: string;
  closesOn: string;
  status: 'open' | 'closed';
}
export type AppraisalScores = Record<string, { score: number; evidence?: string }>;
export type AppraisalStatus = 'draft' | 'self_submitted' | 'hod_reviewed' | 'finalised';
export interface Appraisal {
  id: string;
  cycleId: string;
  userId: string;
  fullName: string | null;
  status: AppraisalStatus;
  selfScores: AppraisalScores;
  hodScores: AppraisalScores;
  hodRemarks: string | null;
  finalScore: number | null;
  grade: string | null;
  principalRemarks: string | null;
  selfPercent: number;
  hodPercent: number;
}
export interface AppraisalCategory {
  key: string;
  label: string;
  max: number;
}

export interface TrainingRecord {
  id: string;
  userId: string;
  fullName: string;
  title: string;
  kind: 'fdp' | 'workshop' | 'conference' | 'course';
  organiser: string | null;
  startsOn: string;
  endsOn: string;
  hours: number;
  certificateRef: string | null;
  hasCertificate?: boolean;
  certificateName?: string | null;
  verified: boolean;
}
export interface TrainingSummary {
  userId: string;
  fullName: string;
  programmes: number;
  hours: number;
}

export interface OnboardingItem {
  id: string;
  userId: string;
  title: string;
  owner: string;
  dueOn: string | null;
  done: boolean;
  doneAt: string | null;
}
export interface OnboardingProgress {
  userId: string;
  fullName: string;
  total: number;
  done: number;
}

export interface Separation {
  id: string;
  userId: string;
  fullName: string | null;
  resignedOn: string;
  noticeDays: number;
  lastWorkingDay: string;
  reason: string;
  status: 'submitted' | 'clearance' | 'settled' | 'relieved' | 'withdrawn';
  noticeShortfallDays: number;
  settlementPaise: number | null;
  settlementNote: string | null;
  relievedOn: string | null;
}
export interface SeparationDetail extends Separation {
  clearances: { id: string; department: string; status: 'pending' | 'cleared'; duesPaise: number; remarks: string | null }[];
  duesPaise: number;
}
