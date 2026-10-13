// Reports for the quality, outcomes and engagement group. Each base query returns the report's columns
// plus `_on` (the date the period filter applies to) and, where it has one, `status`. The filters are
// bound parameters; the SQL text is fixed here.
import { sql, type SQL } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import type { FactKind } from './records.catalogue.js';
import type { QualityModule } from './settings.catalogue.js';

export interface ReportFilters {
  from?: string;
  to?: string;
  status?: string;
}
export interface ReportDef {
  module: QualityModule;
  roles: RoleName[];
  /** Accreditation criterion the report evidences, shown on the report and the PDF. */
  criterion?: string;
  columns: [string, FactKind][];
  statuses?: string[];
  /** The record page a row opens, when it has one. */
  entity?: string;
  base: string;
}

const QUALITY: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];
const PLACEMENT: RoleName[] = ['tenant_admin', 'principal', 'placement_officer', 'hod', 'quality_officer'];
const RESEARCH: RoleName[] = ['tenant_admin', 'principal', 'research_coordinator', 'hod', 'quality_officer'];
const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];

export const REPORTS = {
  'obe.cqi': {
    module: 'obe',
    roles: QUALITY,
    criterion: 'NBA C7 · NAAC 2.6',
    entity: 'gapAction',
    statuses: ['open', 'in_progress', 'done'],
    columns: [['program', 'text'], ['title', 'text'], ['owner', 'text'], ['due_on', 'date'], ['baseline', 'number'], ['target', 'number'], ['remeasured', 'number'], ['status', 'text']],
    base: `select a.id, pg.name as program, a.title, (select full_name from users x where x.id = a.owner_id) as owner, a.due_on, a.baseline_value as baseline, a.target_value as target, a.remeasured_value as remeasured, a.status::text as status, a.created_at::date as _on
           from improvement_actions a join programs pg on pg.id = a.program_id`,
  },
  'feedback.atr': {
    module: 'feedback',
    roles: QUALITY,
    criterion: 'NAAC 1.4',
    entity: 'feedbackReport',
    statuses: ['analysed', 'action_planned', 'action_taken'],
    columns: [['cycle', 'text'], ['stakeholder', 'text'], ['responses', 'number'], ['average_rating', 'number'], ['summary', 'text'], ['action_taken', 'text'], ['status', 'text']],
    base: `select f.id, f.cycle, f.stakeholder, f.responses, f.average_rating, f.summary, f.action_taken, f.status, f.created_at::date as _on from iqac_feedback_reports f`,
  },
  'feedback.surveys': {
    module: 'feedback',
    roles: QUALITY,
    entity: 'survey',
    statuses: ['draft', 'open', 'closed'],
    columns: [['title', 'text'], ['audience', 'text'], ['opens_at', 'date'], ['closes_at', 'date'], ['responses', 'number'], ['status', 'text']],
    base: `select v.id, v.title, v.audience, v.opens_at::date as opens_at, v.closes_at::date as closes_at, (select count(*)::int from survey_responses x where x.survey_id = v.id) as responses, v.status, coalesce(v.opens_at, v.created_at)::date as _on from surveys v`,
  },
  'mentoring.sessions': {
    module: 'mentoring',
    roles: QUALITY,
    criterion: 'NAAC 2.3.3',
    columns: [['held_on', 'date'], ['mentor', 'text'], ['student', 'text'], ['mode', 'text'], ['summary', 'text'], ['follow_up_on', 'date']],
    base: `select m.id, m.held_on, (select full_name from users x where x.id = m.mentor_user_id) as mentor, s.full_name as student, m.mode, m.summary, m.follow_up_on, m.held_on as _on from mentoring_sessions m join students s on s.id = m.student_id`,
  },
  'grievances.register': {
    module: 'grievances',
    roles: ['tenant_admin', 'principal', 'grievance_officer', 'quality_officer'],
    criterion: 'NAAC 5.1.4',
    entity: 'grievance',
    statuses: ['open', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed'],
    columns: [['ticket_no', 'text'], ['category', 'text'], ['severity', 'text'], ['raised_on', 'date'], ['resolved_on', 'date'], ['hours', 'number'], ['within_sla', 'bool'], ['rating', 'number'], ['status', 'text']],
    // Committee (ICC / anti-ragging) cases are counted but not described: the subject is left out.
    base: `select g.id, g.ticket_no, case when g.committee is null then g.category else 'committee' end as category, g.severity, g.created_at::date as raised_on, g.resolved_at::date as resolved_on,
             case when g.resolved_at is null then null else round(extract(epoch from (g.resolved_at - g.created_at)) / 3600)::int end as hours,
             case when g.resolved_at is null then null else g.resolved_at <= g.sla_due_at end as within_sla, g.rating, g.status, g.created_at::date as _on
           from grievance_tickets g`,
  },
  'grievances.discipline': {
    module: 'grievances',
    roles: ['tenant_admin', 'principal', 'grievance_officer'],
    entity: 'discipline',
    statuses: ['reported', 'under_review', 'action_taken', 'appealed', 'closed'],
    columns: [['incident_on', 'date'], ['student', 'text'], ['kind', 'text'], ['severity', 'text'], ['actions', 'number'], ['status', 'text']],
    base: `select d.id, d.incident_on, s.full_name as student, d.kind, d.severity, (select count(*)::int from discipline_actions x where x.incident_id = d.id) as actions, d.status, d.incident_on as _on from discipline_incidents d join students s on s.id = d.student_id`,
  },
  'placements.offers': {
    module: 'placements',
    roles: PLACEMENT,
    criterion: 'NAAC 5.2.1 · NIRF GO',
    statuses: ['offered', 'accepted', 'declined', 'withdrawn', 'expired'],
    columns: [['student', 'text'], ['roll_no', 'text'], ['company', 'text'], ['role_title', 'text'], ['ctc_lpa', 'lpa'], ['offered_on', 'date'], ['status', 'text']],
    base: `select o.id, s.full_name as student, s.roll_no, c.name as company, o.role_title, o.ctc_lpa, o.offered_on, o.status, o.offered_on as _on
           from placement_offers o join students s on s.id = o.student_id join placement_drives d on d.id = o.drive_id join placement_companies c on c.id = d.company_id`,
  },
  'placements.drives': {
    module: 'placements',
    roles: PLACEMENT,
    entity: 'drive',
    statuses: ['draft', 'open', 'closed', 'completed', 'cancelled'],
    columns: [['company', 'text'], ['title', 'text'], ['drive_date', 'date'], ['registered', 'number'], ['offers', 'number'], ['status', 'text']],
    base: `select d.id, c.name as company, d.title, d.drive_date, (select count(*)::int from drive_registrations x where x.drive_id = d.id) as registered, (select count(*)::int from placement_offers x where x.drive_id = d.id) as offers, d.status, coalesce(d.drive_date, d.created_at::date) as _on
           from placement_drives d join placement_companies c on c.id = d.company_id`,
  },
  'alumni.directory': {
    module: 'alumni',
    roles: PLACEMENT,
    criterion: 'NAAC 5.4',
    columns: [['full_name', 'text'], ['graduation_year', 'number'], ['program', 'text'], ['employer', 'text'], ['designation', 'text'], ['city', 'text']],
    base: `select a.id, a.full_name, a.graduation_year, a.program, a.employer, a.designation, a.city, make_date(a.graduation_year, 6, 30) as _on from alumni_profiles a`,
  },
  'research.publications': {
    module: 'research',
    roles: RESEARCH,
    criterion: 'NAAC 3.4 · NIRF RP',
    columns: [['title', 'text'], ['kind', 'text'], ['venue', 'text'], ['year', 'number'], ['doi', 'text'], ['indexed_in', 'text']],
    base: `select p.id, p.title, p.kind, p.venue, p.year, p.doi, array_to_string(p.indexed_in, ', ') as indexed_in, make_date(p.year, 1, 1) as _on from publications p`,
  },
  'research.ipr': {
    module: 'research',
    roles: RESEARCH,
    criterion: 'NAAC 3.3 · NIRF IPR',
    entity: 'patent',
    statuses: ['draft', 'filed', 'published', 'granted', 'rejected'],
    columns: [['title', 'text'], ['kind', 'text'], ['application_no', 'text'], ['filed_on', 'date'], ['granted_on', 'date'], ['status', 'text']],
    base: `select p.id, p.title, p.kind, p.application_no, p.filed_on, p.granted_on, p.status, coalesce(p.filed_on, p.created_at::date) as _on from patents p`,
  },
  'research.projects': {
    module: 'research',
    roles: RESEARCH,
    criterion: 'NAAC 3.1',
    entity: 'project',
    statuses: ['active', 'on_hold', 'completed', 'cancelled'],
    columns: [['code', 'text'], ['title', 'text'], ['pi', 'text'], ['sponsor_org', 'text'], ['starts_on', 'date'], ['ends_on', 'date'], ['status', 'text']],
    base: `select p.id, p.code, p.title, (select full_name from users x where x.id = p.pi_user_id) as pi, p.sponsor_org, p.starts_on, p.ends_on, p.status, p.starts_on as _on from research_projects p`,
  },
  'events.register': {
    module: 'events',
    roles: ['tenant_admin', 'principal', 'hod', 'quality_officer'],
    criterion: 'NAAC 5.3.3',
    entity: 'event',
    statuses: ['draft', 'published', 'cancelled'],
    columns: [['title', 'text'], ['event_type', 'text'], ['starts_on', 'date'], ['registered', 'number'], ['attended', 'number'], ['rating', 'number'], ['status', 'text']],
    base: `select e.id, e.title, e.event_type, e.starts_at::date as starts_on,
             (select count(*)::int from event_registrations x where x.event_id = e.id and x.status = 'registered') as registered,
             (select count(*)::int from event_registrations x where x.event_id = e.id and x.checked_in_at is not null) as attended,
             (select round(avg(rating)::numeric, 1)::float from event_feedback x where x.event_id = e.id) as rating, e.status, e.starts_at::date as _on
           from campus_events e`,
  },
  'communication.campaigns': {
    module: 'communication',
    roles: ['tenant_admin', 'principal'],
    entity: 'campaign',
    statuses: ['scheduled', 'sending', 'sent', 'cancelled'],
    columns: [['title', 'text'], ['send_at', 'datetime'], ['recipients', 'number'], ['sent_count', 'number'], ['failed_count', 'number'], ['status', 'text']],
    base: `select m.id, m.title, m.send_at, m.recipients, m.sent_count, m.failed_count, m.status, m.send_at::date as _on from message_campaigns m`,
  },
  'documents.certificates': {
    module: 'documents',
    roles: ['tenant_admin', 'principal', 'accountant', 'hr_manager'],
    entity: 'certificate',
    statuses: ['requested', 'approved', 'rejected', 'issued', 'revoked'],
    columns: [['template', 'text'], ['student', 'text'], ['serial_no', 'text'], ['requested_on', 'date'], ['issued_at', 'date'], ['status', 'text']],
    base: `select c.id, t.name as template, (select full_name from students x where x.id = c.student_id) as student, c.serial_no, c.created_at::date as requested_on, c.issued_at::date as issued_at, c.status, c.created_at::date as _on
           from certificates c join certificate_templates t on t.id = c.template_id`,
  },
  'skills.evidence': {
    module: 'skills',
    roles: ['tenant_admin', 'principal', 'hod', 'quality_officer'],
    columns: [['student', 'text'], ['skill', 'text'], ['level', 'number'], ['title', 'text'], ['recorded_on', 'date']],
    base: `select e.id, s.full_name as student, k.name as skill, e.level, e.title, e.created_at::date as recorded_on, e.created_at::date as _on from skill_evidence e join students s on s.id = e.student_id join skills k on k.id = e.skill_id`,
  },
  // One page of headline figures for the accreditation self-study: each row is a metric for the period.
  'accreditation.summary': {
    module: 'accreditation',
    roles: ADMIN,
    criterion: 'NAAC SSR · NBA SAR · NIRF · AISHE',
    columns: [['area', 'text'], ['metric', 'text'], ['value', 'number']],
    // Built by summaryWithPeriod: every metric is filtered by the period on its own date column.
    base: '',
  },
} satisfies Record<string, ReportDef>;

export type ReportId = keyof typeof REPORTS;
export const isReportId = (r: string): r is ReportId => Object.prototype.hasOwnProperty.call(REPORTS, r);

/** The report query with the period and status filters bound. The summary filters by period inside each metric. */
export function reportQuery(id: ReportId, f: ReportFilters): SQL {
  const def: ReportDef = REPORTS[id];
  const from = f.from ?? null;
  const to = f.to ?? null;
  if (id === 'accreditation.summary') {
    // Each metric's own period column: replace the aggregate tables with period-filtered views of them.
    return sql`with period as (select ${from}::date as f, ${to}::date as t)
      select area, metric, value from (${sql.raw(summaryWithPeriod())}) q`;
  }
  const status = def.statuses && f.status && def.statuses.includes(f.status) ? f.status : null;
  return sql`select * from (${sql.raw(def.base)}) q
    where (${from}::date is null or q._on >= ${from}::date) and (${to}::date is null or q._on <= ${to}::date)
      and (${status}::text is null or q.status = ${status}::text)
    order by q._on desc nulls last limit 5000`;
}

/** The summary's metrics, each restricted to the period in the `period` CTE. */
function summaryWithPeriod(): string {
  const inP = (col: string) => `(${col} >= coalesce((select f from period), '-infinity'::date) and ${col} <= coalesce((select t from period), 'infinity'::date))`;
  return `
      select 'placements' as area, 'offers' as metric, count(*)::float as value from placement_offers where status <> 'withdrawn' and ${inP('offered_on')}
      union all select 'placements', 'median_ctc_lpa', coalesce(percentile_cont(0.5) within group (order by ctc_lpa), 0)::float from placement_offers where status = 'accepted' and ${inP('offered_on')}
      union all select 'research', 'publications', count(*)::float from publications where ${inP('make_date(year, 1, 1)')}
      union all select 'research', 'patents_granted', count(*)::float from patents where status = 'granted' and ${inP('granted_on')}
      union all select 'research', 'active_projects', count(*)::float from research_projects where status = 'active'
      union all select 'grievances', 'grievances_received', count(*)::float from grievance_tickets where ${inP('created_at::date')}
      union all select 'grievances', 'resolved_within_sla_pct', coalesce(round(100.0 * avg(case when resolved_at <= sla_due_at then 1 else 0 end), 1), 0)::float from grievance_tickets where resolved_at is not null and ${inP('created_at::date')}
      union all select 'feedback', 'feedback_reports_with_action', count(*)::float from iqac_feedback_reports where status = 'action_taken' and ${inP('created_at::date')}
      union all select 'obe', 'gap_actions_closed', count(*)::float from improvement_actions where status = 'done' and ${inP('closed_at::date')}
      union all select 'events', 'events_held', count(*)::float from campus_events where status = 'published' and ${inP('starts_at::date')}
      union all select 'alumni', 'alumni_registered', count(*)::float from alumni_profiles
      union all select 'mentoring', 'mentoring_sessions', count(*)::float from mentoring_sessions where ${inP('held_on')}`;
}
