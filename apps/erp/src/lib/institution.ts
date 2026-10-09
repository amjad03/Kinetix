// Institution profile, capability profile, buildings and attendance governance (API: v1/admin/institution, v1/attendance).

export const ACADEMIC_MODELS = ['school', 'puc', 'ug', 'pg', 'university'] as const;
export type AcademicModel = (typeof ACADEMIC_MODELS)[number];
export const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B', 'C', 'D'] as const;

export interface InstitutionProfile {
  legalName?: string | null;
  affiliationBody?: string | null;
  affiliationNo?: string | null;
  aisheCode?: string | null;
  naacGrade?: string | null;
  establishedYear?: number | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  academicModel?: AcademicModel;
  boardOrUniversity?: string | null;
  disabledModules?: string[];
  toggleableModules: string[];
}

export interface Capabilities {
  academicModel: AcademicModel;
  boardOrUniversity: string | null;
  disabledModules: string[];
  toggleableModules: string[];
}

export interface BuildingsTree {
  campuses: { id: string; name: string }[];
  buildings: { id: string; name: string; code: string | null; campusId: string; floors: { id: string; level: number; label: string; rooms: RoomRef[] }[] }[];
  unplacedRooms: (RoomRef & { campusId: string })[];
}
export interface RoomRef {
  id: string;
  name: string;
  kind: string;
  capacity: number | null;
}

export interface AttendanceRules {
  attendanceLockHours: number | null;
  attendanceThresholdPct: number;
}

export interface CorrectionRow {
  id: string;
  student: string;
  rollNo: string;
  subject: string;
  date: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  requester: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface CondonationRow {
  id: string;
  fullName: string;
  rollNo: string;
  kind: 'medical' | 'other';
  reason: string;
  hasDocument: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approvedPoints: number;
}

export interface ShortageRow {
  studentId: string;
  fullName: string;
  rollNo: string;
  subject: string;
  present: number;
  late: number;
  absent: number;
  pct: number | null;
  condonedPoints: number;
  effectivePct: number | null;
}

/** Empty form fields are sent as null so a cleared field is cleared on the server. */
export const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
