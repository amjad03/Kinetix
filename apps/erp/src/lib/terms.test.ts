import { describe, expect, it } from 'vitest';
import { currentTerm, overlappingTerm, programsMeet, termProblem, type Term, type TermInput } from './terms';

const term = (id: string, startsOn: string, endsOn: string, programIds: string[] | null = null): Term => ({ id, academicYearId: 'y', academicYear: '2026-27', name: id, startsOn, endsOn, programIds, programs: null });
const input = (o: Partial<TermInput> = {}): TermInput => ({ name: 'Odd semester 2026', startsOn: '2026-08-01', endsOn: '2026-12-15', programIds: null, ...o });

describe('terms', () => {
  it('checks the dialog like the API', () => {
    expect(termProblem(input())).toBeNull();
    expect(termProblem(input({ name: '  ' }))).toBe('name');
    expect(termProblem(input({ name: 'x'.repeat(121) }))).toBe('nameLong');
    expect(termProblem(input({ startsOn: '2026-13-01' }))).toBe('startsOn');
    expect(termProblem(input({ endsOn: '' }))).toBe('endsOn');
    expect(termProblem(input({ endsOn: '2026-07-31' }))).toBe('range');
    expect(termProblem(input({ programIds: [] }))).toBe('programs');
  });

  it('finds overlaps only for the same programs', () => {
    expect(programsMeet(null, ['a'])).toBe(true);
    expect(programsMeet(['a'], ['b'])).toBe(false);
    expect(programsMeet(['a', 'b'], ['b'])).toBe(true);
    const terms = [term('odd', '2026-08-01', '2026-12-15', ['bcom']), term('bba', '2026-12-01', '2027-03-31', ['bba'])];
    expect(overlappingTerm(input({ startsOn: '2026-12-10', endsOn: '2027-05-31', programIds: ['bcom'] }), terms)?.id).toBe('odd');
    expect(overlappingTerm(input({ startsOn: '2027-01-01', endsOn: '2027-05-31', programIds: ['bcom'] }), terms)).toBeUndefined();
    // A term for every program meets all of them.
    expect(termProblem(input({ startsOn: '2027-01-01', endsOn: '2027-05-31' }), terms)).toBe('overlap');
    // Editing a term does not clash with itself.
    expect(termProblem(input({ programIds: ['bcom'] }), terms, 'odd')).toBeNull();
  });

  it('picks the term in progress, else the next one', () => {
    const terms = [term('odd', '2026-08-01', '2026-12-15'), term('even', '2027-01-01', '2027-05-31')];
    expect(currentTerm(terms, '2026-10-05')?.id).toBe('odd');
    expect(currentTerm(terms, '2026-12-20')?.id).toBe('even');
    expect(currentTerm(terms, '2027-06-01')).toBeUndefined();
  });
});
