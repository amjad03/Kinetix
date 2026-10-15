import { describe, expect, it } from 'vitest';
import { changedEntries, heatTone, lvl, moveFrom, parseClipboard, pasteInto, readMark, rowProblems } from './obe-flagship';

describe('OBE marks grid', () => {
  it('reads a block copied from Excel (tabs) or typed with commas', () => {
    expect(parseClipboard('4\t3.5\t8\r\n5\t2\t\n')).toEqual([['4', '3.5', '8'], ['5', '2', '']]);
    expect(parseClipboard('4, 3,5')).toEqual([['4', '3', '5']]);
  });

  it('reads marks, blanks and absentees', () => {
    expect(readMark('4,5')).toEqual({ value: 4.5, absent: false, ok: true });
    expect(readMark(' ')).toEqual({ value: null, absent: false, ok: true });
    expect(readMark('AB')).toEqual({ value: null, absent: true, ok: true });
    expect(readMark('-1').ok).toBe(false);
    expect(readMark('x').ok).toBe(false);
  });

  it('pastes from the focused cell, dropping what falls outside the grid', () => {
    const g = { values: [['', '', ''], ['', '', ''], ['', '', '']], absent: [false, false, false] };
    const { grid, filled } = pasteInto(g, 1, 1, [['4', '5', '9'], ['AB', '3'], ['1', '1']]);
    expect(grid.values).toEqual([['', '', ''], ['', '4', '5'], ['', '', '3']]);
    expect(grid.absent).toEqual([false, false, true]);
    expect(filled).toBe(3);
    expect(g.values[1][1]).toBe(''); // the original is left alone
  });

  it('flags marks above the maximum and totals above the paper', () => {
    expect(rowProblems(['5', '6', ''], [5, 5, 10], 20)).toEqual({ cols: [1], total: 11, over: false });
    expect(rowProblems(['5', '5', '10.5'], [5, 5, 12], 20)).toEqual({ cols: [], total: 20.5, over: true });
    expect(rowProblems(['', '', ''], [5, 5, 10], 20).total).toBeNull();
  });

  it('moves like a spreadsheet: Enter and arrows, wrapping at the row ends', () => {
    expect(moveFrom('Enter', 0, 1, 3, 3)).toEqual({ row: 1, col: 1 });
    expect(moveFrom('Enter', 2, 1, 3, 3, true)).toEqual({ row: 1, col: 1 });
    expect(moveFrom('ArrowRight', 0, 2, 3, 3)).toEqual({ row: 1, col: 0 });
    expect(moveFrom('ArrowLeft', 1, 0, 3, 3)).toEqual({ row: 0, col: 2 });
    expect(moveFrom('ArrowDown', 2, 0, 3, 3)).toEqual({ row: 2, col: 0 });
    expect(moveFrom('Tab', 0, 0, 3, 3)).toBeNull();
  });

  it('sends only the rows that changed', () => {
    const before = { values: [['4', '3'], ['', '']], absent: [false, false] };
    const after = { values: [['4', '3'], ['2', '']], absent: [false, false] };
    expect(changedEntries(before, after, ['s1', 's2'], ['q1', 'q2'])).toEqual([{ studentId: 's2', absent: false, marks: { q1: 2, q2: null } }]);
  });
});

describe('OBE heat maps', () => {
  it('tones a level against its target', () => {
    expect(heatTone(2.1, 2)).toBe('met');
    expect(heatTone(1.7, 2)).toBe('near');
    expect(heatTone(1.2, 2)).toBe('short');
    expect(heatTone(null, 2)).toBe('none');
    expect(lvl(1.856)).toBe('1.86');
    expect(lvl(null)).toBe('-');
  });
});
