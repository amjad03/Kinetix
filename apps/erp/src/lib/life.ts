// Types for campus life depth (v1/campus-life units, budgets, events, elections, reports), welfare depth
// (v1/welfare, v1/mentoring extras) and LMS depth (v1/lms quizzes, v1/homework settings).

export interface StudentPick { id: string; fullName: string; rollNo: string }

export interface UnitMember { id: string; studentId: string; fullName: string; rollNo: string; className: string; role: string; enrolledOn: string; status: 'active' | 'left'; leftOn: string | null; hours: number; targetMet: boolean | null }
export interface UnitActivity { id: string; title: string; kind: string; startsOn: string; endsOn: string; place: string; hours: number; result: string; description: string; attendees: number }
export interface UnitDetail { unit: { id: string; name: string; kind: string; sectionId?: string; targetHours: number }; members: UnitMember[]; activities: UnitActivity[] }

export interface BudgetRow { clubId: string; club: string; budgetPaise: number | null; notes: string | null; submittedPaise: number; approvedPaise: number; paidPaise: number; remainingPaise: number | null }
export interface BudgetSummary { year: string; clubs: BudgetRow[] }

export interface Clashes { exams: { title: string; from: string; to: string }[]; venue: { id: string; title: string; startsAt: string; endsAt: string }[] }
export interface ExternalRegistration { id: string; fullName: string; email: string; phone: string; institution: string; status: 'registered' | 'cancelled'; paidPaise: number; paymentRef: string; refundStatus: 'none' | 'due' | 'refunded'; qrToken: string; checkedInAt: string | null }
export interface RefundRow { id: string; kind: 'student' | 'external'; name: string; rollNo?: string; institution?: string; paidPaise: number; paymentRef: string; refundStatus: 'due' | 'refunded'; refundRef: string; refundedAt: string | null }
export interface DutyLeaveRow { id: string; studentId: string; fullName: string; rollNo: string; className: string; role: string; fromDate: string; toDate: string; excusedCount: number; grantedBy: string | null }

export interface Candidate { id: string; postId: string; studentId: string; fullName: string; rollNo: string; className: string; manifesto: string; votes?: number; elected?: boolean }
export interface ElectionPost { id: string; title: string; seats: number; candidates: Candidate[] }
export interface ElectionDetail { election: { id: string; title: string; description: string; status: 'draft' | 'open' | 'closed' | 'published'; votingStartsAt: string; votingEndsAt: string }; posts: ElectionPost[]; voted: number; electorate: number }

export interface NaacLife {
  year: string;
  m531: { awards: number; byLevel: { level: string; n: number }[] };
  m533: { events: number; byType: { type: string; n: number }[] };
  m343: { programmes: number };
  m344: { students: number; reached: number };
  m711: { gender: number; sustainability: number };
}
export interface EventRegisterRow { id: string; title: string; eventType: string; startsAt: string; venue: string; status: string; budgetPaise: number; spentPaise: number; registered: number; external: number; attended: number; feesPaise: number; refundsDue: number; hasReport: boolean }
export interface ParticipationRow { sectionId: string; className: string; students: number; inClubs: number; inUnits: number; attendedEvents: number; withAchievements: number }
export interface UnitHoursRow { unitId: string; unit: string; kind: string; target: number; studentId: string; fullName: string; rollNo: string; className: string; role: string; status: string; hours: number; camps: number; complete: boolean | null }

// ---- welfare ----
export interface UndertakingClass { sectionId: string; className: string; students: number; pending: number; received: number; verified: number; missing: number }
export interface GrievanceReport { year: string; total: number; resolved: number; pending: number; byCategory: { category: string; committee: string | null; received: number; resolved: number; avgDays: number | null; appeals: number; overturned: number }[] }
export interface LearnerRules { slowBelowPct: number; advancedFromPct: number; minAssessments: number; attendanceBelowPct: number }
export interface LearnerRow { studentId: string; fullName: string; rollNo: string; avgPct: number | null; assessments: number; attendancePct: number | null; level: 'slow' | 'average' | 'advanced' | 'not_enough'; openPlan: boolean }
export interface MentorStat { mentorUserId: string; mentorName: string; mentees: number; sessions90: number; openPlans: number; closedPlans: number; improved: number; sessionsPerMentee: number }
export interface OutcomeStats { from: string; opened: number; closed: number; improved: number; unchanged: number; declined: number; avgGain: number | null }
export interface MentorChannel { assignmentId: string; studentId: string; studentName: string; rollNo: string; className: string; hasLogin: boolean; unread: number; lastAt: string | null }
export interface MentorMessage { id: string; senderUserId: string; senderName: string; body: string; readAt: string | null; createdAt: string }

// ---- LMS ----
export interface HomeworkSettings { homeworkId: string; title: string; dueOn: string; maxMarks: number | null; latePolicy: 'accept' | 'penalty' | 'reject'; latePenaltyPct: number; cutoffOn: string | null; maxAttempts: number; rubricId: string | null; groupMode: boolean; pushedAssessmentId: string | null; extensions: { studentId: string; fullName: string; rollNo: string; dueOn: string; reason: string }[]; groups: { id: string; name: string; studentIds: string[] }[] }
export interface SubmissionRow { studentId: string; fullName: string; rollNo: string; status: 'submitted' | 'checked' | 'returned' | null; submittedAt: string | null; late: boolean | null; marks: number | null; penaltyPct: number | null; attempts: number | null }
export interface ComplianceRow { id: string; title: string; subject: string; dueOn: string; maxMarks: number | null; submitted: number; late: number; checked: number; avgMarks: number | null; onTime: number; missing: number; compliancePct: number }
export interface QuizQuestion { id: string; position: number; kind: 'mcq' | 'multi' | 'short' | 'code'; text: string; options: { text: string; correct: boolean }[]; answer: string; marks: number; language: string | null; tests: { stdin: string; expected: string }[] }
export interface QuizDetail { id: string; title: string; status: 'draft' | 'published' | 'closed'; sectionId: string; subjectId: string; opensAt: string; closesAt: string; durationMin: number; maxAttempts: number; drawCount: number | null; questions: QuizQuestion[] }
export interface QuizAttemptRow { id: string; studentId: string; fullName: string; rollNo: string; attemptNo: number; submittedAt: string | null; score: number | null; maxScore: number | null; needsMarking: boolean; answers: Record<string, unknown>; results: Record<string, { correct: boolean | null; marks: number; note?: string }>; questionIds: string[] }
export interface QuizAnalysis { quizId: string; title: string; attempts: number; averagePct: number | null; bands: { from: number; to: number; n: number }[]; items: { questionId: string; position: number; kind: string; text: string; marks: number; attempts: number; difficulty: number | null; discrimination: number | null }[] }

/**
 * A date-time typed in a form ("2026-10-20T10:00", no zone) as an instant in the school's time zone. Values that
 * already carry a zone pass through; an empty value stays empty.
 */
export function zonedIso(local: string | undefined, timeZone: string): string | undefined {
  if (!local) return undefined;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(local)) return local;
  const asUtc = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(asUtc.getTime())) return local;
  const wall = (tz: string) => new Date(asUtc.toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(asUtc.getTime() - (wall(timeZone) - wall('UTC'))).toISOString();
}
