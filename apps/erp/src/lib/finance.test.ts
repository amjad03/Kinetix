import { describe, expect, it } from 'vitest';
import { canSee } from './access';
import { fiscalYearOf, recentFiscalYears } from './finance';

describe('finance', () => {
  it('uses the April to March financial year', () => {
    expect(fiscalYearOf(new Date(2026, 3, 1))).toBe('2026-27');
    expect(fiscalYearOf(new Date(2027, 2, 31))).toBe('2026-27');
    expect(recentFiscalYears(new Date(2026, 9, 8))).toEqual(['2026-27', '2025-26', '2024-25']);
  });
  it('is for the accounts office and leaders', () => {
    expect(canSee(['accountant'], 'finance')).toBe(true);
    expect(canSee(['hod'], 'finance')).toBe(false);
  });
});
