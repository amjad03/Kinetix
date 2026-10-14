import { describe, expect, it } from 'vitest';
import { canSelectAllMatching, isEmpty, isSelected, NONE, pageState, pickRows, selectAllMatching, selectedCount, toggleRow, togglePage, toTarget } from './selection';
import { moveItem } from './table';

const page1 = ['a', 'b', 'c'];
const page2 = ['d', 'e'];

describe('row selection', () => {
  it('selects rows one by one and reports the page checkbox state', () => {
    let s = toggleRow(NONE, 'a', true);
    expect(isSelected(s, 'a')).toBe(true);
    expect(pageState(s, page1)).toBe('some');
    s = toggleRow(s, 'a', false);
    expect(pageState(s, page1)).toBe('none');
    expect(isEmpty(s, 5)).toBe(true);
    // Never mutates the selection it was given.
    expect(NONE.mode === 'ids' && NONE.ids.size).toBe(0);
  });

  it('selects a whole page and keeps rows chosen on other pages', () => {
    let s = togglePage(NONE, page1, true);
    expect(pageState(s, page1)).toBe('all');
    s = toggleRow(s, 'd', true);
    expect(selectedCount(s, 5)).toBe(4);
    s = togglePage(s, page1, false);
    expect(toTarget(s)).toEqual({ ids: ['d'] });
    expect(pageState(s, [])).toBe('none');
  });

  it('offers "select all matching" only when the page is full and more rows match', () => {
    const s = togglePage(NONE, page1, true);
    expect(canSelectAllMatching(s, page1, 5)).toBe(true);
    expect(canSelectAllMatching(s, page1, 3)).toBe(false);
    expect(canSelectAllMatching(toggleRow(s, 'b', false), page1, 5)).toBe(false);
    expect(canSelectAllMatching(selectAllMatching(), page1, 5)).toBe(false);
  });

  it('selects every matching row, then rows cleared are kept as exceptions', () => {
    let s = selectAllMatching();
    expect(selectedCount(s, 1200)).toBe(1200);
    expect(pageState(s, page2)).toBe('all');
    expect(isSelected(s, 'zzz-not-loaded')).toBe(true);
    s = toggleRow(s, 'b', false);
    s = togglePage(s, page2, false);
    expect(selectedCount(s, 1200)).toBe(1197);
    expect(pageState(s, page1)).toBe('some');
    expect(toTarget(s)).toEqual({ all: true, except: ['b', 'd', 'e'] });
    s = toggleRow(s, 'd', true);
    expect(toTarget(s)).toEqual({ all: true, except: ['b', 'e'] });
    expect(selectedCount(s, 2)).toBe(0); // never negative when the list shrank
  });

  it('picks the loaded rows that are selected', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickRows(toggleRow(NONE, 'b', true), rows, (r) => r.id)).toEqual([{ id: 'b' }]);
    expect(pickRows(toggleRow(selectAllMatching(), 'a', false), rows, (r) => r.id).map((r) => r.id)).toEqual(['b', 'c']);
  });
});

describe('moveItem', () => {
  it('moves an item up or down and clamps the target', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});
