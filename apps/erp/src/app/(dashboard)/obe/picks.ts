import 'server-only';
import { cookies } from 'next/headers';
import { api, load } from '@/lib/api';
import { YEAR_COOKIE } from '@/lib/config';
import type { ObeStructure } from '@/lib/obe';

type Sp = { programId?: string; academicYearId?: string; subjectId?: string };

/** The programme, academic year and subject an OBE page shows: from the URL, else the year switcher's year and the first programme and subject. */
export async function obePicks(q: Sp) {
  const structure = await load(() => api<ObeStructure & { sections?: { id: string; name: string; programId: string; term: number; academicYearId: string }[] }>('/v1/obe/structure'));
  if (structure.error !== undefined) return { error: structure.error as string } as const;
  const s = structure.data;
  const years = s.academicYears;
  const programId = s.programs.find((p) => p.id === q.programId)?.id ?? s.programs[0]?.id ?? '';
  const picked = (await cookies()).get(YEAR_COOKIE)?.value;
  const yearId = years.find((y) => y.id === q.academicYearId)?.id ?? years.find((y) => y.id === picked)?.id ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '';
  const subjects = s.subjects.filter((x) => x.programId === programId);
  const subjectId = subjects.find((x) => x.id === q.subjectId)?.id ?? subjects[0]?.id ?? '';
  const sections = (s.sections ?? []).filter((x) => x.programId === programId && x.academicYearId === yearId).map((x) => ({ id: x.id, name: x.name, term: x.term }));
  return { programs: s.programs.map((p) => ({ id: p.id, name: p.name })), years: years.map((y) => ({ id: y.id, label: y.label })), subjects: subjects.map((x) => ({ id: x.id, code: x.code, name: x.name, term: x.term })), sections, programId, yearId, subjectId } as const;
}
