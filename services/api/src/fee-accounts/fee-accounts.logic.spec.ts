import { describe, expect, it } from 'vitest';
import { ageBucket, chequeNext, concessionAmount, denominationTotal, eligible80G, formatSeries, gstSplit, headOf, periodClosable, seriesProblem } from './fee-accounts.logic.js';

describe('fees and accounts desk rules', () => {
  it('formats numbering series with the Indian financial year', () => {
    expect(formatSeries({ prefix: 'RCPT/{FY}/', next: 42, pad: 5 }, '2026-10-20')).toBe('RCPT/2026-27/00042');
    expect(formatSeries({ prefix: 'R', next: 7, pad: 3, suffix: '/{YY}' }, '2027-02-01')).toBe('R007/27');
    expect(formatSeries({ prefix: 'X/{FY}/', next: 1, pad: 2 }, '2027-03-31')).toBe('X/2026-27/01');
    expect(seriesProblem({ prefix: 'A', next: 0, pad: 4 })).toMatch(/next/);
    expect(seriesProblem({ prefix: 'A', next: 1, pad: 11 })).toMatch(/digits/);
  });

  it('caps a concession at what is still due', () => {
    expect(concessionAmount({ invoiceAmountPaise: 2000000, outstandingPaise: 2000000, percent: 10 })).toBe(200000);
    expect(concessionAmount({ invoiceAmountPaise: 2000000, outstandingPaise: 50000, percent: 10 })).toBe(50000);
    expect(concessionAmount({ amountPaise: 30000 })).toBe(30000);
  });

  it('counts cash by denomination and refuses odd notes', () => {
    expect(denominationTotal({ 500: 2, 100: 3, 1: 4 })).toBe(130400);
    expect(() => denominationTotal({ 3: 1 })).toThrow();
    expect(() => denominationTotal({ 100: -1 })).toThrow();
  });

  it('moves cheques only forward', () => {
    expect(chequeNext('received', 'deposit')).toBe('deposited');
    expect(chequeNext('received', 'clear')).toBeNull();
    expect(chequeNext('deposited', 'bounce')).toBe('bounced');
    expect(chequeNext('cleared', 'bounce')).toBeNull();
  });

  it('ages overdue balances, splits GST and matches fee heads', () => {
    expect([0, 15, 45, 75, 120].map(ageBucket)).toEqual(['current', '0-30', '31-60', '61-90', '90+']);
    expect(gstSplit(11200, 12)).toEqual({ taxablePaise: 10000, cgstPaise: 600, sgstPaise: 600, taxPaise: 1200 });
    expect(headOf('Uniform and books 2026', [{ code: 'UNI', name: 'Uniform and books', gstRate: 12, accountCode: '4100' }])?.code).toBe('UNI');
    expect(headOf('Term fee', [{ code: 'UNI', name: 'Uniform and books', gstRate: 12, accountCode: '4100' }])).toBeNull();
  });

  it('closes only months that have ended, and knows 80G limits', () => {
    expect(periodClosable('2026-09', '2026-10-20')).toBe(true);
    expect(periodClosable('2026-10', '2026-10-20')).toBe(false);
    expect(periodClosable('2026-13', '2027-10-20')).toBe(false);
    expect(eligible80G('cash', 2500_00)).toBe(false);
    expect(eligible80G('upi', 2500_00)).toBe(true);
  });
});
