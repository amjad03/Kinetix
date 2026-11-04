import { describe, expect, it } from 'vitest';
import { agencyKindOf, capForDesignation, expenseRefusal, financialYear, incentiveAmount, maxSubmissionOn, nextReportDue, nirfRatios, overheadPaise, paperBasis, scholarIdOf, titleKey, ucFigures, ugcLevel, validScopusId, validWosId, vidwanIdOf } from './research-pass.rules.js';

describe('research pass rules', () => {
  it('checks and normalises researcher identifiers', () => {
    expect(validScopusId('57201234567')).toBe(true);
    expect(validScopusId('5720123')).toBe(false);
    expect(validWosId('aab-1234-2019')).toBe(true);
    expect(validWosId('A-1234-1899')).toBe(false);
    expect(scholarIdOf('https://scholar.google.com/citations?hl=en&user=qc6CJjYAAAAJ')).toBe('qc6CJjYAAAAJ');
    expect(scholarIdOf('qc6CJjYAAAAJ')).toBe('qc6CJjYAAAAJ');
    expect(scholarIdOf('not an id')).toBeNull();
    expect(vidwanIdOf('https://vidwan.inflibnet.ac.in/profile/123456')).toBe('123456');
    expect(vidwanIdOf('12')).toBeNull();
  });

  it('compares titles without case, spacing or punctuation', () => {
    expect(titleKey('Ledgers on Phones!')).toBe(titleKey('ledgers  on phones'));
    expect(titleKey('UPI: a study')).toBe('upiastudy');
  });

  it('refuses an expense over its head, over the sanction, or over what was released', () => {
    const base = { sanctionedPaise: 1000, headSanctionedPaise: 500, headSpentPaise: 450, spentPaise: 600, releasedPaise: 600, amountPaise: 60 };
    expect(expenseRefusal(base)).toMatchObject({ code: 'HEAD_OVERSPEND', limitPaise: 50 });
    expect(expenseRefusal({ ...base, headSanctionedPaise: null, amountPaise: 500 })).toMatchObject({ code: 'GRANT_OVERSPEND', limitPaise: 400 });
    expect(expenseRefusal({ ...base, headSanctionedPaise: null })).toMatchObject({ code: 'FUNDS_NOT_RELEASED', limitPaise: 0 });
    expect(expenseRefusal({ ...base, headSanctionedPaise: null, releasedPaise: null })).toBeNull();
    expect(overheadPaise(90_000_000, 10)).toBe(9_000_000);
    expect(overheadPaise(333, 10)).toBe(33);
  });

  it('draws the GFR 12-A figures for a period', () => {
    const r = ucFigures([{ on: '2026-07-05', amountPaise: 600 }, { on: '2026-10-01', amountPaise: 300 }], [{ on: '2026-07-20', amountPaise: 450 }, { on: '2026-08-10', amountPaise: 150 }, { on: '2026-11-02', amountPaise: 10 }], '2026-08-01', '2026-10-31');
    expect(r).toEqual({ openingPaise: 150, receivedPaise: 300, availablePaise: 450, spentPaise: 150, closingPaise: 300 });
  });

  it('picks the best incentive rate and applies the co-author share and the yearly cap', () => {
    const rates = { scopus_q1: 2500000, scopus: 1000000, ugc_care: 500000, book_chapter: 300000 };
    expect(paperBasis({ kind: 'journal', indexedIn: ['scopus', 'ugc_care'], quartile: 'Q1', status: 'published' }, rates)).toEqual({ basis: 'scopus_q1', ratePaise: 2500000 });
    expect(paperBasis({ kind: 'journal', indexedIn: ['scopus'], quartile: 'Q3', status: 'published' }, rates)).toEqual({ basis: 'scopus', ratePaise: 1000000 });
    expect(paperBasis({ kind: 'journal', indexedIn: ['UGC-CARE'], quartile: null, status: 'published' }, rates)).toEqual({ basis: 'ugc_care', ratePaise: 500000 });
    expect(paperBasis({ kind: 'book_chapter', indexedIn: [], quartile: null, status: 'published' }, rates)).toEqual({ basis: 'book_chapter', ratePaise: 300000 });
    expect(paperBasis({ kind: 'journal', indexedIn: ['scopus'], quartile: 'Q1', status: 'retracted' }, rates)).toBeNull();
    expect(paperBasis({ kind: 'journal', indexedIn: [], quartile: null, status: 'published' }, rates)).toBeNull();
    expect(incentiveAmount(1000000, false, 50, 0, 0)).toBe(500000);
    expect(incentiveAmount(2500000, true, 50, 3000000, 2500000)).toBe(500000);
    expect(incentiveAmount(500000, true, 50, 3000000, 3000000)).toBe(0);
    expect(financialYear('2027-03-31')).toEqual({ label: '2026-27', from: '2026-04-01', to: '2027-03-31' });
    expect(financialYear('2026-04-01').label).toBe('2026-27');
  });

  it('follows the UGC 2018 similarity levels and the UGC 2022 Ph.D. limits', () => {
    expect([10, 10.01, 40, 40.5, 60, 61].map(ugcLevel)).toEqual(['level_0', 'level_1', 'level_1', 'level_2', 'level_2', 'level_3']);
    expect(capForDesignation('Assistant Professor', 8)).toBe(4);
    expect(capForDesignation('Associate Professor', 8)).toBe(6);
    expect(capForDesignation('Professor and Head', 8)).toBe(8);
    expect(capForDesignation('Lecturer', 5)).toBe(5);
    expect(maxSubmissionOn('2025-01-10', 'female')).toBe('2033-01-09');
    expect(maxSubmissionOn('2025-01-10', 'male')).toBe('2031-01-09');
    expect(nextReportDue('2025-07-09', '2025-01-10')).toBe('2026-01-09');
    expect(nextReportDue(null, '2025-01-10')).toBe('2025-07-10');
  });

  it('sorts agencies and works out the NIRF ratios', () => {
    expect(agencyKindOf('DST-SERB')).toBe('government');
    expect(agencyKindOf('ICSSR')).toBe('government');
    expect(agencyKindOf('Infosys Foundation')).toBe('non_government');
    // 12 papers over three years and 4 faculty: 1 paper per faculty a year; 30 citations: 2.5 a paper.
    const r = nirfRatios({ faculty: [4, 4, 4], papers: [3, 4, 5], citations: [10, 10, 10], researchPaise: [6e7, 9e7, 3e7], consultancyPaise: [1e7, 1e7, 1e7], patentsPublished: 2, patentsGranted: 1 });
    expect(r).toEqual({ facultyAverage: 4, pu: { papers: 12, perFaculty: 1 }, qp: { citations: 30, perPaper: 2.5 }, fppp: { researchLakhsPerYear: 6, consultancyLakhsPerYear: 1, perFacultyLakhs: 1.75 }, ipr: { published: 2, granted: 1 } });
  });
});
