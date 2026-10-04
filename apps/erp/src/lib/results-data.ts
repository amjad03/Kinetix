import 'server-only';
import { isOnlyHod } from './access';
import { api, ApiError, getMe } from './api';
import { hodResultClass } from './results';
import type { AssessmentSummary, DepartmentOverview, DepartmentRef, Structure } from './types';

export interface ResultClass {
  id: string;
  name: string;
  students: number;
  assessments: AssessmentSummary[];
}

/**
 * Every class the signed-in user may see results for, with its assessments. The principal and
 * administrator see every class; a head of department sees the classes they teach and their
 * department's classes (the API answers 403 for the rest, or only the department's subjects).
 */
export async function resultClasses(): Promise<ResultClass[]> {
  const [structure, me] = await Promise.all([api<Structure>('/v1/admin/structure'), getMe()]);
  const hodFilter = isOnlyHod(me.roles) ? await hodSections() : null;
  const rows = await Promise.all(
    structure.sections.map(async (s) => {
      try {
        const assessments = await api<AssessmentSummary[]>(`/v1/assessments?sectionId=${s.id}`);
        return { id: s.id, name: s.displayName, students: s.students, assessments };
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) return null;
        throw e;
      }
    }),
  );
  return rows.filter((r): r is ResultClass => r !== null && (!hodFilter || hodResultClass(r.id, r.assessments.length, hodFilter.taught, hodFilter.department)));
}

/** The classes a head of department teaches, and their departments' classes. */
async function hodSections(): Promise<{ taught: Set<string>; department: Set<string> }> {
  const [taught, depts] = await Promise.all([
    orElse(api<{ section: { id: string } }[]>('/v1/teacher/classes'), []),
    orElse(api<DepartmentRef[]>('/v1/departments'), []),
  ]);
  const overviews = await Promise.all(depts.map((d) => orElse(api<DepartmentOverview>(`/v1/departments/${d.id}/overview`), null)));
  return {
    taught: new Set(taught.map((c) => c.section.id)),
    department: new Set(overviews.flatMap((o) => o?.classes.map((c) => c.sectionId) ?? [])),
  };
}

/** An API refusal reads as `fallback`; redirects (an expired session) go through. */
function orElse<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((e: unknown) => {
    if (e instanceof ApiError) return fallback;
    throw e;
  });
}
