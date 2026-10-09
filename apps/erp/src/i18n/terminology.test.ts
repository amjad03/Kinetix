import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { applyTerminology } from './terminology';

describe('institution wording', () => {
  it('renames a known string and leaves the rest alone', () => {
    const out = applyTerminology(MESSAGES.en, { 'nav.classes': 'Sections' });
    expect(out['nav.classes']).toBe('Sections');
    expect(out['nav.calendar']).toBe(MESSAGES.en['nav.calendar']);
    expect(MESSAGES.en['nav.classes']).toBe('Classes');
  });
  it('ignores unknown keys, blanks, very long text and wording that drops a placeholder', () => {
    const out = applyTerminology(MESSAGES.en, { 'nav.nope': 'x', 'nav.classes': '  ', 'nav.syllabus': 'y'.repeat(200), 'shell.hi': 'Welcome' });
    expect(out['nav.classes']).toBe('Classes');
    expect(out['nav.syllabus']).toBe(MESSAGES.en['nav.syllabus']);
    expect(out['shell.hi']).toBe('Hi, {name}');
    expect(applyTerminology(MESSAGES.en, { 'shell.hi': 'Welcome, {name}' })['shell.hi']).toBe('Welcome, {name}');
    expect('nav.nope' in out).toBe(false);
  });
  it('returns the same dictionary when there is nothing to change', () => {
    expect(applyTerminology(MESSAGES.hi, {})).toBe(MESSAGES.hi);
  });
});
