import { describe, expect, it } from 'vitest';
import { controlKey, endedKey, guestCookieValue, parseGuestCookie, parseSend } from './events';

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

describe('guest casting (board code)', () => {
  const token = (exp: number, deviceId = 'd1') => `castguest.${Buffer.from(JSON.stringify({ tenantId: 't', deviceId, guestId: 'g', name: 'Asha', exp })).toString('base64url')}.sig`;

  it('reads the guest cookie while its token lasts, for the board it was made for', () => {
    const g = { token: token(2000), deviceId: 'd1', board: 'Room 1 Board', name: 'Asha' };
    expect(parseGuestCookie(guestCookieValue(g), 1000)).toEqual(g);
    expect(parseGuestCookie(guestCookieValue(g), 3000)).toBeNull();
    expect(parseGuestCookie(guestCookieValue({ ...g, deviceId: 'other' }), 1000)).toBeNull();
    expect(parseGuestCookie('not-base64-json', 1000)).toBeNull();
    expect(parseGuestCookie(undefined)).toBeNull();
  });

  it('words the teacher muting, resuming and promoting a screen', () => {
    expect(controlKey('mute')).toBe('cast.status.muted');
    expect(controlKey('unmute')).toBe('cast.status.unmuted');
    expect(controlKey('promote')).toBe('cast.status.promoted');
    expect(controlKey('explode')).toBeNull();
  });
});
