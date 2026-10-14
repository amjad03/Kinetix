import type { TFunction } from '@/i18n/translate';

/** Every status word of stores, purchase, assets, facilities, placements and alumni records (`ivd.st.<status>`). */
export const STATUSES = [
  'submitted', 'approved', 'rejected', 'ordered', 'pending_approval', 'issued', 'partially_received', 'received', 'cancelled', 'matched', 'mismatch', 'paid', 'open', 'closed', 'returned',
  'within', 'exceeded', 'override', 'no_budget', 'not_required', 'pending', 'active', 'in_maintenance', 'disposed', 'proposed', 'written_off', 'expiring', 'expired', 'assigned', 'in_progress',
  'on_hold', 'resolved', 'breached', 'at_risk', 'on_track', 'met', 'draft', 'completed', 'offered', 'accepted', 'declined', 'withdrawn', 'revoked', 'blacklisted', 'ongoing', 'planned',
  'published', 'scheduled', 'joined', 'not_joined', 'adjusted', 'inactive',
] as const;
export type Status = (typeof STATUSES)[number];

/** Status word → label, for the list columns a server page describes. */
export function statusLabels(t: TFunction): Record<string, string> {
  return Object.fromEntries(STATUSES.map((s) => [s, t(`ivd.st.${s}`)]));
}

/** One status in words (the word itself when it is not a known one). */
export function statusLabel(t: TFunction, s: string): string {
  return (STATUSES as readonly string[]).includes(s) ? t(`ivd.st.${s as Status}`) : s;
}

export const PURCHASE_MODES = ['direct', 'quotation', 'rate_contract', 'gem', 'tender'] as const;
export const modeLabels = (t: TFunction) => Object.fromEntries(PURCHASE_MODES.map((m) => [m, t(`ivd.mode.${m}`)]));
