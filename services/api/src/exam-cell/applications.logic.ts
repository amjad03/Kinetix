/**
 * Pure rules of an examination application: which subjects a candidate may write, why one is not allowed, and the fee.
 */

export type ApplicationKind = 'regular' | 'backlog' | 'improvement';

/** The rules in force for one candidate (from the affiliation profile, the attendance settings and the window). */
export interface ApplicationRules {
  /** Attendance needed in each subject (or overall), after condonation. */
  minAttendancePercent: number;
  /** The lowest attendance the authority may condone up to the minimum, null = no condonation. */
  condonableToPercent: number | null;
  /** Internal marks needed to sit the external examination, null = none. */
  internalEligibilityPercent: number | null;
}

/** What is known about one subject for one candidate. */
export interface SubjectFacts {
  kind: ApplicationKind;
  /** Effective attendance (after condonation) in the subject, or overall when the profile counts it overall; null = none recorded. */
  attendancePercent: number | null;
  /** Internal marks as a percent of their maximum so far; null = none entered. */
  internalPercent: number | null;
  /** Codes of prerequisite subjects not passed yet. */
  missingPrerequisites: string[];
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Why a subject cannot be written, in plain words; empty when it can. Attendance and internal marks are checked for
 * this term's papers only: a backlog or improvement candidate earned them in the first attempt.
 */
export function subjectReasons(r: ApplicationRules, f: SubjectFacts): string[] {
  const out: string[] = [];
  if (f.kind === 'regular') {
    if (f.attendancePercent !== null && f.attendancePercent < r.minAttendancePercent) {
      const condonable = r.condonableToPercent !== null && f.attendancePercent >= r.condonableToPercent;
      out.push(
        condonable
          ? `Attendance ${one(f.attendancePercent)}% is below ${r.minAttendancePercent}%: apply for condonation (allowed from ${r.condonableToPercent}%)`
          : `Attendance ${one(f.attendancePercent)}% is below ${r.minAttendancePercent}%${r.condonableToPercent !== null ? ` and below the condonable ${r.condonableToPercent}%` : ''}`,
      );
    }
    if (r.internalEligibilityPercent !== null && f.internalPercent !== null && f.internalPercent < r.internalEligibilityPercent) {
      out.push(`Not eligible (NE): internal marks ${one(f.internalPercent)}% are below ${r.internalEligibilityPercent}%`);
    }
  }
  if (f.missingPrerequisites.length) out.push(`Prerequisite not cleared: ${f.missingPrerequisites.join(', ')}`);
  return out;
}

export interface FeeRates {
  perPaperPaise: number;
  supplementaryPerPaperPaise: number;
  minimumPaise: number;
}

/** The fee of one subject: this term's papers at the regular rate, backlog and improvement papers at the supplementary rate. */
export const subjectFee = (rates: FeeRates, kind: ApplicationKind) => (kind === 'regular' ? rates.perPaperPaise : rates.supplementaryPerPaperPaise);

/**
 * The application fee: the eligible subjects' fees, raised to the minimum, plus the late fee. Ineligible subjects
 * cost nothing. `topUpPaise` is what the minimum added.
 */
export function applicationFee(rates: FeeRates, subjects: { kind: ApplicationKind; eligible: boolean }[], lateFeePaise: number): { papersPaise: number; topUpPaise: number; lateFeePaise: number; totalPaise: number; papers: number } {
  const counted = subjects.filter((s) => s.eligible);
  const papersPaise = counted.reduce((a, s) => a + subjectFee(rates, s.kind), 0);
  const topUpPaise = counted.length ? Math.max(0, rates.minimumPaise - papersPaise) : 0;
  const late = counted.length ? lateFeePaise : 0;
  return { papersPaise, topUpPaise, lateFeePaise: late, totalPaise: papersPaise + topUpPaise + late, papers: counted.length };
}

/** Internal marks percent from the internal assessments entered so far (absent counts as zero); null when none. */
export function internalPercent(rows: { marks: number | null; absent: boolean; maxMarks: number }[]): number | null {
  const counted = rows.filter((r) => r.absent || r.marks !== null);
  const max = counted.reduce((a, r) => a + r.maxMarks, 0);
  if (max <= 0) return null;
  return (counted.reduce((a, r) => a + (r.absent ? 0 : (r.marks ?? 0)), 0) / max) * 100;
}

/** The application number: EXA/<yy>/<5-digit running number>. */
export const applicationNo = (year: number, n: number) => `EXA/${String(year).slice(-2)}/${String(n).padStart(5, '0')}`;
