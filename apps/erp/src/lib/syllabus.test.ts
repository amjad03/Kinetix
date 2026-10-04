import { describe, expect, it } from 'vitest';
import { subjectLinks } from './syllabus';

describe('subjectLinks', () => {
  it('lists each subject with the classes of its program and term', () => {
    const sections = [
      { id: 's1', displayName: 'BCom Sem 3 B', programId: 'bcom', term: 3, students: 10 },
      { id: 's2', displayName: 'BCom Sem 3 A', programId: 'bcom', term: 3, students: 12 },
      { id: 's3', displayName: 'BCom Sem 1 A', programId: 'bcom', term: 1, students: 9 },
      { id: 's4', displayName: 'BCA Sem 3 A', programId: 'bca', term: 3, students: 8 },
    ];
    const subjects = [
      { id: 'a', code: 'BCOM-3.1', name: 'Corporate Accounting', programId: 'bcom', term: 3, courseId: 'c1' },
      { id: 'b', code: 'MCOM-1.1', name: 'Research Methods', programId: 'mcom', term: 1, courseId: null },
    ];
    expect(subjectLinks({ sections, subjects })).toEqual([
      { id: 'a', code: 'BCOM-3.1', name: 'Corporate Accounting', courseId: 'c1', classes: ['BCom Sem 3 A', 'BCom Sem 3 B'] },
      { id: 'b', code: 'MCOM-1.1', name: 'Research Methods', courseId: null, classes: [] },
    ]);
  });
});
