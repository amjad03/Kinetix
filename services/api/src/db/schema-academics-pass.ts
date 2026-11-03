// Academics pass (migrations 0200-0201): timetable versions with their draft periods, when a teacher cannot be
// timetabled, and the teaching diary (work-done log). Kept apart from schema.ts, which they reference.
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, smallint, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { electiveBaskets, specialClasses } from './schema-academic-ops.js';
import { academicYears, boardSessions, lessonPlans, rooms, sections, subjects, tenants, timetableSlots, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

export const TIMETABLE_VERSION_STATUSES = ['draft', 'published', 'superseded', 'discarded'] as const;
export type TimetableVersionStatus = (typeof TIMETABLE_VERSION_STATUSES)[number];

/** What a generation run was asked for, kept on the version so it can be run again. */
export interface VersionSettings {
  days?: number[];
  periods?: { startsAt: string; endsAt: string }[];
  structureId?: string | null;
  combine?: { subjectId: string; sectionIds: string[] }[];
  labBlockPeriods?: number;
  maxPerDay?: number;
  maxConsecutive?: number;
}

/** What the generator could not place and the figures of the result. */
export interface VersionReport {
  placed?: number;
  unplaced?: { label: string; sectionId: string | null; missing: number; reason: string }[];
  teachers?: { teacherId: string; name: string; periods: number; limit: number; maxDay: number }[];
  generatedAt?: string;
}

/**
 * A version of the timetable for some classes: a draft (generated, copied from the live timetable or built by hand),
 * the published one now in force, or one it superseded. Publishing copies its periods to `timetable_slots`.
 */
export const timetableVersions = pgTable(
  'timetable_versions',
  {
    id: id(),
    tenantId: tenantId(),
    academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
    versionNo: integer('version_no').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<TimetableVersionStatus>().notNull().default('draft'),
    /** The classes this version is for; publishing replaces their live periods only. */
    sectionIds: uuid('section_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** generated | copy | manual */
    source: text('source').notNull().default('generated'),
    basedOnId: uuid('based_on_id'),
    settings: jsonb('settings').$type<VersionSettings>().notNull().default({}),
    report: jsonb('report').$type<VersionReport>().notNull().default({}),
    notes: text('notes').notNull().default(''),
    effectiveFrom: date('effective_from'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    publishedBy: userRef('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('timetable_versions_no_uq').on(t.tenantId, t.versionNo), index('timetable_versions_status_idx').on(t.tenantId, t.status, t.createdAt)],
);

/** A period of a timetable version (theory, lab block member, tutorial or an elective running in parallel). */
export const timetableVersionSlots = pgTable(
  'timetable_version_slots',
  {
    id: id(),
    tenantId: tenantId(),
    versionId: uuid('version_id').notNull().references(() => timetableVersions.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    dayOfWeek: smallint('day_of_week').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    batch: text('batch'),
    combinedSectionIds: uuid('combined_section_ids').array(),
    /** theory | lab | tutorial | elective */
    kind: text('kind').notNull().default('theory'),
    basketId: uuid('basket_id').references(() => electiveBaskets.id, { onDelete: 'set null' }),
    /** The periods of one lab block share an id, so the block moves together. */
    blockId: uuid('block_id'),
    /** A locked period stays where it is when the version is generated again. */
    locked: boolean('locked').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('timetable_version_slots_version_idx').on(t.versionId, t.dayOfWeek, t.startsAt), index('timetable_version_slots_teacher_idx').on(t.versionId, t.teacherId)],
);

/** A weekly time a teacher cannot be timetabled (the whole day when no times), optionally only between two dates. */
export const facultyUnavailability = pgTable(
  'faculty_unavailability',
  {
    id: id(),
    tenantId: tenantId(),
    teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dayOfWeek: smallint('day_of_week').notNull(),
    startsAt: time('starts_at'),
    endsAt: time('ends_at'),
    fromDate: date('from_date'),
    toDate: date('to_date'),
    reason: text('reason').notNull().default(''),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('faculty_unavailability_teacher_idx').on(t.teacherId, t.dayOfWeek)],
);

export const TEACHING_DELIVERIES = ['lecture', 'tutorial', 'practical', 'seminar', 'discussion', 'demonstration', 'revision', 'test', 'online', 'field_visit'] as const;
export const AGAINST_PLAN = ['as_planned', 'ahead', 'behind', 'unplanned'] as const;

/** The teaching diary: what was taught in one period (or special class), against the lesson plan. */
export const teachingLogs = pgTable(
  'teaching_logs',
  {
    id: id(),
    tenantId: tenantId(),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').notNull().references(() => users.id),
    timetableSlotId: uuid('timetable_slot_id').references(() => timetableSlots.id, { onDelete: 'set null' }),
    specialClassId: uuid('special_class_id').references(() => specialClasses.id, { onDelete: 'set null' }),
    lessonPlanId: uuid('lesson_plan_id').references(() => lessonPlans.id, { onDelete: 'set null' }),
    boardSessionId: uuid('board_session_id').references(() => boardSessions.id, { onDelete: 'set null' }),
    date: date('date').notNull(),
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    batch: text('batch'),
    topicIds: uuid('topic_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** TEACHING_DELIVERIES */
    delivery: text('delivery').notNull().default('lecture'),
    summary: text('summary').notNull().default(''),
    /** AGAINST_PLAN: as planned, ahead of, behind the lesson plan, or no plan for the period. */
    againstPlan: text('against_plan').notNull().default('unplanned'),
    deviationReason: text('deviation_reason').notNull().default(''),
    /** erp | teacher_app | board */
    source: text('source').notNull().default('erp'),
    /** Taught by a substitute teacher. */
    substitute: boolean('substitute').notNull().default(false),
    reviewedBy: userRef('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewRemark: text('review_remark'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('teaching_logs_period_uq').on(t.timetableSlotId, t.date).where(sql`${t.timetableSlotId} is not null`),
    uniqueIndex('teaching_logs_special_uq').on(t.specialClassId).where(sql`${t.specialClassId} is not null`),
    index('teaching_logs_class_idx').on(t.tenantId, t.sectionId, t.subjectId, t.date),
    index('teaching_logs_teacher_idx').on(t.teacherId, t.date),
  ],
);
