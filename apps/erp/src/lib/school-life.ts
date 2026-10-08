// Shapes from the school diary, parent-teacher meeting, early years and health endpoints (services/api/src/school-life).

export interface SectionOption {
  id: string;
  displayName: string;
}

export interface DiaryEntry {
  id: string;
  sectionId: string;
  entryDate: string;
  classwork: string;
  homeworkNote: string;
  notice: string;
  author: string;
  subject: string | null;
  acknowledged: number;
  students: number;
}

export interface DiaryAck {
  studentId: string;
  fullName: string;
  rollNo: string;
  acknowledgedAt: string | null;
}

export interface PtmEvent {
  id: string;
  title: string;
  eventDate: string;
  location: string;
  status: 'open' | 'closed';
  slots: number;
  booked: number;
}

export interface PtmSlot {
  id: string;
  teacherId: string;
  teacher: string;
  startsAt: string;
  endsAt: string;
  studentId: string | null;
  student: string | null;
}

export interface StaffOption {
  id: string;
  fullName: string;
}

export const EY_DOMAINS = ['physical', 'language', 'cognitive', 'social_emotional', 'creative'] as const;
export const EY_STATUSES = ['emerging', 'developing', 'achieved'] as const;
export type EyDomain = (typeof EY_DOMAINS)[number];
export type EyStatus = (typeof EY_STATUSES)[number];

export interface EyChild {
  id: string;
  fullName: string;
  rollNo: string;
  achieved: number;
  observations: number;
}

export interface EyMilestone {
  id: string;
  domain: EyDomain;
  ageBand: string;
  title: string;
  status: EyStatus | null;
}

export interface EyObservation {
  id: string;
  domain: EyDomain;
  note: string;
  status: EyStatus | null;
  observedOn: string;
  hasPhoto: boolean;
}

export interface EyRecord {
  student: { id: string; fullName: string };
  milestones: EyMilestone[];
  observations: EyObservation[];
}

export interface EyTerm {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export interface HealthProfile {
  bloodGroup: string | null;
  allergies: string[];
  conditions: string[];
  medications: string[];
  emergencyContacts: { name: string; relation: string; phone: string }[];
  notes: string;
}

export interface HealthVisit {
  id: string;
  visitedAt: string;
  complaint: string;
  action: string;
  sentHome: boolean;
  student?: string;
  rollNo?: string;
}

export interface HealthVaccination {
  id: string;
  vaccine: string;
  dose: string;
  givenOn: string;
  nextDueOn: string | null;
}

export interface HealthRecord {
  student: { id: string; fullName: string; rollNo?: string };
  profile: HealthProfile | null;
  visits: HealthVisit[];
  vaccinations: HealthVaccination[];
}

export interface HealthChild {
  id: string;
  fullName: string;
  rollNo: string;
  hasProfile: boolean;
}

/** "Peanuts, Penicillin" to a list; blank entries are dropped. */
export const splitList = (s: string | undefined): string[] => (s ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** One contact per line: "Name, relation, phone". Returns the line number of the first bad line. */
export function parseContacts(s: string | undefined): { ok: true; value: HealthProfile['emergencyContacts'] } | { ok: false; line: number } {
  const out: HealthProfile['emergencyContacts'] = [];
  const lines = (s ?? '').split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    const [name, relation, phone] = lines[i].split(',').map((x) => x.trim());
    if (!name || !relation || !phone || phone.length < 5) return { ok: false, line: i + 1 };
    out.push({ name, relation, phone });
  }
  return { ok: true, value: out };
}

export const formatContacts = (c: HealthProfile['emergencyContacts']) => c.map((x) => `${x.name}, ${x.relation}, ${x.phone}`).join('\n');
