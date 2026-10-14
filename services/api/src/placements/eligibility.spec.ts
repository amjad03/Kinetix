import { describe, expect, it } from 'vitest';
import { canMoveDrive, canMoveInternship, checkEligibility, countBacklogs, ctcSummary, graduationYear, median, planSlots, standingReasons } from './eligibility.js';

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

describe('registration window, batches and the placement rules', () => {
  it('waits for the window to open and checks the batch', () => {
    expect(checkEligibility({ ...drive, registrationOpensOn: '2026-10-25' }, ok, '2026-10-20').reasons).toEqual(['not_yet_open']);
    expect(checkEligibility({ ...drive, batchYears: [2027] }, { ...ok, batchYear: 2027 }, '2026-10-20').eligible).toBe(true);
    expect(checkEligibility({ ...drive, batchYears: [2027] }, { ...ok, batchYear: 2028 }, '2026-10-20').reasons).toEqual(['batch_not_eligible']);
  });
  const free = { optedIn: null, debarredUntil: null, placedCategory: null };
  const dream = { policy: 'dream' as const, requireOptIn: false };
  it('applies opt-in, debarment and the offer policy to placement drives only', () => {
    expect(standingReasons('placement', 'regular', free, dream, '2026-10-20')).toEqual([]);
    expect(standingReasons('placement', 'regular', free, { ...dream, requireOptIn: true }, '2026-10-20')).toEqual(['not_opted_in']);
    expect(standingReasons('placement', 'regular', { ...free, optedIn: false }, dream, '2026-10-20')).toEqual(['opted_out']);
    expect(standingReasons('placement', 'regular', { ...free, debarredUntil: '2026-10-20' }, dream, '2026-10-20')).toEqual(['debarred']);
    expect(standingReasons('placement', 'regular', { ...free, debarredUntil: '2026-10-19' }, dream, '2026-10-20')).toEqual([]);
    expect(standingReasons('internship', 'regular', { ...free, optedIn: false, placedCategory: 'regular' }, dream, '2026-10-20')).toEqual([]);
  });
  it('lets a placed student sit only for a higher category under the dream policy', () => {
    const placed = { ...free, placedCategory: 'regular' };
    expect(standingReasons('placement', 'regular', placed, dream, '2026-10-20')).toEqual(['already_placed']);
    expect(standingReasons('placement', 'dream', placed, dream, '2026-10-20')).toEqual([]);
    expect(standingReasons('placement', 'dream', { ...free, placedCategory: 'dream' }, dream, '2026-10-20')).toEqual(['already_placed']);
    expect(standingReasons('placement', 'super_dream', placed, { ...dream, policy: 'one_offer' }, '2026-10-20')).toEqual(['already_placed']);
    expect(standingReasons('placement', 'regular', placed, { ...dream, policy: 'open' }, '2026-10-20')).toEqual([]);
  });
  it('works out the graduating year from the class', () => {
    expect(graduationYear('2027-05-31', 6, 5, 'ug')).toBe(2027);
    expect(graduationYear('2027-05-31', 6, 3, 'ug')).toBe(2028);
    expect(graduationYear('2027-05-31', 6, 1, 'ug')).toBe(2029);
    expect(graduationYear('2027-03-31', 12, 10, 'k12')).toBe(2029);
  });
  it('lays interview slots across venues in turn', () => {
    const plan = planSlots(['a', 'b', 'c'], new Date('2026-10-20T04:30:00Z'), 20, 10, ['Room 1', 'Room 2']);
    expect(plan.map((s) => [s.registrationId, s.venue, s.startsAt.toISOString().slice(11, 16), s.endsAt.toISOString().slice(11, 16)])).toEqual([
      ['a', 'Room 1', '04:30', '04:50'],
      ['b', 'Room 2', '04:30', '04:50'],
      ['c', 'Room 1', '05:00', '05:20'],
    ]);
  });
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
