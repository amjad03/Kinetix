/** Pure placement rules: who may register for a drive, and the placement statistics. */

export interface DriveRules {
  status: string;
  minCgpa: number;
  maxBacklogs: number;
  programIds: string[];
  registrationClosesOn: string | null;
  /** The window opens on this day (none = as soon as the drive is open). */
  registrationOpensOn?: string | null;
  /** Graduation years eligible; empty = any. */
  batchYears?: number[];
}
export interface Academics {
  /** Latest published CGPA; null when the student has no published result yet. */
  cgpa: number | null;
  backlogs: number;
  programId: string;
  /** The year the student is expected to graduate (their batch). */
  batchYear?: number | null;
}
export type IneligibleReason = 'not_open' | 'not_yet_open' | 'deadline_passed' | 'no_results' | 'cgpa_below' | 'backlogs_exceeded' | 'program_not_eligible' | 'batch_not_eligible';

export function checkEligibility(drive: DriveRules, a: Academics, today: string): { eligible: boolean; reasons: IneligibleReason[] } {
  const reasons: IneligibleReason[] = [];
  if (drive.status !== 'open') reasons.push('not_open');
  if (drive.registrationOpensOn && today < drive.registrationOpensOn) reasons.push('not_yet_open');
  if (drive.registrationClosesOn && today > drive.registrationClosesOn) reasons.push('deadline_passed');
  if (drive.programIds.length > 0 && !drive.programIds.includes(a.programId)) reasons.push('program_not_eligible');
  if (drive.batchYears?.length && (a.batchYear == null || !drive.batchYears.includes(a.batchYear))) reasons.push('batch_not_eligible');
  if (drive.minCgpa > 0) {
    if (a.cgpa === null) reasons.push('no_results');
    else if (a.cgpa < drive.minCgpa) reasons.push('cgpa_below');
  }
  if (a.backlogs > drive.maxBacklogs) reasons.push('backlogs_exceeded');
  return { eligible: reasons.length === 0, reasons };
}

/** Subjects whose most recent published result is a fail. `lines` are in chronological order. */
export function countBacklogs(lines: { subjectId: string; passed: boolean }[]): number {
  const latest = new Map<string, boolean>();
  for (const l of lines) latest.set(l.subjectId, l.passed);
  return [...latest.values()].filter((p) => !p).length;
}

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
};

export function ctcSummary(ctcs: number[]) {
  if (ctcs.length === 0) return { average: null, median: null, highest: null, lowest: null };
  return { average: Math.round((ctcs.reduce((s, x) => s + x, 0) / ctcs.length) * 100) / 100, median: median(ctcs), highest: Math.max(...ctcs), lowest: Math.min(...ctcs) };
}

/** Allowed offer moves; an accepted or declined offer is final for the student. */
export const OFFER_RESPONSES = ['accepted', 'declined'] as const;

const DRIVE_MOVES: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'cancelled'], closed: ['open', 'completed', 'cancelled'], completed: [], cancelled: [] };
export const canMoveDrive = (from: string, to: string) => (DRIVE_MOVES[from] ?? []).includes(to);

const INTERNSHIP_MOVES: Record<string, string[]> = { proposed: ['approved', 'cancelled'], approved: ['ongoing', 'cancelled'], ongoing: ['completed', 'cancelled'], completed: [], cancelled: [] };
export const canMoveInternship = (from: string, to: string) => (INTERNSHIP_MOVES[from] ?? []).includes(to);

/** Offer categories, lowest first: under the dream policy a placed student may sit only for a higher category. */
export const CATEGORIES = ['regular', 'dream', 'super_dream'] as const;
export type Category = (typeof CATEGORIES)[number];
const rank = (c: string | null | undefined) => Math.max(0, CATEGORIES.indexOf((c ?? 'regular') as Category));

/** The placement policy: one offer and done, the dream-offer ladder, or open (no limit). */
export type OfferPolicy = 'one_offer' | 'dream' | 'open';

/** A student's standing with the placement cell, beyond their marks. */
export interface Standing {
  /** null = never chose; false = opted out. */
  optedIn: boolean | null;
  debarredUntil: string | null;
  /** The highest category of a placement offer the student accepted; null = not placed. */
  placedCategory: string | null;
}
export type StandingReason = 'opted_out' | 'not_opted_in' | 'debarred' | 'already_placed';

/** Why the placement cell's rules (opt-in, debarment, the offer policy) keep a student from a placement drive. */
export function standingReasons(kind: string, category: string, s: Standing, rules: { policy: OfferPolicy; requireOptIn: boolean }, today: string): StandingReason[] {
  if (kind !== 'placement') return [];
  const out: StandingReason[] = [];
  if (s.optedIn === false) out.push('opted_out');
  else if (rules.requireOptIn && s.optedIn !== true) out.push('not_opted_in');
  if (s.debarredUntil && today <= s.debarredUntil) out.push('debarred');
  if (s.placedCategory !== null && rules.policy !== 'open' && (rules.policy === 'one_offer' || rank(category) <= rank(s.placedCategory))) out.push('already_placed');
  return out;
}

/** The year a student in this term graduates: semesters run two to a year, school grades one. */
export function graduationYear(yearEndsOn: string, termCount: number, term: number, level: string): number {
  const end = Number(yearEndsOn.slice(0, 4));
  const left = Math.max(0, termCount - term);
  return level === 'k12' || level === 'school' ? end + left : end + Math.floor(left / 2);
}

/** Interview slots: each registration gets the next free slot in one of the venues, in turn. */
export function planSlots(regIds: string[], start: Date, minutes: number, gapMinutes: number, venues: string[]): { registrationId: string; startsAt: Date; endsAt: Date; venue: string }[] {
  const step = (minutes + gapMinutes) * 60_000;
  return regIds.map((registrationId, i) => {
    const round = Math.floor(i / venues.length);
    const startsAt = new Date(start.getTime() + round * step);
    return { registrationId, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000), venue: venues[i % venues.length] };
  });
}

/** What each of the five ratings means on an employer or an alumni feedback form (NBA indirect attainment). */
export const FEEDBACK_CRITERIA: Record<'employer' | 'alumni', string[]> = {
  employer: ['Domain knowledge', 'Technical and practical skills', 'Communication', 'Teamwork and attitude', 'Problem solving and learning'],
  alumni: ['Curriculum relevance to work', 'Teaching and learning', 'Infrastructure and labs', 'Placement and career support', 'Values and ethics'],
};
