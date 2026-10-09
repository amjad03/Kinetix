/** Pure rules for the governance module: rule versions, incident flow and retention. No database. */

export const RULE_DOMAINS = ['grading', 'credits', 'eligibility', 'quota', 'obe', 'attendance', 'fees', 'other'] as const;
export type RuleDomain = (typeof RULE_DOMAINS)[number];

export interface RuleVersion {
  version: number;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** The version in force on `on` (YYYY-MM-DD): approved, started, not ended; the highest version wins when two overlap. */
export function ruleInForce<T extends RuleVersion>(versions: T[], on: string): T | null {
  const live = versions.filter((v) => v.status === 'approved' && v.effectiveFrom <= on && (!v.effectiveTo || v.effectiveTo >= on));
  return live.sort((a, b) => b.version - a.version)[0] ?? null;
}

/** The day before a date (YYYY-MM-DD), used to end the previous version when a new one takes over. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const RULE_FLOW: Record<string, string[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'draft'],
  approved: ['retired'],
  retired: [],
};

export const canMoveRule = (from: string, to: string) => (RULE_FLOW[from] ?? []).includes(to);

export const INCIDENT_SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'] as const;
export const INCIDENT_CATEGORIES = ['security', 'data_breach', 'outage', 'data_quality', 'safety', 'other'] as const;
export const INCIDENT_FLOW = ['open', 'investigating', 'mitigated', 'resolved', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_FLOW)[number];

/** Hours within which a response is expected, by severity. */
export const RESPONSE_HOURS: Record<string, number> = { sev1: 1, sev2: 4, sev3: 24, sev4: 72 };
/** A personal-data breach is reported to the Data Protection Board within 72 hours of detection. */
export const BREACH_REPORT_HOURS = 72;

export function breachDeadline(detectedAt: Date, personalDataInvolved: boolean): Date | null {
  return personalDataInvolved ? new Date(detectedAt.getTime() + BREACH_REPORT_HOURS * 3600_000) : null;
}

/** Status can move forward or back one step; closing a sev1 or sev2 needs a root cause and corrective actions. */
export function canMoveIncident(from: string, to: string, i: { severity: string; rootCause: string | null; correctiveActions: string | null }): { ok: true } | { ok: false; reason: string } {
  const a = INCIDENT_FLOW.indexOf(from as IncidentStatus);
  const b = INCIDENT_FLOW.indexOf(to as IncidentStatus);
  if (a < 0 || b < 0) return { ok: false, reason: 'Unknown status' };
  if (b === a) return { ok: false, reason: 'The incident is already in that status' };
  if (to === 'closed' && (i.severity === 'sev1' || i.severity === 'sev2') && (!i.rootCause?.trim() || !i.correctiveActions?.trim())) {
    return { ok: false, reason: 'Record the root cause and the corrective actions before closing a severity 1 or 2 incident' };
  }
  return { ok: true };
}

/** Whether a file is past its retention: created before (today minus the months), not on legal hold, not already archived. */
export function retentionDue(file: { createdAt: Date; legalHold: boolean; archivedAt: Date | null }, retainMonths: number, now: Date): boolean {
  if (file.legalHold || file.archivedAt) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retainMonths);
  return file.createdAt < cutoff;
}
