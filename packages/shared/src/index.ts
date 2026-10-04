/**
 * Contracts shared by KINETIX TypeScript services and mirrored by the Dart clients.
 * Realtime events travel over Socket.IO on the `/realtime` namespace.
 */

export const RealtimeEvents = {
  /** Server → board: a teacher claimed this board's pairing code. */
  PairingClaimed: 'pairing.claimed',
  /** Server → board: the board session ended remotely (teacher app, admin, takeover). */
  SessionEnded: 'session.ended',
  /** Server → board: a new announcement to show. */
  BroadcastNew: 'broadcast.new',
  /** Server → board: an emergency or other broadcast was cleared by the sender. */
  BroadcastCleared: 'broadcast.cleared',
} as const;

export type Language = 'en' | 'hi' | 'kn';
export type BroadcastPriority = 'info' | 'important' | 'emergency';
export type SessionEndReason = 'teacher_ended' | 'period_over' | 'idle' | 'taken_over' | 'admin_revoked';

export interface SessionContext {
  sessionId: string;
  expiresAt: string;
  teacher: { id: string; fullName: string; preferredLanguage: Language };
  section: { id: string; displayName: string } | null;
  subject: { id: string; code: string; name: string } | null;
  period: { slotId: string; startsAt: string; endsAt: string } | null;
}

export interface PairingClaimedEvent {
  sessionToken: string;
  session: SessionContext;
}

export interface SessionEndedEvent {
  sessionId: string;
  reason: SessionEndReason;
}

export interface BroadcastMessage {
  id: string;
  title: string;
  body: string;
  priority: BroadcastPriority;
  requiresAck: boolean;
  sender: { id: string; fullName: string };
  createdAt: string;
  expiresAt: string;
}

/** Operations a client can push through the sync outbox. */
export type SyncOperation =
  | SyncOp<'attendance.marked', { studentId: string; status: 'present' | 'absent' | 'late' | 'excused' }>
  | SyncOp<
      'participation.recorded',
      { studentId: string; outcome: 'correct' | 'partial' | 'incorrect' | 'skipped'; topicCode?: string; note?: string }
    >;

export interface SyncOp<T extends string, P> {
  opId: string;
  type: T;
  occurredAt: string;
  payload: P;
}

export type SyncOpResult =
  | { opId: string; status: 'applied' }
  | { opId: string; status: 'duplicate' }
  | { opId: string; status: 'rejected'; reason: string };
