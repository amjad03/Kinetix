import { describe, expect, it } from 'vitest';
import { dueState, nextStatuses, parseQuestions, percent } from './work';

describe('parseQuestions', () => {
  it('reads one question per line with options and optional markers', () => {
    const r = parseQuestions('single: How is the pace? | Slow; Right; Fast\n\nmultiple?: What helps? | Notes; Labs\nrating: Rate the course\ntext?: Any comments?');
    expect(r.ok && r.questions).toEqual([
      { kind: 'single', prompt: 'How is the pace?', options: ['Slow', 'Right', 'Fast'], required: true },
      { kind: 'multiple', prompt: 'What helps?', options: ['Notes', 'Labs'], required: false },
      { kind: 'rating', prompt: 'Rate the course', options: [], required: true },
      { kind: 'text', prompt: 'Any comments?', options: [], required: false },
    ]);
  });
  it('reports the first line it cannot read', () => {
    expect(parseQuestions('rating: Rate it\nwhat is this')).toEqual({ ok: false, line: 2 });
    expect(parseQuestions('single: Pick one | Only')).toEqual({ ok: false, line: 1 });
    expect(parseQuestions('rating: Rate it | 1; 2')).toEqual({ ok: false, line: 1 });
    expect(parseQuestions('  \n')).toEqual({ ok: false, line: 1 });
  });
});

describe('results and tasks', () => {
  it('rounds percentages and guards empty counts', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
  it('offers the right next statuses', () => {
    expect(nextStatuses('open')).toContain('in_progress');
    expect(nextStatuses('done')).toEqual(['open']);
  });
  it('tells overdue from soon', () => {
    const now = Date.parse('2026-10-20T04:30:00Z');
    expect(dueState({ status: 'open', dueAt: '2026-10-19T00:00:00Z' }, now)).toBe('overdue');
    expect(dueState({ status: 'open', dueAt: '2026-10-20T10:00:00Z' }, now)).toBe('soon');
    expect(dueState({ status: 'in_progress', dueAt: '2026-10-30T00:00:00Z' }, now)).toBe('ok');
    expect(dueState({ status: 'done', dueAt: '2026-10-19T00:00:00Z' }, now)).toBe('none');
    expect(dueState({ status: 'open', dueAt: null }, now)).toBe('none');
  });
});
