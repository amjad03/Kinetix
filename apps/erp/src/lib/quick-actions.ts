import type { MessageKey } from '@/i18n/messages';
import { findNav, type NavGroup } from './nav';

/** The everyday jobs, one click from the palette and the top bar's + menu. */
export interface QuickAction {
  id: string;
  label: MessageKey;
  href: string;
  icon: 'fee' | 'attendance' | 'admission' | 'leave';
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'fee', label: 'ez.collectFee', href: '/accounts', icon: 'fee' },
  { id: 'attendance', label: 'ez.markAttendance', href: '/attendance', icon: 'attendance' },
  { id: 'admission', label: 'ez.newAdmission', href: '/admissions/applications', icon: 'admission' },
  { id: 'leave', label: 'ez.applyLeave', href: '/hr/leave', icon: 'leave' },
];

/** The quick actions this person can reach: their pages are in the menu they see. */
export function quickActionsFor(groups: readonly NavGroup[]): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => findNav(groups, a.href) !== null);
}
