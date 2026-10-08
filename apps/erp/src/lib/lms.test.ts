import { describe, expect, it } from 'vitest';
import { canSee } from './access';
import { offeringOptions } from './lms';

describe('lms', () => {
  it('offers each subject of the class programme and term', () => {
    const o = offeringOptions({
      sections: [{ id: 's1', displayName: 'BCom 3 A', programId: 'p1', term: 3 }],
      subjects: [{ id: 'x1', code: 'A', name: 'Accounting', programId: 'p1', term: 3 }, { id: 'x2', code: 'B', name: 'Law', programId: 'p1', term: 4 }, { id: 'x3', code: 'C', name: 'Maths', programId: 'p2', term: 3 }],
    });
    expect(o).toEqual([{ value: 's1|x1', label: 'BCom 3 A · Accounting' }]);
  });
  it('courses are for heads of department and leaders', () => {
    expect(canSee(['hod'], 'courses')).toBe(true);
    expect(canSee(['accountant'], 'courses')).toBe(false);
  });
});
