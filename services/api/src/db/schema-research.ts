// Research office registers (migration 0159): consultancy with revenue sharing, MoUs and their activities, seed money,
// faculty recognitions, ethics committee approvals, funding calls, central instruments and their usage with billing,
// utilisation certificates of grants, and doctoral committee meetings and coursework of research scholars.
// Kept apart from schema.ts, which these tables reference.
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { departments, patents, publications, researchGrants, researchProjects, researchProposals, researchScholars, tenants, users } from './schema.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const person = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const dept = () => uuid('department_id').references(() => departments.id, { onDelete: 'set null' });

/** Consultancy, testing and corporate training for clients, with the institution's and the consultant's shares of revenue. */
export const researchConsultancies = pgTable(
  'research_consultancies',
  {
    id: id(),
    tenantId: tenantId(),
    title: text('title').notNull(),
    client: text('client').notNull(),
    clientContact: text('client_contact'),
    kind: text('kind').notNull().default('consultancy'), // consultancy | testing | corporate_training
    leadUserId: person('lead_user_id'),
    departmentId: dept(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    contractPaise: bigint('contract_paise', { mode: 'number' }).notNull().default(0),
    receivedPaise: bigint('received_paise', { mode: 'number' }).notNull().default(0),
    /** The institution's share of revenue in percent; the rest goes to the consultants (consultancy policy). */
    institutionSharePct: numeric('institution_share_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(50),
    trainees: integer('trainees'),
    agreementRef: text('agreement_ref'),
    status: text('status').notNull().default('active'), // proposed | active | completed | cancelled
    note: text('note'),
    createdBy: person('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('research_consultancies_starts_idx').on(t.tenantId, t.startsOn)],
);

/** A memorandum of understanding or linkage with an industry, institution or agency. */
export const researchMous = pgTable(
  'research_mous',
  {
    id: id(),
    tenantId: tenantId(),
    partner: text('partner').notNull(),
    partnerKind: text('partner_kind').notNull().default('industry'), // industry | academic | government | ngo | international
    country: text('country').notNull().default('India'),
    purpose: text('purpose').notNull().default(''),
    signedOn: date('signed_on').notNull(),
    validUntil: date('valid_until'),
    coordinatorUserId: person('coordinator_user_id'),
    departmentId: dept(),
    status: text('status').notNull().default('active'), // active | terminated
    documentUrl: text('document_url'),
    createdAt: createdAt(),
  },
  (t) => [index('research_mous_signed_idx').on(t.tenantId, t.signedOn)],
);

/** What was done under an MoU: exchanges, internships, joint research, training (NAAC asks for activities year by year). */
export const researchMouActivities = pgTable(
  'research_mou_activities',
  {
    id: id(),
    tenantId: tenantId(),
    mouId: uuid('mou_id').notNull().references(() => researchMous.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('other'), // faculty_exchange | student_exchange | internship | joint_research | training | event | other
    heldOn: date('held_on').notNull(),
    participants: integer('participants'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('research_mou_activities_mou_idx').on(t.mouId)],
);

/** Seed money from the institution for a teacher's research, with the utilisation report. */
export const researchSeedGrants = pgTable('research_seed_grants', {
  id: id(),
  tenantId: tenantId(),
  title: text('title').notNull(),
  applicantUserId: uuid('applicant_user_id').notNull().references(() => users.id),
  departmentId: dept(),
  requestedPaise: bigint('requested_paise', { mode: 'number' }).notNull().default(0),
  sanctionedPaise: bigint('sanctioned_paise', { mode: 'number' }).notNull().default(0),
  sanctionedOn: date('sanctioned_on'),
  durationMonths: smallint('duration_months'),
  utilisedPaise: bigint('utilised_paise', { mode: 'number' }).notNull().default(0),
  reportSubmittedOn: date('report_submitted_on'),
  outcome: text('outcome'),
  status: text('status').notNull().default('applied'), // applied | sanctioned | completed | rejected
  createdAt: createdAt(),
});

/** An award, fellowship, editorial board seat, reviewer role, keynote or membership of a teacher or scholar. */
export const researchRecognitions = pgTable(
  'research_recognitions',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // award | fellowship | editorial_board | reviewer | keynote | membership
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    level: text('level').notNull().default('national'), // institutional | state | national | international
    receivedOn: date('received_on').notNull(),
    validUntil: date('valid_until'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    url: text('url'),
    createdAt: createdAt(),
  },
  (t) => [index('research_recognitions_user_idx').on(t.userId)],
);

/** A research ethics committee approval (human, animal or biosafety) with its validity. */
export const researchEthicsApprovals = pgTable(
  'research_ethics_approvals',
  {
    id: id(),
    tenantId: tenantId(),
    committee: text('committee').notNull(), // iec | iaec | ibsc | other
    protocolNo: text('protocol_no').notNull(),
    title: text('title').notNull(),
    piUserId: person('pi_user_id'),
    proposalId: uuid('proposal_id').references(() => researchProposals.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => researchProjects.id, { onDelete: 'set null' }),
    submittedOn: date('submitted_on'),
    approvedOn: date('approved_on'),
    expiresOn: date('expires_on'),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | withdrawn
    conditions: text('conditions'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('research_ethics_protocol_uq').on(t.tenantId, t.committee, t.protocolNo)],
);

/** A funding call from an agency, with the institution's internal deadline ahead of the agency's. */
export const researchCalls = pgTable('research_calls', {
  id: id(),
  tenantId: tenantId(),
  agency: text('agency').notNull(),
  scheme: text('scheme').notNull().default(''),
  title: text('title').notNull(),
  url: text('url'),
  opensOn: date('opens_on'),
  internalDeadline: date('internal_deadline'),
  deadline: date('deadline').notNull(),
  maxAmountPaise: bigint('max_amount_paise', { mode: 'number' }),
  status: text('status').notNull().default('open'), // open | closed
  note: text('note'),
  createdAt: createdAt(),
});

/** A central instrument or research facility, with its rates for internal and external users. */
export const researchEquipment = pgTable(
  'research_equipment',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default(''),
    location: text('location').notNull().default(''),
    departmentId: dept(),
    custodianUserId: person('custodian_user_id'),
    makeModel: text('make_model'),
    purchasedOn: date('purchased_on'),
    costPaise: bigint('cost_paise', { mode: 'number' }).notNull().default(0),
    internalRatePaise: bigint('internal_rate_paise', { mode: 'number' }).notNull().default(0),
    externalRatePaise: bigint('external_rate_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('working'), // working | under_repair | retired
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('research_equipment_code_uq').on(t.tenantId, t.code)],
);

/** A booking or use of an instrument; bookings of one instrument cannot overlap, and the amount is hours x rate. */
export const researchEquipmentUsage = pgTable(
  'research_equipment_usage',
  {
    id: id(),
    tenantId: tenantId(),
    equipmentId: uuid('equipment_id').notNull().references(() => researchEquipment.id, { onDelete: 'cascade' }),
    userKind: text('user_kind').notNull().default('internal'), // internal | external
    userId: person('user_id'),
    externalName: text('external_name'),
    externalOrg: text('external_org'),
    purpose: text('purpose').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    ratePaise: bigint('rate_paise', { mode: 'number' }).notNull().default(0),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('booked'), // booked | completed | billed | cancelled
    invoiceRef: text('invoice_ref'),
    createdBy: person('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('research_equipment_usage_idx').on(t.equipmentId, t.startsAt)],
);

/** A utilisation certificate for a period of a grant, sent to the funding agency. */
export const grantUtilisationCertificates = pgTable(
  'grant_utilisation_certificates',
  {
    id: id(),
    tenantId: tenantId(),
    grantId: uuid('grant_id').notNull().references(() => researchGrants.id, { onDelete: 'cascade' }),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    utilisedPaise: bigint('utilised_paise', { mode: 'number' }).notNull().default(0),
    submittedOn: date('submitted_on'),
    reference: text('reference'),
    status: text('status').notNull().default('draft'), // draft | submitted | accepted | returned
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('grant_ucs_grant_idx').on(t.grantId)],
);

/** A doctoral (research advisory) committee meeting reviewing a scholar's progress. */
export const scholarDcMeetings = pgTable(
  'scholar_dc_meetings',
  {
    id: id(),
    tenantId: tenantId(),
    scholarId: uuid('scholar_id').notNull().references(() => researchScholars.id, { onDelete: 'cascade' }),
    heldOn: date('held_on').notNull(),
    members: text('members').notNull().default(''),
    progress: text('progress').notNull().default('satisfactory'), // satisfactory | needs_improvement | unsatisfactory
    recommendations: text('recommendations'),
    nextDueOn: date('next_due_on'),
    createdAt: createdAt(),
  },
  (t) => [index('scholar_dc_meetings_scholar_idx').on(t.scholarId)],
);

/** Ph.D. coursework (research methodology, research and publication ethics, subject papers) and its result. */
export const scholarCoursework = pgTable(
  'scholar_coursework',
  {
    id: id(),
    tenantId: tenantId(),
    scholarId: uuid('scholar_id').notNull().references(() => researchScholars.id, { onDelete: 'cascade' }),
    course: text('course').notNull(),
    credits: numeric('credits', { precision: 4, scale: 1, mode: 'number' }).notNull().default(4),
    grade: text('grade'),
    status: text('status').notNull().default('enrolled'), // enrolled | passed | failed | exempted
    completedOn: date('completed_on'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('scholar_coursework_uq').on(t.scholarId, t.course)],
);


// ---------------------------------------------------------------------------------------------
// Research pass (migrations 0216-0217)
// ---------------------------------------------------------------------------------------------

/** A teacher's researcher identifiers and the metrics the indexing services report for them. */
export const researchProfiles = pgTable(
  'research_profiles',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orcid: text('orcid'),
    scopusAuthorId: text('scopus_author_id'),
    wosResearcherId: text('wos_researcher_id'),
    googleScholarId: text('google_scholar_id'),
    vidwanId: text('vidwan_id'),
    irinsUrl: text('irins_url'),
    areas: text('areas').notNull().default(''),
    scopusHIndex: smallint('scopus_h_index'),
    wosHIndex: smallint('wos_h_index'),
    scholarHIndex: smallint('scholar_h_index'),
    scholarCitations: integer('scholar_citations'),
    metricsOn: date('metrics_on'),
    verifiedBy: person('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('research_profiles_user_uq').on(t.tenantId, t.userId)],
);

/** What the DOI registry said about a DOI, so a later look-up works while the registry is unreachable. */
export const researchDoiCache = pgTable('research_doi_cache', {
  id: id(),
  tenantId: tenantId(),
  doi: text('doi').notNull(),
  record: jsonb('record').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A recognised research centre (by the affiliating university) where scholars register and projects run. */
export const researchCentres = pgTable(
  'research_centres',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    departmentId: dept(),
    headUserId: person('head_user_id'),
    recognisedBy: text('recognised_by').notNull().default(''),
    recognitionRef: text('recognition_ref'),
    recognisedOn: date('recognised_on'),
    validUntil: date('valid_until'),
    areas: text('areas').notNull().default(''),
    facilities: text('facilities'),
    status: text('status').notNull().default('active'), // active | lapsed | closed
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('research_centres_code_uq').on(t.tenantId, t.code)],
);

/** The amount a grant sanctions under one budget head (manpower, equipment, consumables, travel, contingency, overhead). */
export const researchGrantHeads = pgTable(
  'research_grant_heads',
  {
    id: id(),
    tenantId: tenantId(),
    grantId: uuid('grant_id').notNull().references(() => researchGrants.id, { onDelete: 'cascade' }),
    head: text('head').notNull(),
    sanctionedPaise: bigint('sanctioned_paise', { mode: 'number' }).notNull().default(0),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('research_grant_heads_uq').on(t.grantId, t.head)],
);

/** An instalment the funding agency released against a grant. */
export const researchGrantReleases = pgTable(
  'research_grant_releases',
  {
    id: id(),
    tenantId: tenantId(),
    grantId: uuid('grant_id').notNull().references(() => researchGrants.id, { onDelete: 'cascade' }),
    instalment: smallint('instalment').notNull(),
    releasedOn: date('released_on').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reference: text('reference'),
    receivedOn: date('received_on'),
    note: text('note'),
    createdBy: person('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('research_grant_releases_uq').on(t.grantId, t.instalment)],
);

/** An incentive scheme of the institution: the amount paid for a paper by where it is indexed, or for a patent by its stage. */
export const researchIncentiveSchemes = pgTable('research_incentive_schemes', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('publication'), // publication | patent
  /** Paise per basis: publications by scopus_q1 … scopus_q4, wos, scopus, ugc_care, book, book_chapter, conference; patents by published, granted. */
  rates: jsonb('rates').$type<Record<string, number>>().notNull().default({}),
  capPerYearPaise: bigint('cap_per_year_paise', { mode: 'number' }).notNull().default(0),
  validFrom: date('valid_from'),
  validUntil: date('valid_until'),
  active: boolean('active').notNull().default(true),
  note: text('note'),
  createdAt: createdAt(),
});

/** A teacher's claim under an incentive scheme for one publication or patent, and its approval and payment. */
export const researchIncentiveClaims = pgTable(
  'research_incentive_claims',
  {
    id: id(),
    tenantId: tenantId(),
    schemeId: uuid('scheme_id').notNull().references(() => researchIncentiveSchemes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    publicationId: uuid('publication_id').references(() => publications.id, { onDelete: 'cascade' }),
    patentId: uuid('patent_id').references(() => patents.id, { onDelete: 'cascade' }),
    basis: text('basis').notNull().default(''),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('claimed'), // claimed | approved | paid | rejected
    decidedBy: person('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    paidOn: date('paid_on'),
    paymentRef: text('payment_ref'),
    createdAt: createdAt(),
  },
  (t) => [index('research_incentive_claims_user_idx').on(t.tenantId, t.userId)],
);

/** A scholar's six-monthly progress report and the supervisor's review of it (UGC Ph.D. Regulations 2022). */
export const scholarProgressReports = pgTable(
  'scholar_progress_reports',
  {
    id: id(),
    tenantId: tenantId(),
    scholarId: uuid('scholar_id').notNull().references(() => researchScholars.id, { onDelete: 'cascade' }),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    submittedOn: date('submitted_on').notNull(),
    summary: text('summary').notNull().default(''),
    outputs: text('outputs'),
    supervisorRemarks: text('supervisor_remarks'),
    rating: text('rating'), // satisfactory | needs_improvement | unsatisfactory
    status: text('status').notNull().default('submitted'), // submitted | accepted | returned
    reviewedBy: person('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('scholar_progress_reports_uq').on(t.scholarId, t.periodFrom)],
);
