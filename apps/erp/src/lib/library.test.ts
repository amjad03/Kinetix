import { describe, expect, it } from 'vitest';
import { availableCopies, canSearchStudents, daysLate, dueLabel, finePreview, fineStatus, unpaidFines } from './library';

describe('library', () => {
  it('counts copies on the shelf', () => {
    expect(availableCopies({ copies: 4, onLoan: 1 })).toBe(3);
    expect(availableCopies({ copies: 2, onLoan: 2 })).toBe(0);
    expect(availableCopies({ copies: 1, onLoan: 3 })).toBe(0);
  });

  it('fines ₹2 a day after the due date, nothing before', () => {
    expect(daysLate('2026-10-04', '2026-10-04')).toBe(0);
    expect(daysLate('2026-10-09', '2026-10-04')).toBe(0);
    expect(daysLate('2026-09-30', '2026-10-04')).toBe(4);
    expect(finePreview('2026-09-30', '2026-10-04')).toBe(800);
    expect(finePreview('2026-10-05', '2026-10-04')).toBe(0);
  });

  it('describes the due date', () => {
    expect(dueLabel('2026-10-04', '2026-10-04')).toBe('Due today');
    expect(dueLabel('2026-10-05', '2026-10-04')).toBe('Due in 1 day');
    expect(dueLabel('2026-10-09', '2026-10-04')).toBe('Due in 5 days');
    expect(dueLabel('2026-10-03', '2026-10-04')).toBe('1 day late');
    expect(dueLabel('2026-09-30', '2026-10-04')).toBe('4 days late');
  });

  it('searches students from two characters', () => {
    expect(canSearchStudents('a')).toBe(false);
    expect(canSearchStudents(' a ')).toBe(false);
    expect(canSearchStudents('aa')).toBe(true);
    expect(canSearchStudents('U03')).toBe(true);
  });

  it('adds up fines not collected yet', () => {
    const loans = [
      { finePaise: 800, finePaidAt: null },
      { finePaise: 200, finePaidAt: '2026-10-04T10:00:00Z' },
      { finePaise: 0, finePaidAt: null },
      { finePaise: 1400, finePaidAt: null },
    ];
    expect(unpaidFines(loans)).toEqual({ count: 2, paise: 2200 });
    expect(unpaidFines([])).toEqual({ count: 0, paise: 0 });
    expect(loans.map(fineStatus)).toEqual(['unpaid', 'paid', null, 'unpaid']);
  });
});
