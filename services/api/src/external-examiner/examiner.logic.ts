import { createHash, randomBytes, randomInt } from 'node:crypto';

export const ASSIGNMENT_ROLES = ['valuer', 'qp_setter', 'scrutiniser'] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const QP_STATES = ['draft', 'scrutiny', 'approved', 'locked'] as const;
export type QpState = (typeof QP_STATES)[number];

export type QpAction = 'submit' | 'approve' | 'return' | 'lock';
export type QpActor = 'setter' | 'scrutiniser' | 'office';

/**
 * Question paper states: draft -> scrutiny -> approved -> locked. The setter submits; the scrutiniser or the office
 * approves or returns it to draft with a note; only the office locks it. A locked paper never changes.
 */
export function nextQpState(from: QpState, action: QpAction, actor: QpActor): QpState | null {
  if (from === 'draft' && action === 'submit' && (actor === 'setter' || actor === 'office')) return 'scrutiny';
  if (from === 'scrutiny' && action === 'approve' && actor !== 'setter') return 'approved';
  if (from === 'scrutiny' && action === 'return' && actor !== 'setter') return 'draft';
  if (from === 'approved' && action === 'return' && actor === 'office') return 'draft';
  if (from === 'approved' && action === 'lock' && actor === 'office') return 'locked';
  return null;
}

/** A code printed on the script cover instead of the candidate's name: letters and digits without look-alikes. */
export function scriptCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'S' + Array.from({ length: 7 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

/** An invite token (shown once) and the hash that is stored. */
export function newInvite(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: hashInvite(token) };
}
export const hashInvite = (token: string) => createHash('sha256').update(`examiner-invite:${token}`).digest('hex');

/** Units a claim covers and what it costs: valued scripts not yet claimed, or one paper for a setter or scrutiniser. */
export function claimAmount(role: AssignmentRole, ratePaise: number, valued: number, alreadyClaimed: number, qpStatus: QpState | null): { units: number; amountPaise: number } {
  let units = 0;
  if (role === 'valuer') units = Math.max(0, valued - alreadyClaimed);
  else if (role === 'qp_setter') units = qpStatus && qpStatus !== 'draft' && alreadyClaimed === 0 ? 1 : 0;
  else units = qpStatus && (qpStatus === 'approved' || qpStatus === 'locked') && alreadyClaimed === 0 ? 1 : 0;
  return { units, amountPaise: units * ratePaise };
}
