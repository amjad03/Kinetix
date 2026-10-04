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
  /** Viewer → server: start watching a board (ack: {@link LiveWatchAck}). */
  LiveWatch: 'live.watch',
  /** Viewer → server: stop watching. */
  LiveUnwatch: 'live.unwatch',
  /** Server → board: how many people are watching (0 = stop streaming). */
  LiveViewers: 'live.viewers',
  /** Server → board: send a full snapshot (a viewer joined). */
  LiveSnapshotRequest: 'live.snapshot.request',
  /** Board → server → viewers: lesson events, optionally preceded by a snapshot. */
  LiveFrame: 'live.frame',
  /** Server → viewers: the board went offline or its class ended. */
  LiveEnded: 'live.ended',
  /** Board → server → viewers: whether the teacher has class audio on ({@link LiveAudioState}). */
  LiveAudioState: 'live.audio.state',
  /** Board → server → listeners: a short piece of class audio ({@link LiveAudioChunk}). */
  LiveAudio: 'live.audio',
  /** Server → users in the conversation: a new message ({@link MessageNewEvent}); refetch it. */
  MessageNew: 'message.new',
} as const;

export interface MessageNewEvent {
  conversationId: string;
  messageId: string;
  senderId: string;
}

/**
 * Server → board. `count` = everyone watching (stream while > 0); `leaders` look in on the
 * class (show "being viewed" when `indicator`, an institution setting); `students` joined a
 * class the teacher took live.
 */
export interface LiveViewersEvent {
  count: number;
  leaders: number;
  students: number;
  indicator: boolean;
  /** Viewers who may hear class audio (students always; leaders when the institution allows). */
  listeners: number;
}

/** Board → server: `{on}`; server → viewers: `{deviceId, on}` (also in the watch ack). */
export interface LiveAudioState {
  deviceId?: string;
  on: boolean;
}

/**
 * Class audio, about 200 ms per chunk: mono 16 kHz IMA ADPCM (4 bits a sample, 8 KB/s).
 * `data` is base64 of a 4-byte header (predictor as int16 little-endian, step index, 0) and
 * then two samples per byte, low nibble first, so each chunk decodes on its own and a lost
 * chunk is only a short gap. `seq` counts up from 0 for each time audio is turned on.
 */
export interface LiveAudioChunk {
  deviceId?: string;
  seq: number;
  rate: 16000;
  codec: 'ima-adpcm';
  data: string;
}

/**
 * Board → viewers. `events` use the lesson-recording format (packages/kinetix_ink lesson.dart),
 * with times relative to the start of the stream; a frame with `snapshot` resets the viewer.
 */
export interface LiveFrameEvent {
  deviceId?: string;
  snapshot?: { canvas: { w: number; h: number }; background: string; events: unknown[][] };
  events: unknown[][];
}

export interface LiveWatchAck {
  ok: boolean;
  error?: string;
  session?: { teacher: string; section: string | null; subject: string | null; startedAt: string };
  /** Whether this viewer may hear class audio, and whether the teacher has it on now. */
  audio?: { allowed: boolean; on: boolean };
}

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

// ---------------------------------------------------------------------------------------------
// Teacher App
// ---------------------------------------------------------------------------------------------

export type RoleName = 'tenant_admin' | 'principal' | 'hod' | 'teacher' | 'student' | 'guardian' | 'librarian' | 'accountant';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

/** GET /v1/me */
export interface MeResponse {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  preferredLanguage: Language;
  roles: RoleName[];
  tenant: { name: string; slug: string };
}

export interface TeacherPeriod {
  slotId: string;
  startsAt: string;
  endsAt: string;
  section: { id: string; displayName: string };
  subject: { id: string; code: string; name: string };
  room: { id: string; name: string } | null;
  /** The period is in progress right now (only ever true on today's date). */
  isNow: boolean;
  /** Attendance has been recorded for this period on this date. */
  attendanceTaken: boolean;
}

/** GET /v1/teacher/timetable?date=YYYY-MM-DD */
export interface TeacherTimetableResponse {
  date: string;
  /** Today in the tenant timezone. */
  today: string;
  /** ISO weekday of `date`, 1 = Monday … 7 = Sunday. */
  isoWeekday: number;
  periods: TeacherPeriod[];
  /** The next date after `date` (within a week) on which the teacher has periods, or null. */
  nextTeachingDate: string | null;
  /** Set when a holiday cancels the day's classes (periods is then empty, or holds only programs not on holiday). */
  holiday?: { title: string } | null;
}

/** GET /v1/teacher/classes: the section + subject pairs a teacher is timetabled for. */
export interface TeacherClass {
  section: { id: string; displayName: string };
  subject: { id: string; code: string; name: string };
}

export interface RosterStudent {
  id: string;
  rollNo: string;
  fullName: string;
}

export type AttendanceCounts = Record<AttendanceStatus, number>;

/** POST /v1/attendance */
export interface SubmitAttendanceRequest {
  slotId: string;
  date: string;
  records: { studentId: string; status: AttendanceStatus }[];
}

/** GET /v1/attendance?slotId&date */
export interface AttendanceSheet {
  slotId: string;
  date: string;
  taken: boolean;
  records: { studentId: string; status: AttendanceStatus }[];
  counts: AttendanceCounts;
}

/** GET /v1/teacher/session */
export interface ActiveBoardSession {
  active: { board: { id: string; name: string }; session: SessionContext } | null;
}

export interface Homework {
  id: string;
  title: string;
  instructions: string;
  dueOn: string;
  createdAt: string;
  section: { id: string; displayName: string };
  subject: { id: string; code: string; name: string };
  createdBy: { id: string; fullName: string };
  boardSessionId: string | null;
}

/** POST /v1/homework */
export interface CreateHomeworkRequest {
  sectionId: string;
  subjectId: string;
  title: string;
  instructions?: string;
  dueOn: string;
  boardSessionId?: string;
}
