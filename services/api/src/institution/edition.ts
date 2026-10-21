// The institution's edition (docs/zynetix/PLAN.md): `full` is the ERP with the board; `board` is
// Zynetix alone (smart board, Teacher/Student/Parent apps and the Zynetix admin dashboard).
import type { Edition } from '../db/schema.js';

export const EDITIONS = ['full', 'board'] as const satisfies readonly Edition[];

export const EDITION_BOARD_ONLY = 'EDITION_BOARD_ONLY';
export const BOARD_ONLY_MESSAGE = 'This institution uses the Zynetix board edition, which does not include this ERP module';

/**
 * Route prefixes (after /v1/) of ERP-only modules, refused in the board edition. Everything else
 * stays open: sign-in, people, academic structure, curriculum and content, timetable, boards and
 * devices, AI, classroom tools, notifications and audit. `books` is the accounts day-book, not
 * textbooks (those are topic materials).
 */
export const ERP_ONLY_ROUTES = new Set([
  'fees',
  'fee-accounts',
  'finance',
  'books',
  'tally',
  'hostel',
  'hr',
  'payroll',
  'admissions',
  'transport',
  'inventory',
  'assets',
  'asset-ops',
  'library',
  'canteen',
  'placements',
  'alumni',
  'alumni-portal',
  'careers',
  'research',
  'accreditation',
  'quality',
  'quality-hub',
  'obe',
  'exam-office',
  'external-examiners',
  'examiner-portal',
  'evaluation',
  'university-results',
  'course-registration',
]);

/** Nested ERP routes under otherwise open families. */
const ERP_ONLY_NESTED: [string, string][] = [
  ['public', 'admissions'],
  ['public', 'leads'],
  ['admin', 'payments'],
];

/** Parent App routes `parent/children/:id/<x>` that belong to an ERP module. */
const ERP_ONLY_CHILD = new Set(['bank-transfers', 'fees', 'hostel', 'transport', 'library']);

/** Whether a request path belongs to an ERP-only module. */
export function erpOnlyPath(path: string): boolean {
  const parts = path.split('?')[0].replace(/^\/+/, '').split('/');
  if (parts[0] !== 'v1') return false;
  if (ERP_ONLY_ROUTES.has(parts[1])) return true;
  if (ERP_ONLY_NESTED.some(([a, b]) => parts[1] === a && parts[2] === b)) return true;
  return parts[1] === 'parent' && parts[2] === 'children' && parts.length >= 5 && ERP_ONLY_CHILD.has(parts[4]);
}

/** For public routes without a signed-in person (`public/admissions/:slug`): the institution's slug. */
export function publicSlugOf(path: string): string | null {
  const parts = path.split('?')[0].replace(/^\/+/, '').split('/');
  return parts[0] === 'v1' && parts[1] === 'public' && parts[3] ? decodeURIComponent(parts[3]) : null;
}
