// Pure rules behind the student information pages: Aadhaar checks and masking, roll-number plans, sharing students
// out between sections, ages, and the profile fields a person may see, change or ask to change.
import { createHash } from 'node:crypto';

// ---- Aadhaar ------------------------------------------------------------------------------------

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** The digits of an Aadhaar number as typed ("2345 6789 0123" or with dashes), or null when it is not 12 digits. */
export function aadhaarDigits(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, '');
  return /^\d{12}$/.test(d) ? d : null;
}

/** A real Aadhaar number: 12 digits, not starting with 0 or 1, and a valid Verhoeff check digit. */
export function aadhaarValid(raw: string): boolean {
  const d = aadhaarDigits(raw);
  if (!d || /^[01]/.test(d)) return false;
  let c = 0;
  const rev = d.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][rev[i]]];
  return c === 0;
}

/** Only the last four digits are ever shown: "XXXX XXXX 1234". */
export const maskAadhaar = (last4: string | null) => (last4 ? `XXXX XXXX ${last4}` : null);

/** The stored fingerprint of an Aadhaar number (salted per institution), for finding the same person twice. */
export const aadhaarHash = (tenantId: string, raw: string) => createHash('sha256').update(`${tenantId}:aadhaar:${aadhaarDigits(raw) ?? raw}`).digest('hex');

// ---- profile fields -------------------------------------------------------------------------------

export const GENDERS = ['male', 'female', 'other'] as const;
export const CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews', 'other'] as const;
export const ADMISSION_TYPES = ['regular', 'lateral', 'transfer', 'readmission'] as const;

export interface ProfileFieldSpec {
  label: string;
  kind: 'text' | 'date' | 'select' | 'boolean';
  options?: readonly string[];
  /** Students and parents may ask for it to be corrected. */
  requestable: boolean;
  max?: number;
  pattern?: RegExp;
  patternHelp?: string;
}

/** The fixed fields of a student's profile, in the order the profile shows them. `fullName` lives on the student. */
export const PROFILE_FIELDS: Record<string, ProfileFieldSpec> = {
  fullName: { label: 'Full name', kind: 'text', requestable: true, max: 120 },
  admissionNo: { label: 'Admission number', kind: 'text', requestable: false, max: 40 },
  registerNo: { label: 'University register number', kind: 'text', requestable: false, max: 40 },
  penNo: { label: 'PEN (UDISE+)', kind: 'text', requestable: false, max: 20, pattern: /^\d{11}$/, patternHelp: 'The PEN is 11 digits' },
  apaarId: { label: 'APAAR ID', kind: 'text', requestable: true, max: 12, pattern: /^\d{12}$/, patternHelp: 'The APAAR ID is 12 digits' },
  abcId: { label: 'ABC ID', kind: 'text', requestable: true, max: 12, pattern: /^\d{12}$/, patternHelp: 'The ABC ID is 12 digits' },
  dateOfBirth: { label: 'Date of birth', kind: 'date', requestable: true },
  gender: { label: 'Gender', kind: 'select', options: GENDERS, requestable: true },
  category: { label: 'Category', kind: 'select', options: CATEGORIES, requestable: true },
  religion: { label: 'Religion', kind: 'text', requestable: true, max: 40 },
  motherTongue: { label: 'Mother tongue', kind: 'text', requestable: true, max: 40 },
  nationality: { label: 'Nationality', kind: 'text', requestable: true, max: 40 },
  isMinority: { label: 'Minority community', kind: 'boolean', requestable: true },
  disability: { label: 'Disability (PwD)', kind: 'text', requestable: true, max: 120 },
  admissionType: { label: 'Admission type', kind: 'select', options: ADMISSION_TYPES, requestable: false },
  addressLine: { label: 'Address', kind: 'text', requestable: true, max: 300 },
  city: { label: 'City or town', kind: 'text', requestable: true, max: 80 },
  district: { label: 'District', kind: 'text', requestable: true, max: 80 },
  state: { label: 'State', kind: 'text', requestable: true, max: 80 },
  pincode: { label: 'PIN code', kind: 'text', requestable: true, max: 6, pattern: /^\d{6}$/, patternHelp: 'The PIN code is 6 digits' },
};

export type FieldValue = string | number | boolean | null;

/**
 * Checks one value for a fixed field or a custom field and returns it in its stored form (trimmed text, a boolean,
 * null for empty), or throws a message.
 */
export function cleanValue(spec: { kind: string; options?: readonly string[]; max?: number; pattern?: RegExp; patternHelp?: string; required?: boolean }, raw: unknown): FieldValue {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    if (spec.required) throw new Error('This value is required');
    return null;
  }
  switch (spec.kind) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'yes' || raw === 'Yes') return true;
      if (raw === 'false' || raw === 'no' || raw === 'No') return false;
      throw new Error('Answer yes or no');
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) throw new Error('Enter a number');
      return n;
    }
    case 'date': {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Error('Use a date like 2008-06-15');
      return s;
    }
    case 'select': {
      const s = String(raw).trim();
      const hit = spec.options?.find((o) => o.toLowerCase() === s.toLowerCase());
      if (!hit) throw new Error(`Choose one of: ${(spec.options ?? []).join(', ')}`);
      return hit;
    }
    default: {
      const s = String(raw).trim();
      if (spec.max && s.length > spec.max) throw new Error(`At most ${spec.max} characters`);
      if (spec.pattern && !spec.pattern.test(s)) throw new Error(spec.patternHelp ?? 'This value is not valid');
      return s;
    }
  }
}

/** Whether someone with these roles passes a role list (an empty list lets everyone through). */
export const allowedBy = (list: readonly string[], roles: readonly string[]) => list.length === 0 || roles.some((r) => list.includes(r));

// ---- ages ------------------------------------------------------------------------------------------

/** Whole years between a date of birth and a day. */
export function ageOn(dob: string, day: string): number {
  const [y, m, d] = dob.split('-').map(Number);
  const [Y, M, Dd] = day.split('-').map(Number);
  return Y - y - (M < m || (M === m && Dd < d) ? 1 : 0);
}

/** The age band used by the age-wise statement. */
export function ageBand(age: number): string {
  if (age < 6) return 'Under 6';
  if (age <= 10) return '6-10';
  if (age <= 14) return '11-14';
  if (age <= 17) return '15-17';
  if (age <= 22) return '18-22';
  if (age <= 25) return '23-25';
  return '26 and over';
}

// ---- roll numbers ------------------------------------------------------------------------------------

export const ROLL_ORDERS = ['alphabetic', 'gender', 'admission', 'admission_no'] as const;
export type RollOrder = (typeof ROLL_ORDERS)[number];

export interface RollStudent {
  id: string;
  fullName: string;
  rollNo: string;
  gender: string | null;
  enrolledOn: string | null;
  admissionNo: string | null;
}

const byName = (a: RollStudent, b: RollStudent) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * New roll numbers for a class: in name order, girls then boys (each in name order, the way many schools number),
 * by date of admission, or by admission number; `prefix` + the number padded to `width` digits.
 */
export function planRollNumbers(rows: RollStudent[], opts: { order: RollOrder; prefix: string; start: number; width: number; girlsFirst?: boolean }): { id: string; fullName: string; from: string; to: string }[] {
  const list = [...rows];
  if (opts.order === 'alphabetic') list.sort(byName);
  else if (opts.order === 'gender') {
    const rank = (g: string | null) => (g === (opts.girlsFirst === false ? 'male' : 'female') ? 0 : g === (opts.girlsFirst === false ? 'female' : 'male') ? 1 : 2);
    list.sort((a, b) => rank(a.gender) - rank(b.gender) || byName(a, b));
  } else if (opts.order === 'admission') list.sort((a, b) => (a.enrolledOn ?? '9999').localeCompare(b.enrolledOn ?? '9999') || byName(a, b));
  else list.sort((a, b) => (a.admissionNo ?? '￿').localeCompare(b.admissionNo ?? '￿', 'en', { numeric: true }) || byName(a, b));
  return list.map((s, i) => ({ id: s.id, fullName: s.fullName, from: s.rollNo, to: `${opts.prefix}${String(opts.start + i).padStart(opts.width, '0')}` }));
}

// ---- sharing students out between sections ---------------------------------------------------------------

export const REBALANCE_MODES = ['alphabetic', 'balanced'] as const;
export type RebalanceMode = (typeof REBALANCE_MODES)[number];

/**
 * Shares the students of several sections out between them. `alphabetic` fills the sections in name order in
 * blocks (A gets the first names); `balanced` deals them out in turn so each section gets a similar mix of girls
 * and boys and of sizes. Students already in the right section stay where they are.
 */
export function planRebalance(rows: (RollStudent & { sectionId: string })[], sectionIds: string[], mode: RebalanceMode): { id: string; fullName: string; from: string; to: string }[] {
  if (sectionIds.length < 2) return [];
  const target = new Map<string, string>();
  if (mode === 'alphabetic') {
    const list = [...rows].sort(byName);
    const size = Math.ceil(list.length / sectionIds.length);
    list.forEach((s, i) => target.set(s.id, sectionIds[Math.min(sectionIds.length - 1, Math.floor(i / size))]));
  } else {
    const groups = new Map<string, RollStudent[]>();
    for (const s of [...rows].sort(byName)) groups.set(s.gender ?? '', [...(groups.get(s.gender ?? '') ?? []), s]);
    let k = 0;
    for (const g of [...groups.keys()].sort()) for (const s of groups.get(g)!) target.set(s.id, sectionIds[k++ % sectionIds.length]);
  }
  return rows.filter((s) => target.get(s.id) !== s.sectionId).map((s) => ({ id: s.id, fullName: s.fullName, from: s.sectionId, to: target.get(s.id)! }));
}
