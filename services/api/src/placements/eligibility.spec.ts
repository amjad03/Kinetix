import { describe, expect, it } from 'vitest';
import { canMoveDrive, canMoveInternship, checkEligibility, countBacklogs, ctcSummary, median } from './eligibility.js';

const drive = { status: 'open', minCgpa: 6.5, maxBacklogs: 1, programIds: ['p1'], registrationClosesOn: '2026-11-01' };
const ok = { cgpa: 7.2, backlogs: 0, programId: 'p1' };

describe('drive eligibility', () => {
  it('passes a student who meets every rule', () => expect(checkEligibility(drive, ok, '2026-10-20')).toEqual({ eligible: true, reasons: [] }));
  it('lists every reason that fails', () => {
    const r = checkEligibility({ ...drive, status: 'closed' }, { cgpa: 5.9, backlogs: 3, programId: 'p2' }, '2026-11-02');
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(['not_open', 'deadline_passed', 'program_not_eligible', 'cgpa_below', 'backlogs_exceeded']);
  });
  it('treats a CGPA exactly at the minimum as eligible and a missing result as ineligible', () => {
    expect(checkEligibility(drive, { ...ok, cgpa: 6.5 }, '2026-10-20').eligible).toBe(true);
    expect(checkEligibility(drive, { ...ok, cgpa: null }, '2026-10-20').reasons).toEqual(['no_results']);
    expect(checkEligibility({ ...drive, minCgpa: 0 }, { ...ok, cgpa: null }, '2026-10-20').eligible).toBe(true);
  });
  it('allows the backlog limit and any programme when none is listed', () => {
    expect(checkEligibility(drive, { ...ok, backlogs: 1 }, '2026-10-20').eligible).toBe(true);
    expect(checkEligibility({ ...drive, programIds: [] }, { ...ok, programId: 'zz' }, '2026-10-20').eligible).toBe(true);
  });
  it('allows registering on the closing day', () => expect(checkEligibility(drive, ok, '2026-11-01').eligible).toBe(true));
});

describe('backlogs and statistics', () => {
  it('counts a subject once, by its latest result', () => {
    const lines = [{ subjectId: 'a', passed: false }, { subjectId: 'b', passed: false }, { subjectId: 'a', passed: true }];
    expect(countBacklogs(lines)).toBe(1);
  });
  it('computes median and CTC summary', () => {
    expect(median([])).toBeNull();
    expect(median([3, 9, 5])).toBe(5);
    expect(median([4, 6, 8, 10])).toBe(7);
    expect(ctcSummary([4.5, 6, 12])).toEqual({ average: 7.5, median: 6, highest: 12, lowest: 4.5 });
    expect(ctcSummary([]).average).toBeNull();
  });
  it('guards status moves', () => {
    expect(canMoveDrive('draft', 'open')).toBe(true);
    expect(canMoveDrive('completed', 'open')).toBe(false);
    expect(canMoveInternship('proposed', 'ongoing')).toBe(false);
    expect(canMoveInternship('ongoing', 'completed')).toBe(true);
  });
});
