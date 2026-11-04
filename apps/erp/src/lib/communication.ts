// Communication: announcements (v1/announcements) and family chat (v1/conversations).

export type AnnChannel = 'boards' | 'teacher' | 'student' | 'parent';
export type AppChannel = Exclude<AnnChannel, 'boards'>;
export const CHANNELS: AnnChannel[] = ['boards', 'teacher', 'student', 'parent'];
export const APP_CHANNELS: AppChannel[] = ['teacher', 'student', 'parent'];
export type AnnStatus = 'draft' | 'scheduled' | 'sent' | 'recalled';
export type AudienceScope = 'all' | 'departments' | 'programs' | 'sections' | 'people' | 'roles' | 'hostels' | 'routes' | 'lists';
export type AnnPriority = 'normal' | 'important' | 'emergency';

export interface AnnAudience {
  scope: AudienceScope;
  roles?: string[];
  hostelIds?: string[];
  routeIds?: string[];
  listIds?: string[];
  departmentIds?: string[];
  programIds?: string[];
  sectionIds?: string[];
  userIds?: string[];
  studentIds?: string[];
}

export interface AnnAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface ChannelStats {
  recipients: number;
  delivered: number;
  read: number;
  acknowledged: number;
}

/** The notice in Hindi and Kannada. */
export type AnnTranslations = Partial<Record<'hi' | 'kn', { title: string; body: string }>>;
export interface AnnPoll {
  question: string;
  options: string[];
  closesAt: string | null;
  showResults: boolean;
}
export interface AnnPollTally extends AnnPoll {
  results: { option: string; votes: number; pct: number }[];
  voted: number;
  votedPct: number;
  closed: boolean;
}
export interface AnnExternal {
  templateId: string;
  templateKey: string | null;
  channel: string | null;
  fallback: string[];
  campaign: { id: string; status: string; recipients: number; sent: number; delivered: number; failed: number; suppressed: number; costPaise: number } | null;
}

/** What the composer offers beyond classes (GET /v1/announcements/audience-options). */
export interface AudienceOptions {
  roles: string[];
  hostels: { id: string; name: string }[];
  routes: { id: string; name: string }[];
  lists: { id: string; name: string }[];
  outsideTemplates: { id: string; key: string; channel: 'sms' | 'whatsapp' | 'email'; locale: string }[];
  canEmergency: boolean;
  scopes: AudienceScope[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: AnnPriority;
  /** Languages it was translated into (list), and the translations themselves (detail). */
  translated?: string[];
  translations?: AnnTranslations;
  hasPoll?: boolean;
  poll?: AnnPollTally | null;
  external?: AnnExternal | null;
  channels: AnnChannel[];
  audience: AnnAudience;
  requiresAck: boolean;
  status: AnnStatus;
  sendAt: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  recalledAt: string | null;
  lastRemindedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: { id: string; fullName: string };
  attachments: AnnAttachment[];
  /** Picked people and student records (audience scope "people"), with names. */
  audiencePeople: PickedPerson[];
  stats: ChannelStats & {
    deliveredPct: number;
    readPct: number;
    acknowledgedPct: number;
    byChannel: Record<AppChannel, ChannelStats>;
    boards: { boards: number; displayed: number; active: boolean } | null;
  };
}

export interface AnnRecipient {
  userId: string;
  fullName: string;
  phone: string | null;
  channel: AppChannel;
  detail: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  remindedAt: string | null;
}

export interface AnnTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  priority: 'normal' | 'important';
  requiresAck: boolean;
  channels: AnnChannel[];
  builtIn: boolean;
}

export interface AnnPreview {
  teacher: number;
  student: number;
  parent: number;
  boards: number;
  people: number;
}

export interface PickedPerson {
  id: string;
  fullName: string;
  /** staff | parent | student (a person) or record (a student record: their own account and guardians). */
  kind: 'staff' | 'parent' | 'student' | 'record';
  detail?: string;
}

export interface PeopleResult {
  users: { id: string; fullName: string; phone: string | null; roles: string[]; kind: 'staff' | 'parent' | 'student' }[];
  students: { id: string; fullName: string; rollNo: string; className: string }[];
}

export interface FileInput {
  filename: string;
  contentType: string;
  contentBase64: string;
}

// ---- Family chat ----

export type ThreadStatus = 'open' | 'closed' | 'resolved';
export type Tick = 'sent' | 'delivered' | 'read';

export interface FamilyThread {
  id: string;
  kind: 'teacher' | 'office';
  status: ThreadStatus;
  muted: boolean;
  /** How the signed-in person takes part: family, staff, or leader (reading for safeguarding). */
  side: 'family' | 'staff' | 'leader';
  student: { id: string; fullName: string; rollNo: string };
  sectionId: string;
  className: string;
  staff: { id: string; fullName: string };
  family: { id: string; fullName: string };
  relation: string | null;
  lastMessageAt: string | null;
  lastMessage: string | null;
  unread: number;
  statusChangedAt: string | null;
  createdAt: string;
  /** With the head of department since (escalated by the family, the teacher, or after a long wait). */
  escalatedAt?: string | null;
  escalatedTo?: { id: string; fullName: string } | null;
  /** Reports on its messages waiting for a leader. */
  openReports?: number;
}

export interface FamilyMessage {
  id: string;
  senderId: string;
  senderName: string;
  kind: 'text' | 'system';
  side: 'family' | 'staff' | 'system';
  body: string;
  attachment: { name: string; type: string; size: number } | null;
  createdAt: string;
  status: Tick | null;
  /** Removed by a moderator (the text is replaced, except for leaders). */
  hidden?: boolean;
  /** Leaders only: why the language filter flagged it. */
  flag?: string | null;
}

export interface ModerationReport {
  id: string;
  reason: string;
  note: string;
  status: 'open' | 'actioned' | 'dismissed';
  action: string | null;
  resolutionNote: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: string | null;
  conversationId: string;
  message: { id: string; body: string; createdAt: string; hidden: boolean; senderId: string };
  sender: string;
  student: string;
  staff: string;
  family: string;
  senderBlocked: boolean;
}

export interface ChatBlock {
  id: string;
  userId: string;
  fullName: string;
  reason: string;
  until: string | null;
  staffId: string | null;
  createdAt: string;
  blockedBy: string | null;
}

export interface Availability {
  dndUntil: string | null;
  hours: OfficeHours | null;
  awayNote: string;
  active: boolean;
}

export interface OfficeHours {
  start: string;
  end: string;
  days: number[];
}

export interface FamilyThreadPage {
  conversation: FamilyThread;
  messages: FamilyMessage[];
  officeHours: OfficeHours | null;
  afterHours: boolean;
  canWrite: boolean;
  away?: { until: string | null; note: string; hours: OfficeHours | null } | null;
  escalated?: { at: string; to: string | null; reason: string | null } | null;
  blocked?: { reason: string; until: string | null } | null;
}

export interface ChatSettingsView {
  studentChat: boolean;
  officeHours: OfficeHours | null;
  timezone: string;
  kind: 'school' | 'college' | 'university';
  /** Hours a family's message may wait before it goes to the head of department (0 = never). */
  escalateAfterHours?: number;
  officeUserIds?: string[];
  /** Roles whose holders also answer office threads, and the roles that may be chosen. */
  officeRoles?: string[];
  officeRoleChoices?: string[];
  /** Whether the signed-in person answers office threads. */
  isOffice?: boolean;
  officeStaff?: { id: string; fullName: string }[];
  classTeachers?: { sectionId: string; displayName: string; classTeacher: { id: string; fullName: string } | null }[];
}

// ---- Light rich text: **bold**, "- " / "1. " lists, [text](https://link) ----

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; text: string; href: string };
export type Block = { kind: 'p'; lines: Inline[][] } | { kind: 'ul'; items: Inline[][] } | { kind: 'ol'; items: Inline[][] };

/** Splits a line into text, bold and link runs. Only http(s) links become links. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > last) out.push({ kind: 'text', text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', text: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) });
  return out;
}

/** Paragraphs (blank-line separated) and bullet or numbered lists. */
export function parseRich(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const last = blocks.at(-1);
    if (bullet) {
      if (last?.kind === 'ul') last.items.push(parseInline(bullet[1]));
      else blocks.push({ kind: 'ul', items: [parseInline(bullet[1])] });
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(parseInline(numbered[1]));
      else blocks.push({ kind: 'ol', items: [parseInline(numbered[1])] });
    } else if (line.trim() === '') {
      blocks.push({ kind: 'p', lines: [] });
    } else if (last?.kind === 'p') {
      last.lines.push(parseInline(line));
    } else {
      blocks.push({ kind: 'p', lines: [parseInline(line)] });
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.lines.length > 0);
}

/** Percent of a total, rounded down; 0 when there is nobody. */
export const pctOf = (n: number, of: number) => (of > 0 ? Math.floor((n * 100) / of) : 0);

/** "4 KB" / "1.2 MB" for a file size. */
export function fileSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Reads a browser File as base64 (no data: prefix) for the API's JSON uploads. */
export function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** Photos and PDFs only; up to 4 MB each (the API's limit). */
export const ATTACH_ACCEPT = '.pdf,.png,.jpg,.jpeg';
export const ATTACH_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const MAX_FILE_BYTES = 4_000_000;
