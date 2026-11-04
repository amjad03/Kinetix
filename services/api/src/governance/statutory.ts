// Pure rules of the governance pass: the statutory committees an Indian college must keep and what each needs, the
// composition and quorum checks, the minutes' hash and approval rule, RTI and DPDP deadlines, and the compliance
// calendar's standard deadlines and recurrence. No database here, so every rule is unit-tested (statutory.spec.ts).
import { createHash } from 'node:crypto';

export const COMMITTEE_KINDS = [
  'iqac',
  'anti_ragging',
  'anti_ragging_squad',
  'icc',
  'grievance_redressal',
  'sc_st_cell',
  'minority_cell',
  'equal_opportunity_cell',
  'governing_body',
  'academic_council',
  'board_of_studies',
  'finance_committee',
  'other',
] as const;
export type CommitteeKind = (typeof COMMITTEE_KINDS)[number];

export const MEMBER_CATEGORIES = ['internal', 'external', 'student', 'parent', 'alumni', 'ngo', 'legal', 'industry', 'government', 'media'] as const;
export type MemberCategory = (typeof MEMBER_CATEGORIES)[number];
export const MEMBER_ROLES = ['chair', 'secretary', 'member', 'external'] as const;

/** What a statutory committee needs. Every number is the regulation's, cited in `basis`. */
export interface CommitteeRule {
  kind: CommitteeKind;
  name: string;
  basis: string;
  mandate: string;
  /** Meetings the committee should hold in a year (0: as needed). */
  meetingsPerYear: number;
  quorumPct: number;
  minMembers: number;
  /** At least this share of the current members are women. */
  minWomenPct?: number;
  chairWoman?: boolean;
  /** Each group needs at least one current member from one of its categories. */
  needs?: MemberCategory[][];
  needsWoman?: boolean;
  maxTenureYears?: number;
  /** Shown with its contact on the public disclosure page by default. */
  public: boolean;
  /** Required of every college (false: only autonomous colleges, or as the institution decides). */
  required: boolean;
}

export const COMMITTEE_RULES: CommitteeRule[] = [
  { kind: 'iqac', name: 'Internal Quality Assurance Cell (IQAC)', basis: 'NAAC guidelines for the creation of the IQAC', mandate: 'Plans, guides and monitors quality assurance; prepares the AQAR', meetingsPerYear: 4, quorumPct: 50, minMembers: 8, needs: [['external', 'industry', 'government'], ['student'], ['alumni']], public: true, required: true },
  { kind: 'anti_ragging', name: 'Anti-Ragging Committee', basis: 'UGC Regulations on Curbing the Menace of Ragging, 2009 (third amendment, 2016), 6.1(a)', mandate: 'Ensures compliance with the anti-ragging regulations; monitors the anti-ragging squad', meetingsPerYear: 2, quorumPct: 50, minMembers: 6, needs: [['government'], ['parent'], ['student'], ['ngo', 'media']], public: true, required: true },
  { kind: 'anti_ragging_squad', name: 'Anti-Ragging Squad', basis: 'UGC Regulations on Curbing the Menace of Ragging, 2009, 6.1(b)', mandate: 'Surprise checks of hostels, buses and canteens; inquires into incidents', meetingsPerYear: 0, quorumPct: 50, minMembers: 3, public: true, required: true },
  { kind: 'icc', name: 'Internal Complaints Committee (ICC)', basis: 'Sexual Harassment of Women at Workplace Act, 2013, s.4; UGC (Prevention, Prohibition and Redressal of Sexual Harassment) Regulations, 2015', mandate: 'Inquires into complaints of sexual harassment; files the annual report with the District Officer', meetingsPerYear: 2, quorumPct: 50, minMembers: 4, minWomenPct: 50, chairWoman: true, needs: [['ngo', 'legal', 'external']], maxTenureYears: 3, public: true, required: true },
  { kind: 'grievance_redressal', name: 'Students Grievance Redressal Committee (SGRC)', basis: 'UGC (Redress of Grievances of Students) Regulations, 2023, 4', mandate: 'Hears student grievances and decides within 15 days; appeals go to the Ombudsperson', meetingsPerYear: 4, quorumPct: 50, minMembers: 5, needs: [['student']], needsWoman: true, maxTenureYears: 2, public: true, required: true },
  { kind: 'sc_st_cell', name: 'SC/ST Cell', basis: 'UGC guidelines for SC/ST cells in universities and colleges', mandate: 'Monitors reservation, scholarships and grievances of SC/ST students and staff', meetingsPerYear: 2, quorumPct: 50, minMembers: 3, public: true, required: true },
  { kind: 'minority_cell', name: 'Minority Cell', basis: 'UGC guidelines for minority cells', mandate: 'Looks after the welfare and scholarships of minority students', meetingsPerYear: 2, quorumPct: 50, minMembers: 3, public: false, required: false },
  { kind: 'equal_opportunity_cell', name: 'Equal Opportunity Cell', basis: 'UGC guidelines for equal opportunity cells; Rights of Persons with Disabilities Act, 2016', mandate: 'Support for students from disadvantaged groups and with disabilities', meetingsPerYear: 2, quorumPct: 50, minMembers: 3, public: true, required: false },
  { kind: 'governing_body', name: 'Governing Body / College Development Council', basis: 'UGC (Conferment of Autonomous Status upon Colleges) Regulations, 2023; the state university act', mandate: 'Approves the budget, posts, policies and the development plan', meetingsPerYear: 2, quorumPct: 50, minMembers: 5, needs: [['external', 'industry', 'government']], public: true, required: true },
  { kind: 'academic_council', name: 'Academic Council', basis: 'UGC (Conferment of Autonomous Status upon Colleges) Regulations, 2023', mandate: 'Approves curricula, regulations and examinations recommended by the Boards of Studies', meetingsPerYear: 2, quorumPct: 50, minMembers: 5, needs: [['external', 'industry']], public: false, required: false },
  { kind: 'board_of_studies', name: 'Board of Studies', basis: 'UGC (Conferment of Autonomous Status upon Colleges) Regulations, 2023', mandate: 'Prepares the syllabus and panels of examiners for its programmes', meetingsPerYear: 2, quorumPct: 50, minMembers: 4, needs: [['external', 'industry', 'alumni']], public: false, required: false },
  { kind: 'finance_committee', name: 'Finance Committee', basis: 'UGC (Conferment of Autonomous Status upon Colleges) Regulations, 2023', mandate: 'Scrutinises the budget and audited accounts before the governing body', meetingsPerYear: 2, quorumPct: 50, minMembers: 3, public: false, required: false },
];
export const ruleOf = (kind: string): CommitteeRule | undefined => COMMITTEE_RULES.find((r) => r.kind === kind);

export interface MemberFacts {
  id: string;
  name: string;
  role: string;
  category: string;
  gender: string;
  tenureStart: string;
  tenureEnd: string | null;
}

export type CompositionIssue =
  | { code: 'too_few_members'; min: number; actual: number }
  | { code: 'no_chair' }
  | { code: 'chair_not_woman' }
  | { code: 'women_below'; min: number; actual: number }
  | { code: 'no_woman' }
  | { code: 'missing_category'; categories: string[] }
  | { code: 'tenure_too_long'; member: string; years: number; max: number }
  | { code: 'gender_unknown'; count: number };

/** Members whose tenure covers `day` (YYYY-MM-DD). */
export const currentMembers = <M extends { tenureStart: string; tenureEnd: string | null }>(ms: M[], day: string): M[] => ms.filter((m) => m.tenureStart <= day && (!m.tenureEnd || m.tenureEnd >= day));

const yearsBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (365.25 * 86_400_000);

/** What the current membership lacks against the committee's rule. Empty means it is properly constituted. */
export function compositionIssues(rule: CommitteeRule | undefined, members: MemberFacts[], day: string): CompositionIssue[] {
  const cur = currentMembers(members, day);
  const out: CompositionIssue[] = [];
  const min = rule?.minMembers ?? 1;
  if (cur.length < min) out.push({ code: 'too_few_members', min, actual: cur.length });
  const chair = cur.find((m) => m.role === 'chair');
  if (!chair) out.push({ code: 'no_chair' });
  if (!rule) return out;
  if (rule.chairWoman && chair && chair.gender !== 'female') out.push({ code: 'chair_not_woman' });
  if (rule.minWomenPct && cur.length) {
    const pct = Math.round((cur.filter((m) => m.gender === 'female').length * 100) / cur.length);
    if (pct < rule.minWomenPct) out.push({ code: 'women_below', min: rule.minWomenPct, actual: pct });
  }
  if (rule.needsWoman && !cur.some((m) => m.gender === 'female')) out.push({ code: 'no_woman' });
  for (const group of rule.needs ?? []) if (!cur.some((m) => group.includes(m.category as MemberCategory))) out.push({ code: 'missing_category', categories: group });
  if (rule.maxTenureYears)
    for (const m of cur) {
      const end = m.tenureEnd ?? day;
      const years = yearsBetween(m.tenureStart, end);
      if (years > rule.maxTenureYears + 0.01) out.push({ code: 'tenure_too_long', member: m.name, years: Math.round(years * 10) / 10, max: rule.maxTenureYears });
    }
  if ((rule.minWomenPct || rule.chairWoman || rule.needsWoman) && cur.some((m) => !m.gender)) out.push({ code: 'gender_unknown', count: cur.filter((m) => !m.gender).length });
  return out;
}

/** Plain English for an issue (the ERP translates by `code`; this is for the PDF and the API's own messages). */
export function issueText(i: CompositionIssue): string {
  switch (i.code) {
    case 'too_few_members':
      return `Needs at least ${i.min} members; has ${i.actual}`;
    case 'no_chair':
      return 'No chairperson in office';
    case 'chair_not_woman':
      return 'The presiding officer must be a woman';
    case 'women_below':
      return `At least ${i.min}% of members must be women; ${i.actual}% are`;
    case 'no_woman':
      return 'Needs at least one woman member';
    case 'missing_category':
      return `Needs a member who is: ${i.categories.join(' or ')}`;
    case 'tenure_too_long':
      return `${i.member} has served ${i.years} years; the limit is ${i.max}`;
    case 'gender_unknown':
      return `${i.count} member(s) without a recorded gender`;
  }
}

/** Members needed present for quorum: the share of current members, rounded up, and at least one. */
export const quorumNeeded = (current: number, pct: number) => Math.max(1, Math.ceil((current * pct) / 100));

/** The text the members approve: everything that makes the minutes, in a fixed order, hashed with sha256. */
export function minutesHash(m: { title: string; meetingOn: string; minutes: string; agenda: { seq: number; title: string; resolution: string; outcome: string; discussion?: string; presenter?: string }[]; attendance: { memberId: string; status: string }[] }): string {
  const canon = JSON.stringify({
    t: m.title,
    d: m.meetingOn,
    m: m.minutes,
    a: [...m.agenda].sort((x, y) => x.seq - y.seq).map((a) => [a.seq, a.title, a.presenter ?? '', a.discussion ?? '', a.resolution, a.outcome]),
    p: [...m.attendance].sort((x, y) => x.memberId.localeCompare(y.memberId)).map((a) => [a.memberId, a.status]),
  });
  return createHash('sha256').update(canon).digest('hex');
}

export interface SignoffFacts {
  memberId: string;
  role: string;
  decision: 'approve' | 'object';
}

/**
 * The circulated minutes are approved when the chair (or, with no chair present, the secretary) has approved, at least
 * half of the members present who can sign have approved, and nobody present has objected to this text.
 */
export function minutesApproved(present: { memberId: string; role: string; canSign: boolean }[], signoffs: SignoffFacts[]): { approved: boolean; approvals: number; needed: number; objections: number; chairSigned: boolean } {
  const signers = present.filter((p) => p.canSign);
  const ids = new Set(signers.map((s) => s.memberId));
  const valid = signoffs.filter((s) => ids.has(s.memberId));
  const approvals = valid.filter((s) => s.decision === 'approve').length;
  const objections = valid.filter((s) => s.decision === 'object').length;
  const lead = signers.find((s) => s.role === 'chair') ?? signers.find((s) => s.role === 'secretary');
  const chairSigned = !!lead && valid.some((s) => s.memberId === lead.memberId && s.decision === 'approve');
  const needed = Math.max(1, Math.ceil(signers.length / 2));
  return { approved: !!lead && chairSigned && approvals >= needed && objections === 0, approvals, needed, objections, chairSigned };
}

// ---- dates -------------------------------------------------------------------------------------------------------

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The same day `n` months on, kept within the month (31 January plus one month is 28 or 29 February). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// ---- RTI ---------------------------------------------------------------------------------------------------------

/** RTI Act s.7(1): 30 days; 48 hours where life or liberty is involved; s.5(2): 5 more days through an assistant PIO. */
export function rtiDueOn(receivedOn: string, o: { lifeLiberty: boolean; viaApio: boolean }): string {
  return addDays(receivedOn, (o.lifeLiberty ? 2 : 30) + (o.viaApio ? 5 : 0));
}
/** s.6(3): a request for another authority is transferred within 5 days of receipt. */
export const rtiTransferBy = (receivedOn: string) => addDays(receivedOn, 5);
/** s.19(1): the first appeal within 30 days of the reply (or of the date it was due); the FAA decides in 30, at most 45. */
export const rtiAppealWindowEnds = (from: string) => addDays(from, 30);
export const rtiAppealDueOn = (filedOn: string) => addDays(filedOn, 30);
export const rtiAppealLatest = (filedOn: string) => addDays(filedOn, 45);
/** s.7(6): information given after the deadline is free; no further fee may be asked. */
export const rtiLate = (dueOn: string, on: string) => on > dueOn;
/** RTI Rules, 2012: Rs 10 application fee, nil below the poverty line; Rs 2 a page. */
export const RTI_FEE_PAISE = 1000;
export const RTI_PAGE_PAISE = 200;
export const RTI_REFUSAL_SECTIONS = ['8(1)(a)', '8(1)(b)', '8(1)(c)', '8(1)(d)', '8(1)(e)', '8(1)(f)', '8(1)(g)', '8(1)(h)', '8(1)(i)', '8(1)(j)', '9', '11', '24'] as const;

// ---- DPDP --------------------------------------------------------------------------------------------------------

/** Days to answer a data principal: the institution's published 30 days for a right; 90 for a grievance (DPDP Rules, 2025, r.14(3)). */
export const DPDP_RIGHT_DAYS = 30;
export const DPDP_GRIEVANCE_DAYS = 90;
export const dpdpDueAt = (madeAt: Date, kind: string) => new Date(madeAt.getTime() + (kind === 'grievance' ? DPDP_GRIEVANCE_DAYS : DPDP_RIGHT_DAYS) * 86_400_000);

// ---- compliance calendar -----------------------------------------------------------------------------------------

export const AUTHORITIES = ['ugc', 'aicte', 'naac', 'nirf', 'aishe', 'nba', 'university', 'state', 'income_tax', 'epfo', 'district', 'other'] as const;
export const RECURRENCES = ['none', 'monthly', 'quarterly', 'annual'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** The due date of the next occurrence, or null for a one-off. */
export function nextOccurrence(dueOn: string, r: Recurrence): string | null {
  return r === 'monthly' ? addMonths(dueOn, 1) : r === 'quarterly' ? addMonths(dueOn, 3) : r === 'annual' ? addMonths(dueOn, 12) : null;
}

/** pending deadlines: overdue, due within 30 days, or later. */
export function deadlineState(d: { status: string; dueOn: string }, today: string): 'done' | 'missed' | 'waived' | 'overdue' | 'due_soon' | 'upcoming' {
  if (d.status !== 'pending') return d.status as 'done' | 'missed' | 'waived';
  if (d.dueOn < today) return 'overdue';
  return daysBetween(today, d.dueOn) <= 30 ? 'due_soon' : 'upcoming';
}

/** The reminder due today, if any: the largest reminder day that has been reached and not yet sent. */
export function reminderDue(d: { status: string; dueOn: string; remindDays: number[]; lastRemindedOn: string | null }, today: string): number | null {
  if (d.status !== 'pending') return null;
  const left = daysBetween(today, d.dueOn);
  if (left < 0) return null;
  const reached = [...d.remindDays].filter((n) => n >= left).sort((a, b) => a - b);
  if (!reached.length) return null;
  const step = reached[0];
  // One reminder per step: skip if the last one was sent at or after this step began.
  if (d.lastRemindedOn && daysBetween(d.lastRemindedOn, d.dueOn) <= step) return null;
  return step;
}

export interface StandardDeadline {
  title: string;
  authority: (typeof AUTHORITIES)[number];
  frameworkKey?: string;
  /** Month and day within the academic year that starts in June. */
  month: number;
  day: number;
  recurrence: Recurrence;
  note: string;
}

/** The deadlines most Indian colleges keep. Dates are the usual ones; each portal notifies the year's own window. */
export const STANDARD_DEADLINES: StandardDeadline[] = [
  { title: 'Anti-ragging undertakings from every new student and parent', authority: 'ugc', month: 8, day: 31, recurrence: 'annual', note: 'UGC anti-ragging regulations: online undertaking at antiragging.in at admission' },
  { title: 'Form 10B audit report of the trust', authority: 'income_tax', month: 9, day: 30, recurrence: 'annual', note: 'Income-tax Act s.12A(1)(b): one month before the return is due' },
  { title: 'UGC public self-disclosure on the website updated', authority: 'ugc', month: 9, day: 30, recurrence: 'annual', note: 'UGC public notice on mandatory self-disclosure by higher education institutions' },
  { title: 'Income-tax return of the trust (ITR-7)', authority: 'income_tax', month: 10, day: 31, recurrence: 'annual', note: 'Due date for assessees whose accounts are audited' },
  { title: 'NAAC AQAR for the last academic year', authority: 'naac', frameworkKey: 'naac-aff-ug', month: 12, day: 31, recurrence: 'annual', note: 'Within six months of the end of the academic year' },
  { title: 'ICC annual report to the District Officer', authority: 'district', month: 1, day: 31, recurrence: 'annual', note: 'POSH Act s.21 and rule 14: complaints received and disposed of in the calendar year' },
  { title: 'AISHE data capture format (DCF-II) uploaded', authority: 'aishe', frameworkKey: 'aishe-dcf2', month: 1, day: 31, recurrence: 'annual', note: 'All India Survey on Higher Education; reference date 30 September' },
  { title: 'NIRF data submitted on the DCS portal', authority: 'nirf', frameworkKey: 'nirf-college', month: 2, day: 15, recurrence: 'annual', note: 'The data capturing system opens each winter; check the notified last date' },
  { title: 'AICTE extension of approval applied for', authority: 'aicte', frameworkKey: 'aicte-eoa', month: 3, day: 31, recurrence: 'annual', note: 'AICTE approval process handbook of the year' },
  { title: 'TDS return for the quarter', authority: 'income_tax', month: 7, day: 31, recurrence: 'quarterly', note: 'Form 24Q and 26Q' },
  { title: 'RTI quarterly return to the Information Commission', authority: 'state', month: 7, day: 15, recurrence: 'quarterly', note: 'RTI Act s.25: requests, appeals and fees of the quarter' },
  { title: 'EPF electronic challan-cum-return', authority: 'epfo', month: 6, day: 15, recurrence: 'monthly', note: 'By the 15th of each month for the month before' },
];

/** A standard deadline's date in the academic year starting in June of `startYear` (June to May). */
export function standardDate(s: StandardDeadline, startYear: number): string {
  const y = s.month >= 6 ? startYear : startYear + 1;
  return `${y}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
}
