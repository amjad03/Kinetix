import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compositionIssues,
  deadlineState,
  dpdpDueAt,
  minutesApproved,
  minutesHash,
  nextOccurrence,
  quorumNeeded,
  reminderDue,
  rtiAppealDueOn,
  rtiAppealWindowEnds,
  rtiDueOn,
  rtiLate,
  ruleOf,
  standardDate,
  STANDARD_DEADLINES,
  type MemberFacts,
} from './statutory.js';

const m = (id: string, o: Partial<MemberFacts> = {}): MemberFacts => ({ id, name: id, role: 'member', category: 'internal', gender: 'female', tenureStart: '2025-06-01', tenureEnd: null, ...o });

describe('statutory committee composition', () => {
  const icc = ruleOf('icc')!;
  it('passes an ICC with a woman presiding officer, half women and an NGO member', () => {
    const ms = [m('po', { role: 'chair' }), m('f1'), m('m1', { gender: 'male' }), m('ngo', { category: 'ngo', gender: 'male' })];
    expect(compositionIssues(icc, ms, '2026-11-01')).toEqual([]);
  });
  it('finds a man presiding, women below half, no outside member and too few members', () => {
    const ms = [m('po', { role: 'chair', gender: 'male' }), m('m1', { gender: 'male' }), m('f1')];
    // 1 woman of 3 is 33%.
    expect(compositionIssues(icc, ms, '2026-11-01')).toEqual([
      { code: 'too_few_members', min: 4, actual: 3 },
      { code: 'chair_not_woman' },
      { code: 'women_below', min: 50, actual: 33 },
      { code: 'missing_category', categories: ['ngo', 'legal', 'external'] },
    ]);
  });
  it('counts only members in office on the day, and flags a tenure beyond the limit', () => {
    const ms = [m('po', { role: 'chair', tenureStart: '2022-06-01' }), m('f1'), m('f2'), m('ngo', { category: 'ngo' }), m('gone', { gender: 'male', tenureEnd: '2026-01-31' })];
    // The presiding officer has served 4.4 years of a 3-year term; the member who left is not counted.
    expect(compositionIssues(icc, ms, '2026-11-01')).toEqual([{ code: 'tenure_too_long', member: 'po', years: 4.4, max: 3 }]);
  });
  it('asks the SGRC for a student and a woman, and says when genders are not recorded', () => {
    const sg = ruleOf('grievance_redressal')!;
    const ms = ['a', 'b', 'c', 'd', 'e'].map((x, i) => m(x, { gender: i === 4 ? '' : 'male', role: i === 0 ? 'chair' : 'member' }));
    expect(compositionIssues(sg, ms, '2026-11-01').map((i) => i.code)).toEqual(['no_woman', 'missing_category', 'gender_unknown']);
  });
  it('needs a chair even for a committee with no rule', () => expect(compositionIssues(undefined, [m('a')], '2026-11-01')).toEqual([{ code: 'no_chair' }]));
});

describe('quorum and the approval of minutes', () => {
  it('rounds the quorum up', () => {
    expect(quorumNeeded(7, 50)).toBe(4);
    expect(quorumNeeded(6, 50)).toBe(3);
    expect(quorumNeeded(0, 50)).toBe(1);
  });
  const present = [
    { memberId: 'chair', role: 'chair', canSign: true },
    { memberId: 'a', role: 'member', canSign: true },
    { memberId: 'b', role: 'member', canSign: true },
    { memberId: 'ngo', role: 'external', canSign: false },
  ];
  it('approves once the chair and half of those who can sign have approved, with no objection', () => {
    // Three can sign, so two approvals are needed and one must be the chair's.
    expect(minutesApproved(present, [{ memberId: 'a', role: 'member', decision: 'approve' }, { memberId: 'b', role: 'member', decision: 'approve' }])).toMatchObject({ approved: false, approvals: 2, needed: 2, chairSigned: false });
    expect(minutesApproved(present, [{ memberId: 'chair', role: 'chair', decision: 'approve' }, { memberId: 'a', role: 'member', decision: 'approve' }])).toMatchObject({ approved: true, approvals: 2 });
    expect(minutesApproved(present, [{ memberId: 'chair', role: 'chair', decision: 'approve' }, { memberId: 'a', role: 'member', decision: 'approve' }, { memberId: 'b', role: 'member', decision: 'object' }])).toMatchObject({ approved: false, objections: 1 });
  });
  it('ignores signatures of people who were not present', () => {
    expect(minutesApproved(present, [{ memberId: 'chair', role: 'chair', decision: 'approve' }, { memberId: 'stranger', role: 'member', decision: 'approve' }])).toMatchObject({ approved: false, approvals: 1 });
  });
  it('fingerprints the text, the agenda in order and the attendance', () => {
    const base = { title: 'IQAC Q2', meetingOn: '2026-10-10', minutes: 'Met.', agenda: [{ seq: 2, title: 'B', resolution: 'ok', outcome: 'resolved' }, { seq: 1, title: 'A', resolution: '', outcome: 'noted' }], attendance: [{ memberId: 'b', status: 'present' }, { memberId: 'a', status: 'absent' }] };
    const h = minutesHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(minutesHash({ ...base, agenda: [...base.agenda].reverse(), attendance: [...base.attendance].reverse() })).toBe(h);
    expect(minutesHash({ ...base, minutes: 'Met. ' })).not.toBe(h);
    expect(minutesHash({ ...base, attendance: [{ memberId: 'b', status: 'present' }, { memberId: 'a', status: 'present' }] })).not.toBe(h);
  });
});

describe('RTI deadlines', () => {
  it('gives 30 days, 48 hours for life or liberty, and 5 more through an assistant PIO', () => {
    expect(rtiDueOn('2026-10-01', { lifeLiberty: false, viaApio: false })).toBe('2026-10-31');
    expect(rtiDueOn('2026-10-01', { lifeLiberty: true, viaApio: false })).toBe('2026-10-03');
    expect(rtiDueOn('2026-10-01', { lifeLiberty: false, viaApio: true })).toBe('2026-11-05');
  });
  it('opens the first appeal for 30 days and gives the appellate authority 30', () => {
    expect(rtiAppealWindowEnds('2026-10-20')).toBe('2026-11-19');
    expect(rtiAppealDueOn('2026-11-02')).toBe('2026-12-02');
    expect(rtiLate('2026-10-31', '2026-11-01')).toBe(true);
    expect(rtiLate('2026-10-31', '2026-10-31')).toBe(false);
  });
});

describe('DPDP answer-by dates', () => {
  it('gives 30 days for a right and 90 for a grievance', () => {
    const at = new Date('2026-11-01T06:00:00Z');
    expect(dpdpDueAt(at, 'correction').toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(dpdpDueAt(at, 'grievance').toISOString()).toBe('2027-01-30T06:00:00.000Z');
  });
});

describe('compliance calendar', () => {
  it('keeps month ends within the month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(nextOccurrence('2026-07-31', 'quarterly')).toBe('2026-10-31');
    expect(nextOccurrence('2026-12-31', 'annual')).toBe('2027-12-31');
    expect(nextOccurrence('2026-12-31', 'none')).toBeNull();
  });
  it('puts June to December in the start year and January to May in the next', () => {
    const aishe = STANDARD_DEADLINES.find((s) => s.authority === 'aishe')!;
    const aqar = STANDARD_DEADLINES.find((s) => s.authority === 'naac')!;
    expect(standardDate(aishe, 2026)).toBe('2027-01-31');
    expect(standardDate(aqar, 2026)).toBe('2026-12-31');
  });
  it('states deadlines from the day', () => {
    expect(deadlineState({ status: 'pending', dueOn: '2026-11-03' }, '2026-11-04')).toBe('overdue');
    expect(deadlineState({ status: 'pending', dueOn: '2026-12-04' }, '2026-11-04')).toBe('due_soon');
    expect(deadlineState({ status: 'pending', dueOn: '2026-12-05' }, '2026-11-04')).toBe('upcoming');
    expect(deadlineState({ status: 'done', dueOn: '2026-10-01' }, '2026-11-04')).toBe('done');
  });
  it('sends each reminder step once: 30, then 7, then 1 day before', () => {
    const d = { status: 'pending', dueOn: '2026-12-31', remindDays: [30, 7, 1], lastRemindedOn: null as string | null };
    expect(reminderDue(d, '2026-11-30')).toBeNull(); // 31 days left
    expect(reminderDue(d, '2026-12-01')).toBe(30);
    expect(reminderDue({ ...d, lastRemindedOn: '2026-12-01' }, '2026-12-10')).toBeNull(); // 21 left, the 30-day one was sent
    expect(reminderDue({ ...d, lastRemindedOn: '2026-12-01' }, '2026-12-24')).toBe(7);
    expect(reminderDue({ ...d, lastRemindedOn: '2026-12-24' }, '2026-12-30')).toBe(1);
    expect(reminderDue({ ...d, lastRemindedOn: '2026-12-30' }, '2026-12-31')).toBeNull();
    // Added late, 3 days before: the 7-day reminder goes at once.
    expect(reminderDue(d, '2026-12-28')).toBe(7);
  });
});
