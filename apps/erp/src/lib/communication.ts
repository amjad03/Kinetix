// Communication: announcements (v1/announcements) and family chat (v1/conversations).

export type AnnChannel = 'boards' | 'teacher' | 'student' | 'parent';
export type AppChannel = Exclude<AnnChannel, 'boards'>;
export const CHANNELS: AnnChannel[] = ['boards', 'teacher', 'student', 'parent'];
export const APP_CHANNELS: AppChannel[] = ['teacher', 'student', 'parent'];
export type AnnStatus = 'draft' | 'scheduled' | 'sent' | 'recalled';
export type AudienceScope = 'all' | 'departments' | 'programs' | 'sections' | 'people';

export interface AnnAudience {
  scope: AudienceScope;
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

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important';
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
}

export interface ChatSettingsView {
  studentChat: boolean;
  officeHours: OfficeHours | null;
  timezone: string;
  kind: 'school' | 'college' | 'university';
  officeUserIds?: string[];
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
