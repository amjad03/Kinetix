import { describe, expect, it } from 'vitest';
import { overlayCreditLimits, overlayPassRules, quotaSeatsFromRule } from './rule-params.js';

describe('rules from the registry replace per-domain configuration', () => {
  const pass = { minInternalPercent: 40, minExternalPercent: 40, minTotalPercent: 40 };
  it('keeps the scheme when no rule is in force', () => expect(overlayPassRules(pass, null)).toEqual(pass));
  it('takes the pass mark from the rule and ignores invalid values', () => {
    expect(overlayPassRules(pass, { passPercent: 35 })).toEqual({ ...pass, minTotalPercent: 35 });
    expect(overlayPassRules(pass, { minTotalPercent: 150, minExternalPercent: null })).toEqual({ minInternalPercent: 40, minExternalPercent: null, minTotalPercent: 40 });
  });
  it('overrides credit limits and never lets the minimum pass the maximum', () => {
    const w = { minCredits: 10, maxCredits: 24, termId: 't' };
    expect(overlayCreditLimits(w, null)).toBe(w);
    expect(overlayCreditLimits(w, { minCredits: 18, maxCredits: 28 })).toEqual({ minCredits: 18, maxCredits: 28, termId: 't' });
    expect(overlayCreditLimits(w, { minCredits: 40, maxCredits: 28 }).minCredits).toBe(28);
  });
  it('turns category shares into reserved seats, rounding down', () => {
    expect(quotaSeatsFromRule({ reservedPercent: { SC: 15, ST: 3 } }, 60)).toEqual([{ category: 'SC', reservedSeats: 9 }, { category: 'ST', reservedSeats: 1 }]);
    expect(quotaSeatsFromRule(null, 60)).toBeNull();
    expect(quotaSeatsFromRule({ reservedPercent: { SC: 70, ST: 40 } }, 60)).toBeNull();
    expect(quotaSeatsFromRule({ reservedPercent: { SC: 'x' } }, 60)).toBeNull();
  });
});
