// HR depth (migrations 0165–0167): prior experience, publications and documents on the staff record,
// compensatory-off credits, attendance regularisation, recruitment interviews and DA rate history.
// Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, date, index, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { jobApplicants, salaryComponents, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const owner = () => uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' });

/** Service before joining this institution: teaching, industry, research or administrative. */
export const staffExperience = pgTable(
  'staff_experience',
  {
    id: id(),
    tenantId: tenantId(),
    userId: owner(),
    organisation: text('organisation').notNull(),
    designation: text('designation').notNull().default(''),
    /** teaching | industry | research | administrative */
    kind: text('kind').notNull().default('teaching'),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    lastPayPaise: bigint('last_pay_paise', { mode: 'number' }),
    reasonForLeaving: text('reason_for_leaving').notNull().default(''),
    verifiedBy: by('verified_by'),
    verifiedAt: ts('verified_at'),
    createdAt: createdAt(),
  },
  (t) => [index('staff_experience_user_idx').on(t.userId, t.fromDate)],
);

/** A paper, book, chapter or patent (NAAC 3.3.x, NIRF and the UGC API score). */
export const staffPublications = pgTable(
  'staff_publications',
  {
    id: id(),
    tenantId: tenantId(),
    userId: owner(),
    /** journal | conference | book | chapter | patent | other */
    kind: text('kind').notNull().default('journal'),
    title: text('title').notNull(),
    authors: text('authors').notNull().default(''),
    /** The journal, conference or publisher. */
    venue: text('venue').notNull().default(''),
    year: smallint('year').notNull(),
    volume: text('volume').notNull().default(''),
    pages: text('pages').notNull().default(''),
    issnIsbn: text('issn_isbn').notNull().default(''),
    doi: text('doi').notNull().default(''),
    /** scopus | wos | ugc_care | peer_reviewed | none */
    indexing: text('indexing').notNull().default('none'),
    impactFactor: numeric('impact_factor', { precision: 7, scale: 3, mode: 'number' }),
    /** sole | first | corresponding | co_author */
    authorRole: text('author_role').notNull().default('co_author'),
    /** published | accepted | filed | granted */
    status: text('status').notNull().default('published'),
    verifiedBy: by('verified_by'),
    verifiedAt: ts('verified_at'),
    createdAt: createdAt(),
  },
  (t) => [index('staff_publications_user_idx').on(t.userId, t.year)],
);

/** A document on file for a staff member (ID proofs, certificates, orders) with its scan. */
export const staffDocuments = pgTable(
  'staff_documents',
  {
    id: id(),
    tenantId: tenantId(),
    userId: owner(),
    /** aadhaar | pan | photo | degree | marks_card | experience | appointment | relieving | address_proof | bank | caste | disability | other */
    kind: text('kind').notNull().default('other'),
    title: text('title').notNull(),
    number: text('number').notNull().default(''),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    fileKey: text('file_key'),
    fileType: text('file_type'),
    fileName: text('file_name'),
    verifiedBy: by('verified_by'),
    verifiedAt: ts('verified_at'),
    createdAt: createdAt(),
  },
  (t) => [index('staff_documents_user_idx').on(t.userId, t.kind)],
);

/** A day's leave earned by working on a weekly off or holiday; once approved it can be taken as compensatory off. */
export const compOffCredits = pgTable(
  'comp_off_credits',
  {
    id: id(),
    tenantId: tenantId(),
    userId: owner(),
    workedOn: date('worked_on').notNull(),
    days: numeric('days', { precision: 3, scale: 1, mode: 'number' }).notNull().default(1),
    reason: text('reason').notNull(),
    /** pending | approved | rejected */
    status: text('status').notNull().default('pending'),
    expiresOn: date('expires_on').notNull(),
    decidedBy: by('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('comp_off_credits_day_uq').on(t.userId, t.workedOn).where(sql`${t.status} <> 'rejected'`)],
);

/** A request to correct a day's attendance (a missed punch, late arrival on duty, work away from campus). */
export const attendanceRegularisations = pgTable(
  'attendance_regularisations',
  {
    id: id(),
    tenantId: tenantId(),
    userId: owner(),
    date: date('date').notNull(),
    /** missed_punch | late_arrival | early_departure | on_duty | work_from_home | other */
    kind: text('kind').notNull().default('missed_punch'),
    inTime: text('in_time'),
    outTime: text('out_time'),
    /** present | half_day */
    requestedStatus: text('requested_status').notNull().default('present'),
    reason: text('reason').notNull(),
    /** pending | approved | rejected */
    status: text('status').notNull().default('pending'),
    decidedBy: by('decided_by'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('attendance_regularisations_idx').on(t.tenantId, t.status, t.date)],
);

/** An interview, demonstration class or written test of an applicant, with its panel. */
export const jobInterviews = pgTable(
  'job_interviews',
  {
    id: id(),
    tenantId: tenantId(),
    applicantId: uuid('applicant_id').notNull().references(() => jobApplicants.id, { onDelete: 'cascade' }),
    round: smallint('round').notNull().default(1),
    /** interview | demo_class | written_test | hr */
    kind: text('kind').notNull().default('interview'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    /** in_person | online */
    mode: text('mode').notNull().default('in_person'),
    venue: text('venue').notNull().default(''),
    panelIds: jsonb('panel_ids').$type<string[]>().notNull().default([]),
    /** scheduled | completed | cancelled */
    status: text('status').notNull().default('scheduled'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('job_interviews_applicant_idx').on(t.applicantId, t.round)],
);

/** One panel member's scores for an interview (each criterion out of 10). */
export const jobInterviewScores = pgTable(
  'job_interview_scores',
  {
    id: id(),
    tenantId: tenantId(),
    interviewId: uuid('interview_id').notNull().references(() => jobInterviews.id, { onDelete: 'cascade' }),
    panelistId: uuid('panelist_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scores: jsonb('scores').$type<Record<string, number>>().notNull(),
    /** Percentage of the maximum. */
    total: numeric('total', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    /** select | hold | reject */
    recommendation: text('recommendation').notNull(),
    remarks: text('remarks').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('job_interview_scores_uq').on(t.interviewId, t.panelistId)],
);

/** The rate of a percentage component from a month on (a DA revision). */
export const salaryComponentRates = pgTable(
  'salary_component_rates',
  {
    id: id(),
    tenantId: tenantId(),
    componentId: uuid('component_id').notNull().references(() => salaryComponents.id, { onDelete: 'cascade' }),
    effectiveMonth: text('effective_month').notNull(),
    percent: numeric('percent', { precision: 7, scale: 3, mode: 'number' }).notNull(),
    note: text('note').notNull().default(''),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('salary_component_rates_uq').on(t.componentId, t.effectiveMonth)],
);
