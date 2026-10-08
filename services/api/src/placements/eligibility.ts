/** Pure placement rules: who may register for a drive, and the placement statistics. */

export interface DriveRules {
  status: string;
  minCgpa: number;
  maxBacklogs: number;
  programIds: string[];
  registrationClosesOn: string | null;
}
export interface Academics {
  /** Latest published CGPA; null when the student has no published result yet. */
  cgpa: number | null;
  backlogs: number;
  programId: string;
}
export type IneligibleReason = 'not_open' | 'deadline_passed' | 'no_results' | 'cgpa_below' | 'backlogs_exceeded' | 'program_not_eligible';

export function checkEligibility(drive: DriveRules, a: Academics, today: string): { eligible: boolean; reasons: IneligibleReason[] } {
  const reasons: IneligibleReason[] = [];
  if (drive.status !== 'open') reasons.push('not_open');
  if (drive.registrationClosesOn && today > drive.registrationClosesOn) reasons.push('deadline_passed');
  if (drive.programIds.length > 0 && !drive.programIds.includes(a.programId)) reasons.push('program_not_eligible');
  if (drive.minCgpa > 0) {
    if (a.cgpa === null) reasons.push('no_results');
    else if (a.cgpa < drive.minCgpa) reasons.push('cgpa_below');
  }
  if (a.backlogs > drive.maxBacklogs) reasons.push('backlogs_exceeded');
  return { eligible: reasons.length === 0, reasons };
}

/** Subjects whose most recent published result is a fail. `lines` are in chronological order. */
export function countBacklogs(lines: { subjectId: string; passed: boolean }[]): number {
  const latest = new Map<string, boolean>();
  for (const l of lines) latest.set(l.subjectId, l.passed);
  return [...latest.values()].filter((p) => !p).length;
}

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
};

export function ctcSummary(ctcs: number[]) {
  if (ctcs.length === 0) return { average: null, median: null, highest: null, lowest: null };
  return { average: Math.round((ctcs.reduce((s, x) => s + x, 0) / ctcs.length) * 100) / 100, median: median(ctcs), highest: Math.max(...ctcs), lowest: Math.min(...ctcs) };
}

/** Allowed offer moves; an accepted or declined offer is final for the student. */
export const OFFER_RESPONSES = ['accepted', 'declined'] as const;

const DRIVE_MOVES: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'cancelled'], closed: ['open', 'completed', 'cancelled'], completed: [], cancelled: [] };
export const canMoveDrive = (from: string, to: string) => (DRIVE_MOVES[from] ?? []).includes(to);

const INTERNSHIP_MOVES: Record<string, string[]> = { proposed: ['approved', 'cancelled'], approved: ['ongoing', 'cancelled'], ongoing: ['completed', 'cancelled'], completed: [], cancelled: [] };
export const canMoveInternship = (from: string, to: string) => (INTERNSHIP_MOVES[from] ?? []).includes(to);
