import { describe, expect, it } from 'vitest';
import en from '@/i18n/messages/placements-pass';
import { extraCriteria } from './placements-depth';

describe('drive criteria beyond CGPA and backlogs', () => {
  it('lists each rule the drive sets, in order, with its figure', () => {
    expect(extraCriteria({ genders: ['female'], minTenthPct: 60, minTwelfthPct: 75, maxGapYears: 1, maxBacklogHistory: 0, requireVerifiedDocs: true })).toEqual([
      { key: 'pp.crit.women' },
      { key: 'pp.crit.tenth', vars: { pct: 60 } },
      { key: 'pp.crit.twelfth', vars: { pct: 75 } },
      { key: 'pp.crit.gap', vars: { n: 1 } },
      { key: 'pp.crit.history', vars: { n: 0 } },
      { key: 'pp.crit.docs' },
    ]);
  });
  it('says nothing for a drive open to everyone with no further rules', () => {
    expect(extraCriteria({ genders: [], minTenthPct: null, minTwelfthPct: 0, maxGapYears: null, maxBacklogHistory: null, requireVerifiedDocs: false })).toEqual([]);
    expect(extraCriteria({})).toEqual([]);
  });
  it('has a string for every criterion and every new eligibility reason', () => {
    for (const k of ['pp.crit.women', 'pp.crit.men', 'pp.crit.tenth', 'pp.crit.twelfth', 'pp.crit.gap', 'pp.crit.history', 'pp.crit.docs']) expect(en.en[k as keyof typeof en.en]).toBeTruthy();
    for (const r of ['gender_not_eligible', 'tenth_below', 'twelfth_below', 'no_prior_marks', 'gap_exceeded', 'backlog_history_exceeded', 'documents_not_verified']) expect(en.en[`pd.reason.${r}` as keyof typeof en.en]).toBeTruthy();
  });
});
