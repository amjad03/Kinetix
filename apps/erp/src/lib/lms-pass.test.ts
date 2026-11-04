import { describe, expect, it } from 'vitest';
import { itemSource, liveState, riskCounts, rulesFor, settingsFromForm } from './lms-pass';

describe('lms pass helpers', () => {
  it('knows what each item kind points at and which completion rules it takes', () => {
    expect(itemSource('page')).toBe('body');
    expect(itemSource('pdf')).toBe('url');
    expect(itemSource('quiz')).toBe('ref');
    expect(rulesFor('scorm')[0]).toBe('pass');
    expect(rulesFor('page')).toEqual(['view', 'mark_done']);
  });

  it('places a live class in time: open from 15 minutes before the start until its end', () => {
    const s = { startsAt: '2026-11-09T10:30:00.000Z', durationMin: 45, status: 'scheduled' as const };
    expect(liveState(s, new Date('2026-11-09T10:10:00Z'))).toBe('upcoming');
    expect(liveState(s, new Date('2026-11-09T10:16:00Z'))).toBe('open');
    expect(liveState(s, new Date('2026-11-09T11:15:00Z'))).toBe('open');
    expect(liveState(s, new Date('2026-11-09T11:16:00Z'))).toBe('over');
    expect(liveState({ ...s, status: 'cancelled' }, new Date())).toBe('cancelled');
  });

  it('counts students by risk and reads the settings form back into typed values', () => {
    expect(riskCounts([{ level: 'high' }, { level: 'none' }, { level: 'high' }])).toEqual({ none: 1, low: 0, medium: 0, high: 2 });
    expect(settingsFromForm({ forumModeration: 'hold_students', forumEditMinutes: '20', atRiskInactiveDays: 'x', plagiarismAutoCheck: 'no', nonsense: '1' })).toEqual({ forumModeration: 'hold_students', forumEditMinutes: 20, plagiarismAutoCheck: false });
  });
});
