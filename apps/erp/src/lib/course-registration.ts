// Shapes from the course-registration endpoints (services/api) and the small parsers the offering form uses.

export type OfferingCategory = 'core' | 'elective' | 'open_elective' | 'skill' | 'ability' | 'minor' | 'major' | 'audit' | 'additional' | 'multidisciplinary' | 'vac';
export const CATEGORIES: OfferingCategory[] = ['core', 'elective', 'open_elective', 'skill', 'ability', 'minor', 'major', 'audit', 'additional', 'multidisciplinary', 'vac'];

export interface TermRow {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface OfferingRow {
  id: string;
  termId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  category: OfferingCategory;
  credits: number;
  seatCap: number;
  facultyName: string | null;
  status: 'open' | 'closed';
  version: number;
  registered: number;
  waitlisted: number;
  preferences: number;
}

export interface WindowRow {
  id: string;
  termId: string;
  programId: string | null;
  opensAt: string;
  closesAt: string;
  addDropUntil: string;
  minCredits: number;
  maxCredits: number;
  allocationRule: 'cgpa' | 'time' | 'custom';
  ruleConfig?: { cgpa?: number; attendance?: number; priority?: number } | null;
}

export interface ApprovalRow {
  id: string;
  studentName: string;
  rollNo: string;
  subjectCode: string;
  subjectName: string;
  credits: number;
  category: OfferingCategory;
}

export interface RosterRow {
  registrationId: string;
  fullName: string;
  rollNo: string;
  status: 'registered' | 'waitlisted';
  approval: 'pending' | 'approved' | 'rejected';
  waitlistPos: number | null;
  autoCore: boolean;
}

/** "3", "1.5" -> number; anything else -> null. */
export function parseCredits(s: string): number | null {
  const v = s.trim();
  if (!/^\d{1,2}(\.\d)?$/.test(v)) return null;
  return Number(v);
}

/** "1, 2,3" -> [1, 2, 3]; blank -> []; anything that is not a list of whole numbers -> null. */
export function parseIntList(s: string): number[] | null {
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.every((x) => /^\d{1,2}$/.test(x))) return null;
  return parts.map(Number);
}

export const parseIdList = (s: string): string[] => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
