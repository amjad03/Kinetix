// Record views for the quality, outcomes and engagement group: one definition per entity says which
// table it lives in, who may read it, the title, the key facts, the related lists and the happy path of
// its workflow. The SQL fragments are constants written here (never built from input); the record id
// is always a bound parameter. Changes still go through each module's own endpoints.
import type { RoleName } from '../auth/principal.js';
import type { QualityModule } from './settings.catalogue.js';

export type FactKind = 'text' | 'date' | 'datetime' | 'paise' | 'number' | 'lpa' | 'bool';
export interface RelatedDef {
  key: string;
  /** Selects rows for the record; `:id` is replaced by the bound record id. */
  sql: string;
  columns: [string, FactKind][];
}
export interface RecordDef {
  module: QualityModule;
  table: string;
  roles: RoleName[];
  title: string;
  joins?: string;
  facts: [string, string, FactKind][];
  body: [string, string][];
  /** The happy path of statuses, in order. */
  steps: string[];
  /** Statuses that end the record off the happy path (shown as rejected). */
  off: string[];
  /** Statuses that sit on a step of the path (an escalated ticket is still in progress). */
  aliases?: Record<string, string>;
  related: RelatedDef[];
  /** Committee-only grievance tickets: who else may read them. */
  restrictedWhen?: { sql: string; roles: RoleName[] };
}

const QUALITY: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const PLACEMENT: RoleName[] = ['tenant_admin', 'principal', 'placement_officer', 'hod'];
const RESEARCH: RoleName[] = ['tenant_admin', 'principal', 'research_coordinator', 'hod'];
const WELFARE: RoleName[] = ['tenant_admin', 'principal', 'grievance_officer', 'icc_member'];
const OFFICE: RoleName[] = ['tenant_admin', 'principal', 'accountant', 'hr_manager'];
const u = (col: string) => `(select full_name from users x where x.id = ${col})`;

export const RECORDS = {
  grievance: {
    module: 'grievances',
    table: 'grievance_tickets',
    roles: WELFARE,
    title: "r.ticket_no || ' · ' || r.subject",
    facts: [['category', 'r.category', 'text'], ['severity', 'r.severity', 'text'], ['assignee', u('r.assignee_user_id'), 'text'], ['slaDue', 'r.sla_due_at', 'datetime'], ['escalation', 'r.escalation_level', 'number'], ['rating', 'r.rating', 'number']],
    body: [['description', 'r.description'], ['resolution', 'r.resolution']],
    steps: ['open', 'assigned', 'in_progress', 'resolved', 'closed'],
    off: [],
    aliases: { escalated: 'in_progress', reopened: 'in_progress' },
    related: [{ key: 'timeline', sql: `select e.id, e.kind, e.body, e.visibility, e.created_at from grievance_events e where e.ticket_id = :id order by e.created_at`, columns: [['kind', 'text'], ['body', 'text'], ['visibility', 'text'], ['created_at', 'datetime']] }],
    restrictedWhen: { sql: 'r.committee is not null', roles: ['principal', 'icc_member'] },
  },
  discipline: {
    module: 'grievances',
    table: 'discipline_incidents',
    roles: ['tenant_admin', 'principal', 'hod', 'grievance_officer'],
    title: "s.full_name || ' · ' || r.kind",
    joins: 'join students s on s.id = r.student_id',
    facts: [['student', 's.full_name', 'text'], ['incidentOn', 'r.incident_on', 'date'], ['severity', 'r.severity', 'text'], ['reportedBy', u('r.reported_by'), 'text']],
    body: [['description', 'r.description']],
    steps: ['reported', 'under_review', 'action_taken', 'closed'],
    off: ['appealed'],
    related: [{ key: 'actions', sql: `select a.id, a.action, a.detail, a.starts_on, a.ends_on, a.fine_paise, a.status from discipline_actions a where a.incident_id = :id order by a.created_at`, columns: [['action', 'text'], ['detail', 'text'], ['starts_on', 'date'], ['ends_on', 'date'], ['fine_paise', 'paise'], ['status', 'text']] }],
  },
  drive: {
    module: 'placements',
    table: 'placement_drives',
    roles: PLACEMENT,
    title: "c.name || ' · ' || r.title",
    joins: 'join placement_companies c on c.id = r.company_id',
    facts: [['company', 'c.name', 'text'], ['role', 'r.role_title', 'text'], ['ctc', 'r.ctc_lpa', 'lpa'], ['driveDate', 'r.drive_date', 'date'], ['closesOn', 'r.registration_closes_on', 'date'], ['minCgpa', 'r.min_cgpa', 'number']],
    body: [['description', 'r.description']],
    steps: ['draft', 'open', 'closed', 'completed'],
    off: ['cancelled'],
    related: [
      { key: 'registrations', sql: `select g.id, s.full_name, s.roll_no, g.cgpa_at, g.status from drive_registrations g join students s on s.id = g.student_id where g.drive_id = :id order by s.full_name`, columns: [['full_name', 'text'], ['roll_no', 'text'], ['cgpa_at', 'number'], ['status', 'text']] },
      { key: 'offers', sql: `select o.id, s.full_name, o.role_title, o.ctc_lpa, o.offered_on, o.status from placement_offers o join students s on s.id = o.student_id where o.drive_id = :id order by o.offered_on desc`, columns: [['full_name', 'text'], ['role_title', 'text'], ['ctc_lpa', 'lpa'], ['offered_on', 'date'], ['status', 'text']] },
    ],
  },
  proposal: {
    module: 'research',
    table: 'research_proposals',
    roles: RESEARCH,
    title: 'r.title',
    facts: [['pi', u('r.pi_user_id'), 'text'], ['kind', 'r.kind', 'text'], ['sponsor', 'r.sponsor_org', 'text'], ['funding', 'r.funding_sought_paise', 'paise'], ['ethics', 'r.ethics_status', 'text'], ['decidedAt', 'r.decided_at', 'datetime']],
    body: [['abstract', 'r.abstract'], ['reviewNote', 'r.review_note']],
    steps: ['draft', 'submitted', 'under_review', 'approved'],
    off: ['rejected', 'withdrawn'],
    related: [],
  },
  project: {
    module: 'research',
    table: 'research_projects',
    roles: RESEARCH,
    title: "r.code || ' · ' || r.title",
    facts: [['pi', u('r.pi_user_id'), 'text'], ['kind', 'r.kind', 'text'], ['sponsor', 'r.sponsor_org', 'text'], ['startsOn', 'r.starts_on', 'date'], ['endsOn', 'r.ends_on', 'date']],
    body: [['outcome', 'r.outcome_summary']],
    steps: ['active', 'completed'],
    off: ['on_hold', 'cancelled'],
    related: [
      { key: 'milestones', sql: `select m.id, m.title, m.due_on, m.completed_on, m.evidence_ref from project_milestones m where m.project_id = :id order by m.due_on`, columns: [['title', 'text'], ['due_on', 'date'], ['completed_on', 'date'], ['evidence_ref', 'text']] },
      { key: 'members', sql: `select m.id, coalesce((select full_name from users x where x.id = m.user_id), (select full_name from students x where x.id = m.student_id)) as name, m.role from project_members m where m.project_id = :id`, columns: [['name', 'text'], ['role', 'text']] },
      { key: 'outputs', sql: `select p.id, p.title, p.kind, p.venue, p.year from publications p where p.project_id = :id order by p.year desc`, columns: [['title', 'text'], ['kind', 'text'], ['venue', 'text'], ['year', 'number']] },
    ],
  },
  patent: {
    module: 'research',
    table: 'patents',
    roles: RESEARCH,
    title: 'r.title',
    facts: [['kind', 'r.kind', 'text'], ['owner', u('r.owner_user_id'), 'text'], ['applicationNo', 'r.application_no', 'text'], ['filedOn', 'r.filed_on', 'date'], ['grantedOn', 'r.granted_on', 'date']],
    body: [],
    steps: ['draft', 'filed', 'published', 'granted'],
    off: ['rejected'],
    related: [],
  },
  survey: {
    module: 'feedback',
    table: 'surveys',
    roles: QUALITY,
    title: 'r.title',
    facts: [['audience', 'r.audience', 'text'], ['anonymous', 'r.anonymous', 'bool'], ['opensAt', 'r.opens_at', 'datetime'], ['closesAt', 'r.closes_at', 'datetime'], ['responses', '(select count(*)::int from survey_responses x where x.survey_id = r.id)', 'number']],
    body: [['description', 'r.description']],
    steps: ['draft', 'open', 'closed'],
    off: [],
    related: [{ key: 'questions', sql: `select q.id, q.ord, q.prompt, q.kind, q.required from survey_questions q where q.survey_id = :id order by q.ord`, columns: [['ord', 'number'], ['prompt', 'text'], ['kind', 'text'], ['required', 'bool']] }],
  },
  feedbackReport: {
    module: 'feedback',
    table: 'iqac_feedback_reports',
    roles: QUALITY,
    title: "initcap(r.stakeholder) || ' · ' || r.cycle",
    facts: [['stakeholder', 'r.stakeholder', 'text'], ['cycle', 'r.cycle', 'text'], ['averageRating', 'r.average_rating', 'number'], ['responses', 'r.responses', 'number']],
    body: [['summary', 'r.summary'], ['actionTaken', 'r.action_taken']],
    steps: ['analysed', 'action_planned', 'action_taken'],
    off: [],
    related: [],
  },
  gapAction: {
    module: 'obe',
    table: 'improvement_actions',
    roles: QUALITY,
    title: 'r.title',
    joins: 'join programs pg on pg.id = r.program_id',
    facts: [['program', 'pg.name', 'text'], ['owner', u('r.owner_id'), 'text'], ['dueOn', 'r.due_on', 'date'], ['baseline', 'r.baseline_value', 'number'], ['target', 'r.target_value', 'number'], ['remeasured', 'r.remeasured_value', 'number']],
    body: [['detail', 'r.detail'], ['rootCause', 'r.root_cause'], ['remeasureNote', 'r.remeasure_note']],
    steps: ['open', 'in_progress', 'done'],
    off: [],
    related: [],
  },
  event: {
    module: 'events',
    table: 'campus_events',
    roles: ['tenant_admin', 'principal', 'hod'],
    title: 'r.title',
    facts: [['type', 'r.event_type', 'text'], ['venue', 'r.venue', 'text'], ['startsAt', 'r.starts_at', 'datetime'], ['capacity', 'r.capacity', 'number'], ['registered', "(select count(*)::int from event_registrations x where x.event_id = r.id and x.status = 'registered')", 'number'], ['rating', '(select round(avg(rating)::numeric, 1)::float from event_feedback x where x.event_id = r.id)', 'number']],
    body: [['description', 'r.description']],
    steps: ['draft', 'published'],
    off: ['cancelled'],
    related: [
      { key: 'registrations', sql: `select g.id, s.full_name, g.status, g.checked_in_at from event_registrations g join students s on s.id = g.student_id where g.event_id = :id order by s.full_name`, columns: [['full_name', 'text'], ['status', 'text'], ['checked_in_at', 'datetime']] },
      { key: 'feedback', sql: `select f.id, f.rating, f.comment, f.created_at from event_feedback f where f.event_id = :id order by f.created_at desc`, columns: [['rating', 'number'], ['comment', 'text'], ['created_at', 'datetime']] },
    ],
  },
  campaign: {
    module: 'communication',
    table: 'message_campaigns',
    roles: ['tenant_admin', 'principal'],
    title: 'r.title',
    facts: [['sendAt', 'r.send_at', 'datetime'], ['recipients', 'r.recipients', 'number'], ['sent', 'r.sent_count', 'number'], ['failed', 'r.failed_count', 'number'], ['createdBy', u('r.created_by'), 'text']],
    body: [],
    steps: ['scheduled', 'sending', 'sent'],
    off: ['cancelled'],
    related: [],
  },
  certificate: {
    module: 'documents',
    table: 'certificates',
    roles: OFFICE,
    title: "t.name || coalesce(' · ' || (select full_name from students x where x.id = r.student_id), '')",
    joins: 'join certificate_templates t on t.id = r.template_id',
    facts: [['template', 't.name', 'text'], ['student', '(select full_name from students x where x.id = r.student_id)', 'text'], ['requestedBy', u('r.requested_by'), 'text'], ['serialNo', 'r.serial_no', 'text'], ['issuedAt', 'r.issued_at', 'datetime']],
    body: [['purpose', 'r.purpose'], ['decisionNote', 'r.decision_note'], ['revokedReason', 'r.revoked_reason']],
    steps: ['requested', 'approved', 'issued'],
    off: ['rejected', 'revoked'],
    related: [],
  },
  mentoringRequest: {
    module: 'mentoring',
    table: 'mentoring_requests',
    roles: PLACEMENT,
    title: 'r.topic',
    joins: 'join students s on s.id = r.student_id join alumni_profiles a on a.id = r.alumni_id',
    facts: [['student', 's.full_name', 'text'], ['mentor', 'a.full_name', 'text'], ['respondedAt', 'r.responded_at', 'datetime']],
    body: [['message', 'r.message']],
    steps: ['pending', 'accepted', 'completed'],
    off: ['declined'],
    related: [],
  },
} satisfies Record<string, RecordDef>;

export type RecordEntity = keyof typeof RECORDS;
export const isRecordEntity = (e: string): e is RecordEntity => Object.prototype.hasOwnProperty.call(RECORDS, e);

/** Where the record is on its happy path: each step done, current, upcoming, or rejected when it ended off the path. */
export function stepStates(def: Pick<RecordDef, 'steps' | 'off' | 'aliases'>, raw: string): { status: string; state: 'done' | 'current' | 'upcoming' | 'rejected' }[] {
  const status = def.aliases?.[raw] ?? raw;
  const at = def.steps.indexOf(status);
  if (at >= 0) return def.steps.map((s, i) => ({ status: s, state: i < at ? 'done' : i === at ? (i === def.steps.length - 1 ? 'done' : 'current') : 'upcoming' }));
  // Off the path: the steps before stay done, then the off status is shown as rejected.
  return [...def.steps.slice(0, 1).map((s) => ({ status: s, state: 'done' as const })), { status, state: 'rejected' as const }];
}
