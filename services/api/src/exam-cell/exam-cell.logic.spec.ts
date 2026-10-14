import { describe, expect, it } from 'vitest';
import { countingEntries, subjectResult } from '../exams/grading.js';
import { attendanceMarks, bookProblem, buildRoster, csv, diffResults, entryStatus, goldMedallists, lateFeeFor, pickAttempt, rankList, registrationState, remuneration, revaluationOutcome, slabProblem } from './exam-cell.logic.js';

describe('exam cell rules', () => {
  it('charges the late fee slab the lateness reaches, the super-fine last', () => {
    const slabs = [
      { afterDays: 1, amountPaise: 20_000, label: 'Late fee' },
      { afterDays: 8, amountPaise: 100_000, label: 'Super-fine' },
    ];
    expect(lateFeeFor(slabs, 0)).toEqual({ amountPaise: 0, slab: null });
    expect(lateFeeFor(slabs, 3)).toEqual({ amountPaise: 20_000, slab: 'Late fee' });
    expect(lateFeeFor(slabs, 8)).toEqual({ amountPaise: 100_000, slab: 'Super-fine' });
    expect(lateFeeFor([], 5, 15_000)).toEqual({ amountPaise: 15_000, slab: null });
    expect(registrationState({ opensOn: '2026-10-01', closesOn: '2026-10-10', lateUntil: '2026-10-20' }, '2026-10-15')).toBe('late');
    expect(registrationState({ opensOn: '2026-10-01', closesOn: '2026-10-10', lateUntil: null }, '2026-10-15')).toBe('closed');
    expect(registrationState({ opensOn: '2026-10-01', closesOn: '2026-10-10', lateUntil: null }, '2026-09-30')).toBe('upcoming');
  });

  it('gives attendance marks from the slab table', () => {
    const slabs = [
      { minPercent: 95, percentOfMax: 100 },
      { minPercent: 85, percentOfMax: 60 },
      { minPercent: 75, percentOfMax: 20 },
    ];
    expect(attendanceMarks(slabs, 96, 5)).toBe(5);
    expect(attendanceMarks(slabs, 85, 5)).toBe(3);
    expect(attendanceMarks(slabs, 80, 5)).toBe(1);
    expect(attendanceMarks(slabs, 70, 5)).toBe(0);
    expect(slabProblem([{ minPercent: 90, percentOfMax: 50 }, { minPercent: 80, percentOfMax: 60 }])).toMatch(/fewer marks/);
    expect(slabProblem(slabs)).toBeNull();
  });

  it('counts only the best N assessments of a best-of-N component', () => {
    const entries = [
      { scored: 10, max: 20, absent: false },
      { scored: 18, max: 20, absent: false },
      { scored: 0, max: 20, absent: true },
    ];
    expect(countingEntries(entries, 2).map((e) => e.scored)).toEqual([18, 10]);
    expect(countingEntries(entries, null)).toHaveLength(3);
    const scale = { bands: [{ grade: 'P', minPercent: 40, gradePoint: 5, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }], pointsMode: 'band' as const, decimals: 2 };
    const r = subjectResult([{ id: 'ia', code: 'IA', name: 'Tests', kind: 'internal', weight: 100, bestOf: 2 }], [{ componentId: 'ia', entries }], { minInternalPercent: null, minExternalPercent: null, minTotalPercent: 40 }, scale);
    expect(r.percent).toBe(70); // (18 + 10) of 40
  });

  it('settles double entry: same marks or both absent match', () => {
    expect(entryStatus({ marks: 45, absent: false }, { marks: 45, absent: false })).toBe('matched');
    expect(entryStatus({ marks: 45, absent: false }, { marks: 54, absent: false })).toBe('mismatch');
    expect(entryStatus({ marks: null, absent: true }, { marks: null, absent: true })).toBe('matched');
    expect(entryStatus({ marks: 0, absent: false }, { marks: null, absent: true })).toBe('mismatch');
    expect(entryStatus({ marks: 45, absent: false }, null)).toBe('pending');
  });

  it('keeps the original marks unless a revaluation changes them by the rule', () => {
    expect(revaluationOutcome(30, 34, 60, 10)).toEqual({ marks: 30, changed: false, difference: 4 }); // under 10% of 60
    expect(revaluationOutcome(30, 37, 60, 10)).toEqual({ marks: 37, changed: true, difference: 7 });
    expect(revaluationOutcome(30, 28, 60, null)).toEqual({ marks: 28, changed: true, difference: -2 });
    expect(revaluationOutcome(30, 30, 60, null).changed).toBe(false);
  });

  it('keeps the better attempt under "best" and the later one under "latest"', () => {
    const pass = { passed: true, gradePoint: 8, percent: 75 };
    const worse = { passed: true, gradePoint: 6, percent: 58 };
    const fail = { passed: false, gradePoint: 0, percent: 30 };
    expect(pickAttempt(pass, worse, 'best')).toBe(pass);
    expect(pickAttempt(pass, worse, 'latest')).toBe(worse);
    expect(pickAttempt(fail, worse, 'best')).toBe(worse);
    expect(pickAttempt(undefined, fail, 'best')).toBe(fail);
  });

  it('lists what a processing would change', () => {
    const before = [{ studentId: 'a', sgpa: 7, outcome: 'pass', lines: [{ subjectId: 's', grade: 'B', percent: 60, passed: true }] }];
    const after = [
      { studentId: 'a', sgpa: 7.5, outcome: 'pass', lines: [{ subjectId: 's', grade: 'A', percent: 70, passed: true }] },
      { studentId: 'b', sgpa: 5, outcome: 'fail', lines: [] },
    ];
    expect(diffResults(before, after)).toEqual([
      { studentId: 'a', kind: 'changed', before: { sgpa: 7, outcome: 'pass' }, after: { sgpa: 7.5, outcome: 'pass' }, subjects: [{ subjectId: 's', before: 'B', after: 'A' }] },
      { studentId: 'b', kind: 'new', before: null, after: { sgpa: 5, outcome: 'fail' }, subjects: [] },
    ]);
    expect(diffResults(after, after)).toEqual([]);
  });

  it('ranks with shared ties and leaves repeaters unranked when the rule says so', () => {
    const rows = [
      { studentId: 'a', score: 9, passed: true, repeater: false, rollNo: 'R1' },
      { studentId: 'b', score: 9.5, passed: true, repeater: true, rollNo: 'R2' },
      { studentId: 'c', score: 9, passed: true, repeater: false, rollNo: 'R3' },
      { studentId: 'd', score: 8, passed: false, repeater: false, rollNo: 'R4' },
    ];
    expect(rankList(rows, { excludeRepeaters: true }).map((r) => [r.studentId, r.rank])).toEqual([['b', null], ['a', 1], ['c', 1], ['d', null]]);
    expect(rankList(rows, { excludeRepeaters: false }).map((r) => r.rank)).toEqual([1, 2, 2, null]);
  });

  it('gives gold medals to the top CGPA of first-attempt finishers, jointly on a tie', () => {
    const rows = [
      { studentId: 'a', cgpa: 9.2, firstAttempt: true, completed: true },
      { studentId: 'b', cgpa: 9.6, firstAttempt: false, completed: true },
      { studentId: 'c', cgpa: 9.2, firstAttempt: true, completed: true },
      { studentId: 'd', cgpa: 9.9, firstAttempt: true, completed: false },
    ];
    expect(goldMedallists(rows, { minCgpa: 6, firstAttemptOnly: true }).map((r) => r.studentId)).toEqual(['a', 'c']);
    expect(goldMedallists(rows, { minCgpa: 6, firstAttemptOnly: false }).map((r) => r.studentId)).toEqual(['b']);
    expect(goldMedallists(rows, { minCgpa: 9.5, firstAttemptOnly: true })).toEqual([]);
  });

  it('pays duties and valued scripts at the set rates', () => {
    expect(remuneration({ invigilatorPaise: 30_000, chiefPaise: 50_000, valuationPerScriptPaise: 2_500, chiefExaminerPerDayPaise: 100_000 }, { invigilations: 3, chiefDuties: 1, scripts: 120, chiefDays: 2 })).toEqual({ dutiesPaise: 140_000, valuationPaise: 500_000, totalPaise: 640_000 });
  });

  it('builds a roster: a senior chief per sitting, invigilators by load, a hall left short when staff run out', () => {
    const staff = [
      { id: 'senior', seniorityDays: 9000, load: 0 },
      { id: 'mid', seniorityDays: 3000, load: 0 },
      { id: 'junior', seniorityDays: 100, load: 0 },
    ];
    const slots = [
      { key: 'd1', date: '2026-11-05', startsAt: '10:00', endsAt: '13:00', rooms: [{ roomId: 'r1', candidates: 40 }] },
      { key: 'd2', date: '2026-11-06', startsAt: '10:00', endsAt: '13:00', rooms: [{ roomId: 'r1', candidates: 20 }] },
    ];
    const plan = buildRoster(slots, staff, 30, () => false);
    expect(plan.duties.filter((d) => d.role === 'chief').map((d) => d.staffId)).toEqual(['senior', 'senior']);
    expect(plan.duties.filter((d) => d.slotKey === 'd1' && d.role === 'invigilator').map((d) => d.staffId).sort()).toEqual(['junior', 'mid']);
    expect(plan.short).toEqual([]);
    const tight = buildRoster([{ ...slots[0], rooms: [{ roomId: 'r1', candidates: 100 }] }], staff, 30, (id) => id === 'junior');
    expect(tight.short).toEqual([{ slotKey: 'd1', roomId: 'r1', missing: 3 }]);
  });

  it("balances a hall's answer books", () => {
    const ok = { received: 50, issued: 38, additional: 6, spoiled: 1, returned: 43, present: 38, absent: 2 };
    expect(bookProblem(ok, 40)).toBeNull();
    expect(bookProblem({ ...ok, returned: 40 }, 40)).toMatch(/must equal the books issued/);
    expect(bookProblem({ ...ok, received: 40 }, 40)).toMatch(/More books issued/);
    expect(bookProblem(ok, 41)).toMatch(/must add up to the 41/);
  });

  it('writes CSV with quoting', () => {
    expect(csv([['a', 'b,c'], ['say "hi"', null]])).toBe('a,"b,c"\n"say ""hi""",\n');
  });
});
