import { describe, expect, it } from 'vitest';
import { allocationOrder, customScore, refusal, slotsClash, totalCredits, type OfferingFacts, type StudentFacts } from './registration-rules.js';

const off = (id: string, over: Partial<OfferingFacts> = {}): OfferingFacts => ({ id, subjectId: `s-${id}`, category: 'elective', credits: 3, seatCap: 2, status: 'open', eligibleProgramIds: null, eligibleSemesters: null, prerequisiteSubjectId: null, slots: [], ...over });
const stu: StudentFacts = { programId: 'p1', semester: 3, passedSubjectIds: new Set(['math']) };

describe('registration rules', () => {
  it('finds overlapping slots on the same day only', () => {
    const mon = [{ day: 1, starts: '09:00', ends: '10:00' }];
    expect(slotsClash(mon, [{ day: 1, starts: '09:30:00', ends: '10:30:00' }])).toBe(true);
    expect(slotsClash(mon, [{ day: 1, starts: '10:00', ends: '11:00' }])).toBe(false);
    expect(slotsClash(mon, [{ day: 2, starts: '09:00', ends: '10:00' }])).toBe(false);
  });

  it('refuses in a fixed order and allows a clean fit', () => {
    expect(refusal(off('a', { status: 'closed' }), stu, [], 0, 20)).toBe('closed');
    expect(refusal(off('a', { eligibleSemesters: [5] }), stu, [], 0, 20)).toBe('not_eligible');
    expect(refusal(off('a', { eligibleProgramIds: ['p2'] }), stu, [], 0, 20)).toBe('not_eligible');
    expect(refusal(off('a', { prerequisiteSubjectId: 'physics' }), stu, [], 0, 20)).toBe('prerequisite');
    expect(refusal(off('a', { prerequisiteSubjectId: 'math' }), stu, [], 0, 20)).toBeNull();
    const slot = [{ day: 1, starts: '09:00', ends: '10:00' }];
    expect(refusal(off('a', { slots: slot }), stu, [off('b', { slots: slot })], 0, 20)).toBe('clash');
    expect(refusal(off('a'), stu, [off('b', { credits: 4 })], 0, 6)).toBe('credit_limit');
    expect(refusal(off('a'), stu, [], 2, 20)).toBe('seats_full');
    expect(refusal(off('a'), stu, [], 2, 20, { ignoreSeats: true })).toBeNull();
  });

  it('adds credits without float drift', () => {
    expect(totalCredits([{ credits: 1.1 }, { credits: 2.2 }])).toBe(3.3);
  });

  it('orders by CGPA then request time, or by time alone', () => {
    const xs = [
      { studentId: 'a', cgpa: 7, at: 1 },
      { studentId: 'b', cgpa: 9, at: 3 },
      { studentId: 'c', cgpa: 9, at: 2 },
    ];
    expect(allocationOrder('cgpa', xs).map((x) => x.studentId)).toEqual(['c', 'b', 'a']);
    expect(allocationOrder('time', xs).map((x) => x.studentId)).toEqual(['a', 'c', 'b']);
  });

  it('orders by the institution\'s own weights under the custom rule, then by request time', () => {
    const w = { cgpa: 10, attendance: 90 };
    const xs = [
      { studentId: 'topper', cgpa: 9, attendance: 70, at: 1, weights: w },
      { studentId: 'regular', cgpa: 6, attendance: 90, at: 2, weights: w },
      { studentId: 'regular2', cgpa: 6, attendance: 90, at: 1, weights: w },
    ];
    expect(allocationOrder('custom', xs).map((x) => x.studentId)).toEqual(['regular2', 'regular', 'topper']);
    expect(allocationOrder('cgpa', xs).map((x) => x.studentId)).toEqual(['topper', 'regular2', 'regular']);
    expect(customScore({ cgpa: 10, attendance: 100, semester: 12, weights: { cgpa: 1, attendance: 1, priority: 1 } })).toBe(3);
  });

  it('does not count an audit course toward the credit limit', () => {
    const base = { subjectId: 's', seatCap: 9, status: 'open', eligibleProgramIds: null, eligibleSemesters: null, prerequisiteSubjectId: null, slots: [] };
    const student = { programId: 'p', semester: 3, passedSubjectIds: new Set<string>() };
    const held = [{ ...base, id: 'a', category: 'core', credits: 9 }];
    expect(refusal({ ...base, id: 'b', category: 'elective', credits: 3 }, student, held, 0, 10)).toBe('credit_limit');
    expect(refusal({ ...base, id: 'b', category: 'audit', credits: 3 }, student, held, 0, 10)).toBeNull();
    expect(totalCredits([{ credits: 9, category: 'core' }, { credits: 3, category: 'audit' }])).toBe(9);
  });
});
