// Shapes of the placement cell's API (services/api/src/placements) the ERP reads, and the small rules it shows.

export interface Round {
  id: string;
  seq: number;
  name: string;
  kind: string;
  scheduledOn: string | null;
}

export interface DriveDetail {
  id: string;
  title: string;
  kind: 'placement' | 'internship';
  category: 'regular' | 'dream' | 'super_dream';
  companyId: string;
  roleTitle: string;
  ctcLpa: number | null;
  stipendMonthly: number | null;
  location: string;
  venue: string;
  description: string;
  skills: string;
  bond: string;
  driveDate: string | null;
  registrationOpensOn: string | null;
  registrationClosesOn: string | null;
  minCgpa: number;
  maxBacklogs: number;
  programIds: string[];
  batchYears: number[];
  status: 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
  postedByRecruiter: boolean;
  rounds: Round[];
  /** Placement pass: further criteria (empty genders = everyone). */
  genders?: string[];
  minTenthPct?: number | null;
  minTwelfthPct?: number | null;
  maxGapYears?: number | null;
  maxBacklogHistory?: number | null;
  requireVerifiedDocs?: boolean;
  notifiedAt?: string | null;
}

export interface Registration {
  id: string;
  studentId: string;
  fullName: string;
  rollNo: string;
  status: 'registered' | 'shortlisted' | 'rejected' | 'selected' | 'withdrawn';
  cgpaAt: number;
  backlogsAt: number;
  rounds: { roundId: string; result: 'pass' | 'fail' | 'absent'; note: string }[];
}

export interface EligibleList {
  students: { studentId: string; fullName: string; rollNo: string; className: string; program: string; batchYear: number | null; cgpa: number | null; backlogs: number; tenthPct?: number | null; twelfthPct?: number | null; gapYears?: number | null; docsVerified?: boolean; eligible: boolean; reasons: string[]; registration: { id: string; status: string } | null }[];
  summary: { total: number; eligible: number; registered: number };
}

export interface Slot {
  id: string;
  roundId: string;
  round: string;
  seq: number;
  registrationId: string;
  fullName: string;
  rollNo: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  panel: string;
  room: string | null;
  status: 'scheduled' | 'done' | 'no_show' | 'cancelled';
}

export interface DriveOffer {
  id: string;
  registrationId: string;
  fullName: string;
  rollNo: string;
  roleTitle: string;
  ctcLpa: number | null;
  status: string;
  offeredOn: string;
  respondBy: string | null;
  conditional: boolean;
  conditionNote: string | null;
}

export interface CompanyDetail {
  id: string;
  name: string;
  sector: string;
  groupName: string | null;
  city: string;
  address: string;
  description: string;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: 'active' | 'blacklisted' | 'pending';
  selfRegistered: boolean;
  hasPortalKey: boolean;
  portalTokenAt: string | null;
  /** prospect | contacted | engaged | recruiting | dormant */
  crmStage?: string;
  contacts: { id: string; name: string; designation: string; email: string | null; phone: string | null; isPrimary: boolean }[];
  drives: { id: string; title: string; kind: string; status: string; driveDate: string | null; ctcLpa: number | null; registrations: number; offers: number }[];
}

export interface TrainingDetail {
  id: string;
  title: string;
  kind: string;
  trainer: string;
  batchYear: number | null;
  startsOn: string;
  endsOn: string;
  hours: number;
  status: string;
  description: string;
  sessions: { id: string; heldOn: string; topic: string; hours: number }[];
  tests: string[];
  students: { id: string; fullName: string; rollNo: string; className: string; present: number; marked: number; attendancePct: number | null; attendance: Record<string, boolean>; scores: Record<string, { score: number; maxScore: number }> }[];
}

export interface ReportList {
  reports: { id: string; columns: { key: string; header: string }[] }[];
  criteria: { employer: string[]; alumni: string[] };
}

export interface ReportData {
  id: string;
  year: number;
  columns: { key: string; header: string }[];
  rows: Record<string, unknown>[];
}

/** Where a drive may go next (eligibility.ts DRIVE_MOVES). */
const DRIVE_MOVES: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'cancelled'], closed: ['open', 'completed', 'cancelled'], completed: [], cancelled: [] };
export const driveMoves = (status: string): string[] => DRIVE_MOVES[status] ?? [];

/**
 * Who can be made an offer: a shortlisted registration that passed the drive's final round (or any shortlisted one
 * when the drive has no rounds), without an offer already.
 */
export function offerable(regs: Registration[], rounds: Round[], offers: { registrationId: string }[]): Registration[] {
  const last = [...rounds].sort((a, b) => b.seq - a.seq)[0];
  const has = new Set(offers.map((o) => o.registrationId));
  return regs.filter((r) => r.status === 'shortlisted' && !has.has(r.id) && (!last || r.rounds.some((x) => x.roundId === last.id && x.result === 'pass')));
}

/**
 * Who sits a round: everyone still in the running (registered or shortlisted) and, after the first round, who passed
 * the previous one.
 */
export function inRound(regs: Registration[], rounds: Round[], round: Round): Registration[] {
  const prev = rounds.find((r) => r.seq === round.seq - 1);
  return regs.filter((r) => ['registered', 'shortlisted', 'selected'].includes(r.status) || r.rounds.some((x) => x.roundId === round.id)).filter((r) => !prev || r.rounds.some((x) => x.roundId === prev.id && x.result === 'pass'));
}

/** A drive's shortlist as the recruiter portal shows it. */
export interface Shortlist {
  drive: { id: string; title: string };
  rounds: { id: string; seq: number; name: string; kind: string }[];
  rows: { rollNo: string; fullName: string; program: string; className: string; cgpaAt: number; backlogsAt: number; status: string; rounds: Record<string, string> }[];
}

/** A call, email, meeting or visit with a recruiter (record kit `placement-interactions`). */
export interface Interaction {
  id: string;
  kind: string;
  happenedOn: string;
  summary: string;
  outcome: string;
  nextAction: string;
  followUpOn: string | null;
  followUpDone: boolean;
  contactName: string | null;
  recordedBy: string | null;
}

/** An apprenticeship's months: the stipend due and the Government share, with what was paid and credited (paise). */
export interface StipendSheet {
  apprenticeship: { id: string; establishment: string; stipendPaise: number; govtSharePaise: number; category: string };
  months: { month: string; duePaise: number; govtSharePaise: number; employerPaidPaise: number | null; dbtPaise: number | null; dbtReference: string; paidOn: string | null }[];
  totals: { employerPaidPaise: number; dbtPaise: number; monthsUnpaid: number };
}

/** Criteria beyond CGPA and backlogs, as short phrases keys: the drive page lists them. */
export function extraCriteria(d: Pick<DriveDetail, 'genders' | 'minTenthPct' | 'minTwelfthPct' | 'maxGapYears' | 'maxBacklogHistory' | 'requireVerifiedDocs'>): { key: string; vars?: Record<string, string | number> }[] {
  const out: { key: string; vars?: Record<string, string | number> }[] = [];
  if (d.genders?.length === 1) out.push({ key: d.genders[0] === 'female' ? 'pp.crit.women' : 'pp.crit.men' });
  if (d.minTenthPct) out.push({ key: 'pp.crit.tenth', vars: { pct: d.minTenthPct } });
  if (d.minTwelfthPct) out.push({ key: 'pp.crit.twelfth', vars: { pct: d.minTwelfthPct } });
  if (d.maxGapYears != null) out.push({ key: 'pp.crit.gap', vars: { n: d.maxGapYears } });
  if (d.maxBacklogHistory != null) out.push({ key: 'pp.crit.history', vars: { n: d.maxBacklogHistory } });
  if (d.requireVerifiedDocs) out.push({ key: 'pp.crit.docs' });
  return out;
}

/** Reads CSV text from a chosen file (UTF-8; a spreadsheet saved as CSV). */
export const csvFromFile = (f: File): Promise<string> => f.text();
