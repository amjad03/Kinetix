import { describe, expect, it } from 'vitest';
import { endedText, refusalCode } from './events';

describe('live refusals', () => {
  it('maps the API code first', () => {
    expect(refusalCode('whatever', 'LIVE_VIEW_OFF')).toBe('turned_off');
    expect(refusalCode(undefined, 'LIVE_NO_CLASS')).toBe('no_class');
    expect(refusalCode('', 'LIVE_BOARD_OFFLINE')).toBe('offline');
    expect(refusalCode('', 'LIVE_UNKNOWN_BOARD')).toBe('unknown_board');
    expect(refusalCode('', 'LIVE_NOT_ALLOWED')).toBe('forbidden');
  });

  it('falls back to the English message for older APIs', () => {
    expect(refusalCode('Live view is turned off for your institution')).toBe('turned_off');
    expect(refusalCode('No class is being taught on this board right now', 'BAD_REQUEST')).toBe('no_class');
    expect(refusalCode('Something else')).toBe('other');
  });

  it('words why a class ended as a dictionary key', () => {
    expect(endedText('idle')).toBe('live.end.idle');
    expect(endedText('period_over')).toBe('live.end.class');
  });
});
