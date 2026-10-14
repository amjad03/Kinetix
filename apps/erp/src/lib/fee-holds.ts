// Fee holds (GET /v1/fee-holds): overdue fees hold back a student's hall ticket, result or transfer certificate when
// the institution turns that on (fee settings, off by default); the principal can let one through with a reason.
import type { Tone } from '@/components/ui';
import type { RoleName } from './types';

export const FEE_HOLD_PURPOSES = ['hallTicket', 'results', 'tc'] as const;
export type FeeHoldPurpose = (typeof FEE_HOLD_PURPOSES)[number];

export interface FeeHold {
  purpose: FeeHoldPurpose;
  held: boolean;
  overridden: boolean;
  enabled: boolean;
  message: string | null;
}

export interface FeeHoldStatus {
  duePaise: number;
  overduePaise: number;
  holds: FeeHold[];
  overrides: { id: string; purpose: FeeHoldPurpose; reason: string; grantedBy: string | null; createdAt: string }[];
}

export interface FeeHoldOverrideRow {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  section: string | null;
  purpose: FeeHoldPurpose;
  reason: string;
  grantedBy: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Who may see holds (fee-holds.ts GET) and who may let one through (OVERRIDERS). */
export const FEE_HOLD_READERS: RoleName[] = ['tenant_admin', 'principal', 'accountant', 'exam_controller', 'hod'];
export const canOverrideFeeHold = (roles: readonly RoleName[]) => roles.includes('principal');

export type HoldState = 'off' | 'clear' | 'held' | 'allowed';

/** What a hold means for the person at the desk: off (not used), clear, held, or allowed by the principal. */
export function holdState(h: FeeHold): HoldState {
  if (!h.enabled) return 'off';
  if (!h.held) return 'clear';
  return h.overridden ? 'allowed' : 'held';
}

export const HOLD_TONE: Record<HoldState, Tone> = { off: 'neutral', clear: 'success', held: 'danger', allowed: 'warning' };
