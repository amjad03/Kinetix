import { describe, expect, it } from 'vitest';
import { leadScore } from './lead-score.js';

describe('leadScore', () => {
  it('adds source, programme, follow-up and engagement points', () => {
    const s = leadScore({ source: 'referral', stage: 'counselling', hasProgram: true, hasEmail: true, activities: 2 });
    expect(s).toEqual({ source: 25, programme: 10, followUps: 10, engagement: 20, total: 65 });
  });
  it('caps follow-up points and the total, and never goes below zero', () => {
    expect(leadScore({ source: 'walk_in', stage: 'converted', hasProgram: true, hasEmail: true, activities: 40 }).total).toBe(100);
    expect(leadScore({ source: 'import', stage: 'lost', hasProgram: false, hasEmail: false, activities: 0 }).total).toBe(0);
    expect(leadScore({ source: 'web', stage: 'new', hasProgram: false, hasEmail: false, activities: 40 }).followUps).toBe(25);
  });
});
