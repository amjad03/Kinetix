// Live view contracts. Mirrors `RealtimeEvents.Live*`, `LiveFrameEvent` and `LiveWatchAck` in
// packages/shared/src/index.ts (Socket.IO namespace `/realtime`).

import type { MessageKey } from '@/i18n/messages';
import type { LessonEvent, LiveSnapshot } from './player';

export const LiveEvents = {
  Watch: 'live.watch',
  Unwatch: 'live.unwatch',
  Frame: 'live.frame',
  Ended: 'live.ended',
  AudioState: 'live.audio.state',
  Audio: 'live.audio',
} as const;

/** Whether this viewer may hear class audio, and whether the teacher has it on (`LiveWatchAck.audio`). */
export interface LiveAudioInfo {
  allowed: boolean;
  on: boolean;
}

/** `LiveAudioChunk`: about 200 ms of 16 kHz IMA ADPCM, base64. */
export interface LiveAudioChunk {
  deviceId?: string;
  seq: number;
  rate: number;
  codec: string;
  data: string;
}

export interface LiveSession {
  teacher: string;
  section: string | null;
  subject: string | null;
  startedAt: string;
}

export interface LiveWatchAck {
  ok: boolean;
  error?: string;
  /** Stable code for the refusal (LIVE_VIEW_OFF, LIVE_NO_CLASS, LIVE_BOARD_OFFLINE…). */
  code?: string;
  session?: LiveSession;
  audio?: LiveAudioInfo;
}

export interface LiveFrame {
  deviceId?: string;
  snapshot?: LiveSnapshot;
  events: LessonEvent[];
}

/**
 * What the ERP's stream route (`/api/live/:deviceId`, server-sent events) tells the page.
 * - `watching`: the API accepted; the session is attached.
 * - `frame`: ink from the board.
 * - `offline`: the board dropped off; frames resume (with a snapshot) when it reconnects.
 * - `reconnecting`: the ERP server lost KINETIX Cloud for a moment.
 * - `audio-state`: whether this viewer may hear class audio and whether the teacher's mic is on.
 * - `audio`: a chunk of class audio (only sent when allowed).
 * - `ended` / `refused`: final; the stream closes.
 */
export type StreamMessage =
  | { type: 'watching'; session: LiveSession | null }
  | { type: 'frame'; frame: LiveFrame }
  | { type: 'offline' }
  | { type: 'reconnecting' }
  | { type: 'audio-state'; audio: LiveAudioInfo }
  | { type: 'audio'; seq: number; data: string }
  | { type: 'ended'; reason: string }
  | { type: 'refused'; error: string; code: RefusalCode };

export type RefusalCode = 'turned_off' | 'no_class' | 'offline' | 'unknown_board' | 'expired' | 'forbidden' | 'unavailable' | 'other';

/** The API's stable live-watch codes (services/api/src/common/error-codes.ts). */
const BY_CODE: Record<string, RefusalCode> = {
  LIVE_VIEW_OFF: 'turned_off',
  LIVE_NO_CLASS: 'no_class',
  LIVE_NOT_STARTED: 'no_class',
  LIVE_BOARD_OFFLINE: 'offline',
  LIVE_UNKNOWN_BOARD: 'unknown_board',
  LIVE_NOT_ALLOWED: 'forbidden',
  LIVE_NOT_YOUR_CLASS: 'forbidden',
};

/** Turns the API's refusal (its `code`, else its English text) into a state the page can explain. */
export function refusalCode(error: string | undefined, code?: string): RefusalCode {
  if (code && BY_CODE[code]) return BY_CODE[code];
  const e = (error ?? '').toLowerCase();
  if (e.includes('turned off')) return 'turned_off';
  if (e.includes('no class')) return 'no_class';
  if (e.includes('offline')) return 'offline';
  if (e.includes('unknown board')) return 'unknown_board';
  if (e.includes('only school leaders')) return 'forbidden';
  return 'other';
}

/** Why a class stopped streaming (`live.ended` reasons), as a dictionary key. */
export function endedText(reason: string): MessageKey {
  switch (reason) {
    case 'idle':
      return 'live.end.idle';
    case 'taken_over':
      return 'live.end.taken_over';
    case 'admin_revoked':
      return 'live.end.admin_revoked';
    case 'offline':
      return 'live.end.offline';
    default:
      return 'live.end.class';
  }
}
