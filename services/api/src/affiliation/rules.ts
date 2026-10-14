/**
 * The rules an affiliating university or school board lays down for one scheme (regulation year), as data.
 * Everything the ERP does differently for "VTU 2022 scheme" versus "Bangalore University NEP" versus "CBSE"
 * is one of these fields; docs/architecture/university-profiles.md explains each one.
 *
 * Profiles are code-defined (registry/), tenants may override individual values (stored as a partial object
 * merged over the preset and validated with {@link RulesSchema}), and a programme may follow a different
 * profile or scheme from the institution's default.
 */
import { z } from 'zod';

export const ROUNDING = ['half_up', 'truncate'] as const;
export type Rounding = (typeof ROUNDING)[number];

export const COMPONENT_KINDS = ['internal', 'external', 'practical', 'project', 'viva', 'observation', 'diagnostic', 'skill'] as const;

/** Header fields a university's marks card (grade card) prints, in the order the card shows them. */
export const MARKS_CARD_FIELDS = [
  'universityName',
  'institutionName',
  'institutionCode',
  'programme',
  'branch',
  'scheme',
  'term',
  'examMonthYear',
  'studentName',
  'registerNo',
  'parentName',
  'photo',
  'medium',
  'serialNo',
  'issuedOn',
] as const;
export type MarksCardField = (typeof MARKS_CARD_FIELDS)[number];

/** Per-subject columns of the marks card. */
export const SUBJECT_COLUMNS = ['code', 'title', 'credits', 'internal', 'external', 'total', 'grace', 'grade', 'gradePoint', 'creditPoints', 'result'] as const;
export type SubjectColumn = (typeof SUBJECT_COLUMNS)[number];

/** Summary lines of the marks card. */
export const SUMMARY_FIELDS = ['totalMarks', 'percent', 'sgpa', 'cgpa', 'creditsRegistered', 'creditsEarned', 'creditPoints', 'result', 'class', 'percentEquivalent'] as const;
export type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** Columns of a university result sheet we can read (one row per candidate and subject). */
export const RESULT_SHEET_FIELDS = ['registerNo', 'name', 'subjectCode', 'subjectName', 'credits', 'internal', 'external', 'total', 'maxInternal', 'maxExternal', 'grade', 'gradePoint', 'result'] as const;
export type ResultSheetField = (typeof RESULT_SHEET_FIELDS)[number];
export const RESULT_KINDS = ['pass', 'fail', 'absent', 'withheld', 'not_eligible'] as const;

const pct = z.number().min(0).max(100);
const label = z.string().trim().min(1).max(120);

const Band = z.object({ grade: z.string().trim().min(1).max(4), minPercent: pct, gradePoint: z.number().min(0).max(10), pass: z.boolean() });
const Component = z.object({ code: z.string().trim().min(1).max(12), name: label, kind: z.enum(COMPONENT_KINDS), weight: z.number().positive().max(100) });

export const RulesSchema = z.object({
  terminology: z.object({
    /** What the exam period is: a semester, a year (annual scheme) or a term. */
    term: z.enum(['semester', 'year', 'term']),
    termLabel: label,
    internal: label,
    internalShort: z.string().trim().min(1).max(12),
    external: label,
    externalShort: z.string().trim().min(1).max(12),
    registerNo: label,
    marksCard: label,
    sgpa: z.string().trim().min(1).max(12),
    cgpa: z.string().trim().min(1).max(12),
  }),
  registerNumber: z.object({
    /** Regular expression (whole value, case-insensitive) or null when the format is not fixed. */
    pattern: z.string().max(200).nullable(),
    example: z.string().max(40).nullable(),
    description: z.string().max(300),
  }),
  assessment: z.object({
    theory: z.object({ internal: z.number().min(0).max(1000), external: z.number().min(0).max(1000), externalPaperMax: z.number().min(0).max(1000), examHours: z.number().min(0).max(6).nullable() }),
    practical: z.object({ internal: z.number().min(0).max(1000), external: z.number().min(0).max(1000) }).nullable(),
    /** The ready-made component layout for a theory subject (weights add up to 100). */
    theoryComponents: z.array(Component).min(1).max(12),
    practicalComponents: z.array(Component).max(12).nullable(),
  }),
  pass: z.object({
    minInternalPercent: pct.nullable(),
    minExternalPercent: pct.nullable(),
    minTotalPercent: pct,
    /** Minimum over all subjects together (boards: e.g. 33% of 625), null = none. */
    minAggregatePercent: pct.nullable(),
    /** Minimum internal marks to be allowed to sit the external exam (e.g. NMC/RGUHS), null = none. */
    internalEligibilityPercent: pct.nullable(),
  }),
  grace: z.object({
    enabled: z.boolean(),
    /** Marks (on a 100-mark subject) per subject. */
    maxPerSubject: z.number().min(0).max(20),
    maxTotal: z.number().min(0).max(50),
    maxSubjects: z.number().int().min(1).max(20).nullable(),
    /** Grace is given only if it makes the candidate pass every subject. */
    allOrNothing: z.boolean(),
  }),
  grading: z.object({
    /** absolute: fixed bands; positional: the board ranks candidates (we use the bands for school-based marks); marks: no grade points. */
    mode: z.enum(['absolute', 'positional', 'marks']),
    bands: z.array(Band).min(1).max(20),
    pointsMode: z.enum(['band', 'percentOver10']),
    absentGrade: z.string().trim().min(1).max(4),
  }),
  gpa: z.object({
    enabled: z.boolean(),
    decimals: z.number().int().min(0).max(4),
    rounding: z.enum(ROUNDING),
    /** Failed subjects stay in the SGPA denominator with grade point 0. */
    includeFailedCredits: z.boolean(),
  }),
  percentage: z.object({
    /** marks: the percentage is total marks over maximum; cgpa: (CGPA − subtract) × multiplier. */
    basis: z.enum(['marks', 'cgpa']),
    cgpaMultiplier: z.number().min(0).max(20),
    cgpaSubtract: z.number().min(0).max(5),
  }),
  classification: z.object({
    basis: z.enum(['cgpa', 'percent']),
    /** Highest first. */
    classes: z.array(z.object({ label, min: z.number().min(0).max(100), firstAttemptOnly: z.boolean().default(false) })).max(10),
    /** CGPA (or percent) needed for the degree or certificate at all, null = passing every subject is enough. */
    minForAward: z.number().min(0).max(100).nullable(),
  }),
  credits: z.object({
    degreeTotal: z.number().min(0).max(400).nullable(),
    perTermTypical: z.number().min(0).max(60).nullable(),
    /** NEP multiple exits: the award after so many terms with at least so many credits. */
    exits: z.array(z.object({ afterTerms: z.number().int().min(1).max(12), award: label, minCredits: z.number().min(0).max(400) })).max(6),
  }),
  attendance: z.object({
    minPercent: pct,
    /** Lowest percentage the competent authority may condone up to the minimum, null = no condonation. */
    condonableToPercent: pct.nullable(),
    basis: z.enum(['per_subject', 'overall']),
  }),
  examApplication: z.object({ fields: z.array(z.string().trim().min(1).max(60)).max(30), lateFeeAllowed: z.boolean() }),
  revaluation: z.object({
    revaluation: z.boolean(),
    retotalling: z.boolean(),
    photocopy: z.boolean(),
    /** Days after the result to apply, null = as the university notifies. */
    windowDays: z.number().int().min(1).max(90).nullable(),
    /** Revalued marks replace the original only when they change by at least this share of the paper's maximum, null = any change. */
    changeThresholdPercent: pct.nullable(),
  }),
  marksCard: z.object({
    title: label,
    fields: z.array(z.enum(MARKS_CARD_FIELDS)).min(1),
    subjectColumns: z.array(z.enum(SUBJECT_COLUMNS)).min(1),
    summary: z.array(z.enum(SUMMARY_FIELDS)),
    footnotes: z.array(z.string().max(300)).max(10),
  }),
  resultSheet: z.object({
    /** Column headings the university's result sheet uses for each field (any of them, case and spacing ignored). */
    columns: z.partialRecord(z.enum(RESULT_SHEET_FIELDS), z.array(z.string().trim().min(1).max(60)).max(10)),
    /** The sheet's result codes (case ignored). */
    resultCodes: z.record(z.string().trim().min(1).max(20), z.enum(RESULT_KINDS)),
  }),
});

export type ProfileRules = z.infer<typeof RulesSchema>;
export type GradeBandRule = ProfileRules['grading']['bands'][number];

/** One regulation year / scheme of a profile. `version` counts our revisions of the encoding (results remember it). */
export interface ProfileScheme {
  code: string;
  name: string;
  /** First batch (academic year of admission) it applies to, e.g. "2022-23". */
  effectiveFrom: string;
  /** Last batch, or null while current. */
  effectiveTo: string | null;
  /** Programmes it is written for, in the university's words. */
  appliesTo: string[];
  version: number;
  revisedOn: string;
  /**
   * Who sets the evaluation rules. `university`: the profile's grade scale and pass rules replace a subject
   * scheme's own when results are processed. `institution` (autonomous colleges): the subject schemes the
   * institution saves stand, and the profile only supplies defaults, presets and the award rules.
   */
  ruleAuthority: 'university' | 'institution';
  rules: ProfileRules;
  sources: { title: string; url: string }[];
  /** Points an institution must confirm against its own circulars before relying on them. */
  notes: string[];
}

export type ProfileKind = 'university' | 'board' | 'framework';

export interface AffiliationProfile {
  code: string;
  name: string;
  shortName: string;
  kind: ProfileKind;
  /** Where it sits: state university, central board, etc. */
  category: string;
  headquarters: string | null;
  website: string | null;
  /** Districts or reach, in plain words. */
  jurisdiction: string;
  defaultScheme: string;
  schemes: ProfileScheme[];
}

// ---- overrides ------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `base` with `patch` laid over it; objects merge key by key, anything else (arrays included) replaces. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(patch) || !isObj(base)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in out && isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  return out as T;
}

/** The rules with the overrides applied, or the validation problems (the overrides are refused then). */
export function applyOverrides(base: ProfileRules, overrides: Record<string, unknown> | null | undefined): { ok: true; rules: ProfileRules } | { ok: false; problems: string[] } {
  if (!overrides || Object.keys(overrides).length === 0) return { ok: true, rules: base };
  const parsed = RulesSchema.safeParse(deepMerge(base, overrides));
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const err = bandsProblem(parsed.data.grading.bands) ?? weightsProblem(parsed.data.assessment.theoryComponents) ?? (parsed.data.assessment.practicalComponents ? weightsProblem(parsed.data.assessment.practicalComponents) : null);
  return err ? { ok: false, problems: [err] } : { ok: true, rules: parsed.data };
}

function bandsProblem(bands: GradeBandRule[]): string | null {
  if (!bands.some((b) => b.minPercent === 0)) return 'grading.bands: the lowest band must start at 0%';
  if (new Set(bands.map((b) => b.minPercent)).size !== bands.length) return 'grading.bands: two bands start at the same percentage';
  return null;
}

function weightsProblem(components: { weight: number }[]): string | null {
  const total = Math.round(components.reduce((s, c) => s + c.weight, 0) * 1e4) / 1e4;
  return total === 100 ? null : `assessment: component weights must add up to 100 (now ${total})`;
}

/** Every leaf value that differs between two rule sets, as dotted paths ("pass.minExternalPercent"). Arrays compare whole. */
export function diffRules(a: unknown, b: unknown, prefix = ''): { path: string; before: unknown; after: unknown }[] {
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => diffRules(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ? [] : [{ path: prefix, before: a ?? null, after: b ?? null }];
}

/** Only the overrides that still change something (drops values equal to the preset). */
export function minimalOverrides(base: ProfileRules, rules: ProfileRules): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of diffRules(base, rules)) {
    const parts = d.path.split('.');
    let at = out;
    for (const p of parts.slice(0, -1)) at = (at[p] ??= {}) as Record<string, unknown>;
    at[parts[parts.length - 1]] = d.after;
  }
  return out;
}
