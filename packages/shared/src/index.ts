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
  /** Server → students of the class: the teacher asked a question on the board ({@link PollView}). */
  PollOpened: 'poll.opened',
  /** Server → students of the class and the board: the question is closed ({@link PollClosedEvent}). */
  PollClosed: 'poll.closed',
  /** Server → board: someone answered; the new tally ({@link PollAnsweredEvent}). */
  PollAnswered: 'poll.answered',
  /** Teacher App → server: use the phone as a remote for this board ({@link RemoteAttachAck}). */
  RemoteAttach: 'remote.attach',
  /** Teacher App → server → board: one remote command ({@link RemoteCommand}). */
  RemoteCommand: 'remote.command',
  /** Board → server → the teacher of its class: what the board shows ({@link RemoteBoardState}). */
  RemoteState: 'remote.state',
  /** Server → the student and their guardians: a teacher awarded a badge ({@link BadgeAwardedEvent}). */
  BadgeAwarded: 'badge.awarded',
  /** Server → guardians, staff and the driver: the school bus moved ({@link TransportPositionEvent}). */
  TransportPosition: 'transport.position',
} as const;

// --- Class questions (polls) and answer cards ------------------------------------------------

/** `mcq`: options A, B, C… (answer = option index); `numeric`: a number typed in the Student App. */
export type PollKind = 'mcq' | 'numeric';
/** Answered in the Student App, or with a printed answer card held up and read by the board's camera. */
export type PollAnswerSource = 'app' | 'card';

/** A question asked on the board, as students see it. */
export interface PollView {
  id: string;
  kind: PollKind;
  question: string;
  options: string[];
  openedAt: string;
  closedAt: string | null;
  subject: string | null;
  teacher: string;
  /** The student's own answer, when asked by a student. */
  myAnswer?: string | null;
}

/** Per option (MCQ) or per distinct value (numeric): how many answered it. */
export interface PollTally {
  answers: Record<string, number>;
  total: number;
  /** Students of the class (to show "18 of 32 answered"). */
  classSize: number;
}

export interface PollResults extends PollView {
  /** MCQ: option index as text; numeric: the value. Null when there is no right answer. */
  correct: string | null;
  tally: PollTally;
  responses: { studentId: string; rollNo: string; fullName: string; answer: string; source: PollAnswerSource; correct: boolean | null }[];
}

export interface PollAnsweredEvent {
  pollId: string;
  studentId: string;
  answer: string;
  source: PollAnswerSource;
  tally: PollTally;
}

export interface PollClosedEvent {
  pollId: string;
}

/** A class's printed answer cards: card n belongs to one student (bound by roll number). */
export interface AnswerCardSheet {
  section: { id: string; displayName: string };
  cards: { cardNo: number; studentId: string; rollNo: string; fullName: string }[];
}

// --- Phone remote ----------------------------------------------------------------------------

/**
 * Teacher App → board, through the server, only from the teacher whose class is open on the
 * board. `pointer` carries x and y as fractions of the board (0…1), or `hide: true`.
 */
export type RemoteCommand =
  | { type: 'page.next' | 'page.previous' | 'page.add' }
  | { type: 'slide.next' | 'slide.previous' }
  | { type: 'timer.start'; seconds: number }
  | { type: 'timer.stop' }
  | { type: 'picker.pick' }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'pointer.hide' }
  | { type: 'recording.start' | 'recording.stop' }
  | { type: 'photo.show'; photoId: string }
  /** Sent by the server when a phone attaches: the board answers with {@link RemoteBoardState}. */
  | { type: 'hello' };

export type RemoteCommandType = RemoteCommand['type'];

export interface RemoteAttachAck {
  ok: boolean;
  error?: string;
  code?: string;
  board?: { id: string; name: string };
}

/** Board → its teacher's phone: enough to draw the remote's buttons. */
export interface RemoteBoardState {
  deviceId?: string;
  page: number;
  pages: number;
  recording: boolean;
  timerRunning: boolean;
  /** Slides or a PDF open in the toolkit: current slide and how many. */
  slide?: { index: number; count: number } | null;
}

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
  /** Stable code for the error (services/api/src/common/error-codes.ts), for translation. */
  code?: string;
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
  /**
   * The class open on the board. `term` is the grade (K-12; 0 and -1 for UKG and LKG where a
   * school numbers them so) or the semester; `level` is the programme's level.
   */
  section: { id: string; displayName: string; term?: number; level?: 'k12' | 'ug' | 'pg' | 'diploma' | 'phd' } | null;
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

export type RoleName = 'tenant_admin' | 'principal' | 'hod' | 'teacher' | 'student' | 'guardian' | 'librarian' | 'accountant' | 'transport_manager' | 'driver' | 'hostel_warden' | 'canteen_manager' | 'store_keeper' | 'admissions_officer' | 'hr_manager';
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
  /** Signed in with a temporary password: the user must choose a new one (POST /v1/me/password) before anything else. */
  mustChangePassword: boolean;
  /** False for phone-code-only accounts, which may set a first password without a current one. */
  hasPassword: boolean;
  /** Present (true) only for the KINETIX platform team, who look after the global library. */
  platformAdmin?: true;
  /** GET this (with the token) for the profile photo; null shows initials. Changes when the photo does. */
  photoUrl: string | null;
  /** Teachers: what they teach, as they wrote it on their profile. */
  teachingSubjects: string[];
}

/** PATCH /v1/me: any subset. The phone number is the phone-code sign-in, so the office changes it (not here). */
export interface UpdateMeRequest {
  preferredLanguage?: Language;
  fullName?: string;
  email?: string | null;
  /** Teachers only: what they teach, shown on their profile. */
  teachingSubjects?: string[];
}

/** The badges a teacher can award (names are translated in each app). */
export type BadgeKind =
  | 'dazzling_performer'
  | 'good_attempt'
  | 'aspiring_student'
  | 'obedient_student'
  | 'outstanding_speaker'
  | 'master_of_maths'
  | 'creative_mind'
  | 'young_scientist'
  | 'most_curious'
  | 'best_leader';

/** POST /v1/badges (the section's teachers, from the board or the Teacher App). */
export interface AwardBadgeRequest {
  studentId: string;
  sectionId: string;
  badge: BadgeKind;
  subjectId?: string;
  note?: string;
}

export interface BadgeView {
  id: string;
  studentId: string;
  badge: BadgeKind;
  awardedAt: string;
  awardedBy: { id: string; fullName: string };
  subject: { id: string; name: string } | null;
  note: string | null;
}

/** GET /v1/badges/students/:id: newest first, with a count per kind. */
export interface StudentBadges {
  studentId: string;
  badges: BadgeView[];
  counts: Partial<Record<BadgeKind, number>>;
}

export interface BadgeAwardedEvent {
  studentId: string;
  badge: BadgeView;
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
  /** A lesson plan is saved for this period on this date. */
  lessonPlanned?: boolean;
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
  /** The student's profile photo, when they have an account with one. */
  photoUrl?: string | null;
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

// ---------------------------------------------------------------------------------------------
// Concept videos (the KINETIX YouTube channel, linked to library topics by the platform team)
// ---------------------------------------------------------------------------------------------

/** A concept video: played with YouTube's embedded player (youtube-nocookie.com), never downloaded. */
/** Who linked a concept video: the KINETIX platform team (every institution), the institution's admin, or a teacher (their sections, or everyone once approved). */
export type ConceptVideoSource = 'platform' | 'institution' | 'teacher';
/** A teacher's video: none = for their sections only; pending / approved / rejected = asked to be shared institution-wide. */
export type ConceptVideoShareStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface ConceptVideo {
  id: string;
  source: ConceptVideoSource;
  topicId: string;
  youtubeVideoId: string;
  title: string;
  language: Language;
  durationSeconds: number | null;
  channelTitle: string | null;
  position: number;
}

/** What the admin and teacher screens manage: GET /v1/content/topics/:id/videos/mine, GET /v1/content/video-approvals. */
export interface ManagedConceptVideo extends ConceptVideo {
  shareStatus: ConceptVideoShareStatus;
  reviewReason: string | null;
  sectionIds: string[];
  sections: { id: string; displayName: string }[];
  createdBy: string | null;
  createdByName: string | null;
  topicTitle: string;
  createdAt: string;
}

/** GET /v1/content/video-counts?courseId=: the institution's own videos per topic of a course. */
export interface TopicVideoCount {
  topicId: string;
  institution: number;
  teacher: number;
  pending: number;
}

/** GET /v1/content/topics/:id/videos?lang=: the class's language first, then English, then the rest. */
export interface TopicConceptVideos {
  topicId: string;
  /** The language put first: `lang`, else the topic's course language. */
  language: Language;
  videos: ConceptVideo[];
}

/** Where a period's topic came from: the saved lesson plan, the year plan's week, or the next untaught syllabus topic. */
export type PeriodTopicSource = 'lesson_plan' | 'year_plan' | 'syllabus';

/** GET /v1/devices/me/concept-videos: the board's current (or next) period today and its topic's videos. */
export interface PeriodConceptVideos {
  period: {
    slotId: string;
    date: string;
    startsAt: string;
    endsAt: string;
    /** In progress now; false for the next period later today. */
    isNow: boolean;
    section: { id: string; displayName: string };
    subject: { id: string; name: string };
  } | null;
  source: PeriodTopicSource | null;
  topics: { id: string; title: string }[];
  language: Language;
  videos: (ConceptVideo & { topicTitle: string })[];
}

/** Platform team, GET /v1/platform/library: the global library and how many topics have videos. */
export interface PlatformLibraryCurriculum {
  code: string;
  name: string;
  level: string;
  courses: { id: string; code: string; title: string; term: number; language: Language; topics: number; topicsWithVideos: number; videos: number }[];
}

/** GET /v1/platform/library/courses/:id (global chapters and topics only). */
export interface PlatformCourseTree {
  id: string;
  curriculumCode: string;
  code: string;
  title: string;
  term: number;
  language: Language;
  chapters: { id: string; title: string; topics: { id: string; title: string; videos: number }[] }[];
}

/** POST /v1/platform/playlists/preview: a playlist's videos, each with a best-guess topic of the chapter. */
export interface PlaylistPreview {
  playlistId: string;
  chapter: { id: string; title: string };
  topics: { id: string; title: string }[];
  videos: { youtubeVideoId: string; title: string; position: number; durationSeconds: number | null; suggestedTopicId: string | null; alreadyOn: string[] }[];
}

// --- Transport ---------------------------------------------------------------------------------

/** A school bus position, fanned out to the families riding that route. */
export interface TransportPositionEvent {
  tripId: string;
  routeId: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  /** The stop the bus is heading to next (null after the last stop). */
  nextStop: { id: string; name: string; seq: number } | null;
  /** Minutes to the next stop at the bus's current pace. */
  etaMinutes: number | null;
  at: string;
}
export * from './admissions.js';
export * from './hr.js';
