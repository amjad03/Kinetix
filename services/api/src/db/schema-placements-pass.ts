// Placements production pass (migrations 0210-0211): the recruiter interaction log, students' placement documents
// with verification, apprenticeships under NATS with the monthly stipend and its Government of India share, and alumni
// referrals. Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { alumniProfiles, placementCompanies, students, tenants, users } from './schema.js';
import { alumniJobPosts, placementCompanyContacts } from './schema-placements.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** A call, email, meeting or campus visit with a company, with the next step and when to follow up. */
export const placementInteractions = pgTable(
  'placement_interactions',
  {
    id: id(),
    tenantId: tenantId(),
    companyId: uuid('company_id').notNull().references(() => placementCompanies.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => placementCompanyContacts.id, { onDelete: 'set null' }),
    /** call | email | meeting | campus_visit | linkedin | other */
    kind: text('kind').notNull(),
    happenedOn: date('happened_on').notNull(),
    summary: text('summary').notNull(),
    outcome: text('outcome').notNull().default(''),
    nextAction: text('next_action').notNull().default(''),
    followUpOn: date('follow_up_on'),
    /** The follow-up was done (or is no longer needed). */
    followUpDone: boolean('follow_up_done').notNull().default(false),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('placement_interactions_company_idx').on(t.companyId, t.happenedOn), index('placement_interactions_follow_up_idx').on(t.tenantId, t.followUpOn)],
);

/**
 * A student's placement document (resume, mark sheets, ID proof): uploaded by the student or the cell, checked by the
 * cell. A drive can require every required kind verified before a student registers.
 */
export const placementDocuments = pgTable(
  'placement_documents',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    /** resume | marks_10 | marks_12 | diploma | semester_marks | id_proof | photo | other */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** pending | verified | rejected */
    status: text('status').notNull().default('pending'),
    rejectReason: text('reject_reason'),
    reviewedBy: by('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    uploadedBy: by('uploaded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('placement_documents_student_idx').on(t.studentId, t.kind), index('placement_documents_status_idx').on(t.tenantId, t.status)],
);

/**
 * An apprenticeship under the National Apprenticeship Training Scheme (NATS, Boards of Apprenticeship Training): the
 * NATS enrolment, the establishment, the registered contract, the monthly stipend and the Government of India's share
 * paid to the apprentice by DBT, and the certificate of proficiency at the end.
 */
export const apprenticeships = pgTable(
  'apprenticeships',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => placementCompanies.id, { onDelete: 'set null' }),
    establishment: text('establishment').notNull(),
    /** The establishment's id on the NATS portal. */
    establishmentCode: text('establishment_code').notNull().default(''),
    /** The apprentice's enrolment number on the NATS portal. */
    natsEnrolmentNo: text('nats_enrolment_no').notNull().default(''),
    contractNo: text('contract_no').notNull().default(''),
    /** graduate | diploma | vocational */
    category: text('category').notNull().default('graduate'),
    role: text('role').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    /** Monthly stipend the establishment pays, in paise. */
    stipendPaise: integer('stipend_paise').notNull(),
    /** The Government of India's monthly share by DBT, in paise (half the statutory minimum, from the settings). */
    govtSharePaise: integer('govt_share_paise').notNull().default(0),
    /** enrolled | contract_registered | ongoing | completed | terminated */
    status: text('status').notNull().default('enrolled'),
    certificateNo: text('certificate_no'),
    certificateOn: date('certificate_on'),
    note: text('note').notNull().default(''),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('apprenticeships_student_idx').on(t.studentId), uniqueIndex('apprenticeships_contract_uq').on(t.tenantId, t.contractNo).where(sql`${t.contractNo} <> ''`)],
);

/** One month's stipend of an apprenticeship: what the establishment paid and the DBT share credited. */
export const apprenticeshipStipends = pgTable(
  'apprenticeship_stipends',
  {
    id: id(),
    tenantId: tenantId(),
    apprenticeshipId: uuid('apprenticeship_id').notNull().references(() => apprenticeships.id, { onDelete: 'cascade' }),
    /** The first day of the month paid for. */
    month: date('month').notNull(),
    employerPaidPaise: integer('employer_paid_paise').notNull(),
    dbtPaise: integer('dbt_paise').notNull().default(0),
    dbtReference: text('dbt_reference').notNull().default(''),
    paidOn: date('paid_on'),
    recordedBy: by('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('apprenticeship_stipends_month_uq').on(t.apprenticeshipId, t.month)],
);

/** A student asks an alumnus for a referral (to a job post or a company), and how it went. */
export const placementReferrals = pgTable(
  'placement_referrals',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    alumniId: uuid('alumni_id').notNull().references(() => alumniProfiles.id, { onDelete: 'cascade' }),
    jobPostId: uuid('job_post_id').references(() => alumniJobPosts.id, { onDelete: 'set null' }),
    company: text('company').notNull(),
    role: text('role').notNull().default(''),
    message: text('message').notNull().default(''),
    /** requested | referred | interviewing | hired | declined | closed */
    status: text('status').notNull().default('requested'),
    note: text('note').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('placement_referrals_alumni_idx').on(t.alumniId, t.status), index('placement_referrals_student_idx').on(t.studentId)],
);
