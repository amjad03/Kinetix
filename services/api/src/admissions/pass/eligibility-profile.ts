/**
 * Admission eligibility as the affiliating university or regulator writes it: the qualifying examination, the minimum
 * percentage with the relaxation for reserved categories, the subjects that must have been studied, the entrance tests
 * accepted, the age limits and the lateral-entry route. A cycle picks one of these presets (the list offered is narrowed
 * to its programme's affiliation profile) and the applicant's answers are checked against it when the office runs
 * eligibility. Every figure is a starting point the office can change on the cycle.
 */
import { categoryKey, MERIT } from './reservation.js';

export const QUALIFYING = ['sslc', 'puc', 'diploma', 'degree', 'pg'] as const;
export type Qualifying = (typeof QUALIFYING)[number];
export const QUALIFYING_LABELS: Record<Qualifying, string> = { sslc: 'SSLC / Class 10', puc: 'PUC / Class 12', diploma: 'Diploma (polytechnic)', degree: "Bachelor's degree", pg: "Master's degree" };

export interface ProfileEligibility {
  key: string;
  label: string;
  /** Affiliation profile codes it belongs to ('*' for any). */
  profiles: string[];
  /** Where the rule comes from, shown beside it. */
  source: string;
  /** Qualifying examinations accepted (any one). */
  qualifying: Qualifying[];
  /** Minimum percentage in the qualifying examination (or in the subjects, when `subjectsBasis`), for general merit. */
  minPercent: number;
  /** Lower minimum for these categories (matrix keys: sc, st, cat-1, 2a…). */
  relaxed: { categories: string[]; minPercent: number } | null;
  /** The percentage is counted over the compulsory and optional subjects only (VTU: Physics, Mathematics and one optional). */
  subjectsBasis: boolean;
  /** Subjects that must have been studied. */
  required: string[];
  /** And at least `count` of these. */
  oneOf: { subjects: string[]; count: number } | null;
  /** Entrance tests accepted; `required` when a valid score or rank must be shown. */
  entrance: { exams: string[]; required: boolean; minPercentile: { general: number; reserved: number } | null } | null;
  minAge: number | null;
  maxAge: number | null;
  /** The form questions this preset reads, added to the cycle's form when the preset is chosen. */
  fields: string[];
}

/** Keys of the answers the presets read. */
export const FACT_FIELDS: Record<string, { label: string; type: 'number' | 'select' | 'text'; options?: string[]; min?: number; max?: number }> = {
  qualifying_exam: { label: 'Qualifying examination', type: 'select', options: QUALIFYING.map((q) => QUALIFYING_LABELS[q]) },
  qualifying_percent: { label: 'Percentage in the qualifying examination', type: 'number', min: 0, max: 100 },
  subjects_percent: { label: 'Percentage in the eligibility subjects', type: 'number', min: 0, max: 100 },
  subjects_studied: { label: 'Subjects studied (comma separated)', type: 'text' },
  entrance_exam: { label: 'Entrance test', type: 'select', options: ['KCET', 'COMEDK UGET', 'JEE Main', 'NEET (UG)', 'PGCET', 'KMAT', 'CAT', 'MAT', 'CMAT', 'None'] },
  entrance_percentile: { label: 'Entrance test percentile', type: 'number', min: 0, max: 100 },
};

const KA_STATE = ['bangalore-university', 'bengaluru-city-university', 'bengaluru-north-university', 'university-of-mysore', 'mangalore-university', 'tumkur-university', 'davangere-university', 'kuvempu-university', 'karnatak-university', 'rani-channamma-university', 'akkamahadevi-womens-university'];
const KA_RESERVED = ['sc', 'st', 'cat-1'];

export const ELIGIBILITY_PRESETS: ProfileEligibility[] = [
  {
    key: 'vtu-be', label: 'VTU BE / BTech (first year)', profiles: ['vtu'],
    source: 'VTU regulations for BE/BTech admission; AICTE Approval Process Handbook: 10+2 with Physics and Mathematics and one of the optional subjects, 45% (40% for SC, ST and Category-1 of Karnataka)',
    qualifying: ['puc'], minPercent: 45, relaxed: { categories: KA_RESERVED, minPercent: 40 }, subjectsBasis: true,
    required: ['physics', 'mathematics'], oneOf: { subjects: ['chemistry', 'biotechnology', 'biology', 'computer science', 'electronics', 'information technology'], count: 1 },
    entrance: { exams: ['KCET', 'COMEDK UGET', 'JEE Main'], required: true, minPercentile: null }, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent', 'subjects_percent', 'subjects_studied', 'entrance_exam'],
  },
  {
    key: 'vtu-be-lateral', label: 'VTU BE / BTech lateral entry (third semester)', profiles: ['vtu'],
    source: 'VTU lateral-entry rules; AICTE: a diploma with 45% (40% for reserved categories), or a BSc with Mathematics in Class 12; Diploma CET (DCET) rank for government seats',
    qualifying: ['diploma', 'degree'], minPercent: 45, relaxed: { categories: KA_RESERVED, minPercent: 40 }, subjectsBasis: false,
    required: [], oneOf: null, entrance: { exams: ['DCET'], required: false, minPercentile: null }, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent'],
  },
  {
    key: 'vtu-mba', label: 'VTU MBA', profiles: ['vtu'],
    source: "VTU PG regulations; AICTE: a bachelor's degree with 50% (45% for SC, ST and Category-1) and a valid PGCET, KMAT, CAT, MAT or CMAT score",
    qualifying: ['degree'], minPercent: 50, relaxed: { categories: KA_RESERVED, minPercent: 45 }, subjectsBasis: false,
    required: [], oneOf: null, entrance: { exams: ['PGCET', 'KMAT', 'CAT', 'MAT', 'CMAT'], required: true, minPercentile: null }, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent', 'entrance_exam'],
  },
  {
    key: 'vtu-mca', label: 'VTU MCA', profiles: ['vtu'],
    source: "VTU PG regulations; AICTE: a bachelor's degree with Mathematics in Class 12 or in the degree, 50% (45% for SC, ST and Category-1), and a valid PGCET score for government seats",
    qualifying: ['degree'], minPercent: 50, relaxed: { categories: KA_RESERVED, minPercent: 45 }, subjectsBasis: false,
    required: ['mathematics'], oneOf: null, entrance: { exams: ['PGCET', 'KMAT'], required: false, minPercentile: null }, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent', 'subjects_studied', 'entrance_exam'],
  },
  {
    key: 'ka-ug-general', label: 'Karnataka state university: BA, BCom, BBA (any PUC stream)', profiles: KA_STATE,
    source: 'Admission notification of the Karnataka state universities under the State Education Policy: a pass in PUC / Class 12 (any stream) or an equivalent examination recognised by the Karnataka PU board; 35% for every category',
    qualifying: ['puc', 'diploma'], minPercent: 35, relaxed: null, subjectsBasis: false, required: [], oneOf: null, entrance: null, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent'],
  },
  {
    key: 'ka-ug-bca', label: 'Karnataka state university: BCA and BSc Computer Science', profiles: KA_STATE,
    source: 'State university admission notification: PUC / Class 12 with Mathematics, Computer Science, Statistics, Business Mathematics or Accountancy as one subject, 35%',
    qualifying: ['puc', 'diploma'], minPercent: 35, relaxed: null, subjectsBasis: false, required: [], oneOf: { subjects: ['mathematics', 'computer science', 'statistics', 'business mathematics', 'accountancy'], count: 1 }, entrance: null, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent', 'subjects_studied'],
  },
  {
    key: 'ka-pg-mba', label: 'Karnataka state university: MBA', profiles: KA_STATE,
    source: "State university PG regulations; Karnataka PGCET brochure: a bachelor's degree of three years with 50% (45% for SC, ST and Category-1) and a valid PGCET (government seats) or KMAT, CAT, MAT score",
    qualifying: ['degree'], minPercent: 50, relaxed: { categories: KA_RESERVED, minPercent: 45 }, subjectsBasis: false, required: [], oneOf: null,
    entrance: { exams: ['PGCET', 'KMAT', 'CAT', 'MAT', 'CMAT'], required: true, minPercentile: null }, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent', 'entrance_exam'],
  },
  {
    key: 'ka-pg-mcom', label: 'Karnataka state university: MCom', profiles: KA_STATE,
    source: 'State university PG regulations: BCom or BBA with 45% (40% for SC, ST and Category-1)',
    qualifying: ['degree'], minPercent: 45, relaxed: { categories: KA_RESERVED, minPercent: 40 }, subjectsBasis: false, required: [], oneOf: null, entrance: null, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent'],
  },
  {
    key: 'rguhs-mbbs', label: 'RGUHS MBBS / BDS (NEET)', profiles: ['rguhs'],
    source: 'NMC Graduate Medical Education Regulations: Physics, Chemistry, Biology and English with 50% in PCB (40% for SC, ST, OBC), NEET (UG) at the 50th percentile (40th for SC, ST, OBC), at least 17 years of age on 31 December of the year of admission',
    qualifying: ['puc'], minPercent: 50, relaxed: { categories: ['sc', 'st', 'cat-1', '2a', '2b', '3a', '3b'], minPercent: 40 }, subjectsBasis: true,
    required: ['physics', 'chemistry', 'biology', 'english'], oneOf: null, entrance: { exams: ['NEET (UG)'], required: true, minPercentile: { general: 50, reserved: 40 } }, minAge: 17, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent', 'subjects_percent', 'subjects_studied', 'entrance_exam', 'entrance_percentile'],
  },
  {
    key: 'ugc-ug', label: 'Undergraduate (UGC): a pass in Class 12', profiles: ['*'],
    source: 'UGC: Class 12 or an equivalent examination from a recognised board',
    qualifying: ['puc', 'diploma'], minPercent: 0, relaxed: null, subjectsBasis: false, required: [], oneOf: null, entrance: null, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent'],
  },
  {
    key: 'ugc-pg', label: "Postgraduate (UGC): a bachelor's degree with 50%", profiles: ['*'],
    source: "UGC: a bachelor's degree from a recognised university; 50% (45% for reserved categories) where the university so prescribes",
    qualifying: ['degree'], minPercent: 50, relaxed: { categories: KA_RESERVED, minPercent: 45 }, subjectsBasis: false, required: [], oneOf: null, entrance: null, minAge: null, maxAge: null,
    fields: ['qualifying_exam', 'qualifying_percent'],
  },
];

export const presetByKey = (k: string) => ELIGIBILITY_PRESETS.find((p) => p.key === k);

/** Presets for a profile code (its own first, then the general ones); every preset when there is no profile. */
export function presetsFor(profileCode: string | null): ProfileEligibility[] {
  if (!profileCode) return ELIGIBILITY_PRESETS;
  return [...ELIGIBILITY_PRESETS.filter((p) => p.profiles.includes(profileCode)), ...ELIGIBILITY_PRESETS.filter((p) => p.profiles.includes('*'))];
}

/** "Class 12 / PUC" and the like, as typed or chosen, to the qualifying key. */
export function qualifyingKey(raw: unknown): Qualifying | null {
  const s = String(raw ?? '').toLowerCase();
  if (!s.trim()) return null;
  for (const q of QUALIFYING) if (s === q || s === QUALIFYING_LABELS[q].toLowerCase()) return q;
  if (/diploma|polytechnic/.test(s)) return 'diploma';
  if (/master|^m\.?\s?(a|sc|com)|post ?grad/.test(s)) return 'pg';
  if (/bachelor|degree|b\.?\s?(a|sc|com|ba)|graduat/.test(s)) return 'degree';
  if (/puc|12|plus two|higher secondary|hsc|isc|senior secondary/.test(s)) return 'puc';
  if (/sslc|10|matric|secondary/.test(s)) return 'sslc';
  return null;
}

const subjectsOf = (raw: unknown) =>
  String(raw ?? '')
    .toLowerCase()
    .split(/[,;/]+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

const has = (studied: string[], s: string) => studied.some((x) => x === s || x.startsWith(`${s} `) || (s === 'mathematics' && /^(maths?|business mathematics)$/.test(x)) || (s === 'computer science' && /^(cs|computer)$/.test(x)));

const pct = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Whole years of age on a day. */
export function ageOn(dob: string, on: string): number {
  const [y, m, d] = dob.split('-').map(Number);
  const [oy, om, od] = on.split('-').map(Number);
  return oy - y - (om < m || (om === m && od < d) ? 1 : 0);
}

export interface ApplicantFacts {
  answers: Record<string, unknown>;
  category: string | null;
  dateOfBirth: string | null;
  admissionType: string;
}

/** Why an applicant does not meet the preset, in plain words; empty when they do. Missing answers are failures too. */
export function profileFailures(p: ProfileEligibility, f: ApplicantFacts, ageDay: string): string[] {
  const out: string[] = [];
  const q = qualifyingKey(f.answers.qualifying_exam);
  if (!q) out.push(`Qualifying examination not given (${p.qualifying.map((x) => QUALIFYING_LABELS[x]).join(' or ')})`);
  else if (!p.qualifying.includes(q)) out.push(`${QUALIFYING_LABELS[q]} is not a qualifying examination for this programme (needs ${p.qualifying.map((x) => QUALIFYING_LABELS[x]).join(' or ')})`);
  const cat = categoryKey(f.category);
  const need = p.relaxed && cat !== MERIT && p.relaxed.categories.includes(cat) ? p.relaxed.minPercent : p.minPercent;
  if (need > 0) {
    const key = p.subjectsBasis ? 'subjects_percent' : 'qualifying_percent';
    const got = pct(f.answers[key]);
    if (got === null) out.push(`${p.subjectsBasis ? 'Percentage in the eligibility subjects' : 'Qualifying percentage'} not given`);
    else if (got < need) out.push(`${got}% is below the ${need}% needed${need !== p.minPercent ? ` for ${cat.toUpperCase()}` : ''}`);
  }
  if (p.required.length || p.oneOf) {
    const studied = subjectsOf(f.answers.subjects_studied);
    const missing = p.required.filter((s) => !has(studied, s));
    if (!studied.length) out.push('Subjects studied not given');
    else {
      if (missing.length) out.push(`Did not study ${missing.join(', ')}`);
      if (p.oneOf && p.oneOf.subjects.filter((s) => has(studied, s)).length < p.oneOf.count) out.push(`Needs ${p.oneOf.count === 1 ? 'one' : p.oneOf.count} of ${p.oneOf.subjects.join(', ')}`);
    }
  }
  if (p.entrance?.required) {
    const exam = String(f.answers.entrance_exam ?? '').trim();
    if (!exam || exam.toLowerCase() === 'none') out.push(`A valid ${p.entrance.exams.join(', ')} score or rank is needed`);
    else if (!p.entrance.exams.some((e) => e.toLowerCase() === exam.toLowerCase())) out.push(`${exam} is not accepted (accepted: ${p.entrance.exams.join(', ')})`);
    else if (p.entrance.minPercentile) {
      const got = pct(f.answers.entrance_percentile);
      const min = cat !== MERIT ? p.entrance.minPercentile.reserved : p.entrance.minPercentile.general;
      if (got === null) out.push('Entrance percentile not given');
      else if (got < min) out.push(`Entrance percentile ${got} is below the ${min}th percentile needed`);
    }
  }
  if (p.minAge !== null || p.maxAge !== null) {
    if (!f.dateOfBirth) out.push('Date of birth not given');
    else {
      const age = ageOn(f.dateOfBirth, ageDay);
      if (p.minAge !== null && age < p.minAge) out.push(`Must be at least ${p.minAge} on ${ageDay}`);
      if (p.maxAge !== null && age > p.maxAge) out.push(`Must be at most ${p.maxAge} on ${ageDay}`);
    }
  }
  return out;
}
