// Academic terms (semesters): GET /v1/terms, POST / PUT / DELETE /v1/admin/terms.
// Lesson recordings are kept until their term ends, plus the grace period in Settings.
import { isIsoDate } from './dates';

export interface Term {
  id: string;
  academicYearId: string;
  /** "2026-27" */
  academicYear: string;
  name: string;
  startsOn: string;
  endsOn: string;
  /** null: every program. */
  programIds: string[] | null;
  programs: string[] | null;
}

/** What the add / edit dialog sends (the API picks the academic year the term starts in). */
export interface TermInput {
  name: string;
  startsOn: string;
  endsOn: string;
  programIds: string[] | null;
}

export type TermProblem = 'name' | 'nameLong' | 'startsOn' | 'endsOn' | 'range' | 'programs' | 'overlap';

/** Whether two terms could apply to the same program (null = every program). */
export function programsMeet(a: string[] | null, b: string[] | null): boolean {
  return a === null || b === null || a.some((id) => b.includes(id));
}

/** The first other term that overlaps this one for the same programs (the API refuses those). */
export function overlappingTerm(i: TermInput, terms: Term[], selfId?: string): Term | undefined {
  return terms.find((t) => t.id !== selfId && t.startsOn <= i.endsOn && t.endsOn >= i.startsOn && programsMeet(t.programIds, i.programIds));
}

/** What is wrong with the dialog's input (the API checks the same, and the academic year), or null. */
export function termProblem(i: TermInput, terms: Term[] = [], selfId?: string): TermProblem | null {
  if (!i.name.trim()) return 'name';
  if (i.name.trim().length > 120) return 'nameLong';
  if (!isIsoDate(i.startsOn)) return 'startsOn';
  if (!isIsoDate(i.endsOn)) return 'endsOn';
  if (i.endsOn < i.startsOn) return 'range';
  if (i.programIds !== null && i.programIds.length === 0) return 'programs';
  if (overlappingTerm(i, terms, selfId)) return 'overlap';
  return null;
}

/** The term in progress on a date, else the next one to start. */
export function currentTerm(terms: Term[], today: string): Term | undefined {
  return terms.find((t) => t.startsOn <= today && today <= t.endsOn) ?? [...terms].filter((t) => t.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
}
