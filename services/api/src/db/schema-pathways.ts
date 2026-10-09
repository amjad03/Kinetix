// Projects, impact, careers, thesis, datasets, student life extras, evidence, retention, communication and parent visibility (migration 0119).
// Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  alumniProfiles,
  campusEvents,
  certificates,
  clubs,
  committeeMeetings,
  committees,
  courseOutcomes,
  disciplineIncidents,
  eventRegistrations,
  feePayments,
  grievanceTickets,
  internships,
  placementDrives,
  researchProjects,
  researchScholars,
  skills,
  students,
  subjects,
  tenants,
  users,
} from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const num = (name: string, p = 8, s = 2) => numeric(name, { precision: p, scale: s, mode: 'number' });
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const studentRef = (name: string) => uuid(name).notNull().references(() => students.id, { onDelete: 'cascade' });
const projectRef = () => uuid('project_id').notNull().references(() => researchProjects.id, { onDelete: 'cascade' });

// ---- Projects and collaboration -------------------------------------------------------------

/** A file or link shared in a project's workspace. Bytes (when any) live in object storage under `storageKey`. */
export const projectFiles = pgTable(
  'project_files',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: projectRef(),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('file'), // file | link | report | code | slides
    url: text('url'),
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    uploadedBy: userRef('uploaded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('project_files_project_idx').on(t.projectId)],
);

/** The discussion thread of a project; `parentId` makes a reply. */
export const projectComments = pgTable(
  'project_comments',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: projectRef(),
    authorUserId: uuid('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('project_comments_project_idx').on(t.projectId, t.createdAt)],
);

/** A rubric review of a project by its mentor, a peer or an external reviewer: criterion -> score. */
export const projectReviews = pgTable(
  'project_reviews',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: projectRef(),
    reviewerUserId: uuid('reviewer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('mentor'), // mentor | peer | external
    rubric: jsonb('rubric').$type<Record<string, number>>().notNull().default({}),
    maxPerCriterion: smallint('max_per_criterion').notNull().default(5),
    total: num('total', 6, 2).notNull(),
    percent: num('percent', 5, 2).notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('project_reviews_project_idx').on(t.projectId)],
);

/** The project viva: a panel, a time, and the outcome. */
export const projectVivas = pgTable(
  'project_vivas',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: projectRef(),
    scheduledAt: ts('scheduled_at').notNull(),
    venue: text('venue').notNull().default(''),
    panel: jsonb('panel').$type<{ userId?: string; name: string }[]>().notNull().default([]),
    status: text('status').notNull().default('scheduled'), // scheduled | held | cancelled
    outcome: text('outcome'), // pass | revise | fail
    score: num('score', 5, 2),
    remarks: text('remarks'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('project_vivas_project_idx').on(t.projectId)],
);

/** A student's portfolio: what they chose to show, with a public flag. */
export const portfolioItems = pgTable(
  'portfolio_items',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef('student_id'),
    projectId: uuid('project_id').references(() => researchProjects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    url: text('url'),
    kind: text('kind').notNull().default('project'), // project | research | certificate | work
    published: boolean('published').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('portfolio_items_student_idx').on(t.studentId)],
);

/** Whether a project recruits (skills it looks for) and whether it is on the showcase. */
export const projectHub = pgTable(
  'project_hub',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: projectRef(),
    showcase: boolean('showcase').notNull().default(false),
    summary: text('summary').notNull().default(''),
    recruiting: boolean('recruiting').notNull().default(false),
    lookingFor: jsonb('looking_for').$type<string[]>().notNull().default([]),
    openings: smallint('openings').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('project_hub_project_uq').on(t.projectId)],
);

/** A student's request to join a recruiting project. */
export const projectJoinRequests = pgTable(
  'project_join_requests',
  {
    id: id(),
    tenantId: tenantId(),
    projectId: projectRef(),
    studentId: studentRef('student_id'),
    message: text('message').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | accepted | declined
    decidedBy: userRef('decided_by'),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('project_join_requests_uq').on(t.projectId, t.studentId)],
);

// ---- Impact -----------------------------------------------------------------------------------

/** An institution's own impact framework (beyond the UN SDGs): indicators with units. */
export const impactFrameworks = pgTable(
  'impact_frameworks',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    indicators: jsonb('indicators').$type<{ code: string; name: string; unit: string }[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('impact_frameworks_code_uq').on(t.tenantId, t.code)],
);

/** A measured contribution of a project, event, internship or activity to one indicator. */
export const impactRecords = pgTable(
  'impact_records',
  {
    id: id(),
    tenantId: tenantId(),
    frameworkId: uuid('framework_id').notNull().references(() => impactFrameworks.id, { onDelete: 'cascade' }),
    indicatorCode: text('indicator_code').notNull(),
    subjectKind: text('subject_kind').notNull(), // project | event | internship | club_activity | other
    subjectRef: text('subject_ref').notNull().default(''),
    quantity: num('quantity', 12, 2).notNull(),
    note: text('note').notNull().default(''),
    recordedOn: date('recorded_on').notNull(),
    recordedBy: userRef('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('impact_records_framework_idx').on(t.frameworkId, t.indicatorCode)],
);

// ---- Careers ----------------------------------------------------------------------------------

/** The resume a student keeps: the placement cell reads it and prints it as a PDF. */
export const studentResumes = pgTable(
  'student_resumes',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef('student_id'),
    headline: text('headline').notNull().default(''),
    summary: text('summary').notNull().default(''),
    education: jsonb('education').$type<{ institution: string; degree: string; years: string; score?: string }[]>().notNull().default([]),
    experience: jsonb('experience').$type<{ org: string; role: string; years: string; detail?: string }[]>().notNull().default([]),
    projects: jsonb('projects').$type<{ title: string; detail?: string; url?: string }[]>().notNull().default([]),
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    interests: jsonb('interests').$type<string[]>().notNull().default([]),
    links: jsonb('links').$type<{ label: string; url: string }[]>().notNull().default([]),
    visibleToRecruiters: boolean('visible_to_recruiters').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('student_resumes_student_uq').on(t.studentId)],
);

export interface AptitudeQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
  topic: string;
}

/** An online aptitude test, free-standing or for a placement drive. */
export const aptitudeTests = pgTable(
  'aptitude_tests',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    category: text('category').notNull().default('mixed'), // quant | logical | verbal | technical | mixed
    durationMin: smallint('duration_min').notNull().default(30),
    passPercent: smallint('pass_percent').notNull().default(40),
    questions: jsonb('questions').$type<AptitudeQuestion[]>().notNull().default([]),
    driveId: uuid('drive_id').references(() => placementDrives.id, { onDelete: 'set null' }),
    active: boolean('active').notNull().default(true),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('aptitude_tests_drive_idx').on(t.driveId)],
);

export const aptitudeAttempts = pgTable(
  'aptitude_attempts',
  {
    id: id(),
    tenantId: tenantId(),
    testId: uuid('test_id').notNull().references(() => aptitudeTests.id, { onDelete: 'cascade' }),
    studentId: studentRef('student_id'),
    answers: jsonb('answers').$type<(number | null)[]>().notNull().default([]),
    score: integer('score').notNull().default(0),
    total: integer('total').notNull().default(0),
    percent: num('percent', 5, 2).notNull().default(0),
    passed: boolean('passed').notNull().default(false),
    topicScores: jsonb('topic_scores').$type<Record<string, { right: number; total: number }>>().notNull().default({}),
    startedAt: ts('started_at').notNull().defaultNow(),
    submittedAt: ts('submitted_at'),
  },
  (t) => [index('aptitude_attempts_test_idx').on(t.testId, t.studentId)],
);

/** A career path: the skills it asks for, typical roles and the steps to get there. */
export const careerPaths = pgTable(
  'career_paths',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    family: text('family').notNull().default(''),
    description: text('description').notNull().default(''),
    requiredSkills: jsonb('required_skills').$type<string[]>().notNull().default([]),
    roles: jsonb('roles').$type<string[]>().notNull().default([]),
    steps: jsonb('steps').$type<{ title: string; detail: string }[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('career_paths_title_uq').on(t.tenantId, t.title)],
);

/** A mock interview or communication practice: prompts, the student's answers and the feedback. */
export const mockInterviews = pgTable(
  'mock_interviews',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef('student_id'),
    kind: text('kind').notNull().default('hr'), // hr | technical | communication
    role: text('role').notNull().default(''),
    questions: jsonb('questions').$type<{ prompt: string; keywords: string[] }[]>().notNull().default([]),
    answers: jsonb('answers').$type<{ answer: string; seconds?: number }[]>().notNull().default([]),
    feedback: jsonb('feedback').$type<{ perQuestion: { score: number; notes: string[] }[]; overall: string[] }>(),
    score: num('score', 5, 2),
    status: text('status').notNull().default('in_progress'), // in_progress | completed
    aiUsed: boolean('ai_used').notNull().default(false),
    createdAt: createdAt(),
    completedAt: ts('completed_at'),
  },
  (t) => [index('mock_interviews_student_idx').on(t.studentId)],
);

export const careerAssistantMessages = pgTable(
  'career_assistant_messages',
  {
    id: id(),
    tenantId: tenantId(),
    studentId: studentRef('student_id'),
    role: text('role').notNull(), // user | assistant
    body: text('body').notNull(),
    aiUsed: boolean('ai_used').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('career_assistant_student_idx').on(t.studentId, t.createdAt)],
);

// ---- Internships ------------------------------------------------------------------------------

export const internshipAttendance = pgTable(
  'internship_attendance',
  {
    id: id(),
    tenantId: tenantId(),
    internshipId: uuid('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
    onDate: date('on_date').notNull(),
    present: boolean('present').notNull().default(true),
    hours: num('hours', 4, 1).notNull().default(8),
    note: text('note').notNull().default(''),
    markedBy: userRef('marked_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('internship_attendance_uq').on(t.internshipId, t.onDate)],
);

/** What an internship counts towards: a skill, a course or a course outcome. */
export const internshipLinks = pgTable(
  'internship_links',
  {
    id: id(),
    tenantId: tenantId(),
    internshipId: uuid('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // skill | course | course_outcome
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    courseOutcomeId: uuid('course_outcome_id').references(() => courseOutcomes.id, { onDelete: 'cascade' }),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('internship_links_internship_idx').on(t.internshipId)],
);

/** The completion certificate issued for an internship (one per internship). */
export const internshipCertificates = pgTable(
  'internship_certificates',
  {
    id: id(),
    tenantId: tenantId(),
    internshipId: uuid('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
    certificateId: uuid('certificate_id').notNull().references(() => certificates.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('internship_certificates_uq').on(t.internshipId)],
);

// ---- Research ---------------------------------------------------------------------------------

/** How many scholars a supervisor can take, and their research areas. */
export const supervisorCapacity = pgTable(
  'supervisor_capacity',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    maxScholars: smallint('max_scholars').notNull().default(8),
    areas: jsonb('areas').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('supervisor_capacity_uq').on(t.tenantId, t.userId)],
);

/** Every supervisor assignment of a scholar, current (endedOn null) and past. */
export const supervisorAllocations = pgTable(
  'supervisor_allocations',
  {
    id: id(),
    tenantId: tenantId(),
    scholarId: uuid('scholar_id').notNull().references(() => researchScholars.id, { onDelete: 'cascade' }),
    supervisorUserId: uuid('supervisor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('supervisor'), // supervisor | co_supervisor
    allocatedOn: date('allocated_on').notNull(),
    endedOn: date('ended_on'),
    reason: text('reason').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('supervisor_allocations_scholar_idx').on(t.scholarId)],
);

/** A scholar's thesis from synopsis to award. */
export const thesisRecords = pgTable(
  'thesis_records',
  {
    id: id(),
    tenantId: tenantId(),
    scholarId: uuid('scholar_id').notNull().references(() => researchScholars.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    stage: text('stage').notNull().default('synopsis'), // synopsis | draft | submitted | examination | viva | awarded
    abstract: text('abstract').notNull().default(''),
    contentText: text('content_text').notNull().default(''),
    submittedOn: date('submitted_on'),
    examiners: jsonb('examiners').$type<{ name: string; affiliation: string; verdict?: string }[]>().notNull().default([]),
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('thesis_records_scholar_uq').on(t.scholarId)],
);

export const thesisEvents = pgTable(
  'thesis_events',
  {
    id: id(),
    tenantId: tenantId(),
    thesisId: uuid('thesis_id').notNull().references(() => thesisRecords.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    note: text('note').notNull().default(''),
    actorId: userRef('actor_id'),
    createdAt: createdAt(),
  },
  (t) => [index('thesis_events_thesis_idx').on(t.thesisId)],
);

export const thesisVivas = pgTable(
  'thesis_vivas',
  {
    id: id(),
    tenantId: tenantId(),
    thesisId: uuid('thesis_id').notNull().references(() => thesisRecords.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('open_defence'), // pre_submission | open_defence
    scheduledAt: ts('scheduled_at').notNull(),
    venue: text('venue').notNull().default(''),
    panel: jsonb('panel').$type<{ name: string; role: string }[]>().notNull().default([]),
    status: text('status').notNull().default('scheduled'), // scheduled | held | cancelled
    outcome: text('outcome'), // passed | revise | failed
    remarks: text('remarks'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('thesis_vivas_thesis_idx').on(t.thesisId)],
);

/** An originality check of a thesis against the other theses of the institution. */
export const similarityChecks = pgTable(
  'similarity_checks',
  {
    id: id(),
    tenantId: tenantId(),
    thesisId: uuid('thesis_id').notNull().references(() => thesisRecords.id, { onDelete: 'cascade' }),
    engine: text('engine').notNull().default('internal'),
    scorePercent: num('score_percent', 5, 2).notNull(),
    matches: jsonb('matches').$type<{ thesisId: string; title: string; percent: number }[]>().notNull().default([]),
    checkedBy: userRef('checked_by'),
    createdAt: createdAt(),
  },
  (t) => [index('similarity_checks_thesis_idx').on(t.thesisId)],
);

export const researchDatasets = pgTable(
  'research_datasets',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => researchProjects.id, { onDelete: 'set null' }),
    license: text('license').notNull().default('CC-BY-4.0'),
    access: text('access').notNull().default('restricted'), // open | restricted | embargoed
    embargoUntil: date('embargo_until'),
    doi: text('doi'),
    keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
    files: jsonb('files').$type<{ name: string; storageKey: string; sizeBytes: number; contentType: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('research_datasets_owner_idx').on(t.ownerUserId)],
);

// ---- Alumni, clubs, committees, events --------------------------------------------------------

export const alumniSuccessStories = pgTable(
  'alumni_success_stories',
  {
    id: id(),
    tenantId: tenantId(),
    alumniId: uuid('alumni_id').notNull().references(() => alumniProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('draft'), // draft | submitted | published | rejected
    featured: boolean('featured').notNull().default(false),
    publishedAt: ts('published_at'),
    reviewedBy: userRef('reviewed_by'),
    reviewNote: text('review_note'),
    createdAt: createdAt(),
  },
  (t) => [index('alumni_success_stories_status_idx').on(t.status)],
);

export const clubOfficeBearers = pgTable(
  'club_office_bearers',
  {
    id: id(),
    tenantId: tenantId(),
    clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
    studentId: studentRef('student_id'),
    post: text('post').notNull(), // President, Secretary, Treasurer ...
    fromOn: date('from_on').notNull(),
    toOn: date('to_on'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('club_office_bearers_club_idx').on(t.clubId)],
);

export const clubAchievements = pgTable(
  'club_achievements',
  {
    id: id(),
    tenantId: tenantId(),
    clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    level: text('level').notNull().default('institutional'), // institutional | district | state | national | international
    position: text('position').notNull().default(''),
    achievedOn: date('achieved_on').notNull(),
    participants: jsonb('participants').$type<{ studentId?: string; name: string }[]>().notNull().default([]),
    description: text('description').notNull().default(''),
    recordedBy: userRef('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('club_achievements_club_idx').on(t.clubId)],
);

/** Evidence for a committee or one of its meetings: photos, signed minutes, attendance sheets. */
export const committeeEvidence = pgTable(
  'committee_evidence',
  {
    id: id(),
    tenantId: tenantId(),
    committeeId: uuid('committee_id').notNull().references(() => committees.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').references(() => committeeMeetings.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('document'), // photo | document | attendance | other
    url: text('url'),
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    uploadedBy: userRef('uploaded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('committee_evidence_committee_idx').on(t.committeeId)],
);

export const eventMedia = pgTable(
  'event_media',
  {
    id: id(),
    tenantId: tenantId(),
    eventId: uuid('event_id').notNull().references(() => campusEvents.id, { onDelete: 'cascade' }),
    caption: text('caption').notNull().default(''),
    kind: text('kind').notNull().default('photo'), // photo | video
    url: text('url'),
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    approved: boolean('approved').notNull().default(false),
    uploadedBy: userRef('uploaded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('event_media_event_idx').on(t.eventId)],
);

/** The attendance certificate issued to a checked-in event attendee. */
export const eventCertificates = pgTable(
  'event_certificates',
  {
    id: id(),
    tenantId: tenantId(),
    registrationId: uuid('registration_id').notNull().references(() => eventRegistrations.id, { onDelete: 'cascade' }),
    certificateId: uuid('certificate_id').notNull().references(() => certificates.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('event_certificates_uq').on(t.registrationId)],
);

// ---- Grievance and discipline -----------------------------------------------------------------

export const grievanceEvidence = pgTable(
  'grievance_evidence',
  {
    id: id(),
    tenantId: tenantId(),
    ticketId: uuid('ticket_id').notNull().references(() => grievanceTickets.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    addedBy: userRef('added_by'),
    createdAt: createdAt(),
  },
  (t) => [index('grievance_evidence_ticket_idx').on(t.ticketId)],
);

export const disciplineWitnesses = pgTable(
  'discipline_witnesses',
  {
    id: id(),
    tenantId: tenantId(),
    incidentId: uuid('incident_id').notNull().references(() => disciplineIncidents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull().default('student'), // student | staff | external
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    statement: text('statement').notNull().default(''),
    recordedBy: userRef('recorded_by'),
    createdAt: createdAt(),
  },
  (t) => [index('discipline_witnesses_incident_idx').on(t.incidentId)],
);

/** Each time the school reached the parents about an incident, and whether they acknowledged it. */
export const disciplineParentContacts = pgTable(
  'discipline_parent_contacts',
  {
    id: id(),
    tenantId: tenantId(),
    incidentId: uuid('incident_id').notNull().references(() => disciplineIncidents.id, { onDelete: 'cascade' }),
    guardianUserId: userRef('guardian_user_id'),
    method: text('method').notNull().default('message'), // message | call | meeting | letter
    summary: text('summary').notNull().default(''),
    meetingOn: date('meeting_on'),
    acknowledgedAt: ts('acknowledged_at'),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('discipline_parent_contacts_incident_idx').on(t.incidentId)],
);

// ---- Retention --------------------------------------------------------------------------------

/** How long records are kept: archive or delete after `keepDays`. */
export const retentionRules = pgTable(
  'retention_rules',
  {
    id: id(),
    tenantId: tenantId(),
    target: text('target').notNull(), // vault_documents | notifications | sessions
    category: text('category').notNull().default(''), // '' = all
    keepDays: integer('keep_days').notNull(),
    action: text('action').notNull().default('archive'), // archive | delete
    active: boolean('active').notNull().default(true),
    lastRunAt: ts('last_run_at'),
    lastAffected: integer('last_affected').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('retention_rules_uq').on(t.tenantId, t.target, t.category)],
);

// ---- Communication engine ---------------------------------------------------------------------

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: id(),
    tenantId: tenantId(),
    key: text('key').notNull(),
    channel: text('channel').notNull(), // in_app | sms | email | whatsapp
    locale: text('locale').notNull().default('en'),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull(),
    dltTemplateId: text('dlt_template_id'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('message_templates_uq').on(t.tenantId, t.key, t.channel, t.locale)],
);

export const audienceRules = pgTable(
  'audience_rules',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    rule: jsonb('rule').$type<{ roles?: string[]; sectionIds?: string[]; userIds?: string[] }>().notNull().default({}),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('audience_rules_name_uq').on(t.tenantId, t.name)],
);

export const messageCampaigns = pgTable(
  'message_campaigns',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    templateId: uuid('template_id').notNull().references(() => messageTemplates.id, { onDelete: 'restrict' }),
    audienceId: uuid('audience_id').notNull().references(() => audienceRules.id, { onDelete: 'restrict' }),
    vars: jsonb('vars').$type<Record<string, string>>().notNull().default({}),
    sendAt: ts('send_at').notNull(),
    status: text('status').notNull().default('scheduled'), // scheduled | sending | sent | cancelled
    recipients: integer('recipients').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    createdBy: userRef('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('message_campaigns_due_idx').on(t.status, t.sendAt)],
);

export const messageDeliveries = pgTable(
  'message_deliveries',
  {
    id: id(),
    tenantId: tenantId(),
    campaignId: uuid('campaign_id').notNull().references(() => messageCampaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    status: text('status').notNull().default('queued'), // queued | sent | failed | read
    attempts: smallint('attempts').notNull().default(0),
    error: text('error'),
    nextAttemptAt: ts('next_attempt_at'),
    sentAt: ts('sent_at'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('message_deliveries_uq').on(t.campaignId, t.userId), index('message_deliveries_retry_idx').on(t.status, t.nextAttemptAt)],
);

// ---- Parent visibility ------------------------------------------------------------------------

/** Per-institution switch for each section parents may see. No row = the default (visible). */
export const parentVisibility = pgTable(
  'parent_visibility',
  {
    id: id(),
    tenantId: tenantId(),
    section: text('section').notNull(), // marks | attendance | fees | behaviour | activities | report_card | health | diary
    visible: boolean('visible').notNull().default(true),
    updatedBy: userRef('updated_by'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('parent_visibility_uq').on(t.tenantId, t.section)],
);

// ---- Approvals through the workflow engine ------------------------------------------------------

/** A fee refund waiting for approval: the engine's request points at this row, and approval issues the refund. */
export const refundRequests = pgTable(
  'refund_requests',
  {
    id: id(),
    tenantId: tenantId(),
    paymentId: uuid('payment_id').notNull().references(() => feePayments.id, { onDelete: 'cascade' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    requestedBy: userRef('requested_by'),
    status: text('status').notNull().default('pending'), // pending | refunded | rejected
    refundId: uuid('refund_id'),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [index('refund_requests_payment_idx').on(t.paymentId)],
);
