// Academics core (services/api/src/academics): requests, settings, record pages and reports.
import type { NumberingSeries } from './templates';

export type RequestKind = 'admission_handover' | 'section_change' | 'withdrawal' | 'timetable_change' | 'substitution';
export const REQUEST_KINDS: RequestKind[] = ['admission_handover', 'section_change', 'withdrawal', 'timetable_change', 'substitution'];
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface RequestStep {
  key: string;
  state: 'done' | 'current' | 'upcoming' | 'rejected' | 'skipped';
  byName?: string | null;
  at?: string | null;
  note?: string | null;
}

export interface AuditRow {
  id: number;
  action: string;
  at: string;
  actor: string | null;
}

export interface AcademicRequest {
  id: string;
  number: string;
  kind: RequestKind;
  title: string;
  reason: string;
  status: RequestStatus;
  steps: RequestStep[];
  payload: Record<string, unknown>;
  outcome: Record<string, unknown> | null;
  createdAt: string;
  decidedAt: string | null;
  student: string | null;
  rollNo: string | null;
  section: string | null;
  requester: string;
  canDecide: boolean;
}

export interface RequestDetail extends Omit<AcademicRequest, 'student' | 'rollNo' | 'section'> {
  student: { id: string; fullName: string; rollNo: string; status: string; section: string; sectionId: string } | null;
  canCancel: boolean;
  activity: AuditRow[];
}

export interface Directory {
  sections: { id: string; name: string; term: number; program: string; year: string; strength: number; periods: number }[];
  teachers: { id: string; name: string; email: string | null; periods: number; sections: number; departments: string | null }[];
  subjects: { id: string; code: string; name: string; term: number; program: string; department: string | null; sections: number; assessments: number }[];
  rooms: { id: string; name: string; kind: string; capacity: number | null }[];
}

export interface Slot {
  id: string;
  day: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  section?: string;
  sectionId?: string;
  teacher?: string;
  teacherId?: string;
  room: string | null;
}

export interface AssessmentRow {
  id: string;
  title: string;
  kind?: string;
  heldOn: string;
  markStatus: string;
  lockedAt?: string | null;
  publishedAt?: string | null;
  subject?: string;
  section?: string;
}

export interface RequestRow {
  id: string;
  number: string;
  kind: RequestKind;
  title: string;
  status: RequestStatus;
  createdAt: string;
}

export interface SectionRecord {
  id: string;
  name: string;
  term: number;
  division: string;
  program: string;
  year: string;
  minPercent: number;
  students: { id: string; rollNo: string; fullName: string; status: string; held: number; attended: number }[];
  timetable: Slot[];
  assessments: AssessmentRow[];
  coverage: { subjectId: string; subject: string; covered: number; total: number }[];
  requests: RequestRow[];
  activity: AuditRow[];
}

export interface GuardianRecord {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  language: string | null;
  children: { id: string; fullName: string; rollNo: string; status: string; section: string; relation: string; isPrimary: boolean; isEmergencyContact: boolean }[];
  fees: { duePaise: number | string; openInvoices: number };
  notices: { id: string; kind: string; title: string; createdAt: string; readAt: string | null }[];
  requests: RequestRow[];
  activity: AuditRow[];
}

export interface TeacherRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  departments: string | null;
  limits: { perDay: number; perWeek: number };
  weekly: number;
  byDay: { day: number; periods: number }[];
  slots: Slot[];
  substitutions: { id: string; date: string; status: string; reason: string; role: 'covering' | 'covered'; section: string; subject: string }[];
  marksPending: AssessmentRow[];
  lessonPlans: Record<string, number>;
  activity: AuditRow[];
}

export interface SubjectRecord {
  id: string;
  code: string;
  name: string;
  term: number;
  program: string;
  department: string | null;
  course: string | null;
  classes: { id: string; section: string; teachers: string; periods: number; covered: number; total: number }[];
  assessments: AssessmentRow[];
  lessonPlans: { id: string; date: string; status: string; section: string; teacher: string }[];
  offerings: { id: string; term: string; category: string; credits: number; seatCap: number; registered: number }[];
  activity: AuditRow[];
}

export interface LessonPlanRow {
  id: string;
  date: string;
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  submittedAt: string | null;
  remark: string | null;
  objective: string | null;
  section: string;
  subject: string;
  subjectId: string;
  teacher: string;
  teacherId: string;
}

export interface ReportData {
  columns: { key: string; label?: string }[];
  rows: Record<string, string | number | null>[];
}

export const REPORT_KINDS = ['strength', 'attendance-daily', 'attendance-monthly', 'attendance-subject', 'shortage', 'timetable', 'workload', 'marks-register', 'syllabus-coverage', 'registration-summary', 'room-utilisation', 'syllabus-department', 'hours-register', 'plan-deviation', 'substitute-load', 'marking-compliance', 'defaulter-trend', 'condonation-list', 'leave-register', 'detention-list'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
/** The filters each report reads from the URL. */
export const REPORT_FILTERS: Record<ReportKind, ('date' | 'month' | 'from' | 'to' | 'sectionId' | 'subjectId' | 'termId' | 'by' | 'id')[]> = {
  strength: [],
  'attendance-daily': ['date', 'sectionId'],
  'attendance-monthly': ['month', 'sectionId'],
  'attendance-subject': ['from', 'to', 'sectionId'],
  shortage: ['from', 'to', 'sectionId'],
  timetable: ['by', 'id'],
  workload: [],
  'marks-register': ['sectionId'],
  'syllabus-coverage': ['sectionId'],
  'registration-summary': [],
  'room-utilisation': [],
  'syllabus-department': [],
  'hours-register': ['from', 'to', 'sectionId'],
  'plan-deviation': ['sectionId'],
  'substitute-load': ['from', 'to'],
  'marking-compliance': ['from', 'to', 'sectionId'],
  'defaulter-trend': ['sectionId'],
  'condonation-list': ['sectionId'],
  'leave-register': ['from', 'to', 'sectionId'],
  'detention-list': ['sectionId'],
};

export interface AcademicSettings {
  numbering: { admission: NumberingSeries; roll: NumberingSeries; tc: NumberingSeries; request: NumberingSeries; rollPerSection: boolean };
  attendance: {
    minPercent: number;
    warnPercent: number;
    lateCountsAsPresent: boolean;
    correctionWindowDays: number;
    maxCondonationPoints: number;
    notifyGuardianOnAbsence: boolean;
    mode: 'hour' | 'day' | 'session';
    shortageAlerts: boolean;
    dailyDigest: boolean;
    unmarkedReminderMinutes: number;
    onDutyCountsAs: 'present' | 'excused';
    medicalCountsAs: 'absent' | 'excused';
    personalCountsAs: 'absent' | 'excused';
    condonationFeePaise: number;
  };
  assessment: { components: { code: string; name: string; weight: number; maxMarks: number }[]; lockBeforePublish: boolean; passPercent: number };
  timetable: { periodsPerDay: number; periodMinutes: number; maxPeriodsPerTeacherPerDay: number; maxPeriodsPerTeacherPerWeek: number; changeNeedsApproval: boolean; substitutionNeedsApproval: boolean };
  registration: { minCredits: number; maxCredits: number; advisorApproval: boolean; addDropDays: number; waitlist: boolean };
  workload: { defaultHoursPerWeek: number; norms: { designation: string; hoursPerWeek: number }[] };
}

/** Tone of a request or record status pill. */
export function statusTone(s: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (s === 'approved' || s === 'active' || s === 'ok' || s === 'published') return 'success';
  if (s === 'pending' || s === 'submitted' || s === 'warning' || s === 'enrolled') return 'warning';
  if (s === 'rejected' || s === 'returned' || s === 'short' || s === 'over') return 'danger';
  if (s === 'cancelled' || s === 'draft') return 'neutral';
  return 'info';
}

/** Attendance percentage to one decimal, or null when nothing was held. */
export const percent = (attended: number, held: number) => (held > 0 ? Math.round((attended / held) * 1000) / 10 : null);
