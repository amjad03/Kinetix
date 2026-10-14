// The new-college setup checklist: eight steps, each "done" when the data it unlocks exists.
import type { MessageKey } from '@/i18n/messages';

export type SetupStepId = 'profile' | 'year' | 'affiliation' | 'programmes' | 'staff' | 'students' | 'timetable' | 'fees';

export interface SetupStep {
  id: SetupStepId;
  title: MessageKey;
  help: MessageKey;
  href: string;
  minutes: number;
  done: boolean;
  /** An Excel upload is the usual way to do it. */
  upload?: boolean;
}

export interface SetupFacts {
  academicYears: number;
  campuses: number;
  programs: number;
  subjects: number;
  students: number;
  staff: number;
  classesScheduled: number;
  feesBilledPaise: number;
  /** A university or board is chosen (Settings > Affiliation). */
  affiliated: boolean;
  /** One academic year is marked current (Settings > Academic years). */
  currentYear: boolean;
  /** Terms or semesters in the academic years. */
  terms: number;
}

/** The checklist from what the institution already has; unknown facts count as not done. */
export function setupSteps(f: Partial<SetupFacts>): SetupStep[] {
  const n = (v: number | undefined) => v ?? 0;
  return [
    { id: 'profile', title: 'setup.s.profile', help: 'setup.s.profileHelp', href: '/settings/institution', minutes: 5, done: n(f.academicYears) > 0 && n(f.campuses) > 0 },
    { id: 'year', title: 'setup.s.year', help: 'setup.s.yearHelp', href: '/settings/academic-years', minutes: 5, done: f.currentYear === true && n(f.terms) > 0 },
    { id: 'affiliation', title: 'setup.s.affiliation', help: 'setup.s.affiliationHelp', href: '/settings/affiliation', minutes: 5, done: f.affiliated === true },
    { id: 'programmes', title: 'setup.s.programmes', help: 'setup.s.programmesHelp', href: '/institution-setup', minutes: 10, done: n(f.programs) > 0 && n(f.subjects) > 0 },
    { id: 'staff', title: 'setup.s.staff', help: 'setup.s.staffHelp', href: '/import', minutes: 10, done: n(f.staff) > 1, upload: true },
    { id: 'students', title: 'setup.s.students', help: 'setup.s.studentsHelp', href: '/import', minutes: 15, done: n(f.students) > 0, upload: true },
    { id: 'timetable', title: 'setup.s.timetable', help: 'setup.s.timetableHelp', href: '/timetable', minutes: 30, done: n(f.classesScheduled) > 0 },
    { id: 'fees', title: 'setup.s.fees', help: 'setup.s.feesHelp', href: '/fees', minutes: 15, done: n(f.feesBilledPaise) > 0 },
  ];
}

export interface SetupSummary {
  done: number;
  total: number;
  next: SetupStep | null;
}

export function summarize(steps: readonly SetupStep[]): SetupSummary {
  return { done: steps.filter((s) => s.done).length, total: steps.length, next: steps.find((s) => !s.done) ?? null };
}
