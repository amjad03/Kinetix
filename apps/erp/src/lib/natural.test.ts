import { describe, expect, it } from 'vitest';
import { naturalCompare, naturalSortBy } from './natural';

describe('naturalCompare', () => {
  it('reads numbers as numbers', () => {
    expect(['Class 10', 'Class 2', 'Class 1', 'Class 12', 'Class 11'].sort(naturalCompare)).toEqual(['Class 1', 'Class 2', 'Class 10', 'Class 11', 'Class 12']);
    expect(naturalSortBy([{ k: 'Sem 8' }, { k: 'Sem 1' }, { k: 'Sem 3' }], (x) => x.k).map((x) => x.k)).toEqual(['Sem 1', 'Sem 3', 'Sem 8']);
    expect(['10B', '7B', '7A'].sort(naturalCompare)).toEqual(['7A', '7B', '10B']);
  });
});
