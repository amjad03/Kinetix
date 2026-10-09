/** Pure rules for exam registration: the window and who is eligible. */

export interface EligibilityRules {
  /** Attendance below this percent blocks; null = not checked. */
  minAttendancePercent: number | null;
  blockOnFeeDues: boolean;
  /** More failed subjects than this blocks; null = not checked. */
  maxBacklogs: number | null;
}

export interface EligibilityFacts {
  /** Attended share of the marked days, or null when no attendance is recorded (then it is not held against the student). */
  attendancePercent: number | null;
  /** Fees past their due date and not yet paid, in paise. */
  feeDuePaise: number;
  backlogs: number;
}

/** One plain-English reason per rule the student fails; empty means eligible. */
export function ineligibleReasons(rules: EligibilityRules, facts: EligibilityFacts): string[] {
  const out: string[] = [];
  if (rules.minAttendancePercent !== null && facts.attendancePercent !== null && facts.attendancePercent < rules.minAttendancePercent) {
    out.push(`Attendance shortage: ${facts.attendancePercent.toFixed(1)}% against the required ${rules.minAttendancePercent}%`);
  }
  if (rules.blockOnFeeDues && facts.feeDuePaise > 0) out.push(`Fee dues of Rs ${(facts.feeDuePaise / 100).toFixed(2)} are pending`);
  if (rules.maxBacklogs !== null && facts.backlogs > rules.maxBacklogs) out.push(`${facts.backlogs} backlogs, more than the ${rules.maxBacklogs} allowed`);
  return out;
}

/** Where today falls against a registration window (ISO dates compare as text). */
export function windowState(w: { opensOn: string; closesOn: string }, today: string): 'upcoming' | 'open' | 'closed' {
  return today < w.opensOn ? 'upcoming' : today > w.closesOn ? 'closed' : 'open';
}
