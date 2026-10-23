// Screen sharing to the board: WebRTC, signalled over the realtime gateway (docs/architecture/screen-share-and-devices.md).

/** Most casts a board shows at once (a grid of 1, 2, 4, 6 or 9 tiles), pending ones included. */
export const MAX_CASTS_PER_BOARD = 9;

/** A guest joined from the browser /cast page with the board's join code (no account, no app). */
export type CastSenderRole = 'teacher' | 'student' | 'guest';
export type CastState = 'pending' | 'active' | 'ended';
export type CastEndReason = 'stopped' | 'declined' | 'class_ended' | 'sender_left' | 'board_left';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface CastRequestAck {
  ok: boolean;
  error?: string;
  code?: string;
  castId?: string;
  /** The class teacher casting their own screen needs no approval. */
  approved?: boolean;
  iceServers?: IceServer[];
}

export interface CastPendingEvent {
  castId: string;
  name: string;
  role: CastSenderRole;
}

export interface CastDecision {
  castId: string;
  approve: boolean;
}

export interface CastApprovedEvent {
  castId: string;
  iceServers: IceServer[];
}

/** An SDP or ICE candidate; the server relays it unread. */
export interface CastSignal {
  castId: string;
  data: { type: 'offer' | 'answer'; sdp: string } | { type: 'candidate'; candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
}

export interface CastEndedEvent {
  castId: string;
  reason: CastEndReason;
}

/** The board needs the ICE servers too when it starts receiving. */
export interface CastIceEvent {
  castId: string;
  name: string;
  role: CastSenderRole;
  iceServers: IceServer[];
}

/** The board's join code for guests: shown as text and as a QR of [url]. */
export interface CastJoinCode {
  code: string;
  expiresAt: string;
  /** The browser /cast page with the code filled in. */
  url: string;
}

/** Board → server → sender: the teacher paused (muted) or resumed a screen, or made it the presenter. */
export interface CastControlEvent {
  castId: string;
  action: 'mute' | 'unmute' | 'promote';
}
