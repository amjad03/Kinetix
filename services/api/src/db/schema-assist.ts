// Probation, staff transfers, AI grading drafts, classroom-activity CO tags and tenant signing keys (migration 0115). Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { campuses, courseOutcomes, departments, designations, evalAllocations, evalQuestions, homework, polls, students, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const num = (name: string) => numeric(name, { precision: 6, scale: 2, mode: 'number' });

/**
 * One probation review per cycle: due when the probation ends, the HoD recommends, the principal confirms or extends.
 * Confirming makes the staff member permanent; extending opens the next review on the new date.
 */
export const probationReviews = pgTable(
  'probation_reviews',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dueOn: date('due_on').notNull(),
    status: text('status').notNull().default('pending'), // pending | recommended | confirmed | extended
    hodId: uuid('hod_id').references(() => users.id, { onDelete: 'set null' }),
    recommendation: text('recommendation'), // confirm | extend
    hodRemarks: text('hod_remarks'),
    recommendedAt: timestamp('recommended_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionRemarks: text('decision_remarks'),
    extendedUntil: date('extended_until'),
    letterNo: text('letter_no'),
    createdAt: createdAt(),
  },
  (t) => [index('probation_reviews_user_idx').on(t.userId, t.dueOn), uniqueIndex('probation_reviews_open_uq').on(t.userId).where(sql`${t.status} in ('pending', 'recommended')`)],
);

/** A change of department, campus and/or designation on an effective date. The staff record changes on that date; the row stays as history. */
export const staffTransfers = pgTable(
  'staff_transfers',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fromDepartmentId: uuid('from_department_id').references(() => departments.id, { onDelete: 'set null' }),
    toDepartmentId: uuid('to_department_id').references(() => departments.id, { onDelete: 'set null' }),
    fromDesignationId: uuid('from_designation_id').references(() => designations.id, { onDelete: 'set null' }),
    toDesignationId: uuid('to_designation_id').references(() => designations.id, { onDelete: 'set null' }),
    fromCampusId: uuid('from_campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    toCampusId: uuid('to_campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    effectiveOn: date('effective_on').notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('scheduled'), // scheduled | applied | cancelled
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('staff_transfers_user_idx').on(t.userId, t.effectiveOn), index('staff_transfers_due_idx').on(t.tenantId, t.status, t.effectiveOn)],
);

/** An AI marking draft for a descriptive answer. It is only a suggestion: the examiner or teacher accepts, edits or rejects it. */
export const gradeSuggestions = pgTable(
  'grade_suggestions',
  {
    id: id(),
    tenantId: tenantId(),
    kind: text('kind').notNull(), // eval | homework
    allocationId: uuid('allocation_id').references(() => evalAllocations.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').references(() => evalQuestions.id, { onDelete: 'cascade' }),
    homeworkId: uuid('homework_id').references(() => homework.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    maxMarks: num('max_marks').notNull(),
    suggestedMarks: num('suggested_marks').notNull(),
    rationale: text('rationale').notNull().default(''),
    criteria: jsonb('criteria').$type<{ criterion: string; max: number; awarded: number; comment: string }[]>().notNull().default(sql`'[]'::jsonb`),
    preview: boolean('preview').notNull().default(false),
    status: text('status').notNull().default('draft'), // draft | accepted | edited | rejected
    finalMarks: num('final_marks'),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('grade_suggestions_alloc_idx').on(t.allocationId, t.questionId), index('grade_suggestions_hw_idx').on(t.homeworkId, t.studentId)],
);

/** The course outcome a board poll, quiz or class check was set to measure. */
export const pollCoMap = pgTable(
  'poll_co_map',
  {
    tenantId: tenantId(),
    pollId: uuid('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    coId: uuid('co_id').notNull().references(() => courseOutcomes.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.coId] }), index('poll_co_map_co_idx').on(t.coId)],
);

/** The Ed25519 key pair an institution signs offline board pairing codes with. The private half is encrypted at rest. */
export const tenantSigningKeys = pgTable('tenant_signing_keys', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  keyId: text('key_id').notNull(),
  publicKeyPem: text('public_key_pem').notNull(),
  privateKeyEnc: text('private_key_enc').notNull(),
  createdAt: createdAt(),
});
