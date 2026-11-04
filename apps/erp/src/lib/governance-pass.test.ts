import { describe, expect, it } from 'vitest';
import { ackPct, agendaLines, deadlineTone, meetingsPct, minutesTone, versionTone } from './governance-pass';
import { sectionOf } from './access';

describe('governance pages', () => {
  it('reads an agenda typed one item a line, dropping blanks and numbering', () => {
    expect(agendaLines('1. Confirm the last minutes\n\n2) Awareness week\n  - \n3- Case status\nX')).toEqual(['Confirm the last minutes', 'Awareness week', 'Case status']);
    expect(agendaLines(Array.from({ length: 50 }, (_, i) => `Item ${i}`).join('\n'))).toHaveLength(40);
  });

  it('shows meetings held against what is due so far, and acknowledgement as a share', () => {
    expect(meetingsPct(1, 2)).toBe(50);
    expect(meetingsPct(3, 2)).toBe(100);
    expect(meetingsPct(0, 0)).toBe(100);
    expect(ackPct(2, 4)).toBe(50);
    expect(ackPct(1, 3)).toBe(33);
    expect(ackPct(0, 0)).toBeNull();
  });

  it('colours states the same way everywhere', () => {
    expect(deadlineTone('overdue')).toBe('danger');
    expect(deadlineTone('due_soon')).toBe('warning');
    expect(minutesTone('approved')).toBe('success');
    expect(versionTone('in_review')).toBe('warning');
  });

  it('lets every member of staff open their own governance page and the meetings they sign, and only leaders the rest', () => {
    expect(sectionOf('/governance/mine')).toBe('myGovernance');
    expect(sectionOf('/governance/meetings/0b6c1c1e-1111-4222-8333-944444444444')).toBe('myGovernance');
    expect(sectionOf('/governance/committees')).toBe('governance');
    expect(sectionOf('/governance')).toBe('governance');
  });
});
