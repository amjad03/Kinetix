import { describe, expect, it } from 'vitest';
import { endedKey, parseSend } from './events';

describe('cast relay messages', () => {
  it('maps why a cast ended to the status line', () => {
    expect(endedKey('declined')).toBe('cast.status.declined');
    expect(endedKey('class_ended')).toBe('cast.status.classEnded');
    expect(endedKey('stopped')).toBe('cast.status.stopped');
  });

  it('accepts offers, answers, candidates and stop; refuses anything else', () => {
    expect(parseSend({ conn: 'c1', kind: 'stop' })).toEqual({ conn: 'c1', kind: 'stop' });
    expect(parseSend({ conn: 'c1', kind: 'signal', data: { type: 'offer', sdp: 'v=0', extra: 1 } })).toEqual({ conn: 'c1', kind: 'signal', data: { type: 'offer', sdp: 'v=0' } });
    expect(parseSend({ conn: 'c1', kind: 'signal', data: { type: 'candidate', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } })).toEqual({
      conn: 'c1',
      kind: 'signal',
      data: { type: 'candidate', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
    });
    expect(parseSend({ conn: 'c1', kind: 'signal', data: { type: 'offer', sdp: 'x'.repeat(30_000) } })).toBeNull();
    expect(parseSend({ conn: 'c1', kind: 'signal', data: { type: 'bogus' } })).toBeNull();
    expect(parseSend({ kind: 'stop' })).toBeNull();
    expect(parseSend(null)).toBeNull();
  });
});
