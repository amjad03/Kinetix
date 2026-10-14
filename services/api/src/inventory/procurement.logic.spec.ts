import { describe, expect, it } from 'vitest';
import { budgetCheck, canMoveTicket, fiscalYearOf, indentSteps, isoWeekday, overlaps, purchaseModeProblem, slaState, vendorScore } from './procurement.logic.js';

const rules = { directPurchaseUptoPaise: 25_000_00, tenderAbovePaise: 5_00_000_00 };

describe('purchase modes', () => {
  it('allows a small order direct, and needs quotations, a rate contract or GeM above the direct limit', () => {
    expect(purchaseModeProblem('direct', 25_000_00, rules, {})).toBeNull();
    expect(purchaseModeProblem('direct', 25_000_01, rules, {})).toMatch(/Direct purchase is allowed up to ₹25,000/);
    expect(purchaseModeProblem('quotation', 2_00_000_00, rules, {})).toBeNull();
    expect(purchaseModeProblem('rate_contract', 2_00_000_00, rules, {})).toBeNull();
  });
  it('needs a tender or GeM above the tender limit, each with its reference', () => {
    expect(purchaseModeProblem('quotation', 6_00_000_00, rules, {})).toMatch(/tender or GeM/);
    expect(purchaseModeProblem('tender', 6_00_000_00, rules, {})).toBe('Give the tender reference');
    expect(purchaseModeProblem('tender', 6_00_000_00, rules, { tenderRef: 'T/2026/14' })).toBeNull();
    expect(purchaseModeProblem('gem', 100_00, rules, { gemRef: ' ' })).toBe('Give the GeM order or bid reference');
    expect(purchaseModeProblem('gem', 6_00_000_00, rules, { gemRef: 'GEMC-511687' })).toBeNull();
  });
  it('treats a zero tender limit as no tender rule', () => expect(purchaseModeProblem('quotation', 9_00_00_000_00, { ...rules, tenderAbovePaise: 0 }, {})).toBeNull());
});

describe('budget and approval chain', () => {
  it('checks an estimate against what is left after spending and commitments', () => {
    expect(budgetCheck(0, 0, 0, 500)).toEqual({ status: 'no_budget', availablePaise: 0 });
    expect(budgetCheck(10_000, 4_000, 1_000, 5_000)).toEqual({ status: 'within', availablePaise: 5_000 });
    expect(budgetCheck(10_000, 4_000, 1_000, 5_001)).toEqual({ status: 'exceeded', availablePaise: 5_000 });
  });
  it('sends an indent to the head of department first, unless the head raised it', () => {
    expect(indentSteps('h', 'teacher')).toEqual(['hod', 'principal']);
    expect(indentSteps('h', 'h')).toEqual(['principal']);
    expect(indentSteps(null, 'teacher')).toEqual(['principal']);
  });
  it('names the Indian financial year', () => {
    expect(fiscalYearOf('2026-03-31')).toBe('2025-26');
    expect(fiscalYearOf('2026-04-01')).toBe('2026-27');
    expect(fiscalYearOf('2099-12-01')).toBe('2099-00');
  });
});

describe('facilities', () => {
  it('finds overlapping bookings; touching ends do not clash', () => {
    expect(overlaps({ startsAt: '10:00', endsAt: '11:00' }, { startsAt: '10:30:00', endsAt: '12:00:00' })).toBe(true);
    expect(overlaps({ startsAt: '10:00', endsAt: '11:00' }, { startsAt: '11:00', endsAt: '12:00' })).toBe(false);
    expect(overlaps({ startsAt: '09:00', endsAt: '17:00' }, { startsAt: '10:00', endsAt: '10:55' })).toBe(true);
  });
  it('gives the ISO weekday of a day', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });
  it('tracks a ticket against its deadline', () => {
    const createdAt = new Date('2026-10-14T00:00:00Z');
    const dueAt = new Date('2026-10-14T04:00:00Z');
    expect(slaState({ createdAt, dueAt, resolvedAt: null }, new Date('2026-10-14T01:00:00Z'))).toBe('on_track');
    expect(slaState({ createdAt, dueAt, resolvedAt: null }, new Date('2026-10-14T03:30:00Z'))).toBe('at_risk');
    expect(slaState({ createdAt, dueAt, resolvedAt: null }, new Date('2026-10-14T05:00:00Z'))).toBe('breached');
    expect(slaState({ createdAt, dueAt, resolvedAt: new Date('2026-10-14T03:59:00Z') }, new Date('2026-10-20T00:00:00Z'))).toBe('met');
    expect(slaState({ createdAt, dueAt, resolvedAt: new Date('2026-10-14T04:01:00Z') }, new Date('2026-10-20T00:00:00Z'))).toBe('breached');
  });
  it('moves tickets only along the workflow', () => {
    expect(canMoveTicket('open', 'assigned')).toBe(true);
    expect(canMoveTicket('open', 'closed')).toBe(false);
    expect(canMoveTicket('resolved', 'closed')).toBe(true);
    expect(canMoveTicket('closed', 'open')).toBe(true);
    expect(canMoveTicket('in_progress', 'open')).toBe(false);
  });
});

describe('vendor score', () => {
  it('averages the three ratings, to one decimal', () => {
    expect(vendorScore([])).toBeNull();
    expect(vendorScore([{ quality: 5, delivery: 4, price: 3 }, { quality: 4, delivery: 4, price: 4 }])).toBe(4);
    expect(vendorScore([{ quality: 5, delivery: 5, price: 4 }])).toBe(4.7);
  });
});
