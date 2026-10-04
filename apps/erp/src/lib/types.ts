// Shapes returned by the KINETIX Cloud API (services/api). Kept by hand for this slice.

export type RoleName = 'tenant_admin' | 'principal' | 'hod' | 'teacher' | 'accountant' | 'student' | 'guardian' | string;

/** School leaders: the day-to-day pages (Today, Classes, …). Who else may sign in: see access.ts. */
export const DASHBOARD_ROLES: RoleName[] = ['principal', 'tenant_admin', 'hod'];
/** Roles the API lets register boards (POST /v1/devices). */
export const BOARD_ADMIN_ROLES: RoleName[] = ['principal', 'tenant_admin'];

export interface LoginResponse {
  accessToken: string;
  user: { id: string; fullName: string; roles: RoleName[] };
}

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: RoleName[];
  tenant: { name: string; slug: string };
}

export interface Structure {
  campuses: { id: string; name: string }[];
  programs: { id: string; name: string; level: string; campusId: string }[];
  sections: { id: string; displayName: string; programId: string; term: number; students: number }[];
  rooms: { id: string; name: string; campusId: string }[];
}

export type ClassStatus = 'upcoming' | 'live' | 'not_started' | 'taught' | 'missed';

export interface ClassRow {
  id: string;
  startsAt: string;
  endsAt: string;
  section: { id: string; displayName: string };
  subject: { id: string; name: string; code: string };
  teacher: { id: string; fullName: string };
  room: string | null;
  status: ClassStatus;
  board: string | null;
  attendanceTaken: boolean;
  absent: number;
}

export interface ClassesDay {
  date: string;
  isToday: boolean;
  classes: ClassRow[];
}

export interface Overview {
  date: string;
  isToday: boolean;
  classes: { scheduled: number; taught: number; live: number; notStarted: number; missed: number; upcoming: number };
  attendance: {
    marked: number;
    present: number;
    absent: number;
    late: number;
    absentStudents: number;
    rate: number | null;
    periodsDue: number;
    periodsTaken: number;
  };
  homeworkAssigned: number;
  broadcastsSent: number;
  boards: { total: number; online: number; inClass: number };
}

export interface AttendanceDay {
  date: string;
  sections: { sectionId: string; section: string; students: number; marked: number; marks: number; present: number; absent: number; late: number; excused: number }[];
  absentees: {
    studentId: string;
    student: string;
    rollNo: string | null;
    section: string;
    subject: string | null;
    startsAt: string | null;
    markedBy: string;
  }[];
}

export interface HomeworkRow {
  id: string;
  title: string;
  instructions: string | null;
  dueOn: string | null;
  createdAt: string;
  section: string;
  subject: string;
  teacher: string;
}

export interface Board {
  id: string;
  name: string;
  room: string | null;
  platform: string | null;
  appVersion: string | null;
  enrolledAt: string | null;
  enrollmentExpiresAt: string | null;
  lastSeenAt: string | null;
  enrolled: boolean;
  online: boolean;
  session: { id: string; teacher: string; section: string | null; subject: string | null; startedAt: string } | null;
  /** People watching it live right now. */
  viewers?: number;
}

export type Priority = 'info' | 'important' | 'emergency';

export interface Audience {
  all?: boolean;
  campusIds?: string[];
  programIds?: string[];
  sectionIds?: string[];
  deviceIds?: string[];
}

export interface SentBroadcast {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  requiresAck: boolean;
  sender: { id: string; fullName: string };
  createdAt: string;
  expiresAt: string;
  audience: Audience;
  active: boolean;
  clearedAt: string | null;
  delivery: { boards: number; displayed: number; acknowledged: number; families: number };
}

export interface DeliveryReport {
  total: number;
  displayed: number;
  acknowledged: number;
  devices: { deviceId: string; deviceName: string; lastSeenAt: string | null; displayedAt: string | null; acknowledgedAt: string | null }[];
}

export interface CreatedDevice {
  id: string;
  name: string;
  enrollmentCode: string;
  enrollmentExpiresAt: string;
}

// ---- Fees (v1/fees). Amounts are integer paise. ----

export type InvoiceStatus = 'due' | 'paid' | 'cancelled';

export interface FeeSummary {
  billedPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  overdueInvoices: number;
  openInvoices: number;
  classes: { sectionId: string; className: string; billedPaise: number; collectedPaise: number; outstandingPaise: number; overdue: number; open: number }[];
}

export interface FeeInvoice {
  id: string;
  title: string;
  amountPaise: number;
  paidPaise: number;
  dueOn: string;
  status: InvoiceStatus;
  student: { id: string; fullName: string; rollNo: string | null };
  className: string;
}

export interface FeeReceipt {
  receiptNo: string;
  institution: string;
  student: { id: string; fullName: string; rollNo: string | null };
  className: string;
  invoice: { id: string; title: string; amountPaise: number; balancePaise: number };
  amountPaise: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

export interface StudentFees {
  duePaise: number;
  invoices: { id: string; title: string; amountPaise: number; paidPaise: number; dueOn: string; status: InvoiceStatus }[];
  payments: { id: string; invoiceId: string; title?: string; amountPaise: number; method: string; reference?: string | null; receiptNo: string | null; paidAt: string | null }[];
}

// ---- Content library (v1/content) ----

export interface Curriculum {
  code: string;
  name: string;
  level: string;
}

export interface Course {
  id: string;
  curriculumCode: string;
  code: string;
  title: string;
  term: number;
  reviewed: boolean;
}

export interface CourseOutline extends Course {
  chapters: { id: string; title: string; own: boolean; topics: { id: string; title: string; summary: string; own: boolean }[] }[];
}

export interface Topic {
  id: string;
  title: string;
  summary: string;
  notes: string[];
  outcomes: string[];
  own: boolean;
  chapter?: { id: string; title: string };
  course?: { id: string; title: string; reviewed: boolean };
}

/** One of the institution's subjects, as seen on the timetable. */
export interface SubjectLink {
  id: string;
  name: string;
  code: string;
  classes: string[];
  courseId: string | null;
}

// ---- KINETIX AI (v1/ai/usage) ----

export interface AiUsage {
  days: number;
  rows: { task: string; outcome: string; requests: number; tokens: number }[];
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
