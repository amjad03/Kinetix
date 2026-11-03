import { describe, expect, it } from 'vitest';
import { buildRankList } from '../depth/rank-list.js';
import { computeIndexMark, formulaProblems, INDEX_PRESETS } from '../depth/index-mark.js';
import { checklistFor, checklistState } from './checklist.js';
import { presetByKey, profileFailures, qualifyingKey } from './eligibility-profile.js';
import { allotRound, buildSeatPlan, categoryKey, dereserve, KARNATAKA_DERESERVE, MERIT, PLAN_PRESETS, planProblems, splitByShares, type Contender, type PlanRow } from './reservation.js';
import { nextRegisterNo, registerPrefix, templateProblems } from './register-number.js';

describe('seat plan', () => {
  it('splits by largest remainder so the parts add up', () => {
    // 60 × 45/30/25 = 27, 18, 15 exactly.
    expect([...splitByShares(60, [{ key: 'merit', percent: 45 }, { key: 'comedk', percent: 30 }, { key: 'management', percent: 25 }]).values()]).toEqual([27, 18, 15]);
    // 7 × 45/30/25 = 3.15, 2.1, 1.75 → floors 3, 2, 1 (6), the largest remainder (management .75) takes the 7th.
    expect(Object.fromEntries(splitByShares(7, [{ key: 'merit', percent: 45 }, { key: 'comedk', percent: 30 }, { key: 'management', percent: 25 }]))).toEqual({ merit: 3, comedk: 2, management: 2 });
  });

  it('builds the Karnataka engineering matrix for a 60-seat branch', () => {
    const preset = PLAN_PRESETS.find((p) => p.key === 'karnataka-engineering-private')!;
    const rows = buildSeatPlan({ ...preset.plan, options: [{ label: 'CSE', intake: 60 }] });
    const intake = rows.filter((r) => !r.supernumerary);
    expect(intake.reduce((n, r) => n + r.seats, 0)).toBe(60);
    // Government 27 seats: SC 17% = 4.59, ST 7% = 1.89, Cat-1 4% = 1.08, 2A 15% = 4.05, 2B 1.08, 3A 1.08, 3B 5% = 1.35, GM 44% = 11.88.
    // Floors 4+1+1+4+1+1+1+11 = 24; three more by remainder: ST (.89), GM (.88), SC (.59).
    const gov = Object.fromEntries(intake.filter((r) => r.seatType === 'merit').map((r) => [r.category, r.seats]));
    expect(gov).toEqual({ sc: 5, st: 2, 'cat-1': 1, '2a': 4, '2b': 1, '3a': 1, '3b': 1, merit: 12 });
    expect(intake.find((r) => r.seatType === 'comedk')!.seats).toBe(18);
    expect(intake.find((r) => r.seatType === 'management')!.seats).toBe(15);
    // GM government row (12): PwD 5% → 0, rural 15% → 1, Kannada medium 5% → 0.
    expect(intake.find((r) => r.seatType === 'merit' && r.category === MERIT)!.horizontal).toEqual({ rural: 1 });
    // Supernumerary on top: TFW 5% of 60 = 3, foreign 15% = 9.
    expect(rows.filter((r) => r.supernumerary).map((r) => [r.category, r.seats])).toEqual([['tfw', 3], ['foreign', 9]]);
  });

  it('refuses shares that do not add up', () => {
    expect(planProblems({ options: [{ label: 'A', intake: 10 }], seatTypes: [{ seatType: 'merit', percent: 60 }], reservation: { appliesTo: [], categories: [] }, horizontal: { appliesTo: [], kinds: [] }, supernumerary: [] })).toContain('Seat types add up to 60%, not 100%');
  });

  it('reads category names the way families write them', () => {
    expect(['GM', 'General', 'Cat-1', 'Category-1', '2A', 'IIIB', 'sc'].map(categoryKey)).toEqual([MERIT, MERIT, 'cat-1', 'cat-1', '2a', '3b', 'sc']);
  });
});

const row = (option: string, seatType: string, category: string, seats: number, horizontal: Record<string, number> = {}, supernumerary = false): PlanRow => ({ option, seatType, category, seats, horizontal, supernumerary });
const cand = (id: string, rank: number, o: Partial<Contender> = {}): Contender => ({ id, rank, seatType: 'merit', category: MERIT, horizontal: [], supernumerary: [], prefs: ['CSE'], ...o });

describe('allotment with reservation', () => {
  it('a reserved candidate on general merit takes a GM seat, leaving the reserved seat for the next', () => {
    const m = [row('CSE', 'merit', MERIT, 2), row('CSE', 'merit', 'sc', 1)];
    const { allotments, remaining } = allotRound(m, [cand('a', 1, { category: 'sc' }), cand('b', 2), cand('c', 3, { category: 'sc' }), cand('d', 4)], new Map());
    expect(allotments.map((a) => [a.id, a.seatCategory])).toEqual([['a', MERIT], ['b', MERIT], ['c', 'sc']]);
    expect(remaining.every((r) => r.seats === 0)).toBe(true);
  });

  it('keeps candidates to their own seat type and opens supernumerary rows only to claimants', () => {
    const m = [row('CSE', 'merit', MERIT, 1), row('CSE', 'management', MERIT, 1), row('CSE', 'merit', 'tfw', 1, {}, true)];
    const { allotments } = allotRound(m, [cand('a', 1), cand('b', 2), cand('c', 3, { supernumerary: ['tfw'] }), cand('m', 4, { seatType: 'management' })], new Map());
    expect(allotments.map((a) => [a.id, a.seatType, a.seatCategory])).toEqual([['a', 'merit', MERIT], ['c', 'merit', 'tfw'], ['m', 'management', MERIT]]);
  });

  it('makes good a horizontal seat: the lowest newcomer without the claim gives way and tries elsewhere', () => {
    // GM row of 3 with 1 rural seat; ranks 1-3 are not rural, rank 5 is rural. Rank 3 is displaced and takes ECE.
    const m = [row('CSE', 'merit', MERIT, 3, { rural: 1 }), row('ECE', 'merit', MERIT, 2)];
    const cs = [cand('r1', 1), cand('r2', 2), cand('r3', 3, { prefs: ['CSE', 'ECE'] }), cand('r4', 4, { prefs: ['ECE'] }), cand('r5', 5, { horizontal: ['rural'] })];
    const { allotments } = allotRound(m, cs, new Map());
    const at = Object.fromEntries(allotments.map((a) => [a.id, `${a.option}${a.horizontal ? `:${a.horizontal}` : ''}`]));
    expect(at).toEqual({ r1: 'CSE', r2: 'CSE', r3: 'ECE', r4: 'ECE', r5: 'CSE:rural' });
  });

  it('upgrades a floating candidate and frees the seat they held', () => {
    const m = [row('CSE', 'merit', MERIT, 1), row('ECE', 'merit', MERIT, 1)];
    const held = new Map([['a', { option: 'ECE', seatType: 'merit', seatCategory: MERIT, response: 'float' as const }]]);
    const { allotments, remaining } = allotRound(m, [cand('a', 1, { prefs: ['CSE', 'ECE'] }), cand('b', 2, { prefs: ['ECE'] })], held);
    expect(allotments.map((x) => [x.id, x.option, x.kind])).toEqual([['a', 'CSE', 'upgraded'], ['b', 'ECE', 'new']]);
    expect(remaining.map((r) => r.seats)).toEqual([0, 0]);
  });

  it('de-reserves after the last round: SC to ST where an ST candidate waits, the rest to GM', () => {
    const left = [row('CSE', 'merit', 'sc', 2), row('CSE', 'merit', 'st', 0), row('CSE', 'merit', '2a', 1), row('CSE', 'merit', MERIT, 0), row('CSE', 'merit', 'tfw', 1, {}, true)];
    const { rows, moves } = dereserve(left, new Set(['CSE|merit|st']), KARNATAKA_DERESERVE);
    expect(moves.map((m) => [m.from, m.to, m.seats])).toEqual([['sc', 'st', 2], ['2a', MERIT, 1]]);
    expect(rows.find((r) => r.category === 'st')!.seats).toBe(2);
    expect(rows.find((r) => r.category === MERIT)!.seats).toBe(1);
    expect(rows.find((r) => r.category === 'tfw')!.seats).toBe(1);
  });
});

describe('entrance-test merit', () => {
  it('ranks by the COMEDK rank, lowest first', () => {
    const f = INDEX_PRESETS.comedk_rank.formula;
    expect(computeIndexMark(f, { comedk_rank: 1520 }).indexMark).toBe(1520);
    expect(computeIndexMark(f, {}).missing).toEqual(['comedk_rank']);
    expect(formulaProblems(f, { comedk_rank: 0 })).toEqual(['COMEDK UGET rank must be a whole number from 1 to 200000']);
    const ranked = buildRankList([
      { id: 'x', applicationNo: '1', indexMark: 9000, category: null, dateOfBirth: '2008-01-01', tie: [] },
      { id: 'y', applicationNo: '2', indexMark: 1520, category: null, dateOfBirth: '2008-01-01', tie: [] },
    ], true);
    expect(ranked.map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('computes the KCET engineering index: 50% CET + 50% PUC PCM', () => {
    // CET 135/180 → 37.5; PUC 255/300 → 42.5; index 80.
    expect(computeIndexMark(INDEX_PRESETS.kcet_engineering.formula, { cet_pcm: 135, puc_pcm: 255 }).indexMark).toBe(80);
  });
});

describe('eligibility from the university profile', () => {
  const vtu = presetByKey('vtu-be')!;
  const base = { qualifying_exam: 'PUC / Class 12', subjects_percent: 44, subjects_studied: 'Physics, Mathematics, Chemistry, English', entrance_exam: 'KCET' };
  it('relaxes the VTU minimum to 40% for SC, ST and Category-1 only', () => {
    expect(profileFailures(vtu, { answers: base, category: 'GM', dateOfBirth: '2008-01-01', admissionType: 'regular' }, '2026-08-01')).toEqual(['44% is below the 45% needed']);
    expect(profileFailures(vtu, { answers: base, category: 'Cat-1', dateOfBirth: '2008-01-01', admissionType: 'regular' }, '2026-08-01')).toEqual([]);
    expect(profileFailures(vtu, { answers: base, category: '2A', dateOfBirth: '2008-01-01', admissionType: 'regular' }, '2026-08-01')).toEqual(['44% is below the 45% needed']);
  });
  it('needs Physics and Mathematics and one optional subject', () => {
    expect(profileFailures(vtu, { answers: { ...base, subjects_percent: 70, subjects_studied: 'Physics, Biology, English' }, category: 'GM', dateOfBirth: null, admissionType: 'regular' }, '2026-08-01')).toEqual(['Did not study mathematics']);
  });
  it('checks the NEET percentile and the minimum age for MBBS', () => {
    const p = presetByKey('rguhs-mbbs')!;
    const a = { qualifying_exam: 'PUC', subjects_percent: 62, subjects_studied: 'physics, chemistry, biology, english', entrance_exam: 'NEET (UG)', entrance_percentile: 45 };
    expect(profileFailures(p, { answers: a, category: 'GM', dateOfBirth: '2010-02-01', admissionType: 'regular' }, '2026-12-31')).toEqual(['Entrance percentile 45 is below the 50th percentile needed', 'Must be at least 17 on 2026-12-31']);
    expect(profileFailures(p, { answers: a, category: 'SC', dateOfBirth: '2009-02-01', admissionType: 'regular' }, '2026-12-31')).toEqual([]);
  });
  it('reads the qualifying examination as typed', () => {
    expect(['Class 12', 'Diploma in CS', 'B.Com', 'PUC'].map(qualifyingKey)).toEqual(['puc', 'diploma', 'degree', 'puc']);
  });
});

describe('register numbers', () => {
  const t = '{region}{college}{yy}{branch}{seq:3}';
  const p = { region: '1', college: 'SB', year: 2026, branch: 'CS' };
  it('builds the VTU USN: regular from 001, lateral from 400', () => {
    expect(registerPrefix(t, p)).toBe('1SB26CS');
    expect(nextRegisterNo(t, p, [], false)).toBe('1SB26CS001');
    expect(nextRegisterNo(t, p, ['1SB26CS001', '1SB26CS002', '1SB26CS400', '1SB25CS009'], false)).toBe('1SB26CS003');
    expect(nextRegisterNo(t, p, ['1SB26CS001', '1SB26CS400'], true)).toBe('1SB26CS401');
    expect(nextRegisterNo(t, p, ['1SB26CS001'], true)).toBe('1SB26CS400');
  });
  it('checks templates', () => {
    expect(templateProblems('{college}{seq:3}{yy}')).toEqual(['{seq} must come last']);
    expect(templateProblems('{college}{batch}{seq:3}')).toContain('Unknown part in the template: use {region}, {college}, {yy}, {yyyy}, {branch} and {seq:3}');
    expect(templateProblems(t)).toEqual([]);
  });
});

describe('admission checklist', () => {
  it('asks a CBSE lateral SC candidate for migration, eligibility, caste and diploma marks', () => {
    const items = checklistFor({ admissionType: 'lateral', nationality: 'indian', seatType: 'merit', category: 'SC', claims: { horizontal: ['pwd'] }, board: 'CBSE', homeBoards: ['Karnataka'], externalAllotment: true });
    expect(items.map((i) => i.key)).toEqual(['marks_cards', 'tc', 'migration', 'eligibility', 'caste', 'study_certificate', 'allotment_order', 'disability', 'diploma_marks', 'anti_ragging', 'medical_fitness', 'photos']);
  });
  it('a Karnataka PU candidate needs no migration or eligibility certificate', () => {
    expect(checklistFor({ admissionType: 'regular', nationality: 'indian', seatType: 'management', category: 'GM', claims: {}, board: 'Karnataka PUC Board', homeBoards: ['Karnataka'], externalAllotment: false }).map((i) => i.key)).toEqual(['marks_cards', 'tc', 'anti_ragging', 'medical_fitness', 'photos']);
  });
  it('is provisional while items are deferred to a date, and confirmed when all are in', () => {
    const rows = [{ itemKey: 'tc', required: true, status: 'deferred' as const, dueOn: '2026-11-30' }, { itemKey: 'marks_cards', required: true, status: 'received' as const, dueOn: null }, { itemKey: 'photos', required: false, status: 'pending' as const, dueOn: null }];
    expect(checklistState(rows, '2026-11-03')).toEqual({ complete: false, open: ['tc'], overdue: [], provisionalOk: true });
    expect(checklistState(rows, '2026-12-01').overdue).toEqual(['tc']);
    expect(checklistState([{ ...rows[0], status: 'received' }, rows[1], rows[2]], '2026-11-03').complete).toBe(true);
  });
});
