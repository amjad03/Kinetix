/** Pure rules for grievances, the confidential committee workflow, discipline and welfare. */

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

/** Hours to resolve, by severity. */
export const SLA_HOURS: Record<Severity, number> = { critical: 24, high: 48, medium: 120, low: 240 };

export const COMMITTEE_CATEGORIES = ['ragging', 'harassment'] as const;
export type Committee = 'anti_ragging' | 'icc' | 'posh';

/** Ragging goes to the anti-ragging committee; harassment to the ICC (or POSH when the reporter says it is a staff matter). */
export function committeeFor(category: string, requested?: Committee): Committee | null {
  if (category === 'ragging') return 'anti_ragging';
  if (category === 'harassment') return requested === 'posh' ? 'posh' : 'icc';
  return null;
}

/** Committee matters are never lower than high severity. */
export function effectiveSeverity(category: string, severity: Severity): Severity {
  return committeeFor(category) && SEVERITIES.indexOf(severity) < SEVERITIES.indexOf('high') ? 'high' : severity;
}

export const slaDueAt = (from: Date, severity: Severity) => new Date(from.getTime() + SLA_HOURS[severity] * 3_600_000);

export const OPEN_STATUSES = ['open', 'assigned', 'in_progress', 'escalated', 'reopened'];
export const MAX_ESCALATION = 2;

/** Whether a ticket is past its SLA and can still be escalated. */
export const isOverdue = (t: { status: string; slaDueAt: Date; escalationLevel: number }, now: Date) => OPEN_STATUSES.includes(t.status) && t.slaDueAt.getTime() < now.getTime() && t.escalationLevel < MAX_ESCALATION;

/** The next level and its new deadline: half the original SLA, but at least 24 hours. */
export function escalate(t: { escalationLevel: number; severity: Severity }, now: Date) {
  const hours = Math.max(24, SLA_HOURS[t.severity] / 2);
  return { level: t.escalationLevel + 1, dueAt: new Date(now.getTime() + hours * 3_600_000) };
}

const TICKET_MOVES: Record<string, string[]> = {
  open: ['assigned', 'in_progress', 'escalated', 'resolved'],
  assigned: ['in_progress', 'escalated', 'resolved'],
  in_progress: ['escalated', 'resolved'],
  escalated: ['in_progress', 'resolved'],
  reopened: ['assigned', 'in_progress', 'escalated', 'resolved'],
  resolved: ['closed', 'reopened'],
  closed: [],
};
export const canMoveTicket = (from: string, to: string) => (TICKET_MOVES[from] ?? []).includes(to);

/** The reporter may reopen within a week of the resolution. */
export const REOPEN_DAYS = 7;
export const canReopen = (resolvedAt: Date | null, now: Date) => !!resolvedAt && now.getTime() - resolvedAt.getTime() <= REOPEN_DAYS * 86_400_000;

export const COMMITTEE_STAGES = ['received', 'inquiry', 'hearing', 'report', 'action', 'closed'] as const;
/** Stages advance in order; the hearing may be skipped (for example when the complaint is withdrawn). */
export function canAdvanceStage(from: string, to: string): boolean {
  const a = COMMITTEE_STAGES.indexOf(from as (typeof COMMITTEE_STAGES)[number]);
  const b = COMMITTEE_STAGES.indexOf(to as (typeof COMMITTEE_STAGES)[number]);
  if (a < 0 || b < 0 || b <= a) return false;
  return b === a + 1 || (from === 'inquiry' && to === 'report');
}

export const APPEAL_WINDOW_DAYS = 15;
export const withinAppealWindow = (actionAt: Date, now: Date) => now.getTime() - actionAt.getTime() <= APPEAL_WINDOW_DAYS * 86_400_000;

/** Suspension and expulsion are the principal's alone; lighter actions can also come from the administrator. */
export const SEVERE_ACTIONS = ['suspension', 'expulsion'];
export const needsPrincipal = (action: string) => SEVERE_ACTIONS.includes(action);

export const WELFARE_MOVES: Record<string, string[]> = {
  submitted: ['under_review', 'approved', 'rejected', 'withdrawn'],
  under_review: ['approved', 'rejected', 'withdrawn'],
  approved: ['disbursed'],
  rejected: [],
  disbursed: [],
  withdrawn: [],
};
export const canMoveWelfare = (from: string, to: string) => (WELFARE_MOVES[from] ?? []).includes(to);

/** An approved amount may not exceed what was asked for (when an amount was asked for). */
export const approvedAmountOk = (requested: number, approved: number) => approved >= 0 && (requested === 0 || approved <= requested);
