/** Pure rules for data-principal requests under the DPDP Act: what legal retention blocks erasure, and what a correction may change. */

/** What the institution holds about one person that the law (or the academic record) obliges it to keep. */
export interface RetentionFacts {
  /** Fee receipts of a student, or payments made by this person. */
  feePayments: number;
  payslips: number;
  /** Alumni donation receipts (80G). */
  donations: number;
  /** Marks recorded for the student. */
  examMarks: number;
  /** Students still enrolled whose guardian this person is. */
  activeWards: number;
  /** The person is a student who is currently enrolled. */
  enrolledStudent: boolean;
}

/** One plain-words reason per retention rule that applies. Empty means the data can be erased. */
export function retentionReasons(f: RetentionFacts): string[] {
  const out: string[] = [];
  if (f.enrolledStudent) out.push('The student is currently enrolled; the institution must keep the enrolment record.');
  if (f.activeWards > 0) out.push('A child of this guardian is still enrolled; the institution needs a guardian on record.');
  if (f.feePayments > 0) out.push('Fee receipts and payments must be kept for 8 years under the tax and GST rules.');
  if (f.payslips > 0) out.push('Payroll records must be kept for 8 years under labour and tax rules.');
  if (f.donations > 0) out.push('Donation receipts (Section 80G) must be kept for 8 years.');
  if (f.examMarks > 0) out.push('Marks and results form the permanent academic record of the institution.');
  return out;
}

export const CORRECTABLE_FIELDS = ['fullName', 'email', 'phone'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

/** The problem with a requested correction, or null. */
export function correctionProblem(field: string, value: string): string | null {
  const v = value.trim();
  if (!(CORRECTABLE_FIELDS as readonly string[]).includes(field)) return 'Only the name, email and phone can be corrected here; describe other corrections in the details';
  if (!v) return 'Give the corrected value';
  if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'That email address does not look right';
  if (field === 'phone' && !/^\+?[0-9 ()-]{7,16}$/.test(v)) return 'That phone number does not look right';
  if (field === 'fullName' && v.length < 2) return 'The name is too short';
  return null;
}

export const ERASED_NAME = 'Erased user';
