import 'server-only';
import { api, ApiError } from './api';
import type { AssessmentDetail, AssessmentSummary, Structure } from './types';

export interface ResultClass {
  id: string;
  name: string;
  students: number;
  assessments: AssessmentSummary[];
}

/**
 * Every class the signed-in user may see results for, with its assessments. The principal and
 * administrator see every class; a head of department sees the classes they teach (the API
 * answers 403 for the rest, which are left out).
 */
export async function resultClasses(): Promise<ResultClass[]> {
  const structure = await api<Structure>('/v1/admin/structure');
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
  return rows.filter((r): r is ResultClass => r !== null);
}

/** Each assessment with its marks, for averages (the list has no stats). */
export function assessmentDetails(ids: string[]): Promise<AssessmentDetail[]> {
  return Promise.all(ids.map((id) => api<AssessmentDetail>(`/v1/assessments/${id}`)));
}
