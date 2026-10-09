import type { MessageKey } from '@/i18n/messages';
import type { Tone } from './depth';

/** Select options from a list. */
export const opt = <T>(list: T[], value: (x: T) => string, label: (x: T) => string) => list.map((x) => ({ value: value(x), label: label(x) }));

/** A part of a page that may be closed to this role: show it empty rather than failing the whole page. */
export const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/** A download link through the ERP's own download route. */
export const dl = (kind: string, id: string, extra = '') => `/api/download?kind=${kind}&id=${id}${extra}`;

/** The status words most desks share, with the colour each gets. */
export const STATE_TONES: Record<string, Tone> = {
  scheduled: 'warning',
  sealed: 'warning',
  released: 'success',
  cancelled: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  open: 'warning',
  assigned: 'info',
  in_progress: 'info',
  done: 'success',
  verified: 'success',
  reopened: 'danger',
  active: 'success',
  expiring: 'warning',
  expired: 'danger',
  waiting: 'warning',
  ready: 'success',
  fulfilled: 'neutral',
  planned: 'neutral',
  awaiting_remeasure: 'warning',
  effective: 'success',
  not_effective: 'danger',
  under: 'warning',
  within: 'success',
  over: 'danger',
  amc: 'success',
  warranty: 'info',
  none: 'danger',
  improved: 'success',
  no_change: 'neutral',
  worse: 'danger',
  processed: 'info',
  published: 'success',
  locked: 'neutral',
  draft: 'neutral',
  due: 'warning',
  paid: 'success',
};

/** The words for those statuses in the page's language (keys `dx.state.<status>`). */
export function stateWords(t: (key: MessageKey) => string): Record<string, string> {
  return Object.fromEntries(Object.keys(STATE_TONES).map((k) => [k, t(`dx.state.${k}` as MessageKey)]));
}
