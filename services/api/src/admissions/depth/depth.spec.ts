import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MERIT, runRound, seatMatrixFromShares, type Held } from './allotment.js';
import { commissionAmount, pickRule, tdsOn, type CommissionRule } from './commission.js';
import { computeIndexMark, formulaProblems, INDEX_PRESETS, overlayWeights } from './index-mark.js';
import { metaSignatureOk, readGoogleLead, readMetaLead } from './leads.service.js';
import { buildRankList } from './rank-list.js';

describe('index marks', () => {
  it('engineering: entrance 300 + maths 100 + physics/chemistry scaled to 50 each', () => {
    const r = computeIndexMark(INDEX_PRESETS.engineering.formula, { entrance: 210, maths: 90, physics: 80, chemistry: 60 });
    expect(r.indexMark).toBe(210 + 90 + 40 + 30);
    expect(r.missing).toEqual([]);
  });
  it('degree: best four of six subjects scaled to 400, bonus capped at 15', () => {
    const r = computeIndexMark(INDEX_PRESETS.degree.formula, { subject1: 90, subject2: 80, subject3: 70, subject4: 60, subject5: 40, subject6: 30, sports: 10, ncc: 10 });
    expect(r.indexMark).toBe(300 + 15);
    expect(computeIndexMark(INDEX_PRESETS.degree.formula, { subject1: 90 }).missing.length).toBe(1);
  });
  it('flags a missing component and rejects marks above the maximum', () => {
    const f = INDEX_PRESETS.engineering.formula;
    expect(computeIndexMark(f, { entrance: 100 }).missing).toEqual(['maths', 'physics', 'chemistry']);
    expect(formulaProblems(f, { entrance: 301 })[0]).toContain('between 0 and 300');
  });
  it('a registry rule retunes weights', () => {
    const f = overlayWeights(INDEX_PRESETS.engineering.formula, { weights: { entrance: 200 } });
    expect(computeIndexMark(f, { entrance: 300, maths: 0, physics: 0, chemistry: 0 }).indexMark).toBe(200);
  });
});

describe('rank list', () => {
  const c = (id: string, indexMark: number, category: string | null, tie: number[] = [], dob = '2008-01-01') => ({ id, applicationNo: id, indexMark, category, dateOfBirth: dob, tie });
  it('ranks overall and within category, breaking ties by tie-break marks then older age', () => {
    const list = buildRankList([c('a', 400, 'sc'), c('b', 400, null, [90]), c('c', 400, null, [80]), c('d', 400, 'sc', [80], '2007-01-01'), c('e', 380, 'sc')]);
    expect(list.map((x) => x.id)).toEqual(['b', 'd', 'c', 'a', 'e']);
    // a and d tie on index; d has the higher tie mark (80 vs none), so d first among the SC applicants
    expect(list.find((x) => x.id === 'd')!.categoryRank).toBe(1);
    expect(list.find((x) => x.id === 'a')!.categoryRank).toBe(2);
    expect(list.find((x) => x.id === 'e')!.categoryRank).toBe(3);
    expect(list.find((x) => x.id === 'b')!.categoryRank).toBeNull();
  });
});

describe('seat matrix and CAP allotment', () => {
  const matrix = seatMatrixFromShares([{ label: 'CSE', seats: 10 }, { label: 'ME', seats: 10 }], [{ category: 'sc', reservedSeats: 2 }], 20);
  it('splits each option by the reservation share, the rest is merit', () => {
    expect(matrix.filter((r) => r.option === 'CSE')).toEqual([{ option: 'CSE', category: 'sc', seats: 1 }, { option: 'CSE', category: MERIT, seats: 9 }]);
  });
  const small = [{ option: 'CSE', category: MERIT, seats: 1 }, { option: 'CSE', category: 'sc', seats: 1 }, { option: 'ME', category: MERIT, seats: 2 }];
  it('gives merit seats in rank order, then category seats, then the next preference', () => {
    const { allotments, remaining } = runRound(small, [
      { id: 'r1', rank: 1, category: 'sc', prefs: ['CSE', 'ME'] },
      { id: 'r2', rank: 2, category: 'sc', prefs: ['CSE', 'ME'] },
      { id: 'r3', rank: 3, category: null, prefs: ['CSE', 'ME'] },
    ], new Map());
    expect(allotments.map((a) => [a.id, a.option, a.seatCategory])).toEqual([['r1', 'CSE', MERIT], ['r2', 'CSE', 'sc'], ['r3', 'ME', MERIT]]);
    expect(remaining.find((r) => r.option === 'ME')!.seats).toBe(1);
  });
  it('a floating holder upgrades and frees the old seat; a frozen seat is untouched', () => {
    const held = new Map<string, Held>([['f', { option: 'ME', seatCategory: MERIT, response: 'float' }], ['z', { option: 'CSE', seatCategory: MERIT, response: 'freeze' }]]);
    const { allotments, remaining } = runRound(small, [
      { id: 'z', rank: 1, category: null, prefs: ['CSE'] },
      { id: 'f', rank: 2, category: 'sc', prefs: ['CSE', 'ME'] },
    ], held);
    expect(allotments).toEqual([{ id: 'f', rank: 2, option: 'CSE', seatCategory: 'sc', kind: 'upgraded', previous: { option: 'ME', seatCategory: MERIT } }]);
    expect(remaining.find((r) => r.option === 'ME')!.seats).toBe(2);
  });
  it('a float holder with nothing better keeps the seat', () => {
    const held = new Map<string, Held>([['f', { option: 'ME', seatCategory: MERIT, response: 'float' }]]);
    const { allotments } = runRound([{ option: 'CSE', category: MERIT, seats: 0 }, { option: 'ME', category: MERIT, seats: 1 }], [{ id: 'f', rank: 1, category: null, prefs: ['CSE', 'ME'] }], held);
    expect(allotments[0]).toMatchObject({ id: 'f', option: 'ME', kind: 'kept' });
  });
});

describe('agent commission rules', () => {
  const base = { flatPaise: 0, percentBps: 0, basePaise: 0, slabs: [], tdsBps: 0, active: true };
  const rule = (o: Partial<CommissionRule>): CommissionRule => ({ id: Math.random().toString(), agentId: null, programId: null, kind: 'flat', ...base, ...o });
  it('picks the most specific active rule', () => {
    const rules = [rule({ id: 'global' }), rule({ id: 'prog', programId: 'p1' }), rule({ id: 'agent', agentId: 'a1' }), rule({ id: 'both', agentId: 'a1', programId: 'p1' }), rule({ id: 'off', agentId: 'a1', programId: 'p1', active: false })];
    expect(pickRule(rules.filter((r) => r.id !== 'both'), 'a1', 'p1')?.id).toBe('agent');
    expect(pickRule(rules, 'a1', 'p1')?.id).toBe('both');
    expect(pickRule(rules, 'a2', 'p2')?.id).toBe('global');
    expect(pickRule(rules, 'a2', 'p1')?.id).toBe('prog');
  });
  it('pays flat, percent and slab amounts; slab depends on the Nth enrolment', () => {
    expect(commissionAmount(rule({ kind: 'flat', flatPaise: 500_000 }), 7)).toBe(500_000);
    expect(commissionAmount(rule({ kind: 'percent', basePaise: 10_000_000, percentBps: 250 }), 1)).toBe(250_000);
    const slab = rule({ kind: 'slab', slabs: [{ upTo: 5, paise: 100 }, { upTo: null, paise: 200 }] });
    expect([commissionAmount(slab, 5), commissionAmount(slab, 6)]).toEqual([100, 200]);
    expect(tdsOn(1_000_000, 200)).toBe(20_000);
  });
});

describe('lead payloads', () => {
  it('verifies the Meta signature over the raw body', () => {
    const raw = Buffer.from('{"a":1}');
    const sig = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;
    expect(metaSignatureOk('s3cret', raw, sig)).toBe(true);
    expect(metaSignatureOk('other', raw, sig)).toBe(false);
    expect(metaSignatureOk('s3cret', raw, undefined)).toBe(false);
  });
  it('reads Meta and Google leads', () => {
    const m = readMetaLead({ entry: [{ changes: [{ value: { leadgen_id: 'L1', field_data: [{ name: 'full_name', values: ['Asha K'] }, { name: 'phone_number', values: ['98300 11111'] }] } }] }] });
    expect(m).toMatchObject({ externalId: 'L1', name: 'Asha K' });
    expect('error' in readMetaLead({ leadgen_id: 'L2' })).toBe(true);
    const g = readGoogleLead({ lead_id: 'G1', user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Ravi' }, { column_id: 'PHONE_NUMBER', string_value: '+919830022222' }] });
    expect(g).toMatchObject({ externalId: 'G1', name: 'Ravi', phone: '+919830022222' });
  });
});
