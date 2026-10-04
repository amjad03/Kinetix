// Shapes returned by the KINETIX Cloud API (services/api). Kept by hand for this slice.

export type RoleName = 'tenant_admin' | 'principal' | 'hod' | 'teacher' | 'student' | 'parent' | string;

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

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
