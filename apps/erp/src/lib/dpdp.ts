// Shapes of the DPDP request queue (v1/dpdp) and delegated approvals (v1/delegations).

export type DpdpKind = 'export' | 'correction' | 'erasure';
export type DpdpStatus = 'pending' | 'completed' | 'rejected' | 'blocked';

export interface DpdpRow {
  id: string;
  userId: string;
  kind: DpdpKind;
  status: DpdpStatus;
  details: string;
  correction: { field: string; value: string } | null;
  resolutionNote: string | null;
  retentionReasons: string[];
  processedAt: string | null;
  createdAt: string;
  person: { id: string; fullName: string; email: string | null } | null;
}

export interface GrievanceOfficer {
  officer: { name: string; email: string | null; phone: string | null } | null;
  response: string;
}

/** Requests an administrator still has to work, oldest first. */
export const openRequests = (rows: readonly DpdpRow[]) => rows.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Days a request has waited; the Act expects an answer within 30 days. */
export function waitingDays(createdAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000));
}

export type DelegationScope = 'all' | 'workflows' | 'leave';
export interface DelegationRow {
  id: string;
  delegatorId: string;
  delegateId: string;
  delegatorName: string;
  delegateName: string;
  scope: DelegationScope;
  startsOn: string;
  endsOn: string;
  reason: string;
  revokedAt: string | null;
  mine: boolean;
}

export type DelegationState = 'revoked' | 'upcoming' | 'active' | 'ended';

/** Where a delegation stands on a given day (YYYY-MM-DD). */
export function delegationState(d: Pick<DelegationRow, 'startsOn' | 'endsOn' | 'revokedAt'>, today: string): DelegationState {
  if (d.revokedAt) return 'revoked';
  if (today < d.startsOn) return 'upcoming';
  if (today > d.endsOn) return 'ended';
  return 'active';
}
