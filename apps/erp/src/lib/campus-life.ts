// Shapes from the placements, research and grievance endpoints (services/api), and the small rules the pages use.

export interface PlacementStats {
  year: number;
  activeStudents: number;
  registeredStudents: number;
  placedStudents: number;
  placementPercent: number;
  offers: { total: number; accepted: number; declined: number; pending: number };
  ctc: { average: number | null; median: number | null; highest: number | null; lowest: number | null };
  byCompany: { name: string; placed: number; median: number | null }[];
}

export interface PlacementDrive {
  id: string;
  title: string;
  company: string;
  roleTitle: string;
  ctcLpa: number | null;
  stipendMonthly: number | null;
  driveDate: string | null;
  minCgpa: number;
  status: string;
  registrations: number;
}

export interface ResearchKpis {
  fromYear: number;
  toYear: number;
  projects: number;
  scholarsAwarded: number;
  publications: { total: number; indexed: number; perTeacher: number; booksAndChapters: number };
  grants: { count: number; totalSanctionedPaise: number };
  patents: { total: number; granted: number };
  naac: Record<string, { label: string; value: number }>;
}

export interface ResearchProject {
  id: string;
  code: string;
  title: string;
  kind: string;
  status: string;
  startsOn: string;
}

export interface GrievanceStats {
  total: number;
  open: number;
  overdue: number;
  averageRating: number | null;
  averageResolutionHours: number | null;
  committee?: { total: number; open: number };
}

export interface GrievanceTicket {
  id: string;
  ticketNo: string;
  category: string;
  severity: string;
  subject: string;
  status: string;
  anonymous: boolean;
  committee: string | null;
  slaDueAt: string;
  escalationLevel: number;
}

const OPEN = ['open', 'assigned', 'in_progress', 'escalated', 'reopened'];

/** Where a ticket stands against its deadline: past it, due within a day, on track, or finished. */
export function slaState(t: { status: string; slaDueAt: string }, now: Date): 'done' | 'overdue' | 'soon' | 'ok' {
  if (!OPEN.includes(t.status)) return 'done';
  const left = new Date(t.slaDueAt).getTime() - now.getTime();
  return left < 0 ? 'overdue' : left < 86_400_000 ? 'soon' : 'ok';
}

/** A package in lakhs a year without trailing zeros: 7.2, 6, 12.5. */
export const lakhs = (n: number | null): string => (n === null ? '-' : String(Math.round(n * 100) / 100));
