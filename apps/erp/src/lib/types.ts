// Shapes returned by the KINETIX Cloud API (services/api). Kept by hand for this slice.

export type RoleName = 'tenant_admin' | 'principal' | 'hod' | 'teacher' | 'accountant' | 'student' | 'guardian' | string;

/** School leaders: the day-to-day pages (Today, Classes, …). Who else may sign in: see access.ts. */
export const DASHBOARD_ROLES: RoleName[] = ['principal', 'tenant_admin', 'hod'];
/** Roles the API lets register boards (POST /v1/devices). */
export const BOARD_ADMIN_ROLES: RoleName[] = ['principal', 'tenant_admin'];

export interface LoginResponse {
  accessToken: string;
  /** Signed in with a temporary password: the token only allows choosing a new one (POST /v1/me/password). */
  mustChangePassword?: boolean;
  user: { id: string; fullName: string; preferredLanguage?: string; roles: RoleName[] };
}

/** POST /v1/me/password: a new token without the temporary-password restriction. */
export interface PasswordChangedResponse {
  accessToken: string;
  mustChangePassword: false;
}

export interface Me {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** en, hi or kn: the ERP's language unless one was picked on this browser. */
  preferredLanguage?: string;
  roles: RoleName[];
  tenant: { name: string; slug: string };
  /** The session's token is limited to changing the temporary password (the ERP shows nothing else). */
  mustChangePassword?: boolean;
  /** False for phone-code-only accounts, which set a first password without a current one. */
  hasPassword?: boolean;
}

export interface Structure {
  campuses: { id: string; name: string }[];
  programs: { id: string; name: string; level: string; campusId: string }[];
  sections: { id: string; displayName: string; programId: string; term: number; students: number }[];
  rooms: { id: string; name: string; campusId: string }[];
  subjects: { id: string; code: string; name: string; programId: string; term: number; courseId: string | null }[];
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

/** A holiday for the whole institution on that day (classes are not due, so none are "missed"). */
export type DayHoliday = { title: string } | null;

export interface ClassesDay {
  date: string;
  isToday: boolean;
  classes: ClassRow[];
  holiday?: DayHoliday;
}

export interface Overview {
  date: string;
  isToday: boolean;
  holiday?: DayHoliday;
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
  overduePaise: number;
  openInvoices: number;
  classes: {
    sectionId: string;
    className: string;
    billedPaise: number;
    collectedPaise: number;
    outstandingPaise: number;
    overdue: number;
    overduePaise: number;
    open: number;
  }[];
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
  paymentId: string;
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
  invoices: { id: string; batchId: string; title: string; amountPaise: number; paidPaise: number; dueOn: string; status: InvoiceStatus }[];
  payments: { id: string; invoiceId: string; title: string; amountPaise: number; method: string; reference: string | null; receiptNo: string | null; paidAt: string | null }[];
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

/** One of the institution's subjects, with the classes that study it and its library course. */
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

// ---- Library (v1/library). Fines are integer paise. ----

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  callNo: string | null;
  copies: number;
  onLoan: number;
}

export interface LibraryLoan {
  id: string;
  book: { id: string; title: string; author: string; callNo: string | null };
  student: { id: string; fullName: string; rollNo: string | null };
  className: string;
  issuedAt: string;
  dueOn: string;
  returnedAt: string | null;
  finePaise: number;
  /** When the fine was collected at the desk; null while unpaid (or when there is no fine). */
  finePaidAt: string | null;
  overdue: boolean;
}

/** What `POST /v1/library/loans/:id/return` sends back (the loan row). */
export interface ReturnedLoan {
  id: string;
  bookId: string;
  studentId: string;
  dueOn: string;
  returnedAt: string | null;
  finePaise: number;
}

/** A student the library can lend to (`GET /v1/library/students?q=`). */
export interface LibraryStudent {
  id: string;
  fullName: string;
  rollNo: string | null;
  className: string;
}

// ---- Marks (v1/assessments) ----

export type AssessmentKind = 'test' | 'assignment' | 'internal' | 'exam' | 'practical';

export interface AssessmentSummary {
  id: string;
  title: string;
  kind: AssessmentKind;
  maxMarks: number;
  heldOn: string;
  publishedAt: string | null;
  sectionId: string;
  subject: { id: string; name: string };
  createdBy: string;
  /** Students with a mark or marked absent. */
  entered: number;
  /** Active students in the class. */
  classSize: number;
  /** Class average of the marks entered (absentees excluded), one decimal. */
  average: number | null;
}

export interface MarkStats {
  count: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface AssessmentDetail extends AssessmentSummary {
  stats: MarkStats;
  students: { id: string; fullName: string; rollNo: string | null; marks: number | null; absent: boolean; remark: string | null }[];
}

// ---- Timetable editing (v1/admin/timetable) ----

export interface StaffMember {
  id: string;
  fullName: string;
  roles: RoleName[];
}

export interface TimetableSlot {
  id: string;
  /** 1 = Monday … 7 = Sunday. */
  dayOfWeek: number;
  /** "09:00:00". */
  startsAt: string;
  endsAt: string;
  section: { id: string; displayName: string };
  subject: { id: string; code: string; name: string };
  teacher: { id: string; fullName: string };
  roomId: string | null;
  room: string | null;
}

// ---- Parent–teacher conversations (v1/conversations?all=true, read-only for leaders) ----

export interface ConversationSummary {
  id: string;
  student: { id: string; fullName: string };
  className: string;
  staff: { id: string; fullName: string };
  family: { id: string; fullName: string };
  lastMessageAt: string | null;
  /** Always null in the leaders' list: message text shows only when a thread is opened (audited). */
  lastMessage: string | null;
}

export interface ConversationMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ConversationThread {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

// ---- Departments (v1/departments, v1/admin/departments) ----

export interface DepartmentRef {
  id: string;
  name: string;
  head: { id: string; fullName: string } | null;
}

export interface DeptCounts {
  scheduled: number;
  taught: number;
  attendanceTaken: number;
  homework: number;
  recordings: number;
  taughtPercent: number | null;
  attendancePercent: number | null;
  attendanceTakenPercent: number | null;
}

export interface DeptTeacher extends DeptCounts {
  id: string;
  fullName: string;
}

export interface DeptClass extends DeptCounts {
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  teacherId: string;
  teacher: string;
  latestAssessment: { id: string; title: string; heldOn: string; averagePercent: number | null } | null;
  /** Topics of the subject's course marked as taught for this class (total 0: no course linked). */
  syllabus?: { covered: number; total: number; percent: number | null };
  /** Lesson plans saved for this class's periods in the range. */
  lessonPlans?: number;
  /** Where the class stands against its year plan today; null when it has none. */
  yearPlan?: PlanProgress | null;
}

export interface DeptAssessment {
  id: string;
  title: string;
  kind: AssessmentKind;
  heldOn: string;
  maxMarks: number;
  publishedAt: string | null;
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  createdBy: string;
  entered: number;
  averagePercent: number | null;
}

export interface DepartmentOverview {
  department: { id: string; name: string; head: string | null };
  range: { from: string; to: string };
  /** Null when the department has no subjects yet. */
  totals: (DeptCounts & { assessments: number; published: number }) | null;
  subjects: { id: string; code: string; name: string; term: number; program: string }[];
  teachers: DeptTeacher[];
  classes: DeptClass[];
  assessments: DeptAssessment[];
}

export interface AdminDepartment {
  id: string;
  name: string;
  headUserId: string | null;
  head: string | null;
  staff: { id: string; fullName: string }[];
  subjects: { id: string; code: string; name: string }[];
}

// ---- Syllabus coverage (GET /v1/coverage?sectionId&subjectId) ----

export interface Coverage {
  sectionId: string;
  subjectId: string;
  covered: number;
  total: number;
  percent: number | null;
  topics: { topicId: string; coveredOn: string; coveredBy: string }[];
}

// ---- Year plans and lesson plans (v1/year-plans, v1/lesson-plans) ----

export type PlanStatus = 'not_started' | 'on_track' | 'behind' | 'ahead';

/** A class against its year plan: topics planned for weeks before this one are expected. */
export interface PlanProgress {
  total: number;
  covered: number;
  expected: number;
  dueThisWeek: number;
  behindBy: number;
  status: PlanStatus;
}

export interface YearPlanItem {
  topicId: string;
  /** Monday of the week the topic is planned for. */
  weekOf: string;
  periods: number;
  title: string;
  chapter: string;
  coveredOn: string | null;
  /** Planned for an earlier week and not taught yet. */
  late: boolean;
}

/** GET /v1/year-plans?sectionId&subjectId (null when the class has no plan). */
export interface YearPlan {
  id: string;
  sectionId: string;
  subjectId: string;
  startsOn: string;
  endsOn: string;
  updatedAt: string;
  /** The institution's today and the Monday of its week (what `late` and `progress` were worked out against). */
  today?: string;
  thisWeek?: string;
  progress: PlanProgress;
  items: YearPlanItem[];
}

export interface LessonPlanContent {
  objectives: string[];
  steps: { minutes: number; activity: string }[];
  materials: string[];
  assessment: string;
  homework: string;
}

export interface LessonPlan {
  id: string;
  slotId: string;
  date: string;
  sectionId: string;
  subjectId: string;
  teacher: string;
  topicIds: string[];
  topics: { id: string; title: string }[];
  content: LessonPlanContent;
  aiDrafted: boolean;
  reviewedAt: string | null;
  /** The reviewer's name. */
  reviewedBy?: string | null;
  reviewRemark: string | null;
  updatedAt: string;
}

/** GET /v1/lesson-plans?sectionId&subjectId&from&to */
export interface LessonPlanList {
  from: string;
  to: string;
  plans: LessonPlan[];
}
