// Shapes of the mentoring, course file and academic audit APIs (v1/mentoring, v1/course-files, v1/academic-audit).

export interface MentorRef {
  id: string;
  fullName: string;
}

export interface MentorAssignment {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  sectionId: string;
  section: string;
  mentorUserId: string;
  mentorName: string;
  startedOn: string;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface RiskRow {
  assignmentId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  section: string;
  mentorUserId: string;
  mentorName: string;
  attendancePct: number | null;
  failingMarks: number;
  overdueFees: number;
  openCases: number;
  score: number;
  level: RiskLevel;
  signals: { kind: string; value: number }[];
}

export interface MentoringSession {
  id: string;
  studentId: string;
  mentorUserId: string;
  heldOn: string;
  mode: string;
  summary: string;
  followUpOn: string | null;
  hasNotes: boolean;
  privateNotes?: string | null;
}

export interface InterventionPlanRow {
  plan: {
    id: string;
    studentId: string;
    mentorUserId: string;
    goal: string;
    actions: { text: string; done: boolean }[];
    reviewOn: string;
    status: 'open' | 'in_progress' | 'closed';
    outcome: string | null;
    outcomeRating: string | null;
    /** Remedial content picked for the plan and the before/after figures (PRD 89.4). */
    remedial?: { kind: string; title: string; assignedOn: string }[];
    baseline?: { takenOn: string; avgPct: number | null; attendancePct: number | null } | null;
    remeasure?: { takenOn: string; avgPct: number | null; attendancePct: number | null; deltaPct: number | null; verdict: 'improved' | 'unchanged' | 'declined' | 'no_data' } | null;
  };
  studentName: string;
  rollNo: string;
}

export interface CourseFileOption {
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  code: string;
}

export interface CourseFileRow {
  id: string;
  sectionId: string;
  subjectId: string;
  section: string;
  subject: string;
  version: number;
  sizeBytes: number;
  summary: Record<string, number>;
  generatedAt: string;
  generatedByName: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewRemark: string | null;
}

export interface AuditTemplateRow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  itemCount: number;
}

export interface AuditRow {
  audit: { id: string; templateId: string; departmentId: string; title: string; status: 'in_progress' | 'completed'; conductedOn: string };
  department: string;
  auditor: string;
}

export type AuditResultValue = 'pending' | 'compliant' | 'partial' | 'non_compliant';

export interface AuditDetail {
  id: string;
  title: string;
  status: 'in_progress' | 'completed';
  results: { id: string; ord: number; category: string; itemText: string; result: AuditResultValue; remark: string }[];
  nonConformities: NonConformity[];
}

export interface NonConformity {
  id: string;
  auditId: string;
  resultId: string | null;
  description: string;
  severity: 'minor' | 'major';
  correctiveAction: string;
  ownerUserId: string | null;
  dueOn: string | null;
  status: 'open' | 'in_progress' | 'closed';
  closureNote: string | null;
}

export interface NonConformityRow extends NonConformity {
  audit: string;
  department: string;
  ownerName: string | null;
  overdue: boolean;
}

export interface AuditSummaryRow {
  departmentId: string;
  department: string;
  audits: number;
  completed: number;
  compliancePct: number | null;
  ncOpen: number;
  ncOverdue: number;
  ncClosed: number;
}

export interface AuditOptions {
  departments: { id: string; name: string }[];
  owners: MentorRef[];
}
