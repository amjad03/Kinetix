// Shapes and small helpers for curriculum versions (v1/curriculum), school mode (v1/school, v1/houses) and the university desk (v1/university).

export type VersionStatus = 'draft' | 'approved' | 'active' | 'archived';

export interface VersionRow {
  id: string;
  programId: string;
  programName: string;
  regulationYear: number;
  versionNo: number;
  label: string;
  status: VersionStatus;
  bosRef: string | null;
  source: string;
  subjectCount: number;
  pinnedStudents: number;
}

export interface ImportRow {
  id: string;
  programId: string;
  regulationYear: number;
  fileName: string;
  status: string;
  preview: boolean;
  versionId: string | null;
  proposal: { subjects: unknown[] };
  createdAt: string;
}

export interface CurriculumDiff {
  from: { id: string; label: string };
  to: { id: string; label: string };
  added: { code: string; name: string }[];
  removed: { code: string; name: string }[];
  changed: { code: string; name: string; changes: string[] }[];
  unchanged: number;
}

export interface HouseRow {
  id: string;
  name: string;
  colour: string;
  motto: string;
  members: number;
  points: number;
  rank: number;
}

export interface PucStream {
  id: string;
  code: string;
  name: string;
  combinations: { id: string; code: string; name: string; seats: number | null; enrolled: number; subjects: { name: string; theoryMax: number; practicalMax: number; internalMax: number }[] }[];
}

export interface OutcomeRow {
  id: string;
  kind: 'outcome' | 'competency';
  grade: number;
  subjectName: string;
  code: string;
  statement: string;
}

export interface InstitutionRow {
  id: string;
  code: string;
  name: string;
  model: string;
  university: string;
  city: string;
  affiliationValidTo: string | null;
  active: boolean;
}

export interface ConvocationRow {
  id: string;
  name: string;
  heldOn: string;
  graduationYear: number;
  status: 'draft' | 'registration_open' | 'closed' | 'held';
  candidates: number;
  registered: number;
}

/** What the next step on a version is, given its status and whether the user may approve. */
export function nextStep(status: VersionStatus, canApprove: boolean): 'approve' | 'activate' | 'revise' | null {
  if (status === 'draft') return canApprove ? 'approve' : null;
  if (status === 'approved') return canApprove ? 'activate' : null;
  if (status === 'active') return 'revise';
  return null;
}

/**
 * Report card lines typed one per line as "Subject, marks, out of" (a trailing remark is allowed).
 * Returns the lines, or the 1-based number of the first line that cannot be read.
 */
export function parseReportLines(text: string): { lines: { subjectName: string; marks: number; maxMarks: number; remark: string }[] } | { badLine: number } {
  const lines: { subjectName: string; marks: number; maxMarks: number; remark: string }[] = [];
  const rows = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) continue;
    const [subjectName, marks, maxMarks, ...rest] = rows[i].split(',').map((x) => x.trim());
    const m = Number(marks);
    const max = Number(maxMarks);
    if (!subjectName || !marks || !maxMarks || !Number.isFinite(m) || !Number.isFinite(max) || max <= 0 || m < 0 || m > max) return { badLine: i + 1 };
    lines.push({ subjectName, marks: m, maxMarks: max, remark: rest.join(', ') });
  }
  return { lines };
}

/** How many differences a diff holds, for the summary line. */
export const diffCount = (d: Pick<CurriculumDiff, 'added' | 'removed' | 'changed'>) => d.added.length + d.removed.length + d.changed.length;
