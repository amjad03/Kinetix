// Admissions CRM and the student lifecycle: shared contracts and the pure business rules
// (docs/architecture/admissions-lifecycle.md). The API enforces these; apps use them to show
// only the actions that will be accepted.

// ---------------------------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------------------------

export const ENQUIRY_SOURCES = ['web', 'walk_in', 'phone', 'campaign', 'referral', 'import'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

/** The pipeline, in board order. `converted` is set by enrollment, not by hand. */
export const ENQUIRY_STAGES = ['new', 'contacted', 'counselling', 'applied', 'converted', 'lost', 'deferred'] as const;
export type EnquiryStage = (typeof ENQUIRY_STAGES)[number];

/** Stages a counsellor may move an enquiry to from each stage. */
export const ENQUIRY_STAGE_MOVES: Record<EnquiryStage, readonly EnquiryStage[]> = {
  new: ['contacted', 'counselling', 'applied', 'lost', 'deferred'],
  contacted: ['counselling', 'applied', 'lost', 'deferred'],
  counselling: ['contacted', 'applied', 'lost', 'deferred'],
  applied: ['counselling', 'lost', 'deferred'],
  converted: [],
  lost: ['contacted', 'counselling'],
  deferred: ['contacted', 'counselling', 'lost'],
};

export const ENQUIRY_ACTIVITY_KINDS = ['call', 'visit', 'email', 'sms', 'whatsapp', 'note'] as const;
export type EnquiryActivityKind = (typeof ENQUIRY_ACTIVITY_KINDS)[number];

export function canMoveEnquiry(from: EnquiryStage, to: EnquiryStage): boolean {
  return ENQUIRY_STAGE_MOVES[from].includes(to);
}

// ---------------------------------------------------------------------------------------------
// Admission cycles: per-program configuration of the form, documents, eligibility and merit
// ---------------------------------------------------------------------------------------------

export type AdmissionFieldType = 'text' | 'number' | 'date' | 'select' | 'email' | 'phone';

/** A question on the application form, configured per cycle (program). */
export interface AdmissionFormField {
  /** Stable key, used by eligibility and merit rules: `marks_12th`. */
  key: string;
  label: string;
  type: AdmissionFieldType;
  required: boolean;
  /** For `select`. */
  options?: string[];
  /** For `number`: the accepted range. */
  min?: number;
  max?: number;
}

export interface AdmissionDocumentSpec {
  key: string;
  label: string;
  required: boolean;
}

export interface EligibilityRules {
  /** Age in whole years on `ageOn` (default: the cycle's first day of term, else today). */
  minAge?: number;
  maxAge?: number;
  ageOn?: string;
  /** A number field must be at least `min`: `{ field: 'marks_12th', min: 45 }`. */
  minimums?: { field: string; min: number }[];
  /** A select field must be one of `values`. */
  allowed?: { field: string; values: string[] }[];
}

/** Merit score = Σ weight × the number field's value. */
export interface MeritRule {
  field: string;
  weight: number;
}

export type AdmissionCycleStatus = 'draft' | 'open' | 'closed';

export type ApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'eligible'
  | 'ineligible'
  | 'waitlisted'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'rejected'
  | 'enrolled'
  | 'withdrawn'
  | 'correction_requested';

/** Moves staff may make by hand (POST /v1/admissions/applications/:id/status). */
export const APPLICATION_MOVES: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  submitted: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['eligible', 'ineligible', 'rejected', 'withdrawn', 'correction_requested'],
  eligible: ['offered', 'waitlisted', 'rejected', 'withdrawn'],
  ineligible: ['under_review', 'rejected'],
  waitlisted: ['offered', 'rejected', 'withdrawn'],
  offered: ['accepted', 'declined', 'withdrawn'],
  accepted: ['withdrawn'],
  declined: [],
  rejected: ['under_review'],
  enrolled: [],
  withdrawn: [],
  /** Sent back to the applicant to fix something; they resubmit and review resumes. */
  correction_requested: ['under_review', 'rejected', 'withdrawn'],
};

/** Moves that need a written reason. */
export const APPLICATION_REASON_REQUIRED: readonly ApplicationStatus[] = ['rejected', 'ineligible', 'withdrawn', 'eligible', 'correction_requested'];

export function canMoveApplication(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_MOVES[from].includes(to);
}

export type Answers = Record<string, string | number>;

/** Problems with an applicant's answers, as `field: message`. Empty when they are acceptable. */
export function validateAnswers(fields: readonly AdmissionFormField[], answers: Answers): Record<string, string> {
  const problems: Record<string, string> = {};
  const known = new Set(fields.map((f) => f.key));
  for (const k of Object.keys(answers)) if (!known.has(k)) problems[k] = 'Not a question on this form';
  for (const f of fields) {
    const raw = answers[f.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (f.required) problems[f.key] = 'Required';
      continue;
    }
    const s = String(raw).trim();
    switch (f.type) {
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(s);
        if (!Number.isFinite(n)) problems[f.key] = 'Enter a number';
        else if (f.min !== undefined && n < f.min) problems[f.key] = `At least ${f.min}`;
        else if (f.max !== undefined && n > f.max) problems[f.key] = `At most ${f.max}`;
        break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) problems[f.key] = 'Enter a date like 2010-06-15';
        break;
      case 'select':
        if (!(f.options ?? []).includes(s)) problems[f.key] = 'Choose one of the options';
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) problems[f.key] = 'Enter an email address';
        break;
      case 'phone':
        if (!/^\+?[\d\s-]{8,16}$/.test(s)) problems[f.key] = 'Enter a phone number';
        break;
      default:
        if (s.length > 500) problems[f.key] = 'Too long';
    }
  }
  return problems;
}

/** Whole years between a date of birth and a day (both `YYYY-MM-DD`). */
export function ageOn(dateOfBirth: string, day: string): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Reasons the applicant is not eligible; empty when eligible. */
export function eligibilityFailures(rules: EligibilityRules, applicant: { dateOfBirth: string | null; answers: Answers }, today: string): string[] {
  const out: string[] = [];
  if (rules.minAge !== undefined || rules.maxAge !== undefined) {
    if (!applicant.dateOfBirth) out.push('Date of birth is missing');
    else {
      const age = ageOn(applicant.dateOfBirth, rules.ageOn ?? today);
      if (rules.minAge !== undefined && age < rules.minAge) out.push(`Younger than ${rules.minAge}`);
      if (rules.maxAge !== undefined && age > rules.maxAge) out.push(`Older than ${rules.maxAge}`);
    }
  }
  for (const m of rules.minimums ?? []) {
    const v = Number(applicant.answers[m.field]);
    if (!Number.isFinite(v) || v < m.min) out.push(`${m.field} below ${m.min}`);
  }
  for (const a of rules.allowed ?? []) {
    if (!a.values.includes(String(applicant.answers[a.field] ?? ''))) out.push(`${a.field} not accepted`);
  }
  return out;
}

/** The weighted merit score, rounded to 3 decimals. Missing values count as 0. */
export function meritScore(rules: readonly MeritRule[], answers: Answers): number {
  const total = rules.reduce((s, r) => {
    const v = Number(answers[r.field]);
    return s + (Number.isFinite(v) ? v * r.weight : 0);
  }, 0);
  return Math.round(total * 1000) / 1000;
}

/**
 * Ranks candidates by score (highest first; earlier application first on a tie) and offers the
 * first `seats`; the rest are waitlisted.
 */
export function rankMerit<T extends { id: string; score: number; submittedAt: Date | string }>(candidates: readonly T[], seats: number) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime() || a.id.localeCompare(b.id));
  return sorted.map((c, i) => ({ ...c, rank: i + 1, decision: (i < Math.max(0, seats) ? 'offer' : 'waitlist') as 'offer' | 'waitlist' }));
}

// ---------------------------------------------------------------------------------------------
// Student lifecycle
// ---------------------------------------------------------------------------------------------

export const STUDENT_STATUSES = ['applicant', 'enrolled', 'active', 'on_leave', 'detained', 'promoted', 'transferred', 'alumni', 'dropped', 'suspended', 'expelled', 'deceased', 'deferred'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/**
 * Allowed status changes. `promoted` means promoted and waiting for a class of the next term;
 * a promotion straight into the next class keeps the student `active` (a promotion event).
 * Transferred, alumni and dropped are final: a returning student applies again.
 */
export const STUDENT_TRANSITIONS: Record<StudentStatus, readonly StudentStatus[]> = {
  applicant: ['enrolled', 'dropped', 'deferred'],
  enrolled: ['active', 'transferred', 'dropped', 'deferred'],
  active: ['on_leave', 'detained', 'promoted', 'transferred', 'alumni', 'dropped', 'suspended', 'expelled', 'deceased'],
  on_leave: ['active', 'transferred', 'dropped', 'deceased'],
  detained: ['active', 'transferred', 'dropped', 'deceased'],
  promoted: ['active', 'transferred', 'dropped', 'deceased'],
  suspended: ['active', 'transferred', 'dropped', 'expelled', 'deceased'],
  transferred: [],
  alumni: [],
  dropped: [],
  expelled: [],
  deceased: [],
  /** Admission held over to a later intake: the student returns to enrolled or active on the date given. */
  deferred: ['enrolled', 'active', 'dropped', 'transferred'],
};

/** Changes that need a written reason (they are on the student's permanent record). */
export const STUDENT_REASON_REQUIRED: readonly StudentStatus[] = ['on_leave', 'detained', 'transferred', 'dropped', 'suspended', 'expelled', 'deceased', 'deferred'];

/** Changes that record who approved them (the approver defaults to the person making the change). */
export const STUDENT_APPROVER_STATUSES: readonly StudentStatus[] = ['deferred', 'on_leave', 'suspended', 'expelled', 'dropped', 'transferred', 'deceased'];

/** Statuses a student can be readmitted from: the student returns to `active` through a readmission. */
export const READMIT_FROM: readonly StudentStatus[] = ['dropped', 'transferred', 'expelled'];

/** Statuses that take the student off every roster (attendance, marks, fees runs): anything but `active`. */
export const OFF_ROLL_STATUSES: readonly StudentStatus[] = ['deferred', 'on_leave', 'suspended', 'detained', 'transferred', 'dropped', 'expelled', 'deceased', 'alumni'];

/** Statuses that also switch off the student's own login. */
export const LOGIN_DISABLED_STATUSES: readonly StudentStatus[] = ['transferred', 'dropped', 'expelled', 'deceased'];

export function canTransition(from: StudentStatus, to: StudentStatus): boolean {
  return (STUDENT_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Why a status change is refused, or null when it is allowed. `finalTerm` is whether the
 * student's class is in the program's last term (only then can they become alumni).
 */
export function transitionProblem(from: StudentStatus, to: StudentStatus, opts: { reason?: string | null; finalTerm: boolean }): string | null {
  if (from === to) return 'The student already has this status';
  if (!canTransition(from, to)) return `A student who is ${from.replace('_', ' ')} cannot become ${to.replace('_', ' ')}`;
  if (STUDENT_REASON_REQUIRED.includes(to) && !(opts.reason && opts.reason.trim().length >= 3)) return 'Give a reason for this change';
  if (to === 'alumni' && !opts.finalTerm) return 'Only students in the final term can graduate';
  if (to === 'promoted' && opts.finalTerm) return 'Students in the final term graduate instead of being promoted';
  return null;
}

export type LifecycleEventKind = 'status' | 'promotion' | 'section' | 'guardian';

/** GET /v1/students/:id/profile → timeline */
export interface LifecycleEvent {
  id: string;
  kind: LifecycleEventKind;
  fromStatus: StudentStatus | null;
  toStatus: StudentStatus | null;
  fromSection: string | null;
  toSection: string | null;
  reason: string | null;
  effectiveOn: string;
  /** When a leave of absence or suspension ends. */
  returnOn?: string | null;
  /** Who approved the change. */
  approverName?: string | null;
  /** The issued transfer certificate linked to a transfer-out. */
  certificateId?: string | null;
  certificateSerial?: string | null;
  batchId: string | null;
  data: Record<string, unknown> | null;
  actorName: string | null;
  at: string;
}

/** Versioned names of the domain events these workflows write to `domain_events`. */
export const AdmissionsEvents = {
  EnquiryCreated: 'admissions.enquiry.created.v1',
  EnquiryUpdated: 'admissions.enquiry.updated.v1',
  EnquiryAssigned: 'admissions.enquiry.assigned.v1',
  EnquiryStageChanged: 'admissions.enquiry.stage_changed.v1',
  EnquiryFollowUpLogged: 'admissions.enquiry.follow_up_logged.v1',
  CycleCreated: 'admissions.cycle.created.v1',
  CycleUpdated: 'admissions.cycle.updated.v1',
  ApplicationSubmitted: 'admissions.application.submitted.v1',
  ApplicationStatusChanged: 'admissions.application.status_changed.v1',
  ApplicationFeePaid: 'admissions.application.fee_paid.v1',
  DocumentUploaded: 'admissions.document.uploaded.v1',
  DocumentReviewed: 'admissions.document.reviewed.v1',
  EligibilityEvaluated: 'admissions.cycle.eligibility_evaluated.v1',
  MeritListGenerated: 'admissions.merit_list.generated.v1',
  MeritListPublished: 'admissions.merit_list.published.v1',
  OfferAccepted: 'admissions.offer.accepted.v1',
  OfferDeclined: 'admissions.offer.declined.v1',
  ApplicationEnrolled: 'admissions.application.enrolled.v1',
  StudentStatusChanged: 'students.status_changed.v1',
  StudentsPromoted: 'students.promotion_completed.v1',
  GuardianLinked: 'students.guardian_linked.v1',
  GuardianUpdated: 'students.guardian_updated.v1',
  GuardianUnlinked: 'students.guardian_unlinked.v1',
} as const;


// ---------------------------------------------------------------------------------------------
// Seat quotas
// ---------------------------------------------------------------------------------------------

export interface SeatQuota {
  category: string;
  reservedSeats: number;
}

/**
 * Whether one more applicant of `category` may take a seat. Each category has its reserved seats;
 * everything not reserved is general. A categorised applicant uses a reserved seat first, then a
 * general one; an uncategorised applicant (or one whose category has no quota) uses a general
 * seat only. `held` counts the seats already offered, accepted or taken, by category ('' = none).
 */
export function seatAvailable(totalSeats: number, quotas: readonly SeatQuota[], held: Readonly<Record<string, number>>, category: string | null): boolean {
  const reserved = new Map(quotas.map((q) => [q.category, q.reservedSeats]));
  const general = totalSeats - quotas.reduce((n, q) => n + q.reservedSeats, 0);
  let generalUsed = 0;
  let total = 0;
  for (const [cat, n] of Object.entries(held)) {
    total += n;
    generalUsed += Math.max(0, n - (reserved.get(cat) ?? 0));
  }
  if (total >= totalSeats) return false;
  const cat = category ?? '';
  const room = reserved.get(cat);
  if (room !== undefined && (held[cat] ?? 0) < room) return true;
  return generalUsed < general;
}

/**
 * Decides offer or waitlist down a ranked list, honouring category quotas. `held` is what is
 * already taken. The list must already be in rank order.
 */
export function allocateSeats<T extends { category: string | null }>(ranked: readonly T[], totalSeats: number, quotas: readonly SeatQuota[], held: Readonly<Record<string, number>>): ('offer' | 'waitlist')[] {
  const taken: Record<string, number> = { ...held };
  return ranked.map((c) => {
    if (!seatAvailable(totalSeats, quotas, taken, c.category)) return 'waitlist';
    const key = c.category ?? '';
    taken[key] = (taken[key] ?? 0) + 1;
    return 'offer';
  });
}

/** The merit-rule field that stands for the applicant's entrance test score. */
export const ENTRANCE_SCORE_FIELD = 'entrance_score';
