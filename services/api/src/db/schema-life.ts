// Campus life, welfare, communication and LMS depth (migrations 0174, 0175 and 0176). Kept apart from schema.ts,
// which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { campusEvents, clubs, homework, lmsItems, mentorAssignments, sections, studentLeaveRequests, students, subjects, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const num = (name: string, p = 6, s = 2) => numeric(name, { precision: p, scale: s, mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const studentRef = () => uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' });

// ---- 0174: NSS, NCC, sports teams and other units ------------------------------------------------

/** An NSS unit, NCC company, sports team or other service unit, with its coordinator. */
export const activityUnits = pgTable('activity_units', {
  id: id(),
  tenantId: tenantId(),
  kind: text('kind').$type<'nss' | 'ncc' | 'sports' | 'other'>().notNull().default('nss'),
  name: text('name').notNull(),
  /** Sports teams: the sport ("Cricket"). */
  sport: text('sport').notNull().default(''),
  coordinatorUserId: userRef('coordinator_user_id'),
  description: text('description').notNull().default(''),
  /** Hours each member should complete (NSS: 240 over two years); 0 = no target. */
  targetHours: integer('target_hours').notNull().default(0),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const unitMembers = pgTable(
  'unit_members',
  {
    id: id(),
    tenantId: tenantId(),
    unitId: uuid('unit_id').notNull().references(() => activityUnits.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    /** member | volunteer | cadet | leader | captain | vice_captain | player */
    role: text('role').notNull().default('member'),
    enrolledOn: date('enrolled_on').notNull(),
    status: text('status').$type<'active' | 'left'>().notNull().default('active'),
    leftOn: date('left_on'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('unit_members_uq').on(t.unitId, t.studentId)],
);

/** A unit's activity: a regular session, a camp, a parade, a match or a tournament. */
export const unitActivities = pgTable(
  'unit_activities',
  {
    id: id(),
    tenantId: tenantId(),
    unitId: uuid('unit_id').notNull().references(() => activityUnits.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('regular'), // regular | camp | parade | match | tournament | special
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    place: text('place').notNull().default(''),
    /** Hours credited to each attendee by default. */
    hours: num('hours').notNull().default(0),
    /** Matches and tournaments: the result ("Won by 4 wickets"). */
    result: text('result').notNull().default(''),
    description: text('description').notNull().default(''),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('unit_activities_unit_idx').on(t.unitId, t.startsOn)],
);

/** Hours a member earned at an activity. */
export const unitHours = pgTable(
  'unit_hours',
  {
    id: id(),
    tenantId: tenantId(),
    activityId: uuid('activity_id').notNull().references(() => unitActivities.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id').notNull().references(() => activityUnits.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    hours: num('hours').notNull(),
    recordedBy: userRef('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('unit_hours_uq').on(t.activityId, t.studentId)],
);

/** The institution's register of student awards and achievements (NAAC 5.3.1). */
export const studentAchievements = pgTable('student_achievements', {
  id: id(),
  tenantId: tenantId(),
  studentId: studentRef(),
  title: text('title').notNull(),
  category: text('category').notNull().default('cultural'), // sports | cultural | academic | technical | social | other
  level: text('level').notNull().default('institution'), // institution | inter_college | university | state | national | international
  position: text('position').notNull().default('participation'), // winner | runner_up | third | participation | special
  eventName: text('event_name').notNull().default(''),
  organiser: text('organiser').notNull().default(''),
  achievedOn: date('achieved_on').notNull(),
  team: boolean('team').notNull().default(false),
  awardPaise: bigint('award_paise', { mode: 'number' }).notNull().default(0),
  evidenceUrl: text('evidence_url').notNull().default(''),
  status: text('status').$type<'pending' | 'verified' | 'rejected'>().notNull().default('pending'),
  verifiedBy: userRef('verified_by'),
  verifiedAt: ts('verified_at'),
  notes: text('notes').notNull().default(''),
  unitId: uuid('unit_id').references(() => activityUnits.id, { onDelete: 'set null' }),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

/** Extension and outreach (NAAC 3.4), gender and sustainability activities (NAAC 7.1). */
export const outreachActivities = pgTable('outreach_activities', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('extension'), // extension | outreach | gender | sustainability | swachh | health | other
  organisedBy: text('organised_by').notNull().default(''),
  agency: text('agency').notNull().default(''),
  heldOn: date('held_on').notNull(),
  endsOn: date('ends_on'),
  place: text('place').notNull().default(''),
  studentsCount: integer('students_count').notNull().default(0),
  staffCount: integer('staff_count').notNull().default(0),
  beneficiaries: integer('beneficiaries').notNull().default(0),
  unitId: uuid('unit_id').references(() => activityUnits.id, { onDelete: 'set null' }),
  description: text('description').notNull().default(''),
  outcome: text('outcome').notNull().default(''),
  evidenceUrl: text('evidence_url').notNull().default(''),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

/** A club's budget for an academic year. */
export const clubBudgets = pgTable(
  'club_budgets',
  {
    id: id(),
    tenantId: tenantId(),
    clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
    yearLabel: text('year_label').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    notes: text('notes').notNull().default(''),
    setBy: userRef('set_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('club_budgets_uq').on(t.clubId, t.yearLabel)],
);

/** A club's expense claim: submitted, approved or rejected, then paid. */
export const clubExpenseClaims = pgTable('club_expense_claims', {
  id: id(),
  tenantId: tenantId(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  yearLabel: text('year_label').notNull(),
  title: text('title').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  spentOn: date('spent_on').notNull(),
  payee: text('payee').notNull().default(''),
  billNo: text('bill_no').notNull().default(''),
  status: text('status').$type<'submitted' | 'approved' | 'rejected' | 'paid'>().notNull().default('submitted'),
  decisionNote: text('decision_note').notNull().default(''),
  decidedBy: userRef('decided_by'),
  decidedAt: ts('decided_at'),
  paidOn: date('paid_on'),
  paymentRef: text('payment_ref').notNull().default(''),
  submittedBy: userRef('submitted_by'),
  createdAt: createdAt(),
});

/** A student council election: posts, candidates, a voting window and a secret ballot. */
export const elections = pgTable('elections', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** Who votes: students of these programmes (null = every active student). */
  programIds: uuid('program_ids').array(),
  votingStartsAt: ts('voting_starts_at').notNull(),
  votingEndsAt: ts('voting_ends_at').notNull(),
  status: text('status').$type<'draft' | 'open' | 'closed' | 'published'>().notNull().default('draft'),
  publishedAt: ts('published_at'),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

export const electionPosts = pgTable('election_posts', {
  id: id(),
  tenantId: tenantId(),
  electionId: uuid('election_id').notNull().references(() => elections.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  seats: integer('seats').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const electionCandidates = pgTable(
  'election_candidates',
  {
    id: id(),
    tenantId: tenantId(),
    postId: uuid('post_id').notNull().references(() => electionPosts.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    manifesto: text('manifesto').notNull().default(''),
    status: text('status').$type<'approved' | 'withdrawn' | 'rejected'>().notNull().default('approved'),
    /** Filled in when the election closes. */
    votes: integer('votes').notNull().default(0),
    elected: boolean('elected').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('election_candidates_uq').on(t.postId, t.studentId)],
);

/** Who has voted, without their choices. */
export const electionVoters = pgTable(
  'election_voters',
  {
    id: id(),
    tenantId: tenantId(),
    electionId: uuid('election_id').notNull().references(() => elections.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    votedAt: ts('voted_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('election_voters_uq').on(t.electionId, t.studentId)],
);

/** The choices, without the voter. */
export const electionBallots = pgTable('election_ballots', {
  id: id(),
  tenantId: tenantId(),
  electionId: uuid('election_id').notNull().references(() => elections.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').notNull().references(() => electionPosts.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').notNull().references(() => electionCandidates.id, { onDelete: 'cascade' }),
});

/** Someone from outside the institution registered for a fest or inter-college event. */
export const eventExternalRegistrations = pgTable('event_external_registrations', {
  id: id(),
  tenantId: tenantId(),
  eventId: uuid('event_id').notNull().references(() => campusEvents.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  institution: text('institution').notNull().default(''),
  status: text('status').$type<'registered' | 'cancelled'>().notNull().default('registered'),
  paidPaise: bigint('paid_paise', { mode: 'number' }).notNull().default(0),
  paymentRef: text('payment_ref').notNull().default(''),
  refundStatus: text('refund_status').$type<'none' | 'due' | 'refunded'>().notNull().default('none'),
  refundRef: text('refund_ref').notNull().default(''),
  refundedAt: ts('refunded_at'),
  qrToken: text('qr_token').notNull(),
  checkedInAt: ts('checked_in_at'),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

/** Duty leave granted to a participant or volunteer; the matching leave request and excused attendance follow. */
export const eventDutyLeaves = pgTable(
  'event_duty_leaves',
  {
    id: id(),
    tenantId: tenantId(),
    eventId: uuid('event_id').notNull().references(() => campusEvents.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    role: text('role').notNull().default('participant'),
    leaveRequestId: uuid('leave_request_id').references(() => studentLeaveRequests.id, { onDelete: 'set null' }),
    excusedCount: integer('excused_count').notNull().default(0),
    grantedBy: userRef('granted_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('event_duty_leaves_uq').on(t.eventId, t.studentId)],
);

// ---- 0175: grievance routing, undertakings, accommodations, mentor channel, learner rules --------

/** Who handles a grievance category first (and who instead, when the complaint is about that person). */
export const grievanceRoutes = pgTable('grievance_routes', {
  id: id(),
  tenantId: tenantId(),
  category: text('category').notNull(),
  assigneeUserId: uuid('assignee_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  backupUserId: userRef('backup_user_id'),
  slaHours: integer('sla_hours'),
  notes: text('notes').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

/** The anti-ragging undertaking (student and parent) collected at admission each year (UGC regulations 2009). */
export const antiraggingUndertakings = pgTable(
  'antiragging_undertakings',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef(),
    yearLabel: text('year_label').notNull(),
    /** The undertaking reference numbers from antiragging.in. */
    studentRef: text('student_ref').notNull().default(''),
    parentRef: text('parent_ref').notNull().default(''),
    submittedOn: date('submitted_on'),
    status: text('status').$type<'pending' | 'received' | 'verified'>().notNull().default('pending'),
    verifiedBy: userRef('verified_by'),
    verifiedAt: ts('verified_at'),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('antiragging_undertakings_uq').on(t.studentId, t.yearLabel)],
);

/** Exam accommodations for a student with a disability (RPwD Act 2016): scribe, extra time, a separate room. */
export const pwdAccommodations = pgTable('pwd_accommodations', {
  id: id(),
  tenantId: tenantId(),
  studentId: studentRef(),
  disability: text('disability').notNull(),
  percent: integer('percent'),
  certificateNo: text('certificate_no').notNull().default(''),
  scribe: boolean('scribe').notNull().default(false),
  extraMinutesPerHour: integer('extra_minutes_per_hour').notNull().default(0),
  separateRoom: boolean('separate_room').notNull().default(false),
  groundFloor: boolean('ground_floor').notNull().default(false),
  other: text('other').notNull().default(''),
  validUntil: date('valid_until'),
  status: text('status').$type<'active' | 'revoked'>().notNull().default('active'),
  approvedBy: userRef('approved_by'),
  createdAt: createdAt(),
});

/** The private channel between a mentor and their mentee. */
export const mentorMessages = pgTable('mentor_messages', {
  id: id(),
  tenantId: tenantId(),
  assignmentId: uuid('assignment_id').notNull().references(() => mentorAssignments.id, { onDelete: 'cascade' }),
  senderUserId: uuid('sender_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  readAt: ts('read_at'),
  createdAt: createdAt(),
});

/** How slow and advanced learners are found: average marks below / from these percentages. */
export const learnerRules = pgTable('learner_rules', {
  id: id(),
  tenantId: tenantId(),
  slowBelowPct: integer('slow_below_pct').notNull().default(40),
  advancedFromPct: integer('advanced_from_pct').notNull().default(75),
  minAssessments: integer('min_assessments').notNull().default(2),
  /** Also slow when attendance is below this (0 = not used). */
  attendanceBelowPct: integer('attendance_below_pct').notNull().default(0),
  updatedBy: userRef('updated_by'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

// ---- 0176: communication and LMS ------------------------------------------------------------------

/** An address that must not be messaged on a channel: on DND, bounced, opted out or invalid. */
export const contactSuppressions = pgTable('contact_suppressions', {
  id: id(),
  tenantId: tenantId(),
  channel: text('channel').$type<'sms' | 'email' | 'whatsapp' | 'all'>().notNull(),
  address: text('address').notNull(),
  userId: userRef('user_id'),
  reason: text('reason').$type<'dnd' | 'bounced' | 'opted_out' | 'invalid'>().notNull().default('dnd'),
  note: text('note').notNull().default(''),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

/** A later due date for one student. */
export const homeworkExtensions = pgTable(
  'homework_extensions',
  {
    id: id(),
    tenantId: tenantId(),
    homeworkId: uuid('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    dueOn: date('due_on').notNull(),
    reason: text('reason').notNull().default(''),
    grantedBy: userRef('granted_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('homework_extensions_uq').on(t.homeworkId, t.studentId)],
);

/** A group for a group assignment; one hand-in counts for every member, and each gets their own marks. */
export const homeworkGroups = pgTable('homework_groups', {
  id: id(),
  tenantId: tenantId(),
  homeworkId: uuid('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  studentIds: uuid('student_ids').array().notNull().default(sql`'{}'`),
  createdAt: createdAt(),
});

/** A student opened (and maybe finished) a course item. */
export const lmsItemProgress = pgTable(
  'lms_item_progress',
  {
    id: id(),
    tenantId: tenantId(),
    itemId: uuid('item_id').notNull().references(() => lmsItems.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    views: integer('views').notNull().default(1),
    firstViewedAt: ts('first_viewed_at').notNull().defaultNow(),
    lastViewedAt: ts('last_viewed_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
  },
  (t) => [uniqueIndex('lms_item_progress_uq').on(t.itemId, t.studentId)],
);

/** An online quiz for a class and subject, optionally drawing a number of questions from its pool per attempt. */
export const lmsQuizzes = pgTable('lms_quizzes', {
  id: id(),
  tenantId: tenantId(),
  sectionId: uuid('section_id').notNull().references(() => sections.id),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id),
  title: text('title').notNull(),
  instructions: text('instructions').notNull().default(''),
  opensAt: ts('opens_at').notNull(),
  closesAt: ts('closes_at').notNull(),
  durationMin: integer('duration_min').notNull().default(30),
  maxAttempts: integer('max_attempts').notNull().default(1),
  /** Questions drawn at random per attempt (null = all of them). */
  drawCount: integer('draw_count'),
  shuffle: boolean('shuffle').notNull().default(true),
  status: text('status').$type<'draft' | 'published' | 'closed'>().notNull().default('draft'),
  createdBy: userRef('created_by'),
  createdAt: createdAt(),
});

export interface QuizOption {
  text: string;
  correct: boolean;
}
export interface CodeTest {
  stdin: string;
  expected: string;
}

export const lmsQuizQuestions = pgTable('lms_quiz_questions', {
  id: id(),
  tenantId: tenantId(),
  quizId: uuid('quiz_id').notNull().references(() => lmsQuizzes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  /** The question bank question it was copied from. */
  qbQuestionId: uuid('qb_question_id'),
  kind: text('kind').$type<'mcq' | 'multi' | 'short' | 'code'>().notNull().default('mcq'),
  text: text('text').notNull(),
  options: jsonb('options').$type<QuizOption[]>().notNull().default([]),
  /** Short answers: the accepted answer(s), separated by "|". */
  answer: text('answer').notNull().default(''),
  marks: num('marks').notNull().default(1),
  /** Coding questions: c | cpp | java, and the tests the program must pass. */
  language: text('language'),
  tests: jsonb('tests').$type<CodeTest[]>().notNull().default([]),
  /** The course outcome this question tests, so quiz results feed CO attainment (migration 0184). */
  coId: uuid('co_id'),
});

export interface QuizResult {
  correct: boolean | null;
  marks: number;
  note?: string;
}

export const lmsQuizAttempts = pgTable(
  'lms_quiz_attempts',
  {
    id: id(),
    tenantId: tenantId(),
    quizId: uuid('quiz_id').notNull().references(() => lmsQuizzes.id, { onDelete: 'cascade' }),
    studentId: studentRef(),
    attemptNo: integer('attempt_no').notNull().default(1),
    questionIds: uuid('question_ids').array().notNull().default(sql`'{}'`),
    answers: jsonb('answers').$type<Record<string, string | number[] | string[]>>().notNull().default({}),
    results: jsonb('results').$type<Record<string, QuizResult>>().notNull().default({}),
    score: num('score', 7, 2),
    maxScore: num('max_score', 7, 2),
    needsMarking: boolean('needs_marking').notNull().default(false),
    startedAt: ts('started_at').notNull().defaultNow(),
    dueAt: ts('due_at').notNull(),
    submittedAt: ts('submitted_at'),
  },
  (t) => [uniqueIndex('lms_quiz_attempts_uq').on(t.quizId, t.studentId, t.attemptNo)],
);
