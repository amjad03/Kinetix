import { describe, expect, it } from 'vitest';
import { formatSeries, parsePresets, savePreset } from './templates';

describe('module templates', () => {
  it('formats a numbering series with the financial year', () => {
    expect(formatSeries({ prefix: 'RCPT/{FY}/', next: 42, pad: 5 }, new Date(2026, 9, 13))).toBe('RCPT/2026-27/00042');
    expect(formatSeries({ prefix: 'PO-{YY}-', next: 7, pad: 3, suffix: '-A' }, new Date(2027, 1, 1))).toBe('PO-27-007-A');
  });

  it('saves presets by name, newest first, and reads bad storage as empty', () => {
    let list = savePreset([], { name: 'Class 7', query: 'class=7' });
    list = savePreset(list, { name: 'This month', query: 'from=2026-10-01' });
    list = savePreset(list, { name: 'class 7', query: 'class=7&sec=A' });
    expect(list.map((p) => p.query)).toEqual(['class=7&sec=A', 'from=2026-10-01']);
    expect(parsePresets('nope')).toEqual([]);
    expect(parsePresets(JSON.stringify(list))).toHaveLength(2);
  });
});
