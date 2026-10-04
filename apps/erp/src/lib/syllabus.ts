import type { Structure, SubjectLink } from './types';

/** The institution's subjects from the school structure, with the classes (same program and term) that study each. */
export function subjectLinks(s: Pick<Structure, 'subjects' | 'sections'>): SubjectLink[] {
  return s.subjects.map((sub) => ({
    id: sub.id,
    name: sub.name,
    code: sub.code,
    courseId: sub.courseId,
    classes: s.sections
      .filter((sec) => sec.programId === sub.programId && sec.term === sub.term)
      .map((sec) => sec.displayName)
      .sort(),
  }));
}
