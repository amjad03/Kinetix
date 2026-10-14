// Shapes of the attendance desk API (/v1/attendance-desk, /v1/attendance) as the ERP reads them.

export type MarkStatus = 'present' | 'absent' | 'late' | 'excused';
export const MARKS: MarkStatus[] = ['present', 'absent', 'late', 'excused'];

export interface DeskClass {
  id: string;
  name: string;
  program: string;
}

export interface DayPeriod {
  slotId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  teacherId: string;
  teacher: string;
  substitute: boolean;
  batch: string | null;
  combined: number;
  marked: number;
}

export interface ClassDay {
  date: string;
  section: { id: string; name: string };
  weekday: number;
  followsWeekday: number | null;
  holiday: string | null;
  periods: DayPeriod[];
  special: { id: string; kind: string; startsAt: string; endsAt: string; subject: string; teacher: string; status: string; marked: number }[];
  dayMarked: number;
  sessionsMarked: Record<string, number>;
  strength: number;
}

export interface SheetRow {
  id: string;
  fullName: string;
  rollNo: string;
  section: string;
  batch: string | null;
  status: MarkStatus | null;
  markedBy: string | null;
  leave: { leaveId: string; kind: string; countsAs: MarkStatus } | null;
  punch: MarkStatus | null;
}

export interface Sheet {
  kind: 'period' | 'day' | 'session' | 'special';
  date: string;
  section: { id: string; name: string };
  locked: boolean;
  future: boolean;
  roster: SheetRow[];
  slotId?: string;
  meets?: boolean;
  subject?: { id: string; name: string; code: string };
  startsAt?: string;
  endsAt?: string;
  batch?: string | null;
  others?: DayPeriod[];
  session?: 'fn' | 'an' | null;
  id?: string;
  specialKind?: string;
  status?: string;
}

export interface AttendancePolicy {
  thresholdPct: number;
  source: 'programme' | 'rule' | 'profile' | 'institution' | 'default';
  basis: 'overall' | 'per_subject';
  condonableToPct: number | null;
  warnPct: number;
  maxCondonationPoints: number;
  mode: 'hour' | 'day' | 'session';
  profile: { code: string; name: string; scheme: string } | null;
}

export interface Tally {
  held: number;
  attended: number;
  pct: number | null;
  condoned: number;
  effective: number | null;
}

export interface SubjectTally extends Tally {
  subjectId: string;
  subject: string;
  code: string;
  short: boolean;
}

export type EligibilityStatus = 'eligible' | 'condonable' | 'detained';

export interface Eligibility {
  thresholdPct: number;
  source: AttendancePolicy['source'];
  basis: AttendancePolicy['basis'];
  condonableToPct: number | null;
  maxCondonationPoints: number;
  profile: AttendancePolicy['profile'];
  window: { from: string | null; to: string | null; label: string };
  students: { studentId: string; fullName: string; rollNo: string; pct: number | null; effectivePct: number | null; condonedPoints: number; held: number; attended: number; status: EligibilityStatus; warning: boolean; shortIn: string[]; subjects: SubjectTally[] }[];
}

export interface DetentionRow {
  studentId: string;
  rollNo: string;
  fullName: string;
  sectionId: string;
  section: string;
  status: EligibilityStatus;
  pct: number | null;
  effectivePct: number | null;
  thresholdPct: number;
  basis: AttendancePolicy['basis'];
  shortIn: { code: string; subject: string; pct: number | null; effective: number | null }[];
}

export interface AlertRow {
  id: string;
  studentId: string;
  fullName: string;
  rollNo: string;
  section: string;
  subject: string | null;
  kind: 'shortage' | 'warning';
  scope: string;
  level: number;
  percent: number;
  recipients: number;
  sentAt: string;
}

export interface Register {
  section: string;
  month: string;
  mode: AttendancePolicy['mode'];
  subjectId: string | null;
  thresholdPct: number;
  days: string[];
  students: { id: string; rollNo: string; fullName: string; enrolledOn: string | null; cells: Record<string, string>; held: number; attended: number; pct: number | null }[];
}

export interface StudentAttendance {
  student: { id: string; fullName: string; rollNo: string; section: string; enrolledOn: string | null };
  policy: { thresholdPct: number; basis: AttendancePolicy['basis']; warnPct: number; mode: AttendancePolicy['mode']; profile: AttendancePolicy['profile'] };
  window: { from: string; to: string; label: string };
  overall: Tally;
  subjects: SubjectTally[];
  status: EligibilityStatus;
  warning: boolean;
  days: { date: string; marks: { startsAt: string | null; subject: string | null; code: string | null; status: MarkStatus; special: boolean }[] }[];
  leaves: { id: string; kind: string; fromDate: string; toDate: string; status: string; reason: string }[];
}

export interface DeptDashboard {
  date: string;
  unmarked: number;
  departments: { departmentId: string | null; department: string; periodsMarked: number; unmarked: number; present: number; absent: number; excused: number; rate: number | null }[];
}

/** The attendance pages, in the order of their tabs. */
export const ATTENDANCE_TABS = ['today', 'mark', 'unmarked', 'leave', 'register', 'eligibility', 'governance', 'student'] as const;
export type AttendanceTab = (typeof ATTENDANCE_TABS)[number];
export const ATTENDANCE_HREF: Record<AttendanceTab, string> = {
  today: '/attendance',
  mark: '/attendance/mark',
  unmarked: '/attendance/unmarked',
  leave: '/attendance/leave',
  register: '/attendance/register',
  eligibility: '/attendance/eligibility',
  governance: '/attendance/governance',
  student: '/attendance/student',
};

/** Tone of a status pill. */
export const eligibilityTone = (s: EligibilityStatus) => (s === 'eligible' ? ('success' as const) : s === 'condonable' ? ('warning' as const) : ('danger' as const));

/** A date in the local calendar as YYYY-MM-DD. */
export const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isMonth = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}$/.test(v);
export const isId = (v: string | undefined): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);
