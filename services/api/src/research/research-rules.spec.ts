import { describe, expect, it } from 'vitest';
import { canMoveProposal, ethicsBlocksApproval, grantBalance, normalizeDoi, researchKpis } from './research-rules.js';

describe('DOI', () => {
  it('normalises the common forms', () => {
    expect(normalizeDoi('10.1000/xyz123')).toBe('10.1000/xyz123');
    expect(normalizeDoi(' https://doi.org/10.1038/s41586-020-2649-2 ')).toBe('10.1038/s41586-020-2649-2');
    expect(normalizeDoi('doi: 10.1016/j.cell.2020.01.001')).toBe('10.1016/j.cell.2020.01.001');
  });
  it('rejects things that are not DOIs', () => {
    for (const bad of ['', 'abc', '11.1000/x', '10.12/x', '10.1000/', 'https://example.com/10.1000/x']) expect(normalizeDoi(bad)).toBeNull();
  });
});

describe('proposals and grants', () => {
  it('only allows forward moves', () => {
    expect(canMoveProposal('draft', 'submitted')).toBe(true);
    expect(canMoveProposal('draft', 'approved')).toBe(false);
    expect(canMoveProposal('approved', 'rejected')).toBe(false);
  });
  it('blocks approval until ethics is cleared', () => {
    expect(ethicsBlocksApproval({ ethicsRequired: true, ethicsStatus: 'pending' })).toBe(true);
    expect(ethicsBlocksApproval({ ethicsRequired: true, ethicsStatus: 'cleared' })).toBe(false);
    expect(ethicsBlocksApproval({ ethicsRequired: false, ethicsStatus: 'not_required' })).toBe(false);
  });
  it('computes the grant balance and utilisation', () => {
    expect(grantBalance(1_000_000, [250_000, 250_000])).toEqual({ sanctionedPaise: 1_000_000, spentPaise: 500_000, balancePaise: 500_000, utilisationPercent: 50 });
    expect(grantBalance(0, []).utilisationPercent).toBe(0);
  });
});

describe('NAAC criterion 3 inputs', () => {
  it('derives per-teacher ratios and index counts', () => {
    const k = researchKpis({
      facultyCount: 4,
      publications: [{ kind: 'journal', indexedIn: ['scopus'] }, { kind: 'journal', indexedIn: [] }, { kind: 'book_chapter', indexedIn: [] }],
      grants: [{ sanctionedPaise: 500 }, { sanctionedPaise: 700 }],
      patents: [{ status: 'granted' }, { status: 'filed' }],
      scholarsAwarded: 1,
      projects: 3,
      conferencesPresented: 2,
    });
    expect(k.publications).toEqual({ total: 3, indexed: 1, perTeacher: 0.75, booksAndChapters: 1 });
    expect(k.grants).toEqual({ count: 2, totalSanctionedPaise: 1200 });
    expect(k.patents).toEqual({ total: 2, granted: 1 });
    expect(k.naac['3.4.1'].value).toBe(1);
  });
  it('handles an institution with no faculty', () => expect(researchKpis({ facultyCount: 0, publications: [], grants: [], patents: [], scholarsAwarded: 0, projects: 0, conferencesPresented: 0 }).publications.perTeacher).toBe(0));
});
