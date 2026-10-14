import { describe, expect, it } from 'vitest';
import { buildOverrides, getPath, groupCatalogue, showValue, type CatalogueProfile } from './affiliation';

const preset = { attendance: { minPercent: 85, condonableToPercent: 75 }, pass: { minExternalPercent: 35, minInternalPercent: 40, minTotalPercent: 40, minAggregatePercent: null }, grace: { enabled: false, maxPerSubject: 0, maxTotal: 0 }, gpa: { decimals: 2, rounding: 'half_up' }, revaluation: { windowDays: null }, classification: { minForAward: 5 } };

describe('affiliation overrides form', () => {
  it('keeps only the values that differ from the preset', () => {
    const r = buildOverrides(preset, { 'attendance.minPercent': '80', 'attendance.condonableToPercent': '75', 'gpa.rounding': 'truncate', 'grace.enabled': 'false', 'revaluation.windowDays': '' });
    expect(r).toEqual({ ok: true, overrides: { attendance: { minPercent: 80 }, gpa: { rounding: 'truncate' } } });
  });

  it('clears an optional value with an empty field and refuses bad numbers', () => {
    expect(buildOverrides(preset, { 'attendance.condonableToPercent': '' })).toEqual({ ok: true, overrides: { attendance: { condonableToPercent: null } } });
    expect(buildOverrides(preset, { 'attendance.minPercent': '', 'pass.minTotalPercent': '140', 'grace.maxTotal': 'x' })).toEqual({ ok: false, bad: ['attendance.minPercent', 'pass.minTotalPercent', 'grace.maxTotal'] });
  });

  it('reads paths and shows values', () => {
    expect(getPath(preset, 'pass.minExternalPercent')).toBe(35);
    expect(getPath(preset, 'nope.x')).toBeUndefined();
    expect(showValue(null)).toBe('—');
    expect(showValue([{ label: 'First Class', min: 6 }])).toBe('First Class 6');
  });

  it('groups the catalogue: universities, then boards, then frameworks', () => {
    const p = (code: string, kind: CatalogueProfile['kind'], name: string): CatalogueProfile => ({ code, kind, name, shortName: code, category: '', headquarters: null, website: null, jurisdiction: '', defaultScheme: 'x', schemes: [] });
    const g = groupCatalogue([p('cbse', 'board', 'CBSE'), p('vtu', 'university', 'VTU'), p('ugc', 'framework', 'UGC'), p('bu', 'university', 'Bangalore University')]);
    expect(g.map((x) => [x.kind, x.profiles.map((y) => y.code)])).toEqual([
      ['university', ['bu', 'vtu']],
      ['board', ['cbse']],
      ['framework', ['ugc']],
    ]);
  });
});
