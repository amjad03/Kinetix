import { describe, expect, it } from 'vitest';
import { setupSteps, summarize } from './setup';

describe('setup checklist', () => {
  it('starts with nothing done on an empty college', () => {
    const s = summarize(setupSteps({}));
    expect(s).toMatchObject({ done: 0, total: 7 });
    expect(s.next?.id).toBe('profile');
  });

  it('marks steps done from the data that exists', () => {
    const steps = setupSteps({ academicYears: 1, campuses: 1, programs: 3, subjects: 20, staff: 12, students: 0, classesScheduled: 0, feesBilledPaise: 0 });
    expect(steps.filter((x) => x.done).map((x) => x.id)).toEqual(['profile', 'programmes', 'staff']);
    expect(summarize(steps).next?.id).toBe('affiliation');
    expect(summarize(setupSteps({ academicYears: 1, campuses: 1, programs: 3, subjects: 20, staff: 12, affiliated: true })).next?.id).toBe('students');
  });

  it('is complete when every step has data', () => {
    const s = summarize(setupSteps({ academicYears: 1, campuses: 1, programs: 1, subjects: 1, staff: 2, students: 5, classesScheduled: 4, feesBilledPaise: 100, affiliated: true }));
    expect(s.done).toBe(7);
    expect(s.next).toBeNull();
  });
});
