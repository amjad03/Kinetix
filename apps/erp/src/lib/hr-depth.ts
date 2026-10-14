/** Shapes of the HR depth API (staff details, applicant file, interview scores) and their pure helpers. */

export interface StaffDetails {
  userId: string;
  staffCategory: 'teaching' | 'non_teaching';
  cadre: string | null;
  postType: 'sanctioned' | 'self_financing' | 'guest';
  socialCategory: string | null;
  religion: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  fatherOrSpouseName: string | null;
  differentlyAbled: boolean;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  aadhaarLast4: string | null;
  phdStatus: 'none' | 'pursuing' | 'submitted' | 'awarded';
  phdYear: number | null;
  netSet: 'none' | 'net' | 'net_jrf' | 'set' | 'slet';
  netSetYear: number | null;
  payScale: string | null;
  payLevel: number | null;
  confirmedOn: string | null;
  retirementAge: number;
  retiresOn: string | null;
  lwfEnabled: boolean;
  experience: { priorYears: number; priorTeachingYears: number; serviceYears: number; teachingYears: number; totalYears: number };
  publications: { total: number; indexed: number };
}

export const CADRES = ['professor', 'associate_professor', 'assistant_professor', 'lecturer', 'principal', 'librarian', 'physical_director', 'lab_staff', 'administrative', 'support', 'other'] as const;
export const SOCIAL = ['general', 'ews', 'obc', 'sc', 'st'] as const;
export const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const MARITAL = ['single', 'married', 'widowed', 'divorced'] as const;
export const PHD = ['none', 'pursuing', 'submitted', 'awarded'] as const;
export const NET_SET = ['none', 'net', 'net_jrf', 'set', 'slet'] as const;
export const POSTS = ['sanctioned', 'self_financing', 'guest'] as const;

/** A 12-digit Aadhaar number as typed (spaces allowed), or the reason it is not one. */
export function aadhaarProblem(v: string): 'digits' | 'first' | null {
  const d = v.replace(/\s/g, '');
  if (!/^\d{12}$/.test(d)) return 'digits';
  if (!/^[2-9]/.test(d)) return 'first';
  return null;
}

export interface InterviewScore {
  panelist: string;
  total: number;
  recommendation: 'select' | 'hold' | 'reject';
  remarks: string;
  scores: Record<string, number>;
}

export interface ApplicantFile {
  id: string;
  openingId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string;
  stage: string;
  stageHistory: { stage: string; at: string; by: string; note?: string }[];
  qualification: string;
  experienceYears: number | null;
  phd: boolean;
  netSet: boolean;
  currentOrganisation: string;
  expectedCtcPaise: number | null;
  source: string;
  screeningScore: number | null;
  resumeName: string | null;
  hasResume: boolean;
  hiredUserId: string | null;
  createdAt: string;
  opening: { id: string; title: string; departmentId: string | null; designationId: string | null };
  interviews: { id: string; round: number; kind: string; scheduledAt: string; mode: string; venue: string; status: string; panelIds: string[]; scores: InterviewScore[] }[];
  offers: { id: string; offerNo: string; position: string; annualCtcPaise: number; joiningOn: string; validUntil: string; status: string }[];
  average: number | null;
}

export const INTERVIEW_CRITERIA = ['subject_knowledge', 'teaching_ability', 'communication', 'research', 'attitude'] as const;

/** The panel member's total as the API works it out: a percentage of 10 per criterion. */
export const scorePercent = (s: Record<string, number>) => Math.round((INTERVIEW_CRITERIA.reduce((n, k) => n + (Number(s[k]) || 0), 0) / (INTERVIEW_CRITERIA.length * 10)) * 10000) / 100;

/** The months (YYYY-MM) of an Indian financial year's quarter (1 = April to June). */
export function quarterMonths(fy: number, quarter: 1 | 2 | 3 | 4): string[] {
  const start = quarter === 4 ? new Date(Date.UTC(fy + 1, 0, 1)) : new Date(Date.UTC(fy, 3 + (quarter - 1) * 3, 1));
  return [0, 1, 2].map((k) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** GET /v1/hr/interviews/mine: interviews the person sits on as a panel member. */
export interface MyInterview {
  id: string;
  applicant: string;
  applicantId: string;
  opening: string;
  round: number;
  kind: string;
  scheduledAt: string;
  venue: string;
  mode: string;
  status: string;
  scoredByMe: boolean;
}
