import { describe, expect, it } from 'vitest';
import { apiListPath, bulkTarget, displayValue, exportHref, fieldValue, listSearch, optionLabel, readListState, sameView } from './records';

describe('list state in the URL', () => {
  it('reads search, filters, sort and page, ignoring what is malformed', () => {
    expect(readListState({ q: 'asha', 'f.section': 'abc', 'f.bad key': 'x', sort: 'name:desc', page: '3', pageSize: '50' })).toEqual({
      q: 'asha',
      filters: { section: 'abc' },
      sort: { id: 'name', dir: 'desc' },
      page: 3,
      pageSize: 50,
    });
    expect(readListState({ sort: 'drop table:asc', page: '-2', pageSize: '7' })).toEqual({ q: '', filters: {}, sort: null, page: 1, pageSize: 25 });
    expect(readListState(new URLSearchParams('sort=roll'), { pageSize: 100 })).toMatchObject({ sort: { id: 'roll', dir: 'asc' }, pageSize: 100 });
  });

  it('writes short URLs that read back the same', () => {
    const state = { q: 'sem 3', filters: { programme: 'p1', term: '' }, sort: { id: 'roll', dir: 'asc' as const }, page: 2, pageSize: 25 };
    const sp = listSearch(state, { tab: 'classes' });
    expect(sp.toString()).toBe('tab=classes&q=sem+3&sort=roll%3Aasc&f.programme=p1&page=2');
    expect(readListState(sp)).toEqual({ ...state, filters: { programme: 'p1' } });
    expect(listSearch({ page: 1, pageSize: 25 }).toString()).toBe('');
  });

  it('builds the API path, export links and bulk targets', () => {
    expect(apiListPath('students', { q: '', filters: {}, sort: null, page: 1, pageSize: 25 })).toBe('/v1/records/students?page=1&pageSize=25');
    expect(exportHref('students', { q: 'x', filters: { status: 'active' }, sort: null }, 'xlsx', { columns: ['rollNo', 'fullName'], ids: ['a', 'b'] })).toBe(
      '/api/records?q=x&f.status=active&entity=students&kind=export&format=xlsx&columns=rollNo%2CfullName&ids=a%2Cb',
    );
    const state = { q: '', filters: { status: 'active' }, sort: null };
    expect(bulkTarget({ ids: ['a'] }, state)).toEqual({ ids: ['a'] });
    expect(bulkTarget({ all: true, except: ['b'] }, state)).toEqual({ all: true, query: { q: undefined, filters: { status: 'active' }, sort: null }, except: ['b'] });
  });

  it('compares views ignoring defaults and empty filters', () => {
    expect(sameView({ q: '', filters: { a: '' }, density: 'comfortable', pageSize: 25 }, {})).toBe(true);
    expect(sameView({ sort: { id: 'name', dir: 'asc' } }, {})).toBe(false);
    expect(sameView({ filters: { a: '1', b: '2' } }, { filters: { b: '2', a: '1' } })).toBe(true);
  });
});

describe('values', () => {
  it('shows values and option labels', () => {
    expect(displayValue(null)).toBe('—');
    expect(displayValue(true)).toBe('✓');
    expect(displayValue(['a', 1])).toBe('a, 1');
    expect(optionLabel([{ value: 's1', label: 'BCom Sem 3 A' }], 's1')).toBe('BCom Sem 3 A');
    expect(optionLabel([], 's9')).toBe('s9');
  });

  it('turns form text into the value the API expects', () => {
    expect(fieldValue('number', '6')).toBe(6);
    expect(fieldValue('number', ' ')).toBeNull();
    expect(fieldValue('select', '')).toBeNull();
    expect(fieldValue('text', '')).toBe('');
    expect(fieldValue('boolean', 'true')).toBe(true);
  });
});
