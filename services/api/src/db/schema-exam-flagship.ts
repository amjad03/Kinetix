// Examinations flagship (migrations 0186-0188): applications by subject, question paper setting, marks unlock requests.
import { sql } from 'drizzle-orm';
import { bigint, date, index, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { assessments, examSessions, qbPapers, students, subjects, tenants, users } from './schema.js';

const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * One subject a candidate applied to write in a session: this term's paper (regular), a failed subject of an earlier
 * session (backlog) or a passed one taken again (improvement), with its eligibility and its share of the exam fee.
 */
export const examApplicationSubjects = pgTable(
  'exam_application_subjects',
  {
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'regular' | 'backlog' | 'improvement'>().notNull(),
    status: text('status').$type<'eligible' | 'ineligible' | 'withdrawn'>().notNull().default('eligible'),
    reasons: jsonb('reasons').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    feePaise: bigint('fee_paise', { mode: 'number' }).notNull().default(0),
    failedInSessionId: uuid('failed_in_session_id').references(() => examSessions.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId, t.subjectId] }), index('exam_application_subjects_student_idx').on(t.studentId)],
);

/** A setter or moderator appointed for a subject of a session, with the sets to set, the due date and the fee. */
export const qpAppointments = pgTable(
  'qp_appointments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    role: text('role').$type<'setter' | 'moderator'>().notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    setsRequired: smallint('sets_required').notNull().default(2),
    dueOn: date('due_on').notNull(),
    /** appointed, accepted, declined, submitted, completed or cancelled */
    status: text('status').notNull().default('appointed'),
    remunerationPaise: bigint('remuneration_paise', { mode: 'number' }).notNull().default(0),
    note: text('note'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('qp_appointments_session_idx').on(t.sessionId, t.subjectId), index('qp_appointments_user_idx').on(t.userId, t.status)],
);

/** The set drawn for the examination from the locked sets of a session's subject. */
export const qpSetDraws = pgTable(
  'qp_set_draws',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: tenantId(),
    sessionId: uuid('session_id').notNull().references(() => examSessions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => qbPapers.id, { onDelete: 'cascade' }),
    /** The sets the draw was made from: [{ paperId, setLabel }]. */
    candidates: jsonb('candidates').$type<{ paperId: string; setLabel: string }[]>().notNull().default(sql`'[]'::jsonb`),
    drawnBy: uuid('drawn_by').notNull().references(() => users.id),
    drawnAt: timestamp('drawn_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('qp_set_draws_uq').on(t.sessionId, t.subjectId)],
);

/** A teacher's request to reopen submitted, verified or locked marks; the head of department or controller decides. */
export const marksUnlockRequests = pgTable(
  'marks_unlock_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: tenantId(),
    assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    reason: text('reason').notNull(),
    /** pending, approved, rejected or cancelled */
    status: text('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('marks_unlock_requests_assessment_idx').on(t.assessmentId, t.status)],
);
