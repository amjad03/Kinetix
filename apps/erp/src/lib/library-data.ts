import 'server-only';
import { api, ApiError } from './api';
import { uniqueStudents } from './library';
import type { LibraryLoan, LibraryStudent, Me, Structure } from './types';

export interface LibraryStudents {
  students: LibraryStudent[];
  /** False when this role can't read class rosters (the librarian): only students the library already knows. */
  complete: boolean;
}

/**
 * Students the desk can lend to. Principals and administrators read every class roster
 * (structure + `GET /v1/sections/:id/roster`). The API has no student lookup for the librarian
 * yet, so the library desk falls back to students who have books out.
 */
export async function libraryStudents(me: Me, loans: LibraryLoan[]): Promise<LibraryStudents> {
  const known = loans.map((l) => ({ id: l.student.id, fullName: l.student.fullName, rollNo: l.student.rollNo, className: l.className }));
  if (!me.roles.some((r) => r === 'principal' || r === 'tenant_admin')) return { students: uniqueStudents(known), complete: false };
  try {
    const structure = await api<Structure>('/v1/admin/structure');
    const rosters = await Promise.all(
      structure.sections
        .filter((s) => s.students > 0)
        .map(async (s) => (await api<{ id: string; fullName: string; rollNo: string | null }[]>(`/v1/sections/${s.id}/roster`)).map((x) => ({ ...x, className: s.displayName }))),
    );
    return { students: uniqueStudents([...rosters.flat(), ...known]), complete: true };
  } catch (e) {
    if (e instanceof ApiError) return { students: uniqueStudents(known), complete: false };
    throw e;
  }
}
