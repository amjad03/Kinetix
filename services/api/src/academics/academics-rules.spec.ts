import { describe, expect, it } from 'vitest';
import { canDecideStep, decide, formatSeries, initialSteps, isShort, nextRoll, pct, SETTINGS_DEFAULTS, settingsProblem } from './academics-rules.js';

describe('academics rules', () => {
  it('formats numbering series with the Indian financial year', () => {
    expect(formatSeries({ prefix: 'TC/{FY}/', next: 42, pad: 4, suffix: '' }, new Date('2026-10-13'))).toBe('TC/2026-27/0042');
    expect(formatSeries({ prefix: 'TC/{FY}/', next: 1, pad: 3, suffix: '-{YY}' }, new Date('2027-02-01'))).toBe('TC/2026-27/001-27');
  });

  it('gives the next free roll number in a class', () => {
    expect(nextRoll(['01', '02', '07'], { prefix: '', next: 1, pad: 2, suffix: '' })).toBe('08');
    expect(nextRoll([], { prefix: 'R', next: 5, pad: 3, suffix: '' })).toBe('R005');
  });

  it('walks a request through its steps and stops on rejection', () => {
    let steps = initialSteps('withdrawal');
    expect(steps.map((s) => s.state)).toEqual(['current', 'upcoming', 'upcoming']);
    expect(canDecideStep('withdrawal', steps, ['librarian'])).toBe(false);
    expect(canDecideStep('withdrawal', steps, ['accountant'])).toBe(true);
    const actor = { id: 'u', name: 'A', at: '2026-10-13T00:00:00Z' };
    let r = decide(steps, 'approve', actor);
    expect(r.status).toBe('pending');
    steps = r.steps;
    expect(canDecideStep('withdrawal', steps, ['librarian'])).toBe(true);
    expect(() => decide(steps, 'reject', actor)).toThrow();
    r = decide(steps, 'reject', { ...actor, note: 'Books not returned' });
    expect(r.status).toBe('rejected');
    expect(r.steps.map((s) => s.state)).toEqual(['done', 'rejected', 'skipped']);
    const one = decide(initialSteps('substitution'), 'approve', actor);
    expect(one.status).toBe('approved');
  });

  it('checks settings for consistency', () => {
    expect(settingsProblem('assessment', SETTINGS_DEFAULTS.assessment)).toBeNull();
    expect(settingsProblem('assessment', { ...SETTINGS_DEFAULTS.assessment, components: [{ code: 'A', name: 'A', weight: 60, maxMarks: 10 }] })).toMatch(/100/);
    expect(settingsProblem('attendance', { ...SETTINGS_DEFAULTS.attendance, warnPercent: 70 })).toMatch(/warning/);
    expect(settingsProblem('registration', { ...SETTINGS_DEFAULTS.registration, minCredits: 30 })).toMatch(/Minimum/);
  });

  it('computes attendance shortage after condonation', () => {
    expect(pct(3, 4)).toBe(75);
    expect(pct(0, 0)).toBeNull();
    expect(isShort(70, 0, 75)).toBe(true);
    expect(isShort(70, 5, 75)).toBe(false);
    expect(isShort(null, 0, 75)).toBe(false);
  });
});
