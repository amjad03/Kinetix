// Academic planning (migration 0153) and the attendance desk (migration 0154): elective baskets, requisites, credit
// transfers, faculty allocation, period structures, special classes, compensatory working days, lab batches,
// leave and on-duty, special-class attendance and attendance alerts. Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { academicYears, attendanceStatus, programs, rooms, sections, students, subjects, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const num = (name: string, precision: number, scale: number) => numeric(name, { precision, scale, mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

// ---- academic planning (0153) -------------------------------------------------------------------

/**
 * A choice-based credit basket of a programme's term: the electives (or open electives, minors, honours, skill
 * courses) a student picks from, how many and how many credits. Members are in `elective_basket_subjects`.
 */
export const electiveBaskets = pgTable(
  'elective_baskets',
  {
    id: id(),
    tenantId: tenantId(),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    term: smallint('term').notNull(),
    name: text('name').notNull(),
    /** elective | open_elective | minor | honours | skill | value_added */
    kind: text('kind').notNull().default('elective'),
    minChoose: smallint('min_choose').notNull().default(1),
    maxChoose: smallint('max_choose').notNull().default(1),
    minCredits: num('min_credits', 4, 1),
    maxCredits: num('max_credits', 4, 1),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('elective_baskets_name_uq').on(t.tenantId, t.programId, t.term, t.name)],
);

export const electiveBasketSubjects = pgTable(
  'elective_basket_subjects',
  {
    tenantId: tenantId(),
    basketId: uuid('basket_id').notNull().references(() => electiveBaskets.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.basketId, t.subjectId] })],
);

/** A course that must be passed before (prerequisite) or taken with (co-requisite) another. */
export const subjectRequisites = pgTable(
  'subject_requisites',
  {
    id: id(),
    tenantId: tenantId(),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    requiresSubjectId: uuid('requires_subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    /** prerequisite | corequisite */
    kind: text('kind').notNull().default('prerequisite'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('subject_requisites_uq').on(t.subjectId, t.requiresSubjectId)],
);

/**
 * Credits earned elsewhere and counted here: Academic Bank of Credits transfers, SWAYAM/NPTEL MOOCs and courses at
 * another institution, mapped to one of the programme's courses once approved.
 */
export const creditTransfers = pgTable(
  'credit_transfers',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** abc | swayam | nptel | mooc | institution */
    source: text('source').notNull(),
    courseTitle: text('course_title').notNull(),
    provider: text('provider').notNull().default(''),
    /** The certificate number or the ABC transaction id. */
    externalRef: text('external_ref').notNull().default(''),
    credits: num('credits', 4, 1).notNull(),
    grade: text('grade').notNull().default(''),
    completedOn: date('completed_on'),
    term: smallint('term'),
    mappedSubjectId: uuid('mapped_subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** pending | approved | rejected */
    status: text('status').notNull().default('pending'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('credit_transfers_student_idx').on(t.studentId), index('credit_transfers_status_idx').on(t.tenantId, t.status)],
);

/**
 * Who teaches a course to a class (or one of its lab batches) and for how many hours a week, from and to a date. A
 * mid-semester change ends one allocation and starts another, so attendance and plans keep their history.
 */
export const facultyAllocations = pgTable(
  'faculty_allocations',
  {
    id: id(),
    tenantId: tenantId(),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** primary | co_teacher | lab | tutorial */
    role: text('role').notNull().default('primary'),
    batch: text('batch'),
    hoursPerWeek: smallint('hours_per_week').notNull().default(0),
    fromDate: date('from_date'),
    toDate: date('to_date'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('faculty_allocations_teacher_idx').on(t.teacherId), index('faculty_allocations_class_idx').on(t.sectionId, t.subjectId)],
);

export interface BellPeriod {
  label: string;
  startsAt: string;
  endsAt: string;
  /** class | break */
  kind: 'class' | 'break';
}

/** A bell schedule: the periods and breaks of a day, for every programme or one. */
export const periodStructures = pgTable(
  'period_structures',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    /** ISO weekdays it applies to. */
    days: smallint('days').array().notNull().default(sql`'{1,2,3,4,5,6}'::smallint[]`),
    periods: jsonb('periods').$type<BellPeriod[]>().notNull().default([]),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('period_structures_name_uq').on(t.tenantId, t.name)],
);

/** A class held outside the weekly timetable: an extra, special, remedial or make-up class on one date. */
export const specialClasses = pgTable(
  'special_classes',
  {
    id: id(),
    tenantId: tenantId(),
    /** extra | special | remedial | makeup */
    kind: text('kind').notNull().default('extra'),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').notNull().references(() => users.id),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    batch: text('batch'),
    date: date('date').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    topic: text('topic').notNull().default(''),
    /** scheduled | held | cancelled */
    status: text('status').notNull().default('scheduled'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('special_classes_date_idx').on(t.tenantId, t.date), index('special_classes_teacher_idx').on(t.teacherId, t.date)],
);

/** A compensatory working day: on `date` the classes of `follows_weekday`'s timetable meet (a Saturday follows Monday). */
export const workingDaySwaps = pgTable(
  'working_day_swaps',
  {
    id: id(),
    tenantId: tenantId(),
    date: date('date').notNull(),
    followsWeekday: smallint('follows_weekday').notNull(),
    /** Null = every programme. */
    programIds: uuid('program_ids').array(),
    reason: text('reason').notNull().default(''),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('working_day_swaps_date_uq').on(t.tenantId, t.date)],
);

/** A student's lab or tutorial batch in their class ("B1"). Periods with a batch are attended by its students only. */
export const studentBatches = pgTable(
  'student_batches',
  {
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    batch: text('batch').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.studentId] })],
);

// ---- attendance desk (0154) ----------------------------------------------------------------------

/**
 * Leave and on-duty for a student: on duty (events, sports, NSS, placement drives), medical (with a certificate) or
 * personal. Approval writes the marks of the days (or hours) it covers, as the attendance policy says each kind counts.
 */
export const attendanceLeaves = pgTable(
  'attendance_leaves',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** on_duty | medical | personal */
    kind: text('kind').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** Part of a day: only periods that start inside this window (null = the whole day). */
    fromTime: time('from_time'),
    toTime: time('to_time'),
    reason: text('reason').notNull(),
    /** The activity for on duty ("Inter-college fest", "NSS camp"). */
    activity: text('activity').notNull().default(''),
    documentKey: text('document_key'),
    documentType: text('document_type'),
    /** pending | approved | rejected | cancelled */
    status: text('status').notNull().default('pending'),
    /** The mark approval wrote (present for on duty, excused or absent as the policy says). */
    countsAs: attendanceStatus('counts_as'),
    appliedMarks: integer('applied_marks').notNull().default(0),
    /** The marks approval wrote, as `slotId|date` (`day|date` for a day mark), so revoking puts them back to absent. */
    applied: jsonb('applied').$type<string[]>().notNull().default([]),
    requestedBy: userRef('requested_by'),
    decidedBy: userRef('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('attendance_leaves_student_idx').on(t.studentId, t.fromDate), index('attendance_leaves_status_idx').on(t.tenantId, t.status)],
);

/** Attendance at a special class (special_classes). */
export const specialClassAttendance = pgTable(
  'special_class_attendance',
  {
    tenantId: tenantId(),
    specialClassId: uuid('special_class_id').notNull().references(() => specialClasses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: attendanceStatus('status').notNull(),
    markedBy: userRef('marked_by'),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.specialClassId, t.studentId] })],
);

/** Forenoon and afternoon marks when the institution takes attendance by session (schools). */
export const attendanceSessionMarks = pgTable(
  'attendance_session_marks',
  {
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    /** fn | an */
    session: text('session').notNull(),
    status: attendanceStatus('status').notNull(),
    markedBy: userRef('marked_by'),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.date, t.session] }), index('attendance_session_marks_section_idx').on(t.sectionId, t.date)],
);

/** Each shortage alert sent to a student and their family, so a level is announced once. */
export const attendanceAlerts = pgTable(
  'attendance_alerts',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** shortage | warning */
    kind: text('kind').notNull(),
    /** The subject id, or 'overall'. */
    scope: text('scope').notNull(),
    level: smallint('level').notNull(),
    percent: num('percent', 5, 1).notNull(),
    recipients: integer('recipients').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_alerts_once_uq').on(t.studentId, t.kind, t.scope, t.level), index('attendance_alerts_sent_idx').on(t.tenantId, t.sentAt)],
);
