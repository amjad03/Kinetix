// Shapes from the student-life extras, survey series, evidence, retention, parent visibility, communication and
// approval-routed endpoints (services/api), and the small rules the screens use.

import { parseQuestions, type NewQuestion } from './work';

// ---- files sent as base64 inside a JSON body ----------------------------------------------------------

/** File types the small evidence and attachment uploads accept (common/blob.ts). */
export const BLOB_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
] as const;
/** The event gallery takes pictures and short videos only. */
export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'video/mp4'] as const;
/** Files here can be up to 4 MB. */
export const MAX_FILE_BYTES = 4_000_000;

export interface PickedFile {
  filename: string;
  contentType: string;
  contentBase64: string;
}

/** Why a chosen file cannot be sent, or null when it can. */
export function fileProblem(f: { name: string; type: string; size: number }, allowed: readonly string[] = BLOB_TYPES): 'empty' | 'size' | 'type' | null {
  if (f.size <= 0) return 'empty';
  if (f.size > MAX_FILE_BYTES) return 'size';
  return allowed.includes(f.type) ? null : 'type';
}

/** The base64 part of a `data:` URL. */
export const dataUrlBase64 = (url: string): string => url.slice(url.indexOf(',') + 1);

/** "1.5 MB", "320 KB", "12 B". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

/** Reads a chosen file into the shape the API takes. Runs in the browser only. */
export function readPicked(file: File): Promise<PickedFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ filename: file.name, contentType: file.type, contentBase64: dataUrlBase64(String(r.result)) });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Where a file is fetched through the app (the session token stays in its cookie). */
export const downloadPath = (kind: string, id: string, extra: Record<string, string> = {}): string => `/api/download?${new URLSearchParams({ kind, id, ...extra })}`;

// ---- campus life ------------------------------------------------------------------------------------------

export interface OfficeBearer { id: string; post: string; studentId: string; fullName: string; fromOn: string; toOn: string | null; active: boolean }
export const ACHIEVEMENT_LEVELS = ['institutional', 'district', 'state', 'national', 'international'] as const;
export type AchievementLevel = (typeof ACHIEVEMENT_LEVELS)[number];
export interface Participant { studentId?: string; name: string }
export interface ClubAchievement { id: string; title: string; level: AchievementLevel; position: string; achievedOn: string; participants: Participant[]; description: string }
export interface AchievementLogRow { id: string; club: string; title: string; level: AchievementLevel; position: string; achievedOn: string; participants: Participant[] }
export const EVIDENCE_KINDS = ['photo', 'document', 'attendance', 'other'] as const;
export interface EvidenceRow { id: string; title: string; kind: (typeof EVIDENCE_KINDS)[number]; meetingId: string | null; url: string | null; contentType: string | null; sizeBytes: number | null; createdAt: string }
export interface MediaRow { id: string; caption: string; kind: 'photo' | 'video'; url: string | null; contentType: string | null; approved: boolean; createdAt: string }
export interface CertificateResult { issued: number; alreadyHad: number }

/**
 * One participant per line: `Asha Rao`. A name that matches a club member (by name, or `name (roll)`) is linked to
 * that student. Returns the first line that is empty-looking or the 31st person.
 */
export function parseParticipants(text: string, roster: { studentId: string; fullName: string; rollNo: string }[]): { ok: true; participants: Participant[] } | { ok: false; line: number } {
  const out: Participant[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i].trim();
    if (!name) continue;
    if (name.length > 120 || out.length >= 30) return { ok: false, line: i + 1 };
    const key = name.toLowerCase();
    const hit = roster.find((m) => m.fullName.toLowerCase() === key || `${m.fullName} (${m.rollNo})`.toLowerCase() === key);
    out.push(hit ? { studentId: hit.studentId, name: hit.fullName } : { name });
  }
  return { ok: true, participants: out };
}

// ---- surveys ----------------------------------------------------------------------------------------------

export const SHOW_IF_OPS = ['eq', 'neq', 'gte', 'lte', 'includes'] as const;
export type ShowIfOp = (typeof SHOW_IF_OPS)[number];
export interface ShowIfIn { ord: number; op: ShowIfOp; value: string | number }
export type SurveyQuestionIn = NewQuestion & { showIf?: ShowIfIn };

const SHOW_IF = /\s+@if\s+(\d+)\s+(eq|neq|gte|lte|includes)\s+(.+?)\s*$/i;

/**
 * Reads the question box like `parseQuestions`, and also a condition at the end of a line: `text: Why? @if 1 eq Slow`
 * shows that question only when question 1 was answered Slow. `gte` and `lte` compare ratings (a number); the
 * condition must point at an earlier question.
 */
export function parseSurveyQuestions(input: string): { ok: true; questions: SurveyQuestionIn[] } | { ok: false; line: number } {
  const questions: SurveyQuestionIn[] = [];
  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const cond = SHOW_IF.exec(raw);
    const one = parseQuestions(cond ? raw.slice(0, cond.index) : raw);
    if (!one.ok) return { ok: false, line: i + 1 };
    const q: SurveyQuestionIn = one.questions[0];
    if (cond) {
      const ord = Number(cond[1]);
      const op = cond[2].toLowerCase() as ShowIfOp;
      const numeric = /^-?\d+(\.\d+)?$/.test(cond[3]);
      if (ord < 1 || ord > questions.length) return { ok: false, line: i + 1 };
      if ((op === 'gte' || op === 'lte') && !numeric) return { ok: false, line: i + 1 };
      q.showIf = { ord, op, value: op === 'gte' || op === 'lte' ? Number(cond[3]) : cond[3] };
    }
    questions.push(q);
  }
  return questions.length === 0 ? { ok: false, line: 1 } : { ok: true, questions };
}

export interface SeriesRow { key: string; title: string; cycles: number; closed: number; repeatEveryDays: number | null }
export interface TrendPoint { cycle: number; surveyId: string; answered: number; average: number | null; counts: { option: string; count: number }[] | null }
export interface SeriesTrend {
  series: string;
  cycles: { cycle: number; surveyId: string; title: string; status: string; opensAt: string | null; closedAt: string | null; responses: number }[];
  questions: { prompt: string; kind: string; points: TrendPoint[]; change: number | null }[];
}

/** The cell of a trend table: the average rating, or the most chosen option with its count. */
export function trendCell(p: TrendPoint | undefined): string {
  if (!p || p.answered === 0) return '-';
  if (p.average !== null) return String(p.average);
  const top = [...(p.counts ?? [])].sort((a, b) => b.count - a.count)[0];
  return top ? `${top.option} (${top.count})` : '-';
}

// ---- grievances and discipline ----------------------------------------------------------------------------

export interface GrievanceEvidence { id: string; title: string; contentType: string; sizeBytes: number; createdAt: string; mine: boolean; addedBy?: string }
export interface IncidentRow { id: string; studentId: string; fullName: string; rollNo: string; incidentOn: string; kind: string; severity: string; description: string; status: string }
export const WITNESS_ROLES = ['student', 'staff', 'external'] as const;
export interface Witness { id: string; name: string; role: (typeof WITNESS_ROLES)[number]; studentId: string | null; statement: string; createdAt: string }
export const CONTACT_METHODS = ['message', 'call', 'meeting', 'letter'] as const;
export interface ParentContact { id: string; method: (typeof CONTACT_METHODS)[number]; summary: string; meetingOn: string | null; acknowledgedAt: string | null; guardian: string | null; createdAt: string }

// ---- document vault ---------------------------------------------------------------------------------------

export interface VaultVersion { id: string; title: string; category: string; version: number; sizeBytes: number; contentType: string; visibility: 'staff' | 'owner'; createdAt: string; current: boolean; uploadedBy?: { id: string; fullName: string } }

// ---- data retention and parent visibility -----------------------------------------------------------------

export interface RetentionTarget { key: string; label: string; actions: string[]; usesCategory: boolean }
export interface RetentionRule { id: string; target: string; category: string; keepDays: number; action: 'archive' | 'delete'; active: boolean; lastRunAt: string | null; lastAffected: number | null }
export interface RetentionRules { targets: RetentionTarget[]; rules: RetentionRule[] }
export interface RetentionOutcome { ruleId: string; target: string; category: string; action: string; affected: number }
export interface ParentVisibilityRow { section: string; label: string; visible: boolean }
/** The API keeps rules for at least 30 days and at most ten years. */
export const KEEP_DAYS_MIN = 30;
export const KEEP_DAYS_MAX = 3650;

/** Whole days from the form, or null when it is not a whole number in range. */
export function keepDays(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= KEEP_DAYS_MIN && n <= KEEP_DAYS_MAX ? n : null;
}

// ---- communication ----------------------------------------------------------------------------------------

export const CHANNELS = ['in_app', 'sms', 'email', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];
export const LOCALES_OFFERED = ['en', 'hi', 'kn'] as const;
export const AUDIENCE_ROLES = ['student', 'guardian', 'teacher', 'hod', 'principal', 'tenant_admin', 'librarian', 'accountant', 'hostel_warden', 'transport_manager'] as const;

export interface MessageTemplate { id: string; key: string; channel: Channel; locale: 'en' | 'hi' | 'kn'; subject: string; body: string; dltTemplateId: string | null; active: boolean; placeholders: string[] }
export interface AudienceRow { id: string; name: string; rule: { roles?: string[]; sectionIds?: string[]; userIds?: string[] } }
export interface CampaignRow { id: string; title: string; channel: Channel; templateKey: string; audience: string; sendAt: string; status: string; recipients: number; sentCount: number; failedCount: number }
export interface CampaignDetail extends CampaignRow {
  delivery: Record<string, number>;
  failures: { userId: string; fullName: string; error: string | null; attempts: number; nextAttemptAt: string | null }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids separated by commas, spaces or lines. Returns the first that is not an id. */
export function parseIds(text: string): { ok: true; ids: string[] } | { ok: false; bad: string } {
  const ids = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const bad = ids.find((x) => !UUID.test(x));
  return bad ? { ok: false, bad } : { ok: true, ids: [...new Set(ids)] };
}

/** `name=Asha` lines to the values a template fills in. Returns the first line without an `=` or a name. */
export function parseVars(text: string): { ok: true; vars: Record<string, string> } | { ok: false; line: number } {
  const vars: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const at = raw.indexOf('=');
    const key = raw.slice(0, at).trim();
    if (at < 1 || !/^[A-Za-z0-9_.]{1,60}$/.test(key)) return { ok: false, line: i + 1 };
    vars[key] = raw.slice(at + 1).trim().slice(0, 300);
  }
  return { ok: true, vars };
}

/** The `{{name}}` marks a message uses. */
export const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];

/** The audience rule from the form, or null when it names nobody. */
export function audienceRule(roles: string[], sectionIds: string[], userIds: string[]): { roles?: string[]; sectionIds?: string[]; userIds?: string[] } | null {
  const rule = { ...(roles.length ? { roles } : {}), ...(sectionIds.length ? { sectionIds } : {}), ...(userIds.length ? { userIds } : {}) };
  return Object.keys(rule).length ? rule : null;
}

// ---- approval-routed flows --------------------------------------------------------------------------------

export interface BoundFlow { requestType: string; module: 'scholarships' | 'fee_refunds' | 'certificates' | 'admissions' | 'grievances' }
export const BOUND_FLOWS: BoundFlow[] = [
  { requestType: 'scholarship_award', module: 'scholarships' },
  { requestType: 'fee_refund', module: 'fee_refunds' },
  { requestType: 'certificate_issue', module: 'certificates' },
  { requestType: 'admission_fee_waiver', module: 'admissions' },
  { requestType: 'grievance_resolution', module: 'grievances' },
];
export const BOUND_TYPES = BOUND_FLOWS.map((f) => f.requestType);
/** Roles that can be named as the approver of a one-step flow. */
export const APPROVER_ROLES = ['principal', 'tenant_admin', 'hod', 'accountant', 'admissions_officer', 'grievance_officer', 'hr_manager'] as const;

export interface BoundStatus { id: string | null; status?: string; title?: string; decidedAt?: string | null; currentStep?: number }

/** Which of the five flows have an active definition. */
export function activeFlows(defs: { requestType: string; active: boolean }[]): Record<string, boolean> {
  return Object.fromEntries(BOUND_TYPES.map((t) => [t, defs.some((d) => d.requestType === t && d.active)]));
}

/** The one-step definition made by "Set up with one approver role". */
export function simpleFlowBody(requestType: string, name: string, role: string) {
  return { requestType, name: name.trim(), description: '', fields: [], steps: [{ name: 'Approval', approver: { kind: 'role' as const, role } }], active: true };
}
