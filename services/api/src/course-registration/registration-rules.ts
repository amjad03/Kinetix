// Pure rules of course registration: eligibility, prerequisites, clashes, credit limits and the allocation order.

export interface SlotTime {
  day: number;
  /** "HH:MM" or "HH:MM:SS". */
  starts: string;
  ends: string;
}

export interface OfferingFacts {
  id: string;
  subjectId: string;
  category: string;
  credits: number;
  seatCap: number;
  status: string;
  eligibleProgramIds: string[] | null;
  eligibleSemesters: number[] | null;
  prerequisiteSubjectId: string | null;
  slots: SlotTime[];
}

export interface StudentFacts {
  programId: string;
  semester: number;
  /** Subjects the student has passed. */
  passedSubjectIds: Set<string>;
}

export type Refusal = 'closed' | 'not_eligible' | 'prerequisite' | 'clash' | 'credit_limit' | 'seats_full';

export const REFUSAL_TEXT: Record<Refusal, string> = {
  closed: 'This course is closed for registration',
  not_eligible: 'This course is not open to your programme or semester',
  prerequisite: 'You have not cleared the prerequisite for this course',
  clash: 'This course clashes with another course you are registered for',
  credit_limit: 'This would take you over the credit limit for the term',
  seats_full: 'No seats are left in this course',
};

const hm = (t: string) => {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
};

/** True when any slot of `a` overlaps any slot of `b` on the same weekday. */
export function slotsClash(a: SlotTime[], b: SlotTime[]): boolean {
  return a.some((x) => b.some((y) => x.day === y.day && hm(x.starts) < hm(y.ends) && hm(y.starts) < hm(x.ends)));
}

export function isEligible(o: Pick<OfferingFacts, 'eligibleProgramIds' | 'eligibleSemesters'>, s: Pick<StudentFacts, 'programId' | 'semester'>): boolean {
  if (o.eligibleProgramIds && o.eligibleProgramIds.length > 0 && !o.eligibleProgramIds.includes(s.programId)) return false;
  if (o.eligibleSemesters && o.eligibleSemesters.length > 0 && !o.eligibleSemesters.includes(s.semester)) return false;
  return true;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Why a student cannot take `offering` now, or null when they can. `held` are the offerings the student
 * already holds a seat in this term; `seatsTaken` is how many seats of `offering` are filled.
 */
export function refusal(offering: OfferingFacts, student: StudentFacts, held: OfferingFacts[], seatsTaken: number, maxCredits: number, opts: { ignoreSeats?: boolean; ignoreCredits?: boolean } = {}): Refusal | null {
  if (offering.status !== 'open') return 'closed';
  if (!isEligible(offering, student)) return 'not_eligible';
  if (offering.prerequisiteSubjectId && !student.passedSubjectIds.has(offering.prerequisiteSubjectId)) return 'prerequisite';
  if (held.some((h) => h.id !== offering.id && slotsClash(h.slots, offering.slots))) return 'clash';
  if (!opts.ignoreCredits && round1(held.filter((h) => h.id !== offering.id).reduce((n, h) => n + h.credits, 0) + offering.credits) > maxCredits) return 'credit_limit';
  if (!opts.ignoreSeats && seatsTaken >= offering.seatCap) return 'seats_full';
  return null;
}

export const totalCredits = (os: { credits: number }[]) => round1(os.reduce((n, o) => n + o.credits, 0));

export interface Applicant {
  studentId: string;
  cgpa: number;
  /** When they first ranked or registered (ms). */
  at: number;
}

/** The order students are served in: highest CGPA first (ties by earliest request) or simply earliest request. */
export function allocationOrder(rule: 'cgpa' | 'time', applicants: Applicant[]): Applicant[] {
  return [...applicants].sort((a, b) => (rule === 'cgpa' && b.cgpa !== a.cgpa ? b.cgpa - a.cgpa : a.at - b.at || a.studentId.localeCompare(b.studentId)));
}
