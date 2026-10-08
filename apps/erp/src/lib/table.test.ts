import { describe, expect, it } from 'vitest';
import { compareCells, csvField, matchesQuery, paginate, sortRows, toCsv } from './table';

describe('sortRows', () => {
  const rows = [{ n: 'b2', v: 10 }, { n: 'a10', v: null }, { n: 'a2', v: 3 }];
  it('sorts text naturally and numbers numerically, empties last', () => {
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['a2', 'a10', 'b2']);
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([3, 10, null]);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([10, 3, null]);
  });
  it('is stable and returns a copy without a sort value', () => {
    const same = [{ k: 1, id: 'x' }, { k: 1, id: 'y' }];
    expect(sortRows(same, (r) => r.k, 'desc').map((r) => r.id)).toEqual(['x', 'y']);
    expect(sortRows(same, undefined, 'asc')).not.toBe(same);
  });
  it('compares empties as equal', () => expect(compareCells(null, '', 'asc')).toBe(0));
});

describe('matchesQuery', () => {
  it('needs every word, ignoring case', () => {
    expect(matchesQuery('Asha Rao · BCA 3A', 'asha bca')).toBe(true);
    expect(matchesQuery('Asha Rao · BCA 3A', 'asha bcom')).toBe(false);
    expect(matchesQuery('anything', '  ')).toBe(true);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);
  it('slices pages and reports the range', () => {
    expect(paginate(rows, 0, 10)).toMatchObject({ pages: 3, from: 1, to: 10, total: 23 });
    expect(paginate(rows, 2, 10)).toMatchObject({ from: 21, to: 23, rows: [20, 21, 22] });
  });
  it('clamps a page that no longer exists and handles no rows', () => {
    expect(paginate(rows, 9, 10).page).toBe(2);
    expect(paginate([], 3, 10)).toMatchObject({ pages: 1, page: 0, from: 0, to: 0, total: 0 });
  });
});

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('x\ny')).toBe('"x\ny"');
    expect(csvField(null)).toBe('');
    expect(csvField(12)).toBe('12');
  });
  it('defuses spreadsheet formulas but not negative numbers', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField(-5)).toBe('-5');
  });
  it('joins rows with CRLF', () => expect(toCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"'));
});
