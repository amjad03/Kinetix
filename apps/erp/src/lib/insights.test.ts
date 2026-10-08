import { describe, expect, it } from 'vitest';
import { accreditationPath, exportPath, isDay, parseRecipients, showCell } from './insights';

describe('insights helpers', () => {
  it('shows cells by kind', () => {
    expect(showCell({ key: 'a', label: 'A', kind: 'percent' }, 66.7)).toBe('66.7%');
    expect(showCell({ key: 'a', label: 'A', kind: 'money' }, 1_234_500)).toContain('12,345');
    expect(showCell({ key: 'a', label: 'A' }, null)).toBe('–');
    expect(showCell({ key: 'a', label: 'A' }, 0)).toBe('0');
  });

  it('builds export links the export route allows', () => {
    const p = decodeURIComponent(exportPath('fees.summary', 'csv', { from: '2026-04-01', to: '2026-04-30', by: undefined }).split('path=')[1]);
    expect(p).toBe('/v1/analytics/reports/fees.summary/export?format=csv&from=2026-04-01&to=2026-04-30');
    expect(decodeURIComponent(accreditationPath('naac').split('path=')[1])).toBe('/v1/analytics/accreditation/naac?format=zip');
  });

  it('parses recipients', () => {
    expect(parseRecipients('A@x.in, b@x.in;\n a@x.in  ')).toEqual(['a@x.in', 'b@x.in']);
    expect(parseRecipients('')).toEqual([]);
  });

  it('checks dates', () => {
    expect(isDay('2026-10-08')).toBe(true);
    expect(isDay('8/10/2026')).toBe(false);
    expect(isDay(undefined)).toBe(false);
  });
});
