// Assessment schemes, exam sessions and results: shapes returned by services/api (exams module) and the small rules the pages share.

export type ComponentKind = 'internal' | 'external' | 'practical' | 'project' | 'viva';
export type SessionStatus = 'draft' | 'scheduled' | 'processed' | 'published' | 'locked';
export type MarkStatus = 'draft' | 'submitted' | 'verified' | 'moderated';

export interface GradeBand {
  grade: string;
  minPercent: number;
  gradePoint: number;
  pass: boolean;
}
export interface GradeScale {
  id: string;
  name: string;
  isDefault: boolean;
  rules: { bands: GradeBand[]; pointsMode: 'band' | 'percentOver10'; decimals: number };
}
export interface SchemeComponent {
  id?: string;
  code: string;
  name: string;
  kind: ComponentKind;
  weight: number;
}
export interface PassRules {
  minInternalPercent: number | null;
  minExternalPercent: number | null;
  minTotalPercent: number;
}
export interface Scheme {
  id: string;
  subjectId: string;
  academicYearId: string;
  name: string;
  credits: number;
  gradeScaleId: string;
  passRules: PassRules;
  components: (SchemeComponent & { id: string })[];
}
export interface SchemePresets {
  gradeScales: Record<string, { name: string; bands: GradeBand[]; pointsMode: 'band' | 'percentOver10'; decimals: number }>;
  schemes: Record<string, { name: string; credits: number; components: Omit<SchemeComponent, 'id'>[]; pass: PassRules }>;
}
export interface ExamSession {
  id: string;
  name: string;
  kind: 'regular' | 'supplementary';
  term: number;
  programId: string;
  academicYearId: string;
  startsOn: string;
  endsOn: string;
  status: SessionStatus;
  publishedAt: string | null;
}
export interface ExamPaper {
  id: string;
  subjectId: string;
  subject: string;
  sectionId: string;
  section: string;
  examDate: string;
  startsAt: string;
  endsAt: string;
  maxMarks: number;
  assessmentId: string | null;
}
export interface ExamSessionDetail extends ExamSession {
  papers: ExamPaper[];
  stats: { students: number; passed: number; passPercent: number | null; averageSgpa: number | null };
}
export interface ResultRow {
  id: string;
  studentId: string;
  fullName: string;
  rollNo: string;
  section: string;
  sgpa: number;
  cgpa: number;
  creditsEarned: number;
  creditsAttempted: number;
  outcome: 'pass' | 'fail';
  lines: { code: string; subject: string; credits: number; percent: number; grade: string; gradePoint: number; passed: boolean }[];
}
export interface Revaluation {
  id: string;
  status: 'requested' | 'accepted' | 'rejected' | 'completed';
  reason: string | null;
  previousPercent: number | null;
  newPercent: number | null;
  student: string;
  rollNo: string;
  subject: string;
}

/** Total of the component weights (must be 100). Rounded so 33.3 + 33.3 + 33.4 reads as 100. */
export function weightTotal(components: { weight: number }[]): number {
  return Math.round(components.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0) * 100) / 100;
}

/** The first thing wrong with a scheme form, as a message key (null = ready to save). */
export function schemeProblem(f: { name: string; credits: number; components: SchemeComponent[] }): 'name' | 'credits' | 'components' | 'weights' | 'codes' | null {
  if (!f.name.trim()) return 'name';
  if (!(f.credits > 0)) return 'credits';
  if (f.components.length === 0 || f.components.some((c) => !c.code.trim() || !c.name.trim() || !(c.weight > 0))) return 'components';
  if (new Set(f.components.map((c) => c.code.trim())).size !== f.components.length) return 'codes';
  return weightTotal(f.components) === 100 ? null : 'weights';
}

/** What the principal does next with a session. */
export function nextStep(status: SessionStatus, papers: number): 'addPapers' | 'schedule' | 'process' | 'publish' | 'lock' | 'done' {
  if (status === 'draft') return papers === 0 ? 'addPapers' : 'schedule';
  if (status === 'scheduled') return 'process';
  if (status === 'processed') return 'publish';
  if (status === 'published') return 'lock';
  return 'done';
}

export const sessionTone = (s: SessionStatus): 'default' | 'warning' | 'success' => (s === 'published' || s === 'locked' ? 'success' : s === 'processed' ? 'warning' : 'default');

/** Whether marks can still be typed in (only while the teacher's draft is open). */
export const canEnterMarks = (status: MarkStatus): boolean => status === 'draft';

export const exportHref = (path: string): string => `/api/export?path=${encodeURIComponent(path)}`;
