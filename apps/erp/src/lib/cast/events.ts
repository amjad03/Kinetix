// Screen sharing from a laptop: the page talks to this server (server-sent events down, POST up) and the server
// holds the realtime socket with the person's token, the same pattern as the live view. Mirrors
// `RealtimeEvents.Cast*` in packages/shared/src/cast.ts.

import type { MessageKey } from '@/i18n/messages';

export const CastEvents = {
  Request: 'cast.request',
  Approved: 'cast.approved',
  Signal: 'cast.signal',
  Stop: 'cast.stop',
  Ended: 'cast.ended',
  Control: 'cast.control',
} as const;

/** A guest's cast (joined with the board's code): kept in an httpOnly cookie, read by the page and the relay. */
export interface GuestCast {
  token: string;
  deviceId: string;
  board: string;
  name: string;
}

export const guestCookieValue = (g: GuestCast) => Buffer.from(JSON.stringify(g)).toString('base64url');

/** The guest cookie, or null when it is missing, malformed or its token has expired. */
export function parseGuestCookie(v: string | undefined, nowS = Date.now() / 1000): GuestCast | null {
  if (!v) return null;
  try {
    const g = JSON.parse(Buffer.from(v, 'base64url').toString('utf8')) as Partial<GuestCast>;
    if (typeof g.token !== 'string' || typeof g.deviceId !== 'string' || typeof g.board !== 'string' || typeof g.name !== 'string') return null;
    // The token (castguest.<payload>.<signature>) carries its expiry; the API checks the signature.
    const payload = JSON.parse(Buffer.from(g.token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number; deviceId?: string };
    if (typeof payload.exp !== 'number' || payload.exp <= nowS || payload.deviceId !== g.deviceId) return null;
    return g as GuestCast;
  } catch {
    return null;
  }
}

/** The status line when the teacher mutes, resumes or promotes the screen. */
export function controlKey(action: string): MessageKey | null {
  switch (action) {
    case 'mute':
      return 'cast.status.muted';
    case 'unmute':
      return 'cast.status.unmuted';
    case 'promote':
      return 'cast.status.promoted';
    default:
      return null;
  }
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export type CastSignalData = { type: 'offer' | 'answer'; sdp: string } | { type: 'candidate'; candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };

/** What the stream route sends the page. */
export type CastStreamMessage =
  | { t: 'conn'; conn: string }
  | { t: 'ack'; castId: string; approved: boolean; iceServers: IceServer[] }
  | { t: 'approved'; iceServers: IceServer[] }
  | { t: 'signal'; data: CastSignalData }
  | { t: 'ended'; reason: string }
  | { t: 'control'; action: string }
  | { t: 'refused'; error: string };

/** What the page posts to /api/cast/send. */
export type CastSend = { conn: string; kind: 'signal'; data: CastSignalData } | { conn: string; kind: 'stop' };

/** The status line for the end of a cast. */
export function endedKey(reason: string): MessageKey {
  switch (reason) {
    case 'declined':
      return 'cast.status.declined';
    case 'class_ended':
    case 'board_left':
      return 'cast.status.classEnded';
    default:
      return 'cast.status.stopped';
  }
}

/** Checks a POST body from the page before it is relayed (the API validates again). */
export function parseSend(v: unknown): CastSend | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  if (typeof b.conn !== 'string' || b.conn.length > 64) return null;
  if (b.kind === 'stop') return { conn: b.conn, kind: 'stop' };
  if (b.kind !== 'signal' || !b.data || typeof b.data !== 'object') return null;
  const d = b.data as Record<string, unknown>;
  if ((d.type === 'offer' || d.type === 'answer') && typeof d.sdp === 'string' && d.sdp.length <= 24_000) return { conn: b.conn, kind: 'signal', data: { type: d.type, sdp: d.sdp } };
  if (d.type === 'candidate' && typeof d.candidate === 'string' && d.candidate.length <= 2000) {
    return {
      conn: b.conn,
      kind: 'signal',
      data: { type: 'candidate', candidate: d.candidate, sdpMid: typeof d.sdpMid === 'string' ? d.sdpMid : null, sdpMLineIndex: typeof d.sdpMLineIndex === 'number' ? d.sdpMLineIndex : null },
    };
  }
  return null;
}
