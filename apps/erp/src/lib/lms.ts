// Shapes of v1/lms (services/api/src/lms).

export const LMS_SOURCES = ['homework', 'test', 'assignment', 'internal', 'exam', 'practical'] as const;
export const LMS_KINDS = ['topic', 'video', 'homework', 'assessment', 'file', 'link'] as const;

export interface LmsCourseRow {
  id: string;
  title: string;
  status: 'draft' | 'published';
  subject: string;
  section: string;
}

export interface LmsItem { id: string; kind: (typeof LMS_KINDS)[number]; title: string; refId: string | null; url: string | null; position: number }
export interface LmsModule { id: string; title: string; position: number; items: LmsItem[] }
export interface LmsCourse extends LmsCourseRow {
  description: string;
  canManage: boolean;
  modules: LmsModule[];
  announcements: { id: string; title: string; body: string; createdAt: string }[];
}

export interface GradeCategory { id: string; name: string; source: (typeof LMS_SOURCES)[number]; weight: number }
export interface GradeRow { studentId: string; fullName: string; rollNo: string; cells: { categoryId: string; percent: number | null; overridden: boolean }[]; overall: number | null; letter: string | null }
export interface Gradebook { course: { id: string; title: string }; categories: GradeCategory[]; rows: GradeRow[] }

export interface Structure {
  sections: { id: string; displayName: string; programId: string; term: number }[];
  subjects: { id: string; code: string; name: string; programId: string; term: number }[];
}

/** One option per class and subject that can have a course; the value carries both ids. */
export function offeringOptions(s: Structure): { value: string; label: string }[] {
  return s.sections.flatMap((sec) => s.subjects.filter((x) => x.programId === sec.programId && x.term === sec.term).map((x) => ({ value: `${sec.id}|${x.id}`, label: `${sec.displayName} · ${x.name}` })));
}
