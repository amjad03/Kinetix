/**
 * The admission document checklist: the originals and certificates an admitted candidate hands in before the admission
 * is confirmed (transfer certificate, migration and eligibility certificates, caste and income certificates for a
 * reserved seat, the anti-ragging undertaking…). Which items apply follows from the candidate: their board, admission
 * route, seat type, category, claims and nationality. A candidate may be admitted provisionally with items deferred to
 * a due date on an undertaking; the admission is confirmed when every required item is in.
 */
import { categoryKey, MERIT } from './reservation.js';

export const CHECKLIST_STATUSES = ['pending', 'received', 'verified', 'deferred', 'waived'] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];
/** Statuses that settle an item for confirmation. */
export const SETTLED: ChecklistStatus[] = ['received', 'verified', 'waived'];

export interface ChecklistTemplateItem {
  key: string;
  label: string;
  required: boolean;
  /** The original is kept by the college (custody register) rather than a verified copy. */
  original: boolean;
  why: string;
}

export interface ChecklistFacts {
  admissionType: string;
  nationality: string;
  seatType: string | null;
  category: string | null;
  claims: { horizontal?: string[]; supernumerary?: string[] };
  /** The board or university the qualifying examination was passed under, as answered. */
  board: string | null;
  /** The institution's home state board names (the Karnataka PU board and KSEAB). */
  homeBoards: string[];
  externalAllotment: boolean;
}

const isHome = (board: string | null, home: string[]) => !!board && home.some((h) => board.toLowerCase().includes(h.toLowerCase()));

export function checklistFor(f: ChecklistFacts): ChecklistTemplateItem[] {
  const items: ChecklistTemplateItem[] = [];
  const add = (key: string, label: string, why: string, o: { required?: boolean; original?: boolean } = {}) => items.push({ key, label, required: o.required ?? true, original: o.original ?? false, why });
  add('marks_cards', 'Qualifying examination marks cards (original)', 'Every admission', { original: true });
  add('tc', 'Transfer certificate from the last institution (original)', 'Every admission', { original: true });
  const outside = !isHome(f.board, f.homeBoards);
  if (outside || f.admissionType === 'transfer' || f.nationality !== 'indian') add('migration', 'Migration certificate', f.admissionType === 'transfer' ? 'Transfer from another university' : 'Qualifying examination passed outside the state board', { original: true });
  if (outside || f.nationality !== 'indian') add('eligibility', 'Eligibility certificate from the university', 'The university certifies equivalence for boards outside the state');
  if (f.nationality === 'foreign' || f.nationality === 'nri') add('aiu_equivalence', 'AIU equivalence certificate', 'Qualifying examination passed abroad', { required: f.nationality === 'foreign' });
  if (f.nationality === 'foreign') {
    add('passport_visa', 'Passport and student visa', 'Foreign national');
    add('residential_permit', 'Residential permit (FRRO registration within 14 days of arrival)', 'Foreign national');
  }
  if (f.seatType === 'nri') add('nri_sponsor', 'NRI sponsor declaration with the sponsor’s passport and residence proof', 'NRI seat');
  const cat = categoryKey(f.category);
  if (cat === 'sc' || cat === 'st') add('caste', 'Caste certificate (SC / ST) from the Tahsildar', 'Reserved seat or fee concession');
  else if (cat !== MERIT) add('caste_income', 'Caste and income certificate (Category-1, 2A, 2B, 3A, 3B)', 'Reserved seat');
  if (f.seatType === 'merit' && f.externalAllotment) add('study_certificate', 'Study certificate (seven years of study in Karnataka) or the KEA verification slip', 'Karnataka government seat');
  if (f.externalAllotment) add('allotment_order', 'Allotment order and fee receipt from the counselling authority', 'Seat allotted by KEA / COMEDK');
  const h = f.claims.horizontal ?? [];
  const s = f.claims.supernumerary ?? [];
  if (h.includes('pwd')) add('disability', 'Disability certificate (40% or more) from the medical board', 'Persons with disabilities seat');
  if (h.includes('rural')) add('rural', 'Rural study certificate (Class 1 to 10 in a rural area)', 'Rural horizontal seat');
  if (h.includes('kannada_medium')) add('kannada_medium', 'Kannada medium study certificate (Class 1 to 10)', 'Kannada medium horizontal seat');
  if (h.includes('hk_region')) add('hk_region', 'Article 371(J) eligibility certificate (Kalyana Karnataka region)', '371(J) seat');
  if (s.includes('tfw')) add('income_tfw', 'Income certificate below Rs 8 lakh a year (tuition fee waiver)', 'TFW supernumerary seat');
  if (f.admissionType === 'lateral') add('diploma_marks', 'Marks cards of every semester of the diploma (or degree)', 'Lateral entry');
  if (f.admissionType === 'transfer') {
    add('transfer_approval', 'Transfer approval from both universities', 'Transfer admission');
    add('previous_marks', 'Marks cards of the semesters completed at the previous college', 'Transfer admission');
  }
  add('anti_ragging', 'Anti-ragging undertaking by the student and the parent (UGC Regulations 2009)', 'Every admission');
  add('medical_fitness', 'Medical fitness certificate', 'Every admission', { required: false });
  add('photos', 'Passport photographs (four)', 'Every admission', { required: false });
  return items;
}

export interface ChecklistRow {
  itemKey: string;
  required: boolean;
  status: ChecklistStatus;
  dueOn: string | null;
}

/** What still stops confirmation, and whether a provisional admission is possible (every open item deferred to a date). */
export function checklistState(rows: ChecklistRow[], today: string): { complete: boolean; open: string[]; overdue: string[]; provisionalOk: boolean } {
  const req = rows.filter((r) => r.required);
  const open = req.filter((r) => !SETTLED.includes(r.status)).map((r) => r.itemKey);
  const overdue = req.filter((r) => r.status === 'deferred' && r.dueOn !== null && r.dueOn < today).map((r) => r.itemKey);
  const provisionalOk = req.every((r) => SETTLED.includes(r.status) || (r.status === 'deferred' && r.dueOn !== null));
  return { complete: open.length === 0, open, overdue, provisionalOk };
}
