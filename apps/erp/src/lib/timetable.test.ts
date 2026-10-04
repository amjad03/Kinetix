import { describe, expect, it } from 'vitest';
import { addMinutes, slotProblem, subjectsFor, weekGrid } from './timetable';
import type { TimetableSlot } from './types';

const slot = (id: string, day: number, start: string, end: string): TimetableSlot => ({
  id,
  dayOfWeek: day,
  startsAt: `${start}:00`,
  endsAt: `${end}:00`,
  section: { id: 's', displayName: 'BCA Sem 1 A' },
  subject: { id: 'm', code: 'BCA-1.2', name: 'Discrete Mathematics' },
  teacher: { id: 't', fullName: 'Ravi Kumar' },
  roomId: null,
  room: null,
});

describe('timetable', () => {
  it('lays the week out as days by period times', () => {
    const g = weekGrid([slot('a', 1, '10:00', '10:55'), slot('b', 1, '09:00', '09:55'), slot('c', 6, '10:00', '10:55'), slot('d', 3, '10:00', '11:00')]);
    expect(g.columns.map((c) => c.key)).toEqual(['09:00-09:55', '10:00-10:55', '10:00-11:00']);
    expect(g.rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.rows[0].cells['09:00-09:55'].map((s) => s.id)).toEqual(['b']);
    expect(g.rows[0].cells['10:00-10:55'].map((s) => s.id)).toEqual(['a']);
    expect(g.rows[1].cells).toEqual({});
    expect(g.rows[2].cells['10:00-11:00'].map((s) => s.id)).toEqual(['d']);
    expect(g.rows[5].cells['10:00-10:55'].map((s) => s.id)).toEqual(['c']);
  });

  it('shows Sunday only when something is on', () => {
    expect(weekGrid([]).rows).toHaveLength(6);
    expect(weekGrid([]).columns).toEqual([]);
    expect(weekGrid([slot('a', 7, '09:00', '10:00')]).rows.map((r) => r.day)).toContain(7);
  });

  it('checks a period before saving', () => {
    const ok = { sectionId: 's', subjectId: 'm', teacherId: 't', roomId: null, dayOfWeek: 6, startsAt: '15:00', endsAt: '15:55' };
    expect(slotProblem(ok)).toBeNull();
    expect(slotProblem({ ...ok, subjectId: '' })).toBe('tt.err.subject');
    expect(slotProblem({ ...ok, teacherId: '' })).toBe('tt.err.teacher');
    expect(slotProblem({ ...ok, endsAt: '14:00' })).toBe('tt.err.order');
    expect(slotProblem({ ...ok, startsAt: '9:00' })).toBe('tt.err.time');
    expect(slotProblem({ ...ok, dayOfWeek: 0 })).toBe('tt.err.day');
  });

  it('offers only the subjects of the class’s program and term', () => {
    const structure = {
      sections: [{ id: 'bca', displayName: 'BCA Sem 1 A', programId: 'p1', term: 1, students: 8 }],
      subjects: [
        { id: 'dm', code: 'BCA-1.2', name: 'Discrete Mathematics', programId: 'p1', term: 1, courseId: null },
        { id: 'x', code: 'BCA-3.1', name: 'Later', programId: 'p1', term: 3, courseId: null },
        { id: 'y', code: 'BCOM-1.1', name: 'Other', programId: 'p2', term: 1, courseId: null },
      ],
    };
    expect(subjectsFor(structure, 'bca').map((s) => s.id)).toEqual(['dm']);
    expect(subjectsFor(structure, 'nope')).toEqual([]);
  });

  it('adds minutes for the default end time', () => {
    expect(addMinutes('09:00', 55)).toBe('09:55');
    expect(addMinutes('10:30', 45)).toBe('11:15');
    expect(addMinutes('23:30', 55)).toBe('23:59');
  });
});
