// Types and small rules for the on-screen evaluation desk and the exam depth panels: what v1/evaluation and the exam-session depth endpoints send.

export interface EvalConfig {
  perExaminerCap: number;
  secondSharePercent: number;
  thresholdMarks: number;
  maskHeaderPercent: number;
  secondPickedAt: string | null;
  finalisedAt: string | null;
}
export interface EvalQuestion { id: string; no: string; maxMarks: number }
export interface EvalScript {
  id: string;
  dummyNo: string;
  rollNo: string;
  status: 'uploaded' | 'allocated' | 'valued' | 'needs_third' | 'finalised';
  pages: number;
  secondRequired: boolean;
  thirdRequired: boolean;
  totals: Partial<Record<'1' | '2' | '3', number>>;
  finalMarks: number | null;
}
export interface EvalWorkload { examinerId: string; name: string; allocated: number; submitted: number }
export interface EvalOverview {
  paper: { id: string; maxMarks: number };
  config: EvalConfig;
  questions: EvalQuestion[];
  scripts: EvalScript[];
  workload: EvalWorkload[];
}
export interface StaffMember { id: string; fullName: string; roles: string[] }

export interface Duty { id: string; staffId: string; staff: string; roomId: string; room: string; dutyDate: string; startsAt: string; endsAt: string; role: 'invigilator' | 'chief'; status: 'assigned' | 'substituted' }
export interface SupplementaryRow { id: string; studentId: string; student: string; rollNo: string; subjectId: string; subject: string; code: string }
export interface MalpracticeCase { id: string; studentId: string; student: string; rollNo: string; description: string; status: 'reported' | 'penalised' | 'dismissed'; penalty: string | null; decisionNote: string | null }
export interface ResultRules { graceMaxPerSubject: number; graceMaxTotal: number; progressionMinCredits: number | null; progressionMaxBacklogs: number | null }
export interface GraceRow { studentId: string; student: string; rollNo: string; subjectId: string; subject: string; marks: number }
export interface RankRow { studentId: string; name: string; rollNo: string; section: string; sgpa: number; passed: boolean; classRank: number | null; programmeRank: number | null }
export interface ProgressionRow { studentId: string; name: string; rollNo: string; creditsEarned: number; backlogs: number; eligible: boolean; reasons: string[] }
export interface ProgressionReport { eligible: number; held: number; students: ProgressionRow[] }

/** Parses "1=20" lines into questions; null when a line is malformed, a number repeats or a mark is not positive. */
export function parseQuestions(text: string): { no: string; maxMarks: number }[] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const out: { no: string; maxMarks: number }[] = [];
  for (const line of lines) {
    const m = /^([^=\s]+)\s*=\s*(\d+(?:\.\d+)?)$/.exec(line);
    if (!m || !(Number(m[2]) > 0) || out.some((q) => q.no === m[1])) return null;
    out.push({ no: m[1], maxMarks: Number(m[2]) });
  }
  return out;
}

/** Questions as editable text, one "no=marks" line each. */
export const questionsText = (qs: { no: string; maxMarks: number }[]): string => qs.map((q) => `${q.no}=${q.maxMarks}`).join('\n');

/** Scripts that have all the valuations they need and wait for the final push. */
export const valuedCount = (scripts: EvalScript[]): number => scripts.filter((s) => s.status === 'valued' || s.status === 'finalised').length;
