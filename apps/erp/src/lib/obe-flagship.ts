// OBE flagship: shapes returned by the API's OBE dashboard, question-wise marks, workflow, policies, reports and surveys,
// and the pure helpers of the marks grid (paste from Excel, keyboard moves, validation) and the heat maps.

export type ReviewStage = 'draft' | 'hod' | 'coordinator' | 'iqac' | 'approved' | 'returned' | 'none';
export type Framework = 'nba_tier1' | 'nba_tier2' | 'nba_management' | 'nba_pharmacy' | 'naac' | 'custom';
export const FRAMEWORKS: Framework[] = ['naac', 'nba_tier1', 'nba_tier2', 'nba_management', 'nba_pharmacy', 'custom'];
export type CourseFlag = 'noCos' | 'unmapped' | 'untagged' | 'marks' | 'noAssessments';

export interface DashCourse {
  id: string;
  code: string;
  name: string;
  term: number;
  programId: string;
  departmentId: string | null;
  department: string | null;
  coSetId: string | null;
  version: number | null;
  draftId: string | null;
  reviewStage: ReviewStage;
  cos: number;
  mapped: number;
  assessments: number;
  tagged: number;
  questionPapers: number;
  marksComplete: number;
  attainment: number | null;
  belowTarget: number;
  flags: CourseFlag[];
}
export interface Approval {
  id: string;
  version: number;
  stage: 'hod' | 'coordinator' | 'iqac';
  submittedAt: string | null;
  subjectId: string;
  code: string;
  subject: string;
  program: string;
  submittedBy?: string | null;
  term?: number;
  cos?: number;
  verbIssues?: number;
}
export interface HeatValue {
  code: string;
  value: number | null;
  target: number | null;
  met: boolean | null;
}
export interface ObeDash {
  year: { id: string; label: string } | null;
  years: { id: string; label: string }[];
  me: { leader: boolean; coordinated: string[]; headed: string[]; taught: number };
  programs: { id: string; name: string; level: string; framework: Framework }[];
  courses: DashCourse[];
  approvals: Approval[];
  heat: {
    courses: { subjectId: string; code: string; name: string; programId: string; term: number; cos: (HeatValue & { coId: string })[] }[];
    programs: { programId: string; name: string; framework: Framework; computedAt: string | null; outcomes: (HeatValue & { outcomeId: string; kind: string })[] }[];
  };
  weakCos: { coId: string; code: string; subjectId: string; subject: string; programId: string; combined: number; target: number; gap: number; weak: string[] }[];
  counts: { programs: number; courses: number; cos: number; approvals: number; noCos: number; unmapped: number; untagged: number; marks: number; cosMet: number; cosMeasured: number; actionsOpen: number; actionsOverdue: number; actionsToVerify?: number; surveysOpen: number };
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export interface PaperQuestion {
  id: string;
  no: string;
  part: string;
  maxMarks: number;
  bloomLevel: string | null;
  difficulty?: Difficulty | null;
  cos: { coId: string; weight: number }[];
}
export interface Paper {
  assessment: { id: string; title: string; kind: string; maxMarks: number; heldOn: string; markStatus: string; locked: boolean; sectionId: string; section: string; subjectId: string; subject: string; component: string | null; evidence: 'cie' | 'see' };
  editable: boolean;
  canTag: boolean;
  apportion: 'blueprint' | 'equal' | 'off';
  cos: { id: string; code: string; statement: string; bloomLevel: string | null }[];
  questions: PaperQuestion[];
  paperMarks: number;
  coMarks: { coId: string; code: string; marks: number; share: number }[];
  bloom: { level: number; name: string; marks: number }[];
  difficulty?: { level: Difficulty; marks: number }[];
  students: { id: string; rollNo: string; name: string; absent: boolean; total: number | null; marks: Record<string, number | null>; questionWise: boolean }[];
}
export interface CourseAssessment {
  id: string;
  title: string;
  kind: string;
  maxMarks: number;
  heldOn: string;
  markStatus: string;
  lockedAt: string | null;
  sectionId: string;
  section: string;
  component: string | null;
  classSize: number;
  entered: number;
  questions: number;
  tagged: number;
  paperMarks: number;
  questionMarked: number;
  shares: number;
  evidence: 'cie' | 'see';
  basis: 'questions' | 'apportioned' | 'share' | 'none';
}
export interface KindRow {
  kind: string;
  students: number;
  attained: number;
  percentAttained: number;
  averagePercent: number;
  level: number;
  weight: number;
}
export interface Policy {
  studentThresholdPercent: number;
  levels: { level: number; minStudentsPercent: number }[];
  evidenceWeights: Record<string, number>;
  directWeight: number;
  indirectWeight: number;
  maxLevel: number;
  targetLevel: number;
  decimals: number;
  coMethod: 'threshold' | 'class_average' | 'percentage';
  poMethod: 'course_weighted' | 'co_weighted' | 'course_average';
  seeApportion: 'blueprint' | 'equal' | 'off';
  includeLms: boolean;
}
export interface PolicyView {
  scope: 'institution' | 'program' | 'subject';
  effective: { config: Policy; source: { scope: string; version: number | null; id: string | null } };
  history: { id: string; version: number; config: Policy; note: string | null; effectiveFrom: string | null; effectiveFromYearId: string | null; createdBy: string | null; createdAt: string }[];
}
export interface CourseAttainment {
  subject: { id: string; code: string; name: string; term: number; programId: string };
  computedAt: string | null;
  policy: Policy & { source: { scope: string; version: number | null } };
  cos: { id: string; code: string; statement: string; bloomLevel: string | null; direct: number | null; indirect: number | null; combined: number | null; target: number; gap: number | null; met: boolean | null; byKind: KindRow[]; weakItems: { label: string; percentAttained: number }[]; items: { label: string; kind: string; basis: string }[]; surveys: { used: string[]; skipped: string[] } | null }[];
  questions: { id: string; no: string; part: string; maxMarks: number; bloomLevel: string | null; assessmentId: string; assessment: string; avg: number | null; answered: number; percent: number | null; cos: string[] }[];
  bloom: { level: number; marks: number }[];
}
export interface Reviews {
  set: { id: string; version: number; status: string; reviewStage: ReviewStage; submittedAt: string | null };
  canDecide: boolean;
  history: { id: string; stage: string; decision: 'submitted' | 'approved' | 'returned' | 'comment' | 'activated'; comment: string | null; coId: string | null; co: string | null; actor: string | null; at: string }[];
}
export interface Articulation {
  outcomes: { id: string; kind: string; code: string; statement: string }[];
  rows: { id: string; code: string; name: string; term: number; values: Record<string, number | null> }[];
  average: Record<string, number | null>;
  missing: { id: string; code: string; name: string; term: number }[];
}
export interface Tree {
  computedAt: string | null;
  method: Policy['poMethod'];
  weights: { direct: number; indirect: number };
  outcomes: { outcomeId: string; code: string; statement: string; direct: number | null; indirect: number | null; combined: number | null; target: number; met: boolean; coverage: number | null; courses: { courseId: string; code: string; name: string; term: number | null; articulation: number; attainment: number | null; cos: { coId: string; code: string; strength: number; attainment: number | null }[] }[] }[];
}
export interface Batches {
  batches: { entryYearId: string; batch: string; computedAt: string; years: string[] }[];
  entryYears: { id: string; label: string }[];
  outcomes: { code: string; values: ({ direct: number | null; indirect: number | null; combined: number | null; target: number; met: boolean } | null)[] }[];
}
export interface ExitSurvey {
  id: string;
  title: string;
  kind: 'course_exit' | 'programme_exit' | 'alumni' | 'employer';
  status: 'draft' | 'open' | 'closed';
  closesAt: string | null;
  lastRemindedAt: string | null;
  subjectId: string | null;
  section: string | null;
  classSize: number;
  responses: number;
  mean: number | null;
}
export interface StudentOutcomes {
  student: { id: string; name: string; rollNo: string };
  academicYearId: string;
  courses: { subjectId: string; code: string; name: string; threshold: number; cos: { coId: string; code: string; statement: string; bloomLevel: string | null; cie: number | null; see: number | null; overall: number | null; attained: boolean | null; classLevel: number | null; target: number }[] }[];
}
export interface Preset {
  key: string;
  label: string;
  framework: Framework;
  outcomes: { kind: 'po' | 'pso'; code: string; statement: string }[];
}

// ---- heat maps -----------------------------------------------------------------------------------------------------

export type HeatTone = 'met' | 'near' | 'short' | 'none';
/** Met the target, within 80% of it, or short of it. */
export function heatTone(value: number | null | undefined, target: number | null | undefined): HeatTone {
  if (value === null || value === undefined) return 'none';
  const t = target ?? 2;
  if (value + 1e-9 >= t) return 'met';
  return value + 1e-9 >= t * 0.8 ? 'near' : 'short';
}

/** "1.85" for an attainment level, "-" when nothing was measured. */
export const lvl = (v: number | null | undefined) => (v === null || v === undefined ? '-' : (Math.round(v * 100) / 100).toString());

// ---- the marks grid ------------------------------------------------------------------------------------------------

/** A block copied from Excel or a sheet: rows by line, cells by tab (or commas when there are no tabs). */
export function parseClipboard(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const tabbed = lines.some((l) => l.includes('\t'));
  return lines.map((l) => (tabbed ? l.split('\t') : l.split(/[,;]/)).map((c) => c.trim()));
}

/** A typed mark: blank, "AB" (absent) or a non-negative number with a decimal point or comma. */
export function readMark(text: string): { value: number | null; absent: boolean; ok: boolean } {
  const t = text.trim();
  if (!t) return { value: null, absent: false, ok: true };
  if (/^(ab|a|absent)$/i.test(t)) return { value: null, absent: true, ok: true };
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? { value: n, absent: false, ok: true } : { value: null, absent: false, ok: false };
}

export interface GridState {
  /** values[row][col], as typed. */
  values: string[][];
  absent: boolean[];
}

/**
 * Pastes a block into the grid from (row, col): extra columns and rows past the grid's edge are dropped, "AB" in a cell
 * marks the student absent. Returns the new grid and how many cells were filled.
 */
export function pasteInto(g: GridState, row: number, col: number, block: string[][]): { grid: GridState; filled: number } {
  const values = g.values.map((r) => [...r]);
  const absent = [...g.absent];
  let filled = 0;
  block.forEach((cells, i) => {
    const r = row + i;
    if (r >= values.length) return;
    cells.forEach((c, j) => {
      const k = col + j;
      if (k >= values[r].length) return;
      const m = readMark(c);
      if (m.absent) {
        absent[r] = true;
        return;
      }
      values[r][k] = c.trim();
      filled++;
    });
  });
  return { grid: { values, absent }, filled };
}

/** Problems of a row: a mark that is not a number, or above its question's maximum, or a total above the paper. */
export function rowProblems(values: string[], maxima: number[], paperMax: number): { cols: number[]; total: number | null; over: boolean } {
  const cols: number[] = [];
  let total = 0;
  let any = false;
  values.forEach((v, i) => {
    const m = readMark(v);
    if (!m.ok || m.absent || (m.value !== null && m.value > maxima[i] + 1e-9)) cols.push(i);
    if (m.value !== null) {
      total += m.value;
      any = true;
    }
  });
  const t = any ? Math.round(total * 100) / 100 : null;
  return { cols, total: t, over: t !== null && t > paperMax + 1e-9 };
}

/** Where the cursor goes on a key in the grid (Enter and arrows), or null to let the browser handle it. */
export function moveFrom(key: string, row: number, col: number, rows: number, cols: number, shift = false): { row: number; col: number } | null {
  switch (key) {
    case 'Enter':
      return shift ? { row: Math.max(0, row - 1), col } : { row: Math.min(rows - 1, row + 1), col };
    case 'ArrowDown':
      return { row: Math.min(rows - 1, row + 1), col };
    case 'ArrowUp':
      return { row: Math.max(0, row - 1), col };
    case 'ArrowRight':
      return col + 1 < cols ? { row, col: col + 1 } : row + 1 < rows ? { row: row + 1, col: 0 } : null;
    case 'ArrowLeft':
      return col > 0 ? { row, col: col - 1 } : row > 0 ? { row: row - 1, col: cols - 1 } : null;
    default:
      return null;
  }
}

/** The rows whose marks changed, as the API's entries. */
export function changedEntries(before: GridState, after: GridState, studentIds: string[], questionIds: string[]): { studentId: string; absent: boolean; marks: Record<string, number | null> }[] {
  const out: { studentId: string; absent: boolean; marks: Record<string, number | null> }[] = [];
  after.values.forEach((row, r) => {
    const changed = after.absent[r] !== before.absent[r] || row.some((v, c) => v !== before.values[r][c]);
    if (!changed) return;
    out.push({ studentId: studentIds[r], absent: after.absent[r], marks: Object.fromEntries(row.map((v, c) => [questionIds[c], readMark(v).value])) });
  });
  return out;
}

/** The PEO-PO/PSO matrix of a programme and each PEO's attainment for a year (GET /v1/obe/programs/:id/peo-po). */
export interface PeoPo {
  peos: { id: string; code: string; statement: string }[];
  outcomes: { id: string; code: string; kind: string; statement: string; attainment: number | null }[];
  cells: { peoId: string; outcomeId: string; strength: number; justification: string }[];
  maxLevel: number;
  targetLevel: number;
  attainment: { peoId: string; code: string; value: number | null; measured: number; mapped: number; met: boolean | null }[];
}

/** A course's units with their topics and the COs each serves (GET /v1/obe/subjects/:id/units). */
export interface UnitPlan {
  coVersion: number | null;
  units: { id: string; position: number; title: string; topics: string[]; coCodes: string[] }[];
  cos: { code: string; statement: string; bloomLevel: string | null }[];
  uncovered: string[];
}
