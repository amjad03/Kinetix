import 'server-only';
import { cache } from 'react';
import { api, load } from './api';
import type { DashboardRollup } from './dashboard';
import { schoolToday } from './school';
import { setupSteps, type SetupStep } from './setup';
import type { ClassesDay, FeeSummary, Structure } from './types';

/** Loads the facts behind the setup checklist (best effort: a failed call counts as "not done"). */
export const loadSetup = cache(async (): Promise<SetupStep[]> => {
  const [st, roll, fees, day] = await Promise.all([
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
    load(() => api<FeeSummary>('/v1/fees/summary')),
    load(() => api<ClassesDay>(`/v1/admin/classes?date=${schoolToday()}`)),
  ]);
  const s = st.data;
  return setupSteps({
    academicYears: s?.academicYears.length,
    campuses: s?.campuses.length,
    programs: s?.programs.length,
    subjects: s?.subjects.length,
    students: roll.data?.students?.total ?? s?.sections.reduce((a, x) => a + x.students, 0),
    staff: roll.data?.staff?.total,
    classesScheduled: day.data?.classes.length,
    feesBilledPaise: fees.data?.billedPaise,
  });
});
