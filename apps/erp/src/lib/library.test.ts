import { describe, expect, it } from 'vitest';
import { availableCopies, daysLate, dueLabel, finePreview, searchStudents, uniqueStudents } from './library';
import type { LibraryStudent } from './types';

const kids: LibraryStudent[] = [
  { id: '1', fullName: 'Aarav Patel', rollNo: 'U03BC001', className: 'BCom Sem 3 A' },
  { id: '2', fullName: 'Diya Patel', rollNo: 'U01CA001', className: 'BCA Sem 1 A' },
  { id: '3', fullName: 'Ananya Gowda', rollNo: 'U03BC002', className: 'BCom Sem 3 A' },
  { id: '4', fullName: 'Rohan Desai', rollNo: null, className: 'BCA Sem 1 A' },
];

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

  it('finds students by name, roll number or class, every word', () => {
    expect(searchStudents(kids, 'patel').map((s) => s.id)).toEqual(['1', '2']);
    expect(searchStudents(kids, 'U01CA001').map((s) => s.id)).toEqual(['2']);
    expect(searchStudents(kids, 'u03bc').map((s) => s.id)).toEqual(['1', '3']);
    expect(searchStudents(kids, 'patel bca').map((s) => s.id)).toEqual(['2']);
    expect(searchStudents(kids, 'rohan').map((s) => s.id)).toEqual(['4']);
    expect(searchStudents(kids, '')).toHaveLength(4);
    expect(searchStudents(kids, 'zzz')).toEqual([]);
    expect(searchStudents(kids, '', 2)).toHaveLength(2);
  });

  it('puts an exact roll number first', () => {
    const list = [...kids, { id: '5', fullName: 'Zoya U03BC001', rollNo: 'X', className: 'BCom Sem 3 A' }];
    expect(searchStudents(list, 'U03BC001')[0].id).toBe('1');
  });

  it('de-duplicates students by class and roll number', () => {
    const u = uniqueStudents([kids[0], kids[1], kids[0], kids[2]]);
    expect(u.map((s) => s.id)).toEqual(['2', '1', '3']);
  });
});
