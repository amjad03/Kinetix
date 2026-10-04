// Live view contracts. Mirrors `RealtimeEvents.Live*`, `LiveFrameEvent` and `LiveWatchAck` in
// packages/shared/src/index.ts (Socket.IO namespace `/realtime`).

import type { LessonEvent, LiveSnapshot } from './player';

export const LiveEvents = {
  Watch: 'live.watch',
  Unwatch: 'live.unwatch',
  Frame: 'live.frame',
  Ended: 'live.ended',
} as const;

export interface LiveSession {
  teacher: string;
  section: string | null;
  subject: string | null;
  startedAt: string;
}

export interface LiveWatchAck {
  ok: boolean;
  error?: string;
  session?: LiveSession;
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
 * - `ended` / `refused`: final; the stream closes.
 */
export type StreamMessage =
  | { type: 'watching'; session: LiveSession | null }
  | { type: 'frame'; frame: LiveFrame }
  | { type: 'offline' }
  | { type: 'reconnecting' }
  | { type: 'ended'; reason: string }
  | { type: 'refused'; error: string; code: RefusalCode };

export type RefusalCode = 'turned_off' | 'no_class' | 'offline' | 'unknown_board' | 'expired' | 'forbidden' | 'unavailable' | 'other';

/** Turns the API's refusal text into a state the page can explain. */
export function refusalCode(error: string | undefined): RefusalCode {
  const e = (error ?? '').toLowerCase();
  if (e.includes('turned off')) return 'turned_off';
  if (e.includes('no class')) return 'no_class';
  if (e.includes('offline')) return 'offline';
  if (e.includes('unknown board')) return 'unknown_board';
  if (e.includes('only school leaders')) return 'forbidden';
  return 'other';
}

/** Why a class stopped streaming, in words (`live.ended` reasons). */
export function endedText(reason: string): string {
  switch (reason) {
    case 'class_ended':
    case 'teacher_ended':
    case 'period_over':
      return 'The class has ended.';
    case 'idle':
      return 'The board was idle, so the class was closed.';
    case 'taken_over':
      return 'Another teacher signed in on this board.';
    case 'admin_revoked':
      return 'The class was ended from the dashboard.';
    case 'offline':
      return 'The board went offline.';
    default:
      return 'The class has ended.';
  }
}
