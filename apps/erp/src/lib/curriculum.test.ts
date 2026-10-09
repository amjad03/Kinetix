import { describe, expect, it } from 'vitest';
import { canSee } from './access';
import { diffCount, nextStep, parseReportLines } from './curriculum';
import { visibleGroups } from './nav';

describe('curriculum desk helpers', () => {
  it('offers the next step by status and role', () => {
    expect(nextStep('draft', true)).toBe('approve');
    expect(nextStep('draft', false)).toBeNull();
    expect(nextStep('approved', true)).toBe('activate');
    expect(nextStep('active', false)).toBe('revise');
    expect(nextStep('archived', true)).toBeNull();
  });

  it('reads report card lines and points at the first bad one', () => {
    expect(parseReportLines('Maths, 88, 100\n\nScience, 45, 50, Great practicals')).toEqual({
      lines: [
        { subjectName: 'Maths', marks: 88, maxMarks: 100, remark: '' },
        { subjectName: 'Science', marks: 45, maxMarks: 50, remark: 'Great practicals' },
      ],
    });
    expect(parseReportLines('Maths, 88, 100\nArt, 60, 50')).toEqual({ badLine: 2 });
    expect(parseReportLines('English, x, 100')).toEqual({ badLine: 1 });
  });

  it('counts differences', () => {
    expect(diffCount({ added: [{ code: 'a', name: 'A' }], removed: [], changed: [{ code: 'b', name: 'B', changes: ['x'] }] })).toBe(2);
  });

  it('shows the desks to the right roles in the menu', () => {
    expect(canSee(['principal'], 'curriculum')).toBe(true);
    expect(canSee(['accountant'], 'curriculum')).toBe(false);
    expect(canSee(['hod'], 'schoolMode')).toBe(true);
    expect(canSee(['teacher'], 'schoolMode')).toBe(false);
    expect(canSee(['exam_controller'], 'university')).toBe(true);
    const hrefs = visibleGroups(['principal']).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual(expect.arrayContaining(['/curriculum', '/school-mode', '/university']));
  });
});
