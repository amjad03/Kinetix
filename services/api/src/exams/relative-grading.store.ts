import { eq } from 'drizzle-orm';
import { resolveAffiliation } from '../affiliation/resolve.js';
import type { Tx } from '../db/db.service.js';
import { examOfficeSettings } from '../db/schema.js';
import { examRelativeGrades, type RelativeCut } from '../db/schema-curriculum.js';
import { DEFAULT_RELATIVE, type RelativeBand } from './relative-grading.js';

export interface RelativeSettings {
  /** The institution grades on the curve (exam office settings). */
  enabled: boolean;
  /** The regulation in force allows it: the profile's `grading.relative.allowed`, or own rules (no profile). */
  allowed: boolean;
  /** The profile the rule comes from, when there is one. */
  profile: string | null;
  minClassSize: number;
  /** The regulation's own smallest class (used when the institution sets none). */
  regulationMinClassSize: number;
  maxShift: number;
  bands: RelativeBand[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The stored switch (exam office settings, key `relativeGrading`). */
export async function storedRelative(tx: Tx): Promise<{ enabled: boolean; minClassSize: number | null }> {
  const [row] = await tx.select({ settings: examOfficeSettings.settings }).from(examOfficeSettings);
  const r = isObj(row?.settings) && isObj((row.settings as Record<string, unknown>).relativeGrading) ? ((row.settings as Record<string, unknown>).relativeGrading as Record<string, unknown>) : {};
  return { enabled: r.enabled === true, minClassSize: typeof r.minClassSize === 'number' ? r.minClassSize : null };
}

/** Relative grading for a programme (or the institution): whether it is allowed and on, and the scale. */
export async function relativeSettings(tx: Tx, programId: string | null): Promise<RelativeSettings> {
  const stored = await storedRelative(tx);
  const aff = await resolveAffiliation(tx, programId);
  const rule = aff ? aff.rules.grading.relative : null;
  const allowed = aff ? !!rule?.allowed : true;
  const scale = rule ?? DEFAULT_RELATIVE;
  return {
    enabled: stored.enabled && allowed,
    allowed,
    profile: aff ? `${aff.ref.profile}/${aff.ref.scheme}` : null,
    minClassSize: stored.minClassSize ?? scale.minClassSize,
    regulationMinClassSize: scale.minClassSize,
    maxShift: scale.maxShift,
    bands: scale.bands,
  };
}

/** The cut-offs applied to subjects of a session, by subject; empty when relative grading is off. */
export async function appliedCuts(tx: Tx, sessionId: string, programId: string | null): Promise<Map<string, RelativeCut[]>> {
  if (!(await relativeSettings(tx, programId)).enabled) return new Map();
  const rows = await tx.select({ subjectId: examRelativeGrades.subjectId, cuts: examRelativeGrades.cuts }).from(examRelativeGrades).where(eq(examRelativeGrades.sessionId, sessionId));
  return new Map(rows.map((r) => [r.subjectId, r.cuts]));
}
