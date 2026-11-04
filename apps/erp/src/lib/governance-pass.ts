// Types and small rules of the governance pages (services/api/src/governance): statutory committees, meetings and
// minutes, policies, the RTI register, the compliance calendar, the disclosure page and the board dashboard.
import type { Tone } from '@/components/ui';

export type IssueCode = 'too_few_members' | 'no_chair' | 'chair_not_woman' | 'women_below' | 'no_woman' | 'missing_category' | 'tenure_too_long' | 'gender_unknown';
export interface Issue {
  code: IssueCode;
  min?: number;
  max?: number;
  actual?: number;
  categories?: string[];
  member?: string;
  years?: number;
  count?: number;
}

export interface CommitteeCompliance {
  id: string;
  name: string;
  kind: string;
  statutory: boolean;
  basis: string | null;
  members: number;
  women: number;
  issues: Issue[];
  meetingsNorm: number;
  meetingsExpected: number;
  meetingsHeld: number;
  meetingsScheduled: number;
  minutesPending: number;
  lastMeetingOn: string | null;
  openActions: number;
  overdueActions: number;
  doneActions: number;
  public: boolean;
  status: 'ok' | 'attention';
}

export interface Compliance {
  today: string;
  year: { label: string; from: string; to: string };
  committees: CommitteeCompliance[];
  missing: { kind: string; name: string; basis: string }[];
}

export interface CommitteeMember {
  id: string;
  userId: string | null;
  name: string;
  role: string;
  category: string;
  gender: string;
  designation: string;
  phone?: string;
  contactPublic: boolean;
  tenureStart: string;
  tenureEnd: string | null;
  current: boolean;
}

export interface CommitteeDetail {
  id: string;
  name: string;
  kind: string;
  statutory: boolean;
  mandate: string;
  description: string;
  meetingsPerYear: number;
  quorumPct: number;
  constitutedOn: string | null;
  orderRef: string;
  public: boolean;
  helpline: string;
  email: string;
  rule: { name: string; basis: string; mandate: string; meetingsPerYear: number; minMembers: number; minWomenPct?: number; maxTenureYears?: number } | null;
  canManage: boolean;
  members: CommitteeMember[];
  compliance: (CommitteeCompliance & { issueTexts: string[] }) | null;
  meetings: { id: string; title: string; meetingOn: string; startsAt: string; venue: string; status: string; minutesStatus: string; noticeSentAt: string | null; actions: number; present: number }[];
}

export interface AgendaItem {
  id: string;
  seq: number;
  title: string;
  presenter: string;
  discussion: string;
  resolution: string;
  outcome: string;
}

export interface MeetingDetail {
  id: string;
  committeeId: string;
  title: string;
  meetingOn: string;
  startsAt: string;
  venue: string;
  status: string;
  minutes: string;
  minutesStatus: 'draft' | 'circulated' | 'approved';
  minutesHash: string | null;
  noticeSentAt: string | null;
  committee: { id: string; name: string; kind: string; quorumPct: number } | null;
  agenda: AgendaItem[];
  attendance: { memberId: string; name: string; role: string; category: string; hasAccount: boolean; userId: string | null; status: string | null }[];
  quorum: { members: number; needed: number; present: number; met: boolean | null };
  signoffs: { id: string; memberId: string; name: string; decision: 'approve' | 'object'; comment: string; signedAt: string; signature: string; current: boolean; valid: boolean }[];
  approval: { approved: boolean; approvals: number; needed: number; objections: number; chairSigned: boolean };
  actions: { id: string; title: string; ownerName: string; dueOn: string; status: string; actionTaken: string; reportedOn: string | null; overdue: boolean }[];
  canManage: boolean;
  canSign: boolean;
  mySignoff: { decision: string; signedAt: string } | null;
}

export interface PolicyVersion {
  id: string;
  version: number;
  body: string;
  changeNote: string;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'superseded';
  effectiveFrom: string | null;
  authorName: string | null;
  approverName: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  contentHash: string | null;
  acknowledged: number;
  intact: boolean;
}

export interface PolicyDetail {
  id: string;
  code: string;
  title: string;
  category: string;
  ownerName: string | null;
  reviewMonths: number;
  nextReviewOn: string | null;
  public: boolean;
  audience: string[];
  status: string;
  audienceSize: number;
  versions: PolicyVersion[];
}

export interface Acks {
  version: number;
  status: string;
  audience: number;
  acknowledged: number;
  pending: number;
  page: number;
  rows: { userId: string; name: string; acknowledgedAt: string | null }[];
}

export interface MyPolicy {
  policyId: string;
  versionId: string;
  code: string;
  title: string;
  category: string;
  version: number;
  effectiveFrom: string | null;
  mustAcknowledge: boolean;
  acknowledgedAt: string | null;
  pending: boolean;
}

export interface PolicyText {
  policyId: string;
  code: string;
  title: string;
  version: number;
  status: string;
  body: string;
  changeNote: string;
  effectiveFrom: string | null;
  fingerprint: string | null;
  acknowledgedAt: string | null;
  mustAcknowledge: boolean;
}

export interface MySummary {
  committees: { id: string; name: string; kind: string; role: string; tenureEnd: string | null }[];
  toSign: { meetingId: string; title: string; meetingOn: string; committee: string }[];
  upcoming: { id: string; title: string; meetingOn: string; startsAt: string; venue: string; committee: string }[];
  actions: { id: string; title: string; dueOn: string; status: string; actionTaken: string; committee: string; overdue: boolean }[];
}

export type DeadlineState = 'overdue' | 'due_soon' | 'upcoming' | 'done' | 'missed' | 'waived';
export interface Calendar {
  today: string;
  from: string;
  totals: { overdue: number; dueSoon: number; upcoming: number; done: number };
  months: { month: string; items: { id: string; title: string; authority: string; dueOn: string; recurrence: string; status: string; state: DeadlineState; owner: string | null; reference: string; completedOn: string | null; daysLeft: number }[] }[];
}

export interface RtiRegister {
  from: string;
  to: string;
  carriedIn: number;
  received: number;
  transferred: number;
  replied: number;
  refused: number;
  refusedBySection: Record<string, number>;
  pendingAtEnd: number;
  lateReplies: number;
  overdueNow: number;
  feesPaise: number;
  appealsReceived: number;
  appealsDecided: number;
  appealsPending: number;
}

export interface Disclosure {
  institution: { name: string; slug: string; legalName: string | null; address: string; phone: string | null; email: string | null; website: string | null; established: number | null; affiliation: string | null; aisheCode: string | null; naacGrade: string | null };
  published: boolean;
  publishedAt: string | null;
  intro: string;
  year: { label: string; from: string; to: string };
  sections: { section: string; items: { id: string; label: string; value: string; url: string; public: boolean }[] }[];
  committees: { name: string; kind: string; basis: string | null; helpline: string; email: string; public: boolean; members: { name: string; role: string; designation: string; phone: string }[] }[];
  programmes: { name: string; level: string; terms: number }[];
  policies: { code: string; title: string; category: string; versionId: string; version: number; effectiveFrom: string | null }[];
  grievances: { received: number; resolved: number; averageDays: number | null; officers: { name: string; email: string | null }[] };
}

export interface GovDashboard {
  today: string;
  year: { label: string; from: string; to: string };
  committees: { statutory: number; missing: { kind: string; name: string }[]; attention: { id: string; name: string; kind: string; issues: number; meetingsHeld: number; meetingsExpected: number; overdueActions: number }[]; meetingsHeld: number; meetingsExpected: number; minutesPending: number; openActions: number; overdueActions: number; doneActions: number };
  grievances: { open: number; overdue: number; receivedYear: number; resolvedYear: number; committee: number; external: number; averageDays: number | null };
  rti: { open: number; dueWeek: number; overdue: number; appealsPending: number; year: number };
  calendar: { overdue: number; dueMonth: number; doneYear: number; onTime: number; next: { id: string; title: string; dueOn: string; authority: string }[] };
  policies: { published: number; reviewDue: number; inApproval: number; acknowledgements: number };
  dpdp: { pending: number; overdue: number };
  incidents: { active: number; severe: number };
  audit: { openFindings: number; overdueFindings: number };
  iqac: { aqar: { year: string; status: string; dueOn: string | null } | null; dvvOpen: number };
}

export const MEMBER_ROLES = ['chair', 'secretary', 'member', 'external'] as const;
export const MEMBER_CATEGORIES = ['internal', 'external', 'student', 'parent', 'alumni', 'ngo', 'legal', 'industry', 'government', 'media'] as const;
export const OUTCOMES = ['pending', 'resolved', 'deferred', 'noted', 'rejected'] as const;

export const deadlineTone = (s: string): Tone => (s === 'overdue' || s === 'missed' ? 'danger' : s === 'due_soon' ? 'warning' : s === 'done' ? 'success' : 'neutral');
export const minutesTone = (s: string): Tone => (s === 'approved' ? 'success' : s === 'circulated' ? 'warning' : 'neutral');
export const versionTone = (s: string): Tone => (s === 'published' ? 'success' : s === 'in_review' || s === 'approved' ? 'warning' : s === 'superseded' ? 'neutral' : 'info');

/** Share of the year's meetings held against what is expected by now: 100 when nothing is expected yet. */
export function meetingsPct(held: number, expected: number): number {
  if (expected <= 0) return 100;
  return Math.min(100, Math.round((held * 100) / expected));
}

/** The percentage of an audience that has acknowledged, or null when no one has to. */
export function ackPct(acknowledged: number, audience: number): number | null {
  return audience > 0 ? Math.round((acknowledged * 100) / audience) : null;
}

/** "2026-11" -> the month's first day, for formatting a month heading. */
export const monthStart = (m: string) => `${m}-01`;

/** Lines of the agenda typed one per line into a text box: blank lines dropped, numbering ("1.", "2)") removed. */
export function agendaLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+\s*[.)-]\s*/, '').trim())
    .filter((l) => l.length >= 2)
    .slice(0, 40);
}
