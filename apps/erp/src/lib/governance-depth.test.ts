import { describe, expect, it } from 'vitest';
import { canSee, sectionOf } from './access';
import { densityFor } from './density';
import { rupees } from './governance';
import { groupHits, isQuestion } from './search';

describe('governance, billing and AI audit access', () => {
  it('opens each desk to the roles the API allows', () => {
    expect(canSee(['principal'], 'governance')).toBe(true);
    expect(canSee(['quality_officer'], 'governance')).toBe(true);
    expect(canSee(['teacher'], 'governance')).toBe(false);
    expect(canSee(['tenant_admin'], 'billing')).toBe(true);
    expect(canSee(['quality_officer'], 'billing')).toBe(false);
    expect(canSee(['quality_officer'], 'aiAudit')).toBe(true);
    expect(canSee(['hod'], 'integrity')).toBe(true);
    expect(canSee(['accountant'], 'integrity')).toBe(false);
  });
  it('maps the new pages to their sections', () => {
    expect(sectionOf('/governance/rules')).toBe('governance');
    expect(sectionOf('/billing')).toBe('billing');
    expect(sectionOf('/ai/audit')).toBe('aiAudit');
    expect(sectionOf('/ai/evals')).toBe('aiAudit');
    expect(sectionOf('/ai')).toBe('ai');
    expect(sectionOf('/integrity')).toBe('integrity');
  });
});

describe('display density', () => {
  it('defaults by institution kind and lets a person override', () => {
    expect(densityFor('school', undefined)).toBe('comfortable');
    expect(densityFor('college', undefined)).toBe('compact');
    expect(densityFor('university', undefined)).toBe('compact');
    expect(densityFor('school', 'compact')).toBe('compact');
    expect(densityFor('college', 'comfortable')).toBe('comfortable');
    expect(densityFor('college', 'nonsense')).toBe('compact');
  });
});

describe('search', () => {
  it('treats a sentence ending in a question mark, or starting with ask, as a question', () => {
    expect(isQuestion('students absent today?')).toBe(true);
    expect(isQuestion('ask fees overdue')).toBe(true);
    expect(isQuestion('Rahul')).toBe(false);
    expect(isQuestion('a?')).toBe(false);
  });
  it('groups the new kinds of result after the old ones', () => {
    const hit = (type: 'events' | 'students' | 'fees', score: number) => ({ type, id: `${type}${score}`, title: type, subtitle: '', url: '/x', score });
    expect(groupHits([hit('fees', 1), hit('events', 2), hit('students', 3)]).map((g) => g.type)).toEqual(['students', 'events', 'fees']);
  });
});

describe('money', () => {
  it('turns paise into whole rupees', () => {
    expect(rupees(150050)).toBe(1501);
  });
});

describe('report charts', () => {
  it('draws the first numeric column against the first column', async () => {
    const { chartOf } = await import('./govern');
    const data = { columns: [{ key: 'class', label: 'Class' }, { key: 'note', label: 'Note' }, { key: 'n', label: 'Students', kind: 'int' }], rows: [{ class: 'A', note: 'x', n: 30 }, { class: 'B', note: 'y', n: 45 }], truncated: false };
    expect(chartOf(data)).toEqual({ label: 'Class', measure: 'Students', bars: [{ name: 'A', value: 30 }, { name: 'B', value: 45 }] });
    expect(chartOf({ columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }], truncated: false })).toBeNull();
  });
});
