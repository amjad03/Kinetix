// Shapes of the LMS pass endpoints (services/api/src/lms/lms-*.controller.ts) and small pure helpers for the screens.

export const ITEM_KINDS = ['page', 'video', 'file', 'pdf', 'ppt', 'link', 'scorm', 'quiz', 'live', 'topic', 'homework', 'assessment', 'worksheet', 'case_study', 'simulation', 'virtual_lab'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const COMPLETION_RULES = ['view', 'mark_done', 'pass'] as const;
export type CompletionRule = (typeof COMPLETION_RULES)[number];
export const RISK_REASONS = ['inactive', 'low_engagement', 'low_quiz', 'overdue', 'missed_live'] as const;
export type RiskReason = (typeof RISK_REASONS)[number];
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface Completion { total: number; done: number; pct: number; grade: number | null; eligible: boolean; missing: ('items' | 'grade')[] }

export interface LiveSession { id: string; title: string; startsAt: string; durationMin: number; joinUrl: string | null; provider: string; slotId: string | null; recordingUrl: string | null; status: 'scheduled' | 'cancelled'; attendanceMarkedAt: string | null; joined: number; open: boolean }
export interface LiveAttendance { sessionId: string; slotId: string | null; attendanceMarkedAt: string | null; lateAfterMin: number; rows: { id: string; fullName: string; rollNo: string; firstJoinedAt: string | null; joins: number; suggested: 'present' | 'late' | 'absent' }[] }

export interface RiskRow { id: string; fullName: string; rollNo: string; items: number; opened: number; completed: number; lastActiveAt: string | null; overdue: number; quizPct: number | null; liveHeld: number; liveJoined: number; reasons: RiskReason[]; level: RiskLevel; engagementPct: number }
export interface AtRisk { courseId: string; thresholds: { inactiveDays: number; engagementBelowPct: number; quizBelowPct: number; overdueCount: number }; atRisk: number; students: RiskRow[] }

export interface CertRow { id: string; fullName: string; rollNo: string; completion: Completion; certificate: { id: string; serial: string; issuedAt: string; revokedAt: string | null; verifyUrl: string } | null }
export interface CourseCerts { courseId: string; certificate: boolean; completionPct: number; minGradePct: number | null; rows: CertRow[] }

export interface QueueItem { id: string; title?: string; thread?: string; threadId?: string; body: string; held: boolean; hidden: boolean; createdAt: string; author: string; reports: number; reasons: { reason: string; note: string }[] }
export interface ForumQueue { threads: QueueItem[]; posts: QueueItem[] }

export interface LmsOverview { courses: number; published: number; items: number; active7: number; active30: number; completions: number; quizzes: number; attempts: number; flagged: number; threads30: number; posts30: number; openReports: number; live: number; liveJoins: number; certificates: number; packages: number; paths: number; itemsByKind: Record<string, number> }
export interface EvidenceRow { userId: string; name: string; courses: number; published: number; items: number; pages: number; videos: number; files: number; packages: number; quizzes: number; live: number; posts: number; learners: number; usesLms: boolean }
export interface Evidence { from: string | null; to: string | null; teachers: number; teachersUsingLms: number; pctTeachersUsingLms: number; rows: EvidenceRow[] }

export interface LearningPath { id: string; title: string; description: string; status: 'draft' | 'published' | 'archived'; certificate: boolean; program: string | null; section: string | null; steps: { courseId: string; title: string; required: boolean }[]; certificates: number }

export interface LmsSettings {
  forumModeration: 'open' | 'hold_students';
  forumAutoHideReports: number;
  forumEditMinutes: number;
  plagiarismAutoCheck: boolean;
  plagiarismThresholdPct: number;
  atRiskInactiveDays: number;
  atRiskEngagementBelowPct: number;
  atRiskQuizBelowPct: number;
  atRiskOverdueCount: number;
  liveLateAfterMin: number;
  certificateSelfClaim: boolean;
}
export const SETTING_NUMBERS = ['forumAutoHideReports', 'forumEditMinutes', 'plagiarismThresholdPct', 'atRiskInactiveDays', 'atRiskEngagementBelowPct', 'atRiskQuizBelowPct', 'atRiskOverdueCount', 'liveLateAfterMin'] as const;
export const SETTING_FLAGS = ['plagiarismAutoCheck', 'certificateSelfClaim'] as const;

/** Which content an item kind points at: written here, a web address, or a record of the class picked by id. */
export function itemSource(kind: ItemKind): 'body' | 'url' | 'ref' {
  if (kind === 'page') return 'body';
  if (['file', 'pdf', 'ppt', 'link', 'simulation', 'virtual_lab', 'case_study'].includes(kind)) return 'url';
  return 'ref';
}

/** The completion rules an item kind may take (a pass mark only for quizzes and packages). */
export const rulesFor = (kind: ItemKind): CompletionRule[] => (kind === 'quiz' || kind === 'scorm' ? ['pass', 'view', 'mark_done'] : ['view', 'mark_done']);

/** Where a live class stands now: upcoming, open to join (from 15 minutes before), over, or cancelled. */
export function liveState(s: Pick<LiveSession, 'startsAt' | 'durationMin' | 'status'>, now: Date): 'upcoming' | 'open' | 'over' | 'cancelled' {
  if (s.status === 'cancelled') return 'cancelled';
  const start = Date.parse(s.startsAt);
  if (now.getTime() < start - 15 * 60_000) return 'upcoming';
  if (now.getTime() <= start + s.durationMin * 60_000) return 'open';
  return 'over';
}

/** Students at risk first and counted by level. */
export function riskCounts(rows: Pick<RiskRow, 'level'>[]): Record<RiskLevel, number> {
  const out: Record<RiskLevel, number> = { none: 0, low: 0, medium: 0, high: 0 };
  for (const r of rows) out[r.level]++;
  return out;
}

/** The settings form's text values back to typed settings; a number outside the field's range is left out. */
export function settingsFromForm(v: Record<string, string>): Partial<LmsSettings> {
  const out: Record<string, unknown> = {};
  if (v.forumModeration === 'open' || v.forumModeration === 'hold_students') out.forumModeration = v.forumModeration;
  for (const k of SETTING_NUMBERS) if (v[k] !== undefined && v[k] !== '' && Number.isInteger(Number(v[k])) && Number(v[k]) >= 0) out[k] = Number(v[k]);
  for (const k of SETTING_FLAGS) if (v[k] === 'yes' || v[k] === 'no') out[k] = v[k] === 'yes';
  return out as Partial<LmsSettings>;
}
