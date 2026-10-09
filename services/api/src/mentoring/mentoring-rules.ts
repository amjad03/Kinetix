import type { RoleName } from '../auth/principal.js';

/** Assign mentors and see every mentee's risk. */
export const MENTORING_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** Faculty who can be a mentor. */
export const MENTOR_CANDIDATE_ROLES: RoleName[] = ['teacher', 'hod', 'principal'];
/** Who can read a mentee's private session notes, besides the mentor who wrote them. */
export const NOTES_ROLES: RoleName[] = ['hod', 'counsellor'];

export interface RiskInputs {
  attendancePct: number | null;
  attendanceDays: number;
  failingMarks: number;
  overdueFees: number;
  openCases: number;
  /** Course outcomes where the student's mapped assessments average under half. */
  lowOutcomes?: number;
  /** Skills whose best evidence is still at the lowest level. */
  lowSkills?: number;
  /** Homework past its due date, in the last 60 days, with nothing handed in. */
  missedAssignments?: number;
  /** Class questions skipped far more than answered. */
  lowEngagement?: boolean;
}

export interface RiskSignal {
  kind: 'attendance' | 'marks' | 'fees' | 'cases' | 'outcomes' | 'skills' | 'assignments' | 'engagement';
  value: number;
}

/** Attendance needs a few records before it counts, so a first absence does not flag a student. */
export const MIN_ATTENDANCE_DAYS = 5;

/** The signals that apply, with a weight each; the sum sets the level. */
export function riskOf(i: RiskInputs, attendanceThreshold: number): { signals: RiskSignal[]; score: number; level: 'none' | 'low' | 'medium' | 'high' } {
  const signals: RiskSignal[] = [];
  let score = 0;
  if (i.attendancePct !== null && i.attendanceDays >= MIN_ATTENDANCE_DAYS && i.attendancePct < attendanceThreshold) {
    signals.push({ kind: 'attendance', value: i.attendancePct });
    score += i.attendancePct < attendanceThreshold - 15 ? 3 : 2;
  }
  if (i.failingMarks > 0) {
    signals.push({ kind: 'marks', value: i.failingMarks });
    score += i.failingMarks >= 2 ? 2 : 1;
  }
  if (i.overdueFees > 0) {
    signals.push({ kind: 'fees', value: i.overdueFees });
    score += 1;
  }
  if (i.openCases > 0) {
    signals.push({ kind: 'cases', value: i.openCases });
    score += 1;
  }
  if ((i.lowOutcomes ?? 0) > 0) {
    signals.push({ kind: 'outcomes', value: i.lowOutcomes! });
    score += i.lowOutcomes! >= 3 ? 2 : 1;
  }
  if ((i.lowSkills ?? 0) > 0) {
    signals.push({ kind: 'skills', value: i.lowSkills! });
    score += 1;
  }
  if ((i.missedAssignments ?? 0) >= 2) {
    signals.push({ kind: 'assignments', value: i.missedAssignments! });
    score += i.missedAssignments! >= 4 ? 2 : 1;
  }
  if (i.lowEngagement) {
    signals.push({ kind: 'engagement', value: 1 });
    score += 1;
  }
  return { signals, score, level: score >= 4 ? 'high' : score >= 2 ? 'medium' : score >= 1 ? 'low' : 'none' };
}

/** How a re-assessed risk score compares with the score when the plan opened. */
export function reassessOutcome(before: number, after: number): 'improved' | 'no_change' | 'worse' {
  return after < before ? 'improved' : after > before ? 'worse' : 'no_change';
}
