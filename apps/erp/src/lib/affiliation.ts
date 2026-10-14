// Settings > Affiliation: the university or board the institution is affiliated to (GET/PUT /v1/affiliation),
// the scheme per programme, the rules in plain language and the institution's overrides.

export type ProfileKind = 'university' | 'board' | 'framework';

export interface CatalogueScheme {
  code: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  appliesTo: string[];
  version: number;
  ruleAuthority: 'university' | 'institution';
}

export interface CatalogueProfile {
  code: string;
  name: string;
  shortName: string;
  kind: ProfileKind;
  category: string;
  headquarters: string | null;
  website: string | null;
  jurisdiction: string;
  defaultScheme: string;
  schemes: CatalogueScheme[];
}

export interface AffiliationOverview {
  selected: {
    profileCode: string;
    schemeCode: string;
    name: string;
    shortName: string;
    kind: ProfileKind;
    schemeName: string;
    version: number;
    ruleAuthority: 'university' | 'institution';
    overrides: Record<string, unknown>;
    overridesValid: boolean;
    updatedAt: string;
  } | null;
  programmes: { programId: string; name: string; level: string; follows: 'own' | 'institution'; profileCode: string | null; profileName: string | null; schemeCode: string | null; schemeName: string | null; overridden: boolean; overrides: Record<string, unknown> }[];
  catalogue: CatalogueProfile[];
}

export const RULE_SECTIONS = ['assessment', 'pass', 'grading', 'gpa', 'classification', 'credits', 'attendance', 'exams', 'documents'] as const;
export type RuleSection = (typeof RULE_SECTIONS)[number];

export interface RulesView {
  profile: { code: string; name: string; shortName: string; kind: ProfileKind; website: string | null };
  scheme: { code: string; name: string; version: number; revisedOn: string; effectiveFrom: string; effectiveTo: string | null; appliesTo: string[]; ruleAuthority: 'university' | 'institution'; sources: { title: string; url: string }[]; notes: string[] };
  source: 'institution' | 'programme';
  rules: Record<string, unknown>;
  preset: Record<string, unknown>;
  differences: { path: string; before: unknown; after: unknown }[];
  description: { section: RuleSection; lines: string[] }[];
}

export interface HistoryRow {
  id: number;
  action: string;
  at: string;
  actor: string | null;
  subjectType: string | null;
  data: { reason?: string; profile?: string; scheme?: string; changes?: Record<string, { before: unknown; after: unknown }> } | null;
}

/** The values an institution may change, with how the form edits them. Paths are into the rules object. */
export const OVERRIDE_FIELDS = [
  { path: 'attendance.minPercent', kind: 'percent', nullable: false },
  { path: 'attendance.condonableToPercent', kind: 'percent', nullable: true },
  { path: 'pass.minExternalPercent', kind: 'percent', nullable: true },
  { path: 'pass.minInternalPercent', kind: 'percent', nullable: true },
  { path: 'pass.minTotalPercent', kind: 'percent', nullable: false },
  { path: 'pass.minAggregatePercent', kind: 'percent', nullable: true },
  { path: 'grace.enabled', kind: 'boolean', nullable: false },
  { path: 'grace.maxPerSubject', kind: 'number', nullable: false },
  { path: 'grace.maxTotal', kind: 'number', nullable: false },
  { path: 'gpa.decimals', kind: 'number', nullable: false },
  { path: 'gpa.rounding', kind: 'rounding', nullable: false },
  { path: 'revaluation.windowDays', kind: 'number', nullable: true },
  { path: 'classification.minForAward', kind: 'number', nullable: true },
] as const;
export type OverrideField = (typeof OVERRIDE_FIELDS)[number];
export type OverridePath = OverrideField['path'];

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** The form's text for a value ('' for null; 'true'/'false' for switches). */
export const formValue = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Parses the form back into an overrides object holding only the values that differ from the preset.
 * Returns the bad paths instead when a value does not fit its field.
 */
export function buildOverrides(preset: Record<string, unknown>, form: Partial<Record<OverridePath, string>>): { ok: true; overrides: Record<string, unknown> } | { ok: false; bad: OverridePath[] } {
  const out: Record<string, unknown> = {};
  const bad: OverridePath[] = [];
  for (const f of OVERRIDE_FIELDS) {
    const raw = form[f.path];
    if (raw === undefined) continue;
    let v: unknown;
    const text = raw.trim();
    if (f.kind === 'boolean') v = text === 'true';
    else if (f.kind === 'rounding') v = text === 'truncate' ? 'truncate' : 'half_up';
    else if (text === '') {
      if (!f.nullable) {
        bad.push(f.path);
        continue;
      }
      v = null;
    } else {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0 || (f.kind === 'percent' && n > 100)) {
        bad.push(f.path);
        continue;
      }
      v = n;
    }
    if (JSON.stringify(v) === JSON.stringify(getPath(preset, f.path) ?? null)) continue;
    const [head, leaf] = f.path.split('.');
    out[head] = { ...((out[head] as Record<string, unknown>) ?? {}), [leaf]: v };
  }
  return bad.length ? { ok: false, bad } : { ok: true, overrides: out };
}

/** Profiles grouped for the picker: universities first, then boards, then frameworks. */
export function groupCatalogue(list: CatalogueProfile[]): { kind: ProfileKind; profiles: CatalogueProfile[] }[] {
  return (['university', 'board', 'framework'] as const).map((kind) => ({ kind, profiles: list.filter((p) => p.kind === kind).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.profiles.length > 0);
}

/** A rule value for display: lists joined, null as a dash. */
export function showValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? Object.values(x).join(' ') : String(x))).join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
