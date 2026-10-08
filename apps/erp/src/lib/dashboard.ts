// What each role sees on the dashboard at "/", and the maths behind the KPI trends.

import type { MessageKey } from '@/i18n/messages';
import { canSee } from './access';
import type { RoleName } from './types';

/** The roll-up behind the dashboards: GET /v1/admin/dashboard (a block is null when the role may not see it). */
export interface DashboardRollup {
  date: string;
  students: { total: number; joined: number; prevJoined: number } | null;
  staff: { total: number } | null;
  attendance: { today: number | null; previous: number | null } | null;
  fees: { collected: number; previous: number; outstanding: number; overdueInvoices: number } | null;
  pending: { leave: number | null; marksToVerify: number | null; examPapers: number | null; feeFollowUps: number | null; admissionsReview: number | null };
  performance: { month: string; attendance: number | null; internalMarks: number | null; coAttainment: number | null }[] | null;
}

export type Persona = 'principal' | 'hod' | 'accountant' | 'admissions' | 'hr';

/** The dashboard a person gets: the most senior of their roles. */
export function personaFor(roles: readonly RoleName[]): Persona | null {
  if (roles.some((r) => r === 'principal' || r === 'tenant_admin')) return 'principal';
  if (roles.includes('hod')) return 'hod';
  if (roles.includes('accountant')) return 'accountant';
  if (roles.includes('admissions_officer')) return 'admissions';
  if (roles.includes('hr_manager')) return 'hr';
  return null;
}

export type View = 'overview' | 'exams' | 'finance' | 'admissions' | 'hr';

export const VIEW_LABEL: Record<View, MessageKey> = {
  overview: 'dash.view.overview',
  exams: 'dash.view.exams',
  finance: 'dash.view.finance',
  admissions: 'dash.view.admissions',
  hr: 'dash.view.hr',
};

/**
 * The lenses a person can switch between on their dashboard: the overview for their role, and the
 * exam, finance, admissions and HR desks when they may open those. The examination officer's
 * view is the "exams" lens (there is no separate role: the principal, administrator and heads of department run exams).
 */
export function viewsFor(roles: readonly RoleName[]): View[] {
  const persona = personaFor(roles);
  if (persona !== 'principal' && persona !== 'hod') return ['overview'];
  const out: View[] = ['overview'];
  if (canSee(roles, 'exams')) out.push('exams');
  if (persona === 'principal') {
    if (canSee(roles, 'fees')) out.push('finance');
    if (canSee(roles, 'admissions')) out.push('admissions');
    if (canSee(roles, 'hr')) out.push('hr');
  }
  return out;
}

export function viewFrom(raw: string | undefined, roles: readonly RoleName[]): View {
  const views = viewsFor(roles);
  return views.find((v) => v === raw) ?? 'overview';
}

/** Percentage change from `previous` to `current`; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Difference in percentage points; null when either side is missing. */
export function pointsChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return Math.round((current - previous) * 10) / 10;
}

/** A person's first name for a greeting ("Dr. Priya Sharma" keeps the title: "Dr. Priya"). */
export function greetingName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.trim();
  return /^(dr|prof|mr|mrs|ms|shri|smt)\.?$/i.test(parts[0]) ? `${parts[0]} ${parts[1]}` : parts[0];
}
